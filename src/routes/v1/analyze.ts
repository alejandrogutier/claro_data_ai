import type { APIGatewayProxyEventV2 } from "aws-lambda";
import {
  createAnalysisStore,
  type AnalyzeChannelRecord,
  type AnalyzeCompetitorRecord,
  type AnalyzeOverviewRecord,
  type AnalyzeScopeBenchmarkRecord,
  type AnalyzeScopeKpiRecord,
  type AnalyzeTotalsRecord
} from "../../data/analysisStore";
import { json } from "../../core/http";

const parseLimit = (value: string | undefined): number | null => {
  if (!value) return 20;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return null;
  if (parsed < 1 || parsed > 100) return null;
  return parsed;
};

const toApiScopeKpi = (scope: AnalyzeScopeKpiRecord) => ({
  items: scope.items,
  classified_items: scope.classifiedItems,
  positivos: scope.positivos,
  negativos: scope.negativos,
  neutrales: scope.neutrales,
  sentimiento_neto: scope.sentimientoNeto,
  riesgo_activo: scope.riesgoActivo,
  quality_score: scope.qualityScore,
  bhs: scope.bhs,
  sov: scope.sov,
  insufficient_data: scope.insufficientData
});

const toApiTotalsKpi = (totals: AnalyzeTotalsRecord) => ({
  items: totals.items,
  classified_items: totals.classifiedItems,
  sentimiento_neto: totals.sentimientoNeto,
  bhs: totals.bhs,
  riesgo_activo: totals.riesgoActivo,
  severidad: totals.severidad,
  sov_claro: totals.sovClaro,
  sov_competencia: totals.sovCompetencia,
  insufficient_data: totals.insufficientData
});

const toApiOverview = (overview: AnalyzeOverviewRecord) => ({
  generated_at: overview.generatedAt.toISOString(),
  window_days: overview.windowDays,
  source_type: overview.sourceType,
  formula_version: overview.formulaVersion,
  totals: toApiTotalsKpi(overview.totals),
  previous_totals: toApiTotalsKpi(overview.previousTotals),
  delta: {
    items: overview.delta.items,
    classified_items: overview.delta.classifiedItems,
    sentimiento_neto: overview.delta.sentimientoNeto,
    bhs: overview.delta.bhs,
    riesgo_activo: overview.delta.riesgoActivo,
    sov_claro: overview.delta.sovClaro,
    sov_competencia: overview.delta.sovCompetencia
  },
  by_scope: {
    claro: toApiScopeKpi(overview.byScope.claro),
    competencia: toApiScopeKpi(overview.byScope.competencia)
  },
  diagnostics: {
    unscoped_items: overview.diagnostics.unscopedItems,
    unknown_sentiment_items: overview.diagnostics.unknownSentimentItems
  }
});

const toApiChannelItem = (item: AnalyzeChannelRecord) => ({
  provider: item.provider,
  items: item.items,
  classified_items: item.classifiedItems,
  positivos: item.positivos,
  negativos: item.negativos,
  neutrales: item.neutrales,
  sentimiento_neto: item.sentimientoNeto,
  riesgo_activo: item.riesgoActivo,
  quality_score: item.qualityScore,
  bhs: item.bhs,
  severidad: item.severidad,
  top_categories: item.topCategories.map((category) => ({
    value: category.value,
    count: category.count
  })),
  insufficient_data: item.insufficientData
});

const toApiScopeBenchmark = (scope: AnalyzeScopeBenchmarkRecord) => ({
  items: scope.items,
  classified_items: scope.classifiedItems,
  positivos: scope.positivos,
  negativos: scope.negativos,
  neutrales: scope.neutrales,
  sentimiento_neto: scope.sentimientoNeto,
  riesgo_activo: scope.riesgoActivo,
  quality_score: scope.qualityScore,
  bhs: scope.bhs,
  severidad: scope.severidad,
  sov: scope.sov,
  insufficient_data: scope.insufficientData
});

const toApiCompetitor = (item: AnalyzeCompetitorRecord) => ({
  term_id: item.termId,
  term_name: item.termName,
  items: item.items,
  classified_items: item.classifiedItems,
  positivos: item.positivos,
  negativos: item.negativos,
  neutrales: item.neutrales,
  sentimiento_neto: item.sentimientoNeto,
  riesgo_activo: item.riesgoActivo,
  quality_score: item.qualityScore,
  bhs: item.bhs,
  severidad: item.severidad,
  sov: item.sov,
  insufficient_data: item.insufficientData
});

export const getAnalyzeOverview = async () => {
  const store = createAnalysisStore();
  if (!store) {
    return json(500, {
      error: "misconfigured",
      message: "Database runtime is not configured"
    });
  }

  try {
    const overview = await store.getAnalyzeOverview();
    return json(200, toApiOverview(overview));
  } catch (error) {
    return json(500, {
      error: "internal_error",
      message: (error as Error).message
    });
  }
};

export const getAnalyzeChannel = async (event: APIGatewayProxyEventV2) => {
  const limit = parseLimit(event.queryStringParameters?.limit);
  if (limit === null) {
    return json(422, {
      error: "validation_error",
      message: "limit must be an integer between 1 and 100"
    });
  }

  const store = createAnalysisStore();
  if (!store) {
    return json(500, {
      error: "misconfigured",
      message: "Database runtime is not configured"
    });
  }

  try {
    const result = await store.getAnalyzeChannel(limit);
    return json(200, {
      generated_at: result.generatedAt.toISOString(),
      window_days: result.windowDays,
      source_type: result.sourceType,
      formula_version: result.formulaVersion,
      totals: {
        providers: result.totals.providers,
        items: result.totals.items,
        classified_items: result.totals.classifiedItems
      },
      items: result.items.map(toApiChannelItem)
    });
  } catch (error) {
    return json(500, {
      error: "internal_error",
      message: (error as Error).message
    });
  }
};

export const getAnalyzeCompetitors = async (event: APIGatewayProxyEventV2) => {
  const limit = parseLimit(event.queryStringParameters?.limit);
  if (limit === null) {
    return json(422, {
      error: "validation_error",
      message: "limit must be an integer between 1 and 100"
    });
  }

  const store = createAnalysisStore();
  if (!store) {
    return json(500, {
      error: "misconfigured",
      message: "Database runtime is not configured"
    });
  }

  try {
    const result = await store.getAnalyzeCompetitors(limit);
    return json(200, {
      generated_at: result.generatedAt.toISOString(),
      window_days: result.windowDays,
      source_type: result.sourceType,
      formula_version: result.formulaVersion,
      baseline_claro: toApiScopeBenchmark(result.baselineClaro),
      competitors: result.competitors.map(toApiCompetitor),
      totals: {
        competitor_terms: result.totals.competitorTerms,
        items: result.totals.items,
        classified_items: result.totals.classifiedItems
      }
    });
  } catch (error) {
    return json(500, {
      error: "internal_error",
      message: (error as Error).message
    });
  }
};
