import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Agent worktrees live under .claude/worktrees/ and contain full repo
    // copies; without this exclusion vitest sweeps their (possibly unbuilt)
    // test files into every run.
    exclude: ["**/node_modules/**", "**/dist/**", "**/.claude/**"],
    // The archetype suites loop the WHOLE catalog per test, and the catalog
    // grows a wave at a time: several of those loops now sit either side of
    // vitest's five-second default under a parallel run, so they fail on load
    // rather than on a defect. Budgeted centrally rather than per test, so the
    // next wave does not have to re-learn it.
    testTimeout: 60_000,
  },
});
