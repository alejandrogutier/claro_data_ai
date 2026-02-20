import { useEffect, useMemo, useState } from "react";
import { type TaxonomyEntry, type TaxonomyKind } from "../api/client";
import { useApiClient } from "../api/useApiClient";
import { useAuth } from "../auth/AuthContext";

type TaxonomyForm = {
  key: string;
  label: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
};

const defaultForm: TaxonomyForm = {
  key: "",
  label: "",
  description: "",
  sortOrder: 100,
  isActive: true
};

const kinds: Array<{ kind: TaxonomyKind; label: string }> = [
  { kind: "categories", label: "Categorias" },
  { kind: "business_lines", label: "Lineas de negocio" },
  { kind: "macro_regions", label: "Macro regiones" },
  { kind: "campaigns", label: "Campanas" },
  { kind: "strategies", label: "Estrategias" }
];

export const TaxonomyPage = () => {
  const client = useApiClient();
  const { session } = useAuth();
  const canMutate = useMemo(() => session?.role === "Admin", [session?.role]);

  const [kind, setKind] = useState<TaxonomyKind>("categories");
  const [items, setItems] = useState<TaxonomyEntry[]>([]);
  const [form, setForm] = useState<TaxonomyForm>(defaultForm);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (selectedKind: TaxonomyKind, includeAll: boolean) => {
    setLoading(true);
    setError(null);

    try {
      const response = await client.listTaxonomy(selectedKind, includeAll);
      setItems(response.items ?? []);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(kind, includeInactive);
  }, [kind, includeInactive]);

  const onCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canMutate) return;

    setSubmitting(true);
    setError(null);

    try {
      const created = await client.createTaxonomyEntry(kind, {
        key: form.key.trim().toLowerCase().replace(/\s+/g, "_"),
        label: form.label.trim(),
        description: form.description.trim() || undefined,
        is_active: form.isActive,
        sort_order: form.sortOrder
      });

      setItems((current) => [created, ...current]);
      setForm(defaultForm);
    } catch (createError) {
      setError((createError as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (item: TaxonomyEntry) => {
    if (!canMutate) return;

    setError(null);
    try {
      const updated = await client.patchTaxonomyEntry(kind, item.id, {
        is_active: !item.is_active
      });
      setItems((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
    } catch (updateError) {
      setError((updateError as Error).message);
    }
  };

  return (
    <section>
      <header className="page-header">
        <h2>Taxonomias</h2>
        <p>Operacion CLARO-038: catalogos de clasificacion para filtros operativos y reportes.</p>
      </header>

      {error ? <div className="alert error">{error}</div> : null}

      <section className="panel">
        <div className="section-title-row">
          <h3>Tipo de taxonomia</h3>
          <label className="inline-form">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(event) => setIncludeInactive(event.target.checked)}
            />
            <span>Incluir inactivos</span>
          </label>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {kinds.map((entry) => (
            <button
              key={entry.kind}
              type="button"
              className={entry.kind === kind ? "btn btn-primary" : "btn btn-outline"}
              onClick={() => setKind(entry.kind)}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </section>

      {canMutate ? (
        <form className="panel form-grid" onSubmit={onCreate}>
          <label>
            Key
            <input
              type="text"
              value={form.key}
              onChange={(event) => setForm((current) => ({ ...current, key: event.target.value }))}
              required
            />
          </label>

          <label>
            Label
            <input
              type="text"
              value={form.label}
              onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
              required
            />
          </label>

          <label>
            Description
            <input
              type="text"
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            />
          </label>

          <label>
            Sort order
            <input
              type="number"
              value={form.sortOrder}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  sortOrder: Number.parseInt(event.target.value || "100", 10)
                }))
              }
            />
          </label>

          <label className="inline-form">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
            />
            <span>Activo</span>
          </label>

          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Guardando..." : "Crear entrada"}
          </button>
        </form>
      ) : (
        <div className="alert info">Solo Admin puede crear o editar taxonomias.</div>
      )}

      <section className="panel">
        <div className="section-title-row">
          <h3>Entradas ({kind})</h3>
          <button className="btn btn-outline" type="button" onClick={() => void load(kind, includeInactive)} disabled={loading}>
            Recargar
          </button>
        </div>

        {loading ? <p>Cargando...</p> : null}
        {!loading && items.length === 0 ? <p>No hay entradas para este tipo.</p> : null}

        {!loading ? (
          <ul className="simple-list simple-list--stacked">
            {items.map((item) => (
              <li key={item.id}>
                <div style={{ width: "100%", display: "grid", gap: 8 }}>
                  <div className="section-title-row">
                    <strong>
                      {item.label} ({item.key})
                    </strong>
                    <span>{item.is_active ? "active" : "inactive"}</span>
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <span>sort: {item.sort_order}</span>
                    <span>{item.description ?? "sin descripcion"}</span>
                  </div>

                  {canMutate ? (
                    <button className="btn btn-outline" type="button" onClick={() => void toggleActive(item)}>
                      {item.is_active ? "Desactivar" : "Activar"}
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
