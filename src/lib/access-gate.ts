import { getRuntimeValue } from "@/lib/cloudflare-runtime";

const SESSION_COOKIE = "dawaisaathi_access";
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const AUDIO_TTL_SECONDS = 30 * 60;

export const accessGateEnabled = () => getRuntimeValue("REQUIRE_ACCESS_GATE") === "true";
export const accessCookieName = () => SESSION_COOKIE;

export function accessGateSecretsConfigured(): boolean {
  return Boolean(getRuntimeValue("APP_ACCESS_PASSWORD") && sessionSecret().length >= 32);
}

function sessionSecret(): string {
  return getRuntimeValue("APP_SESSION_SECRET") ?? "";
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]!);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function fromBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) return null;
  try {
    const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

async function hmac(value: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

function fixedTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index]! ^ b[index]!;
  return difference === 0;
}

function randomNonce(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

async function signedToken(subject: string, ttlSeconds: number): Promise<string> {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const nonce = randomNonce();
  const payload = `${subject}.${expiresAt}.${nonce}`;
  return `${expiresAt}.${nonce}.${toBase64Url(await hmac(payload))}`;
}

async function verifySignedToken(subject: string, token: string | null): Promise<boolean> {
  if (!token || !sessionSecret()) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [expiresAt, nonce, signature] = parts;
  if (!/^\d+$/u.test(expiresAt) || !/^[A-Za-z0-9_-]{12,}$/u.test(nonce)) return false;
  if (Number(expiresAt) < Math.floor(Date.now() / 1000)) return false;
  const supplied = fromBase64Url(signature);
  if (!supplied) return false;
  return fixedTimeEqual(supplied, await hmac(`${subject}.${expiresAt}.${nonce}`));
}

export function parseCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const entry of cookieHeader.split(";")) {
    const [key, ...rest] = entry.trim().split("=");
    if (key === name) return rest.join("=") || null;
  }
  return null;
}

export async function createAccessSession(): Promise<string> {
  return signedToken("session", SESSION_TTL_SECONDS);
}

export async function hasValidAccessSession(cookieHeader: string | null): Promise<boolean> {
  return verifySignedToken("session", parseCookie(cookieHeader, SESSION_COOKIE));
}

export async function createAudioAccessToken(file: string): Promise<string> {
  return signedToken(`audio:${file}`, AUDIO_TTL_SECONDS);
}

export async function hasValidAudioAccessToken(file: string, token: string | null): Promise<boolean> {
  return verifySignedToken(`audio:${file}`, token);
}
