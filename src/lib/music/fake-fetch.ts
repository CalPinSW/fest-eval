/**
 * Test helper: a fetch implementation that routes "METHOD /path" to handlers
 * and records every request. Unmatched requests fail loudly.
 */
export interface RecordedRequest {
  method: string;
  url: URL;
  headers: Headers;
  body: unknown;
}

type Handler = (req: RecordedRequest) => Response | Promise<Response>;

export function fakeFetch(routes: Record<string, Handler | Handler[]>) {
  const calls: RecordedRequest[] = [];
  const counters = new Map<string, number>();

  const fetchImpl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init.method ?? "GET").toUpperCase();
    let body: unknown = init.body ?? null;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        body = Object.fromEntries(new URLSearchParams(body as string));
      }
    }
    const req: RecordedRequest = { method, url, headers: new Headers(init.headers), body };
    calls.push(req);

    const key = `${method} ${url.pathname}`;
    const route = routes[key];
    if (!route) throw new Error(`Unexpected request: ${key}${url.search}`);
    if (Array.isArray(route)) {
      const n = counters.get(key) ?? 0;
      counters.set(key, n + 1);
      return route[Math.min(n, route.length - 1)](req);
    }
    return route(req);
  }) as typeof fetch;

  return { fetch: fetchImpl, calls };
}

export const json = (body: unknown, init: ResponseInit = {}) => Response.json(body, init);
