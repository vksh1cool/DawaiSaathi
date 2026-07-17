"use client";

/** Thin fetch wrapper: parses the standard error envelope (Arch §6). */

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function handle<T>(res: Response): Promise<T> {
  const text = await res.text();
  let json: unknown = {};
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      // Proxies and framework error pages can return HTML/plain text. Keep the
      // client recovery path usable instead of replacing the server failure
      // with a JSON parsing exception.
      if (!res.ok) throw new ApiError("INVALID_RESPONSE", `Request failed (${res.status}).`);
      throw new ApiError("INVALID_RESPONSE", "The service returned an invalid response.");
    }
  }
  if (!res.ok) {
    const err = isErrorEnvelope(json) ? json.error : undefined;
    throw new ApiError(err?.code ?? "INTERNAL", err?.message ?? "Request failed");
  }
  return json as T;
}

function isErrorEnvelope(value: unknown): value is { error: { code?: string; message?: string } } {
  if (!value || typeof value !== "object" || !("error" in value)) return false;
  const error = value.error;
  return !!error && typeof error === "object";
}

export async function apiGet<T>(url: string, options?: { signal?: AbortSignal }): Promise<T> {
  return handle<T>(await fetch(url, { cache: "no-store", signal: options?.signal }));
}

export async function apiJson<T>(
  url: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
  options?: { headers?: HeadersInit },
): Promise<T> {
  return handle<T>(
    await fetch(url, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(options?.headers ?? {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
}

export async function apiUpload<T>(url: string, form: FormData): Promise<T> {
  return handle<T>(await fetch(url, { method: "POST", body: form }));
}
