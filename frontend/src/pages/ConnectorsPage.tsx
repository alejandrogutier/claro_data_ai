import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { type AwarioAlertBinding, type Connector, type ConnectorSyncRun } from "../api/client";
import { useApiClient } from "../api/useApiClient";
import { useAuth } from "../auth/AuthContext";

const toRunLabel = (run: ConnectorSyncRun): string => {
  const started = run.started_at ?? run.created_at;
  return `${run.status} | ${started}`;
};

const formatDateTime = (value: string | null | undefined): string => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
};

export const ConnectorsPage = () => {
  const client = useApiClient();
  const { session } = useAuth();
  const canOperate = useMemo(() => session?.role === "Admin" || session?.role === "Analyst", [session?.role]);

  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [runs, setRuns] = useState<ConnectorSyncRun[]>([]);
  const [selectedConnectorId, setSelectedConnectorId] = useState<string>("");
  const [frequencyDraft, setFrequencyDraft] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadingRuns, setLoadingRuns] = useState(false);

  const [awarioBindings, setAwarioBindings] = useState<AwarioAlertBinding[]>([]);
  const [loadingAwario, setLoadingAwario] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const selectedConnector = useMemo(
    () => connectors.find((item) => item.id === selectedConnectorId) ?? null,
    [connectors, selectedConnectorId]
  );

  const awarioSummary = useMemo(() => {
    const total = awarioBindings.length;
    const active = awarioBindings.filter((item) => item.status === "active").length;
    const pendingBackfill = awarioBindings.filter((item) => item.sync_state === "pending_backfill" || item.sync_state === "backfilling").length;
    const withError = awarioBindings.filter((item) => item.sync_state === "error").length;
    return { total, active, pendingBackfill, withError };
  }, [awarioBindings]);

  const loadConnectors = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await client.listConnectors(100);
      const items = response.items ?? [];
      setConnectors(items);
      setFrequencyDraft(
        items.reduce<Record<string, number>>((acc, item) => {
          acc[item.id] = item.frequency_minutes;
          return acc;
        }, {})
      );
      setSelectedConnectorId((current) => {
        if (current && items.some((item) => item.id === current)) return current;
        return items[0]?.id ?? "";
      });
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadRuns = async (connectorId: string) => {
    if (!connectorId) {
      setRuns([]);
      return;
    }

    setLoadingRuns(true);
    try {
      const response = await client.listConnectorRuns(connectorId, 20);
      setRuns(response.items ?? []);
    } catch (runsError) {
      setError((runsError as Error).message);
      setRuns([]);
    } finally {
      setLoadingRuns(false);
    }
  };

  const loadAwarioConfig = async () => {
    setLoadingAwario(true);
    try {
      const bindingsResponse = await client.listAwarioBindings(200);
      setAwarioBindings(bindingsResponse.items ?? []);
    } catch (awarioError) {
      setError((awarioError as Error).message);
      setAwarioBindings([]);
    } finally {
      setLoadingAwario(false);
    }
  };

  useEffect(() => {
    void loadConnectors();
    void loadAwarioConfig();
  }, []);

  useEffect(() => {
    void loadRuns(selectedConnectorId);
  }, [selectedConnectorId]);

  const updateConnector = async (connector: Connector, patch: { enabled?: boolean; frequency_minutes?: number }) => {
    if (!canOperate) return;
    setError(null);
    try {
      const updated = await client.patchConnector(connector.id, patch);
      setConnectors((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setFrequencyDraft((current) => ({
        ...current,
        [updated.id]: updated.frequency_minutes
      }));
    } catch (updateError) {
      setError((updateError as Error).message);
    }
  };

  const syncConnector = async (connectorId: string) => {
    if (!canOperate) return;
    setError(null);
    try {
      await client.triggerConnectorSync(connectorId);
      await Promise.all([loadConnectors(), loadRuns(connectorId), loadAwarioConfig()]);
    } catch (syncError) {
      setError((syncError as Error).message);
    }
  };

  return (
    <section>
      <header className="page-header">
        <h2>Configuracion de Conectores</h2>
        <p>Operacion de salud, frecuencia y corridas manuales. La vinculacion Awario se gestiona desde Configuracion de Queries.</p>
      </header>

      {error ? <div className="alert error">{error}</div> : null}

      <section className="panel">
        <div className="section-title-row">
          <h3>Conectores</h3>
          <button className="btn btn-outline" type="button" onClick={() => void loadConnectors()} disabled={loading}>
            Recargar
          </button>
        </div>

        {loading ? <p>Cargando conectores...</p> : null}

        {!loading ? (
          <ul className="simple-list simple-list--stacked">
            {connectors.map((connector) => (
              <li key={connector.id}>
                <div style={{ width: "100%", display: "grid", gap: 8 }}>
                  <div className="section-title-row">
                    <strong>{connector.provider}</strong>
                    <span>
                      estado: {connector.enabled ? "enabled" : "disabled"} | salud: {connector.health_status}
                    </span>
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <span>Frecuencia: {connector.frequency_minutes} min</span>
                    <span>Ultimo sync: {formatDateTime(connector.last_sync_at)}</span>
                    <span>p95: {connector.latency_p95_ms ?? "n/a"} ms</span>
                  </div>

                  {canOperate ? (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        className="btn btn-outline"
                        type="button"
                        onClick={() =>
                          void updateConnector(connector, {
                            enabled: !connector.enabled
                          })
                        }
                      >
                        {connector.enabled ? "Deshabilitar" : "Habilitar"}
                      </button>

                      <label className="inline-form" style={{ fontWeight: 600 }}>
                        <span>Frecuencia</span>
                        <input
                          type="number"
                          min={5}
                          max={1440}
                          value={frequencyDraft[connector.id] ?? connector.frequency_minutes}
                          onChange={(event) =>
                            setFrequencyDraft((current) => ({
                              ...current,
                              [connector.id]: Number.parseInt(event.target.value || String(connector.frequency_minutes), 10)
                            }))
                          }
                          style={{ width: 110 }}
                        />
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() =>
                            void updateConnector(connector, {
                              frequency_minutes: frequencyDraft[connector.id] ?? connector.frequency_minutes
                            })
                          }
                        >
                          Guardar
                        </button>
                      </label>

                      <button className="btn btn-primary" type="button" onClick={() => void syncConnector(connector.id)}>
                        Ejecutar sync
                      </button>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
            {connectors.length === 0 ? <li>Sin conectores configurados.</li> : null}
          </ul>
        ) : null}
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="section-title-row" style={{ alignItems: "center" }}>
          <h3>Runs del conector</h3>
          <select value={selectedConnectorId} onChange={(event) => setSelectedConnectorId(event.target.value)}>
            {connectors.map((connector) => (
              <option key={connector.id} value={connector.id}>
                {connector.provider}
              </option>
            ))}
          </select>
        </div>

        {selectedConnector ? (
          <p className="term-meta" style={{ marginTop: 8 }}>
            Historial para <strong>{selectedConnector.provider}</strong>
          </p>
        ) : null}

        {loadingRuns ? <p>Cargando runs...</p> : null}
        {!loadingRuns && runs.length === 0 ? <p>Sin ejecuciones registradas.</p> : null}

        {!loadingRuns && runs.length > 0 ? (
          <ul className="simple-list simple-list--stacked" style={{ marginTop: 10 }}>
            {runs.map((run) => (
              <li key={run.id}>
                <div style={{ display: "grid", gap: 4 }}>
                  <strong>{toRunLabel(run)}</strong>
                  <span className="term-meta">error: {run.error ?? "-"}</span>
                  <details>
                    <summary style={{ cursor: "pointer" }}>Metrics</summary>
                    <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{JSON.stringify(run.metrics ?? {}, null, 2)}</pre>
                  </details>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="section-title-row" style={{ alignItems: "center" }}>
          <h3>Awario (operativo)</h3>
          <div className="button-row">
            <button className="btn btn-outline" type="button" onClick={() => void loadAwarioConfig()} disabled={loadingAwario}>
              Recargar
            </button>
            <Link className="btn btn-primary" to="/app/config/queries?tab=awario">
              Ir a Vinculacion Awario
            </Link>
          </div>
        </div>

        <p style={{ marginTop: 8 }}>Vista read-only para estado operativo. La vinculacion y reintentos se hacen en Configuracion de Queries.</p>

        <div className="kpi-grid" style={{ marginTop: 12 }}>
          <article className="panel kpi-card" style={{ marginBottom: 0 }}>
            <span className="kpi-caption">Bindings</span>
            <strong className="kpi-value">{awarioSummary.total}</strong>
          </article>
          <article className="panel kpi-card" style={{ marginBottom: 0 }}>
            <span className="kpi-caption">Activos</span>
            <strong className="kpi-value">{awarioSummary.active}</strong>
          </article>
          <article className="panel kpi-card" style={{ marginBottom: 0 }}>
            <span className="kpi-caption">Backfill pendiente</span>
            <strong className="kpi-value">{awarioSummary.pendingBackfill}</strong>
          </article>
          <article className="panel kpi-card" style={{ marginBottom: 0 }}>
            <span className="kpi-caption">Con error</span>
            <strong className="kpi-value">{awarioSummary.withError}</strong>
          </article>
        </div>

        {loadingAwario ? <p style={{ marginTop: 12 }}>Cargando bindings Awario...</p> : null}
        {!loadingAwario && awarioBindings.length === 0 ? <p style={{ marginTop: 12 }}>Sin bindings configurados.</p> : null}

        {!loadingAwario && awarioBindings.length > 0 ? (
          <div className="incident-table-wrapper" style={{ marginTop: 12 }}>
            <table className="incident-table">
              <thead>
                <tr>
                  <th>alert_id</th>
                  <th>estado</th>
                  <th>sync_state</th>
                  <th>ultimo sync</th>
                  <th>error</th>
                </tr>
              </thead>
              <tbody>
                {awarioBindings.slice(0, 50).map((binding) => (
                  <tr key={binding.id}>
                    <td>{binding.awario_alert_id}</td>
                    <td>{binding.status}</td>
                    <td>{binding.sync_state}</td>
                    <td>{formatDateTime(binding.last_sync_at)}</td>
                    <td>{binding.last_sync_error ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </section>
  );
};
