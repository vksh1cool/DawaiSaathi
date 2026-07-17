/**
 * Returns a path that is guaranteed to stay on this application origin.
 *
 * Query-string `next` values are untrusted input. A simple startsWith("/")
 * check accepts special URL forms such as backslash-prefixed authorities in
 * some URL parsers, which can turn an otherwise internal redirect into an
 * external one.
 */
export function safeInternalPath(value: string | null | undefined, fallback = "/"): string {
  if (!value || value.length > 2048) return fallback;
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return fallback;
  }
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    !decoded.startsWith("/") ||
    decoded.startsWith("//") ||
    decoded.includes("\\") ||
    decoded.includes("\0")
  ) {
    return fallback;
  }

  try {
    const base = "https://dawaisaathi.invalid";
    const parsed = new URL(value, base);
    if (parsed.origin !== base) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
