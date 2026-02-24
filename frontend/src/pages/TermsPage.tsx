import { useEffect, useMemo, useState } from "react";
import {
  ApiError,
  type ConfigQuery,
  type OriginType,
  type QueryDefinition,
  type QueryDryRunResponse,
  type QueryExecutionConfig,
  type QueryKeywordRule,
  type QueryPreviewResponse,
  type QueryRevision,
  type QueryRule,
  type QueryRuleGroup,
  type QueryScope
} from "../api/client";
import { useApiClient } from "../api/useApiClient";
import { useAuth } from "../auth/AuthContext";

type QueryEditorMode = "quick" | "advanced";

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

type QuickDefinitionDraft = {
  field: QueryKeywordRule["field"];
  match: QueryKeywordRule["match"];
  include: string[];
  exclude: string[];
  canRepresent: boolean;
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

const createDefaultForm = (): QueryEditorState => ({
  name: "",
  description: "",
  language: "es",
  scope: "claro",
  isActive: true,
  priority: 3,
  maxArticlesPerRun: 100,
  definition: defaultDefinition(),
  execution: {
    providers_allow: [],
    providers_deny: [],
    countries_allow: [],
    countries_deny: [],
    domains_allow: [],
    domains_deny: []
  }
});

const deepClone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const dedupeNonEmpty = (values: string[]): string[] =>
  Array.from(
    new Set(
      values
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => item.slice(0, 160))
    )
  );

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

const textToArray = (value: string): string[] =>
  dedupeNonEmpty(
    value
      .split(/\r?\n|,/g)
      .map((item) => item.trim())
      .filter(Boolean)
  );

const arrayToText = (value: string[]): string => value.join("\n");

const extractQuickDraft = (definition: QueryDefinition): QuickDefinitionDraft => {
  const include: string[] = [];
  const exclude: string[] = [];

  let field: QueryKeywordRule["field"] = "any";
  let match: QueryKeywordRule["match"] = "phrase";
  let hasKeywordBase = false;
  let canRepresent = definition.kind === "group" && definition.op === "AND";

  const captureKeyword = (rule: QueryKeywordRule, allowNot: boolean): boolean => {
    const value = rule.value.trim();
    if (!value) return false;

    if (!hasKeywordBase) {
      field = rule.field;
      match = rule.match;
      hasKeywordBase = true;
    } else if (rule.field !== field || rule.match !== match) {
      return false;
    }

    if (rule.not) {
      if (!allowNot) return false;
      exclude.push(value);
    } else {
      include.push(value);
    }

    return true;
  };

  for (const rule of definition.rules) {
    if (rule.kind === "keyword") {
      if (!captureKeyword(rule, true)) canRepresent = false;
      continue;
    }

    if (rule.kind === "group") {
      if (rule.op !== "OR") {
        canRepresent = false;
        continue;
      }

      for (const nestedRule of rule.rules) {
        if (nestedRule.kind !== "keyword") {
          canRepresent = false;
          continue;
        }

        if (!captureKeyword(nestedRule, false)) canRepresent = false;
      }
      continue;
    }

    canRepresent = false;
  }

  const normalizedInclude = dedupeNonEmpty(include);
  const normalizedExclude = dedupeNonEmpty(exclude);

  return {
    field,
    match,
    include: normalizedInclude,
    exclude: normalizedExclude,
    canRepresent: canRepresent && normalizedInclude.length > 0
  };
};

const buildQuickDefinition = (input: {
  field: QueryKeywordRule["field"];
  match: QueryKeywordRule["match"];
  includeText: string;
  excludeText: string;
}): { definition: QueryDefinition | null; error: string | null } => {
  const include = textToArray(input.includeText);
  const exclude = textToArray(input.excludeText);

  if (include.length === 0) {
    return {
      definition: null,
      error: "Debes incluir al menos una frase obligatoria en modo rapido."
    };
  }

  const includeRules: QueryKeywordRule[] = include.map((value) => ({
    kind: "keyword",
    field: input.field,
    match: input.match,
    value
  }));

  const excludeRules: QueryKeywordRule[] = exclude.map((value) => ({
    kind: "keyword",
    field: input.field,
    match: input.match,
    value,
    not: true
  }));

  const rules: QueryRule[] = [];

  if (includeRules.length === 1) {
    rules.push(includeRules[0]);
  } else {
    rules.push({
      kind: "group",
      op: "OR",
      rules: includeRules
    });
  }

  rules.push(...excludeRules);

  return {
    definition: {
      kind: "group",
      op: "AND",
      rules
    },
    error: null
  };
};

const parseAdvancedDefinition = (value: string): { definition: QueryDefinition | null; error: string | null } => {
  try {
    const parsed = JSON.parse(value) as QueryDefinition;
    if (!parsed || parsed.kind !== "group" || !Array.isArray((parsed as QueryRuleGroup).rules)) {
      return {
        definition: null,
        error: "El JSON debe ser un objeto raiz con kind='group' y rules[]."
      };
    }
    return { definition: parsed, error: null };
  } catch (error) {
    return {
      definition: null,
      error: `JSON invalido: ${(error as Error).message}`
    };
  }
};

const formatDateTime = (value: string | null | undefined): string => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
};

type OriginSampleItem = {
  origin: OriginType;
  medium: string | null;
  tags: string[];
};

const normalizeTagToken = (value: string): string => value.trim().toLowerCase();

const matchesSampleFilters = (
  item: OriginSampleItem,
  originFilter: OriginType | "all",
  tagFilter: string
): boolean => {
  if (originFilter !== "all" && item.origin !== originFilter) {
    return false;
  }

  const normalizedTag = normalizeTagToken(tagFilter);
  if (!normalizedTag) return true;

  return item.tags.some((tag) => normalizeTagToken(tag) === normalizedTag);
};

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
  const [form, setForm] = useState<QueryEditorState>(() => createDefaultForm());
  const [isCreating, setIsCreating] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [editorMode, setEditorMode] = useState<QueryEditorMode>("quick");
  const [quickField, setQuickField] = useState<QueryKeywordRule["field"]>("any");
  const [quickMatch, setQuickMatch] = useState<QueryKeywordRule["match"]>("phrase");
  const [quickIncludeText, setQuickIncludeText] = useState("claro colombia");
  const [quickExcludeText, setQuickExcludeText] = useState("");
  const [quickCanRepresent, setQuickCanRepresent] = useState(true);
  const [advancedDefinitionText, setAdvancedDefinitionText] = useState(
    JSON.stringify(defaultDefinition(), null, 2)
  );

  const [revisions, setRevisions] = useState<QueryRevision[]>([]);
  const [loadingRevisions, setLoadingRevisions] = useState(false);
  const [rollbackRevision, setRollbackRevision] = useState<number | null>(null);

  const [previewResult, setPreviewResult] = useState<QueryPreviewResponse | null>(null);
  const [dryRunResult, setDryRunResult] = useState<QueryDryRunResponse | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isDryRunning, setIsDryRunning] = useState(false);
  const [sampleOriginFilter, setSampleOriginFilter] = useState<OriginType | "all">("all");
  const [sampleTagFilter, setSampleTagFilter] = useState("");
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [manualSyncInfo, setManualSyncInfo] = useState<string | null>(null);

  const selectedQuery = useMemo(() => queries.find((item) => item.id === selectedId) ?? null, [queries, selectedId]);
  const filteredPreviewSample = useMemo(
    () =>
      (previewResult?.sample ?? []).filter((item) =>
        matchesSampleFilters(item, sampleOriginFilter, sampleTagFilter)
      ),
    [previewResult, sampleOriginFilter, sampleTagFilter]
  );
  const filteredDryRunSample = useMemo(
    () =>
      (dryRunResult?.sample ?? []).filter((item) =>
        matchesSampleFilters(item, sampleOriginFilter, sampleTagFilter)
      ),
    [dryRunResult, sampleOriginFilter, sampleTagFilter]
  );

  const hydrateDefinitionEditors = (definition: QueryDefinition, preferredMode?: QueryEditorMode) => {
    const quickDraft = extractQuickDraft(definition);

    setQuickField(quickDraft.field);
    setQuickMatch(quickDraft.match);
    setQuickIncludeText(arrayToText(quickDraft.include.length > 0 ? quickDraft.include : ["claro colombia"]));
    setQuickExcludeText(arrayToText(quickDraft.exclude));
    setQuickCanRepresent(quickDraft.canRepresent);
    setAdvancedDefinitionText(JSON.stringify(definition, null, 2));

    if (preferredMode) {
      if (preferredMode === "quick" && !quickDraft.canRepresent) {
        setEditorMode("advanced");
        return;
      }
      setEditorMode(preferredMode);
      return;
    }

    setEditorMode(quickDraft.canRepresent ? "quick" : "advanced");
  };

  const applyFormState = (nextForm: QueryEditorState, preferredMode?: QueryEditorMode) => {
    setForm(nextForm);
    hydrateDefinitionEditors(nextForm.definition, preferredMode);
  };

  const resolveDefinitionFromEditor = (options: { silent?: boolean } = {}): QueryDefinition | null => {
    if (editorMode === "quick") {
      const { definition, error: buildError } = buildQuickDefinition({
        field: quickField,
        match: quickMatch,
        includeText: quickIncludeText,
        excludeText: quickExcludeText
      });

      if (!definition) {
        if (!options.silent) setError(buildError);
        return null;
      }

      return definition;
    }

    const { definition, error: parseError } = parseAdvancedDefinition(advancedDefinitionText);
    if (!definition) {
      if (!options.silent) setError(parseError);
      return null;
    }

    return definition;
  };

  const syncAdvancedEditorFromCurrentState = () => {
    const definition = resolveDefinitionFromEditor({ silent: true }) ?? form.definition;
    setAdvancedDefinitionText(JSON.stringify(definition, null, 2));
  };

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

      if (selectedId) {
        const currentSelected = items.find((item) => item.id === selectedId);
        if (currentSelected && !isCreating) {
          applyFormState(toForm(currentSelected), editorMode);
          return;
        }
      }

      if (items.length > 0) {
        setSelectedId(items[0].id);
        setIsCreating(false);
        applyFormState(toForm(items[0]));
      } else {
        const nextForm = createDefaultForm();
        setSelectedId(null);
        setIsCreating(true);
        applyFormState(nextForm, "quick");
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
    const nextForm = createDefaultForm();
    setIsCreating(true);
    setSelectedId(null);
    setPreviewResult(null);
    setDryRunResult(null);
    setManualSyncInfo(null);
    setRevisions([]);
    setRollbackRevision(null);
    applyFormState(nextForm, "quick");
    setError(null);
  };

  const selectQuery = (item: ConfigQuery) => {
    setIsCreating(false);
    setSelectedId(item.id);
    setPreviewResult(null);
    setDryRunResult(null);
    setManualSyncInfo(null);
    applyFormState(toForm(item));
    setError(null);
  };

  const onModeChange = (mode: QueryEditorMode) => {
    if (mode === editorMode) return;

    if (mode === "advanced") {
      syncAdvancedEditorFromCurrentState();
      setEditorMode("advanced");
      return;
    }

    if (!quickCanRepresent) {
      const confirmed = window.confirm(
        "Esta query usa reglas avanzadas (grupos/facets complejos). Pasar a modo rapido reescribe la definicion actual."
      );
      if (!confirmed) return;
    }

    setEditorMode("quick");
  };

  const onApplyAdvancedJson = () => {
    const { definition, error: parseError } = parseAdvancedDefinition(advancedDefinitionText);
    if (!definition) {
      setError(parseError);
      return;
    }

    setForm((current) => ({ ...current, definition }));
    hydrateDefinitionEditors(definition, "advanced");
    setError(null);
  };

  const onSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canMutate) return;

    const definition = resolveDefinitionFromEditor();
    if (!definition) return;

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
        definition,
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

    const confirmation = window.prompt(`Escribe exactamente '${selectedQuery.name}' para confirmar eliminacion:`);
    if (confirmation !== selectedQuery.name) {
      setError("El texto de confirmacion no coincide. No se elimino la query.");
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
    const definition = resolveDefinitionFromEditor();
    if (!definition) return;

    setIsPreviewing(true);
    setError(null);
    setPreviewResult(null);

    try {
      const result = await client.previewConfigQuery({
        definition,
        execution: form.execution,
        limit: 20,
        candidate_limit: 200
      });
      setPreviewResult(result);
      setForm((current) => ({ ...current, definition }));
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
      setDryRunResult(result);
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

  return (
    <section>
      <header className="page-header">
        <h2>Configurador de Queries (Noticias)</h2>
        <p>
          Flujo simplificado: editor rapido para frases + editor avanzado JSON para AND/OR/NOT y facetas.
          Los cambios quedan en configuracion al guardar y corren en la siguiente ejecucion programada.
        </p>
      </header>

      {error ? <div className="alert error">{error}</div> : null}
      {!canMutate ? (
        <div className="alert info">Tu rol es {session?.role}. Solo Admin puede guardar, rollback, dry-run y eliminar.</div>
      ) : null}

      <section className="panel">
        <div className="form-grid" style={{ gridTemplateColumns: "2fr 1fr 1fr auto" }}>
          <label>
            Buscar
            <input
              value={searchFilter}
              onChange={(event) => setSearchFilter(event.target.value)}
              placeholder="nombre o descripcion"
            />
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
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "all" | "active" | "inactive")}
            >
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
            <li
              key={item.id}
              className="term-item"
              style={{
                cursor: "pointer",
                border: selectedId === item.id ? "1px solid var(--color-accent, #2f6fed)" : undefined
              }}
              onClick={() => selectQuery(item)}
            >
              <div>
                <p className="term-name">{item.name}</p>
                <p className="term-meta">
                  {item.language} | scope: {item.scope} | estado: {item.is_active ? "active" : "inactive"} | rev: {item.current_revision}
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
          Cambios aplican en la configuracion al guardar, pero impactan la siguiente corrida programada. Usa sync manual si necesitas adelantarla.
        </p>
        {manualSyncInfo ? <div className="alert info">{manualSyncInfo}</div> : null}

        <div className="form-grid" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
          <label>
            Nombre
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              required
              minLength={2}
              maxLength={160}
            />
          </label>

          <label>
            Idioma
            <input
              value={form.language}
              onChange={(event) => setForm((current) => ({ ...current, language: event.target.value }))}
              maxLength={8}
              required
            />
          </label>

          <label>
            Scope
            <select
              value={form.scope}
              onChange={(event) => setForm((current) => ({ ...current, scope: event.target.value as QueryScope }))}
            >
              <option value="claro">claro</option>
              <option value="competencia">competencia</option>
            </select>
          </label>

          <label>
            Estado
            <select
              value={form.isActive ? "active" : "inactive"}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  isActive: event.target.value === "active"
                }))
              }
            >
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
          </label>

          <label>
            Prioridad (1-5)
            <input
              type="number"
              min={1}
              max={5}
              value={form.priority}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  priority: Math.max(1, Math.min(5, Number.parseInt(event.target.value || "3", 10)))
                }))
              }
            />
          </label>

          <label>
            Max articulos
            <input
              type="number"
              min={1}
              max={500}
              value={form.maxArticlesPerRun}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  maxArticlesPerRun: Math.max(1, Math.min(500, Number.parseInt(event.target.value || "100", 10)))
                }))
              }
            />
          </label>

          <label style={{ gridColumn: "span 2" }}>
            Descripcion
            <input
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              maxLength={600}
            />
          </label>
        </div>

        <section className="panel" style={{ marginTop: 16 }}>
          <div className="section-title-row">
            <h4>Definicion de reglas</h4>
            <div className="button-row" role="group" aria-label="Modo de editor">
              <button
                type="button"
                className={editorMode === "quick" ? "btn btn-primary" : "btn btn-outline"}
                onClick={() => onModeChange("quick")}
              >
                Rapido
              </button>
              <button
                type="button"
                className={editorMode === "advanced" ? "btn btn-primary" : "btn btn-outline"}
                onClick={() => onModeChange("advanced")}
              >
                Avanzado (JSON)
              </button>
            </div>
          </div>

          {editorMode === "quick" ? (
            <div style={{ display: "grid", gap: 12 }}>
              {!quickCanRepresent ? (
                <div className="alert warning" style={{ marginBottom: 0 }}>
                  Esta query tenia estructura avanzada. Al guardar en modo rapido se reescribe a frases include/exclude.
                </div>
              ) : null}

              <div className="form-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                <label>
                  Campo para buscar
                  <select
                    value={quickField}
                    onChange={(event) => setQuickField(event.target.value as QueryKeywordRule["field"])}
                  >
                    <option value="any">any</option>
                    <option value="title">title</option>
                    <option value="summary">summary</option>
                    <option value="content">content</option>
                  </select>
                </label>

                <label>
                  Tipo de match
                  <select
                    value={quickMatch}
                    onChange={(event) => setQuickMatch(event.target.value as QueryKeywordRule["match"])}
                  >
                    <option value="phrase">phrase</option>
                    <option value="contains">contains</option>
                  </select>
                </label>

                <label style={{ gridColumn: "span 2" }}>
                  Frases obligatorias (una por linea)
                  <textarea
                    rows={6}
                    value={quickIncludeText}
                    onChange={(event) => setQuickIncludeText(event.target.value)}
                    placeholder={"claro colombia\nclaro hogar\nclaro movil"}
                  />
                </label>

                <label style={{ gridColumn: "span 2" }}>
                  Frases excluidas (opcional, una por linea)
                  <textarea
                    rows={4}
                    value={quickExcludeText}
                    onChange={(event) => setQuickExcludeText(event.target.value)}
                    placeholder={"futbol\nentretenimiento"}
                  />
                </label>
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              <div className="alert info" style={{ marginBottom: 0 }}>
                Usa este modo para logica completa AND/OR/NOT y facetas provider/language/country/domain.
              </div>

              <label>
                Definicion JSON
                <textarea
                  rows={16}
                  value={advancedDefinitionText}
                  onChange={(event) => setAdvancedDefinitionText(event.target.value)}
                  style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                />
              </label>

              <div className="button-row">
                <button type="button" className="btn btn-outline" onClick={onApplyAdvancedJson}>
                  Aplicar JSON al editor
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setAdvancedDefinitionText(JSON.stringify(form.definition, null, 2))}
                >
                  Restaurar desde version guardada
                </button>
              </div>
            </div>
          )}
        </section>

        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>Filtros de ejecucion (opcional)</summary>
          <div className="form-grid" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))", marginTop: 12 }}>
            <label>
              providers_allow
              <input
                value={arrayToCsv(form.execution.providers_allow)}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    execution: {
                      ...current.execution,
                      providers_allow: csvToArray(event.target.value)
                    }
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
                    execution: {
                      ...current.execution,
                      providers_deny: csvToArray(event.target.value)
                    }
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
                    execution: {
                      ...current.execution,
                      countries_allow: csvToArray(event.target.value)
                    }
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
                    execution: {
                      ...current.execution,
                      countries_deny: csvToArray(event.target.value)
                    }
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
                    execution: {
                      ...current.execution,
                      domains_allow: csvToArray(event.target.value)
                    }
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
                    execution: {
                      ...current.execution,
                      domains_deny: csvToArray(event.target.value)
                    }
                  }))
                }
              />
            </label>
          </div>
        </details>
      </form>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="section-title-row">
          <h3>Revisiones</h3>
          {selectedQuery ? <span className="term-meta">query_id: {selectedQuery.id}</span> : null}
        </div>
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
                    <p className="term-meta">
                      {formatDateTime(revision.created_at)} | reason: {revision.change_reason ?? "(sin motivo)"}
                    </p>
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
          <h3>Preview local</h3>
          <div className="kpi-grid" style={{ marginBottom: 12 }}>
            <article className="panel kpi-card" style={{ marginBottom: 0 }}>
              <span className="kpi-caption">Matched</span>
              <strong className="kpi-value">{previewResult.matched_count}</strong>
            </article>
            <article className="panel kpi-card" style={{ marginBottom: 0 }}>
              <span className="kpi-caption">Candidates</span>
              <strong className="kpi-value">{previewResult.candidates_count}</strong>
            </article>
          </div>

          <h4>Provider breakdown</h4>
          <ul className="simple-list simple-list--stacked" style={{ marginTop: 8 }}>
            {previewResult.provider_breakdown.map((entry) => (
              <li key={`${entry.provider}-${entry.count}`}>
                <strong>{entry.provider}</strong>
                <span>{entry.count}</span>
              </li>
            ))}
            {previewResult.provider_breakdown.length === 0 ? <li>Sin datos de proveedores.</li> : null}
          </ul>

          <h4 style={{ marginTop: 12 }}>Muestra</h4>
          <div className="form-grid" style={{ gridTemplateColumns: "220px minmax(0, 1fr)", marginTop: 8 }}>
            <label>
              Filtrar por origen
              <select
                value={sampleOriginFilter}
                onChange={(event) => setSampleOriginFilter(event.target.value as OriginType | "all")}
              >
                <option value="all">all</option>
                <option value="news">news</option>
                <option value="awario">awario</option>
              </select>
            </label>
            <label>
              Filtrar por tag exacto
              <input
                value={sampleTagFilter}
                onChange={(event) => setSampleTagFilter(event.target.value)}
                placeholder="origin:news, provider:newsapi, medium:cnn"
              />
            </label>
          </div>
          <p className="term-meta" style={{ marginTop: 8 }}>
            Mostrando {filteredPreviewSample.length} de {previewResult.sample.length} items de muestra.
          </p>
          <ul className="simple-list simple-list--stacked" style={{ marginTop: 8 }}>
            {filteredPreviewSample.map((item) => (
              <li key={item.content_item_id}>
                <div style={{ display: "grid", gap: 4 }}>
                  <strong>{item.title || "(sin titulo)"}</strong>
                  <span className="term-meta">
                    {item.provider} | {formatDateTime(item.published_at)}
                  </span>
                  <div className="origin-chip-row">
                    <span className={`origin-chip origin-chip-${item.origin}`}>{item.origin}</span>
                    {item.medium ? <span className="origin-chip">medio:{item.medium}</span> : null}
                    {item.tags.map((tag) => (
                      <span className="origin-chip" key={`${item.content_item_id}-${tag}`}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <span className="term-meta">{item.canonical_url || "(sin url)"}</span>
                </div>
              </li>
            ))}
            {filteredPreviewSample.length === 0 ? <li>No hubo coincidencias para la muestra con estos filtros.</li> : null}
          </ul>

          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: "pointer", fontWeight: 700 }}>Ver JSON</summary>
            <pre style={{ whiteSpace: "pre-wrap", marginTop: 10 }}>{JSON.stringify(previewResult, null, 2)}</pre>
          </details>
        </section>
      ) : null}

      {dryRunResult ? (
        <section className="panel" style={{ marginTop: 16 }}>
          <h3>Dry-run proveedores</h3>
          <div className="kpi-grid" style={{ marginBottom: 12 }}>
            <article className="panel kpi-card" style={{ marginBottom: 0 }}>
              <span className="kpi-caption">Raw</span>
              <strong className="kpi-value">{dryRunResult.totals.raw_count}</strong>
            </article>
            <article className="panel kpi-card" style={{ marginBottom: 0 }}>
              <span className="kpi-caption">Fetched</span>
              <strong className="kpi-value">{dryRunResult.totals.fetched_count}</strong>
            </article>
            <article className="panel kpi-card" style={{ marginBottom: 0 }}>
              <span className="kpi-caption">Matched</span>
              <strong className="kpi-value">{dryRunResult.totals.matched_count}</strong>
            </article>
            <article className="panel kpi-card" style={{ marginBottom: 0 }}>
              <span className="kpi-caption">Origin</span>
              <strong className="kpi-value" style={{ fontSize: "1.2rem" }}>
                {Object.entries(dryRunResult.totals.origin_breakdown)
                  .map(([origin, count]) => `${origin}:${count}`)
                  .join(" | ") || "-"}
              </strong>
            </article>
          </div>

          <div className="incident-table-wrapper">
            <table className="incident-table">
              <thead>
                <tr>
                  <th>provider</th>
                  <th>raw</th>
                  <th>fetched</th>
                  <th>matched</th>
                  <th>duracion(ms)</th>
                  <th>error</th>
                </tr>
              </thead>
              <tbody>
                {dryRunResult.providers.map((provider) => (
                  <tr key={provider.provider}>
                    <td>{provider.provider}</td>
                    <td>{provider.raw_count}</td>
                    <td>{provider.fetched_count}</td>
                    <td>{provider.matched_count}</td>
                    <td>{provider.duration_ms}</td>
                    <td>{provider.error_type ? `${provider.error_type}: ${provider.error ?? ""}` : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h4 style={{ marginTop: 12 }}>Muestra dry-run</h4>
          <p className="term-meta" style={{ marginTop: 4 }}>
            Mostrando {filteredDryRunSample.length} de {dryRunResult.sample.length} items de muestra.
          </p>
          <ul className="simple-list simple-list--stacked" style={{ marginTop: 8 }}>
            {filteredDryRunSample.map((item) => (
              <li key={`${item.provider}-${item.canonical_url}`}>
                <div style={{ display: "grid", gap: 4 }}>
                  <strong>{item.title || "(sin titulo)"}</strong>
                  <span className="term-meta">
                    {item.provider} | {formatDateTime(item.published_at)}
                  </span>
                  <div className="origin-chip-row">
                    <span className={`origin-chip origin-chip-${item.origin}`}>{item.origin}</span>
                    {item.medium ? <span className="origin-chip">medio:{item.medium}</span> : null}
                    {item.tags.map((tag) => (
                      <span className="origin-chip" key={`${item.provider}-${item.canonical_url}-${tag}`}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <span className="term-meta">{item.canonical_url || "(sin url)"}</span>
                </div>
              </li>
            ))}
            {filteredDryRunSample.length === 0 ? <li>No hubo coincidencias para la muestra con estos filtros.</li> : null}
          </ul>

          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: "pointer", fontWeight: 700 }}>Ver JSON</summary>
            <pre style={{ whiteSpace: "pre-wrap", marginTop: 10 }}>{JSON.stringify(dryRunResult, null, 2)}</pre>
          </details>
        </section>
      ) : null}
    </section>
  );
};
