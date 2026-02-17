import { useEffect, useMemo, useState } from "react";
import { type Connector, type MetaResponse } from "../api/client";
import { useApiClient } from "../api/useApiClient";
import { useAuth } from "../auth/AuthContext";

const countByState = (meta: MetaResponse | null, state: string): number =>
  meta?.states?.find((entry) => entry.value === state)?.count ?? 0;

export const AlertsPage = () => {
  const client = useApiClient();
  const { session } = useAuth();
  const canOperate = useMemo(() => session?.role === "Admin" || session?.role === "Analyst", [session?.role]);

  const [meta, setMeta] = useState<MetaResponse | null>(null);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const unhealthy = useMemo(
    () => connectors.filter((connector) => connector.health_status === "offline" || connector.health_status === "degraded"),
    [connectors]
  );

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const [metaResponse, connectorsResponse] = await Promise.all([client.getMeta(), client.listConnectors(100)]);
      setMeta(metaResponse);
      setConnectors(connectorsResponse.items ?? []);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const triggerSync = async (connectorId: string) => {
    if (!canOperate) return;
    setError(null);
    try {
      await client.triggerConnectorSync(connectorId);
      await load();
    } catch (syncError) {
      setError((syncError as Error).message);
    }
  };

  return (
    <section>
      <header className="page-header">
        <h2>Reglas de Alertas (Base)</h2>
        <p>Base funcional no-stub: indicadores operativos y accion manual sobre conectores criticos.</p>
      </header>

      {error ? <div className="alert error">{error}</div> : null}

      <section className="kpi-grid">
        <article className="panel kpi-card">
          <h3>Contenido oculto</h3>
          <p className="kpi-value">{loading ? "..." : countByState(meta, "hidden")}</p>
        </article>
        <article className="panel kpi-card">
          <h3>Contenido archivado</h3>
          <p className="kpi-value">{loading ? "..." : countByState(meta, "archived")}</p>
        </article>
        <article className="panel kpi-card">
          <h3>Conectores en riesgo</h3>
          <p className="kpi-value">{loading ? "..." : unhealthy.length}</p>
        </article>
      </section>

      <section className="panel">
        <div className="section-title-row">
          <h3>Conectores con accion sugerida</h3>
          <button className="btn btn-outline" type="button" onClick={() => void load()} disabled={loading}>
            Refrescar
          </button>
        </div>

        {loading ? <p>Cargando indicadores...</p> : null}
        {!loading && connectors.length === 0 ? <p>No hay conectores configurados.</p> : null}

        {!loading ? (
          <ul className="simple-list simple-list--stacked">
            {connectors.map((connector) => (
              <li key={connector.id}>
                <div style={{ width: "100%", display: "grid", gap: 8 }}>
                  <div className="section-title-row">
                    <strong>{connector.provider}</strong>
                    <span>
                      {connector.enabled ? "enabled" : "disabled"} | {connector.health_status}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <span>ultima sync: {connector.last_sync_at ?? "n/a"}</span>
                    <span>freq: {connector.frequency_minutes} min</span>
                    <span>error: {connector.last_error ?? "none"}</span>
                  </div>

                  {canOperate ? (
                    <button className="btn btn-outline" type="button" onClick={() => void triggerSync(connector.id)}>
                      Ejecutar sync correctivo
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </section>
  );
};
