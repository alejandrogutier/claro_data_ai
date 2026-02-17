import { useEffect, useMemo, useState } from "react";
import { type Competitor } from "../api/client";
import { useApiClient } from "../api/useApiClient";
import { useAuth } from "../auth/AuthContext";

type CompetitorForm = {
  brandName: string;
  aliases: string;
  priority: number;
  status: string;
};

const defaultForm: CompetitorForm = {
  brandName: "",
  aliases: "",
  priority: 3,
  status: "active"
};

const parseAliases = (value: string): string[] =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 50);

export const CompetitorsPage = () => {
  const client = useApiClient();
  const { session } = useAuth();
  const canMutate = useMemo(() => session?.role === "Admin", [session?.role]);

  const [items, setItems] = useState<Competitor[]>([]);
  const [form, setForm] = useState<CompetitorForm>(defaultForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCompetitors = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await client.listConfigCompetitors(250);
      setItems(response.items ?? []);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCompetitors();
  }, []);

  const onCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canMutate) return;

    setSubmitting(true);
    setError(null);

    try {
      const created = await client.createConfigCompetitor({
        brand_name: form.brandName.trim(),
        aliases: parseAliases(form.aliases),
        priority: form.priority,
        status: form.status
      });

      setItems((current) => [created, ...current]);
      setForm(defaultForm);
    } catch (createError) {
      setError((createError as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const updatePriority = async (competitor: Competitor, nextPriority: number) => {
    if (!canMutate) return;

    setError(null);
    try {
      const updated = await client.patchConfigCompetitor(competitor.id, {
        priority: nextPriority
      });
      setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (updateError) {
      setError((updateError as Error).message);
    }
  };

  const toggleStatus = async (competitor: Competitor) => {
    if (!canMutate) return;

    setError(null);
    try {
      const updated = await client.patchConfigCompetitor(competitor.id, {
        status: competitor.estado === "active" ? "inactive" : "active"
      });
      setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (updateError) {
      setError((updateError as Error).message);
    }
  };

  return (
    <section>
      <header className="page-header">
        <h2>Competidores</h2>
        <p>Operacion CLARO-038: catalogo oficial de marcas competidoras y prioridad de seguimiento.</p>
      </header>

      {error ? <div className="alert error">{error}</div> : null}
      {!canMutate ? <div className="alert info">Solo Admin puede crear o editar competidores.</div> : null}

      {canMutate ? (
        <form className="panel form-grid" onSubmit={onCreate}>
          <label>
            Marca competidora
            <input
              type="text"
              value={form.brandName}
              onChange={(event) => setForm((current) => ({ ...current, brandName: event.target.value }))}
              required
            />
          </label>

          <label>
            Aliases (coma)
            <input
              type="text"
              value={form.aliases}
              onChange={(event) => setForm((current) => ({ ...current, aliases: event.target.value }))}
            />
          </label>

          <label>
            Prioridad
            <input
              type="number"
              min={1}
              max={10}
              value={form.priority}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  priority: Math.max(1, Math.min(10, Number.parseInt(event.target.value || "3", 10)))
                }))
              }
            />
          </label>

          <label>
            Estado
            <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
          </label>

          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Guardando..." : "Crear competidor"}
          </button>
        </form>
      ) : null}

      <section className="panel">
        <div className="section-title-row">
          <h3>Listado</h3>
          <button className="btn btn-outline" type="button" onClick={() => void loadCompetitors()} disabled={loading}>
            Recargar
          </button>
        </div>

        {loading ? <p>Cargando...</p> : null}
        {!loading && items.length === 0 ? <p>No hay competidores registrados.</p> : null}

        {!loading ? (
          <ul className="simple-list simple-list--stacked">
            {items.map((item) => (
              <li key={item.id}>
                <div style={{ width: "100%", display: "grid", gap: 8 }}>
                  <div className="section-title-row">
                    <strong>{item.marca_competidora}</strong>
                    <span>estado: {item.estado}</span>
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <span>prioridad: {item.prioridad}</span>
                    <span>aliases: {item.aliases.join(", ") || "n/a"}</span>
                  </div>

                  {canMutate ? (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button className="btn btn-outline" type="button" onClick={() => void toggleStatus(item)}>
                        {item.estado === "active" ? "Desactivar" : "Activar"}
                      </button>

                      <button
                        className="btn btn-outline"
                        type="button"
                        onClick={() =>
                          void updatePriority(item, item.prioridad >= 10 ? 1 : Math.min(10, Math.max(1, item.prioridad + 1)))
                        }
                      >
                        Subir prioridad
                      </button>
                    </div>
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
