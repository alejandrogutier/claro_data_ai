import { useEffect, useState } from "react";
import { type MonitorOverviewResponse } from "../api/client";
import { useApiClient } from "../api/useApiClient";

const formatPercent = (value: number): string => `${value.toFixed(2)}%`;
const formatScore = (value: number): string => value.toFixed(2);

export const MonitorOverviewPage = () => {
  const client = useApiClient();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<MonitorOverviewResponse | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await client.getMonitorOverview();
        setOverview(response);
      } catch (loadError) {
        setError((loadError as Error).message);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const severityClass = overview ? `severity-chip severity-${overview.totals.severidad.toLowerCase()}` : "severity-chip";

  return (
    <section>
      <header className="page-header">
        <h2>Overview de Monitoreo</h2>
        <p>KPIs de negocio (V1 news-only, ventana fija de 7 dias) para salud de marca y competencia.</p>
      </header>

      {error ? <div className="alert error">{error}</div> : null}
      {overview?.totals.insufficient_data ? (
        <div className="alert warning">Datos insuficientes para alta confianza de KPI (menos de 20 items clasificados).</div>
      ) : null}

      <section className="kpi-grid">
        <article className="panel kpi-card">
          <h3>BHS</h3>
          <p className="kpi-value">{loading ? "..." : overview ? formatScore(overview.totals.bhs) : "--"}</p>
          <p className="kpi-caption">Formula v1</p>
        </article>
        <article className="panel kpi-card">
          <h3>SOV Claro</h3>
          <p className="kpi-value">{loading ? "..." : overview ? formatPercent(overview.totals.sov_claro) : "--"}</p>
          <p className="kpi-caption">vs competencia</p>
        </article>
        <article className="panel kpi-card">
          <h3>Sentimiento neto</h3>
          <p className="kpi-value">{loading ? "..." : overview ? formatPercent(overview.totals.sentimiento_neto) : "--"}</p>
          <p className="kpi-caption">positivo-negativo</p>
        </article>
        <article className="panel kpi-card">
          <h3>Riesgo activo</h3>
          <p className="kpi-value">{loading ? "..." : overview ? formatPercent(overview.totals.riesgo_activo) : "--"}</p>
          <p className="kpi-caption">porcentaje negativo</p>
        </article>
        <article className="panel kpi-card">
          <h3>Severidad</h3>
          <p className="kpi-value">
            {loading ? "..." : overview ? <span className={severityClass}>{overview.totals.severidad}</span> : "--"}
          </p>
          <p className="kpi-caption">umbral de riesgo</p>
        </article>
      </section>

      <div className="scope-grid">
        <section className="panel">
          <div className="section-title-row">
            <h3>Scope Claro</h3>
          </div>
          <ul className="simple-list">
            <li>
              <span>Items</span>
              <strong>{loading ? "..." : overview?.by_scope.claro.items ?? 0}</strong>
            </li>
            <li>
              <span>Clasificados</span>
              <strong>{loading ? "..." : overview?.by_scope.claro.classified_items ?? 0}</strong>
            </li>
            <li>
              <span>Sentimiento neto</span>
              <strong>{loading || !overview ? "..." : formatPercent(overview.by_scope.claro.sentimiento_neto)}</strong>
            </li>
            <li>
              <span>SOV</span>
              <strong>{loading || !overview ? "..." : formatPercent(overview.by_scope.claro.sov)}</strong>
            </li>
          </ul>
        </section>

        <section className="panel">
          <div className="section-title-row">
            <h3>Scope Competencia</h3>
          </div>
          <ul className="simple-list">
            <li>
              <span>Items</span>
              <strong>{loading ? "..." : overview?.by_scope.competencia.items ?? 0}</strong>
            </li>
            <li>
              <span>Clasificados</span>
              <strong>{loading ? "..." : overview?.by_scope.competencia.classified_items ?? 0}</strong>
            </li>
            <li>
              <span>Sentimiento neto</span>
              <strong>{loading || !overview ? "..." : formatPercent(overview.by_scope.competencia.sentimiento_neto)}</strong>
            </li>
            <li>
              <span>SOV</span>
              <strong>{loading || !overview ? "..." : formatPercent(overview.by_scope.competencia.sov)}</strong>
            </li>
          </ul>
        </section>
      </div>

      <section className="panel">
        <div className="section-title-row">
          <h3>Diagnostico</h3>
        </div>
        <ul className="simple-list">
          <li>
            <span>Items sin scope</span>
            <strong>{loading ? "..." : overview?.diagnostics.unscoped_items ?? 0}</strong>
          </li>
          <li>
            <span>Sentimientos desconocidos</span>
            <strong>{loading ? "..." : overview?.diagnostics.unknown_sentiment_items ?? 0}</strong>
          </li>
          <li>
            <span>Fuente / ventana</span>
            <strong>{loading || !overview ? "..." : `${overview.source_type} / ${overview.window_days}d`}</strong>
          </li>
        </ul>
      </section>
    </section>
  );
};
