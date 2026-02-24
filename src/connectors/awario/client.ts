const DEFAULT_BASE_URL = "https://api.awario.com/v1.0";
const DEFAULT_TIMEOUT_MS = 20_000;

export type AwarioAlert = {
  id: string;
  name: string | null;
  isActive: boolean;
  raw: Record<string, unknown>;
};

export type AwarioMentionRecord = Record<string, unknown>;

export type AwarioMentionsPage = {
  mentions: AwarioMentionRecord[];
  next: string | null;
};

type RequestOptions = {
  nextCursor?: string | null;
  signal?: AbortSignal;
  query?: Record<string, string | number | undefined>;
};

type AwarioClientOptions = {
  baseUrl?: string;
  timeoutMs?: number;
  throttleMs?: number;
  maxRetries?: number;
};

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const asObject = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const asArray = (value: unknown): Record<string, unknown>[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => !!item && typeof item === "object" && !Array.isArray(item)) as Record<string, unknown>[];
};

const asString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const parseNext = (payload: Record<string, unknown>): string | null => {
  const direct = typeof payload.next === "string" ? payload.next : null;
  if (direct && direct.trim()) return direct.trim();

  const paging = asObject(payload.paging);
  if (paging && typeof paging.next === "string" && paging.next.trim()) {
    return paging.next.trim();
  }

  const alertData = asObject(payload.alert_data);
  if (!alertData) return null;
  if (typeof alertData.next === "string" && alertData.next.trim()) {
    return alertData.next.trim();
  }

  const alertPaging = asObject(alertData.paging);
  if (alertPaging && typeof alertPaging.next === "string" && alertPaging.next.trim()) {
    return alertPaging.next.trim();
  }

  return null;
};

const parseMentions = (payload: Record<string, unknown>): Record<string, unknown>[] => {
  const direct = asArray(payload.mentions);
  if (direct.length > 0) return direct;

  const alertData = asObject(payload.alert_data);
  if (!alertData) return [];
  return asArray(alertData.mentions);
};

const parseAlerts = (payload: Record<string, unknown>): Record<string, unknown>[] => {
  const direct = asArray(payload.alerts);
  if (direct.length > 0) return direct;

  const data = asObject(payload.data);
  if (data) {
    const nested = asArray(data.alerts);
    if (nested.length > 0) return nested;
  }

  const alertData = asObject(payload.alert_data);
  if (!alertData) return [];
  return asArray(alertData.alerts);
};

export class AwarioClient {
  private readonly baseUrl: string;

  private readonly timeoutMs: number;

  private readonly throttleMs: number;

  private readonly maxRetries: number;

  private lastRequestAt = 0;

  constructor(
    private readonly accessToken: string,
    options: AwarioClientOptions = {}
  ) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/g, "");
    this.timeoutMs = Math.max(2_000, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    this.throttleMs = Math.max(0, options.throttleMs ?? 250);
    this.maxRetries = Math.max(1, options.maxRetries ?? 4);
  }

  private withToken(url: string): string {
    const parsed = new URL(url);
    parsed.searchParams.set("access_token", this.accessToken);
    return parsed.toString();
  }

  private buildUrl(pathname: string, query: Record<string, string | number | undefined> = {}): string {
    const parsed = new URL(`${this.baseUrl}/${pathname.replace(/^\/+/, "")}`);
    for (const [key, raw] of Object.entries(query)) {
      if (raw === undefined || raw === null || raw === "") continue;
      parsed.searchParams.set(key, String(raw));
    }
    return parsed.toString();
  }

  private async throttle(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestAt;
    if (elapsed < this.throttleMs) {
      await sleep(this.throttleMs - elapsed);
    }
    this.lastRequestAt = Date.now();
  }

  private async requestJson(pathname: string, options: RequestOptions = {}): Promise<Record<string, unknown>> {
    let attempt = 0;

    while (attempt < this.maxRetries) {
      attempt += 1;
      const controller = options.signal ? null : new AbortController();
      const timeout = controller
        ? setTimeout(() => {
            controller.abort();
          }, this.timeoutMs)
        : null;

      try {
        await this.throttle();
        const query: Record<string, string | number | undefined> = {
          ...(options.query ?? {})
        };

        let url: string;
        if (options.nextCursor && /^https?:\/\//i.test(options.nextCursor)) {
          url = this.withToken(options.nextCursor);
        } else {
          if (options.nextCursor) {
            query.next = options.nextCursor;
          }
          url = this.withToken(this.buildUrl(pathname, query));
        }

        const response = await fetch(url, {
          method: "GET",
          signal: options.signal ?? controller?.signal,
          headers: {
            accept: "application/json"
          }
        });

        const body = await response.text();
        const parsed = body ? (JSON.parse(body) as unknown) : {};

        if (!response.ok) {
          if ((response.status === 429 || response.status >= 500) && attempt < this.maxRetries) {
            await sleep(attempt * 300 + Math.floor(Math.random() * 250));
            continue;
          }
          const message = typeof parsed === "object" && parsed && "message" in parsed
            ? String((parsed as { message?: unknown }).message ?? response.statusText)
            : response.statusText;
          throw new Error(`Awario request failed (${response.status}): ${message}`);
        }

        const object = asObject(parsed);
        if (!object) {
          throw new Error("Awario response is not a JSON object");
        }
        return object;
      } catch (error) {
        if (attempt < this.maxRetries) {
          const message = (error as Error).message.toLowerCase();
          if (message.includes("abort") || message.includes("timeout") || message.includes("network")) {
            await sleep(attempt * 350 + Math.floor(Math.random() * 200));
            continue;
          }
        }
        throw error;
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    }

    throw new Error("Awario request exhausted retries");
  }

  async listAlerts(): Promise<AwarioAlert[]> {
    const payload = await this.requestJson("alerts/list");
    const alerts = parseAlerts(payload);
    return alerts
      .map((item) => {
        const rawId = item.id ?? item.alert_id;
        const id = rawId === null || rawId === undefined ? null : String(rawId).trim();
        if (!id) return null;
        const name = asString(item.name) ?? asString(item.alert_name) ?? null;
        const rawStatus = asString(item.status)?.toLowerCase() ?? asString(item.state)?.toLowerCase() ?? "";
        const rawIsActive = item.is_active;
        const isActive = typeof rawIsActive === "boolean"
          ? rawIsActive
          : rawStatus
            ? rawStatus !== "inactive" && rawStatus !== "disabled"
            : true;
        return {
          id,
          name,
          isActive,
          raw: item
        } satisfies AwarioAlert;
      })
      .filter((item): item is AwarioAlert => item !== null);
  }

  async listMentionsPage(
    alertId: string,
    options: {
      nextCursor?: string | null;
      since?: Date;
      until?: Date;
      limit?: number;
    } = {}
  ): Promise<AwarioMentionsPage> {
    const query: Record<string, string | number | undefined> = {};
    if (!options.nextCursor) {
      if (options.since) query.date_from = Math.max(0, Math.floor(options.since.getTime()));
      if (options.until) query.date_to = Math.max(0, Math.floor(options.until.getTime()));
      if (options.limit) query.limit = Math.max(1, Math.min(200, Math.floor(options.limit)));
    }

    const payload = await this.requestJson(`alerts/${encodeURIComponent(alertId)}/mentions`, {
      nextCursor: options.nextCursor,
      query
    });

    return {
      mentions: parseMentions(payload),
      next: parseNext(payload)
    };
  }
}
