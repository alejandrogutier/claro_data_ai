export type OriginType = "news" | "awario";

export type OriginFields = {
  origin: OriginType;
  medium: string | null;
  tags: string[];
};

export type OriginFilterInput = {
  origin?: OriginType;
  medium?: string;
  tags?: string[];
};

type DeriveOriginFieldsInput = {
  sourceType?: "news" | "social" | null;
  provider?: string | null;
  sourceName?: string | null;
  channel?: string | null;
  awarioAlertId?: string | null;
  forcedOrigin?: OriginType;
};

const normalizeText = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
};

const toTagToken = (value: string | null | undefined): string | null => {
  const normalized = normalizeText(value)?.toLowerCase();
  if (!normalized) return null;
  const token = normalized
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/g, "")
    .replace(/-+$/g, "");
  return token || null;
};

const pushTag = (tags: string[], value: string | null) => {
  if (!value) return;
  if (!tags.includes(value)) {
    tags.push(value);
  }
};

export const deriveOriginFields = (input: DeriveOriginFieldsInput): OriginFields => {
  const inferredOrigin: OriginType =
    input.forcedOrigin ?? (input.sourceType === "news" ? "news" : "awario");

  if (inferredOrigin === "news") {
    const medium = normalizeText(input.sourceName) ?? normalizeText(input.provider) ?? null;
    const mediumToken = toTagToken(medium);
    const providerToken = toTagToken(input.provider);

    const tags: string[] = [];
    pushTag(tags, "origin:news");
    pushTag(tags, providerToken ? `provider:${providerToken}` : null);
    pushTag(tags, mediumToken ? `medium:${mediumToken}` : null);

    return {
      origin: "news",
      medium,
      tags
    };
  }

  const medium = normalizeText(input.channel) ?? normalizeText(input.provider) ?? null;
  const mediumToken = toTagToken(medium);
  const alertToken = toTagToken(input.awarioAlertId);

  const tags: string[] = [];
  pushTag(tags, "origin:awario");
  pushTag(tags, mediumToken ? `channel:${mediumToken}` : null);
  pushTag(tags, mediumToken ? `medium:${mediumToken}` : null);
  pushTag(tags, alertToken ? `alert:${alertToken}` : null);

  return {
    origin: "awario",
    medium,
    tags
  };
};

const normalizeTagList = (values: string[] | undefined): string[] =>
  Array.from(
    new Set(
      (values ?? [])
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0)
    )
  );

export const parseTagFilterValues = (...rawValues: Array<string | undefined>): string[] =>
  normalizeTagList(
    rawValues.flatMap((value) =>
      (value ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );

export const isValidOrigin = (value: string | undefined): value is OriginType =>
  value === "news" || value === "awario";

export const matchesOriginFilters = (fields: OriginFields, filters: OriginFilterInput): boolean => {
  if (filters.origin && fields.origin !== filters.origin) {
    return false;
  }

  if (filters.medium) {
    const requiredMedium = toTagToken(filters.medium);
    const currentMedium = toTagToken(fields.medium);
    if (!requiredMedium || !currentMedium || requiredMedium !== currentMedium) {
      return false;
    }
  }

  const requiredTags = normalizeTagList(filters.tags);
  if (requiredTags.length === 0) return true;

  const itemTags = new Set(normalizeTagList(fields.tags));
  return requiredTags.every((tag) => itemTags.has(tag));
};

