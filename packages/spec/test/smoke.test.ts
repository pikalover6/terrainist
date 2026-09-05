import { describe, expect, it } from "vitest";

import { LOAM_VERSION } from "../src/index.js";

describe("@terrainist/spec", () => {
  it("exports a defined LOAM_VERSION", () => {
    expect(LOAM_VERSION).toBeDefined();
    expect(typeof LOAM_VERSION).toBe("string");
  });
});
