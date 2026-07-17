import { NextResponse } from "next/server";
import { config } from "@/lib/config";

export const runtime = "nodejs";

const PACKAGE_NAME = "com.vksh1cool.dawaisaathi";
const SHA256_FINGERPRINT = /^(?:[A-Fa-f0-9]{2}:){31}[A-Fa-f0-9]{2}$/;

/**
 * Android verifies this document before hiding the browser chrome in the TWA.
 * Return a clear deployment error rather than publishing an empty or guessed
 * fingerprint that could make a release appear trusted when it is not.
 */
export function GET() {
  const fingerprint = config.androidAppCertSha256?.toUpperCase();
  if (!fingerprint || !SHA256_FINGERPRINT.test(fingerprint)) {
    return NextResponse.json(
      { error: "Android asset links are not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: PACKAGE_NAME,
          sha256_cert_fingerprints: [fingerprint],
        },
      },
    ],
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=300",
        "Content-Type": "application/json; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
