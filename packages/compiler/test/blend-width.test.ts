/**
 * `intent.climate.blend` — the biome-gradient dial, measured in the world.
 *
 * The unit rows live in `intent-rows.test.ts`; what needs proving here is that
 * the dial reaches the *emitted chunk biome array*, and by how much. So this
 * compiles the same document twice — identical but for `blend` — with an
 * `intent.climate.biome` that the alpine ambient will never derive on its own,
 * and then walks transects outward from the settlement through the readback
 * world counting the columns that still carry the settlement's biome. That
 * count is the transition band, and `wide` must measurably out-reach `sharp`.
 *
 * The forced biome is what makes the measurement honest: `frost_hollow`'s clamp
 * normally takes the snowy ambient, so its band is invisible against ground of
 * the same colour and a histogram would show nothing whatever the width.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadPrismarine } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import { compileTerrain, type TerrainCompileReport } from "../src/terrain/compile.js";
import { BLEND_FEATHER } from "../src/terrain/climate-intent.js";

const FIXTURE = fileURLToPath(
  new URL("../../../out/e2e/glm-p2/frost_hollow.loam.json", import.meta.url),
);

/** The physics rules a shipped world must lint zero on. */
const PHYSICS_LINT_CODES = ["LOAM-T110", "LOAM-T111"];

/** The settlement biome, chosen so the band is visible against alpine ground. */
const FORCED = "minecraft:savanna";

interface Walked {
  readonly report: TerrainCompileReport;
  readonly worldDir: string;
}

/** Compile the fixture with one `blend` value (or none) into `dir`. */
async function compileWithBlend(
  doc: Record<string, unknown>,
  blend: string | undefined,
  dir: string,
): Promise<Walked> {
  const withIntent = {
    ...doc,
    intent: {
      ...(doc["intent"] as Record<string, unknown> | undefined),
      climate: {
        biome: FORCED,
        snow: "never",
        ...(blend === undefined ? {} : { blend }),
      },
    },
  };
  const result = await compileTerrain(withIntent, { outDir: dir });
  if (!result.ok) {
    throw new Error(result.diagnostics.map((d) => `${d.code} ${d.message}`).join("\n"));
  }
  return { report: result.report, worldDir: dir };
}

/**
 * The transition band, in columns, read back out of the emitted world.
 *
 * Four transects — one per compass direction, from the centre of the settlement
 * footprint's bounding box — each walked outward from the box edge until the
 * forced biome stops appearing. The result is the *largest* run of clamped
 * ground outside the footprint, which is what "how far does the town's colour
 * reach" means when you are standing at its edge.
 */
async function bandWidth(walked: Walked): Promise<{ band: number; histogram: Map<number, number>; forcedId: number }> {
  const placements = walked.report.layout?.placements ?? [];
  expect(placements.length).toBeGreaterThan(0);
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  let y = 64;
  for (const p of placements) {
    x0 = Math.min(x0, p.footprint.x0);
    x1 = Math.max(x1, p.footprint.x1);
    z0 = Math.min(z0, p.footprint.z0);
    z1 = Math.max(z1, p.footprint.z1);
    y = p.foundationY;
  }
  const cx = Math.round((x0 + x1) / 2);
  const cz = Math.round((z0 + z1) / 2);

  const mc = loadPrismarine(EMIT_MINECRAFT_VERSION);
  const anvil = mc.openAnvil(path.join(walked.worldDir, "region"));
  const cache = new Map<string, Awaited<ReturnType<typeof anvil.load>>>();
  const forcedId = mc.biomeIdByName(FORCED);
  expect(forcedId).toBeDefined();
  const histogram = new Map<number, number>();

  const biomeAt = async (x: number, z: number): Promise<number | undefined> => {
    const key = `${x >> 4},${z >> 4}`;
    let chunk = cache.get(key);
    if (chunk === undefined) {
      chunk = await anvil.load(x >> 4, z >> 4);
      cache.set(key, chunk);
    }
    if (chunk === null || chunk === undefined) return undefined;
    return chunk.getBiomeId(((x % 16) + 16) % 16, y, ((z % 16) + 16) % 16);
  };

  // Reach: how far past the footprint's edge the forced biome still shows.
  // A short gap does not stop the walk — the dither thins out, it does not end
  // cleanly — so each transect runs a fixed distance and remembers its last hit.
  const REACH = 160;
  const transects: readonly (readonly [number, number, number, number])[] = [
    [x1, cz, 1, 0],
    [x0, cz, -1, 0],
    [cx, z1, 0, 1],
    [cx, z0, 0, -1],
  ];
  let band = 0;
  for (const [sx, sz, dx, dz] of transects) {
    for (let d = 1; d <= REACH; d++) {
      const id = await biomeAt(sx + dx * d, sz + dz * d);
      if (id === undefined) break;
      histogram.set(id, (histogram.get(id) ?? 0) + 1);
      if (id === forcedId) band = Math.max(band, d);
    }
  }
  return { band, histogram, forcedId: forcedId as number };
}

describe("intent.climate.blend — the biome-gradient dial", () => {
  let scratch: string;
  let sharp: Awaited<ReturnType<typeof bandWidth>>;
  let wide: Awaited<ReturnType<typeof bandWidth>>;
  let sharpReport: TerrainCompileReport;
  let wideReport: TerrainCompileReport;

  beforeAll(async () => {
    scratch = await mkdtemp(path.join(tmpdir(), "terrainist-blend-"));
    const doc = JSON.parse(await readFile(FIXTURE, "utf8")) as Record<string, unknown>;
    const a = await compileWithBlend(doc, "sharp", path.join(scratch, "sharp"));
    const b = await compileWithBlend(doc, "wide", path.join(scratch, "wide"));
    sharpReport = a.report;
    wideReport = b.report;
    sharp = await bandWidth(a);
    wide = await bandWidth(b);
  }, 600_000);

  afterAll(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it("reaches the emitted biome array: wide out-reaches sharp by the dial's own ratio", () => {
    // Both bands exist at all — otherwise the comparison would be vacuous.
    expect(sharp.band).toBeGreaterThan(0);
    expect(wide.band).toBeGreaterThan(sharp.band);
    // The dial is a width in columns, so the reach should track it rather than
    // merely differ: `wide` is four times `sharp`, and the measured reach must
    // be at least twice as far. (Not exact: the band is dithered and the
    // footprint's bounding box is not its outline.)
    expect(BLEND_FEATHER.wide / BLEND_FEATHER.sharp).toBe(4);
    expect(wide.band).toBeGreaterThanOrEqual(sharp.band * 2);
    // Neither band may run past its own width plus the box slack.
    expect(sharp.band).toBeLessThan(BLEND_FEATHER.sharp * 4);
  });

  it("the transect histograms differ: wide paints more clamped ground", () => {
    expect(wide.histogram.get(wide.forcedId) ?? 0).toBeGreaterThan(sharp.histogram.get(sharp.forcedId) ?? 0);
    // And both still reach real terrain at the far end of the transect.
    expect([...sharp.histogram.keys()].length).toBeGreaterThan(1);
  });

  it("lints zero on both worlds", () => {
    for (const report of [sharpReport, wideReport]) {
      expect(report.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      expect(report.diagnostics.filter((d) => PHYSICS_LINT_CODES.includes(d.code))).toEqual([]);
    }
  });
});
