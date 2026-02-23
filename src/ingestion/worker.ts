import AWS from "aws-sdk";
import type { SQSEvent } from "aws-lambda";
import { randomUUID } from "crypto";
import { env } from "../config/env";
import { loadRuntimeSecrets } from "../config/secrets";
import {
  buildSimpleQueryDefinition,
  compileQueryDefinition,
  evaluateQueryDefinition,
  sanitizeExecutionConfig,
  selectProvidersForExecution,
  type QueryDefinition,
  type QueryExecutionConfig
} from "../queryBuilder";
import { NEWS_PROVIDER_NAMES, dedupeByCanonicalUrl, fetchFromProviders } from "./providers";
import {
  createIngestionSqlStore,
  type IngestionQueryTarget,
  type PersistableContentItem,
  type PersistableRunItem
} from "./sqlStore";
import { toSlug } from "./url";

type IngestionDispatchMessage = {
  triggerType?: "scheduled" | "manual";
  runId?: string;
  requestId?: string;
  requestedAt?: string;
  termIds?: string[];
  terms?: string[];
  language?: string;
  maxArticlesPerTerm?: number;
};

const s3 = new AWS.S3({ region: env.awsRegion });
const RUN_DUPLICATE_WINDOW_MS = 10 * 60 * 1000;
const NEWS_MAX_ARTICLES_PER_TERM = 2;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (value: string): boolean => UUID_REGEX.test(value);

type RuntimeQueryTarget = {
  id: string | null;
  name: string;
  language: string;
  scope: "claro" | "competencia";
  maxArticlesPerRun: number;
  definition: QueryDefinition;
  execution: QueryExecutionConfig;
  compiledDefinition: Record<string, unknown>;
};

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

const parseTerms = (terms: unknown): string[] => {
  if (!Array.isArray(terms)) return [];
  return mergeUnique(
    terms
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((item) => item.length > 0)
      .slice(0, 50)
  );
};

const parseTermIds = (termIds: unknown): string[] => {
  if (!Array.isArray(termIds)) return [];

  return mergeUnique(
    termIds
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((value) => value.length > 0 && isUuid(value))
      .slice(0, 50)
  );
};

const parseDefaultTerms = (raw?: string): string[] => {
  if (!raw) return [];
  return mergeUnique(raw.split(",").map((item) => item.trim()));
};

const hostFromUrl = (rawUrl: string | undefined): string | null => {
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
};

const normalizeStringList = (values: string[]): string[] =>
  Array.from(new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean)));

const extractCountryCandidates = (metadata: Record<string, unknown>): string[] => {
  const candidates: string[] = [];
  const rawValues: unknown[] = [
    metadata.country,
    metadata.countries,
    metadata.source_country,
    metadata.sourceCountry,
    metadata.locale
  ];

  for (const raw of rawValues) {
    if (typeof raw === "string") {
      candidates.push(raw);
      continue;
    }

    if (Array.isArray(raw)) {
      for (const item of raw) {
        if (typeof item === "string") {
          candidates.push(item);
        }
      }
    }
  }

  return normalizeStringList(candidates);
};

const applyExecutionFilters = (
  article: { provider?: string; canonicalUrl?: string; metadata?: Record<string, unknown> },
  execution: QueryExecutionConfig
): boolean => {
  const provider = article.provider?.trim().toLowerCase() ?? "";
  const providerAllow = new Set(execution.providers_allow.map((item) => item.trim().toLowerCase()).filter(Boolean));
  const providerDeny = new Set(execution.providers_deny.map((item) => item.trim().toLowerCase()).filter(Boolean));

  if (providerAllow.size > 0 && (!provider || !providerAllow.has(provider))) {
    return false;
  }

  if (provider && providerDeny.has(provider)) {
    return false;
  }

  const domain = hostFromUrl(article.canonicalUrl);
  const domainAllow = new Set(execution.domains_allow.map((item) => item.trim().toLowerCase()).filter(Boolean));
  const domainDeny = new Set(execution.domains_deny.map((item) => item.trim().toLowerCase()).filter(Boolean));

  if (domainAllow.size > 0 && (!domain || !domainAllow.has(domain))) {
    return false;
  }

  if (domain && domainDeny.has(domain)) {
    return false;
  }

  const countries = extractCountryCandidates(article.metadata ?? {});
  const countryAllow = new Set(execution.countries_allow.map((item) => item.trim().toLowerCase()).filter(Boolean));
  const countryDeny = new Set(execution.countries_deny.map((item) => item.trim().toLowerCase()).filter(Boolean));

  if (countryAllow.size > 0) {
    const hasAllowed = countries.some((country) => countryAllow.has(country));
    if (!hasAllowed) return false;
  }

  if (countries.some((country) => countryDeny.has(country))) {
    return false;
  }

  return true;
};

const parseLanguage = (value: unknown): string => {
  if (typeof value !== "string") return "es";
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "es";
  return normalized.slice(0, 8);
};

const parseLimit = (value: unknown): number => {
  if (typeof value !== "number" || Number.isNaN(value)) return 100;
  return Math.min(500, Math.max(1, Math.floor(value)));
};

const toPublishedAtMs = (value: string | undefined): number => {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const limitNewsItems = <T extends { canonicalUrl: string; publishedAt?: string }>(items: T[], limit: number): T[] =>
  [...items]
    .sort((a, b) => {
      const byDate = toPublishedAtMs(b.publishedAt) - toPublishedAtMs(a.publishedAt);
      if (byDate !== 0) return byDate;
      return a.canonicalUrl.localeCompare(b.canonicalUrl);
    })
    .slice(0, Math.max(1, limit));

const parseMessage = (body: string): IngestionDispatchMessage => {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as IngestionDispatchMessage;
  } catch {
    return {};
  }
};

const persistRawSnapshot = async (
  runId: string,
  triggerType: string,
  term: string,
  payload: Record<string, unknown>
): Promise<string> => {
  const bucket = env.rawBucketName;
  if (!bucket) {
    throw new Error("Missing RAW_BUCKET_NAME for ingestion worker");
  }

  const datePart = new Date().toISOString().slice(0, 10);
  const key = `ingestion/date=${datePart}/run=${runId}/trigger=${triggerType}/term=${toSlug(term) || "term"}/payload.json`;

  await s3
    .putObject({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(payload),
      ContentType: "application/json"
    })
    .promise();

  return key;
};

const processRecord = async (
  recordBody: string,
  appConfig: Record<string, string>,
  providerKeys: Record<string, string>
) => {
  const sqlStore = createIngestionSqlStore();
  const message = parseMessage(recordBody);
  const runId = message.runId && isUuid(message.runId) ? message.runId : randomUUID();
  const triggerType = message.triggerType ?? "scheduled";
  const language = parseLanguage(message.language);
  const requestedMaxArticlesPerTerm = parseLimit(message.maxArticlesPerTerm);
  const effectiveRunMaxArticlesPerTerm = Math.min(NEWS_MAX_ARTICLES_PER_TERM, requestedMaxArticlesPerTerm);
  const requestedTermIds = parseTermIds(message.termIds);

  const manualTerms = parseTerms(message.terms);
  const toManualTarget = (term: string): RuntimeQueryTarget => {
    const definition = buildSimpleQueryDefinition(term);
    return {
      id: null,
      name: term,
      language,
      scope: "claro",
      maxArticlesPerRun: requestedMaxArticlesPerTerm,
      definition,
      execution: sanitizeExecutionConfig({}),
      compiledDefinition: compileQueryDefinition(definition) as unknown as Record<string, unknown>
    };
  };

  const toRuntimeQueryTarget = (query: IngestionQueryTarget): RuntimeQueryTarget => ({
    id: query.id,
    name: query.name,
    language: query.language || language,
    scope: query.scope,
    maxArticlesPerRun: Math.max(1, query.maxArticlesPerRun),
    definition: query.definition,
    execution: sanitizeExecutionConfig(query.execution),
    compiledDefinition:
      query.compiledDefinition && Object.keys(query.compiledDefinition).length > 0
        ? query.compiledDefinition
        : (compileQueryDefinition(query.definition) as unknown as Record<string, unknown>)
  });

  let queryTargets: RuntimeQueryTarget[] = manualTerms.map(toManualTarget);

  if (sqlStore && requestedTermIds.length > 0) {
    const resolvedFromIds = await sqlStore.resolveTermIdsToQueries(requestedTermIds);
    queryTargets = [...queryTargets, ...resolvedFromIds.map(toRuntimeQueryTarget)];
  }

  if (queryTargets.length === 0 && sqlStore) {
    const activeQueries = await sqlStore.listActiveQueries(50);
    queryTargets = activeQueries.map(toRuntimeQueryTarget);
  }

  if (queryTargets.length === 0) {
    const defaultTermsFromConfig = parseDefaultTerms(appConfig.INGESTION_DEFAULT_TERMS ?? env.ingestionDefaultTerms);
    queryTargets = defaultTermsFromConfig.map(toManualTarget);
  }

  const dedupedTargets = new Map<string, RuntimeQueryTarget>();
  for (const target of queryTargets) {
    const key = target.id ?? `${target.name.toLowerCase()}::${target.language.toLowerCase()}`;
    if (!dedupedTargets.has(key)) {
      dedupedTargets.set(key, target);
    }
  }
  queryTargets = Array.from(dedupedTargets.values());

  if (queryTargets.length === 0) {
    throw new Error("No terms provided in message and no active/default terms configured");
  }

  const startedAt = new Date();
  const termSummaries: Record<string, unknown>[] = [];
  const runItems: PersistableRunItem[] = [];

  let providersTotal = 0;
  let providersFailed = 0;
  let itemsRaw = 0;
  let itemsDeduped = 0;
  let itemsTrimmedByLimit = 0;
  let itemsPersisted = 0;
  let runStarted = false;

  if (sqlStore) {
    const snapshot = await sqlStore.getRunSnapshot(runId);

    if (snapshot?.status === "completed") {
      return {
        run_id: runId,
        trigger_type: triggerType,
        status: "skipped",
        skip_reason: "run_already_completed"
      };
    }

    if (
      snapshot?.status === "running" &&
      snapshot.startedAt &&
      Date.now() - snapshot.startedAt.getTime() <= RUN_DUPLICATE_WINDOW_MS
    ) {
      return {
        run_id: runId,
        trigger_type: triggerType,
        status: "skipped",
        skip_reason: "run_already_running"
      };
    }

    await sqlStore.startRun({
      runId,
      triggerType,
      language,
      maxArticlesPerTerm: effectiveRunMaxArticlesPerTerm,
      requestId: message.requestId,
      startedAt
    });

    runStarted = true;
  }

  try {
    for (const target of queryTargets) {
      const targetRequestedMaxArticlesPerTerm = Math.min(requestedMaxArticlesPerTerm, Math.max(1, target.maxArticlesPerRun));
      const targetEffectiveMaxArticlesPerTerm = Math.min(NEWS_MAX_ARTICLES_PER_TERM, targetRequestedMaxArticlesPerTerm);

      const compiledQueryText =
        typeof target.compiledDefinition.query === "string" && target.compiledDefinition.query.trim()
          ? target.compiledDefinition.query.trim()
          : target.name;

      const selectedProviders = selectProvidersForExecution([...NEWS_PROVIDER_NAMES], target.execution);
      if (selectedProviders.length === 0) {
        termSummaries.push({
          term: target.name,
          term_id: target.id,
          scope: target.scope,
          skip_reason: "no_providers_selected"
        });
        continue;
      }

      const providerResults = await fetchFromProviders({
        term: compiledQueryText,
        language: target.language || language,
        maxArticlesPerTerm: targetEffectiveMaxArticlesPerTerm,
        providerKeys,
        providers: selectedProviders
      });

      const merged = providerResults.flatMap((result) => result.items);
      const matchedByRule = merged.filter((article) =>
        evaluateQueryDefinition(target.definition, {
          provider: article.provider,
          title: article.title,
          summary: article.summary,
          content: article.content,
          canonicalUrl: article.canonicalUrl,
          language: article.language,
          metadata: article.metadata
        })
      );

      const matchedByExecution = matchedByRule.filter((article) =>
        applyExecutionFilters(
          {
            provider: article.provider,
            canonicalUrl: article.canonicalUrl,
            metadata: article.metadata
          },
          target.execution
        )
      );

      const deduped = dedupeByCanonicalUrl(matchedByExecution);
      const limited = limitNewsItems(deduped, targetEffectiveMaxArticlesPerTerm);
      const trimmedByLimit = Math.max(0, deduped.length - limited.length);
      const failedProviders = providerResults.filter((result) => Boolean(result.error)).length;
      const successfulProviders = providerResults.length - failedProviders;

      let termId = target.id;
      if (!termId && sqlStore) {
        termId = await sqlStore.ensureTrackedTerm(target.name, target.language || language, targetRequestedMaxArticlesPerTerm);
      }

      const rawS3Key = await persistRawSnapshot(runId, triggerType, target.name, {
        runId,
        triggerType,
        requestId: message.requestId ?? null,
        requestedAt: message.requestedAt ?? null,
        term: target.name,
        termId,
        termScope: target.scope,
        termIds: requestedTermIds,
        language: target.language || language,
        requestedMaxArticlesPerTerm,
        targetRequestedMaxArticlesPerTerm,
        targetEffectiveMaxArticlesPerTerm,
        selectedProviders,
        providerResults,
        mergedCount: merged.length,
        matchedByRuleCount: matchedByRule.length,
        matchedByExecutionCount: matchedByExecution.length,
        dedupedCount: deduped.length,
        trimmedByLimit,
        limitedCount: limited.length,
        ingestedAt: new Date().toISOString(),
        items: limited
      });

      const persistableItems: PersistableContentItem[] = limited.map((article) => ({
        article,
        termId,
        runId,
        term: target.name,
        termScope: target.scope,
        triggerType,
        rawPayloadS3Key: rawS3Key
      }));

      let insertedCanonicalUrls = new Set<string>(limited.map((item) => item.canonicalUrl));
      if (sqlStore) {
        const refs = await sqlStore.upsertContentItems(persistableItems);
        insertedCanonicalUrls = await sqlStore.upsertRunContentLinks(runId, target.name, refs);
      }

      const persistedByProvider = new Map<string, number>();
      for (const article of limited) {
        if (!insertedCanonicalUrls.has(article.canonicalUrl)) continue;
        persistedByProvider.set(article.provider, (persistedByProvider.get(article.provider) ?? 0) + 1);
      }

      const persistedCount = insertedCanonicalUrls.size;

      for (const result of providerResults) {
        runItems.push({
          runId,
          provider: result.provider,
          status: result.error ? "failed" : "completed",
          fetchedCount: result.rawCount,
          persistedCount: persistedByProvider.get(result.provider) ?? 0,
          latencyMs: result.durationMs,
          errorMessage: result.error
            ? `[${result.errorType ?? "unknown"}][term:${target.name}] ${result.error}`
            : undefined
        });
      }

      providersTotal += providerResults.length;
      providersFailed += failedProviders;
      itemsRaw += merged.length;
      itemsDeduped += deduped.length;
      itemsTrimmedByLimit += trimmedByLimit;
      itemsPersisted += persistedCount;

      termSummaries.push({
        term: target.name,
        term_id: termId,
        scope: target.scope,
        raw_s3_key: rawS3Key,
        providers_total: providerResults.length,
        providers_selected: selectedProviders,
        providers_successful: successfulProviders,
        providers_failed: failedProviders,
        items_raw: merged.length,
        items_matched_by_rule: matchedByRule.length,
        items_matched_by_execution: matchedByExecution.length,
        items_deduped: deduped.length,
        items_trimmed_by_limit: trimmedByLimit,
        items_after_limit: limited.length,
        items_persisted: persistedCount
      });
    }

    if (sqlStore && runStarted) {
      await sqlStore.replaceRunItems(runItems);
      await sqlStore.finishRun({
        runId,
        status: "completed",
        finishedAt: new Date(),
        metrics: {
          providers_total: providersTotal,
          providers_failed: providersFailed,
          items_raw: itemsRaw,
          items_deduped: itemsDeduped,
          items_trimmed_by_limit: itemsTrimmedByLimit,
          items_persisted: itemsPersisted,
          terms_count: queryTargets.length,
          requested_max_articles_per_term: requestedMaxArticlesPerTerm,
          effective_max_articles_per_term: effectiveRunMaxArticlesPerTerm,
          term_summaries: termSummaries
        }
      });
    }

    return {
      run_id: runId,
      trigger_type: triggerType,
      status: "processed",
      terms_count: queryTargets.length,
      providers_total: providersTotal,
      providers_failed: providersFailed,
      items_raw: itemsRaw,
      items_deduped: itemsDeduped,
      items_trimmed_by_limit: itemsTrimmedByLimit,
      items_persisted: itemsPersisted,
      requested_max_articles_per_term: requestedMaxArticlesPerTerm,
      effective_max_articles_per_term: effectiveRunMaxArticlesPerTerm,
      term_summaries: termSummaries
    };
  } catch (error) {
    if (sqlStore && runStarted) {
      try {
        if (runItems.length > 0) {
          await sqlStore.replaceRunItems(runItems);
        }
        await sqlStore.finishRun({
          runId,
          status: "failed",
          finishedAt: new Date(),
          errorMessage: (error as Error).message.slice(0, 1000),
          metrics: {
            providers_total: providersTotal,
            providers_failed: providersFailed,
            items_raw: itemsRaw,
            items_deduped: itemsDeduped,
            items_trimmed_by_limit: itemsTrimmedByLimit,
            items_persisted: itemsPersisted,
            terms_count: queryTargets.length,
            terms_completed: termSummaries.length,
            requested_max_articles_per_term: requestedMaxArticlesPerTerm,
            effective_max_articles_per_term: effectiveRunMaxArticlesPerTerm,
            term_summaries: termSummaries
          }
        });
      } catch (persistError) {
        console.error(
          JSON.stringify({
            level: "error",
            message: "ingestion_sql_persist_failure",
            run_id: runId,
            persist_error: (persistError as Error).message
          })
        );
      }
    }

    throw error;
  }
};

export const main = async (event: SQSEvent) => {
  const secrets = await loadRuntimeSecrets();
  const results: Record<string, unknown>[] = [];

  for (const record of event.Records) {
    const result = await processRecord(record.body, secrets.appConfig, secrets.providerKeys);
    results.push(result);
  }

  console.log(
    JSON.stringify({
      level: "info",
      message: "ingestion_worker_batch_processed",
      records: event.Records.length,
      results
    })
  );
};
