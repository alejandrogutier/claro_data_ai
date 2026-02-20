import { useEffect, useState } from "react";
import { type AnalyzeChannelResponse } from "../api/client";
import { useApiClient } from "../api/useApiClient";

const formatPercent = (value: number): string => `${value.toFixed(2)}%`;
const formatScore = (value: number): string => value.toFixed(2);

export const AnalyzeChannelPage = () => {
  const client = useApiClient();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<AnalyzeChannelResponse | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await client.getAnalyzeChannel(30);
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

  const hasRows = (payload?.items?.length ?? 0) > 0;
  const hasPartialData = Boolean(payload?.items?.some((item) => item.insufficient_data));

  return (
    <section>
      <header className="page-header">
        <h2>Analisis por Canal</h2>
        <p>Desglose operativo por proveedor para sentimiento, riesgo y calidad de senal.</p>
      </header>

      <section className="panel section-title-row">
        <h3>Canales</h3>
        <button className="btn btn-outline" type="button" onClick={() => void load()} disabled={loading}>
          Refrescar
        </button>
      </section>

      {loading ? <p>Cargando canales...</p> : null}
      {error ? <div className="alert error">{error}</div> : null}
      {hasPartialData ? <div className="alert warning">Hay canales con datos insuficientes para confianza alta.</div> : null}
      {!loading && !error && !hasRows ? (
        <div className="panel">
          <p>Sin datos por canal en la ventana actual.</p>
        </div>
      ) : null}

      {payload && hasRows ? (
        <section className="panel">
          <div className="section-title-row">
            <h3>Resumen de canales</h3>
            <span>
              {payload.totals.providers} proveedores | {payload.totals.items} items
            </span>
          </div>
          <div className="incident-table-wrapper">
            <table className="incident-table">
              <thead>
                <tr>
                  <th>Canal</th>
                  <th>Items</th>
                  <th>Clasificados</th>
                  <th>Sentimiento neto</th>
                  <th>Riesgo</th>
                  <th>BHS</th>
                  <th>Severidad</th>
                  <th>Top categorias</th>
                </tr>
              </thead>
              <tbody>
                {payload.items.map((item) => (
                  <tr key={item.provider}>
                    <td>{item.provider}</td>
                    <td>{item.items}</td>
                    <td>{item.classified_items}</td>
                    <td>{formatPercent(item.sentimiento_neto)}</td>
                    <td>{formatPercent(item.riesgo_activo)}</td>
                    <td>{formatScore(item.bhs)}</td>
                    <td>
                      <span className={`severity-chip severity-${item.severidad.toLowerCase()}`}>{item.severidad}</span>
                    </td>
                    <td>{item.top_categories.map((category) => `${category.value} (${category.count})`).join(", ") || "n/a"}</td>
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
