import { useEffect, useMemo, useState } from "react";
import {
  ApiError,
  type CreateNotificationRecipientRequest,
  type NotificationEmailStatusResponse,
  type NotificationRecipient,
  type NotificationRecipientKind,
  type UpdateNotificationRecipientRequest
} from "../api/client";
import { useApiClient } from "../api/useApiClient";
import { useAuth } from "../auth/AuthContext";

type UiState = "idle" | "loading" | "empty" | "partial_data" | "permission_denied" | "error_retriable" | "error_non_retriable";

const toUiStateFromError = (error: unknown): UiState => {
  if (error instanceof ApiError) {
    if (error.status === 403) return "permission_denied";
    if (error.status >= 500) return "error_retriable";
    return "error_non_retriable";
  }
  return "error_retriable";
};

const renderRecipientEmail = (item: NotificationRecipient): string => item.email ?? item.email_masked ?? "(oculto)";

export const NotificationRecipientsPage = () => {
  const client = useApiClient();
  const { session } = useAuth();

  const canManage = useMemo(() => session?.role === "Admin", [session?.role]);
  const canView = useMemo(() => session?.role === "Admin" || session?.role === "Analyst", [session?.role]);

  const [kind, setKind] = useState<NotificationRecipientKind>("digest");
  const [scopeFilter, setScopeFilter] = useState("ops");
  const [includeInactive, setIncludeInactive] = useState(false);

  const [items, setItems] = useState<NotificationRecipient[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const selected = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);

  const [emailDraft, setEmailDraft] = useState("");
  const [scopeDraft, setScopeDraft] = useState("ops");
  const [isActiveDraft, setIsActiveDraft] = useState(true);

  const [uiState, setUiState] = useState<UiState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [sesStatus, setSesStatus] = useState<NotificationEmailStatusResponse | null>(null);
  const [sesError, setSesError] = useState<string | null>(null);

  const hydrateDraft = (item: NotificationRecipient | null) => {
    if (!item) {
      setEmailDraft("");
      setScopeDraft(scopeFilter.trim().toLowerCase() || "ops");
      setIsActiveDraft(true);
      return;
    }

    setEmailDraft((item.email ?? "").trim());
    setScopeDraft((item.scope ?? "ops").trim());
    setIsActiveDraft(Boolean(item.is_active));
  };

  const load = async () => {
    setUiState("loading");
    setError(null);
    setSesError(null);

    const scope = scopeFilter.trim().toLowerCase();

    try {
      const [recipientsResponse, statusResponse] = await Promise.all([
        client.listNotificationRecipients({
          kind,
          scope: scope || undefined,
          include_inactive: includeInactive,
          limit: 200
        }),
        client
          .getNotificationEmailStatus()
          .then((value) => value)
          .catch((statusError) => {
            setSesError((statusError as Error).message);
            return null;
          })
      ]);

      const rows = recipientsResponse.items ?? [];
      setItems(rows);
      setSesStatus(statusResponse);
      setSelectedId((current) => {
        if (current && rows.some((row) => row.id === current)) return current;
        return rows[0]?.id ?? "";
      });

      if (rows.length === 0) {
        setUiState("empty");
      } else if (rows.some((row) => row.is_active === false)) {
        setUiState("partial_data");
      } else {
        setUiState("idle");
      }
    } catch (loadError) {
      setError((loadError as Error).message);
      setUiState(toUiStateFromError(loadError));
    }
  };

  useEffect(() => {
    if (!canView) {
      setUiState("permission_denied");
      return;
    }
    void load();
  }, [kind, includeInactive]);

  useEffect(() => {
    hydrateDraft(selected);
  }, [selected]);

  const createRecipient = async () => {
    if (!canManage) return;

    const email = emailDraft.trim().toLowerCase();
    const scope = scopeDraft.trim().toLowerCase() || "ops";
    if (!email || !email.includes("@")) {
      setUiState("error_non_retriable");
      setError("email es obligatorio y debe ser valido");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload: CreateNotificationRecipientRequest = {
        kind,
        scope,
        email,
        is_active: isActiveDraft
      };
      await client.createNotificationRecipient(payload);
      await load();
    } catch (saveError) {
      setError((saveError as Error).message);
      setUiState(toUiStateFromError(saveError));
    } finally {
      setSaving(false);
    }
  };

  const updateRecipient = async () => {
    if (!canManage || !selected) return;

    const email = emailDraft.trim().toLowerCase();
    const scope = scopeDraft.trim().toLowerCase() || "ops";
    if (!email || !email.includes("@")) {
      setUiState("error_non_retriable");
      setError("email es obligatorio y debe ser valido");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload: UpdateNotificationRecipientRequest = {
        scope,
        email,
        is_active: isActiveDraft
      };
      await client.patchNotificationRecipient(selected.id, payload);
      await load();
    } catch (saveError) {
      setError((saveError as Error).message);
      setUiState(toUiStateFromError(saveError));
    } finally {
      setSaving(false);
    }
  };

  const isSandbox = sesStatus ? !sesStatus.production_access_enabled : null;

  return (
    <section>
      <header className="page-header">
        <h2>Notificaciones: Recipients</h2>
        <p>Catalogo en DB para recipients de digest e incidentes, con gobernanza Admin y visibilidad enmascarada para Analyst.</p>
      </header>

      {uiState === "loading" ? <div className="alert info">loading: consultando recipients...</div> : null}
      {uiState === "empty" ? <div className="alert info">empty: no existen recipients configurados.</div> : null}
      {uiState === "partial_data" ? <div className="alert warning">partial_data: hay recipients inactivos en el catalogo.</div> : null}
      {uiState === "permission_denied" ? <div className="alert error">permission_denied: tu rol no tiene acceso.</div> : null}
      {uiState === "error_retriable" ? <div className="alert error">error_retriable: {error ?? "intenta nuevamente"}</div> : null}
      {uiState === "error_non_retriable" ? <div className="alert error">error_non_retriable: {error ?? "revisa los datos"}</div> : null}

      <section className="panel">
        <div className="section-title-row">
          <h3>Estado SES</h3>
          <button className="btn btn-outline" type="button" onClick={() => void load()} disabled={saving || uiState === "loading"}>
            Refrescar
          </button>
        </div>

        {!sesStatus && sesError ? <div className="alert error">error_retriable: {sesError}</div> : null}
        {!sesStatus && !sesError ? <p>Cargando estado SES...</p> : null}

        {sesStatus ? (
          <div style={{ display: "grid", gap: 6 }}>
            <p>
              SES: <strong>{sesStatus.production_access_enabled ? "produccion" : "sandbox"}</strong> | sending_enabled:{" "}
              <strong>{sesStatus.sending_enabled ? "true" : "false"}</strong>
            </p>
            <p>
              Sender: <strong>{sesStatus.sender_email ?? "(no configurado)"}</strong> | verified_for_sending:{" "}
              <strong>{sesStatus.sender_verified_for_sending ? "true" : "false"}</strong>{" "}
              {sesStatus.sender_verification_status ? <span>({sesStatus.sender_verification_status})</span> : null}
            </p>
            <p>
              Quota: max24h={sesStatus.send_quota?.max_24_hour_send ?? "n/a"} | rate={sesStatus.send_quota?.max_send_rate ?? "n/a"} |
              sent24h={sesStatus.send_quota?.sent_last_24_hours ?? "n/a"}
            </p>
            {isSandbox ? (
              <div className="alert warning">Nota: SES sandbox requiere recipients verificados (email identity) para que el envio funcione.</div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="panel">
        <div className="section-title-row">
          <h3>Tipo</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-outline" type="button" onClick={() => setKind("digest")} disabled={kind === "digest" || uiState === "loading"}>
              Digest
            </button>
            <button
              className="btn btn-outline"
              type="button"
              onClick={() => setKind("incident")}
              disabled={kind === "incident" || uiState === "loading"}
            >
              Incidentes
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-title-row">
          <h3>Filtros</h3>
          <button className="btn btn-outline" type="button" onClick={() => void load()} disabled={saving || uiState === "loading"}>
            Aplicar
          </button>
        </div>
        <div className="form-grid">
          <label>
            Scope
            <input value={scopeFilter} onChange={(event) => setScopeFilter(event.target.value)} placeholder="ops" />
          </label>
          <label style={{ display: "flex", alignItems: "end", gap: 8 }}>
            <input type="checkbox" checked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)} />
            Incluir inactivos
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="section-title-row">
          <h3>Recipients</h3>
          <span>{items.length} registros</span>
        </div>

        {items.length > 0 ? (
          <div className="report-table-wrapper">
            <table className="report-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Scope</th>
                  <th>Estado</th>
                  <th>Actualizado</th>
                  <th>Accion</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className={selectedId === item.id ? "is-selected" : undefined}>
                    <td>{renderRecipientEmail(item)}</td>
                    <td>{item.scope}</td>
                    <td>{item.is_active ? "active" : "inactive"}</td>
                    <td>{item.updated_at}</td>
                    <td>
                      <button className="btn btn-outline" type="button" onClick={() => setSelectedId(item.id)}>
                        Ver
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
          <h3>{selected ? "Editar recipient" : "Crear recipient"}</h3>
          <span>{selected ? selected.id : "nuevo"}</span>
        </div>

        {!canManage ? <div className="alert info">Tu rol es de solo lectura para notificaciones.</div> : null}

        <div className="form-grid">
          <label>
            Email
            <input value={emailDraft} onChange={(event) => setEmailDraft(event.target.value)} disabled={!canManage} placeholder="ops@example.com" />
          </label>
          <label>
            Scope
            <input value={scopeDraft} onChange={(event) => setScopeDraft(event.target.value)} disabled={!canManage} placeholder="ops" />
          </label>
          <label>
            Estado
            <select value={isActiveDraft ? "active" : "inactive"} onChange={(event) => setIsActiveDraft(event.target.value === "active")} disabled={!canManage}>
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
          </label>
        </div>

        {canManage ? (
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            {!selected ? (
              <button className="btn btn-primary" type="button" onClick={() => void createRecipient()} disabled={saving || uiState === "loading"}>
                Crear
              </button>
            ) : (
              <button className="btn btn-primary" type="button" onClick={() => void updateRecipient()} disabled={saving || uiState === "loading"}>
                Guardar cambios
              </button>
            )}
            <button
              className="btn btn-outline"
              type="button"
              onClick={() => {
                setSelectedId("");
                hydrateDraft(null);
              }}
              disabled={saving || uiState === "loading"}
            >
              Nuevo
            </button>
          </div>
        ) : null}
      </section>
    </section>
  );
};

