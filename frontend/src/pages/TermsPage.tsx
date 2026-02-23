import { useEffect, useMemo, useState } from "react";
import {
  ApiError,
  type ConfigQuery,
  type QueryDefinition,
  type QueryExecutionConfig,
  type QueryFacetRule,
  type QueryKeywordRule,
  type QueryRevision,
  type QueryRule,
  type QueryRuleGroup,
  type QueryScope
} from "../api/client";
import { useApiClient } from "../api/useApiClient";
import { useAuth } from "../auth/AuthContext";

type QueryEditorState = {
  name: string;
  description: string;
  language: string;
  scope: QueryScope;
  isActive: boolean;
  priority: number;
  maxArticlesPerRun: number;
  definition: QueryDefinition;
  execution: QueryExecutionConfig;
};

const defaultDefinition = (keyword = "claro colombia"): QueryDefinition => ({
  kind: "group",
  op: "AND",
  rules: [
    {
      kind: "keyword",
      field: "any",
      match: "phrase",
      value: keyword
    }
  ]
});

const defaultExecution: QueryExecutionConfig = {
  providers_allow: [],
  providers_deny: [],
  countries_allow: [],
  countries_deny: [],
  domains_allow: [],
  domains_deny: []
};

const defaultForm: QueryEditorState = {
  name: "",
  description: "",
  language: "es",
  scope: "claro",
  isActive: true,
  priority: 3,
  maxArticlesPerRun: 100,
  definition: defaultDefinition(),
  execution: defaultExecution
};

const deepClone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const getGroupAtPath = (root: QueryDefinition, path: number[]): QueryRuleGroup | null => {
  let current: QueryRuleGroup = root;
  for (const index of path) {
    const next = current.rules[index];
    if (!next || next.kind !== "group") return null;
    current = next;
  }
  return current;
};

const getParentGroup = (root: QueryDefinition, rulePath: number[]): { group: QueryRuleGroup; index: number } | null => {
  if (rulePath.length === 0) return null;
  const parentPath = rulePath.slice(0, -1);
  const index = rulePath[rulePath.length - 1];
  const group = getGroupAtPath(root, parentPath);
  if (!group) return null;
  return { group, index };
};

const isFacetRule = (rule: QueryRule): rule is QueryFacetRule =>
  rule.kind === "provider" || rule.kind === "language" || rule.kind === "country" || rule.kind === "domain";

const toForm = (item: ConfigQuery): QueryEditorState => ({
  name: item.name,
  description: item.description ?? "",
  language: item.language,
  scope: item.scope,
  isActive: item.is_active,
  priority: item.priority,
  maxArticlesPerRun: item.max_articles_per_run,
  definition: deepClone(item.definition),
  execution: {
    providers_allow: [...(item.execution.providers_allow ?? [])],
    providers_deny: [...(item.execution.providers_deny ?? [])],
    countries_allow: [...(item.execution.countries_allow ?? [])],
    countries_deny: [...(item.execution.countries_deny ?? [])],
    domains_allow: [...(item.execution.domains_allow ?? [])],
    domains_deny: [...(item.execution.domains_deny ?? [])]
  }
});

const csvToArray = (value: string): string[] =>
  Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    )
  );

const arrayToCsv = (value: string[]): string => value.join(", ");

const defaultKeywordRule = (): QueryKeywordRule => ({
  kind: "keyword",
  field: "any",
  match: "phrase",
  value: ""
});

const defaultFacetRule = (): QueryFacetRule => ({
  kind: "provider",
  op: "in",
  values: []
});

const defaultGroupRule = (): QueryRuleGroup => ({
  kind: "group",
  op: "AND",
  rules: [defaultKeywordRule()]
});

export const TermsPage = () => {
  const client = useApiClient();
  const { session } = useAuth();
  const canMutate = useMemo(() => session?.role === "Admin", [session?.role]);

  const [queries, setQueries] = useState<ConfigQuery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [scopeFilter, setScopeFilter] = useState<QueryScope | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [searchFilter, setSearchFilter] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<QueryEditorState>(defaultForm);
  const [isCreating, setIsCreating] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [revisions, setRevisions] = useState<QueryRevision[]>([]);
  const [loadingRevisions, setLoadingRevisions] = useState(false);
  const [rollbackRevision, setRollbackRevision] = useState<number | null>(null);

  const [previewResult, setPreviewResult] = useState<Record<string, unknown> | null>(null);
  const [dryRunResult, setDryRunResult] = useState<Record<string, unknown> | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isDryRunning, setIsDryRunning] = useState(false);
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [manualSyncInfo, setManualSyncInfo] = useState<string | null>(null);

  const selectedQuery = useMemo(() => queries.find((item) => item.id === selectedId) ?? null, [queries, selectedId]);

  const loadQueries = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await client.listConfigQueries({
        limit: 200,
        scope: scopeFilter === "all" ? undefined : scopeFilter,
        is_active: statusFilter === "all" ? undefined : statusFilter === "active",
        q: searchFilter.trim() || undefined
      });

      const items = response.items ?? [];
      setQueries(items);

      if (selectedId && items.some((item) => item.id === selectedId)) {
        return;
      }

      if (items.length > 0) {
        setSelectedId(items[0].id);
        setForm(toForm(items[0]));
        setIsCreating(false);
      } else {
        setSelectedId(null);
        setForm(defaultForm);
        setIsCreating(true);
      }
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadRevisions = async (queryId: string) => {
    setLoadingRevisions(true);
    try {
      const response = await client.listConfigQueryRevisions(queryId, 100);
      setRevisions(response.items ?? []);
      setRollbackRevision((response.items?.[0]?.revision as number | undefined) ?? null);
    } catch {
      setRevisions([]);
      setRollbackRevision(null);
    } finally {
      setLoadingRevisions(false);
    }
  };

  useEffect(() => {
    void loadQueries();
  }, [scopeFilter, statusFilter]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadQueries();
    }, 280);

    return () => window.clearTimeout(timeout);
  }, [searchFilter]);

  useEffect(() => {
    if (!selectedQuery) {
      setRevisions([]);
      setRollbackRevision(null);
      return;
    }
    void loadRevisions(selectedQuery.id);
  }, [selectedQuery?.id]);

  const resetToCreate = () => {
    setIsCreating(true);
    setSelectedId(null);
    setPreviewResult(null);
    setDryRunResult(null);
    setManualSyncInfo(null);
    setForm(defaultForm);
    setRevisions([]);
    setRollbackRevision(null);
  };

  const selectQuery = (item: ConfigQuery) => {
    setIsCreating(false);
    setSelectedId(item.id);
    setForm(toForm(item));
    setPreviewResult(null);
    setDryRunResult(null);
    setManualSyncInfo(null);
  };

  const updateDefinition = (updater: (draft: QueryDefinition) => void) => {
    setForm((current) => {
      const next = deepClone(current);
      updater(next.definition);
      return next;
    });
  };

  const updateRuleAtPath = (rulePath: number[], updater: (rule: QueryRule) => QueryRule) => {
    updateDefinition((definition) => {
      const parent = getParentGroup(definition, rulePath);
      if (!parent) return;
      const currentRule = parent.group.rules[parent.index];
      if (!currentRule) return;
      parent.group.rules[parent.index] = updater(currentRule);
    });
  };

  const removeRuleAtPath = (rulePath: number[]) => {
    updateDefinition((definition) => {
      const parent = getParentGroup(definition, rulePath);
      if (!parent) return;
      if (parent.group.rules.length <= 1) return;
      parent.group.rules.splice(parent.index, 1);
    });
  };

  const addRuleToGroup = (groupPath: number[], type: "keyword" | "facet" | "group") => {
    updateDefinition((definition) => {
      const group = getGroupAtPath(definition, groupPath);
      if (!group) return;
      const rule: QueryRule =
        type === "keyword" ? defaultKeywordRule() : type === "facet" ? defaultFacetRule() : defaultGroupRule();
      group.rules.push(rule);
    });
  };

  const onSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canMutate) return;

    setIsSaving(true);
    setError(null);

    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        language: form.language.trim() || "es",
        scope: form.scope,
        is_active: form.isActive,
        priority: form.priority,
        max_articles_per_run: form.maxArticlesPerRun,
        definition: form.definition,
        execution: form.execution
      };

      if (isCreating || !selectedId) {
        const created = await client.createConfigQuery(payload);
        setQueries((current) => [created, ...current.filter((item) => item.id !== created.id)]);
        selectQuery(created);
      } else {
        const updated = await client.patchConfigQuery(selectedId, payload);
        setQueries((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        selectQuery(updated);
      }
    } catch (saveError) {
      if (saveError instanceof ApiError) {
        setError(saveError.message);
      } else {
        setError((saveError as Error).message);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const onDelete = async () => {
    if (!canMutate || !selectedQuery) return;

    const confirmation = window.prompt(`Escribe exactamente '${selectedQuery.name}' para confirmar eliminación:`);
    if (confirmation !== selectedQuery.name) {
      setError("El texto de confirmación no coincide. No se eliminó la query.");
      return;
    }

    try {
      await client.deleteConfigQuery(selectedQuery.id);
      setQueries((current) => current.filter((item) => item.id !== selectedQuery.id));
      resetToCreate();
      await loadQueries();
    } catch (deleteError) {
      setError((deleteError as Error).message);
    }
  };

  const onPreview = async () => {
    setIsPreviewing(true);
    setError(null);
    setPreviewResult(null);

    try {
      const result = await client.previewConfigQuery({
        definition: form.definition,
        execution: form.execution,
        limit: 20,
        candidate_limit: 500
      });
      setPreviewResult(result as Record<string, unknown>);
    } catch (previewError) {
      setError((previewError as Error).message);
    } finally {
      setIsPreviewing(false);
    }
  };

  const onDryRun = async () => {
    if (!selectedId || !canMutate) return;

    setIsDryRunning(true);
    setError(null);
    setDryRunResult(null);

    try {
      const result = await client.dryRunConfigQuery(selectedId, {
        max_articles_per_term: form.maxArticlesPerRun
      });
      setDryRunResult(result as Record<string, unknown>);
    } catch (dryRunError) {
      setError((dryRunError as Error).message);
    } finally {
      setIsDryRunning(false);
    }
  };

  const onManualSync = async () => {
    if (!canMutate || !selectedId) return;

    setIsManualSyncing(true);
    setError(null);
    setManualSyncInfo(null);

    try {
      const accepted = await client.createIngestionRun({
        term_ids: [selectedId],
        language: form.language.trim() || "es",
        max_articles_per_term: form.maxArticlesPerRun
      });
      setManualSyncInfo(`Sync manual aceptado. run_id: ${accepted.run_id}`);
    } catch (syncError) {
      setError((syncError as Error).message);
    } finally {
      setIsManualSyncing(false);
    }
  };

  const onRollback = async () => {
    if (!canMutate || !selectedId || !rollbackRevision) return;

    try {
      const rolledBack = await client.rollbackConfigQuery(selectedId, rollbackRevision);
      setQueries((current) => current.map((item) => (item.id === rolledBack.id ? rolledBack : item)));
      selectQuery(rolledBack);
      await loadRevisions(rolledBack.id);
    } catch (rollbackError) {
      setError((rollbackError as Error).message);
    }
  };

  const RuleEditor = ({ rule, path }: { rule: QueryRule; path: number[] }) => {
    if (rule.kind === "group") {
      return (
        <div className="panel" style={{ marginTop: 10 }}>
          <div className="section-title-row" style={{ alignItems: "center" }}>
            <h4>Grupo</h4>
            <select
              value={rule.op}
              onChange={(event) =>
                updateRuleAtPath(path, (current) =>
                  current.kind === "group" ? { ...current, op: event.target.value as "AND" | "OR" } : current
                )
              }
            >
              <option value="AND">AND</option>
              <option value="OR">OR</option>
            </select>
          </div>

          <div className="button-row" style={{ marginBottom: 10 }}>
            <button type="button" className="btn btn-outline" onClick={() => addRuleToGroup(path, "keyword")}>+ Keyword</button>
            <button type="button" className="btn btn-outline" onClick={() => addRuleToGroup(path, "facet")}>+ Facet</button>
            <button type="button" className="btn btn-outline" onClick={() => addRuleToGroup(path, "group")}>+ Subgrupo</button>
            {path.length > 0 ? (
              <button type="button" className="btn btn-outline" onClick={() => removeRuleAtPath(path)}>
                Quitar grupo
              </button>
            ) : null}
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            {rule.rules.map((nestedRule, index) => (
              <RuleEditor key={index} rule={nestedRule} path={[...path, index]} />
            ))}
          </div>
        </div>
      );
    }

    if (rule.kind === "keyword") {
      return (
        <div className="panel" style={{ borderStyle: "dashed" }}>
          <div className="form-grid" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
            <label>
              Field
              <select
                value={rule.field}
                onChange={(event) =>
                  updateRuleAtPath(path, (current) =>
                    current.kind === "keyword" ? { ...current, field: event.target.value as QueryKeywordRule["field"] } : current
                  )
                }
              >
                <option value="any">any</option>
                <option value="title">title</option>
                <option value="summary">summary</option>
                <option value="content">content</option>
              </select>
            </label>

            <label>
              Match
              <select
                value={rule.match}
                onChange={(event) =>
                  updateRuleAtPath(path, (current) =>
                    current.kind === "keyword" ? { ...current, match: event.target.value as QueryKeywordRule["match"] } : current
                  )
                }
              >
                <option value="phrase">phrase</option>
                <option value="contains">contains</option>
              </select>
            </label>

            <label>
              Valor
              <input
                value={rule.value}
                onChange={(event) =>
                  updateRuleAtPath(path, (current) =>
                    current.kind === "keyword" ? { ...current, value: event.target.value } : current
                  )
                }
              />
            </label>

            <label>
              NOT
              <select
                value={rule.not ? "true" : "false"}
                onChange={(event) =>
                  updateRuleAtPath(path, (current) =>
                    current.kind === "keyword" ? { ...current, not: event.target.value === "true" } : current
                  )
                }
              >
                <option value="false">No</option>
                <option value="true">Si</option>
              </select>
            </label>
          </div>

          <div className="button-row" style={{ marginTop: 8 }}>
            <button type="button" className="btn btn-outline" onClick={() => removeRuleAtPath(path)}>
              Quitar regla
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="panel" style={{ borderStyle: "dashed" }}>
        <div className="form-grid" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
          <label>
            Facet
              <select
                value={rule.kind}
                onChange={(event) =>
                  updateRuleAtPath(path, (current) =>
                    isFacetRule(current)
                      ? { ...current, kind: event.target.value as QueryFacetRule["kind"] }
                      : current
                  )
                }
              >
              <option value="provider">provider</option>
              <option value="language">language</option>
              <option value="country">country</option>
              <option value="domain">domain</option>
            </select>
          </label>

          <label>
            Operador
              <select
                value={rule.op}
                onChange={(event) =>
                  updateRuleAtPath(path, (current) =>
                    isFacetRule(current)
                      ? { ...current, op: event.target.value as QueryFacetRule["op"] }
                      : current
                  )
                }
              >
              <option value="in">in</option>
              <option value="not_in">not_in</option>
            </select>
          </label>

          <label>
            Values (CSV)
              <input
                value={arrayToCsv(rule.values)}
                onChange={(event) =>
                  updateRuleAtPath(path, (current) =>
                    isFacetRule(current)
                      ? { ...current, values: csvToArray(event.target.value) }
                      : current
                  )
                }
              />
          </label>
        </div>

        <div className="button-row" style={{ marginTop: 8 }}>
          <button type="button" className="btn btn-outline" onClick={() => removeRuleAtPath(path)}>
            Quitar regla
          </button>
        </div>
      </div>
    );
  };

  return (
    <section>
      <header className="page-header">
        <h2>Configurador de Queries (Noticias)</h2>
        <p>Builder avanzado con preview local, dry-run por proveedores, historial de revisiones y hard delete auditable.</p>
      </header>

      {error ? <div className="alert error">{error}</div> : null}

      <section className="panel">
        <div className="form-grid" style={{ gridTemplateColumns: "2fr 1fr 1fr auto" }}>
          <label>
            Buscar
            <input value={searchFilter} onChange={(event) => setSearchFilter(event.target.value)} placeholder="nombre o descripción" />
          </label>

          <label>
            Scope
            <select value={scopeFilter} onChange={(event) => setScopeFilter(event.target.value as QueryScope | "all")}> 
              <option value="all">all</option>
              <option value="claro">claro</option>
              <option value="competencia">competencia</option>
            </select>
          </label>

          <label>
            Estado
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | "active" | "inactive")}> 
              <option value="all">all</option>
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
          </label>

          <div style={{ display: "flex", alignItems: "end", gap: 8 }}>
            <button className="btn btn-outline" type="button" onClick={() => void loadQueries()} disabled={loading}>
              Recargar
            </button>
            {canMutate ? (
              <button className="btn btn-primary" type="button" onClick={resetToCreate}>
                Nueva query
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <h3>Queries registradas</h3>
        {loading ? <p>Cargando...</p> : null}
        {!loading && queries.length === 0 ? <p>No hay queries registradas.</p> : null}

        <ul className="term-list">
          {queries.map((item) => (
            <li key={item.id} className="term-item" style={{ cursor: "pointer", border: selectedId === item.id ? "1px solid var(--color-accent, #2f6fed)" : undefined }} onClick={() => selectQuery(item)}>
              <div>
                <p className="term-name">{item.name}</p>
                <p className="term-meta">
                  {item.language} | scope: {item.scope} | estado: {item.is_active ? "active" : "inactive"} | rev: {item.current_revision} | max: {item.max_articles_per_run}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <form className="panel" onSubmit={onSave} style={{ marginTop: 16 }}>
        <div className="section-title-row">
          <h3>{isCreating ? "Crear query" : `Editar query: ${selectedQuery?.name ?? ""}`}</h3>
          <div className="button-row">
            <button className="btn btn-outline" type="button" onClick={onPreview} disabled={isPreviewing}>
              {isPreviewing ? "Preview..." : "Preview local"}
            </button>
            {canMutate && selectedId ? (
              <button className="btn btn-outline" type="button" onClick={onDryRun} disabled={isDryRunning}>
                {isDryRunning ? "Dry-run..." : "Dry-run proveedores"}
              </button>
            ) : null}
            {canMutate && selectedId ? (
              <button className="btn btn-outline" type="button" onClick={onManualSync} disabled={isManualSyncing}>
                {isManualSyncing ? "Sync..." : "Sync manual ahora"}
              </button>
            ) : null}
            {canMutate ? (
              <button className="btn btn-primary" type="submit" disabled={isSaving}>
                {isSaving ? "Guardando..." : isCreating ? "Crear" : "Guardar cambios"}
              </button>
            ) : null}
          </div>
        </div>

        <p style={{ marginTop: 6, marginBottom: 12 }}>
          Los cambios aplican en la configuración inmediatamente, pero afectan la próxima corrida programada. Puedes ejecutar sync manual para adelantar la aplicación.
        </p>
        {manualSyncInfo ? <div className="alert success">{manualSyncInfo}</div> : null}

        <div className="form-grid" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
          <label>
            Nombre
            <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required minLength={2} maxLength={160} />
          </label>

          <label>
            Idioma
            <input value={form.language} onChange={(event) => setForm((current) => ({ ...current, language: event.target.value }))} maxLength={8} required />
          </label>

          <label>
            Scope
            <select value={form.scope} onChange={(event) => setForm((current) => ({ ...current, scope: event.target.value as QueryScope }))}>
              <option value="claro">claro</option>
              <option value="competencia">competencia</option>
            </select>
          </label>

          <label>
            Estado
            <select value={form.isActive ? "active" : "inactive"} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.value === "active" }))}>
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
          </label>

          <label>
            Prioridad (1-5)
            <input type="number" min={1} max={5} value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: Math.max(1, Math.min(5, Number.parseInt(event.target.value || "3", 10))) }))} />
          </label>

          <label>
            Max articulos
            <input type="number" min={1} max={500} value={form.maxArticlesPerRun} onChange={(event) => setForm((current) => ({ ...current, maxArticlesPerRun: Math.max(1, Number.parseInt(event.target.value || "100", 10)) }))} />
          </label>

          <label style={{ gridColumn: "span 2" }}>
            Descripcion
            <input value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} maxLength={600} />
          </label>
        </div>

        <div className="panel" style={{ marginTop: 16 }}>
          <h4>Execution Config</h4>
          <div className="form-grid" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
            <label>
              providers_allow
              <input
                value={arrayToCsv(form.execution.providers_allow)}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    execution: { ...current.execution, providers_allow: csvToArray(event.target.value) }
                  }))
                }
              />
            </label>
            <label>
              providers_deny
              <input
                value={arrayToCsv(form.execution.providers_deny)}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    execution: { ...current.execution, providers_deny: csvToArray(event.target.value) }
                  }))
                }
              />
            </label>
            <label>
              countries_allow
              <input
                value={arrayToCsv(form.execution.countries_allow)}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    execution: { ...current.execution, countries_allow: csvToArray(event.target.value) }
                  }))
                }
              />
            </label>
            <label>
              countries_deny
              <input
                value={arrayToCsv(form.execution.countries_deny)}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    execution: { ...current.execution, countries_deny: csvToArray(event.target.value) }
                  }))
                }
              />
            </label>
            <label>
              domains_allow
              <input
                value={arrayToCsv(form.execution.domains_allow)}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    execution: { ...current.execution, domains_allow: csvToArray(event.target.value) }
                  }))
                }
              />
            </label>
            <label>
              domains_deny
              <input
                value={arrayToCsv(form.execution.domains_deny)}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    execution: { ...current.execution, domains_deny: csvToArray(event.target.value) }
                  }))
                }
              />
            </label>
          </div>
        </div>

        <div className="panel" style={{ marginTop: 16 }}>
          <h4>Definition Builder</h4>
          <RuleEditor rule={form.definition} path={[]} />
        </div>

        {!canMutate ? <div className="alert info">Tu rol es {session?.role}. Solo Admin puede guardar, rollback, dry-run y eliminar.</div> : null}
      </form>

      <section className="panel" style={{ marginTop: 16 }}>
        <h3>Revisiones</h3>
        {selectedId ? null : <p>Selecciona una query para ver revisiones.</p>}
        {selectedId && loadingRevisions ? <p>Cargando revisiones...</p> : null}
        {selectedId && !loadingRevisions && revisions.length === 0 ? <p>Sin revisiones disponibles.</p> : null}

        {selectedId && revisions.length > 0 ? (
          <>
            <ul className="term-list">
              {revisions.slice(0, 12).map((revision) => (
                <li key={revision.id} className="term-item">
                  <div>
                    <p className="term-name">Revision #{revision.revision}</p>
                    <p className="term-meta">{revision.created_at} | reason: {revision.change_reason ?? "(sin motivo)"}</p>
                  </div>
                </li>
              ))}
            </ul>

            {canMutate ? (
              <div className="button-row">
                <select
                  value={rollbackRevision ?? ""}
                  onChange={(event) => setRollbackRevision(Number.parseInt(event.target.value, 10))}
                >
                  {revisions.map((revision) => (
                    <option key={revision.id} value={revision.revision}>
                      Revision {revision.revision}
                    </option>
                  ))}
                </select>
                <button className="btn btn-outline" type="button" onClick={onRollback} disabled={!rollbackRevision}>
                  Rollback
                </button>
                <button className="btn btn-outline" type="button" onClick={onDelete}>
                  Hard delete
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      {previewResult ? (
        <section className="panel" style={{ marginTop: 16 }}>
          <h3>Preview</h3>
          <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{JSON.stringify(previewResult, null, 2)}</pre>
        </section>
      ) : null}

      {dryRunResult ? (
        <section className="panel" style={{ marginTop: 16 }}>
          <h3>Dry-run</h3>
          <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{JSON.stringify(dryRunResult, null, 2)}</pre>
        </section>
      ) : null}
    </section>
  );
};
