import { useEffect, useMemo, useState } from "react";
import {
  type AwarioAlertBinding,
  type AwarioQueryProfile,
  type Connector,
  type ConnectorSyncRun
} from "../api/client";
import { useApiClient } from "../api/useApiClient";
import { useAuth } from "../auth/AuthContext";

const toRunLabel = (run: ConnectorSyncRun): string => {
  const started = run.started_at ?? run.created_at;
  return `${run.status} | ${started}`;
};

type AwarioStatus = "active" | "paused" | "archived";

export const ConnectorsPage = () => {
  const client = useApiClient();
  const { session } = useAuth();
  const canOperate = useMemo(() => session?.role === "Admin" || session?.role === "Analyst", [session?.role]);
  const canManageAwario = useMemo(() => session?.role === "Admin", [session?.role]);

  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [runs, setRuns] = useState<ConnectorSyncRun[]>([]);
  const [selectedConnectorId, setSelectedConnectorId] = useState<string>("");
  const [frequencyDraft, setFrequencyDraft] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadingRuns, setLoadingRuns] = useState(false);

  const [awarioProfiles, setAwarioProfiles] = useState<AwarioQueryProfile[]>([]);
  const [awarioBindings, setAwarioBindings] = useState<AwarioAlertBinding[]>([]);
  const [loadingAwario, setLoadingAwario] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [newProfileQuery, setNewProfileQuery] = useState("");
  const [newProfileStatus, setNewProfileStatus] = useState<AwarioStatus>("active");
  const [newBindingProfileId, setNewBindingProfileId] = useState("");
  const [newBindingAlertId, setNewBindingAlertId] = useState("");
  const [newBindingStatus, setNewBindingStatus] = useState<AwarioStatus>("active");

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

  const loadAwarioConfig = async () => {
    setLoadingAwario(true);
    setError(null);
    try {
      const [profilesResponse, bindingsResponse] = await Promise.all([client.listAwarioProfiles(200), client.listAwarioBindings(200)]);
      const profiles = profilesResponse.items ?? [];
      setAwarioProfiles(profiles);
      setAwarioBindings(bindingsResponse.items ?? []);
      setNewBindingProfileId((current) => current || profiles[0]?.id || "");
    } catch (awarioError) {
      setError((awarioError as Error).message);
      setAwarioProfiles([]);
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
      await Promise.all([loadConnectors(), loadRuns(connectorId)]);
    } catch (syncError) {
      setError((syncError as Error).message);
    }
  };

  const createProfile = async () => {
    if (!canManageAwario) return;
    const name = newProfileName.trim();
    const queryText = newProfileQuery.trim();
    if (!name || !queryText) return;

    setError(null);
    try {
      await client.createAwarioProfile({
        name,
        query_text: queryText,
        status: newProfileStatus
      });
      setNewProfileName("");
      setNewProfileQuery("");
      setNewProfileStatus("active");
      await loadAwarioConfig();
    } catch (createError) {
      setError((createError as Error).message);
    }
  };

  const updateProfileStatus = async (profileId: string, status: AwarioStatus) => {
    if (!canManageAwario) return;
    setError(null);
    try {
      const updated = await client.patchAwarioProfile(profileId, { status });
      setAwarioProfiles((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (updateError) {
      setError((updateError as Error).message);
    }
  };

  const createBinding = async () => {
    if (!canManageAwario) return;
    const profileId = newBindingProfileId.trim();
    const awarioAlertId = newBindingAlertId.trim();
    if (!profileId || !awarioAlertId) return;

    setError(null);
    try {
      await client.createAwarioBinding({
        profile_id: profileId,
        awario_alert_id: awarioAlertId,
        status: newBindingStatus
      });
      setNewBindingAlertId("");
      setNewBindingStatus("active");
      await loadAwarioConfig();
    } catch (createError) {
      setError((createError as Error).message);
    }
  };

  const updateBindingStatus = async (bindingId: string, status: AwarioStatus) => {
    if (!canManageAwario) return;
    setError(null);
    try {
      const updated = await client.patchAwarioBinding(bindingId, { status });
      setAwarioBindings((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (updateError) {
      setError((updateError as Error).message);
    }
  };

  return (
    <section>
      <header className="page-header">
        <h2>Configuracion de Conectores</h2>
        <p>Operacion CLARO-037: salud, frecuencia, corridas manuales y mapeo Awario.</p>
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

      <section className="panel">
        <div className="section-title-row">
          <h3>Awario - Query Profiles</h3>
          <button className="btn btn-outline" type="button" onClick={() => void loadAwarioConfig()} disabled={loadingAwario}>
            Recargar
          </button>
        </div>

        {loadingAwario ? <p>Cargando perfiles y bindings Awario...</p> : null}

        {!loadingAwario && awarioProfiles.length === 0 ? <p>Sin perfiles configurados.</p> : null}

        {!loadingAwario && awarioProfiles.length > 0 ? (
          <div className="report-table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Estado</th>
                  <th>Query</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {awarioProfiles.map((profile) => (
                  <tr key={profile.id}>
                    <td>{profile.name}</td>
                    <td>{profile.status}</td>
                    <td>{profile.query_text.slice(0, 120)}</td>
                    <td>
                      {canManageAwario ? (
                        <select
                          value={profile.status}
                          onChange={(event) => void updateProfileStatus(profile.id, event.target.value as AwarioStatus)}
                        >
                          <option value="active">active</option>
                          <option value="paused">paused</option>
                          <option value="archived">archived</option>
                        </select>
                      ) : (
                        <span>Solo lectura</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {canManageAwario ? (
          <div className="form-grid" style={{ marginTop: 12 }}>
            <label>
              Nombre
              <input value={newProfileName} onChange={(event) => setNewProfileName(event.target.value)} placeholder="Marca + objetivo" />
            </label>
            <label>
              Status
              <select value={newProfileStatus} onChange={(event) => setNewProfileStatus(event.target.value as AwarioStatus)}>
                <option value="active">active</option>
                <option value="paused">paused</option>
                <option value="archived">archived</option>
              </select>
            </label>
            <label style={{ gridColumn: "1 / -1" }}>
              Query text
              <textarea value={newProfileQuery} onChange={(event) => setNewProfileQuery(event.target.value)} rows={3} placeholder='("claro" OR "claro colombia") AND ...' />
            </label>
            <div>
              <button className="btn btn-primary" type="button" onClick={() => void createProfile()}>
                Crear profile
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="panel">
        <div className="section-title-row">
          <h3>Awario - Alert Bindings</h3>
          <span>Mapeo profile - alert_id</span>
        </div>

        {!loadingAwario && awarioBindings.length === 0 ? <p>Sin bindings configurados.</p> : null}

        {!loadingAwario && awarioBindings.length > 0 ? (
          <div className="report-table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Profile</th>
                  <th>alert_id</th>
                  <th>Status</th>
                  <th>Validación</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {awarioBindings.map((binding) => (
                  <tr key={binding.id}>
                    <td>{binding.profile_name ?? binding.profile_id}</td>
                    <td>{binding.awario_alert_id}</td>
                    <td>
                      {canManageAwario ? (
                        <select
                          value={binding.status}
                          onChange={(event) => void updateBindingStatus(binding.id, event.target.value as AwarioStatus)}
                        >
                          <option value="active">active</option>
                          <option value="paused">paused</option>
                          <option value="archived">archived</option>
                        </select>
                      ) : (
                        binding.status
                      )}
                    </td>
                    <td>{binding.validation_status}</td>
                    <td>{binding.last_validation_error ?? "--"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {canManageAwario ? (
          <div className="form-grid" style={{ marginTop: 12 }}>
            <label>
              Profile
              <select value={newBindingProfileId} onChange={(event) => setNewBindingProfileId(event.target.value)}>
                <option value="">Selecciona...</option>
                {awarioProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select value={newBindingStatus} onChange={(event) => setNewBindingStatus(event.target.value as AwarioStatus)}>
                <option value="active">active</option>
                <option value="paused">paused</option>
                <option value="archived">archived</option>
              </select>
            </label>
            <label>
              alert_id Awario
              <input value={newBindingAlertId} onChange={(event) => setNewBindingAlertId(event.target.value)} placeholder="123456" />
            </label>
            <div>
              <button className="btn btn-primary" type="button" onClick={() => void createBinding()}>
                Crear binding
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </section>
  );
};
