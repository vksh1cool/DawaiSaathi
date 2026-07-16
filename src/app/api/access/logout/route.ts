import { NextResponse } from "next/server";
import { accessCookieName } from "@/lib/access-gate";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(accessCookieName(), "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
