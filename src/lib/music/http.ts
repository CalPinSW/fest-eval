export class MusicApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
  }
}

export interface RequestOptions {
  fetch?: typeof fetch;
  /** Retries after a 429, honouring Retry-After (seconds). */
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * fetch + JSON with rate-limit handling. Returns null for 204/empty bodies.
 * Throws MusicApiError for any other non-2xx response.
 */
export async function requestJson<T>(url: string, init: RequestInit, options: RequestOptions = {}): Promise<T> {
  const doFetch = options.fetch ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const maxRetries = options.maxRetries ?? 3;

  for (let attempt = 0; ; attempt++) {
    const response = await doFetch(url, { ...init, cache: "no-store" });

    if (response.status === 429 && attempt < maxRetries) {
      const retryAfter = Number(response.headers.get("Retry-After"));
      const waitSeconds = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 30) : 2 ** attempt;
      await sleep(waitSeconds * 1000);
      continue;
    }

    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    if (!response.ok) {
      throw new MusicApiError(`${init.method ?? "GET"} ${new URL(url).pathname} failed (${response.status})`, response.status, body);
    }
    return body as T;
  }
}

/** Run `fn` over `items` with at most `limit` in flight, preserving order. */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
