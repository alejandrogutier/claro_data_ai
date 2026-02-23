import AWS from "aws-sdk";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { randomUUID } from "crypto";
import { createAppStore } from "../../data/appStore";
import { env } from "../../config/env";
import { json, parseBody } from "../../core/http";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RUN_DUPLICATE_WINDOW_MS = 10 * 60 * 1000;
const NEWS_MAX_ARTICLES_PER_TERM = 2;

type IngestionRunBody = {
  run_id?: string;
  terms?: string[];
  term_ids?: string[];
  language?: string;
  max_articles_per_term?: number;
};

const stepFunctions = new AWS.StepFunctions({ region: env.awsRegion });

const mergeUnique = (items: string[]): string[] => {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const item of items) {
    const normalized = item.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(normalized);
  }

  return merged;
};

const sanitizeTerms = (terms: unknown): string[] => {
  if (!Array.isArray(terms)) return [];
  return mergeUnique(
    terms
      .map((term) => (typeof term === "string" ? term.trim() : ""))
      .filter((term) => term.length > 0)
      .slice(0, 50)
  );
};

const sanitizeTermIds = (termIds: unknown): { ids: string[]; invalid: boolean } => {
  if (termIds === undefined) return { ids: [], invalid: false };
  if (!Array.isArray(termIds)) return { ids: [], invalid: true };

  const ids = termIds
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((id) => id.length > 0)
    .slice(0, 50);

  const invalid = ids.some((id) => !UUID_REGEX.test(id));
  return { ids: mergeUnique(ids), invalid };
};

const parseDefaultTerms = (raw?: string): string[] => {
  if (!raw) return [];
  return mergeUnique(raw.split(",").map((term) => term.trim()));
};

const coerceLanguage = (language: unknown): string => {
  if (typeof language !== "string") return "es";
  const normalized = language.trim().toLowerCase();
  if (!normalized) return "es";
  return normalized.slice(0, 8);
};

const coerceLimit = (value: unknown): number => {
  if (typeof value !== "number" || Number.isNaN(value)) return 100;
  return Math.min(500, Math.max(1, Math.floor(value)));
};

export const createIngestionRun = async (event: APIGatewayProxyEventV2) => {
  if (!env.ingestionStateMachineArn) {
    return json(500, {
      error: "misconfigured",
      message: "Missing INGESTION_STATE_MACHINE_ARN"
    });
  }

  const body = parseBody<IngestionRunBody>(event);
  if (!body) {
    return json(400, {
      error: "invalid_json",
      message: "Body JSON invalido"
    });
  }

  const manualTerms = sanitizeTerms(body.terms);
  const termIdsPayload = sanitizeTermIds(body.term_ids);
  if (termIdsPayload.invalid) {
    return json(422, {
      error: "validation_error",
      message: "term_ids must be an array of valid UUIDs"
    });
  }

  const runIdFromBody = body.run_id?.trim();
  if (runIdFromBody && !UUID_REGEX.test(runIdFromBody)) {
    return json(422, {
      error: "validation_error",
      message: "run_id must be a valid UUID"
    });
  }

  const runId = runIdFromBody || randomUUID();
  const language = coerceLanguage(body.language);
  const requestedMaxArticlesPerTerm = coerceLimit(body.max_articles_per_term);
  const effectiveMaxArticlesPerTerm = Math.min(NEWS_MAX_ARTICLES_PER_TERM, requestedMaxArticlesPerTerm);

  const store = createAppStore();

  if (runIdFromBody && store) {
    const snapshot = await store.getIngestionRunSnapshot(runId);
    if (snapshot?.status === "completed") {
      return json(202, {
        status: "accepted",
        run_id: runId,
        execution_arn: null,
        start_date: null,
        skip_reason: "run_already_completed",
        input: {
          triggerType: "manual",
          runId,
          requestId: event.requestContext.requestId,
          requestedAt: new Date().toISOString(),
          termIds: termIdsPayload.ids,
          terms: manualTerms,
          language,
          maxArticlesPerTerm: effectiveMaxArticlesPerTerm,
          requestedMaxArticlesPerTerm
        }
      });
    }

    if (
      snapshot?.status === "running" &&
      snapshot.startedAt &&
      Date.now() - snapshot.startedAt.getTime() <= RUN_DUPLICATE_WINDOW_MS
    ) {
      return json(202, {
        status: "accepted",
        run_id: runId,
        execution_arn: null,
        start_date: null,
        skip_reason: "run_already_running",
        input: {
          triggerType: "manual",
          runId,
          requestId: event.requestContext.requestId,
          requestedAt: new Date().toISOString(),
          termIds: termIdsPayload.ids,
          terms: manualTerms,
          language,
          maxArticlesPerTerm: effectiveMaxArticlesPerTerm,
          requestedMaxArticlesPerTerm
        }
      });
    }
  }

  if (termIdsPayload.ids.length > 0) {
    if (!store) {
      return json(500, {
        error: "misconfigured",
        message: "Database runtime is required when term_ids are provided"
      });
    }

    const resolved = await store.resolveTermsByIds(termIdsPayload.ids);
    const resolvedById = new Map(resolved.map((item) => [item.id, item.name]));
    const missingIds = termIdsPayload.ids.filter((id) => !resolvedById.has(id));

    if (missingIds.length > 0) {
      return json(404, {
        error: "term_ids_not_found",
        message: "Some term_ids were not found",
        missing_term_ids: missingIds
      });
    }

  }

  let terms = mergeUnique([...manualTerms]);
  if (terms.length === 0 && termIdsPayload.ids.length === 0) {
    terms = mergeUnique([...terms, ...parseDefaultTerms(env.ingestionDefaultTerms)]);
  }

  const requestId = event.requestContext.requestId;
  const input = {
    triggerType: "manual",
    runId,
    requestId,
    requestedAt: new Date().toISOString(),
    termIds: termIdsPayload.ids,
    terms,
    language,
    maxArticlesPerTerm: effectiveMaxArticlesPerTerm,
    requestedMaxArticlesPerTerm
  };

  try {
    const execution = await stepFunctions
      .startExecution({
        stateMachineArn: env.ingestionStateMachineArn,
        input: JSON.stringify(input)
      })
      .promise();

    return json(202, {
      status: "accepted",
      run_id: runId,
      execution_arn: execution.executionArn,
      start_date: execution.startDate?.toISOString() ?? null,
      input
    });
  } catch (error) {
    return json(502, {
      error: "ingestion_start_failed",
      message: (error as Error).message
    });
  }
};
