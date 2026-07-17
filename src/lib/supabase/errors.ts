import "server-only";

import { AppError, type ErrorCode } from "@/lib/errors";

const CODE_MAP: Record<string, ErrorCode> = {
  "22P02": "VALIDATION",
  "22023": "VALIDATION",
  "23514": "VALIDATION",
  "40001": "CONFLICT",
  "42501": "UNAUTHORIZED",
  P0002: "NOT_FOUND",
  PGRST116: "NOT_FOUND",
};

export function supabaseDatabaseError(operation: string, code?: string): never {
  throw new AppError(
    code ? (CODE_MAP[code] ?? "INTERNAL") : "INTERNAL",
    `We could not ${operation}. Please try again.`,
  );
}
