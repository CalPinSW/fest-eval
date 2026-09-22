import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Streaming-service tokens are encrypted before they reach the database, so a
 * leaked dump or an over-broad query does not hand out access to users'
 * Spotify/Apple accounts. AES-256-GCM, key from TOKEN_ENCRYPTION_KEY
 * (32 bytes, base64). Format: v1.<iv>.<tag>.<ciphertext>, all base64url.
 */

const VERSION = "v1";

export function loadEncryptionKey(raw: string | undefined = process.env.TOKEN_ENCRYPTION_KEY): Buffer {
  if (!raw) throw new Error("TOKEN_ENCRYPTION_KEY is not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  return key;
}

export function encryptToken(plaintext: string, key: Buffer = loadEncryptionKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, ciphertext].map((part) => (typeof part === "string" ? part : part.toString("base64url"))).join(".");
}

export function decryptToken(encoded: string, key: Buffer = loadEncryptionKey()): string {
  const [version, iv, tag, ciphertext] = encoded.split(".");
  if (version !== VERSION || !iv || !tag || ciphertext === undefined) throw new Error("Unrecognised token format");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
