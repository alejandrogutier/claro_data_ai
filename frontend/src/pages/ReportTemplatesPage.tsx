import { useEffect, useMemo, useState } from "react";
import {
  ApiError,
  type CreateReportTemplateRequest,
  type ReportTemplate,
  type UpdateReportTemplateRequest
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

export const ReportTemplatesPage = () => {
  const client = useApiClient();
  const { session } = useAuth();

  const canManage = useMemo(() => session?.role === "Admin", [session?.role]);

  const [items, setItems] = useState<ReportTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [nameDraft, setNameDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [thresholdDraft, setThresholdDraft] = useState("0.65");
  const [isActiveDraft, setIsActiveDraft] = useState(true);
  const [uiState, setUiState] = useState<UiState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedTemplate = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);

  const hydrateDraft = (template: ReportTemplate | null) => {
    if (!template) {
      setNameDraft("");
      setDescriptionDraft("");
      setThresholdDraft("0.65");
      setIsActiveDraft(true);
      return;
    }

    setNameDraft(template.name ?? "");
    setDescriptionDraft(template.description ?? "");
    setThresholdDraft(typeof template.confidence_threshold === "number" ? String(template.confidence_threshold) : "0.65");
    setIsActiveDraft(Boolean(template.is_active));
  };

  const load = async () => {
    setUiState("loading");
    setError(null);

    try {
      const response = await client.listReportTemplates(200);
      const templates = response.items ?? [];
      setItems(templates);
      setSelectedId((current) => {
        if (current && templates.some((template) => template.id === current)) return current;
        return templates[0]?.id ?? "";
      });

      if (templates.length === 0) {
        setUiState("empty");
      } else if (templates.some((template) => !template.is_active)) {
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
    void load();
  }, []);

  useEffect(() => {
    hydrateDraft(selectedTemplate);
  }, [selectedTemplate]);

  const saveCreate = async () => {
    if (!canManage) return;

    const thresholdValue = Number.parseFloat(thresholdDraft);
    if (!nameDraft.trim() || Number.isNaN(thresholdValue)) {
      setError("name y confidence_threshold son obligatorios");
      setUiState("error_non_retriable");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload: CreateReportTemplateRequest = {
        name: nameDraft.trim(),
        description: descriptionDraft.trim() || undefined,
        is_active: isActiveDraft,
        confidence_threshold: thresholdValue,
        sections: {
          blocks: ["kpi", "incidents", "top_content"]
        },
        filters: {}
      };

      await client.createReportTemplate(payload);
      await load();
    } catch (saveError) {
      setError((saveError as Error).message);
      setUiState(toUiStateFromError(saveError));
    } finally {
      setSaving(false);
    }
  };

  const saveUpdate = async () => {
    if (!canManage || !selectedTemplate) return;

    const thresholdValue = Number.parseFloat(thresholdDraft);
    if (!nameDraft.trim() || Number.isNaN(thresholdValue)) {
      setError("name y confidence_threshold son obligatorios");
      setUiState("error_non_retriable");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload: UpdateReportTemplateRequest = {
        name: nameDraft.trim(),
        description: descriptionDraft.trim() || null,
        is_active: isActiveDraft,
        confidence_threshold: thresholdValue
      };

      await client.patchReportTemplate(selectedTemplate.id, payload);
      await load();
    } catch (saveError) {
      setError((saveError as Error).message);
      setUiState(toUiStateFromError(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <header className="page-header">
        <h2>Plantillas de Reporte</h2>
        <p>CRUD base de plantillas para corridas manuales y programadas del modulo CLARO-035.</p>
      </header>

      {uiState === "loading" ? <div className="alert info">loading: consultando plantillas...</div> : null}
      {uiState === "empty" ? <div className="alert info">empty: no hay plantillas configuradas todavia.</div> : null}
      {uiState === "partial_data" ? <div className="alert warning">partial_data: existen plantillas inactivas en el catalogo.</div> : null}
      {uiState === "permission_denied" ? <div className="alert error">permission_denied: solo Admin puede modificar plantillas.</div> : null}
      {uiState === "error_retriable" ? <div className="alert error">error_retriable: {error ?? "intenta nuevamente"}</div> : null}
      {uiState === "error_non_retriable" ? <div className="alert error">error_non_retriable: {error ?? "revisa los datos"}</div> : null}

      {!canManage ? <div className="alert info">Tu rol tiene lectura. Solo Admin puede crear/editar plantillas.</div> : null}

      <section className="panel">
        <div className="section-title-row">
          <h3>Listado</h3>
          <button className="btn btn-outline" type="button" onClick={() => void load()} disabled={saving || uiState === "loading"}>
            Refrescar
          </button>
        </div>

        {items.length > 0 ? (
          <ul className="simple-list simple-list--stacked">
            {items.map((template) => (
              <li key={template.id}>
                <div style={{ width: "100%", display: "grid", gap: 6 }}>
                  <div className="section-title-row">
                    <strong>{template.name}</strong>
                    <span>{template.is_active ? "active" : "inactive"}</span>
                  </div>
                  <span>{template.description ?? "Sin descripcion"}</span>
                  <span className="kpi-caption">threshold: {template.confidence_threshold}</span>
                  <button className="btn btn-outline" type="button" onClick={() => setSelectedId(template.id)}>
                    Editar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="panel">
        <div className="section-title-row">
          <h3>{selectedTemplate ? "Editar plantilla" : "Crear plantilla"}</h3>
          <span>{selectedTemplate ? selectedTemplate.id : "nueva"}</span>
        </div>

        <div className="form-grid">
          <label>
            Nombre
            <input value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} maxLength={120} />
          </label>

          <label>
            Threshold de confianza (0..1)
            <input value={thresholdDraft} onChange={(event) => setThresholdDraft(event.target.value)} type="number" min={0} max={1} step={0.01} />
          </label>

          <label>
            Estado
            <select value={isActiveDraft ? "active" : "inactive"} onChange={(event) => setIsActiveDraft(event.target.value === "active")}>
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
          </label>

          <label style={{ gridColumn: "1 / -1" }}>
            Descripcion
            <textarea value={descriptionDraft} onChange={(event) => setDescriptionDraft(event.target.value)} maxLength={600} rows={4} />
          </label>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          {!selectedTemplate ? (
            <button className="btn btn-primary" type="button" disabled={!canManage || saving} onClick={() => void saveCreate()}>
              {saving ? "Guardando..." : "Crear plantilla"}
            </button>
          ) : (
            <button className="btn btn-primary" type="button" disabled={!canManage || saving} onClick={() => void saveUpdate()}>
              {saving ? "Guardando..." : "Actualizar plantilla"}
            </button>
          )}
          <button
            className="btn btn-outline"
            type="button"
            onClick={() => {
              setSelectedId("");
              hydrateDraft(null);
            }}
          >
            Limpiar
          </button>
        </div>
      </section>
    </section>
  );
};
