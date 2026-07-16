import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const STORAGE_ROOT = join(process.cwd(), "storage");

function localPath(key: string): string {
  if (!/^[a-z0-9][a-z0-9._/-]*$/i.test(key) || key.includes("..") || key.startsWith("/")) {
    throw new Error("Invalid local storage key.");
  }
  return join(STORAGE_ROOT, key);
}

export async function localPut(key: string, body: Uint8Array): Promise<void> {
  const path = localPath(key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body);
}

export async function localGet(key: string): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await readFile(localPath(key)));
  } catch {
    return null;
  }
}

export async function localHas(key: string): Promise<boolean> {
  try {
    await access(localPath(key));
    return true;
  } catch {
    return false;
  }
}

export async function localDelete(key: string): Promise<void> {
  await rm(localPath(key), { force: true });
}

export async function localDeletePrefix(prefix: string): Promise<void> {
  const normalized = prefix.replace(/\/+$/, "");
  if (!normalized) throw new Error("Storage prefix is required.");
  await rm(localPath(normalized), { recursive: true, force: true });
  await mkdir(localPath(normalized), { recursive: true });
}
