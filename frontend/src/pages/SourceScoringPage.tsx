import { useEffect, useMemo, useState } from "react";
import {
  ApiError,
  type CreateSourceWeightRequest,
  type SourceWeight,
  type UpdateSourceWeightRequest
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

export const SourceScoringPage = () => {
  const client = useApiClient();
  const { session } = useAuth();
  const canManage = useMemo(() => session?.role === "Admin", [session?.role]);

  const [items, setItems] = useState<SourceWeight[]>([]);
  const [providerFilter, setProviderFilter] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [selectedId, setSelectedId] = useState("");

  const [providerDraft, setProviderDraft] = useState("");
  const [sourceNameDraft, setSourceNameDraft] = useState("");
  const [weightDraft, setWeightDraft] = useState("0.50");
  const [isActiveDraft, setIsActiveDraft] = useState(true);

  const [uiState, setUiState] = useState<UiState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selected = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);

  const hydrateDraft = (item: SourceWeight | null) => {
    if (!item) {
      setProviderDraft("");
      setSourceNameDraft("");
      setWeightDraft("0.50");
      setIsActiveDraft(true);
      return;
    }

    setProviderDraft(item.provider);
    setSourceNameDraft(item.source_name ?? "");
    setWeightDraft(typeof item.weight === "number" ? item.weight.toFixed(2) : "0.50");
    setIsActiveDraft(Boolean(item.is_active));
  };

  const load = async () => {
    setUiState("loading");
    setError(null);

    try {
      const response = await client.listSourceWeights(providerFilter.trim() || undefined, includeInactive);
      const rows = response.items ?? [];
      setItems(rows);
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
    void load();
  }, [includeInactive]);

  useEffect(() => {
    hydrateDraft(selected);
  }, [selected]);

  const createWeight = async () => {
    if (!canManage) return;

    const provider = providerDraft.trim().toLowerCase();
    const parsedWeight = Number.parseFloat(weightDraft);
    if (!provider || Number.isNaN(parsedWeight) || parsedWeight < 0 || parsedWeight > 1) {
      setUiState("error_non_retriable");
      setError("provider y weight (0..1) son obligatorios");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload: CreateSourceWeightRequest = {
        provider,
        source_name: sourceNameDraft.trim() ? sourceNameDraft.trim() : null,
        weight: parsedWeight,
        is_active: isActiveDraft
      };
      await client.createSourceWeight(payload);
      await load();
    } catch (saveError) {
      setError((saveError as Error).message);
      setUiState(toUiStateFromError(saveError));
    } finally {
      setSaving(false);
    }
  };

  const updateWeight = async () => {
    if (!canManage || !selected) return;

    const parsedWeight = Number.parseFloat(weightDraft);
    if (Number.isNaN(parsedWeight) || parsedWeight < 0 || parsedWeight > 1) {
      setUiState("error_non_retriable");
      setError("weight debe estar entre 0 y 1");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload: UpdateSourceWeightRequest = {
        source_name: sourceNameDraft.trim() ? sourceNameDraft.trim() : null,
        weight: parsedWeight,
        is_active: isActiveDraft
      };
      await client.patchSourceWeight(selected.id, payload);
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
        <h2>Source Scoring Global</h2>
        <p>Configuracion jerarquica de peso por `provider+source_name` y fallback por `provider`.</p>
      </header>

      {uiState === "loading" ? <div className="alert info">loading: consultando pesos configurables...</div> : null}
      {uiState === "empty" ? <div className="alert info">empty: no existen pesos configurados.</div> : null}
      {uiState === "partial_data" ? <div className="alert warning">partial_data: hay pesos inactivos en el catalogo.</div> : null}
      {uiState === "permission_denied" ? <div className="alert error">permission_denied: tu rol no tiene acceso.</div> : null}
      {uiState === "error_retriable" ? <div className="alert error">error_retriable: {error ?? "intenta nuevamente"}</div> : null}
      {uiState === "error_non_retriable" ? <div className="alert error">error_non_retriable: {error ?? "revisa los datos"}</div> : null}

      {!canManage ? <div className="alert info">Tu rol es de solo lectura para source scoring.</div> : null}

      <section className="panel">
        <div className="section-title-row">
          <h3>Filtros</h3>
          <button className="btn btn-outline" type="button" onClick={() => void load()} disabled={saving || uiState === "loading"}>
            Refrescar
          </button>
        </div>
        <div className="form-grid">
          <label>
            Provider
            <input value={providerFilter} onChange={(event) => setProviderFilter(event.target.value)} placeholder="newsapi" />
          </label>
          <label style={{ display: "flex", alignItems: "end", gap: 8 }}>
            <input type="checkbox" checked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)} />
            Incluir inactivos
          </label>
          <div style={{ display: "flex", alignItems: "end" }}>
            <button className="btn btn-primary" type="button" onClick={() => void load()} disabled={saving || uiState === "loading"}>
              Aplicar filtros
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-title-row">
          <h3>Pesos</h3>
          <span>{items.length} registros</span>
        </div>

        {items.length > 0 ? (
          <div className="report-table-wrapper">
            <table className="report-table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Source Name</th>
                  <th>Weight</th>
                  <th>Estado</th>
                  <th>Actualizado</th>
                  <th>Accion</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className={selectedId === item.id ? "is-selected" : undefined}>
                    <td>{item.provider}</td>
                    <td>{item.source_name ?? "provider-default"}</td>
                    <td>{typeof item.weight === "number" ? item.weight.toFixed(2) : "0.50"}</td>
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
          <h3>{selected ? "Editar peso" : "Crear peso"}</h3>
          <span>{selected ? selected.id : "nuevo"}</span>
        </div>

        <div className="form-grid">
          <label>
            Provider
            <input value={providerDraft} onChange={(event) => setProviderDraft(event.target.value)} disabled={Boolean(selected)} />
          </label>
          <label>
            Source Name (opcional)
            <input value={sourceNameDraft} onChange={(event) => setSourceNameDraft(event.target.value)} placeholder="null -> provider fallback" />
          </label>
          <label>
            Weight (0..1)
            <input type="number" min={0} max={1} step={0.01} value={weightDraft} onChange={(event) => setWeightDraft(event.target.value)} />
          </label>
          <label>
            Estado
            <select value={isActiveDraft ? "active" : "inactive"} onChange={(event) => setIsActiveDraft(event.target.value === "active")}>
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
          </label>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          {!selected ? (
            <button className="btn btn-primary" type="button" disabled={!canManage || saving} onClick={() => void createWeight()}>
              {saving ? "Guardando..." : "Crear peso"}
            </button>
          ) : (
            <button className="btn btn-primary" type="button" disabled={!canManage || saving} onClick={() => void updateWeight()}>
              {saving ? "Guardando..." : "Actualizar peso"}
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
