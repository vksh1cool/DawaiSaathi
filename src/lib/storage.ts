import { getAssetBucket, usesR2 } from "@/lib/cloudflare-runtime";

export type PrivateAsset = {
  body: ReadableStream<Uint8Array> | ArrayBuffer;
  contentType: string | null;
  size: number;
  etag: string | null;
};

/** Convert the former local `storage/...` path format without breaking data. */
export function canonicalAssetKey(path: string): string {
  return path.replace(/^storage\//, "");
}

function assertKey(key: string): string {
  const normalized = canonicalAssetKey(key);
  if (
    !/^[a-z0-9][a-z0-9._/-]*$/i.test(normalized) ||
    normalized.includes("..") ||
    normalized.startsWith("/")
  ) {
    throw new Error("Invalid private storage key.");
  }
  return normalized;
}

export async function putPrivateAsset(
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  const normalized = assertKey(key);
  if (usesR2()) {
    await getAssetBucket().put(normalized, body, {
      httpMetadata: { contentType },
    });
    return;
  }
  const { localPut } = await import("@/lib/storage-local");
  await localPut(normalized, body);
}

export async function getPrivateAsset(key: string): Promise<PrivateAsset | null> {
  const normalized = assertKey(key);
  if (usesR2()) {
    const object = await getAssetBucket().get(normalized);
    if (!object) return null;
    if (!object.body) return null;
    return {
      body: object.body,
      contentType: object.httpMetadata?.contentType ?? null,
      size: object.size,
      etag: object.httpEtag,
    };
  }
  const { localGet } = await import("@/lib/storage-local");
  const body = await localGet(normalized);
  return body
    ? {
        body: body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer,
        contentType: null,
        size: body.byteLength,
        etag: null,
      }
    : null;
}

export async function hasPrivateAsset(key: string): Promise<boolean> {
  const normalized = assertKey(key);
  if (usesR2()) return !!(await getAssetBucket().head(normalized));
  const { localHas } = await import("@/lib/storage-local");
  return localHas(normalized);
}

export async function deletePrivateAsset(key: string): Promise<void> {
  const normalized = assertKey(key);
  if (usesR2()) {
    await getAssetBucket().delete(normalized);
    return;
  }
  const { localDelete } = await import("@/lib/storage-local");
  await localDelete(normalized);
}

/** Delete all objects under a controlled application prefix. */
export async function deletePrivatePrefix(prefix: "audio/" | "photos/"): Promise<void> {
  if (usesR2()) {
    const bucket = getAssetBucket();
    let cursor: string | undefined;
    do {
      const listed = await bucket.list({ prefix, cursor, limit: 1000 });
      if (listed.objects.length > 0) {
        await bucket.delete(listed.objects.map((object) => object.key));
      }
      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);
    return;
  }
  const { localDeletePrefix } = await import("@/lib/storage-local");
  await localDeletePrefix(prefix);
}
