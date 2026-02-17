import type { components } from "./generated/openapi-types";

export type Term = components["schemas"]["Term"];
export type TermListResponse = components["schemas"]["TermListResponse"];
export type CreateTermRequest = components["schemas"]["CreateTermRequest"];
export type UpdateTermRequest = components["schemas"]["UpdateTermRequest"];
export type NewsFeedResponse = components["schemas"]["NewsFeedResponse"];
export type MetaResponse = components["schemas"]["MetaResponse"];

type HttpMethod = "GET" | "POST" | "PATCH";

type RequestOptions = {
  method?: HttpMethod;
  token?: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly payload: unknown,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const buildQueryString = (query?: Record<string, string | number | boolean | undefined | null>): string => {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
};

export class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly getToken: () => string | null
  ) {}

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const token = options.token ?? this.getToken();
    const headers: Record<string, string> = {
      "content-type": "application/json"
    };

    if (token) {
      headers.authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${this.baseUrl}${path}${buildQueryString(options.query)}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined
    });

    const raw = await response.text();
    const payload = raw ? (JSON.parse(raw) as unknown) : null;

    if (!response.ok) {
      const fallbackMessage = `API request failed (${response.status})`;
      const message =
        typeof payload === "object" && payload && "message" in payload && typeof (payload as { message?: unknown }).message === "string"
          ? (payload as { message: string }).message
          : fallbackMessage;
      throw new ApiError(response.status, payload, message);
    }

    return payload as T;
  }

  listTerms(limit = 100, cursor?: string): Promise<TermListResponse> {
    return this.request<TermListResponse>("/v1/terms", {
      query: {
        limit,
        cursor
      }
    });
  }

  createTerm(payload: CreateTermRequest): Promise<Term> {
    return this.request<Term>("/v1/terms", {
      method: "POST",
      body: payload
    });
  }

  updateTerm(id: string, payload: UpdateTermRequest): Promise<Term> {
    return this.request<Term>(`/v1/terms/${id}`, {
      method: "PATCH",
      body: payload
    });
  }

  listNewsFeed(termId: string): Promise<NewsFeedResponse> {
    return this.request<NewsFeedResponse>("/v1/feed/news", {
      query: {
        term_id: termId
      }
    });
  }

  getMeta(): Promise<MetaResponse> {
    return this.request<MetaResponse>("/v1/meta");
  }
}
