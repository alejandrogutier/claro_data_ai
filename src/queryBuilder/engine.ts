export type QueryScope = "claro" | "competencia";

export type RuleGroup = {
  kind: "group";
  op: "AND" | "OR";
  rules: Rule[];
};

export type KeywordRule = {
  kind: "keyword";
  field: "any" | "title" | "summary" | "content";
  match: "contains" | "phrase";
  value: string;
  not?: boolean;
};

export type FacetRule = {
  kind: "provider" | "language" | "country" | "domain";
  op: "in" | "not_in";
  values: string[];
};

export type Rule = RuleGroup | KeywordRule | FacetRule;

export type QueryDefinition = RuleGroup;

export type QueryExecutionConfig = {
  providers_allow: string[];
  providers_deny: string[];
  countries_allow: string[];
  countries_deny: string[];
  domains_allow: string[];
  domains_deny: string[];
};

export type CompiledQueryDefinition = {
  version: "qb-v1";
  query: string;
  keywords: string[];
  positive_keywords: string[];
  negative_keywords: string[];
  max_depth: number;
  rule_count: number;
};

export type QueryValidationResult = {
  valid: boolean;
  errors: string[];
  maxDepth: number;
  ruleCount: number;
};

export type QueryEvaluationTarget = {
  provider?: string;
  title?: string;
  summary?: string;
  content?: string;
  canonicalUrl?: string;
  language?: string;
  metadata?: Record<string, unknown>;
};

const MAX_DEPTH = 3;
const MAX_RULES = 40;
const MAX_KEYWORD_LENGTH = 160;
const MAX_FACET_VALUES = 50;

const normalizeText = (value: string): string => value.trim().toLowerCase();

const normalizeArray = (values: unknown, maxValues = MAX_FACET_VALUES): string[] => {
  if (!Array.isArray(values)) return [];
  const unique = new Set<string>();
  for (const raw of values) {
    if (typeof raw !== "string") continue;
    const normalized = normalizeText(raw);
    if (!normalized) continue;
    unique.add(normalized);
    if (unique.size >= maxValues) break;
  }
  return Array.from(unique);
};

const quoteKeyword = (value: string): string => {
  const escaped = value.replace(/"/g, "\\\"").trim();
  if (!escaped) return "";
  if (escaped.includes(" ")) return `"${escaped}"`;
  return escaped;
};

const collectKeywords = (
  rule: Rule,
  positive: string[],
  negative: string[]
): void => {
  if (rule.kind === "group") {
    for (const nested of rule.rules) collectKeywords(nested, positive, negative);
    return;
  }

  if (rule.kind !== "keyword") return;
  const value = rule.value.trim();
  if (!value) return;
  if (rule.not) {
    negative.push(value);
  } else {
    positive.push(value);
  }
};

const computeShape = (rule: Rule, depth = 1): { maxDepth: number; ruleCount: number } => {
  if (rule.kind !== "group") {
    return { maxDepth: depth, ruleCount: 1 };
  }

  if (rule.rules.length === 0) {
    return { maxDepth: depth, ruleCount: 1 };
  }

  let maxDepth = depth;
  let ruleCount = 1;
  for (const nested of rule.rules) {
    const nestedShape = computeShape(nested, depth + 1);
    maxDepth = Math.max(maxDepth, nestedShape.maxDepth);
    ruleCount += nestedShape.ruleCount;
  }

  return { maxDepth, ruleCount };
};

const validateRule = (rule: Rule, path: string, errors: string[]): void => {
  if (rule.kind === "group") {
    if (rule.op !== "AND" && rule.op !== "OR") {
      errors.push(`${path}: group.op must be AND|OR`);
    }
    if (!Array.isArray(rule.rules) || rule.rules.length === 0) {
      errors.push(`${path}: group.rules must contain at least one rule`);
      return;
    }
    rule.rules.forEach((nested, index) => validateRule(nested, `${path}.rules[${index}]`, errors));
    return;
  }

  if (rule.kind === "keyword") {
    if (!["any", "title", "summary", "content"].includes(rule.field)) {
      errors.push(`${path}: keyword.field invalid`);
    }
    if (!["contains", "phrase"].includes(rule.match)) {
      errors.push(`${path}: keyword.match invalid`);
    }
    if (typeof rule.value !== "string" || !rule.value.trim()) {
      errors.push(`${path}: keyword.value required`);
    } else if (rule.value.trim().length > MAX_KEYWORD_LENGTH) {
      errors.push(`${path}: keyword.value exceeds ${MAX_KEYWORD_LENGTH} chars`);
    }
    return;
  }

  if (!["provider", "language", "country", "domain"].includes(rule.kind)) {
    errors.push(`${path}: facet kind invalid`);
  }
  if (!["in", "not_in"].includes(rule.op)) {
    errors.push(`${path}: facet op invalid`);
  }
  if (!Array.isArray(rule.values) || rule.values.length === 0) {
    errors.push(`${path}: facet values required`);
    return;
  }
  if (rule.values.length > MAX_FACET_VALUES) {
    errors.push(`${path}: facet values exceeds ${MAX_FACET_VALUES}`);
  }
  const invalidValues = rule.values.filter((value) => typeof value !== "string" || !value.trim());
  if (invalidValues.length > 0) {
    errors.push(`${path}: facet values must be non-empty strings`);
  }
};

const hostFromUrl = (value: string | undefined): string | null => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
};

const extractCountryCandidates = (target: QueryEvaluationTarget): string[] => {
  const candidates = new Set<string>();

  const metadata = target.metadata ?? {};
  const rawValues: unknown[] = [
    (metadata as { country?: unknown }).country,
    (metadata as { countries?: unknown }).countries,
    (metadata as { source_country?: unknown }).source_country,
    (metadata as { locale?: unknown }).locale,
    (metadata as { sourceCountry?: unknown }).sourceCountry
  ];

  for (const raw of rawValues) {
    if (typeof raw === "string") {
      const normalized = normalizeText(raw);
      if (normalized) candidates.add(normalized);
      continue;
    }

    if (Array.isArray(raw)) {
      for (const item of raw) {
        if (typeof item !== "string") continue;
        const normalized = normalizeText(item);
        if (normalized) candidates.add(normalized);
      }
    }
  }

  return Array.from(candidates);
};

const containsTokens = (haystack: string, needle: string): boolean => {
  const tokens = needle
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) return false;
  return tokens.every((token) => haystack.includes(token));
};

const evaluateKeyword = (rule: KeywordRule, target: QueryEvaluationTarget): boolean => {
  const title = normalizeText(target.title ?? "");
  const summary = normalizeText(target.summary ?? "");
  const content = normalizeText(target.content ?? "");

  const needle = normalizeText(rule.value);
  if (!needle) return false;

  const fieldText =
    rule.field === "title"
      ? title
      : rule.field === "summary"
      ? summary
      : rule.field === "content"
      ? content
      : `${title}\n${summary}\n${content}`;

  const matched = rule.match === "phrase" ? fieldText.includes(needle) : containsTokens(fieldText, needle);
  return rule.not ? !matched : matched;
};

const evaluateFacet = (rule: FacetRule, target: QueryEvaluationTarget): boolean => {
  const normalizedValues = new Set(rule.values.map((item) => normalizeText(item)).filter(Boolean));

  let match = false;
  if (rule.kind === "provider") {
    const provider = normalizeText(target.provider ?? "");
    match = provider ? normalizedValues.has(provider) : false;
  } else if (rule.kind === "language") {
    const language = normalizeText(target.language ?? "");
    match = language ? normalizedValues.has(language) : false;
  } else if (rule.kind === "domain") {
    const host = hostFromUrl(target.canonicalUrl);
    match = host ? normalizedValues.has(host) : false;
  } else {
    const countries = extractCountryCandidates(target);
    match = countries.some((country) => normalizedValues.has(country));
  }

  return rule.op === "not_in" ? !match : match;
};

const evaluateRule = (rule: Rule, target: QueryEvaluationTarget): boolean => {
  if (rule.kind === "group") {
    if (rule.op === "AND") return rule.rules.every((nested) => evaluateRule(nested, target));
    return rule.rules.some((nested) => evaluateRule(nested, target));
  }

  if (rule.kind === "keyword") {
    return evaluateKeyword(rule, target);
  }

  return evaluateFacet(rule, target);
};

export const DEFAULT_QUERY_EXECUTION_CONFIG: QueryExecutionConfig = {
  providers_allow: [],
  providers_deny: [],
  countries_allow: [],
  countries_deny: [],
  domains_allow: [],
  domains_deny: []
};

export const sanitizeExecutionConfig = (value: unknown): QueryExecutionConfig => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_QUERY_EXECUTION_CONFIG };
  }

  const config = value as Record<string, unknown>;
  return {
    providers_allow: normalizeArray(config.providers_allow),
    providers_deny: normalizeArray(config.providers_deny),
    countries_allow: normalizeArray(config.countries_allow),
    countries_deny: normalizeArray(config.countries_deny),
    domains_allow: normalizeArray(config.domains_allow),
    domains_deny: normalizeArray(config.domains_deny)
  };
};

export const buildSimpleQueryDefinition = (query: string): QueryDefinition => ({
  kind: "group",
  op: "AND",
  rules: [
    {
      kind: "keyword",
      field: "any",
      match: "phrase",
      value: query
    }
  ]
});

export const validateQueryDefinition = (definition: unknown): QueryValidationResult => {
  const errors: string[] = [];

  if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
    return {
      valid: false,
      errors: ["definition must be an object"],
      maxDepth: 0,
      ruleCount: 0
    };
  }

  const root = definition as Partial<RuleGroup>;
  if (root.kind !== "group") {
    errors.push("definition.kind must be group");
  }

  if (root.op !== "AND" && root.op !== "OR") {
    errors.push("definition.op must be AND|OR");
  }

  if (!Array.isArray(root.rules) || root.rules.length === 0) {
    errors.push("definition.rules must contain at least one rule");
  }

  const typedRoot = definition as RuleGroup;
  if (errors.length === 0) {
    validateRule(typedRoot, "definition", errors);
  }

  const shape = errors.length === 0 ? computeShape(typedRoot) : { maxDepth: 0, ruleCount: 0 };

  if (shape.maxDepth > MAX_DEPTH) {
    errors.push(`definition exceeds max depth ${MAX_DEPTH}`);
  }

  if (shape.ruleCount > MAX_RULES) {
    errors.push(`definition exceeds max rules ${MAX_RULES}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    maxDepth: shape.maxDepth,
    ruleCount: shape.ruleCount
  };
};

export const compileQueryDefinition = (definition: QueryDefinition): CompiledQueryDefinition => {
  const positiveKeywords: string[] = [];
  const negativeKeywords: string[] = [];

  collectKeywords(definition, positiveKeywords, negativeKeywords);

  const dedupe = (values: string[]): string[] => Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));

  const normalizedPositive = dedupe(positiveKeywords);
  const normalizedNegative = dedupe(negativeKeywords);
  const query = normalizedPositive.map(quoteKeyword).filter(Boolean).join(" AND ");
  const shape = computeShape(definition);

  return {
    version: "qb-v1",
    query,
    keywords: dedupe([...normalizedPositive, ...normalizedNegative]),
    positive_keywords: normalizedPositive,
    negative_keywords: normalizedNegative,
    max_depth: shape.maxDepth,
    rule_count: shape.ruleCount
  };
};

export const evaluateQueryDefinition = (definition: QueryDefinition, target: QueryEvaluationTarget): boolean =>
  evaluateRule(definition, target);

export const selectProvidersForExecution = (
  availableProviders: string[],
  execution: QueryExecutionConfig
): string[] => {
  const available = availableProviders.map((provider) => normalizeText(provider)).filter(Boolean);
  const allow = new Set(execution.providers_allow.map((provider) => normalizeText(provider)).filter(Boolean));
  const deny = new Set(execution.providers_deny.map((provider) => normalizeText(provider)).filter(Boolean));

  const base = allow.size > 0 ? available.filter((provider) => allow.has(provider)) : available;
  return base.filter((provider) => !deny.has(provider));
};
