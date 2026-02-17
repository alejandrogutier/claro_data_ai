import AWS from "aws-sdk";
import { readFile } from "fs/promises";
import path from "path";
import type { SQSEvent } from "aws-lambda";
import { env } from "../config/env";
import { createAnalysisStore, type AnalysisPromptItem, type AnalysisRunRecord } from "../data/analysisStore";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_ITEMS_IN_PROMPT = 180;
const MAX_BEDROCK_ATTEMPTS = 3;

const bedrock = new AWS.BedrockRuntime({ region: env.awsRegion });
let promptTemplateCache: string | null = null;

type AnalysisRunMessage = {
  analysis_run_id?: string;
};

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const parseMessage = (body: string): AnalysisRunMessage => {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as AnalysisRunMessage;
  } catch {
    return {};
  }
};

const shouldRetryBedrock = (error: unknown): boolean => {
  const err = error as { code?: string; name?: string; message?: string };
  const code = err.code ?? err.name ?? "";
  const message = (err.message ?? "").toLowerCase();
  if (code === "ThrottlingException" || code === "ModelTimeoutException" || code === "ServiceUnavailableException") return true;
  if (message.includes("throttl") || message.includes("timeout")) return true;
  return false;
};

const decodeResponseBody = (body: unknown): string => {
  if (typeof body === "string") return body;
  if (Buffer.isBuffer(body)) return body.toString("utf8");
  if (body instanceof Uint8Array) return Buffer.from(body).toString("utf8");
  return "";
};

const extractJsonText = (text: string): string => {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("model_empty_response");
  }

  if (trimmed.startsWith("```")) {
    const lines = trimmed.split("\n");
    const withoutFence = lines
      .filter((_, index) => index !== 0 && index !== lines.length - 1)
      .join("\n")
      .trim();
    if (withoutFence) return withoutFence;
  }

  return trimmed;
};

const parseModelJson = (rawText: string): Record<string, unknown> => {
  const directText = extractJsonText(rawText);
  try {
    const parsed = JSON.parse(directText) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("model_output_not_object");
    }
    return parsed as Record<string, unknown>;
  } catch {
    const firstBrace = directText.indexOf("{");
    const lastBrace = directText.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const chunk = directText.slice(firstBrace, lastBrace + 1);
      const parsed = JSON.parse(chunk) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    }
    throw new Error("model_invalid_json");
  }
};

const validateNarrativeOutput = (payload: Record<string, unknown>): Record<string, unknown> => {
  const requiredStringKeys = ["sintesis_general", "narrativa_principal"];
  for (const key of requiredStringKeys) {
    if (typeof payload[key] !== "string" || !(payload[key] as string).trim()) {
      throw new Error(`model_missing_${key}`);
    }
  }

  const requiredArrayKeys = ["oportunidades_negocio", "riesgos_reputacionales", "temas_dominantes"];
  for (const key of requiredArrayKeys) {
    const value = payload[key];
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
      throw new Error(`model_missing_${key}`);
    }
  }

  const confidence = payload.nivel_confianza;
  if (typeof confidence !== "number" || Number.isNaN(confidence) || confidence < 0 || confidence > 1) {
    throw new Error("model_invalid_nivel_confianza");
  }

  return payload;
};

const extractBedrockText = (responseBody: string): string => {
  const parsed = JSON.parse(responseBody) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("bedrock_invalid_response");
  }

  const record = parsed as {
    content?: Array<{ type?: string; text?: string }>;
    completion?: string;
  };

  if (Array.isArray(record.content)) {
    const textBlock = record.content.find((item) => item.type === "text" && typeof item.text === "string");
    if (textBlock?.text) return textBlock.text;
  }

  if (typeof record.completion === "string" && record.completion.trim()) {
    return record.completion;
  }

  throw new Error("bedrock_missing_text_output");
};

const invokeModelStrict = async (prompt: string, modelId: string): Promise<Record<string, unknown>> => {
  for (let attempt = 1; attempt <= MAX_BEDROCK_ATTEMPTS; attempt += 1) {
    try {
      const response = await bedrock
        .invokeModel({
          modelId,
          contentType: "application/json",
          accept: "application/json",
          body: JSON.stringify({
            anthropic_version: "bedrock-2023-05-31",
            max_tokens: 1200,
            temperature: 0.15,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: prompt
                  }
                ]
              }
            ]
          })
        })
        .promise();

      const rawBody = decodeResponseBody(response.body);
      const textOutput = extractBedrockText(rawBody);
      const parsedOutput = parseModelJson(textOutput);
      return validateNarrativeOutput(parsedOutput);
    } catch (error) {
      if (attempt < MAX_BEDROCK_ATTEMPTS && shouldRetryBedrock(error)) {
        const jitter = Math.floor(Math.random() * 250);
        await sleep(attempt * 500 + jitter);
        continue;
      }
      throw error;
    }
  }

  throw new Error("bedrock_attempts_exhausted");
};

const loadPromptTemplate = async (): Promise<string> => {
  if (promptTemplateCache) return promptTemplateCache;

  const promptPath = path.resolve(__dirname, "../prompts/analysis/v1.md");
  const content = await readFile(promptPath, "utf8");
  promptTemplateCache = content;
  return content;
};

const buildPromptPayload = (run: AnalysisRunRecord, items: AnalysisPromptItem[]): string => {
  const payload = {
    run: {
      id: run.id,
      scope: run.scope,
      source_type: run.sourceType,
      model_id: run.modelId,
      prompt_version: run.promptVersion,
      window_start: run.windowStart.toISOString(),
      window_end: run.windowEnd.toISOString(),
      input_count: run.inputCount,
      filters: run.filters
    },
    items
  };

  return JSON.stringify(payload, null, 2);
};

const buildPrompt = async (run: AnalysisRunRecord, items: AnalysisPromptItem[]): Promise<string> => {
  const template = await loadPromptTemplate();
  const payload = buildPromptPayload(run, items);
  const withPayload = template.includes("{{items_json}}") ? template.replace("{{items_json}}", payload) : `${template}\n\n${payload}`;
  return `${withPayload}\n\nResponde SOLO con JSON valido sin markdown ni texto adicional.`;
};

const processAnalysisRun = async (analysisRunId: string): Promise<void> => {
  const store = createAnalysisStore();
  if (!store) {
    throw new Error("Database runtime is not configured");
  }

  const claimed = await store.claimAnalysisRun(analysisRunId);
  if (!claimed) return;

  try {
    const promptItems = await store.listPromptItemsForRun(analysisRunId, MAX_ITEMS_IN_PROMPT);
    const prompt = await buildPrompt(claimed, promptItems);
    const output = await invokeModelStrict(prompt, claimed.modelId || env.bedrockModelId);
    await store.completeAnalysisRun(analysisRunId, output);
  } catch (error) {
    await store.failAnalysisRun(analysisRunId, (error as Error).message || "analysis_worker_failed");
    console.error("analysis_worker_failed", {
      analysis_run_id: analysisRunId,
      message: (error as Error).message
    });
  }
};

export const main = async (event: SQSEvent) => {
  for (const record of event.Records) {
    const message = parseMessage(record.body);
    const analysisRunId = message.analysis_run_id;

    if (!analysisRunId || !UUID_REGEX.test(analysisRunId)) {
      console.error("analysis_worker_invalid_message", {
        message_id: record.messageId,
        body: record.body
      });
      continue;
    }

    await processAnalysisRun(analysisRunId);
  }
};
