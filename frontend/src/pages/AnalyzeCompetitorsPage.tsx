import { useEffect, useState } from "react";
import { type AnalyzeCompetitorsResponse } from "../api/client";
import { useApiClient } from "../api/useApiClient";

const formatPercent = (value: number): string => `${value.toFixed(2)}%`;
const formatScore = (value: number): string => value.toFixed(2);

export const AnalyzeCompetitorsPage = () => {
  const client = useApiClient();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<AnalyzeCompetitorsResponse | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await client.getAnalyzeCompetitors(50);
      setPayload(response);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const hasRows = (payload?.competitors?.length ?? 0) > 0;
  const hasPartialData = Boolean(payload?.competitors?.some((item) => item.insufficient_data));

  return (
    <section>
      <header className="page-header">
        <h2>Benchmark Competencia</h2>
        <p>Comparativo de SOV, riesgo y sentimiento contra el set cerrado de competidores activos.</p>
      </header>

      <section className="panel section-title-row">
        <h3>Competidores</h3>
        <button className="btn btn-outline" type="button" onClick={() => void load()} disabled={loading}>
          Refrescar
        </button>
      </section>

      {loading ? <p>Cargando benchmark...</p> : null}
      {error ? <div className="alert error">{error}</div> : null}
      {hasPartialData ? <div className="alert warning">Hay competidores con datos insuficientes en la ventana actual.</div> : null}

      {payload ? (
        <section className="analysis-grid">
          <article className="panel">
            <h3>Baseline Claro</h3>
            <ul className="simple-list">
              <li>
                <span>Items</span>
                <strong>{payload.baseline_claro.items}</strong>
              </li>
              <li>
                <span>SOV</span>
                <strong>{formatPercent(payload.baseline_claro.sov)}</strong>
              </li>
              <li>
                <span>Sentimiento neto</span>
                <strong>{formatPercent(payload.baseline_claro.sentimiento_neto)}</strong>
              </li>
              <li>
                <span>BHS</span>
                <strong>{formatScore(payload.baseline_claro.bhs)}</strong>
              </li>
            </ul>
          </article>

          <article className="panel">
            <h3>Resumen de universo</h3>
            <ul className="simple-list">
              <li>
                <span>Competidores activos</span>
                <strong>{payload.totals.competitor_terms}</strong>
              </li>
              <li>
                <span>Items totales</span>
                <strong>{payload.totals.items}</strong>
              </li>
              <li>
                <span>Clasificados</span>
                <strong>{payload.totals.classified_items}</strong>
              </li>
            </ul>
          </article>
        </section>
      ) : null}

      {!loading && !error && !hasRows ? (
        <div className="panel">
          <p>No hay datos de competidores para mostrar benchmark en la ventana actual.</p>
        </div>
      ) : null}

      {payload && hasRows ? (
        <section className="panel">
          <div className="incident-table-wrapper">
            <table className="incident-table">
              <thead>
                <tr>
                  <th>Competidor</th>
                  <th>Items</th>
                  <th>SOV</th>
                  <th>Sentimiento neto</th>
                  <th>Riesgo</th>
                  <th>BHS</th>
                  <th>Severidad</th>
                </tr>
              </thead>
              <tbody>
                {payload.competitors.map((item) => (
                  <tr key={item.term_id}>
                    <td>{item.term_name}</td>
                    <td>{item.items}</td>
                    <td>{formatPercent(item.sov)}</td>
                    <td>{formatPercent(item.sentimiento_neto)}</td>
                    <td>{formatPercent(item.riesgo_activo)}</td>
                    <td>{formatScore(item.bhs)}</td>
                    <td>
                      <span className={`severity-chip severity-${item.severidad.toLowerCase()}`}>{item.severidad}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </section>
  );
};
