import { randomUUID } from "node:crypto";

/** Collision-resistant id for rows we create in memory before persisting. */
export function cuid(): string {
  return "c" + randomUUID().replace(/-/g, "");
}

/** Standard UUID for Supabase tables whose `id` columns are typed `uuid`. */
export function uuid(): string {
  return randomUUID();
}
