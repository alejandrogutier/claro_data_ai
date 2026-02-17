import { fetchJsonWithRetry } from "./http";
import { canonicalizeUrl } from "./url";

export type ProviderName =
  | "newsapi"
  | "gnews"
  | "newsdata"
  | "worldnews"
  | "guardian"
  | "nyt";

export type NormalizedArticle = {
  sourceType: "news";
  provider: ProviderName;
  term: string;
  sourceName?: string;
  sourceId?: string;
  author?: string;
  title: string;
  summary?: string;
  content?: string;
  canonicalUrl: string;
  imageUrl?: string;
  publishedAt?: string;
  language?: string;
  category?: string;
  metadata?: Record<string, unknown>;
};

export type ProviderFetchContext = {
  term: string;
  language?: string;
  maxArticlesPerTerm: number;
  providerKeys: Record<string, string>;
};

export type ProviderFetchResult = {
  provider: ProviderName;
  term: string;
  items: NormalizedArticle[];
  requestUrl?: string;
  rawCount: number;
  durationMs: number;
  error?: string;
};

type ProviderAdapter = (context: ProviderFetchContext) => Promise<ProviderFetchResult>;

const defaultEndpoints = {
  newsapi: "https://newsapi.org/v2/everything",
  gnews: "https://gnews.io/api/v4/search",
  newsdata: "https://newsdata.io/api/1/latest",
  worldnews: "https://api.worldnewsapi.com/search-news",
  guardian: "https://content.guardianapis.com/search",
  nyt: "https://api.nytimes.com/svc/search/v2/articlesearch.json"
} as const;

const readEndpoint = (provider: ProviderName): string => {
  switch (provider) {
    case "newsapi":
      return process.env.NEWS_API_URL ?? defaultEndpoints.newsapi;
    case "gnews":
      return process.env.GNEWS_API_URL ?? defaultEndpoints.gnews;
    case "newsdata":
      return process.env.NEWSDATA_API_URL ?? defaultEndpoints.newsdata;
    case "worldnews":
      return process.env.WORLDNEWS_API_URL ?? defaultEndpoints.worldnews;
    case "guardian":
      return process.env.GUARDIAN_API_URL ?? defaultEndpoints.guardian;
    case "nyt":
      return process.env.NYT_API_URL ?? defaultEndpoints.nyt;
    default:
      return defaultEndpoints.newsapi;
  }
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const asRecordArray = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.map((item) => asRecord(item)).filter((item): item is Record<string, unknown> => item !== null) : [];

const toStringOrUndefined = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
};

const toIsoOrUndefined = (value: unknown): string | undefined => {
  const asString = toStringOrUndefined(value);
  if (!asString) return undefined;
  const parsed = new Date(asString);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
};

const buildUrl = (baseUrl: string, params: Record<string, string | number | undefined>): string => {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
};

const makeResult = (
  provider: ProviderName,
  term: string,
  startedAt: number,
  opts: Partial<Omit<ProviderFetchResult, "provider" | "term" | "durationMs">>
): ProviderFetchResult => ({
  provider,
  term,
  items: opts.items ?? [],
  requestUrl: opts.requestUrl,
  rawCount: opts.rawCount ?? 0,
  error: opts.error,
  durationMs: Date.now() - startedAt
});

const makeArticle = (
  provider: ProviderName,
  term: string,
  rawUrl: string | undefined,
  payload: Omit<NormalizedArticle, "sourceType" | "provider" | "term" | "canonicalUrl" | "title"> & {
    title?: string;
  }
): NormalizedArticle | null => {
  if (!rawUrl) return null;
  const canonicalUrl = canonicalizeUrl(rawUrl);
  if (!canonicalUrl) return null;

  const title = payload.title?.trim();
  if (!title) return null;

  return {
    sourceType: "news",
    provider,
    term,
    canonicalUrl,
    title,
    sourceName: payload.sourceName,
    sourceId: payload.sourceId,
    author: payload.author,
    summary: payload.summary,
    content: payload.content,
    imageUrl: payload.imageUrl,
    publishedAt: payload.publishedAt,
    language: payload.language,
    category: payload.category,
    metadata: payload.metadata
  };
};

const runNewsApi: ProviderAdapter = async ({ term, language, maxArticlesPerTerm, providerKeys }) => {
  const startedAt = Date.now();
  const apiKey = providerKeys.NEWS_API_KEY;
  if (!apiKey) {
    return makeResult("newsapi", term, startedAt, { error: "Missing NEWS_API_KEY" });
  }

  const requestUrl = buildUrl(readEndpoint("newsapi"), {
    q: term,
    pageSize: maxArticlesPerTerm,
    sortBy: "publishedAt",
    language
  });

  try {
    const payload = await fetchJsonWithRetry({
      url: requestUrl,
      headers: { "X-Api-Key": apiKey }
    });

    const data = asRecord(payload);
    const rows = asRecordArray(data?.articles);
    const items = rows
      .map((row) => {
        const source = asRecord(row.source);
        return makeArticle("newsapi", term, toStringOrUndefined(row.url), {
          sourceId: toStringOrUndefined(source?.id),
          sourceName: toStringOrUndefined(source?.name) ?? "NewsAPI",
          author: toStringOrUndefined(row.author),
          title: toStringOrUndefined(row.title),
          summary: toStringOrUndefined(row.description),
          content: toStringOrUndefined(row.content),
          imageUrl: toStringOrUndefined(row.urlToImage),
          publishedAt: toIsoOrUndefined(row.publishedAt),
          language
        });
      })
      .filter((article): article is NormalizedArticle => article !== null);

    return makeResult("newsapi", term, startedAt, {
      requestUrl,
      rawCount: rows.length,
      items
    });
  } catch (error) {
    return makeResult("newsapi", term, startedAt, {
      requestUrl,
      error: (error as Error).message
    });
  }
};

const runGNews: ProviderAdapter = async ({ term, language, maxArticlesPerTerm, providerKeys }) => {
  const startedAt = Date.now();
  const apiKey = providerKeys.GNEWS_API_KEY;
  if (!apiKey) {
    return makeResult("gnews", term, startedAt, { error: "Missing GNEWS_API_KEY" });
  }

  const requestUrl = buildUrl(readEndpoint("gnews"), {
    q: term,
    max: maxArticlesPerTerm,
    lang: language,
    token: apiKey
  });

  try {
    const payload = await fetchJsonWithRetry({ url: requestUrl });
    const data = asRecord(payload);
    const rows = asRecordArray(data?.articles);

    const items = rows
      .map((row) => {
        const source = asRecord(row.source);
        return makeArticle("gnews", term, toStringOrUndefined(row.url), {
          sourceId: toStringOrUndefined(source?.id),
          sourceName: toStringOrUndefined(source?.name) ?? "GNews",
          title: toStringOrUndefined(row.title),
          summary: toStringOrUndefined(row.description),
          content: toStringOrUndefined(row.content),
          imageUrl: toStringOrUndefined(row.image),
          publishedAt: toIsoOrUndefined(row.publishedAt),
          language
        });
      })
      .filter((article): article is NormalizedArticle => article !== null);

    return makeResult("gnews", term, startedAt, {
      requestUrl,
      rawCount: rows.length,
      items
    });
  } catch (error) {
    return makeResult("gnews", term, startedAt, {
      requestUrl,
      error: (error as Error).message
    });
  }
};

const runNewsData: ProviderAdapter = async ({ term, language, maxArticlesPerTerm, providerKeys }) => {
  const startedAt = Date.now();
  const apiKey = providerKeys.NEWSDATA_API_KEY;
  if (!apiKey) {
    return makeResult("newsdata", term, startedAt, { error: "Missing NEWSDATA_API_KEY" });
  }

  const requestUrl = buildUrl(readEndpoint("newsdata"), {
    apikey: apiKey,
    q: term,
    size: maxArticlesPerTerm,
    language
  });

  try {
    const payload = await fetchJsonWithRetry({ url: requestUrl });
    const data = asRecord(payload);
    const rows = asRecordArray(data?.results);

    const items = rows
      .map((row) =>
        makeArticle("newsdata", term, toStringOrUndefined(row.link), {
          sourceId: toStringOrUndefined(row.source_id),
          sourceName: toStringOrUndefined(row.source_name) ?? toStringOrUndefined(row.source_id) ?? "NewsData",
          title: toStringOrUndefined(row.title),
          summary: toStringOrUndefined(row.description),
          content: toStringOrUndefined(row.content),
          imageUrl: toStringOrUndefined(row.image_url),
          publishedAt: toIsoOrUndefined(row.pubDate),
          language,
          category: Array.isArray(row.category) ? toStringOrUndefined(row.category[0]) : toStringOrUndefined(row.category),
          author: Array.isArray(row.creator) ? toStringOrUndefined(row.creator[0]) : toStringOrUndefined(row.creator)
        })
      )
      .filter((article): article is NormalizedArticle => article !== null);

    return makeResult("newsdata", term, startedAt, {
      requestUrl,
      rawCount: rows.length,
      items
    });
  } catch (error) {
    return makeResult("newsdata", term, startedAt, {
      requestUrl,
      error: (error as Error).message
    });
  }
};

const runWorldNews: ProviderAdapter = async ({ term, language, maxArticlesPerTerm, providerKeys }) => {
  const startedAt = Date.now();
  const apiKey = providerKeys.WORLDNEWS_API_KEY;
  if (!apiKey) {
    return makeResult("worldnews", term, startedAt, { error: "Missing WORLDNEWS_API_KEY" });
  }

  const requestUrl = buildUrl(readEndpoint("worldnews"), {
    "api-key": apiKey,
    text: term,
    number: maxArticlesPerTerm,
    language
  });

  try {
    const payload = await fetchJsonWithRetry({
      url: requestUrl,
      headers: { "x-api-key": apiKey }
    });
    const data = asRecord(payload);
    const rows = asRecordArray(data?.news);

    const items = rows
      .map((row) =>
        makeArticle("worldnews", term, toStringOrUndefined(row.url), {
          sourceName: toStringOrUndefined(row.source) ?? "WorldNews",
          title: toStringOrUndefined(row.title),
          summary: toStringOrUndefined(row.summary),
          content: toStringOrUndefined(row.text) ?? toStringOrUndefined(row.summary),
          imageUrl: toStringOrUndefined(row.image),
          publishedAt: toIsoOrUndefined(row.publish_date),
          language
        })
      )
      .filter((article): article is NormalizedArticle => article !== null);

    return makeResult("worldnews", term, startedAt, {
      requestUrl,
      rawCount: rows.length,
      items
    });
  } catch (error) {
    return makeResult("worldnews", term, startedAt, {
      requestUrl,
      error: (error as Error).message
    });
  }
};

const runGuardian: ProviderAdapter = async ({ term, maxArticlesPerTerm, providerKeys }) => {
  const startedAt = Date.now();
  const apiKey = providerKeys.GUARDIAN_API_KEY;
  if (!apiKey) {
    return makeResult("guardian", term, startedAt, { error: "Missing GUARDIAN_API_KEY" });
  }

  const requestUrl = buildUrl(readEndpoint("guardian"), {
    q: term,
    "api-key": apiKey,
    "page-size": maxArticlesPerTerm,
    "order-by": "newest",
    "show-fields": "trailText,thumbnail,body,byline"
  });

  try {
    const payload = await fetchJsonWithRetry({ url: requestUrl });
    const data = asRecord(payload);
    const response = asRecord(data?.response);
    const rows = asRecordArray(response?.results);

    const items = rows
      .map((row) => {
        const fields = asRecord(row.fields);
        return makeArticle("guardian", term, toStringOrUndefined(row.webUrl), {
          sourceName: "The Guardian",
          sourceId: toStringOrUndefined(row.id),
          title: toStringOrUndefined(row.webTitle),
          summary: toStringOrUndefined(fields?.trailText),
          content: toStringOrUndefined(fields?.body),
          imageUrl: toStringOrUndefined(fields?.thumbnail),
          publishedAt: toIsoOrUndefined(row.webPublicationDate),
          category: toStringOrUndefined(row.sectionName),
          author: toStringOrUndefined(fields?.byline),
          language: "en"
        });
      })
      .filter((article): article is NormalizedArticle => article !== null);

    return makeResult("guardian", term, startedAt, {
      requestUrl,
      rawCount: rows.length,
      items
    });
  } catch (error) {
    return makeResult("guardian", term, startedAt, {
      requestUrl,
      error: (error as Error).message
    });
  }
};

const runNyt: ProviderAdapter = async ({ term, maxArticlesPerTerm, providerKeys }) => {
  const startedAt = Date.now();
  const apiKey = providerKeys.NYT_API_KEY;
  if (!apiKey) {
    return makeResult("nyt", term, startedAt, { error: "Missing NYT_API_KEY" });
  }

  const requestUrl = buildUrl(readEndpoint("nyt"), {
    q: term,
    "api-key": apiKey,
    sort: "newest",
    page: 0
  });

  try {
    const payload = await fetchJsonWithRetry({ url: requestUrl });
    const data = asRecord(payload);
    const response = asRecord(data?.response);
    const rows = asRecordArray(response?.docs).slice(0, maxArticlesPerTerm);

    const items = rows
      .map((row) => {
        const headline = asRecord(row.headline);
        const multimedia = Array.isArray(row.multimedia) ? row.multimedia : [];
        const firstMedia = asRecord(multimedia[0]);
        const mediaPath = toStringOrUndefined(firstMedia?.url);
        const imageUrl = mediaPath ? (mediaPath.startsWith("http") ? mediaPath : `https://www.nytimes.com/${mediaPath.replace(/^\//, "")}`) : undefined;

        return makeArticle("nyt", term, toStringOrUndefined(row.web_url), {
          sourceName: "NYTimes",
          title: toStringOrUndefined(headline?.main),
          summary: toStringOrUndefined(row.snippet) ?? toStringOrUndefined(row.abstract),
          content: toStringOrUndefined(row.lead_paragraph),
          imageUrl,
          publishedAt: toIsoOrUndefined(row.pub_date),
          category: toStringOrUndefined(row.section_name),
          author: toStringOrUndefined(row.byline),
          language: "en"
        });
      })
      .filter((article): article is NormalizedArticle => article !== null);

    return makeResult("nyt", term, startedAt, {
      requestUrl,
      rawCount: rows.length,
      items
    });
  } catch (error) {
    return makeResult("nyt", term, startedAt, {
      requestUrl,
      error: (error as Error).message
    });
  }
};

const adapters: ProviderAdapter[] = [runNewsApi, runGNews, runNewsData, runWorldNews, runGuardian, runNyt];

export const fetchFromProviders = async (context: ProviderFetchContext): Promise<ProviderFetchResult[]> =>
  Promise.all(adapters.map((adapter) => adapter(context)));

export const dedupeByCanonicalUrl = (items: NormalizedArticle[]): NormalizedArticle[] => {
  const seen = new Set<string>();
  const deduped: NormalizedArticle[] = [];

  for (const item of items) {
    if (seen.has(item.canonicalUrl)) continue;
    seen.add(item.canonicalUrl);
    deduped.push(item);
  }

  return deduped;
};
