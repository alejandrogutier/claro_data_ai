import { useEffect, useMemo, useState } from "react";
import { ApiError, type Term } from "../api/client";
import { useApiClient } from "../api/useApiClient";
import { useAuth } from "../auth/AuthContext";

type TermFormState = {
  name: string;
  language: string;
  maxArticlesPerRun: number;
};

const defaultTermForm: TermFormState = {
  name: "",
  language: "es",
  maxArticlesPerRun: 2
};

export const TermsPage = () => {
  const client = useApiClient();
  const { session } = useAuth();
  const canMutate = useMemo(() => session?.role === "Admin", [session?.role]);

  const [terms, setTerms] = useState<Term[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<TermFormState>(defaultTermForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const loadTerms = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await client.listTerms(100);
      setTerms(response.items ?? []);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTerms();
  }, []);

  const onCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canMutate) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const created = await client.createTerm({
        name: form.name.trim(),
        language: form.language.trim() || "es",
        max_articles_per_run: form.maxArticlesPerRun
      });

      setTerms((current) => [created, ...current]);
      setForm(defaultTermForm);
    } catch (createError) {
      if (createError instanceof ApiError) {
        setError(`No se pudo crear la query: ${createError.message}`);
      } else {
        setError((createError as Error).message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const onQuickUpdate = async (term: Term, patch: { is_active?: boolean; max_articles_per_run?: number }) => {
    if (!canMutate) return;
    setError(null);

    try {
      const updated = await client.updateTerm(term.id, patch);
      setTerms((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setEditingId(null);
    } catch (updateError) {
      setError((updateError as Error).message);
    }
  };

  return (
    <section>
      <header className="page-header">
        <h2>Configuracion de Queries</h2>
        <p>Modelo actual: cada query de noticias opera con limite efectivo de 2 items recientes por corrida.</p>
      </header>

      {error ? <div className="alert error">{error}</div> : null}

      {canMutate ? (
        <form className="panel form-grid" onSubmit={onCreate}>
          <label>
            Nombre de query
            <input
              type="text"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="ej. claro colombia"
              minLength={2}
              maxLength={160}
              required
            />
          </label>

          <label>
            Idioma
            <input
              type="text"
              value={form.language}
              onChange={(event) => setForm((current) => ({ ...current, language: event.target.value }))}
              maxLength={8}
              required
            />
          </label>

          <label>
            Max articulos por corrida
            <input
              type="number"
              value={form.maxArticlesPerRun}
              min={1}
              max={500}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  maxArticlesPerRun: Math.max(1, Number.parseInt(event.target.value || "2", 10))
                }))
              }
              required
            />
          </label>

          <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Guardando..." : "Crear query"}
          </button>
        </form>
      ) : (
        <div className="alert info">Tu rol es {session?.role}. Solo Admin puede crear o editar queries.</div>
      )}

      <section className="panel">
        <div className="section-title-row">
          <h3>Queries registradas</h3>
          <button className="btn btn-outline" type="button" onClick={() => void loadTerms()} disabled={loading}>
            Recargar
          </button>
        </div>

        {loading ? <p>Cargando...</p> : null}
        {!loading && terms.length === 0 ? <p>No hay queries registradas.</p> : null}

        <ul className="term-list">
          {terms.map((term) => {
            const isEditing = editingId === term.id;
            return (
              <li key={term.id} className="term-item">
                <div>
                  <p className="term-name">{term.name}</p>
                  <p className="term-meta">
                    {term.language} | estado: {term.is_active ? "active" : "inactive"} | max configurado: {term.max_articles_per_run}
                  </p>
                </div>

                {canMutate ? (
                  <div className="term-actions">
                    <button
                      className="btn btn-outline"
                      type="button"
                      onClick={() =>
                        void onQuickUpdate(term, {
                          is_active: !term.is_active
                        })
                      }
                    >
                      {term.is_active ? "Desactivar" : "Activar"}
                    </button>

                    <button
                      className="btn btn-outline"
                      type="button"
                      onClick={() => {
                        if (isEditing) {
                          setEditingId(null);
                          return;
                        }
                        setEditingId(term.id);
                      }}
                    >
                      {isEditing ? "Cancelar" : "Editar max"}
                    </button>

                    {isEditing ? (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          const input = (event.currentTarget.elements.namedItem("max") as HTMLInputElement).value;
                          const max = Number.parseInt(input, 10);
                          if (!Number.isFinite(max)) return;
                          void onQuickUpdate(term, { max_articles_per_run: max });
                        }}
                        className="inline-form"
                      >
                        <input name="max" type="number" min={1} max={500} defaultValue={term.max_articles_per_run} />
                        <button className="btn btn-primary" type="submit">
                          Guardar
                        </button>
                      </form>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
    </section>
  );
};
