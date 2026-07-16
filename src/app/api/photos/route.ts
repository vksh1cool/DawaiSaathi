import { NextResponse } from "next/server";
import { purgePhotos } from "@/lib/data-retention";
import { withErrorBoundary } from "@/lib/errors";

export const runtime = "nodejs";

/** Privacy control: remove uploaded strip photos without erasing the regimen. */
export const DELETE = withErrorBoundary(async () => {
  await purgePhotos();
  return NextResponse.json({ ok: true });
});
