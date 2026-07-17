/**
 * Cloudflare Pages advanced-mode gateway.
 *
 * `dawaisaathi.pages.dev` stays the canonical public origin while the actual
 * OpenNext app remains a Worker. A service binding keeps this request off the
 * public internet, preserving the Worker-only cron, Durable Object, R2, and
 * cache bindings without exposing an account-specific workers.dev URL.
 */
export default {
  async fetch(request, env) {
    return env.DAWAISAATHI_APP.fetch(request);
  },
};
