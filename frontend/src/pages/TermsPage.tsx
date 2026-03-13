import { useEffect, useMemo, useState } from "react";
import {
  type AwarioAlertBinding,
  type AwarioRemoteAlert,
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
import { PageHeader } from "../components/shared/PageHeader";
import { StatusTag } from "../components/shared/StatusTag";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Collapse,
  Flex,
  Form,
  Input,
  InputNumber,
  List,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography
} from "antd";
import {
  DeleteOutlined,
  PlusOutlined,
  ReloadOutlined,
  RollbackOutlined,
  SearchOutlined,
  SyncOutlined,
  ThunderboltOutlined
} from "@ant-design/icons";

const { Text, Paragraph } = Typography;

type QueryEditorMode = "quick" | "advanced";

type QueryEditorState = {
  name: string;
  description: string;
  language: string;
  scope: QueryScope;
  awarioAlertId: string;
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
  awarioAlertId: "",
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
  awarioAlertId: item.awario_alert_id ?? "",
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

const formatBackfillState = (binding: AwarioAlertBinding): string => {
  if (binding.backfill_completed_at) return "completo";
  if (binding.sync_state === "backfilling") return "en progreso";
  if (binding.sync_state === "pending_backfill") return "pendiente";
  if (binding.sync_state === "error") return "error";
  return "-";
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
  const [configTab, setConfigTab] = useState<"news" | "awario">(() => {
    if (typeof window === "undefined") return "news";
    const tab = new URLSearchParams(window.location.search).get("tab");
    return tab === "awario" ? "awario" : "news";
  });

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

  const [awarioAlerts, setAwarioAlerts] = useState<AwarioRemoteAlert[]>([]);
  const [awarioBindings, setAwarioBindings] = useState<AwarioAlertBinding[]>([]);
  const [awarioLoading, setAwarioLoading] = useState(false);
  const [awarioSearch, setAwarioSearch] = useState("");
  const [awarioIncludeInactive, setAwarioIncludeInactive] = useState(false);
  const [awarioInfo, setAwarioInfo] = useState<string | null>(null);
  const [awarioLinkingAlertId, setAwarioLinkingAlertId] = useState<string | null>(null);
  const [awarioBindingActionId, setAwarioBindingActionId] = useState<string | null>(null);

  const selectedQuery = useMemo(() => queries.find((item) => item.id === selectedId) ?? null, [queries, selectedId]);
  const isSelectedQueryBlocked = Boolean(selectedQuery && selectedQuery.awario_link_status === "missing_awario");
  const selectedAwarioAlert = useMemo(
    () => awarioAlerts.find((alert) => alert.alert_id === form.awarioAlertId) ?? null,
    [awarioAlerts, form.awarioAlertId]
  );
  const linkedAwarioAlertIds = useMemo(
    () => new Set(awarioBindings.filter((item) => item.status !== "archived").map((item) => item.awario_alert_id)),
    [awarioBindings]
  );
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

  const loadAwarioConfig = async () => {
    setAwarioLoading(true);
    try {
      const [alertsResponse, bindingsResponse] = await Promise.all([
        client.listAwarioAlerts({
          limit: 200,
          q: awarioSearch.trim() || undefined,
          include_inactive: awarioIncludeInactive
        }),
        client.listAwarioBindings(200)
      ]);
      setAwarioAlerts(alertsResponse.items ?? []);
      setAwarioBindings(bindingsResponse.items ?? []);
    } catch (awarioError) {
      setError((awarioError as Error).message);
      setAwarioAlerts([]);
      setAwarioBindings([]);
    } finally {
      setAwarioLoading(false);
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
    const timeout = window.setTimeout(() => {
      void loadAwarioConfig();
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [awarioSearch, awarioIncludeInactive]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (configTab === "awario") {
      url.searchParams.set("tab", "awario");
    } else {
      url.searchParams.delete("tab");
    }
    window.history.replaceState({}, "", url.toString());
  }, [configTab]);

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
    const awarioAlertId = form.awarioAlertId.trim();
    if (!awarioAlertId) {
      setError("Debes seleccionar una alerta Awario para guardar la query.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const payload: {
        name: string;
        awario_alert_id?: string;
        description: string | null;
        language: string;
        scope: QueryScope;
        is_active: boolean;
        priority: number;
        max_articles_per_run: number;
        definition: QueryDefinition;
        execution: QueryExecutionConfig;
      } = {
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
        const created = await client.createConfigQuery({
          ...payload,
          awario_alert_id: awarioAlertId
        });
        setQueries((current) => [created, ...current.filter((item) => item.id !== created.id)]);
        selectQuery(created);
      } else {
        const shouldRelink =
          selectedQuery?.awario_link_status === "missing_awario" || selectedQuery?.awario_alert_id !== awarioAlertId;
        if (shouldRelink) {
          payload.awario_alert_id = awarioAlertId;
        }
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
    if (!selectedId || !canMutate || isSelectedQueryBlocked) return;

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
    if (!canMutate || !selectedId || isSelectedQueryBlocked) return;

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

  const onLinkAwarioAlert = async (alertId: string) => {
    if (!canMutate) return;
    setAwarioLinkingAlertId(alertId);
    setError(null);
    setAwarioInfo(null);

    try {
      const response = await client.linkAwarioAlert(alertId, {
        status: "active"
      });
      setAwarioInfo(`Alerta vinculada. Backfill encolado: ${response.backfill.run_id}`);
      setForm((current) => ({
        ...current,
        awarioAlertId: alertId
      }));
      await loadAwarioConfig();
    } catch (linkError) {
      setError((linkError as Error).message);
    } finally {
      setAwarioLinkingAlertId(null);
    }
  };

  const onToggleAwarioBindingStatus = async (binding: AwarioAlertBinding) => {
    if (!canMutate) return;
    const nextStatus = binding.status === "active" ? "paused" : "active";
    setAwarioBindingActionId(binding.id);
    setError(null);

    try {
      await client.patchAwarioBinding(binding.id, { status: nextStatus });
      await loadAwarioConfig();
    } catch (statusError) {
      setError((statusError as Error).message);
    } finally {
      setAwarioBindingActionId(null);
    }
  };

  const onRetryAwarioBackfill = async (bindingId: string) => {
    if (!canMutate) return;
    setAwarioBindingActionId(bindingId);
    setError(null);
    setAwarioInfo(null);

    try {
      const response = await client.retryAwarioBindingBackfill(bindingId);
      setAwarioInfo(`Backfill reencolado: ${response.backfill.run_id}`);
      await loadAwarioConfig();
    } catch (retryError) {
      setError((retryError as Error).message);
    } finally {
      setAwarioBindingActionId(null);
    }
  };

  /* ── Ant Design Table column definitions ── */

  const dryRunProviderColumns = [
    { title: "provider", dataIndex: "provider", key: "provider" },
    { title: "raw", dataIndex: "raw_count", key: "raw_count" },
    { title: "fetched", dataIndex: "fetched_count", key: "fetched_count" },
    { title: "matched", dataIndex: "matched_count", key: "matched_count" },
    { title: "duracion(ms)", dataIndex: "duration_ms", key: "duration_ms" },
    {
      title: "error",
      key: "error",
      render: (_: unknown, record: { error_type?: string; error?: string }) =>
        record.error_type ? `${record.error_type}: ${record.error ?? ""}` : "-"
    }
  ];

  const awarioAlertsColumns = [
    {
      title: "Nombre",
      key: "name",
      render: (_: unknown, alert: AwarioRemoteAlert) => alert.name ?? "(sin nombre)"
    },
    { title: "alert_id", dataIndex: "alert_id", key: "alert_id" },
    {
      title: "Estado",
      key: "is_active",
      render: (_: unknown, alert: AwarioRemoteAlert) => (
        <StatusTag status={alert.is_active ? "active" : "inactive"} />
      )
    },
    {
      title: "Accion",
      key: "action",
      render: (_: unknown, alert: AwarioRemoteAlert) => {
        const isLinked = linkedAwarioAlertIds.has(alert.alert_id);
        if (!canMutate) {
          return <Text type="secondary">{isLinked ? "vinculada" : "-"}</Text>;
        }
        return (
          <Button
            onClick={() => void onLinkAwarioAlert(alert.alert_id)}
            disabled={awarioLinkingAlertId === alert.alert_id}
            loading={awarioLinkingAlertId === alert.alert_id}
          >
            {isLinked ? "Re-vincular" : "Vincular"}
          </Button>
        );
      }
    }
  ];

  const awarioBindingsColumns = [
    { title: "alert_id", dataIndex: "awario_alert_id", key: "awario_alert_id" },
    {
      title: "status",
      key: "status",
      render: (_: unknown, binding: AwarioAlertBinding) => <StatusTag status={binding.status} />
    },
    {
      title: "sync_state",
      key: "sync_state",
      render: (_: unknown, binding: AwarioAlertBinding) => <StatusTag status={binding.sync_state} />
    },
    {
      title: "ultimo sync",
      key: "last_sync_at",
      render: (_: unknown, binding: AwarioAlertBinding) => formatDateTime(binding.last_sync_at)
    },
    {
      title: "backfill",
      key: "backfill",
      render: (_: unknown, binding: AwarioAlertBinding) => formatBackfillState(binding)
    },
    {
      title: "error",
      key: "error",
      render: (_: unknown, binding: AwarioAlertBinding) => binding.last_sync_error ?? "-"
    },
    {
      title: "acciones",
      key: "actions",
      render: (_: unknown, binding: AwarioAlertBinding) => (
        <Space direction="vertical" size="small">
          <Space size="small">
            {canMutate ? (
              <Button
                onClick={() => void onToggleAwarioBindingStatus(binding)}
                disabled={awarioBindingActionId === binding.id}
                loading={awarioBindingActionId === binding.id}
              >
                {binding.status === "active" ? "Pausar" : "Reanudar"}
              </Button>
            ) : null}
            {canMutate ? (
              <Button
                onClick={() => void onRetryAwarioBackfill(binding.id)}
                disabled={awarioBindingActionId === binding.id || binding.status !== "active"}
              >
                Reintentar backfill
              </Button>
            ) : null}
          </Space>
          <Collapse
            size="small"
            items={[
              {
                key: "detail",
                label: "Detalle tecnico",
                children: (
                  <Typography.Paragraph
                    code
                    style={{ whiteSpace: "pre-wrap", margin: 0, fontSize: 12 }}
                  >
                    {JSON.stringify(binding.metadata ?? {}, null, 2)}
                  </Typography.Paragraph>
                )
              }
            ]}
          />
        </Space>
      )
    }
  ];

  /* ── Render helpers for sample items (shared between preview and dry-run) ── */

  const renderSampleItem = (item: {
    content_item_id?: string;
    provider?: string;
    canonical_url?: string;
    title?: string;
    published_at?: string | null;
    origin: OriginType;
    medium: string | null;
    tags: string[];
  }) => (
    <div style={{ display: "grid", gap: 4 }}>
      <Text strong>{item.title || "(sin titulo)"}</Text>
      <Text type="secondary">
        {item.provider} | {formatDateTime(item.published_at)}
      </Text>
      <Space size={[4, 4]} wrap>
        <Tag color={item.origin === "news" ? "blue" : "purple"}>{item.origin}</Tag>
        {item.medium ? <Tag>medio:{item.medium}</Tag> : null}
        {item.tags.map((tag) => (
          <Tag key={`${item.content_item_id ?? item.canonical_url}-${tag}`}>{tag}</Tag>
        ))}
      </Space>
      <Text type="secondary" style={{ fontSize: 12 }}>
        {item.canonical_url || "(sin url)"}
      </Text>
    </div>
  );

  /* ── Main render ── */

  return (
    <section>
      <PageHeader
        title="Configurador de Queries"
        subtitle="Gestiona queries de noticias y vinculacion de alertas Awario. Los cambios quedan en configuracion al guardar y corren en la siguiente ejecucion programada."
      />

      <Tabs
        activeKey={configTab}
        onChange={(key) => setConfigTab(key as "news" | "awario")}
        items={[
          {
            key: "news",
            label: "Noticias",
            children: (
              <>
                {error ? <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} /> : null}
                {!canMutate ? (
                  <Alert
                    type="info"
                    showIcon
                    title={`Tu rol es ${session?.role}. Solo Admin puede guardar, rollback, dry-run y eliminar.`}
                    style={{ marginBottom: 16 }}
                  />
                ) : null}

                {/* ── Filters card ── */}
                <Card style={{ marginBottom: 16 }}>
                  <Form layout="vertical">
                    <Row gutter={16}>
                      <Col xs={24} sm={24} md={8}>
                        <Form.Item label="Buscar">
                          <Input
                            value={searchFilter}
                            onChange={(event) => setSearchFilter(event.target.value)}
                            placeholder="nombre o descripcion"
                            prefix={<SearchOutlined />}
                            allowClear
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={12} sm={12} md={4}>
                        <Form.Item label="Scope">
                          <Select
                            value={scopeFilter}
                            onChange={(value) => setScopeFilter(value as QueryScope | "all")}
                            options={[
                              { value: "all", label: "all" },
                              { value: "claro", label: "claro" },
                              { value: "competencia", label: "competencia" }
                            ]}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={12} sm={12} md={4}>
                        <Form.Item label="Estado">
                          <Select
                            value={statusFilter}
                            onChange={(value) => setStatusFilter(value as "all" | "active" | "inactive")}
                            options={[
                              { value: "all", label: "all" },
                              { value: "active", label: "active" },
                              { value: "inactive", label: "inactive" }
                            ]}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={24} md={8}>
                        <Form.Item label=" ">
                          <Space>
                            <Button
                              icon={<ReloadOutlined />}
                              onClick={() => void loadQueries()}
                              disabled={loading}
                            >
                              Recargar
                            </Button>
                            {canMutate ? (
                              <Button type="primary" icon={<PlusOutlined />} onClick={resetToCreate}>
                                Nueva query
                              </Button>
                            ) : null}
                          </Space>
                        </Form.Item>
                      </Col>
                    </Row>
                  </Form>
                </Card>

                {/* ── Queries list card ── */}
                <Card title="Queries registradas" style={{ marginBottom: 16 }}>
                  {loading ? (
                    <Spin />
                  ) : queries.length === 0 ? (
                    <Text type="secondary">No hay queries registradas.</Text>
                  ) : (
                    <List
                      dataSource={queries}
                      renderItem={(item) => (
                        <List.Item
                          key={item.id}
                          onClick={() => selectQuery(item)}
                          style={{
                            cursor: "pointer",
                            border: selectedId === item.id ? "2px solid #1677ff" : "1px solid transparent",
                            borderRadius: 6,
                            padding: "8px 12px",
                            marginBottom: 4
                          }}
                        >
                          <List.Item.Meta
                            title={item.name}
                            description={
                              <Space size={[4, 0]} wrap>
                                <Text type="secondary">{item.language}</Text>
                                <Text type="secondary">|</Text>
                                <Text type="secondary">scope: {item.scope}</Text>
                                <Text type="secondary">|</Text>
                                <StatusTag status={item.is_active ? "active" : "inactive"} />
                                <Text type="secondary">|</Text>
                                <Text type="secondary">rev: {item.current_revision}</Text>
                                <Text type="secondary">|</Text>
                                <Text type="secondary">
                                  awario:{" "}
                                  {item.awario_link_status === "linked"
                                    ? `linked (${item.awario_sync_state ?? "-"})`
                                    : "missing_awario"}
                                </Text>
                              </Space>
                            }
                          />
                        </List.Item>
                      )}
                    />
                  )}
                </Card>

                {/* ── Query editor card (as form) ── */}
                <Card
                  title={
                    <Flex justify="space-between" align="center" wrap="wrap" gap={8}>
                      <span>{isCreating ? "Crear query" : `Editar query: ${selectedQuery?.name ?? ""}`}</span>
                      <Space wrap>
                        <Button
                          icon={<SearchOutlined />}
                          onClick={() => void onPreview()}
                          loading={isPreviewing}
                        >
                          Preview local
                        </Button>
                        {canMutate && selectedId ? (
                          <Button
                            icon={<ThunderboltOutlined />}
                            onClick={() => void onDryRun()}
                            loading={isDryRunning}
                            disabled={isSelectedQueryBlocked}
                          >
                            Dry-run proveedores
                          </Button>
                        ) : null}
                        {canMutate && selectedId ? (
                          <Button
                            icon={<SyncOutlined />}
                            onClick={() => void onManualSync()}
                            loading={isManualSyncing}
                            disabled={isSelectedQueryBlocked}
                          >
                            Sync manual ahora
                          </Button>
                        ) : null}
                        {canMutate ? (
                          <Button
                            type="primary"
                            onClick={(e) => void onSave(e as unknown as React.FormEvent)}
                            loading={isSaving}
                          >
                            {isCreating ? "Crear" : "Guardar cambios"}
                          </Button>
                        ) : null}
                      </Space>
                    </Flex>
                  }
                  style={{ marginBottom: 16 }}
                >
                  <Paragraph type="secondary" style={{ marginBottom: 12 }}>
                    Cambios aplican en la configuracion al guardar, pero impactan la siguiente corrida programada. Usa
                    sync manual si necesitas adelantarla.
                  </Paragraph>

                  {isSelectedQueryBlocked ? (
                    <Alert
                      type="warning"
                      showIcon
                      title="Esta query esta bloqueada operativamente: falta vinculo Awario. Selecciona una alerta y guarda para activarla."
                      style={{ marginBottom: 12 }}
                    />
                  ) : null}
                  {manualSyncInfo ? (
                    <Alert type="info" showIcon title={manualSyncInfo} style={{ marginBottom: 12 }} />
                  ) : null}

                  <Form layout="vertical">
                    <Row gutter={16}>
                      <Col xs={24} sm={12} md={6}>
                        <Form.Item label="Nombre" required>
                          <Input
                            value={form.name}
                            onChange={(event) =>
                              setForm((current) => ({ ...current, name: event.target.value }))
                            }
                            minLength={2}
                            maxLength={160}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={12} md={6}>
                        <Form.Item label="Idioma" required>
                          <Input
                            value={form.language}
                            onChange={(event) =>
                              setForm((current) => ({ ...current, language: event.target.value }))
                            }
                            maxLength={8}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={12} md={6}>
                        <Form.Item label="Scope">
                          <Select
                            value={form.scope}
                            onChange={(value) =>
                              setForm((current) => ({ ...current, scope: value as QueryScope }))
                            }
                            options={[
                              { value: "claro", label: "claro" },
                              { value: "competencia", label: "competencia" }
                            ]}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={12} md={6}>
                        <Form.Item label="Estado">
                          <Select
                            value={form.isActive ? "active" : "inactive"}
                            onChange={(value) =>
                              setForm((current) => ({
                                ...current,
                                isActive: value === "active"
                              }))
                            }
                            options={[
                              { value: "active", label: "active" },
                              { value: "inactive", label: "inactive" }
                            ]}
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={16}>
                      <Col xs={24} sm={12} md={6}>
                        <Form.Item label="Prioridad (1-5)">
                          <InputNumber
                            min={1}
                            max={5}
                            value={form.priority}
                            onChange={(value) =>
                              setForm((current) => ({
                                ...current,
                                priority: Math.max(1, Math.min(5, value ?? 3))
                              }))
                            }
                            style={{ width: "100%" }}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={12} md={6}>
                        <Form.Item label="Max articulos">
                          <InputNumber
                            min={1}
                            max={500}
                            value={form.maxArticlesPerRun}
                            onChange={(value) =>
                              setForm((current) => ({
                                ...current,
                                maxArticlesPerRun: Math.max(1, Math.min(500, value ?? 100))
                              }))
                            }
                            style={{ width: "100%" }}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={24} md={12}>
                        <Form.Item label="Descripcion">
                          <Input
                            value={form.description}
                            onChange={(event) =>
                              setForm((current) => ({ ...current, description: event.target.value }))
                            }
                            maxLength={600}
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={16}>
                      <Col xs={24} sm={24} md={18}>
                        <Form.Item label="Alerta Awario (obligatoria)" required>
                          <Select
                            value={form.awarioAlertId || undefined}
                            onChange={(value) =>
                              setForm((current) => ({ ...current, awarioAlertId: value ?? "" }))
                            }
                            placeholder="Selecciona una alerta de Awario"
                            allowClear
                            showSearch
                            optionFilterProp="label"
                            options={[
                              ...(form.awarioAlertId &&
                              !awarioAlerts.some((item) => item.alert_id === form.awarioAlertId)
                                ? [
                                    {
                                      value: form.awarioAlertId,
                                      label: `${form.awarioAlertId} (no visible en el filtro actual)`
                                    }
                                  ]
                                : []),
                              ...awarioAlerts.map((alert) => ({
                                value: alert.alert_id,
                                label: `${alert.name || alert.alert_id} [${alert.alert_id}]${alert.is_active ? "" : " (inactive)"}`
                              }))
                            ]}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={24} md={6}>
                        <Form.Item label="Buscar alerta">
                          <Input
                            value={awarioSearch}
                            onChange={(event) => setAwarioSearch(event.target.value)}
                            placeholder="nombre o alert_id"
                          />
                        </Form.Item>
                        <Button
                          icon={<ReloadOutlined />}
                          onClick={() => void loadAwarioConfig()}
                          loading={awarioLoading}
                          style={{ width: "100%" }}
                        >
                          Recargar alertas
                        </Button>
                      </Col>
                    </Row>
                  </Form>

                  <Text type="secondary" style={{ display: "block", marginTop: 8 }}>
                    Estado vinculo:{" "}
                    {selectedQuery
                      ? selectedQuery.awario_link_status === "linked"
                        ? `linked (${selectedQuery.awario_sync_state ?? "-"})`
                        : "missing_awario"
                      : form.awarioAlertId
                        ? "seleccionado para crear"
                        : "pendiente"}
                    {selectedAwarioAlert
                      ? ` | alerta: ${selectedAwarioAlert.name ?? selectedAwarioAlert.alert_id}`
                      : ""}
                  </Text>

                  {/* ── Rule definition editor ── */}
                  <Card
                    title={
                      <Flex justify="space-between" align="center" wrap="wrap" gap={8}>
                        <span>Definicion de reglas</span>
                        <Space>
                          <Button
                            type={editorMode === "quick" ? "primary" : "default"}
                            onClick={() => onModeChange("quick")}
                          >
                            Rapido
                          </Button>
                          <Button
                            type={editorMode === "advanced" ? "primary" : "default"}
                            onClick={() => onModeChange("advanced")}
                          >
                            Avanzado (JSON)
                          </Button>
                        </Space>
                      </Flex>
                    }
                    style={{ marginTop: 16 }}
                  >
                    {editorMode === "quick" ? (
                      <div>
                        {!quickCanRepresent ? (
                          <Alert
                            type="warning"
                            showIcon
                            title="Esta query tenia estructura avanzada. Al guardar en modo rapido se reescribe a frases include/exclude."
                            style={{ marginBottom: 12 }}
                          />
                        ) : null}

                        <Form layout="vertical">
                          <Row gutter={16}>
                            <Col xs={24} sm={12}>
                              <Form.Item label="Campo para buscar">
                                <Select
                                  value={quickField}
                                  onChange={(value) =>
                                    setQuickField(value as QueryKeywordRule["field"])
                                  }
                                  options={[
                                    { value: "any", label: "any" },
                                    { value: "title", label: "title" },
                                    { value: "summary", label: "summary" },
                                    { value: "content", label: "content" }
                                  ]}
                                />
                              </Form.Item>
                            </Col>
                            <Col xs={24} sm={12}>
                              <Form.Item label="Tipo de match">
                                <Select
                                  value={quickMatch}
                                  onChange={(value) =>
                                    setQuickMatch(value as QueryKeywordRule["match"])
                                  }
                                  options={[
                                    { value: "phrase", label: "phrase" },
                                    { value: "contains", label: "contains" }
                                  ]}
                                />
                              </Form.Item>
                            </Col>
                          </Row>
                          <Row gutter={16}>
                            <Col span={24}>
                              <Form.Item label="Frases obligatorias (una por linea)">
                                <Input.TextArea
                                  rows={6}
                                  value={quickIncludeText}
                                  onChange={(event) => setQuickIncludeText(event.target.value)}
                                  placeholder={"claro colombia\nclaro hogar\nclaro movil"}
                                />
                              </Form.Item>
                            </Col>
                          </Row>
                          <Row gutter={16}>
                            <Col span={24}>
                              <Form.Item label="Frases excluidas (opcional, una por linea)">
                                <Input.TextArea
                                  rows={4}
                                  value={quickExcludeText}
                                  onChange={(event) => setQuickExcludeText(event.target.value)}
                                  placeholder={"futbol\nentretenimiento"}
                                />
                              </Form.Item>
                            </Col>
                          </Row>
                        </Form>
                      </div>
                    ) : (
                      <div>
                        <Alert
                          type="info"
                          showIcon
                          title="Usa este modo para logica completa AND/OR/NOT y facetas provider/language/country/domain."
                          style={{ marginBottom: 12 }}
                        />

                        <Form layout="vertical">
                          <Form.Item label="Definicion JSON">
                            <Input.TextArea
                              rows={16}
                              value={advancedDefinitionText}
                              onChange={(event) => setAdvancedDefinitionText(event.target.value)}
                              style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                            />
                          </Form.Item>
                        </Form>

                        <Space>
                          <Button onClick={onApplyAdvancedJson}>Aplicar JSON al editor</Button>
                          <Button
                            onClick={() =>
                              setAdvancedDefinitionText(JSON.stringify(form.definition, null, 2))
                            }
                          >
                            Restaurar desde version guardada
                          </Button>
                        </Space>
                      </div>
                    )}
                  </Card>

                  {/* ── Execution filters ── */}
                  <Collapse
                    style={{ marginTop: 12 }}
                    items={[
                      {
                        key: "execution-filters",
                        label: <Text strong>Filtros de ejecucion (opcional)</Text>,
                        children: (
                          <Form layout="vertical">
                            <Row gutter={16}>
                              <Col xs={24} sm={12} md={8}>
                                <Form.Item label="providers_allow">
                                  <Input
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
                                </Form.Item>
                              </Col>
                              <Col xs={24} sm={12} md={8}>
                                <Form.Item label="providers_deny">
                                  <Input
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
                                </Form.Item>
                              </Col>
                              <Col xs={24} sm={12} md={8}>
                                <Form.Item label="countries_allow">
                                  <Input
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
                                </Form.Item>
                              </Col>
                              <Col xs={24} sm={12} md={8}>
                                <Form.Item label="countries_deny">
                                  <Input
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
                                </Form.Item>
                              </Col>
                              <Col xs={24} sm={12} md={8}>
                                <Form.Item label="domains_allow">
                                  <Input
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
                                </Form.Item>
                              </Col>
                              <Col xs={24} sm={12} md={8}>
                                <Form.Item label="domains_deny">
                                  <Input
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
                                </Form.Item>
                              </Col>
                            </Row>
                          </Form>
                        )
                      }
                    ]}
                  />
                </Card>

                {/* ── Revisions card ── */}
                <Card
                  title={
                    <Flex justify="space-between" align="center">
                      <span>Revisiones</span>
                      {selectedQuery ? <Text type="secondary">query_id: {selectedQuery.id}</Text> : null}
                    </Flex>
                  }
                  style={{ marginBottom: 16 }}
                >
                  {!selectedId ? <Text type="secondary">Selecciona una query para ver revisiones.</Text> : null}
                  {selectedId && loadingRevisions ? <Spin /> : null}
                  {selectedId && !loadingRevisions && revisions.length === 0 ? (
                    <Text type="secondary">Sin revisiones disponibles.</Text>
                  ) : null}

                  {selectedId && revisions.length > 0 ? (
                    <>
                      <List
                        dataSource={revisions.slice(0, 12)}
                        renderItem={(revision) => (
                          <List.Item key={revision.id}>
                            <List.Item.Meta
                              title={`Revision #${revision.revision}`}
                              description={`${formatDateTime(revision.created_at)} | reason: ${revision.change_reason ?? "(sin motivo)"}`}
                            />
                          </List.Item>
                        )}
                      />

                      {canMutate ? (
                        <Space style={{ marginTop: 12 }}>
                          <Select
                            value={rollbackRevision ?? undefined}
                            onChange={(value) => setRollbackRevision(value)}
                            style={{ minWidth: 180 }}
                            options={revisions.map((revision) => ({
                              value: revision.revision,
                              label: `Revision ${revision.revision}`
                            }))}
                          />
                          <Button
                            icon={<RollbackOutlined />}
                            onClick={() => void onRollback()}
                            disabled={!rollbackRevision}
                          >
                            Rollback
                          </Button>
                          <Button
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => void onDelete()}
                          >
                            Hard delete
                          </Button>
                        </Space>
                      ) : null}
                    </>
                  ) : null}
                </Card>

                {/* ── Preview local results ── */}
                {previewResult ? (
                  <Card title="Preview local" style={{ marginBottom: 16 }}>
                    <Row gutter={16} style={{ marginBottom: 16 }}>
                      <Col xs={12} sm={12} md={6}>
                        <Card>
                          <Statistic title="Matched" value={previewResult.matched_count} />
                        </Card>
                      </Col>
                      <Col xs={12} sm={12} md={6}>
                        <Card>
                          <Statistic title="Candidates" value={previewResult.candidates_count} />
                        </Card>
                      </Col>
                    </Row>

                    <Typography.Title level={5}>Provider breakdown</Typography.Title>
                    <List
                      size="small"
                      dataSource={previewResult.provider_breakdown}
                      locale={{ emptyText: "Sin datos de proveedores." }}
                      renderItem={(entry) => (
                        <List.Item>
                          <Text strong>{entry.provider}</Text>
                          <Text>{entry.count}</Text>
                        </List.Item>
                      )}
                    />

                    <Typography.Title level={5} style={{ marginTop: 16 }}>
                      Muestra
                    </Typography.Title>
                    <Form layout="vertical">
                      <Row gutter={16}>
                        <Col xs={24} sm={8}>
                          <Form.Item label="Filtrar por origen">
                            <Select
                              value={sampleOriginFilter}
                              onChange={(value) => setSampleOriginFilter(value as OriginType | "all")}
                              options={[
                                { value: "all", label: "all" },
                                { value: "news", label: "news" },
                                { value: "awario", label: "awario" }
                              ]}
                            />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={16}>
                          <Form.Item label="Filtrar por tag exacto">
                            <Input
                              value={sampleTagFilter}
                              onChange={(event) => setSampleTagFilter(event.target.value)}
                              placeholder="origin:news, provider:newsapi, medium:cnn"
                            />
                          </Form.Item>
                        </Col>
                      </Row>
                    </Form>
                    <Text type="secondary">
                      Mostrando {filteredPreviewSample.length} de {previewResult.sample.length} items de
                      muestra.
                    </Text>
                    <List
                      style={{ marginTop: 8 }}
                      dataSource={filteredPreviewSample}
                      locale={{ emptyText: "No hubo coincidencias para la muestra con estos filtros." }}
                      renderItem={(item) => (
                        <List.Item key={item.content_item_id}>{renderSampleItem(item)}</List.Item>
                      )}
                    />

                    <Collapse
                      style={{ marginTop: 12 }}
                      items={[
                        {
                          key: "preview-json",
                          label: <Text strong>Ver JSON</Text>,
                          children: (
                            <Typography.Paragraph
                              code
                              style={{ whiteSpace: "pre-wrap", margin: 0, fontSize: 12 }}
                            >
                              {JSON.stringify(previewResult, null, 2)}
                            </Typography.Paragraph>
                          )
                        }
                      ]}
                    />
                  </Card>
                ) : null}

                {/* ── Dry-run results ── */}
                {dryRunResult ? (
                  <Card title="Dry-run proveedores" style={{ marginBottom: 16 }}>
                    <Row gutter={16} style={{ marginBottom: 16 }}>
                      <Col xs={12} sm={6}>
                        <Card>
                          <Statistic title="Raw" value={dryRunResult.totals.raw_count} />
                        </Card>
                      </Col>
                      <Col xs={12} sm={6}>
                        <Card>
                          <Statistic title="Fetched" value={dryRunResult.totals.fetched_count} />
                        </Card>
                      </Col>
                      <Col xs={12} sm={6}>
                        <Card>
                          <Statistic title="Matched" value={dryRunResult.totals.matched_count} />
                        </Card>
                      </Col>
                      <Col xs={12} sm={6}>
                        <Card>
                          <Statistic
                            title="Origin"
                            value={
                              Object.entries(dryRunResult.totals.origin_breakdown)
                                .map(([origin, count]) => `${origin}:${count}`)
                                .join(" | ") || "-"
                            }
                            valueStyle={{ fontSize: "1.2rem" }}
                          />
                        </Card>
                      </Col>
                    </Row>

                    <Table
                      dataSource={dryRunResult.providers}
                      columns={dryRunProviderColumns}
                      rowKey="provider"
                      pagination={false}
                      size="small"
                      scroll={{ x: true }}
                    />

                    <Typography.Title level={5} style={{ marginTop: 16 }}>
                      Muestra dry-run
                    </Typography.Title>
                    <Text type="secondary">
                      Mostrando {filteredDryRunSample.length} de {dryRunResult.sample.length} items de
                      muestra.
                    </Text>
                    <List
                      style={{ marginTop: 8 }}
                      dataSource={filteredDryRunSample}
                      locale={{ emptyText: "No hubo coincidencias para la muestra con estos filtros." }}
                      renderItem={(item) => (
                        <List.Item key={`${item.provider}-${item.canonical_url}`}>
                          {renderSampleItem(item)}
                        </List.Item>
                      )}
                    />

                    <Collapse
                      style={{ marginTop: 12 }}
                      items={[
                        {
                          key: "dryrun-json",
                          label: <Text strong>Ver JSON</Text>,
                          children: (
                            <Typography.Paragraph
                              code
                              style={{ whiteSpace: "pre-wrap", margin: 0, fontSize: 12 }}
                            >
                              {JSON.stringify(dryRunResult, null, 2)}
                            </Typography.Paragraph>
                          )
                        }
                      ]}
                    />
                  </Card>
                ) : null}
              </>
            )
          },
          {
            key: "awario",
            label: "Awario",
            children: (
              <>
                {error ? <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} /> : null}
                {!canMutate ? (
                  <Alert
                    type="info"
                    showIcon
                    title={`Tu rol es ${session?.role}. Solo Admin puede vincular, pausar/reanudar y reintentar backfill.`}
                    style={{ marginBottom: 16 }}
                  />
                ) : null}
                {awarioInfo ? (
                  <Alert type="info" showIcon title={awarioInfo} style={{ marginBottom: 16 }} />
                ) : null}

                {/* ── Available Awario alerts ── */}
                <Card
                  title={
                    <Flex justify="space-between" align="center">
                      <span>Alertas disponibles en Awario</span>
                      <Button
                        icon={<ReloadOutlined />}
                        onClick={() => void loadAwarioConfig()}
                        loading={awarioLoading}
                      >
                        Recargar
                      </Button>
                    </Flex>
                  }
                  style={{ marginBottom: 16 }}
                >
                  <Form layout="vertical">
                    <Row gutter={16} align="bottom">
                      <Col xs={24} sm={12} md={10}>
                        <Form.Item label="Buscar alerta">
                          <Input
                            value={awarioSearch}
                            onChange={(event) => setAwarioSearch(event.target.value)}
                            placeholder="nombre o alert_id"
                            prefix={<SearchOutlined />}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={12} sm={6} md={6}>
                        <Form.Item label=" ">
                          <Checkbox
                            checked={awarioIncludeInactive}
                            onChange={(event) => setAwarioIncludeInactive(event.target.checked)}
                          >
                            incluir inactivas
                          </Checkbox>
                        </Form.Item>
                      </Col>
                      <Col xs={12} sm={6} md={4}>
                        <Form.Item label=" ">
                          <Text type="secondary">items: {awarioAlerts.length}</Text>
                        </Form.Item>
                      </Col>
                    </Row>
                  </Form>

                  {awarioLoading ? (
                    <Spin style={{ marginTop: 10 }} />
                  ) : awarioAlerts.length === 0 ? (
                    <Text type="secondary">No hay alertas remotas para mostrar.</Text>
                  ) : (
                    <Table
                      dataSource={awarioAlerts}
                      columns={awarioAlertsColumns}
                      rowKey="alert_id"
                      pagination={false}
                      size="small"
                      scroll={{ x: true }}
                      style={{ marginTop: 12 }}
                    />
                  )}
                </Card>

                {/* ── Linked Awario bindings ── */}
                <Card
                  title={
                    <Flex justify="space-between" align="center">
                      <span>Alertas vinculadas</span>
                      <Text type="secondary">{awarioBindings.length} bindings</Text>
                    </Flex>
                  }
                  style={{ marginBottom: 16 }}
                >
                  {awarioLoading ? (
                    <Spin />
                  ) : awarioBindings.length === 0 ? (
                    <Text type="secondary">Sin bindings configurados.</Text>
                  ) : (
                    <Table
                      dataSource={awarioBindings}
                      columns={awarioBindingsColumns}
                      rowKey="id"
                      pagination={false}
                      size="small"
                      scroll={{ x: true }}
                    />
                  )}
                </Card>
              </>
            )
          }
        ]}
      />
    </section>
  );
};
