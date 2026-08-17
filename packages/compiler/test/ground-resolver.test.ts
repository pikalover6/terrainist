/**
 * The ground contract's resolver — `docs/GROUND-CONTRACT-v0.md` §11, second
 * block.
 *
 * Fifteen assertions, each naming a property the six walked defects of
 * 2026-08-04..06 cost a walk to discover: that precedence decides a contested
 * column rather than write order, that agreement between two claims is not a
 * conflict, that a `preserve` losing is audible while an ordinary loss is not,
 * that a clearance clamps rather than refuses, and — the third appearance of the
 * lesson — that a 45° boundary is **one** transition and not a crumb per column.
 */

import { describe, expect, it } from "vitest";

import type { GroundBaseline, GroundClaim, GroundIntent } from "../src/layout/ground-contract.js";
import { resolveGround } from "../src/layout/ground-resolver.js";
import { MIN_RETAIN_RUN, treatmentForSeam } from "../src/layout/levels.js";
import { WORLD_MAX_Y } from "../src/terrain/columns.js";

const W = 16;
const D = 16;

const idx = (x: number, z: number): number => z * W + x;

const baselineAt = (y: number, width = W, depth = D): GroundBaseline => ({
  region: { x0: 0, z0: 0, width, depth },
  ground: new Int32Array(width * depth).fill(y),
  fluidTop: new Int32Array(width * depth).fill(y),
  fluidKind: new Uint8Array(width * depth),
  seaLevel: 62,
});

const claim = (
  source: string,
  sourceClass: GroundIntent["sourceClass"],
  columns: Iterable<GroundClaim>,
  extra: Partial<GroundIntent> = {},
): GroundIntent => ({
  source,
  sourceClass,
  kind: "platform",
  columns,
  transition: "step",
  ...extra,
});

const cells = (ys: number, xs: readonly number[], y: number): GroundClaim[] =>
  xs.map((x) => ({ idx: idx(x, ys), y }));

const codes = (r: ReturnType<typeof resolveGround>): string[] =>
  r.diagnostics.map((d) => d.code);

/**
 * Everything a byte-identity comparison has to look at, with every owner
 * *index* replaced by the owner's **source**.
 *
 * `ResolvedGround.owner` and `GroundTransition.above`/`below` are indices into
 * the caller's `intents` array, so shuffling that array necessarily renumbers
 * them — the index is a reference into an input, not a decision. What §5.7
 * requires to be unobservable is the ordering, and the source is the same
 * decision stated in the one vocabulary a shuffle cannot touch.
 */
const snapshot = (r: ReturnType<typeof resolveGround>, intents: readonly GroundIntent[]): string => {
  const nameOf = (o: number): string => (o === -1 ? "baseline" : (intents[o] as GroundIntent).source);
  return JSON.stringify({
    ground: [...r.ground],
    fluidTop: [...r.fluidTop],
    fluidKind: [...r.fluidKind],
    moved: [...r.moved],
    wet: [...r.wet],
    owner: [...r.owner].map(nameOf),
    transitions: r.transitions.map((t) => ({ ...t, above: nameOf(t.above), below: nameOf(t.below) })),
    report: r.report,
    diagnostics: r.diagnostics,
  });
};

/** Only the transitions between two named claims — the region's edge is not one. */
const between = (
  r: ReturnType<typeof resolveGround>,
  above: string,
  below: string,
): ReturnType<typeof resolveGround>["transitions"] =>
  r.transitions.filter((t) => t.aboveSource === above && t.belowSource === below);

describe("resolveGround", () => {
  it("a single claim wins its columns and nothing else moves", () => {
    const r = resolveGround(baselineAt(70), [
      claim("world.town.plaza", "plaza.ground", cells(4, [4, 5, 6], 73)),
    ]);
    expect(r.ground[idx(4, 4)]).toBe(73);
    expect(r.ground[idx(6, 4)]).toBe(73);
    expect(r.ground[idx(7, 4)]).toBe(70);
    expect(r.owner[idx(5, 4)]).toBe(0);
    expect(r.owner[idx(7, 4)]).toBe(-1);
    expect(r.report.claimed).toBe(3);
    expect(r.report.moved).toBe(3);
    expect(r.fluidTop[idx(5, 4)]).toBe(73);
    expect([...r.moved].filter((m) => m === 1)).toHaveLength(3);
    const row = r.report.claims[0];
    expect(row?.satisfied).toBe(3);
    expect(row?.refused).toBe(0);
  });

  it("agreement is not conflict", () => {
    // On the baseline's own level, so no transition and nothing to summarise:
    // this is §12's flat-world argument in miniature.
    const r = resolveGround(baselineAt(74), [
      claim("world.town.canal", "fluid.channel", [{ idx: idx(3, 3), y: 74 }]),
      claim("world.town.quay", "street.network", [{ idx: idx(3, 3), y: 74 }]),
    ]);
    expect(r.diagnostics).toHaveLength(0);
    expect(r.report.claims[0]?.satisfied).toBe(1);
    expect(r.report.claims[1]?.satisfied).toBe(1);
    expect(r.report.claims[1]?.refused).toBe(0);
    expect(r.ground[idx(3, 3)]).toBe(74);
  });

  it("the rank-minimal claim wins under all six declaration orders", () => {
    const a = claim("world.town.canal", "fluid.channel", [{ idx: idx(2, 2), y: 66 }]);
    const b = claim("world.town.street", "street.network", [{ idx: idx(2, 2), y: 72 }]);
    const c = claim("world.town.cart", "prop.pad", [{ idx: idx(2, 2), y: 78 }]);
    const orders: GroundIntent[][] = [
      [a, b, c],
      [a, c, b],
      [b, a, c],
      [b, c, a],
      [c, a, b],
      [c, b, a],
    ];
    const results = orders.map((o) => resolveGround(baselineAt(70), o));
    for (const r of results) {
      expect(r.ground[idx(2, 2)]).toBe(66);
      // The report is in `compareIntent` order however the caller enumerated.
      expect(r.report.claims.map((row) => row.source)).toEqual([
        "world.town.canal",
        "world.town.street",
        "world.town.cart",
      ]);
    }
    const shots = results.map((r, i) => snapshot(r, orders[i] as GroundIntent[]));
    for (const s of shots) expect(s).toBe(shots[0]);
  });

  it("iteration order is never observable", () => {
    const columns: GroundClaim[] = [4, 5, 6, 7].map((x) => ({ idx: idx(x, 8), y: 75 }));
    const other: GroundClaim[] = [6, 7, 8].map((x) => ({ idx: idx(x, 8), y: 71 }));
    function* gen(list: readonly GroundClaim[]): Generator<GroundClaim> {
      for (const c of list) yield c;
    }
    const build = (
      wrapA: (l: readonly GroundClaim[]) => Iterable<GroundClaim>,
      wrapB: (l: readonly GroundClaim[]) => Iterable<GroundClaim>,
      shuffled: boolean,
    ): GroundIntent[] => {
      const A = claim("world.town.plaza", "plaza.ground", wrapA(columns));
      const B = claim("world.town.lane", "road.network", wrapB(other));
      return shuffled ? [B, A] : [A, B];
    };
    const asArray = (l: readonly GroundClaim[]): GroundClaim[] => [...l];
    const asSet = (l: readonly GroundClaim[]): Set<GroundClaim> => new Set(l);
    const variants = [
      build(asArray, asArray, false),
      build(asArray, asArray, true),
      build(gen, asSet, false),
      build(asSet, gen, true),
      build(gen, gen, true),
    ];
    const shots = variants.map((v) => snapshot(resolveGround(baselineAt(70), v), v));
    for (const s of shots) expect(s).toBe(shots[0]);
  });

  it("a preserved column reports its loser", () => {
    const wall = claim("world.town.wall_3", "retaining.seam", [{ idx: idx(5, 5), y: 84 }], {
      kind: "face",
      transition: "wall",
    });
    const guard = claim("world.town.wall_3", "retaining.seam", [{ idx: idx(5, 5), y: 84 }], {
      kind: "preserve",
    });
    const door = claim("world.town.doorstep.mill", "doorstep.landing", [{ idx: idx(5, 5), y: 81 }]);
    const r = resolveGround(baselineAt(80), [wall, guard, door]);
    const conflict = r.diagnostics.find((d) => d.name === "GROUND_CONFLICT");
    expect(conflict).toBeDefined();
    expect(conflict?.code).toBe("LOAM-W490");
    expect(conflict?.severity).toBe("warning");
    expect(conflict?.message).toContain("world.town.wall_3");
    expect(conflict?.message).toContain("world.town.doorstep.mill");
    expect(conflict?.message).toContain("3 blocks");
    expect(r.report.conflicts).toEqual([
      { guard: "world.town.wall_3", loser: "world.town.doorstep.mill", x: 5, z: 5, guardY: 84, askedY: 81 },
    ]);
    expect(r.ground[idx(5, 5)]).toBe(84);
  });

  it("an unguarded loss is silent", () => {
    const wall = claim("world.town.wall_3", "retaining.seam", [{ idx: idx(5, 5), y: 84 }], {
      kind: "face",
      transition: "wall",
    });
    // Two columns, one contested: the claim still keeps its `minColumns`, so the
    // only thing it has to say about the loss is the aggregated note.
    const door = claim("world.town.doorstep.mill", "doorstep.landing", [
      { idx: idx(5, 5), y: 81 },
      { idx: idx(6, 5), y: 81 },
    ]);
    const r = resolveGround(baselineAt(80), [wall, door]);
    expect(r.diagnostics.filter((d) => d.severity === "warning")).toHaveLength(0);
    expect(r.diagnostics.filter((d) => d.name === "GROUND_CLAIM_ADJUSTED")).toHaveLength(1);
    expect(codes(r)).toContain("LOAM-I491");
    const row = r.report.claims.find((c) => c.source === "world.town.doorstep.mill");
    expect(row?.refused).toBe(1);
    expect(row?.refusedTo).toEqual({ "world.town.wall_3": 1 });
    expect(row?.maxDelta).toBe(3);
  });

  it("a clearance clamps rather than refuses", () => {
    const deck = claim("world.town.bridge_1", "sweep.run", [{ idx: idx(8, 9), y: 71 }], {
      kind: "clearance",
    });
    const cart = claim("world.town.prop.cart_2", "prop.pad", [{ idx: idx(8, 9), y: 73 }]);
    const r = resolveGround(baselineAt(70), [deck, cart]);
    expect(r.ground[idx(8, 9)]).toBe(71);
    expect(r.owner[idx(8, 9)]).toBe(1);
    const d = r.diagnostics.find((x) => x.name === "GROUND_CLEARANCE_VIOLATED");
    expect(d?.code).toBe("LOAM-W493");
    expect(d?.message).toContain("world.town.bridge_1");
    expect(d?.message).toContain("world.town.prop.cart_2");
    expect(d?.message).toContain("clamped to 71");
    const row = r.report.claims[0];
    expect(row?.adjusted).toBe(1);
    expect(row?.refused).toBe(0);
    expect(row?.satisfied).toBe(0);
  });

  it("clearances compose by minimum regardless of rank", () => {
    // The low ceiling comes from the *lower*-ranked source, so a rank-ordered
    // "first ceiling wins" would pick the wrong one.
    const high = claim("world.town.arch", "fluid.channel", [{ idx: idx(1, 1), y: 90 }], {
      kind: "clearance",
    });
    const low = claim("world.town.deck", "verge", [{ idx: idx(1, 1), y: 74 }], { kind: "clearance" });
    const pad = claim("world.town.pad", "plaza.ground", [{ idx: idx(1, 1), y: 88 }]);
    const r = resolveGround(baselineAt(70), [high, low, pad]);
    expect(r.ground[idx(1, 1)]).toBe(74);
    expect(r.diagnostics.filter((d) => d.name === "GROUND_CLEARANCE_VIOLATED")).toHaveLength(1);
  });

  it("each invariant violation is exactly one LOAM-E494", () => {
    const one = (intents: GroundIntent[]): ReturnType<typeof resolveGround> =>
      resolveGround(baselineAt(70), intents);

    const fluid = one([
      claim("world.town.canal_1", "fluid.channel", [
        { idx: idx(12, 12), y: 70, fluid: { kind: 1, top: 68 } },
      ]),
    ]);
    expect(fluid.diagnostics.filter((d) => d.code === "LOAM-E494")).toHaveLength(1);
    expect(fluid.diagnostics[0]?.severity).toBe("error");
    expect(fluid.diagnostics[0]?.message).toContain("fluidTop=68");

    const range = one([
      claim("world.town.spire", "plaza.ground", [{ idx: idx(2, 2), y: WORLD_MAX_Y + 1 }]),
    ]);
    expect(range.diagnostics.filter((d) => d.code === "LOAM-E494")).toHaveLength(1);

    const dup = one([
      claim("world.town.lane", "road.network", [
        { idx: idx(3, 3), y: 72 },
        { idx: idx(3, 3), y: 74 },
      ]),
    ]);
    expect(dup.diagnostics.filter((d) => d.code === "LOAM-E494")).toHaveLength(1);
    expect(dup.report.claims[0]?.declared).toBe(1);

    const unowned = one([
      claim("world.town.wall", "retaining.seam", [{ idx: idx(4, 4), y: 74 }]),
      claim("world.town.stray", "verge", [{ idx: idx(4, 4), y: 74 }], { kind: "preserve" }),
    ]);
    expect(unowned.diagnostics.filter((d) => d.code === "LOAM-E494")).toHaveLength(1);
  });

  it("transitions reproduce treatmentForSeam's table", () => {
    for (const drop of [1, 2, 6, 7]) {
      for (const run of [5, 6, 25]) {
        const width = 4;
        const depth = run + 2;
        const base = baselineAt(70, width, depth);
        // Column x=1 is the upper platform's band; x=2 is the lower side.
        const upper: GroundClaim[] = [];
        const lower: GroundClaim[] = [];
        for (let z = 1; z <= run; z++) {
          upper.push({ idx: z * width + 1, y: 70 + drop });
          lower.push({ idx: z * width + 2, y: 70 });
        }
        const r = resolveGround(base, [
          claim("upper", "plaza.ground", upper, { transition: "ramp" }),
          claim("lower", "courtyard.floor", lower, { transition: "ramp" }),
        ]);
        const t = r.transitions.filter((x) => x.aboveSource === "upper" && x.belowSource === "lower");
        expect(t).toHaveLength(1);
        expect(t[0]?.drop).toBe(drop);
        expect(t[0]?.cells).toHaveLength(run);
        expect(t[0]?.treatment).toBe(treatmentForSeam(drop, run));
      }
    }
  });

  it("a diagonal boundary is one transition", () => {
    // The lattice-staircase regression: along a 45° boundary consecutive
    // lower-side columns are diagonal neighbours and never edge neighbours, so a
    // 4-connected grouping would return one component per column.
    const size = 12;
    const base = baselineAt(70, size, size);
    const upper: GroundClaim[] = [];
    const lower: GroundClaim[] = [];
    for (let z = 0; z < size; z++) {
      for (let x = 0; x < size; x++) {
        const k = z * size + x;
        if (x < z) upper.push({ idx: k, y: 74 });
        else lower.push({ idx: k, y: 70 });
      }
    }
    const r = resolveGround(base, [
      claim("upper", "plaza.ground", upper, { transition: "ramp" }),
      claim("lower", "courtyard.floor", lower, { transition: "ramp" }),
    ]);
    expect(r.transitions).toHaveLength(1);
    expect(r.transitions[0]?.cells.length).toBeGreaterThan(5);
    expect(r.transitions[0]?.drop).toBe(4);
  });

  it("a face suppresses the transition across it", () => {
    const width = 4;
    const depth = 12;
    const base = baselineAt(70, width, depth);
    const upper: GroundClaim[] = [];
    const lower: GroundClaim[] = [];
    for (let z = 1; z <= 10; z++) {
      upper.push({ idx: z * width + 1, y: 74 });
      lower.push({ idx: z * width + 2, y: 70 });
    }
    const withFace = resolveGround(base, [
      claim("wall", "retaining.seam", upper, { kind: "face", transition: "wall" }),
      claim("lower", "courtyard.floor", lower, { transition: "ramp" }),
    ]);
    expect(between(withFace, "wall", "lower")).toHaveLength(0);
    expect(withFace.report.transitions.substituted.map((s) => s.why)).toContain("faced");
    // The same field with the face declared as an ordinary platform: the
    // transition the face suppressed is exactly the one that comes back.
    const without = resolveGround(base, [
      claim("wall", "plaza.ground", upper, { transition: "wall" }),
      claim("lower", "courtyard.floor", lower, { transition: "ramp" }),
    ]);
    expect(between(without, "wall", "lower")).toHaveLength(1);
  });

  it("a \"none\" request on either side suppresses the transition", () => {
    const width = 4;
    const depth = 12;
    const base = baselineAt(70, width, depth);
    const upper: GroundClaim[] = [];
    const lower: GroundClaim[] = [];
    for (let z = 1; z <= 10; z++) {
      upper.push({ idx: z * width + 1, y: 74 });
      lower.push({ idx: z * width + 2, y: 70 });
    }
    const aboveNone = resolveGround(base, [
      claim("carriageway", "street.network", upper, { transition: "none" }),
      claim("lower", "courtyard.floor", lower, { transition: "ramp" }),
    ]);
    expect(between(aboveNone, "carriageway", "lower")).toHaveLength(0);
    const belowNone = resolveGround(base, [
      claim("upper", "plaza.ground", upper, { transition: "ramp" }),
      claim("carriageway", "street.network", lower, { transition: "none" }),
    ]);
    expect(between(belowNone, "upper", "carriageway")).toHaveLength(0);
    expect(belowNone.report.transitions.substituted.map((s) => s.why)).toContain("none-side");
  });

  it("a wall request under MIN_RETAIN_RUN is substituted and reported", () => {
    const run = MIN_RETAIN_RUN - 2;
    const width = 4;
    const depth = run + 2;
    const base = baselineAt(70, width, depth);
    const upper: GroundClaim[] = [];
    const lower: GroundClaim[] = [];
    for (let z = 1; z <= run; z++) {
      upper.push({ idx: z * width + 1, y: 73 });
      lower.push({ idx: z * width + 2, y: 70 });
    }
    const r = resolveGround(base, [
      claim("upper", "plaza.ground", upper, { transition: "wall" }),
      claim("lower", "courtyard.floor", lower, { transition: "wall" }),
    ]);
    const seam = between(r, "upper", "lower");
    expect(seam).toHaveLength(1);
    expect(seam[0]?.drop).toBe(3); // in the retaining band…
    expect(seam[0]?.cells).toHaveLength(run); // …but shorter than it is tall.
    expect(seam[0]?.treatment).toBe("bank");
    expect(seam[0]?.requested).toEqual({ above: "wall", below: "wall" });
    const subs = r.report.transitions.substituted.filter((s) => s.requested === "wall");
    expect(subs.map((s) => s.source).sort()).toEqual(["lower", "upper"]);
    for (const s of subs) {
      expect(s.built).toBe("ramp");
      expect(s.why).toBe("MIN_RETAIN_RUN");
    }
    const summary = r.diagnostics.find((d) => d.name === "GROUND_TRANSITION");
    expect(summary?.code).toBe("LOAM-I495");
    expect(summary?.message).toContain("substituted");
  });

  it("the report accounts for every declared column", () => {
    const canal = claim(
      "world.town.canal",
      "fluid.channel",
      [1, 2, 3].map((x) => ({ idx: idx(x, 6), y: 66, fluid: { kind: 1 as const, top: 68 } })),
    );
    const deck = claim("world.town.deck", "sweep.run", [{ idx: idx(4, 6), y: 71 }], {
      kind: "clearance",
    });
    const street = claim(
      "world.town.street",
      "street.network",
      [1, 2, 3, 4, 5].map((x) => ({ idx: idx(x, 6), y: 73 })),
      { minColumns: 5 },
    );
    const r = resolveGround(baselineAt(70), [canal, deck, street]);
    for (const row of r.report.claims) {
      expect(row.satisfied + row.adjusted + row.refused).toBe(row.declared);
    }
    const row = r.report.claims.find((c) => c.source === "world.town.street");
    expect(row?.declared).toBe(5);
    expect(row?.refused).toBe(3);
    expect(row?.adjusted).toBe(1);
    expect(row?.satisfied).toBe(1);
    expect(codes(r)).toContain("LOAM-W492");
  });
});

/* -------------------------------------------------------------------------- */
/* §13.2a rule 7 — what the resolver promises a rank-25 bed                    */
/* -------------------------------------------------------------------------- */

describe("a `structure.linework` bed (GROUND-CONTRACT §13.2a rule 7)", () => {
  /** Five columns of approach embankment at 76, over a baseline of 70. */
  const bed = (extra: Partial<GroundIntent> = {}): GroundIntent =>
    claim(
      "world.town.viaduct#linework",
      "structure.linework",
      [2, 3, 4, 5, 6].map((x) => ({ idx: idx(x, 8), y: 76 })),
      { transition: "ramp", ...extra },
    );

  it("beats a `street.network` profile, and the street's row says who took it", () => {
    const street = claim(
      "world.town.high_street",
      "street.network",
      [4, 5, 6, 7, 8].map((x) => ({ idx: idx(x, 8), y: 70 })),
    );
    // Declared in the *other* order deliberately: the resolver sorts by rank
    // and the answer must not depend on which pass ran first.
    const r = resolveGround(baselineAt(70), [street, bed()]);
    for (const x of [2, 3, 4, 5, 6]) expect(r.ground[idx(x, 8)]).toBe(76);
    for (const x of [7, 8]) expect(r.ground[idx(x, 8)]).toBe(70);

    const row = r.report.claims.find((c) => c.source === "world.town.high_street");
    expect(row?.refused).toBe(3);
    expect(row?.refusedTo["world.town.viaduct#linework"]).toBe(3);
    // Silently — a lane losing a column to a bed is the rank order working.
    expect(codes(r)).not.toContain("LOAM-W490");
  });

  it("loses to a rank-0 `fluid.channel`, which is how it keeps out of a canal", () => {
    const canal = claim(
      "world.town.canal",
      "fluid.channel",
      [4, 5].map((x) => ({ idx: idx(x, 8), y: 66, fluid: { kind: 1 as const, top: 69 } })),
    );
    const r = resolveGround(baselineAt(70), [bed(), canal]);
    for (const x of [4, 5]) expect(r.ground[idx(x, 8)]).toBe(66);
    for (const x of [2, 3, 6]) expect(r.ground[idx(x, 8)]).toBe(76);
    // §13.2a rule 3's named approximation, working: `digCanals` runs *later*
    // than the linework slot, and rank 0 settles the collision silently.
    const row = r.report.claims.find((c) => c.source === "world.town.viaduct#linework");
    expect(row?.refused).toBe(2);
    expect(row?.refusedTo["world.town.canal"]).toBe(2);
  });

  it("raises GROUND_CONFLICT when a doorstep cuts into a preserved approach", () => {
    // The guard is declared alongside the claim it protects, over a subset of
    // its columns and from the same source — §5.4's rule, which is why the two
    // share `world.town.viaduct#linework`.
    const guard = claim(
      "world.town.viaduct#linework",
      "structure.linework",
      [3, 4].map((x) => ({ idx: idx(x, 8), y: 76 })),
      { kind: "preserve" },
    );
    const doorstep = claim(
      "world.town.cottage#landing",
      "doorstep.landing",
      [3, 4].map((x) => ({ idx: idx(x, 8), y: 71 })),
    );
    const r = resolveGround(baselineAt(70), [bed(), guard, doorstep]);
    for (const x of [3, 4]) expect(r.ground[idx(x, 8)]).toBe(76);
    expect(codes(r)).toContain("LOAM-W490");
    expect(r.report.conflicts).toHaveLength(2);
    for (const conflict of r.report.conflicts) {
      expect(conflict.guard).toBe("world.town.viaduct#linework");
      expect(conflict.loser).toBe("world.town.cottage#landing");
      expect(conflict.guardY).toBe(76);
      expect(conflict.askedY).toBe(71);
    }
  });

  it("derives the transition beside the bed rather than being asked for one", () => {
    // Rule 7's last-but-one bullet: a linework never asks for its own retaining
    // wall and never gets one it did not earn.
    const r = resolveGround(baselineAt(70), [bed()]);
    expect(r.transitions.length).toBeGreaterThan(0);
    for (const t of r.transitions) {
      expect(t.aboveSource).toBe("world.town.viaduct#linework");
      expect(t.requested.above).toBe("ramp");
      expect(t.drop).toBe(6);
    }
  });
});
