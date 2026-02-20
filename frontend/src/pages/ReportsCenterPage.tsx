import { useEffect, useMemo, useState } from "react";
import { ApiError, type ReportRun, type ReportRunStatus, type ReportTemplate } from "../api/client";
import { useApiClient } from "../api/useApiClient";
import { useAuth } from "../auth/AuthContext";

type UiState = "idle" | "loading" | "empty" | "partial_data" | "permission_denied" | "error_retriable" | "error_non_retriable";

const REPORT_STATUSES: Array<ReportRunStatus | ""> = ["", "queued", "running", "completed", "pending_review", "failed"];

const toUiStateFromError = (error: unknown): UiState => {
  if (error instanceof ApiError) {
    if (error.status === 403) return "permission_denied";
    if (error.status >= 500) return "error_retriable";
    return "error_non_retriable";
  }
  return "error_retriable";
};

const statusLabel = (status: ReportRunStatus): string => {
  if (status === "pending_review") return "pending review";
  return status;
};

export const ReportsCenterPage = () => {
  const client = useApiClient();
  const { session } = useAuth();

  const canOperate = useMemo(() => session?.role === "Admin" || session?.role === "Analyst", [session?.role]);

  const [items, setItems] = useState<ReportRun[]>([]);
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [statusFilter, setStatusFilter] = useState<ReportRunStatus | "">("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [uiState, setUiState] = useState<UiState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const load = async () => {
    setUiState("loading");
    setError(null);

    try {
      const [center, templateResponse] = await Promise.all([
        client.listReportsCenter({ limit: 80, status: statusFilter || undefined }),
        client.listReportTemplates(200)
      ]);

      const runs = center.items ?? [];
      setItems(runs);
      const templateItems = templateResponse.items ?? [];
      setTemplates(templateItems);
      setSelectedTemplateId((current) => {
        if (current && templateItems.some((item) => item.id === current)) return current;
        return templateItems[0]?.id ?? "";
      });
      setSelectedRunId((current) => {
        if (current && runs.some((item) => item.id === current)) return current;
        return runs[0]?.id ?? "";
      });

      if (runs.length === 0) {
        setUiState("empty");
      } else if (runs.some((run) => run.status === "pending_review" || run.status === "failed")) {
        setUiState("partial_data");
      } else {
        setUiState("idle");
      }
    } catch (loadError) {
      setError((loadError as Error).message);
      setUiState(toUiStateFromError(loadError));
    }
  };

  const loadDetail = async (runId: string) => {
    if (!runId) {
      setDetail(null);
      return;
    }

    try {
      const response = await client.getReportRun(runId);
      setDetail(response as Record<string, unknown>);
    } catch (detailError) {
      setDetail(null);
      setError((detailError as Error).message);
      setUiState(toUiStateFromError(detailError));
    }
  };

  useEffect(() => {
    void load();
  }, [statusFilter]);

  useEffect(() => {
    void loadDetail(selectedRunId);
  }, [selectedRunId]);

  const triggerRun = async () => {
    if (!canOperate || !selectedTemplateId) return;

    setRunning(true);
    setError(null);

    try {
      await client.createReportRun({ template_id: selectedTemplateId });
      await load();
    } catch (runError) {
      setError((runError as Error).message);
      setUiState(toUiStateFromError(runError));
    } finally {
      setRunning(false);
    }
  };

  return (
    <section>
      <header className="page-header">
        <h2>Centro de Reportes</h2>
        <p>Historial operativo de corridas, estado editorial (`pending_review`) y descarga de exportes asociados.</p>
      </header>

      {uiState === "loading" ? <div className="alert info">loading: consultando corridas de reportes...</div> : null}
      {uiState === "empty" ? <div className="alert info">empty: aun no existen corridas de reportes.</div> : null}
      {uiState === "partial_data" ? (
        <div className="alert warning">partial_data: hay corridas en `pending_review` o `failed`; revisar detalle antes de distribuir.</div>
      ) : null}
      {uiState === "permission_denied" ? (
        <div className="alert error">permission_denied: tu rol no tiene acceso a este recurso.</div>
      ) : null}
      {uiState === "error_retriable" ? <div className="alert error">error_retriable: {error ?? "intenta nuevamente"}</div> : null}
      {uiState === "error_non_retriable" ? <div className="alert error">error_non_retriable: {error ?? "revisa la solicitud"}</div> : null}

      <section className="panel">
        <div className="section-title-row">
          <h3>Controles</h3>
          <button className="btn btn-outline" type="button" onClick={() => void load()} disabled={running || uiState === "loading"}>
            Refrescar
          </button>
        </div>

        <div className="form-grid">
          <label>
            Estado
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ReportRunStatus | "")}> 
              {REPORT_STATUSES.map((status) => (
                <option key={status || "all"} value={status}>
                  {status ? statusLabel(status) : "Todos"}
                </option>
              ))}
            </select>
          </label>

          <label>
            Plantilla para corrida manual
            <select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)}>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>

          <div style={{ display: "flex", alignItems: "end" }}>
            <button className="btn btn-primary" type="button" disabled={!canOperate || running || !selectedTemplateId} onClick={() => void triggerRun()}>
              {running ? "Encolando..." : "Ejecutar corrida manual"}
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-title-row">
          <h3>Historial</h3>
          <span>{items.length} corridas</span>
        </div>

        {items.length > 0 ? (
          <div className="report-table-wrapper">
            <table className="report-table">
              <thead>
                <tr>
                  <th>Estado</th>
                  <th>Plantilla</th>
                  <th>Confianza</th>
                  <th>Creado</th>
                  <th>Completado</th>
                  <th>Export</th>
                  <th>Accion</th>
                </tr>
              </thead>
              <tbody>
                {items.map((run) => (
                  <tr key={run.id} className={selectedRunId === run.id ? "is-selected" : undefined}>
                    <td>
                      <span className={`report-status report-status-${run.status}`}>{statusLabel(run.status)}</span>
                    </td>
                    <td>{run.template_name}</td>
                    <td>{typeof run.confidence === "number" ? `${(run.confidence * 100).toFixed(1)}%` : "n/a"}</td>
                    <td>{run.created_at}</td>
                    <td>{run.completed_at ?? "-"}</td>
                    <td>
                      {run.download_url ? (
                        <a href={run.download_url} target="_blank" rel="noreferrer">
                          Descargar CSV
                        </a>
                      ) : (
                        run.export_status ?? "-"
                      )}
                    </td>
                    <td>
                      <button className="btn btn-outline" type="button" onClick={() => setSelectedRunId(run.id)}>
                        Ver detalle
                      </button>
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
          <h3>Detalle de corrida</h3>
          <span>{selectedRunId ? selectedRunId : "Selecciona una corrida"}</span>
        </div>

        {!detail ? <p>Sin detalle cargado.</p> : <pre className="code-block">{JSON.stringify(detail, null, 2)}</pre>}
      </section>
    </section>
  );
};
