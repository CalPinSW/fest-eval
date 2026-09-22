import { ClashfinderError, parseClashfinderEvent, type ClashfinderEvent } from "./parse";

export interface ClashfinderCredentials {
  username: string;
  /**
   * Public key generated on https://clashfinder.com/pages/api/ while logged in.
   * Clashfinder derives it from the account's private key; we never see that.
   */
  publicKey: string;
}

export const CLASHFINDER_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
export const CLASHFINDER_ATTRIBUTION =
  "Lineup data from Clashfinder (clashfinder.com), CC BY-NC 3.0.";

/** Accepts a bare id or any clashfinder.com URL containing /s/<id>/ or /m/<id>/. */
export function parseClashfinderId(input: string): string | null {
  const trimmed = input.trim();
  const fromUrl = /clashfinder\.com\/(?:s|m|data\/event)\/([A-Za-z0-9_-]+)/.exec(trimmed);
  const id = fromUrl ? fromUrl[1] : trimmed;
  return CLASHFINDER_ID_PATTERN.test(id) ? id : null;
}

export function clashfinderEventUrl(eventId: string, credentials: ClashfinderCredentials): string {
  if (!CLASHFINDER_ID_PATTERN.test(eventId)) throw new ClashfinderError(`Invalid Clashfinder id "${eventId}"`);
  const query = new URLSearchParams({
    authUsername: credentials.username,
    authPublicKey: credentials.publicKey,
  });
  return `https://clashfinder.com/data/event/${eventId}.json?${query}`;
}

export async function fetchClashfinderEvent(
  eventId: string,
  credentials: ClashfinderCredentials,
  options: { fetch?: typeof fetch; fallbackTimeZone?: string } = {},
): Promise<ClashfinderEvent> {
  const doFetch = options.fetch ?? fetch;
  const response = await doFetch(clashfinderEventUrl(eventId, credentials), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (response.status === 404) throw new ClashfinderError(`No Clashfinder event called "${eventId}"`);
  if (!response.ok) throw new ClashfinderError(`Clashfinder request failed (${response.status})`);

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new ClashfinderError("Clashfinder returned invalid JSON");
  }
  return parseClashfinderEvent(json, options.fallbackTimeZone);
}

export function clashfinderCredentialsFromEnv(env: NodeJS.ProcessEnv = process.env): ClashfinderCredentials | null {
  const username = env.CLASHFINDER_USERNAME;
  const publicKey = env.CLASHFINDER_PUBLIC_KEY;
  return username && publicKey ? { username, publicKey } : null;
}
