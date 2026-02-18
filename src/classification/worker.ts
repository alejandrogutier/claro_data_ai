import AWS from "aws-sdk";
import { readFile } from "fs/promises";
import path from "path";
import type { SQSEvent } from "aws-lambda";
import { env } from "../config/env";
import { createClassificationStore } from "../data/classificationStore";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BEDROCK_ATTEMPTS = 3;
const MAX_CONTENT_CHARS = 9000;

const bedrock = new AWS.BedrockRuntime({ region: env.awsRegion });
let promptTemplateCache: string | null = null;

type ClassificationTriggerType = "manual" | "scheduled";

type ClassificationMessage = {
  content_item_id?: string;
  prompt_version?: string;
  model_id?: string;
  source_type?: string;
  trigger_type?: ClassificationTriggerType;
  request_id?: string;
  requested_at?: string;
};

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const parseMessage = (body: string): ClassificationMessage => {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as ClassificationMessage;
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

const normalizeString = (value: unknown, maxLen: number): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
};

const normalizeSentimiento = (value: unknown): "positivo" | "neutro" | "negativo" | null => {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const simplified = trimmed
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]+/g, " ")
    .trim();

  if (!simplified) return null;

  const tokens = simplified.split(/\s+/).filter(Boolean);
  const hasPos = tokens.some((t) => t.startsWith("positiv"));
  const hasNeg = tokens.some((t) => t.startsWith("negativ"));
  const hasNeu = tokens.some((t) => t.startsWith("neutr") || t.startsWith("neutral"));
  const hasMixed = tokens.some((t) => t.startsWith("mixt") || t.startsWith("mixed"));

  // When the model hedges (e.g., "positivo/negativo" or "mixed"), default to neutral.
  if (hasMixed || (hasPos && hasNeg) || (hasNeu && (hasPos || hasNeg))) return "neutro";
  if (hasPos) return "positivo";
  if (hasNeg) return "negativo";
  if (hasNeu) return "neutro";

  return null;
};

const validateOutput = (payload: Record<string, unknown>): {
  categoria: string;
  sentimiento: "positivo" | "neutro" | "negativo";
  etiquetas: string[];
  confianza: number;
  resumen: string | null;
} => {
  const categoria = normalizeString(payload.categoria, 120);
  if (!categoria) {
    throw new Error("model_missing_categoria");
  }

  const sentimiento = normalizeSentimiento(payload.sentimiento);
  if (!sentimiento) {
    const raw = typeof payload.sentimiento === "string" ? payload.sentimiento : JSON.stringify(payload.sentimiento);
    throw new Error(`model_invalid_sentimiento:${raw ?? "null"}`);
  }

  const etiquetasRaw = payload.etiquetas;
  const etiquetas: string[] = Array.isArray(etiquetasRaw)
    ? etiquetasRaw
        .filter((item) => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    : [];
  const deduped = [...new Set(etiquetas)].slice(0, 50);

  const confianzaRaw = payload.confianza;
  if (typeof confianzaRaw !== "number" || Number.isNaN(confianzaRaw) || confianzaRaw < 0 || confianzaRaw > 1) {
    throw new Error("model_invalid_confianza");
  }

  const resumen = normalizeString(payload.resumen, 1000);

  return { categoria, sentimiento, etiquetas: deduped, confianza: confianzaRaw, resumen };
};

const loadPromptTemplate = async (): Promise<string> => {
  if (promptTemplateCache) return promptTemplateCache;

  const promptPath = path.resolve(__dirname, "../prompts/classification/v1.md");
  const content = await readFile(promptPath, "utf8");
  promptTemplateCache = content;
  return content;
};

const truncate = (value: string | null | undefined, maxChars: number): string => {
  const raw = (value ?? "").trim();
  if (!raw) return "null";
  const sliced = raw.length > maxChars ? raw.slice(0, maxChars) : raw;
  return sliced;
};

const buildPrompt = async (input: {
  sourceType: string;
  provider: string;
  language: string | null;
  title: string;
  summary: string | null;
  content: string | null;
}): Promise<string> => {
  const template = await loadPromptTemplate();
  return template
    .replaceAll("{{source_type}}", truncate(input.sourceType, 40))
    .replaceAll("{{provider}}", truncate(input.provider, 60))
    .replaceAll("{{language}}", truncate(input.language, 20))
    .replaceAll("{{title}}", truncate(input.title, 500))
    .replaceAll("{{summary}}", truncate(input.summary, 1200))
    .replaceAll("{{content}}", truncate(input.content, MAX_CONTENT_CHARS));
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
            max_tokens: 800,
            temperature: 0.1,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `${prompt}\n\nResponde SOLO con JSON valido sin markdown ni texto adicional.`
                  }
                ]
              }
            ]
          })
        })
        .promise();

      const rawBody = decodeResponseBody(response.body);
      const textOutput = extractBedrockText(rawBody);
      return parseModelJson(textOutput);
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

const processContentItem = async (message: Required<Pick<ClassificationMessage, "content_item_id" | "prompt_version" | "model_id">> &
  Omit<ClassificationMessage, "content_item_id" | "prompt_version" | "model_id">): Promise<void> => {
  const store = createClassificationStore();
  if (!store) {
    throw new Error("Database runtime is not configured");
  }

  const contentItemId = message.content_item_id;
  const promptVersion = message.prompt_version;
  const modelId = message.model_id;
  const triggerType: ClassificationTriggerType = message.trigger_type === "manual" ? "manual" : "scheduled";
  const requestId = typeof message.request_id === "string" ? message.request_id.trim() : null;
  const requestedAt = typeof message.requested_at === "string" ? message.requested_at.trim() : null;

  const hasOverride = await store.hasManualOverride(contentItemId);
  if (hasOverride) {
    console.log(
      JSON.stringify({
        level: "info",
        message: "classification_skipped_manual_override",
        content_item_id: contentItemId,
        request_id: requestId
      })
    );
    return;
  }

  const content = await store.getContentForPrompt(contentItemId);
  if (!content) {
    console.warn("classification_content_not_found", { content_item_id: contentItemId });
    return;
  }

  const prompt = await buildPrompt({
    sourceType: content.sourceType,
    provider: content.provider,
    language: content.language,
    title: content.title,
    summary: content.summary,
    content: content.content
  });

  const started = Date.now();
  const rawOutput = await invokeModelStrict(prompt, modelId || env.bedrockModelId);
  const latencyMs = Date.now() - started;

  const validated = validateOutput(rawOutput);

  await store.upsertAutoClassification({
    contentItemId,
    categoria: validated.categoria,
    sentimiento: validated.sentimiento,
    etiquetas: validated.etiquetas,
    confianza: validated.confianza,
    resumen: validated.resumen,
    promptVersion,
    modelId,
    requestId,
    requestedAt,
    triggerType
  });

  console.log(
    JSON.stringify({
      level: "info",
      message: "classification_completed",
      content_item_id: contentItemId,
      prompt_version: promptVersion,
      model_id: modelId,
      request_id: requestId,
      trigger_type: triggerType,
      model_latency_ms: latencyMs
    })
  );
};

export const main = async (event: SQSEvent) => {
  for (const record of event.Records) {
    const message = parseMessage(record.body);
    const contentItemId = message.content_item_id;

    if (!contentItemId || !UUID_REGEX.test(contentItemId)) {
      console.error("classification_worker_invalid_message", {
        message_id: record.messageId,
        body: record.body
      });
      continue;
    }

    const promptVersion = (message.prompt_version ?? env.classificationPromptVersion ?? "classification-v1").trim();
    const modelId = (message.model_id ?? env.bedrockModelId).trim();

    if (!promptVersion || !modelId) {
      console.error("classification_worker_missing_prompt_or_model", {
        message_id: record.messageId,
        body: record.body
      });
      continue;
    }

    await processContentItem({
      ...message,
      content_item_id: contentItemId,
      prompt_version: promptVersion,
      model_id: modelId
    });
  }
};
