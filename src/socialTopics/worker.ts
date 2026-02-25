import AWS from "aws-sdk";
import type { SQSEvent } from "aws-lambda";
import { env } from "../config/env";
import { createSocialTopicStore } from "../data/socialTopicStore";
import {
  CLARO_MUSICA_APP_TOPIC,
  CLARO_MUSIC_VENUE_TOPIC,
  SOCIAL_TOPIC_KEY_SET,
  SOCIAL_TOPIC_KEYS,
  SOCIAL_TOPIC_TAXONOMY_VERSION
} from "./taxonomy";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BEDROCK_ATTEMPTS = 3;
const MAX_POST_TEXT_CHARS = 9000;

const bedrock = new AWS.BedrockRuntime({ region: env.awsRegion });

type SocialTopicMessage = {
  content_item_id?: string;
  social_post_metric_id?: string;
  taxonomy_version?: string;
  prompt_version?: string;
  model_id?: string;
  trigger_type?: "manual" | "scheduled";
  request_id?: string;
  run_id?: string;
  requested_at?: string;
};

type ModelTopic = {
  key: string;
  confidence: number;
  evidence: string;
};

type ModelOutput = {
  topics: ModelTopic[];
  overallConfidence: number | null;
  ambiguousDualContext: boolean;
};

const MUSIC_APP_SIGNALS = ["app", "premium", "playlist", "escuchar", "cancion", "catalogo"];
const MUSIC_VENUE_SIGNALS = ["concierto", "boletas", "festival", "escenario", "artistas", "evento"];

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const parseMessage = (body: string): SocialTopicMessage => {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as SocialTopicMessage;
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

const parseModelJson = (rawText: string): Record<string, unknown> => {
  const trimmed = rawText.trim();
  if (!trimmed) throw new Error("model_empty_response");

  const cleaned = trimmed.startsWith("```")
    ? trimmed
        .split("\n")
        .filter((_, index, arr) => index !== 0 && index !== arr.length - 1)
        .join("\n")
        .trim()
    : trimmed;

  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
    }
    throw new Error("model_invalid_json");
  }
};

const normalizeForMatch = (value: string): string =>
  value
    .toLocaleLowerCase("es-CO")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, " ")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const hasAnySignal = (text: string, signals: string[]): boolean => signals.some((signal) => text.includes(signal));

const coerceConfidence = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return Math.min(1, Math.max(0, value));
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return Math.min(1, Math.max(0, parsed));
  }
  return null;
};

const normalizeEvidence = (value: unknown): string => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length > 280 ? trimmed.slice(0, 280) : trimmed;
};

const parseOutput = (payload: Record<string, unknown>): ModelOutput => {
  const topicsRaw = Array.isArray(payload.topics) ? payload.topics : [];
  const parsedTopics: ModelTopic[] = [];

  for (const topicRaw of topicsRaw) {
    if (!topicRaw || typeof topicRaw !== "object" || Array.isArray(topicRaw)) continue;
    const item = topicRaw as Record<string, unknown>;
    const key = typeof item.key === "string" ? item.key.trim().toLowerCase() : "";
    const confidence = coerceConfidence(item.confidence);
    if (!key || confidence === null || !SOCIAL_TOPIC_KEY_SET.has(key)) continue;

    parsedTopics.push({
      key,
      confidence,
      evidence: normalizeEvidence(item.evidence)
    });
  }

  const overallConfidence = coerceConfidence(payload.overall_confidence);
  const ambiguousDualContext = payload.ambiguous_dual_context === true;

  return {
    topics: parsedTopics,
    overallConfidence,
    ambiguousDualContext
  };
};

const truncate = (value: string | null | undefined, maxChars: number): string => {
  const raw = (value ?? "").trim();
  if (!raw) return "null";
  return raw.length > maxChars ? raw.slice(0, maxChars) : raw;
};

const buildPrompt = (input: {
  channel: string;
  accountName: string;
  title: string;
  summary: string | null;
  content: string | null;
  text: string | null;
}): string => {
  const taxonomyBlock = SOCIAL_TOPIC_KEYS.map((key) => `- ${key}`).join("\n");

  return [
    "Clasifica el post social en una taxonomia fija de negocio de Claro Colombia.",
    "Responde SOLO JSON valido con este shape exacto:",
    '{"topics":[{"key":"...","confidence":0.0,"evidence":"..."}],"overall_confidence":0.0,"ambiguous_dual_context":false}',
    "No uses markdown. No agregues campos extra. No incluyas texto fuera del JSON.",
    "Reglas:",
    "1) Solo se permiten keys de la lista autorizada.",
    "2) Maximo 5 topics.",
    "3) confidence debe ir en rango 0..1.",
    "4) Desambiguacion obligatoria de musica:",
    "   - claro_musica_app: app, premium, playlist, escuchar, cancion, catalogo.",
    "   - claro_music_venue_eventos: concierto, boletas, festival, escenario, artistas, evento.",
    "   - si hay ambas senales, marcar ambiguous_dual_context=true y devolver ambos topics.",
    "Keys permitidas:",
    taxonomyBlock,
    "Contexto del post:",
    `canal=${truncate(input.channel, 40)}`,
    `cuenta=${truncate(input.accountName, 120)}`,
    `titulo=${truncate(input.title, 500)}`,
    `summary=${truncate(input.summary, 1200)}`,
    `content=${truncate(input.content, MAX_POST_TEXT_CHARS)}`,
    `text=${truncate(input.text, MAX_POST_TEXT_CHARS)}`
  ].join("\n");
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
            max_tokens: 900,
            temperature: 0,
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

const applyMusicDisambiguation = (
  textForRules: string,
  topics: Map<string, ModelTopic>,
  ambiguousFromModel: boolean
): { topics: ModelTopic[]; ambiguousDualContext: boolean } => {
  const normalized = normalizeForMatch(textForRules);
  const hasAppSignals = hasAnySignal(normalized, MUSIC_APP_SIGNALS);
  const hasVenueSignals = hasAnySignal(normalized, MUSIC_VENUE_SIGNALS);

  let ambiguousDualContext = ambiguousFromModel;

  const ensureTopic = (key: string, evidence: string) => {
    const existing = topics.get(key);
    if (existing) {
      existing.confidence = Math.max(existing.confidence, 0.7);
      if (!existing.evidence) existing.evidence = evidence;
      topics.set(key, existing);
      return;
    }
    topics.set(key, {
      key,
      confidence: 0.7,
      evidence
    });
  };

  if (hasAppSignals && hasVenueSignals) {
    ensureTopic(CLARO_MUSICA_APP_TOPIC, "Regla de desambiguacion detecto contexto de app de musica.");
    ensureTopic(CLARO_MUSIC_VENUE_TOPIC, "Regla de desambiguacion detecto contexto de venue/eventos.");
    ambiguousDualContext = true;
  } else if (hasAppSignals) {
    ensureTopic(CLARO_MUSICA_APP_TOPIC, "Regla de desambiguacion detecto contexto de app de musica.");
    topics.delete(CLARO_MUSIC_VENUE_TOPIC);
  } else if (hasVenueSignals) {
    ensureTopic(CLARO_MUSIC_VENUE_TOPIC, "Regla de desambiguacion detecto contexto de venue/eventos.");
    topics.delete(CLARO_MUSICA_APP_TOPIC);
  }

  return {
    topics: Array.from(topics.values()),
    ambiguousDualContext
  };
};

const processMessage = async (message: Required<Pick<SocialTopicMessage, "content_item_id">> & SocialTopicMessage): Promise<void> => {
  const store = createSocialTopicStore();
  if (!store) throw new Error("Database runtime is not configured");

  const contentItemId = message.content_item_id;
  const taxonomyVersion = (message.taxonomy_version ?? env.socialTopicTaxonomyVersion ?? SOCIAL_TOPIC_TAXONOMY_VERSION).trim();
  const promptVersion = (message.prompt_version ?? env.socialTopicPromptVersion ?? "social-topics-v1").trim();
  const modelId = (message.model_id ?? env.bedrockModelId).trim();
  const confidenceMin = env.socialTopicConfidenceMin;
  const reviewThreshold = env.socialTopicReviewThreshold;
  const triggerType = message.trigger_type === "manual" ? "manual" : "scheduled";

  const content = await store.getPromptContent(contentItemId);
  if (!content) {
    console.warn(
      JSON.stringify({
        level: "warn",
        message: "social_topics_content_not_found",
        content_item_id: contentItemId
      })
    );
    return;
  }

  const prompt = buildPrompt({
    channel: content.channel,
    accountName: content.accountName,
    title: content.title,
    summary: content.summary,
    content: content.content,
    text: content.text
  });

  const started = Date.now();
  const modelPayload = await invokeModelStrict(prompt, modelId);
  const latencyMs = Date.now() - started;
  const parsed = parseOutput(modelPayload);

  const topicMap = new Map<string, ModelTopic>();
  for (const topic of parsed.topics) {
    const existing = topicMap.get(topic.key);
    if (!existing || topic.confidence > existing.confidence) {
      topicMap.set(topic.key, topic);
    }
  }

  const postTextForRules = [content.title, content.summary, content.content, content.text].filter((item) => Boolean(item)).join("\n");
  const disambiguated = applyMusicDisambiguation(postTextForRules, topicMap, parsed.ambiguousDualContext);

  const selectedTopics = disambiguated.topics
    .filter((item) => item.confidence >= confidenceMin)
    .sort((a, b) => b.confidence - a.confidence || a.key.localeCompare(b.key))
    .slice(0, 5)
    .map((item, index) => ({
      key: item.key,
      rank: index + 1,
      confidence: item.confidence,
      evidence: {
        text: item.evidence,
        source: "bedrock"
      }
    }));

  const needsReview =
    parsed.overallConfidence === null ||
    parsed.overallConfidence < reviewThreshold ||
    selectedTopics.length === 0 ||
    disambiguated.ambiguousDualContext;

  await store.upsertClassification({
    contentItemId,
    socialPostMetricId: content.socialPostMetricId,
    taxonomyVersion,
    promptVersion,
    modelId,
    overallConfidence: parsed.overallConfidence,
    needsReview,
    ambiguousDualContext: disambiguated.ambiguousDualContext,
    metadata: {
      source: "social_topics_worker",
      taxonomy_version: taxonomyVersion,
      prompt_version: promptVersion,
      request_id: message.request_id ?? null,
      run_id: message.run_id ?? null,
      trigger_type: triggerType,
      requested_at: message.requested_at ?? null,
      model_latency_ms: latencyMs,
      confidence_min: confidenceMin,
      review_threshold: reviewThreshold,
      raw_topics_count: parsed.topics.length,
      selected_topics_count: selectedTopics.length
    },
    topics: selectedTopics
  });

  console.log(
    JSON.stringify({
      level: "info",
      message: "social_topics_classification_completed",
      content_item_id: contentItemId,
      social_post_metric_id: content.socialPostMetricId,
      taxonomy_version: taxonomyVersion,
      prompt_version: promptVersion,
      model_id: modelId,
      selected_topics_count: selectedTopics.length,
      needs_review: needsReview,
      ambiguous_dual_context: disambiguated.ambiguousDualContext,
      model_latency_ms: latencyMs
    })
  );
};

export const main = async (event: SQSEvent) => {
  const store = createSocialTopicStore();
  if (!store) {
    throw new Error("Database runtime is not configured");
  }

  await store.ensureTaxonomySeed();

  for (const record of event.Records) {
    const message = parseMessage(record.body);
    const contentItemId = message.content_item_id;

    if (!contentItemId || !UUID_REGEX.test(contentItemId)) {
      console.error(
        JSON.stringify({
          level: "error",
          message: "social_topics_invalid_message",
          message_id: record.messageId,
          body: record.body
        })
      );
      continue;
    }

    await processMessage({
      ...message,
      content_item_id: contentItemId
    });
  }
};
