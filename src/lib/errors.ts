import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";

/** Application error codes → HTTP status (Arch §6). */
export type ErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UPSTREAM_OPENAI"
  | "UPSTREAM_OPENFDA"
  | "UPSTREAM_TWILIO"
  | "TELEPHONY_DISABLED"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UPSTREAM_OPENAI: 502,
  UPSTREAM_OPENFDA: 502,
  UPSTREAM_TWILIO: 502,
  TELEPHONY_DISABLED: 409,
  INTERNAL: 500,
};

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public cause?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function errorResponse(code: ErrorCode, message: string) {
  return NextResponse.json(
    { error: { code, message } },
    { status: STATUS[code] },
  );
}

/**
 * Wrap a route handler so thrown AppErrors / zod errors map to the standard
 * error body, and everything else becomes a logged 500.
 */
export function withErrorBoundary<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof AppError) {
        logger.warn({ code: err.code, msg: err.message }, "AppError");
        return errorResponse(err.code, err.message);
      }
      if (err instanceof z.ZodError) {
        const msg = err.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ");
        logger.warn({ msg }, "Validation error");
        return errorResponse("VALIDATION", msg);
      }
      logger.error({ err }, "Unhandled error in route");
      return errorResponse("INTERNAL", "Something went wrong. Please try again.");
    }
  };
}
