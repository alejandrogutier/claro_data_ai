import { useEffect, useMemo, useState } from "react";
import { type Incident, type IncidentNote, type IncidentSeverity, type IncidentStatus } from "../api/client";
import { useApiClient } from "../api/useApiClient";
import { useAuth } from "../auth/AuthContext";

const STATUS_OPTIONS: IncidentStatus[] = ["open", "acknowledged", "in_progress", "resolved", "dismissed"];
const SEVERITY_OPTIONS: IncidentSeverity[] = ["SEV1", "SEV2", "SEV3", "SEV4"];

const formatSla = (minutes: number): string => {
  if (minutes < 0) return `${Math.abs(minutes)}m vencido`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours <= 0) return `${remainingMinutes}m`;
  return `${hours}h ${remainingMinutes}m`;
};

const slaClassName = (minutes: number): string => {
  if (minutes < 0) return "incident-sla incident-sla-overdue";
  if (minutes <= 30) return "incident-sla incident-sla-critical";
  if (minutes <= 4 * 60) return "incident-sla incident-sla-warning";
  return "incident-sla incident-sla-ok";
};

const toStatusLabel = (status: IncidentStatus): string => {
  if (status === "in_progress") return "in progress";
  return status;
};

export const IncidentsPage = () => {
  const client = useApiClient();
  const { session } = useAuth();

  const canOperate = useMemo(() => session?.role === "Admin" || session?.role === "Analyst", [session?.role]);

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string>("");
  const [notes, setNotes] = useState<IncidentNote[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [filters, setFilters] = useState<{ status?: IncidentStatus; severity?: IncidentSeverity; scope?: "claro" | "competencia" }>({});
  const [loadingIncidents, setLoadingIncidents] = useState(true);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [runningEvaluate, setRunningEvaluate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedIncident = useMemo(
    () => incidents.find((incident) => incident.id === selectedIncidentId) ?? null,
    [incidents, selectedIncidentId]
  );

  const loadIncidents = async () => {
    setLoadingIncidents(true);
    setError(null);

    try {
      const response = await client.listMonitorIncidents({
        limit: 80,
        scope: filters.scope,
        severity: filters.severity,
        status: filters.status
      });
      const items = response.items ?? [];
      setIncidents(items);
      setSelectedIncidentId((current) => {
        if (current && items.some((item) => item.id === current)) return current;
        return items[0]?.id ?? "";
      });
    } catch (loadError) {
      setError((loadError as Error).message);
      setIncidents([]);
    } finally {
      setLoadingIncidents(false);
    }
  };

  const loadNotes = async (incidentId: string) => {
    if (!incidentId) {
      setNotes([]);
      return;
    }

    setLoadingNotes(true);
    setError(null);

    try {
      const response = await client.listMonitorIncidentNotes(incidentId, 100);
      setNotes(response.items ?? []);
    } catch (notesError) {
      setError((notesError as Error).message);
      setNotes([]);
    } finally {
      setLoadingNotes(false);
    }
  };

  useEffect(() => {
    void loadIncidents();
  }, [filters.scope, filters.severity, filters.status]);

  useEffect(() => {
    void loadNotes(selectedIncidentId);
  }, [selectedIncidentId]);

  const triggerEvaluation = async () => {
    if (!canOperate) return;
    setRunningEvaluate(true);
    setError(null);

    try {
      await client.evaluateMonitorIncidents();
      await loadIncidents();
    } catch (evaluateError) {
      setError((evaluateError as Error).message);
    } finally {
      setRunningEvaluate(false);
    }
  };

  const assignToMe = async (incidentId: string) => {
    if (!canOperate || !session?.sub) return;

    setError(null);
    try {
      await client.patchMonitorIncident(incidentId, { owner_user_id: session.sub });
      await Promise.all([loadIncidents(), loadNotes(incidentId)]);
    } catch (assignError) {
      setError((assignError as Error).message);
    }
  };

  const changeStatus = async (incidentId: string, status: IncidentStatus) => {
    if (!canOperate) return;

    setError(null);
    try {
      await client.patchMonitorIncident(incidentId, { status });
      await Promise.all([loadIncidents(), loadNotes(incidentId)]);
    } catch (statusError) {
      setError((statusError as Error).message);
    }
  };

  const submitNote = async () => {
    if (!canOperate || !selectedIncidentId) return;

    const trimmed = noteDraft.trim();
    if (!trimmed) return;

    setError(null);
    try {
      await client.createMonitorIncidentNote(selectedIncidentId, {
        note: trimmed
      });
      setNoteDraft("");
      await Promise.all([loadIncidents(), loadNotes(selectedIncidentId)]);
    } catch (noteError) {
      setError((noteError as Error).message);
    }
  };

  return (
    <section>
      <header className="page-header">
        <h2>Incidentes y Alertas</h2>
        <p>Triage operativo por scope (`claro|competencia`) con SLA visible y notas auditables.</p>
      </header>

      {error ? <div className="alert error">{error}</div> : null}

      <section className="panel">
        <div className="section-title-row">
          <h3>Control de evaluacion</h3>
          <button className="btn btn-outline" type="button" onClick={() => void loadIncidents()} disabled={loadingIncidents}>
            Refrescar
          </button>
        </div>

        <div className="form-grid">
          <label>
            Scope
            <select
              value={filters.scope ?? ""}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  scope: (event.target.value as "claro" | "competencia" | "") || undefined
                }))
              }
            >
              <option value="">Todos</option>
              <option value="claro">claro</option>
              <option value="competencia">competencia</option>
            </select>
          </label>

          <label>
            Severidad
            <select
              value={filters.severity ?? ""}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  severity: (event.target.value as IncidentSeverity | "") || undefined
                }))
              }
            >
              <option value="">Todas</option>
              {SEVERITY_OPTIONS.map((severity) => (
                <option key={severity} value={severity}>
                  {severity}
                </option>
              ))}
            </select>
          </label>

          <label>
            Estado
            <select
              value={filters.status ?? ""}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  status: (event.target.value as IncidentStatus | "") || undefined
                }))
              }
            >
              <option value="">Todos</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {toStatusLabel(status)}
                </option>
              ))}
            </select>
          </label>

          <div style={{ display: "flex", alignItems: "end" }}>
            <button className="btn btn-primary" type="button" disabled={!canOperate || runningEvaluate} onClick={() => void triggerEvaluation()}>
              {runningEvaluate ? "Evaluando..." : "Evaluar incidentes"}
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-title-row">
          <h3>Incidentes</h3>
          <span>{loadingIncidents ? "Cargando..." : `${incidents.length} registros`}</span>
        </div>

        {!loadingIncidents && incidents.length === 0 ? <p>No hay incidentes para los filtros seleccionados.</p> : null}

        {!loadingIncidents && incidents.length > 0 ? (
          <div className="incident-table-wrapper">
            <table className="incident-table">
              <thead>
                <tr>
                  <th>Severidad</th>
                  <th>Scope</th>
                  <th>Owner</th>
                  <th>Estado</th>
                  <th>SLA restante</th>
                  <th>Actualizado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((incident) => (
                  <tr key={incident.id} className={selectedIncidentId === incident.id ? "is-selected" : undefined}>
                    <td>
                      <span className={`severity-chip severity-${incident.severity.toLowerCase()}`}>{incident.severity}</span>
                    </td>
                    <td>{incident.scope}</td>
                    <td>{incident.owner?.name ?? incident.owner?.email ?? incident.owner_user_id ?? "sin asignar"}</td>
                    <td>
                      {canOperate ? (
                        <select
                          value={incident.status}
                          onChange={(event) => void changeStatus(incident.id, event.target.value as IncidentStatus)}
                        >
                          {STATUS_OPTIONS.map((status) => (
                            <option key={status} value={status}>
                              {toStatusLabel(status)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        toStatusLabel(incident.status)
                      )}
                    </td>
                    <td>
                      <span className={slaClassName(incident.sla_remaining_minutes)}>{formatSla(incident.sla_remaining_minutes)}</span>
                    </td>
                    <td>{incident.updated_at}</td>
                    <td>
                      <div className="incident-actions">
                        <button className="btn btn-outline" type="button" onClick={() => setSelectedIncidentId(incident.id)}>
                          Ver
                        </button>
                        {canOperate ? (
                          <button className="btn btn-outline" type="button" onClick={() => void assignToMe(incident.id)}>
                            Asignarme
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="panel">
        <div className="section-title-row">
          <h3>Notas del incidente</h3>
          <span>{selectedIncident ? `Incidente ${selectedIncident.id}` : "Selecciona un incidente"}</span>
        </div>

        {loadingNotes ? <p>Cargando notas...</p> : null}
        {!loadingNotes && selectedIncident && notes.length === 0 ? <p>Sin notas registradas.</p> : null}

        {!loadingNotes && notes.length > 0 ? (
          <ul className="simple-list simple-list--stacked">
            {notes.map((note) => (
              <li key={note.id}>
                <div style={{ width: "100%", display: "grid", gap: 4 }}>
                  <strong>{note.author.name ?? note.author.email ?? note.author_user_id}</strong>
                  <span className="kpi-caption">{note.created_at}</span>
                  <span>{note.note}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {canOperate && selectedIncident ? (
          <div className="incident-note-composer">
            <label>
              Agregar nota
              <textarea
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                maxLength={2000}
                rows={4}
                placeholder="Contexto, accion tomada y siguiente paso"
              />
            </label>
            <button className="btn btn-primary" type="button" onClick={() => void submitNote()}>
              Guardar nota
            </button>
          </div>
        ) : null}
      </section>
    </section>
  );
};
