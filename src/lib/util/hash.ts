import { createHash } from "node:crypto";

/** sha256 hex — used for content-addressed audio filenames (Arch §11). */
export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}
