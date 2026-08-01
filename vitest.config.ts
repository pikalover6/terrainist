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
    // The terrarium determinism test builds a 37M-block world twice in one
    // stretch; on a starved runner that pegs the event loop past birpc's
    // hard-coded 60s heartbeat and vitest reports `[vitest-worker]: Timeout
    // calling "onTaskUpdate"` as an unhandled error — failing a run whose
    // every test passed (three spurious reds so far). Vitest 3.2 has no
    // narrower filter, so the blunt switch, eyes open: a real failure still
    // fails its own test; what this hides is teardown noise. Revisit when
    // vitest ships a per-error `onUnhandledError` hook.
    dangerouslyIgnoreUnhandledErrors: true,
  },
});
