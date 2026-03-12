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
const promptTemplateCache = new Map<string, string>();

type ClassificationTriggerType = "manual" | "scheduled";

type ClassificationMessage = {
  content_item_id?: string;
  comment_id?: string;
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
  if (message.includes("model_invalid_json") || code === "SyntaxError") return true;
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

const sanitizeModelJson = (text: string): string => {
  return text
    .replace(/,\s*([}\]])/g, "$1")                // trailing commas
    .replace(/'/g, '"')                            // single quotes → double quotes
    .replace(/(\r?\n|\r)/g, " ");                  // newlines inside values
};

const parseModelJson = (rawText: string): Record<string, unknown> => {
  const directText = extractJsonText(rawText);

  const tryParse = (input: string): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(input) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch { /* fallthrough */ }
    return null;
  };

  const result = tryParse(directText) ?? tryParse(sanitizeModelJson(directText));
  if (result) return result;

  const firstBrace = directText.indexOf("{");
  const lastBrace = directText.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const chunk = directText.slice(firstBrace, lastBrace + 1);
    const chunkResult = tryParse(chunk) ?? tryParse(sanitizeModelJson(chunk));
    if (chunkResult) return chunkResult;
  }

  throw new Error("model_invalid_json");
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

// ── Social post taxonomy (38 categories) ──
const SOCIAL_POST_CATEGORIES: readonly string[] = [
  "Impacto social y sostenibilidad",
  "Impacto de marca",
  "Ferias y activaciones",
  "Red cobertura y tecnología",
  "Beneficios y/o alianzas",
  "D-days",
  "Smartphones",
  "Promociones",
  "Tendencias memes y cultura pop",
  "Reconocimientos y certificaciones",
  "Marca empleadora",
  "Cultura corporativa",
  "Gestión corporativa",
  "Noticias / logros",
  "Deportes",
  "Servicio al cliente",
  "Eventos corp",
  "CRC",
  "Pymes casos y educación empresarios",
  "Educación y recomendaciones tec/seguridad",
  "Branding y narrativa creativa",
  "Hackeo",
  "Concursos y fidelización",
  "Venues",
  "Claro música",
  "Política pública",
  "Claro empresas",
  "Claro music - Venue eventos",
  "Claro musica app",
  "Claro video",
  "Gaming esports",
  "Hogares",
  "Pospago",
  "Prepago",
  "Otros productos de claro",
  "Servicio soporte",
  "Streaming bundles",
  "Talento y empleabilidad"
] as const;

const normalizeForMatch = (s: string): string =>
  s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

const SOCIAL_POST_CATEGORY_INDEX = new Map<string, string>(
  SOCIAL_POST_CATEGORIES.map((c) => [normalizeForMatch(c), c])
);

// Keyword map for common model hallucinations → correct category
const SOCIAL_CATEGORY_KEYWORDS: [RegExp, string][] = [
  [/\bentretenimiento\b/, "Tendencias memes y cultura pop"],
  [/\bpublicid|marketing|branding\b/, "Branding y narrativa creativa"],
  [/\bpromocion|oferta|descuento\b/, "Promociones"],
  [/\bresponsabilid|rse|sostenib|social\s+corporativ|medio\s+ambient|reciclaj\b/, "Impacto social y sostenibilidad"],
  [/\bcibersegurid|seguridad\s+digital|fraude|phishing|hackeo\b/, "Hackeo"],
  [/\bdeporte|futbol|ciclism|copa\b/, "Deportes"],
  [/\btecnolog|5g|cobertura|fibra|infraestructur|conectivid\b/, "Red cobertura y tecnología"],
  [/\bevento\s+corp|conferencia|summit|workshop|lanzamiento\s+intern\b/, "Eventos corp"],
  [/\btalento|empleo|vacan|reclutamiento|oportunidad\s+laboral\b/, "Talento y empleabilidad"],
  [/\bmarca\s+empleador|employer\s+brand|vida\s+laboral\b/, "Marca empleadora"],
  [/\bcultura\s+corp|valores\s+corp|celebracion\s+corp\b/, "Cultura corporativa"],
  [/\bgestion\s+corp|resultado|financi|informe\s+anual\b/, "Gestión corporativa"],
  [/\breconocimiento|certificacion|premio|great\s+place|effie\b/, "Reconocimientos y certificaciones"],
  [/\bgaming|esport|torneo|videojuego\b/, "Gaming esports"],
  [/\bclaro\s+video|streaming\s+video\b/, "Claro video"],
  [/\bclaro\s+musica\s+app|aplicacion.*musica\b/, "Claro musica app"],
  [/\bclaro\s+music.*venue|concierto|festival\s+music\b/, "Claro music - Venue eventos"],
  [/\bclaro\s+musica|musica|playlist|artista\b/, "Claro música"],
  [/\bclaro\s+empresa|b2b|datacenter|cloud|sd-wan\b/, "Claro empresas"],
  [/\bhogares|internet\s+hogar|television|iptv|smart\s+home\b/, "Hogares"],
  [/\bpospago|roaming|data\s+ilimitad\b/, "Pospago"],
  [/\bprepago|recarga|bolsa\s+de\s+dato\b/, "Prepago"],
  [/\bstreaming\s+bundle|netflix.*disney|paquete.*streaming\b/, "Streaming bundles"],
  [/\bpyme|emprendedor|caso\s+de\s+exito\b/, "Pymes casos y educación empresarios"],
  [/\beducaci.*seguridad|tip.*ciberseg|tutorial\b/, "Educación y recomendaciones tec/seguridad"],
  [/\bconcurso|sorteo|fideliz|programa\s+de\s+punto|claro\s+club\b/, "Concursos y fidelización"],
  [/\bvenue|centro\s+de\s+evento|estadio|arena\b/, "Venues"],
  [/\bferia|activacion|stand|btl|andicom\b/, "Ferias y activaciones"],
  [/\balianza|partnership|convenio|acuerdo\s+comercial\b/, "Beneficios y/o alianzas"],
  [/\bblack\s+friday|cyber|hot\s+sale|d-day\b/, "D-days"],
  [/\bsmartphone|iphone|samsung|xiaomi|dispositivo\b/, "Smartphones"],
  [/\bmeme|viral|cultura\s+pop|trendjack|humor\b/, "Tendencias memes y cultura pop"],
  [/\bcrc|regulacion|normativa|comision\b/, "CRC"],
  [/\bpolitica\s+public|legislacion|mintic|espectro\b/, "Política pública"],
  [/\bservicio\s+soporte|soporte\s+tecnico|troubleshoot|mesa\s+de\s+ayud\b/, "Servicio soporte"],
  [/\bservicio\s+al\s+client|atencion\s+al\s+client|canal\s+de\s+atenci\b/, "Servicio al cliente"],
  [/\blogro|hito|noticia|comunicado\b/, "Noticias / logros"],
];

const matchSocialPostCategory = (raw: string): string => {
  const norm = normalizeForMatch(raw);

  // 1. Exact match (case/accent insensitive)
  const exact = SOCIAL_POST_CATEGORY_INDEX.get(norm);
  if (exact) return exact;

  // 2. Substring containment — check if any valid category is contained in the raw string
  for (const [normCat, canonical] of SOCIAL_POST_CATEGORY_INDEX) {
    if (norm.includes(normCat) || normCat.includes(norm)) return canonical;
  }

  // 3. Keyword heuristic
  for (const [pattern, canonical] of SOCIAL_CATEGORY_KEYWORDS) {
    if (pattern.test(norm)) return canonical;
  }

  // 4. Fallback
  return "Otros productos de claro";
};

const validateOutput = (
  payload: Record<string, unknown>,
  options?: {
    defaultCategoria?: string;
    useSocialTaxonomy?: boolean;
  }
): {
  categoria: string;
  sentimiento: "positivo" | "neutro" | "negativo";
  etiquetas: string[];
  confianza: number;
  resumen: string | null;
} => {
  const rawCategoria = normalizeString(payload.categoria, 120) ?? normalizeString(options?.defaultCategoria, 120);
  if (!rawCategoria) {
    throw new Error("model_missing_categoria");
  }
  const categoria = options?.useSocialTaxonomy ? matchSocialPostCategory(rawCategoria) : rawCategoria;

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

const loadPromptTemplate = async (version: string): Promise<string> => {
  const cached = promptTemplateCache.get(version);
  if (cached) return cached;

  // version format: "classification-v1" → file "v1.md", "classification-v2" → "v2.md"
  const filename = version.replace(/^classification-/, "v") + ".md";
  const promptPath = path.resolve(__dirname, `../prompts/classification/${filename}`);
  const content = await readFile(promptPath, "utf8");
  promptTemplateCache.set(version, content);
  return content;
};

const truncate = (value: string | null | undefined, maxChars: number): string => {
  const raw = (value ?? "").trim();
  if (!raw) return "null";
  const sliced = raw.length > maxChars ? raw.slice(0, maxChars) : raw;
  return sliced;
};

const buildPrompt = async (version: string, input: {
  sourceType: string;
  provider: string;
  language: string | null;
  title: string;
  summary: string | null;
  content: string | null;
}): Promise<string> => {
  const template = await loadPromptTemplate(version);
  return template
    .replaceAll("{{source_type}}", truncate(input.sourceType, 40))
    .replaceAll("{{provider}}", truncate(input.provider, 60))
    .replaceAll("{{language}}", truncate(input.language, 20))
    .replaceAll("{{title}}", truncate(input.title, 500))
    .replaceAll("{{summary}}", truncate(input.summary, 1200))
    .replaceAll("{{content}}", truncate(input.content, MAX_CONTENT_CHARS));
};

const buildCommentPrompt = async (version: string, input: {
  channel: string;
  postText: string | null;
  commentText: string;
}): Promise<string> => {
  const template = await loadPromptTemplate(version);
  return template
    .replaceAll("{{channel}}", truncate(input.channel, 40))
    .replaceAll("{{post_text}}", truncate(input.postText, MAX_CONTENT_CHARS))
    .replaceAll("{{comment_text}}", truncate(input.commentText, MAX_CONTENT_CHARS));
};

const validateCommentOutput = (
  payload: Record<string, unknown>
): {
  sentimiento: "positivo" | "neutro" | "negativo";
  relatedToPostText: boolean;
  isSpam: boolean;
  confianza: number;
  categoria: string | null;
} => {
  const sentimiento = normalizeSentimiento(payload.sentimiento);
  if (!sentimiento) {
    throw new Error(`comment_invalid_sentimiento:${JSON.stringify(payload.sentimiento)}`);
  }

  const relatedToPostText = typeof payload.relatedToPostText === "boolean" ? payload.relatedToPostText : true;
  const isSpam = typeof payload.isSpam === "boolean" ? payload.isSpam : false;

  const confianzaRaw = payload.confianza;
  if (typeof confianzaRaw !== "number" || Number.isNaN(confianzaRaw) || confianzaRaw < 0 || confianzaRaw > 1) {
    throw new Error("comment_invalid_confianza");
  }

  const categoria = normalizeString(payload.categoria, 120);

  return { sentimiento, relatedToPostText, isSpam, confianza: confianzaRaw, categoria };
};

const processCommentItem = async (message: Required<Pick<ClassificationMessage, "comment_id" | "prompt_version" | "model_id">> &
  Omit<ClassificationMessage, "comment_id" | "prompt_version" | "model_id">): Promise<void> => {
  const store = createClassificationStore();
  if (!store) {
    throw new Error("Database runtime is not configured");
  }

  const commentId = message.comment_id;
  const promptVersion = message.prompt_version;
  const modelId = message.model_id;
  const requestId = typeof message.request_id === "string" ? message.request_id.trim() : null;

  const comment = await store.getCommentForPrompt(commentId);
  if (!comment) {
    console.warn("comment_classification_not_found", { comment_id: commentId });
    return;
  }

  const prompt = await buildCommentPrompt(promptVersion, {
    channel: comment.channel,
    postText: comment.postText,
    commentText: comment.commentText
  });

  const started = Date.now();
  const rawOutput = await invokeModelStrict(prompt, modelId || env.bedrockModelId);
  const latencyMs = Date.now() - started;

  const validated = validateCommentOutput(rawOutput);

  await store.updateCommentClassification({
    commentId,
    sentiment: validated.sentimiento,
    relatedToPostText: validated.relatedToPostText,
    isSpam: validated.isSpam,
    confidence: validated.confianza,
    categoria: validated.categoria
  });

  console.log(
    JSON.stringify({
      level: "info",
      message: "comment_classification_completed",
      comment_id: commentId,
      prompt_version: promptVersion,
      model_id: modelId,
      request_id: requestId,
      sentiment: validated.sentimiento,
      related_to_post: validated.relatedToPostText,
      is_spam: validated.isSpam,
      model_latency_ms: latencyMs
    })
  );
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

  const prompt = await buildPrompt(promptVersion, {
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

  const isSocialPrompt = promptVersion.startsWith("social-sentiment-v");
  const validated = validateOutput(rawOutput, {
    defaultCategoria: isSocialPrompt ? "Otros productos de claro" : undefined,
    useSocialTaxonomy: isSocialPrompt
  });

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
    const commentId = message.comment_id;

    const promptVersion = (message.prompt_version ?? env.classificationPromptVersion ?? "classification-v1").trim();
    const modelId = (message.model_id ?? env.bedrockModelId).trim();

    if (!promptVersion || !modelId) {
      console.error("classification_worker_missing_prompt_or_model", {
        message_id: record.messageId,
        body: record.body
      });
      continue;
    }

    // Route: comment classification
    if (commentId && UUID_REGEX.test(commentId)) {
      await processCommentItem({
        ...message,
        comment_id: commentId,
        prompt_version: promptVersion,
        model_id: modelId
      });
      continue;
    }

    // Route: content item classification
    if (!contentItemId || !UUID_REGEX.test(contentItemId)) {
      console.error("classification_worker_invalid_message", {
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
