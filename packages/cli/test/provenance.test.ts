/**
 * `gitProvenance` — the only place Terrainist shells out to git.
 *
 * The assertions are about *shape and degradation*, never about a specific
 * sha: this runs in a real checkout whose HEAD moves every commit, and a test
 * that pinned one would fail for the wrong reason forever after.
 */

import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { BASELINE_TAG, gitProvenance } from "../src/provenance.js";

const REPO_DIR = fileURLToPath(new URL("..", import.meta.url));

describe("gitProvenance", () => {
  it("reports the checkout it is run in", async () => {
    const p = await gitProvenance(REPO_DIR);
    expect(p).not.toBeNull();
    if (p === null) return;

    expect(p.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(typeof p.branch).toBe("string");
    expect(p.branch.length).toBeGreaterThan(0);
    expect(typeof p.dirty).toBe("boolean");
    expect(typeof p.isBaseline).toBe("boolean");
    if (p.baseline === undefined) {
      // No `baseline` tag in this clone: nothing can claim to be it.
      expect(p.isBaseline).toBe(false);
    } else {
      expect(p.baseline).toMatch(/^[0-9a-f]{40}$/);
      expect(p.isBaseline).toBe(p.baseline === p.commit);
    }
  });

  it("returns null outside a repository instead of throwing", async () => {
    // The system temp dir is not inside a checkout; an exported tarball or a
    // container without git looks the same to this helper.
    expect(await gitProvenance(tmpdir())).toBeNull();
  });

  it("names the tag the convention depends on", () => {
    expect(BASELINE_TAG).toBe("baseline");
  });
});
