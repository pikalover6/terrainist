import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Agent worktrees live under .claude/worktrees/ and contain full repo
    // copies; without this exclusion vitest sweeps their (possibly unbuilt)
    // test files into every run.
    exclude: ["**/node_modules/**", "**/dist/**", "**/.claude/**"],
  },
});
