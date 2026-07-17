import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SUPABASE_PENDING_HEALTH_API_PATHS } from "@/lib/tenant-cutover";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const apiRoot = resolve(root, "src/app/api");
const migration = readFileSync(
  resolve(root, "supabase/migrations/20260717000000_initial_tenant_schema.sql"),
  "utf8",
);
const middleware = readFileSync(resolve(root, "src/middleware.ts"), "utf8");
const wranglerConfig = readFileSync(resolve(root, "wrangler.jsonc"), "utf8");
const householdRoute = readFileSync(resolve(root, "src/app/api/household/route.ts"), "utf8");
const runtime = readFileSync(resolve(root, "src/lib/cloudflare-runtime.ts"), "utf8");
const dbRuntime = readFileSync(resolve(root, "src/lib/db.ts"), "utf8");
const reminderRunRoute = readFileSync(resolve(root, "src/app/api/internal/reminders/run/route.ts"), "utf8");
const reminderWorker = readFileSync(resolve(root, "worker/index.ts"), "utf8");
const cloudflareReminderWorker = readFileSync(resolve(root, "worker/cloudflare-reminders.ts"), "utf8");
const legacyWebhookRoutes = [
  "src/app/api/twilio/status/route.ts",
  "src/app/api/twilio/voice/reminder/route.ts",
  "src/app/api/twilio/voice/gather/route.ts",
  "src/app/api/twilio/sms/inbound/route.ts",
  "src/app/api/twilio/sms/status/route.ts",
].map((path) => readFileSync(resolve(root, path), "utf8"));

function apiRouteFiles(dir = apiRoot): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = resolve(dir, entry);
    if (statSync(path).isDirectory()) return apiRouteFiles(path);
    return path.endsWith(`${sep}route.ts`) ? [path] : [];
  });
}

function routeFileToApiPath(file: string): string {
  const path = relative(apiRoot, file).replace(new RegExp(`${sep}route\\.ts$`), "");
  return `/api/${path.split(sep).join("/")}`.replace(/\/$/, "");
}

function pathMatches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

describe("Supabase tenant migration contract", () => {
  it("uses an atomic idempotent onboarding RPC rather than an open household insert", () => {
    expect(migration).toContain("create or replace function public.create_household_onboarding(");
    expect(migration).toContain("private.household_onboarding_requests");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("unique (user_id)");
    expect(migration).toContain("pg_catalog.hashtextextended(caller_id::text, 0)");
    expect(migration).not.toContain("caller_id::text || ':' || idempotency_key_input::text");
    expect(migration).toContain("This caregiver already belongs to a household");
    expect(migration).toContain("ui_language_input not in ('en', 'hi', 'es')");
    expect(migration).toContain("private.sms_sender_suppressions");
    expect(migration).toContain("sender_scope, phone_e164");
    expect(migration).toContain("and language in ('en', 'hi')");
    expect(migration).toContain("SMS follow-ups are currently available only in English and Hindi");
    expect(migration).toContain("reset_patient_sms_consent_on_delivery_change");
    expect(migration).toContain("old.phone_e164 is distinct from new.phone_e164");
    expect(migration).not.toContain("create or replace function public.create_household(");
  });

  it("does not leave a broad authenticated FOR ALL tenant policy", () => {
    expect(migration).not.toMatch(/for all to authenticated/iu);
    expect(migration).toContain("for insert to authenticated with check");
    expect(migration).toContain("for update to authenticated");
    expect(migration).toContain("system-owned: there is intentionally no direct browser");
  });

  it("binds caregiver invitations to exactly one verified email or phone identity", () => {
    expect(migration).toContain("invitee_phone_e164");
    expect(migration).toContain("check ((invitee_email is not null) <> (invitee_phone_e164 is not null))");
    expect(migration).toContain("caller_phone is distinct from invitation.invitee_phone_e164");
    expect(migration).toContain("extensions.digest(raw_token, 'sha256')");
  });

  it("fails closed before a Supabase user can reach the legacy D1 data path", () => {
    expect(middleware).toContain("supabaseTenantRuntimeReady()");
    expect(middleware).toContain("hasPendingSupabaseTenantRoutes()");
    expect(middleware).toContain("isPendingSupabaseHealthApiPath(pathname)");
    expect(middleware).toContain("isPendingSupabaseWorkspacePath(pathname)");
    expect(middleware).toContain("TENANT_RUNTIME_PENDING");
    expect(middleware).toContain("must never reach the old global D1 resolver");
    expect(middleware).not.toContain('pathname === "/"');
    expect(middleware).toContain('Cache-Control", "private, no-store"');
    expect(dbRuntime).toContain("usesSupabaseAuth()");
    expect(dbRuntime).toContain("TENANT_RUNTIME_PENDING");
    expect(householdRoute).toContain("if (usesSupabaseAuth()) return postSupabaseHousehold(request);");
    expect(householdRoute).toContain("if (usesSupabaseAuth()) return patchSupabaseHousehold(request);");
    expect(householdRoute).toContain("This caregiver already has a household. Onboarding was not changed.");
    expect(wranglerConfig).not.toContain('"AUTH_DRIVER": "supabase"');
    expect(wranglerConfig).not.toContain('"SUPABASE_TENANT_RUNTIME_READY": "true"');
  });

  it("also blocks legacy D1 reminder work and callbacks during the tenant cutover", () => {
    expect(runtime).toContain("legacyTenantDataBlocked");
    expect(runtime).toContain("export const legacyTenantDataBlocked = () => usesSupabaseAuth();");
    expect(reminderRunRoute).toContain("if (legacyTenantDataBlocked())");
    expect(reminderRunRoute).toContain('code: "TENANT_RUNTIME_PENDING"');
    expect(reminderWorker).toContain("const legacyDataBlocked = legacyTenantDataBlocked()");
    expect(cloudflareReminderWorker).toContain("isTenantRuntimePending(response)");
    for (const route of legacyWebhookRoutes) {
      expect(route).toContain("legacyTenantDataBlocked");
    }
  });

  it("tracks every legacy Prisma health API in the Supabase cutover guard", () => {
    const pendingPrefixes = [...SUPABASE_PENDING_HEALTH_API_PATHS];
    const uncoveredLegacyRoutes = apiRouteFiles()
      .map((file) => ({ file, apiPath: routeFileToApiPath(file), source: readFileSync(file, "utf8") }))
      .filter(({ source }) =>
        source.includes("@/lib/db") ||
        source.includes("@/lib/household") ||
        source.includes("prisma."),
      )
      .filter(({ source }) => !source.includes("legacyTenantDataBlocked"))
      .filter(({ source }) => !source.includes("usesSupabaseAuth()"))
      .filter(({ apiPath }) => !pendingPrefixes.some((prefix) => pathMatches(apiPath, prefix)))
      .map(({ apiPath }) => apiPath);

    expect(uncoveredLegacyRoutes).toEqual([]);
  });
});
