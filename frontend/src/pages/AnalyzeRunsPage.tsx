import { useEffect, useMemo, useState } from "react";
import {
  ApiError,
  type AnalysisRun,
  type AnalysisRunScope,
  type AnalysisRunStatus,
  type AnalysisSourceType,
  type CreateAnalysisRunRequest
} from "../api/client";
import { useApiClient } from "../api/useApiClient";
import { useAuth } from "../auth/AuthContext";

type UiState = "idle" | "loading" | "empty" | "partial_data" | "permission_denied" | "error_retriable" | "error_non_retriable";

const ANALYSIS_STATUSES: Array<AnalysisRunStatus | ""> = ["", "queued", "running", "completed", "failed"];
const ANALYSIS_SCOPES: Array<AnalysisRunScope | ""> = ["", "overview", "channel", "competitors", "custom"];

const toUiStateFromError = (error: unknown): UiState => {
  if (error instanceof ApiError) {
    if (error.status === 403) return "permission_denied";
    if (error.status >= 500) return "error_retriable";
    return "error_non_retriable";
  }
  return "error_retriable";
};

const toIso = (value: string): string | undefined => {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
};

export const AnalyzeRunsPage = () => {
  const client = useApiClient();
  const { session } = useAuth();
  const canOperate = useMemo(() => session?.role === "Admin" || session?.role === "Analyst", [session?.role]);

  const [items, setItems] = useState<AnalysisRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);

  const [statusFilter, setStatusFilter] = useState<AnalysisRunStatus | "">("");
  const [scopeFilter, setScopeFilter] = useState<AnalysisRunScope | "">("");

  const [scopeDraft, setScopeDraft] = useState<AnalysisRunScope>("overview");
  const [sourceTypeDraft, setSourceTypeDraft] = useState<AnalysisSourceType>("news");
  const [promptDraft, setPromptDraft] = useState("analysis-v1");
  const [modelDraft, setModelDraft] = useState("");
  const [limitDraft, setLimitDraft] = useState("120");
  const [providerDraft, setProviderDraft] = useState("");
  const [categoryDraft, setCategoryDraft] = useState("");
  const [sentimientoDraft, setSentimientoDraft] = useState("");
  const [queryDraft, setQueryDraft] = useState("");
  const [fromDraft, setFromDraft] = useState("");
  const [toDraft, setToDraft] = useState("");

  const [uiState, setUiState] = useState<UiState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const load = async () => {
    setUiState("loading");
    setError(null);

    try {
      const response = await client.listAnalysisHistory({
        limit: 80,
        status: statusFilter || undefined,
        scope: scopeFilter || undefined
      });
      const rows = response.items ?? [];
      setItems(rows);
      setSelectedRunId((current) => {
        if (current && rows.some((row) => row.id === current)) return current;
        return rows[0]?.id ?? "";
      });

      if (rows.length === 0) {
        setUiState("empty");
      } else if (rows.some((row) => row.status === "failed")) {
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
      const response = await client.getAnalysisRun(runId);
      setDetail(response as Record<string, unknown>);
    } catch (detailError) {
      setDetail(null);
      setError((detailError as Error).message);
      setUiState(toUiStateFromError(detailError));
    }
  };

  useEffect(() => {
    void load();
  }, [statusFilter, scopeFilter]);

  useEffect(() => {
    void loadDetail(selectedRunId);
  }, [selectedRunId]);

  const triggerRun = async () => {
    if (!canOperate) return;
    const parsedLimit = Number.parseInt(limitDraft, 10);
    if (!Number.isFinite(parsedLimit) || parsedLimit < 1 || parsedLimit > 500) {
      setUiState("error_non_retriable");
      setError("limit debe estar entre 1 y 500");
      return;
    }

    const payload: CreateAnalysisRunRequest = {
      scope: scopeDraft,
      source_type: sourceTypeDraft,
      trigger_type: "manual",
      prompt_version: promptDraft.trim() || "analysis-v1",
      model_id: modelDraft.trim() || undefined,
      limit: parsedLimit,
      filters: {
        provider: providerDraft.trim() || undefined,
        category: categoryDraft.trim() || undefined,
        sentimiento: sentimientoDraft.trim() || undefined,
        q: queryDraft.trim() || undefined,
        from: toIso(fromDraft),
        to: toIso(toDraft)
      }
    };

    setRunning(true);
    setError(null);

    try {
      const accepted = await client.createAnalysisRun(payload);
      await load();
      if (accepted.analysis_run_id) {
        setSelectedRunId(accepted.analysis_run_id);
      }
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
        <h2>Analysis Runs Async</h2>
        <p>Disparo manual, historial y detalle de corridas `/v1/analysis/*` sobre worker SQS + Bedrock.</p>
      </header>

      {uiState === "loading" ? <div className="alert info">loading: consultando corridas de analisis...</div> : null}
      {uiState === "empty" ? <div className="alert info">empty: aun no existen corridas de analisis.</div> : null}
      {uiState === "partial_data" ? <div className="alert warning">partial_data: hay corridas `failed` en historial reciente.</div> : null}
      {uiState === "permission_denied" ? <div className="alert error">permission_denied: tu rol no tiene acceso.</div> : null}
      {uiState === "error_retriable" ? <div className="alert error">error_retriable: {error ?? "intenta nuevamente"}</div> : null}
      {uiState === "error_non_retriable" ? <div className="alert error">error_non_retriable: {error ?? "revisa la solicitud"}</div> : null}

      <section className="panel">
        <div className="section-title-row">
          <h3>Disparo manual</h3>
          <button className="btn btn-outline" type="button" onClick={() => void load()} disabled={running || uiState === "loading"}>
            Refrescar historial
          </button>
        </div>

        <div className="form-grid">
          <label>
            Scope
            <select value={scopeDraft} onChange={(event) => setScopeDraft(event.target.value as AnalysisRunScope)}>
              <option value="overview">overview</option>
              <option value="channel">channel</option>
              <option value="competitors">competitors</option>
              <option value="custom">custom</option>
            </select>
          </label>
          <label>
            Source Type
            <select value={sourceTypeDraft} onChange={(event) => setSourceTypeDraft(event.target.value as AnalysisSourceType)}>
              <option value="news">news</option>
              <option value="social">social</option>
            </select>
          </label>
          <label>
            Prompt Version
            <input value={promptDraft} onChange={(event) => setPromptDraft(event.target.value)} />
          </label>
          <label>
            Model ID (opcional)
            <input value={modelDraft} onChange={(event) => setModelDraft(event.target.value)} placeholder="usa default runtime" />
          </label>
          <label>
            Limit
            <input type="number" min={1} max={500} value={limitDraft} onChange={(event) => setLimitDraft(event.target.value)} />
          </label>
          <label>
            Provider
            <input value={providerDraft} onChange={(event) => setProviderDraft(event.target.value)} />
          </label>
          <label>
            Category
            <input value={categoryDraft} onChange={(event) => setCategoryDraft(event.target.value)} />
          </label>
          <label>
            Sentimiento
            <input value={sentimientoDraft} onChange={(event) => setSentimientoDraft(event.target.value)} />
          </label>
          <label style={{ gridColumn: "1 / -1" }}>
            Query
            <input value={queryDraft} onChange={(event) => setQueryDraft(event.target.value)} />
          </label>
          <label>
            From
            <input type="datetime-local" value={fromDraft} onChange={(event) => setFromDraft(event.target.value)} />
          </label>
          <label>
            To
            <input type="datetime-local" value={toDraft} onChange={(event) => setToDraft(event.target.value)} />
          </label>
          <div style={{ display: "flex", alignItems: "end" }}>
            <button className="btn btn-primary" type="button" onClick={() => void triggerRun()} disabled={!canOperate || running}>
              {running ? "Encolando..." : "Crear corrida"}
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-title-row">
          <h3>Historial</h3>
          <span>{items.length} corridas</span>
        </div>

        <div className="form-grid" style={{ marginBottom: 10 }}>
          <label>
            Filtro status
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as AnalysisRunStatus | "")}>
              {ANALYSIS_STATUSES.map((status) => (
                <option key={status || "all"} value={status}>
                  {status || "Todos"}
                </option>
              ))}
            </select>
          </label>
          <label>
            Filtro scope
            <select value={scopeFilter} onChange={(event) => setScopeFilter(event.target.value as AnalysisRunScope | "")}>
              {ANALYSIS_SCOPES.map((scope) => (
                <option key={scope || "all"} value={scope}>
                  {scope || "Todos"}
                </option>
              ))}
            </select>
          </label>
        </div>

        {items.length > 0 ? (
          <div className="report-table-wrapper">
            <table className="report-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Scope</th>
                  <th>Input</th>
                  <th>Modelo</th>
                  <th>Creado</th>
                  <th>Completado</th>
                  <th>Accion</th>
                </tr>
              </thead>
              <tbody>
                {items.map((run) => (
                  <tr key={run.id} className={selectedRunId === run.id ? "is-selected" : undefined}>
                    <td>
                      <span className={`report-status report-status-${run.status}`}>{run.status}</span>
                    </td>
                    <td>{run.scope}</td>
                    <td>{run.input_count}</td>
                    <td>{run.model_id}</td>
                    <td>{run.created_at}</td>
                    <td>{run.completed_at ?? "-"}</td>
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
          <h3>Detalle</h3>
          <span>{selectedRunId || "Selecciona una corrida"}</span>
        </div>
        {!detail ? <p>Sin detalle cargado.</p> : <pre className="code-block">{JSON.stringify(detail, null, 2)}</pre>}
      </section>
    </section>
  );
};
