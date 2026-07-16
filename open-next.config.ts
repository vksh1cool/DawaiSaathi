import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";

/**
 * Cache only OpenNext's static/ISR layer in its own bucket. Household APIs use
 * `cache: "no-store"` and private media routes set `private, no-store`, so
 * health data never becomes an incremental-cache entry.
 *
 * The adapter's Durable Object queue de-duplicates time-based ISR work. It is
 * intentionally separate from the future per-household reminder coordinator.
 */
export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
  queue: doQueue,
});
