import { useEffect, useMemo, useState } from "react";
import { type Connector, type ConnectorSyncRun } from "../api/client";
import { useApiClient } from "../api/useApiClient";
import { useAuth } from "../auth/AuthContext";

const toRunLabel = (run: ConnectorSyncRun): string => {
  const started = run.started_at ?? run.created_at;
  return `${run.status} | ${started}`;
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
  const [error, setError] = useState<string | null>(null);

  const selectedConnector = useMemo(
    () => connectors.find((item) => item.id === selectedConnectorId) ?? null,
    [connectors, selectedConnectorId]
  );

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

  useEffect(() => {
    void loadConnectors();
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
      await Promise.all([loadConnectors(), loadRuns(connectorId)]);
    } catch (syncError) {
      setError((syncError as Error).message);
    }
  };

  return (
    <section>
      <header className="page-header">
        <h2>Configuracion de Conectores</h2>
        <p>Operacion CLARO-037: salud, frecuencia y corridas manuales por conector.</p>
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
                    <span>Ultimo sync: {connector.last_sync_at ?? "n/a"}</span>
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
                              [connector.id]: Math.max(5, Number.parseInt(event.target.value || "15", 10))
                            }))
                          }
                        />
                        <button
                          className="btn btn-primary"
                          type="button"
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
                        Sync manual
                      </button>
                    </div>
                  ) : null}

                  <button
                    className="btn btn-outline"
                    type="button"
                    onClick={() => setSelectedConnectorId(connector.id)}
                    disabled={selectedConnectorId === connector.id}
                  >
                    Ver corridas
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="panel">
        <div className="section-title-row">
          <h3>Historial de corridas</h3>
          <span>{selectedConnector ? `Conector: ${selectedConnector.provider}` : "Selecciona un conector"}</span>
        </div>

        {loadingRuns ? <p>Cargando corridas...</p> : null}
        {!loadingRuns && runs.length === 0 ? <p>Sin corridas registradas.</p> : null}

        {!loadingRuns && runs.length > 0 ? (
          <ul className="simple-list">
            {runs.map((run) => (
              <li key={run.id}>
                <span>{toRunLabel(run)}</span>
                <strong>{run.error ?? "ok"}</strong>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </section>
  );
};
