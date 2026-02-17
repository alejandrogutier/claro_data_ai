type FetchJsonOptions = {
  url: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxAttempts?: number;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const shouldRetry = (statusCode: number): boolean => statusCode === 429 || statusCode >= 500;

export const fetchJsonWithRetry = async ({
  url,
  headers,
  timeoutMs = 20000,
  maxAttempts = 3
}: FetchJsonOptions): Promise<unknown> => {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers,
        signal: controller.signal
      });

      if (!response.ok) {
        const body = await response.text();
        const error = new Error(`HTTP ${response.status} on ${url}: ${body.slice(0, 300)}`);
        if (!shouldRetry(response.status) || attempt === maxAttempts) {
          throw error;
        }
        lastError = error;
      } else {
        return (await response.json()) as unknown;
      }
    } catch (error) {
      lastError = error as Error;
      if (attempt === maxAttempts) break;
    } finally {
      clearTimeout(timer);
    }

    const jitter = Math.floor(Math.random() * 250);
    const backoffMs = 400 * 2 ** (attempt - 1) + jitter;
    await sleep(backoffMs);
  }

  throw lastError ?? new Error(`Unknown fetch failure for ${url}`);
};
