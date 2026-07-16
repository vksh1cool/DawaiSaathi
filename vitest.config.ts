import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Deterministic unit suites inject the OpenAI client before making any
    // networked call. A non-empty value lets config validation boot normally.
    env: {
      OPENAI_API_KEY: "test-key-not-used-for-network-calls",
      DATABASE_URL: "file:./test.db",
    },
  },
});
