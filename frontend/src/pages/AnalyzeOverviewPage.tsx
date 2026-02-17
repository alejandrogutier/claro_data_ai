import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { type AnalyzeOverviewResponse } from "../api/client";
import { useApiClient } from "../api/useApiClient";

const formatPercent = (value: number): string => `${value.toFixed(2)}%`;
const formatScore = (value: number): string => value.toFixed(2);
const formatDelta = (value: number): string => {
  if (value > 0) return `+${value.toFixed(2)}`;
  return value.toFixed(2);
};

const deltaClass = (value: number): string => {
  if (value > 0) return "delta-positive";
  if (value < 0) return "delta-negative";
  return "delta-neutral";
};

export const AnalyzeOverviewPage = () => {
  const client = useApiClient();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<AnalyzeOverviewResponse | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await client.getAnalyzeOverview();
        setOverview(response);
      } catch (loadError) {
        setError((loadError as Error).message);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const hasData = (overview?.totals.items ?? 0) > 0;

  return (
    <section>
      <header className="page-header">
        <h2>Analisis Overview Marca</h2>
        <p>Comparativo de ventana actual (7 dias) vs periodo anterior para detectar variaciones de riesgo y reputacion.</p>
      </header>

      <section className="panel analysis-actions">
        <Link className="btn btn-outline" to="/app/analyze/channel">
          Ver Analisis por Canal
        </Link>
        <Link className="btn btn-outline" to="/app/analyze/competitors">
          Ver Benchmark Competencia
        </Link>
      </section>

      {loading ? <p>Cargando analisis...</p> : null}
      {error ? <div className="alert error">{error}</div> : null}
      {!loading && !error && !hasData ? (
        <div className="panel">
          <p>Sin datos activos en la ventana de 7 dias para generar analisis.</p>
        </div>
      ) : null}
      {overview?.totals.insufficient_data ? (
        <div className="alert warning">Datos parciales: menos de 20 items clasificados para una lectura robusta.</div>
      ) : null}

      {overview && hasData ? (
        <>
          <section className="analysis-grid">
            <article className="panel kpi-card">
              <h3>BHS (actual)</h3>
              <p className="kpi-value">{formatScore(overview.totals.bhs)}</p>
              <p className="kpi-caption">Anterior: {formatScore(overview.previous_totals.bhs)}</p>
            </article>
            <article className="panel kpi-card">
              <h3>Sentimiento neto</h3>
              <p className="kpi-value">{formatPercent(overview.totals.sentimiento_neto)}</p>
              <p className="kpi-caption">Anterior: {formatPercent(overview.previous_totals.sentimiento_neto)}</p>
            </article>
            <article className="panel kpi-card">
              <h3>Riesgo activo</h3>
              <p className="kpi-value">{formatPercent(overview.totals.riesgo_activo)}</p>
              <p className="kpi-caption">Anterior: {formatPercent(overview.previous_totals.riesgo_activo)}</p>
            </article>
            <article className="panel kpi-card">
              <h3>SOV Claro</h3>
              <p className="kpi-value">{formatPercent(overview.totals.sov_claro)}</p>
              <p className="kpi-caption">Anterior: {formatPercent(overview.previous_totals.sov_claro)}</p>
            </article>
          </section>

          <section className="panel">
            <div className="section-title-row">
              <h3>Variacion vs periodo anterior</h3>
              <span>Formula: {overview.formula_version}</span>
            </div>
            <ul className="simple-list">
              <li>
                <span>Items</span>
                <strong className={deltaClass(overview.delta.items)}>{formatDelta(overview.delta.items)}</strong>
              </li>
              <li>
                <span>Clasificados</span>
                <strong className={deltaClass(overview.delta.classified_items)}>
                  {formatDelta(overview.delta.classified_items)}
                </strong>
              </li>
              <li>
                <span>Sentimiento neto</span>
                <strong className={deltaClass(overview.delta.sentimiento_neto)}>
                  {formatDelta(overview.delta.sentimiento_neto)}
                </strong>
              </li>
              <li>
                <span>BHS</span>
                <strong className={deltaClass(overview.delta.bhs)}>{formatDelta(overview.delta.bhs)}</strong>
              </li>
            </ul>
          </section>

          <section className="analysis-grid">
            <article className="panel">
              <h3>Scope Claro</h3>
              <ul className="simple-list">
                <li>
                  <span>Items</span>
                  <strong>{overview.by_scope.claro.items}</strong>
                </li>
                <li>
                  <span>Riesgo</span>
                  <strong>{formatPercent(overview.by_scope.claro.riesgo_activo)}</strong>
                </li>
                <li>
                  <span>BHS</span>
                  <strong>{formatScore(overview.by_scope.claro.bhs)}</strong>
                </li>
              </ul>
            </article>
            <article className="panel">
              <h3>Scope Competencia</h3>
              <ul className="simple-list">
                <li>
                  <span>Items</span>
                  <strong>{overview.by_scope.competencia.items}</strong>
                </li>
                <li>
                  <span>Riesgo</span>
                  <strong>{formatPercent(overview.by_scope.competencia.riesgo_activo)}</strong>
                </li>
                <li>
                  <span>BHS</span>
                  <strong>{formatScore(overview.by_scope.competencia.bhs)}</strong>
                </li>
              </ul>
            </article>
          </section>
        </>
      ) : null}
    </section>
  );
};
