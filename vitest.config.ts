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
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.{idea,git,cache,output,temp}/**",
      "**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*",
      // Background subagents work in isolated git worktrees under this path while
      // still-in-progress; without this, vitest's glob picks up their unmerged
      // test files (which can import modules that only exist in that worktree).
      "**/.claude/worktrees/**",
    ],
  },
});
