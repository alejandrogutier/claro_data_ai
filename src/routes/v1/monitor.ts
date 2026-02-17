import { createAppStore, type MonitorOverviewRecord, type MonitorScopeKpiRecord } from "../../data/appStore";
import { json } from "../../core/http";

const toApiScopeKpi = (scope: MonitorScopeKpiRecord) => ({
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

const toApiOverview = (overview: MonitorOverviewRecord) => ({
  generated_at: overview.generatedAt.toISOString(),
  window_days: overview.windowDays,
  source_type: overview.sourceType,
  formula_version: overview.formulaVersion,
  totals: {
    items: overview.totals.items,
    classified_items: overview.totals.classifiedItems,
    sentimiento_neto: overview.totals.sentimientoNeto,
    bhs: overview.totals.bhs,
    riesgo_activo: overview.totals.riesgoActivo,
    severidad: overview.totals.severidad,
    sov_claro: overview.totals.sovClaro,
    sov_competencia: overview.totals.sovCompetencia,
    insufficient_data: overview.totals.insufficientData
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

export const getMonitorOverview = async () => {
  const store = createAppStore();
  if (!store) {
    return json(500, {
      error: "misconfigured",
      message: "Database runtime is not configured"
    });
  }

  try {
    const overview = await store.getMonitorOverview();
    return json(200, toApiOverview(overview));
  } catch (error) {
    return json(500, {
      error: "internal_error",
      message: (error as Error).message
    });
  }
};
