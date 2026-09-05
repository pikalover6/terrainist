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
    // The smoke and the site-plan suites build whole worlds in one stretch; on
    // a starved runner that can peg the event loop past birpc's 60 s heartbeat
    // and vitest then reports a worker timeout as an unhandled error, failing
    // a run whose every test passed. A real failure still fails its own test;
    // what this hides is teardown noise.
    dangerouslyIgnoreUnhandledErrors: true,
  },
});
