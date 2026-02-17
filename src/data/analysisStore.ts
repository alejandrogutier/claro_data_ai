import {
  RdsDataClient,
  fieldString,
  sqlLong,
  sqlTimestamp
} from "./rdsData";

const ANALYSIS_WINDOW_DAYS = 7;
const ANALYSIS_SCOPES = ["claro", "competencia"] as const;

type AnalysisScope = (typeof ANALYSIS_SCOPES)[number];
type MonitorSeverity = "SEV1" | "SEV2" | "SEV3" | "SEV4";
type SentimentBucket = "positive" | "negative" | "neutral" | "unknown" | null;

type AnalysisSourceRow = {
  scope: AnalysisScope | null;
  termId: string | null;
  termName: string | null;
  provider: string;
  sentimiento: SentimentBucket;
  sourceScore: number;
  category: string | null;
};

type MetricsAccumulator = {
  items: number;
  classifiedItems: number;
  positivos: number;
  negativos: number;
  neutrales: number;
  unknownSentimentItems: number;
  qualitySum: number;
};

type AnalyzeScopeKpiRecord = {
  items: number;
  classifiedItems: number;
  positivos: number;
  negativos: number;
  neutrales: number;
  sentimientoNeto: number;
  riesgoActivo: number;
  qualityScore: number;
  bhs: number;
  sov: number;
  insufficientData: boolean;
};

type AnalyzeTotalsRecord = {
  items: number;
  classifiedItems: number;
  sentimientoNeto: number;
  bhs: number;
  riesgoActivo: number;
  severidad: MonitorSeverity;
  sovClaro: number;
  sovCompetencia: number;
  insufficientData: boolean;
};

type AnalyzeOverviewSnapshot = {
  totals: AnalyzeTotalsRecord;
  byScope: {
    claro: AnalyzeScopeKpiRecord;
    competencia: AnalyzeScopeKpiRecord;
  };
  diagnostics: {
    unscopedItems: number;
    unknownSentimentItems: number;
  };
};

type AnalyzeOverviewDeltaRecord = {
  items: number;
  classifiedItems: number;
  sentimientoNeto: number;
  bhs: number;
  riesgoActivo: number;
  sovClaro: number;
  sovCompetencia: number;
};

type AnalyzeOverviewRecord = {
  generatedAt: Date;
  windowDays: 7;
  sourceType: "news";
  formulaVersion: "analysis-v1";
  totals: AnalyzeTotalsRecord;
  previousTotals: AnalyzeTotalsRecord;
  delta: AnalyzeOverviewDeltaRecord;
  byScope: {
    claro: AnalyzeScopeKpiRecord;
    competencia: AnalyzeScopeKpiRecord;
  };
  diagnostics: {
    unscopedItems: number;
    unknownSentimentItems: number;
  };
};

type AnalyzeCategoryCountRecord = {
  value: string;
  count: number;
};

type AnalyzeChannelRecord = {
  provider: string;
  items: number;
  classifiedItems: number;
  positivos: number;
  negativos: number;
  neutrales: number;
  sentimientoNeto: number;
  riesgoActivo: number;
  qualityScore: number;
  bhs: number;
  severidad: MonitorSeverity;
  topCategories: AnalyzeCategoryCountRecord[];
  insufficientData: boolean;
};

type AnalyzeChannelResponseRecord = {
  generatedAt: Date;
  windowDays: 7;
  sourceType: "news";
  formulaVersion: "analysis-v1";
  totals: {
    providers: number;
    items: number;
    classifiedItems: number;
  };
  items: AnalyzeChannelRecord[];
};

type AnalyzeCompetitorRecord = {
  termId: string;
  termName: string;
  items: number;
  classifiedItems: number;
  positivos: number;
  negativos: number;
  neutrales: number;
  sentimientoNeto: number;
  riesgoActivo: number;
  qualityScore: number;
  bhs: number;
  severidad: MonitorSeverity;
  sov: number;
  insufficientData: boolean;
};

type AnalyzeScopeBenchmarkRecord = {
  items: number;
  classifiedItems: number;
  positivos: number;
  negativos: number;
  neutrales: number;
  sentimientoNeto: number;
  riesgoActivo: number;
  qualityScore: number;
  bhs: number;
  severidad: MonitorSeverity;
  sov: number;
  insufficientData: boolean;
};

type AnalyzeCompetitorsResponseRecord = {
  generatedAt: Date;
  windowDays: 7;
  sourceType: "news";
  formulaVersion: "analysis-v1";
  baselineClaro: AnalyzeScopeBenchmarkRecord;
  competitors: AnalyzeCompetitorRecord[];
  totals: {
    competitorTerms: number;
    items: number;
    classifiedItems: number;
  };
};

const defaultAccumulator = (): MetricsAccumulator => ({
  items: 0,
  classifiedItems: 0,
  positivos: 0,
  negativos: 0,
  neutrales: 0,
  unknownSentimentItems: 0,
  qualitySum: 0
});

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

const roundMetric = (value: number): number => Math.round(value * 100) / 100;

const calculateSentimientoNeto = (positivos: number, negativos: number, classifiedItems: number): number =>
  ((positivos - negativos) / Math.max(classifiedItems, 1)) * 100;

const calculateRiesgoActivo = (negativos: number, classifiedItems: number): number =>
  (negativos / Math.max(classifiedItems, 1)) * 100;

const toSeveridad = (riesgoActivo: number): MonitorSeverity => {
  if (riesgoActivo >= 80) return "SEV1";
  if (riesgoActivo >= 60) return "SEV2";
  if (riesgoActivo >= 40) return "SEV3";
  return "SEV4";
};

const calculateBhs = (sentimientoNeto: number, qualityScore: number, riesgoActivo: number): number => {
  const sentimentScore = clamp(50 + sentimientoNeto / 2, 0, 100);
  return 0.5 * sentimentScore + 0.25 * qualityScore + 0.25 * (100 - riesgoActivo);
};

const normalizeSentimiento = (value: string | null): SentimentBucket => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "positive" || normalized === "positivo") return "positive";
  if (normalized === "negative" || normalized === "negativo") return "negative";
  if (normalized === "neutral" || normalized === "neutro") return "neutral";
  return "unknown";
};

const applyRowToAccumulator = (accumulator: MetricsAccumulator, row: AnalysisSourceRow): void => {
  accumulator.items += 1;
  accumulator.qualitySum += row.sourceScore;

  if (row.sentimiento === "positive") {
    accumulator.positivos += 1;
    accumulator.classifiedItems += 1;
    return;
  }

  if (row.sentimiento === "negative") {
    accumulator.negativos += 1;
    accumulator.classifiedItems += 1;
    return;
  }

  if (row.sentimiento === "neutral") {
    accumulator.neutrales += 1;
    accumulator.classifiedItems += 1;
    return;
  }

  if (row.sentimiento === "unknown") {
    accumulator.unknownSentimentItems += 1;
  }
};

const toScopeMetrics = (
  accumulator: MetricsAccumulator,
  scopedItemsTotal: number,
  scopedQualityTotal: number
): AnalyzeScopeKpiRecord => {
  const sentimientoNeto = calculateSentimientoNeto(
    accumulator.positivos,
    accumulator.negativos,
    accumulator.classifiedItems
  );
  const riesgoActivo = calculateRiesgoActivo(accumulator.negativos, accumulator.classifiedItems);
  const qualityScore = accumulator.items > 0 ? (accumulator.qualitySum / accumulator.items) * 100 : 50;
  const volumeShare = scopedItemsTotal > 0 ? accumulator.items / scopedItemsTotal : 0;
  const qualityShare = scopedQualityTotal > 0 ? accumulator.qualitySum / scopedQualityTotal : 0;
  const sov = (0.4 * volumeShare + 0.6 * qualityShare) * 100;

  return {
    items: accumulator.items,
    classifiedItems: accumulator.classifiedItems,
    positivos: accumulator.positivos,
    negativos: accumulator.negativos,
    neutrales: accumulator.neutrales,
    sentimientoNeto: roundMetric(sentimientoNeto),
    riesgoActivo: roundMetric(riesgoActivo),
    qualityScore: roundMetric(qualityScore),
    bhs: roundMetric(calculateBhs(sentimientoNeto, qualityScore, riesgoActivo)),
    sov: roundMetric(sov),
    insufficientData: accumulator.classifiedItems < 20
  };
};

const buildOverviewSnapshot = (rows: AnalysisSourceRow[]): AnalyzeOverviewSnapshot => {
  const global = defaultAccumulator();
  const byScopeAccumulator: Record<AnalysisScope, MetricsAccumulator> = {
    claro: defaultAccumulator(),
    competencia: defaultAccumulator()
  };

  let unscopedItems = 0;

  for (const row of rows) {
    applyRowToAccumulator(global, row);

    if (!row.scope) {
      unscopedItems += 1;
      continue;
    }

    applyRowToAccumulator(byScopeAccumulator[row.scope], row);
  }

  const scopedItemsTotal = byScopeAccumulator.claro.items + byScopeAccumulator.competencia.items;
  const scopedQualityTotal = byScopeAccumulator.claro.qualitySum + byScopeAccumulator.competencia.qualitySum;
  const byScope = {
    claro: toScopeMetrics(byScopeAccumulator.claro, scopedItemsTotal, scopedQualityTotal),
    competencia: toScopeMetrics(byScopeAccumulator.competencia, scopedItemsTotal, scopedQualityTotal)
  };

  const sentimientoNeto = calculateSentimientoNeto(global.positivos, global.negativos, global.classifiedItems);
  const riesgoActivo = calculateRiesgoActivo(global.negativos, global.classifiedItems);
  const qualityScore = global.items > 0 ? (global.qualitySum / global.items) * 100 : 50;

  return {
    totals: {
      items: global.items,
      classifiedItems: global.classifiedItems,
      sentimientoNeto: roundMetric(sentimientoNeto),
      bhs: roundMetric(calculateBhs(sentimientoNeto, qualityScore, riesgoActivo)),
      riesgoActivo: roundMetric(riesgoActivo),
      severidad: toSeveridad(riesgoActivo),
      sovClaro: byScope.claro.sov,
      sovCompetencia: byScope.competencia.sov,
      insufficientData: global.classifiedItems < 20
    },
    byScope,
    diagnostics: {
      unscopedItems,
      unknownSentimentItems: global.unknownSentimentItems
    }
  };
};

class AnalysisStore {
  constructor(private readonly rds: RdsDataClient) {}

  private async listWindowRows(windowStart: Date, windowEnd: Date): Promise<AnalysisSourceRow[]> {
    const response = await this.rds.execute(
      `
        SELECT
          COALESCE(t."scope"::text, '') AS scope,
          ci."termId"::text,
          t."name",
          ci."provider",
          cls."sentimiento",
          ci."sourceScore"::text,
          COALESCE(cls."categoria", ci."category", '') AS category
        FROM "public"."ContentItem" ci
        LEFT JOIN "public"."TrackedTerm" t ON t."id" = ci."termId"
        LEFT JOIN LATERAL (
          SELECT c."sentimiento", c."categoria"
          FROM "public"."Classification" c
          WHERE c."contentItemId" = ci."id"
          ORDER BY c."createdAt" DESC
          LIMIT 1
        ) cls ON TRUE
        WHERE
          ci."sourceType" = CAST('news' AS "public"."SourceType")
          AND ci."state" = CAST('active' AS "public"."ContentState")
          AND COALESCE(ci."publishedAt", ci."createdAt") >= :window_start
          AND COALESCE(ci."publishedAt", ci."createdAt") < :window_end
      `,
      [sqlTimestamp("window_start", windowStart), sqlTimestamp("window_end", windowEnd)]
    );

    return (response.records ?? [])
      .map((row) => {
        const scopeRaw = fieldString(row, 0);
        const termId = fieldString(row, 1);
        const termName = fieldString(row, 2);
        const provider = fieldString(row, 3);
        const sentimientoRaw = fieldString(row, 4);
        const sourceScoreRaw = fieldString(row, 5);
        const categoryRaw = fieldString(row, 6);

        if (!provider) return null;

        const parsedSourceScore = sourceScoreRaw === null ? Number.NaN : Number.parseFloat(sourceScoreRaw);
        const sourceScore = Number.isFinite(parsedSourceScore) ? parsedSourceScore : 0.5;
        const normalizedScope = scopeRaw === "claro" || scopeRaw === "competencia" ? scopeRaw : null;

        return {
          scope: normalizedScope,
          termId,
          termName,
          provider,
          sentimiento: normalizeSentimiento(sentimientoRaw),
          sourceScore,
          category: categoryRaw && categoryRaw.trim() ? categoryRaw.trim() : null
        } satisfies AnalysisSourceRow;
      })
      .filter((row): row is AnalysisSourceRow => row !== null);
  }

  private getWindowBounds(): { currentStart: Date; currentEnd: Date; previousStart: Date } {
    const currentEnd = new Date();
    const currentStart = new Date(currentEnd.getTime() - ANALYSIS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const previousStart = new Date(currentStart.getTime() - ANALYSIS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    return { currentStart, currentEnd, previousStart };
  }

  async getAnalyzeOverview(): Promise<AnalyzeOverviewRecord> {
    const { currentStart, currentEnd, previousStart } = this.getWindowBounds();
    const [currentRows, previousRows] = await Promise.all([
      this.listWindowRows(currentStart, currentEnd),
      this.listWindowRows(previousStart, currentStart)
    ]);

    const current = buildOverviewSnapshot(currentRows);
    const previous = buildOverviewSnapshot(previousRows);

    return {
      generatedAt: new Date(),
      windowDays: ANALYSIS_WINDOW_DAYS,
      sourceType: "news",
      formulaVersion: "analysis-v1",
      totals: current.totals,
      previousTotals: previous.totals,
      delta: {
        items: current.totals.items - previous.totals.items,
        classifiedItems: current.totals.classifiedItems - previous.totals.classifiedItems,
        sentimientoNeto: roundMetric(current.totals.sentimientoNeto - previous.totals.sentimientoNeto),
        bhs: roundMetric(current.totals.bhs - previous.totals.bhs),
        riesgoActivo: roundMetric(current.totals.riesgoActivo - previous.totals.riesgoActivo),
        sovClaro: roundMetric(current.totals.sovClaro - previous.totals.sovClaro),
        sovCompetencia: roundMetric(current.totals.sovCompetencia - previous.totals.sovCompetencia)
      },
      byScope: current.byScope,
      diagnostics: current.diagnostics
    };
  }

  async getAnalyzeChannel(limit: number): Promise<AnalyzeChannelResponseRecord> {
    const safeLimit = Math.min(100, Math.max(1, limit));
    const { currentStart, currentEnd } = this.getWindowBounds();
    const rows = await this.listWindowRows(currentStart, currentEnd);

    const byProvider = new Map<
      string,
      { accumulator: MetricsAccumulator; categories: Map<string, number> }
    >();
    const global = defaultAccumulator();

    for (const row of rows) {
      applyRowToAccumulator(global, row);
      const entry =
        byProvider.get(row.provider) ?? {
          accumulator: defaultAccumulator(),
          categories: new Map<string, number>()
        };

      applyRowToAccumulator(entry.accumulator, row);
      if (row.category) {
        entry.categories.set(row.category, (entry.categories.get(row.category) ?? 0) + 1);
      }

      byProvider.set(row.provider, entry);
    }

    const items = [...byProvider.entries()]
      .map(([provider, entry]) => {
        const metrics = toScopeMetrics(entry.accumulator, entry.accumulator.items, entry.accumulator.qualitySum);
        const topCategories = [...entry.categories.entries()]
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
          .slice(0, 3);

        return {
          provider,
          items: metrics.items,
          classifiedItems: metrics.classifiedItems,
          positivos: metrics.positivos,
          negativos: metrics.negativos,
          neutrales: metrics.neutrales,
          sentimientoNeto: metrics.sentimientoNeto,
          riesgoActivo: metrics.riesgoActivo,
          qualityScore: metrics.qualityScore,
          bhs: metrics.bhs,
          severidad: toSeveridad(metrics.riesgoActivo),
          topCategories,
          insufficientData: metrics.insufficientData
        } satisfies AnalyzeChannelRecord;
      })
      .sort((a, b) => b.items - a.items || a.provider.localeCompare(b.provider))
      .slice(0, safeLimit);

    return {
      generatedAt: new Date(),
      windowDays: ANALYSIS_WINDOW_DAYS,
      sourceType: "news",
      formulaVersion: "analysis-v1",
      totals: {
        providers: byProvider.size,
        items: global.items,
        classifiedItems: global.classifiedItems
      },
      items
    };
  }

  private async listActiveCompetitorTerms(): Promise<Array<{ id: string; name: string }>> {
    const response = await this.rds.execute(
      `
        SELECT "id"::text, "name"
        FROM "public"."TrackedTerm"
        WHERE
          "scope" = CAST('competencia' AS "public"."TermScope")
          AND "isActive" = TRUE
        ORDER BY "name" ASC
      `
    );

    return (response.records ?? [])
      .map((row) => {
        const id = fieldString(row, 0);
        const name = fieldString(row, 1);
        if (!id || !name) return null;
        return { id, name };
      })
      .filter((row): row is { id: string; name: string } => row !== null);
  }

  async getAnalyzeCompetitors(limit: number): Promise<AnalyzeCompetitorsResponseRecord> {
    const safeLimit = Math.min(100, Math.max(1, limit));
    const { currentStart, currentEnd } = this.getWindowBounds();
    const [rows, activeCompetitors] = await Promise.all([
      this.listWindowRows(currentStart, currentEnd),
      this.listActiveCompetitorTerms()
    ]);

    const claroAccumulator = defaultAccumulator();
    const competitorMap = new Map(
      activeCompetitors.map((term) => [term.id, { termName: term.name, accumulator: defaultAccumulator() }])
    );

    for (const row of rows) {
      if (row.scope === "claro") {
        applyRowToAccumulator(claroAccumulator, row);
        continue;
      }

      if (row.scope === "competencia" && row.termId) {
        const entry = competitorMap.get(row.termId);
        if (!entry) continue;
        applyRowToAccumulator(entry.accumulator, row);
      }
    }

    const competitorAccumulators = [...competitorMap.entries()];
    const competitorItemsTotal = competitorAccumulators.reduce((sum, [, entry]) => sum + entry.accumulator.items, 0);
    const competitorClassifiedTotal = competitorAccumulators.reduce(
      (sum, [, entry]) => sum + entry.accumulator.classifiedItems,
      0
    );
    const scopedItemsTotal = claroAccumulator.items + competitorItemsTotal;
    const scopedQualityTotal =
      claroAccumulator.qualitySum +
      competitorAccumulators.reduce((sum, [, entry]) => sum + entry.accumulator.qualitySum, 0);

    const claroMetrics = toScopeMetrics(claroAccumulator, scopedItemsTotal, scopedQualityTotal);
    const baselineClaro: AnalyzeScopeBenchmarkRecord = {
      items: claroMetrics.items,
      classifiedItems: claroMetrics.classifiedItems,
      positivos: claroMetrics.positivos,
      negativos: claroMetrics.negativos,
      neutrales: claroMetrics.neutrales,
      sentimientoNeto: claroMetrics.sentimientoNeto,
      riesgoActivo: claroMetrics.riesgoActivo,
      qualityScore: claroMetrics.qualityScore,
      bhs: claroMetrics.bhs,
      severidad: toSeveridad(claroMetrics.riesgoActivo),
      sov: claroMetrics.sov,
      insufficientData: claroMetrics.insufficientData
    };

    const competitors = competitorAccumulators
      .map(([termId, entry]) => {
        const metrics = toScopeMetrics(entry.accumulator, scopedItemsTotal, scopedQualityTotal);
        return {
          termId,
          termName: entry.termName,
          items: metrics.items,
          classifiedItems: metrics.classifiedItems,
          positivos: metrics.positivos,
          negativos: metrics.negativos,
          neutrales: metrics.neutrales,
          sentimientoNeto: metrics.sentimientoNeto,
          riesgoActivo: metrics.riesgoActivo,
          qualityScore: metrics.qualityScore,
          bhs: metrics.bhs,
          severidad: toSeveridad(metrics.riesgoActivo),
          sov: metrics.sov,
          insufficientData: metrics.insufficientData
        } satisfies AnalyzeCompetitorRecord;
      })
      .sort((a, b) => b.sov - a.sov || b.items - a.items || a.termName.localeCompare(b.termName))
      .slice(0, safeLimit);

    return {
      generatedAt: new Date(),
      windowDays: ANALYSIS_WINDOW_DAYS,
      sourceType: "news",
      formulaVersion: "analysis-v1",
      baselineClaro,
      competitors,
      totals: {
        competitorTerms: activeCompetitors.length,
        items: claroAccumulator.items + competitorItemsTotal,
        classifiedItems: claroAccumulator.classifiedItems + competitorClassifiedTotal
      }
    };
  }
}

export const createAnalysisStore = (): AnalysisStore | null => {
  const client = RdsDataClient.fromEnv();
  if (!client) return null;
  return new AnalysisStore(client);
};

export type {
  AnalyzeCategoryCountRecord,
  AnalyzeChannelRecord,
  AnalyzeChannelResponseRecord,
  AnalyzeCompetitorRecord,
  AnalyzeCompetitorsResponseRecord,
  AnalyzeOverviewDeltaRecord,
  AnalyzeOverviewRecord,
  AnalyzeScopeBenchmarkRecord,
  AnalyzeScopeKpiRecord,
  AnalyzeTotalsRecord
};
