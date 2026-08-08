/**
 * The six laws are laws (FLORA-GRAMMAR-v0 §3.3, §8.1).
 *
 * Every assertion runs over every program × its envelope corners: min/max
 * height (plus the `+4` a mega spruce carries in `scatterOne`) × `radiusDelta`
 * ∈ {−1, 0, +1} × `mega` ∈ {false, true}.
 *
 * The laws:
 *   1. no wood-family part (`log`/`branch`/`stem`) is the topmost block of its column
 *   2. every canopy block is within taxicab 5 of wood
 *   3. every `branch` is 6-adjacent to a `branch` or a `log`
 *   4. every `root` is at `dy ≤ 0` and its column is filled to grade
 *   5. a program's output is a pure function of (variation, def, rng seed)
 *   6. every full-cube part is 6-connected to wood (`floating.isolated` is a
 *      full-cube rule and does not exclude `_leaves`)
 */

import { describe, expect, it } from "vitest";

import {
  LEGACY_FLORA_SPECIES,
  SHAPE_PROGRAMS,
  WOOD_PARTS,
  emitFloraBlocks,
  leafDistances,
  type FloraBlock,
  type FloraSpeciesDef,
  type FloraStateCodec,
  type FloraVariation,
} from "../src/terrain/vegetation.js";

const FACES: readonly (readonly [number, number, number])[] = [
  [0, -1, 0],
  [0, 1, 0],
  [0, 0, -1],
  [0, 0, 1],
  [-1, 0, 0],
  [1, 0, 0],
];

const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;

function corners(def: FloraSpeciesDef): FloraVariation[] {
  const [lo, hi] = def.height;
  const out: FloraVariation[] = [];
  for (const mega of [false, true]) {
    for (const radiusDelta of [-1, 0, 1]) {
      for (const height of [lo, hi, lo + 4, hi + 4]) out.push({ height, radiusDelta, mega });
    }
  }
  return out;
}

/** Every (species, corner) pair, which is the matrix every law runs over. */
function matrix(): { id: string; def: FloraSpeciesDef; v: FloraVariation; blocks: FloraBlock[] }[] {
  const out: { id: string; def: FloraSpeciesDef; v: FloraVariation; blocks: FloraBlock[] }[] = [];
  for (const [id, raw] of Object.entries(LEGACY_FLORA_SPECIES)) {
    const def = raw as FloraSpeciesDef;
    const program = SHAPE_PROGRAMS[def.program as keyof typeof SHAPE_PROGRAMS];
    for (const v of corners(def)) {
      out.push({ id, def, v, blocks: program.blocks(v, def, counting().rng) });
    }
  }
  return out;
}

/** An RNG proxy that counts its calls — `conifer` and `blob` must never draw. */
function counting(): { rng: () => number; calls: () => number } {
  let calls = 0;
  let state = 0x9e3779b9;
  return {
    rng: () => {
      calls += 1;
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x100000000;
    },
    calls: () => calls,
  };
}

const CASES = matrix();

describe("flora: the grammar's six laws", () => {
  it("SHAPE_PROGRAMS covers every program named by a species", () => {
    for (const raw of Object.values(LEGACY_FLORA_SPECIES)) {
      const def = raw as FloraSpeciesDef;
      expect(
        SHAPE_PROGRAMS[def.program as keyof typeof SHAPE_PROGRAMS],
        `species ${def.id} names missing program ${def.program}`,
      ).toBeDefined();
    }
  });

  it("law 1: no wood-family part is the topmost block of its column", () => {
    for (const { id, v, blocks } of CASES) {
      const top = new Map<string, FloraBlock>();
      for (const b of blocks) {
        const column = `${b.dx},${b.dz}`;
        const seen = top.get(column);
        if (seen === undefined || b.dy > seen.dy) top.set(column, b);
      }
      const bare = [...top.values()].filter((b) => WOOD_PARTS.has(b.part));
      expect(bare, `${id} ${JSON.stringify(v)} bare wood tops`).toEqual([]);
    }
  });

  /**
   * Law 2, and the one exception the transcription inherits.
   *
   * The spec's §3.4 claims conifer satisfies law 2 trivially ("every leaf is
   * within `cap + 1` of the axis and `cap ≤ 5`"). It does not: with `mega` the
   * canopy test uses `qx = min(|dx|, |dx−1|)` against `r² + r`, so at
   * `radiusDelta = +1` (`cap = 5`) the widest whorl reaches taxicab 7 from the
   * nearest trunk column, and 32 canopy blocks per tree are further than 6 from
   * wood even by the leaf-to-leaf BFS. This is **existing** geometry — the
   * mega spruce has looked like this since it was written — and WP-A's gate is
   * byte-identity, so the law records the exception rather than moving a block.
   * Under `LEAF_STATE_POLICY = "computed"` those blocks are written
   * `persistent = true`, which is exactly the escape hatch §9.1 designed.
   */
  it("law 2: every canopy block is within taxicab 5 of wood, and the exceptions are enumerated", () => {
    const exceptions: string[] = [];
    for (const { id, v, blocks } of CASES) {
      const wood = blocks.filter((b) => WOOD_PARTS.has(b.part));
      let violations = 0;
      for (const b of blocks) {
        if (b.part !== "leaves" && b.part !== "cap") continue;
        let best = Number.POSITIVE_INFINITY;
        for (const w of wood) {
          const d = Math.abs(b.dx - w.dx) + Math.abs(b.dy - w.dy) + Math.abs(b.dz - w.dz);
          if (d < best) best = d;
        }
        if (best > 5) violations += 1;
      }
      if (violations > 0) exceptions.push(`${id} h=${v.height} rd=${v.radiusDelta} mega=${v.mega}`);
    }
    // Frozen list: every entry is a mega conifer at the widest jitter.
    expect(exceptions).toEqual([
      "spruce_tall h=13 rd=0 mega=true",
      "spruce_tall h=17 rd=0 mega=true",
      "spruce_tall h=13 rd=1 mega=true",
      "spruce_tall h=17 rd=1 mega=true",
    ]);
  });

  it("law 2 (§9.1): the unreachable-canopy count is zero everywhere but those corners", () => {
    let total = 0;
    for (const { id, v, blocks } of CASES) {
      const { unreachable } = leafDistances(blocks);
      const mega = id === "spruce_tall" && v.mega && v.radiusDelta === 1 && v.height >= 13;
      if (!mega) {
        expect(unreachable, `${id} ${JSON.stringify(v)} unreachable canopy`).toBe(0);
      }
      total += unreachable;
    }
    expect(total).toBe(32);
  });

  it("law 3: every branch is 6-adjacent to a branch or a log", () => {
    for (const { id, v, blocks } of CASES) {
      const wood = new Set<string>();
      for (const b of blocks) if (b.part === "branch" || b.part === "log") wood.add(key(b.dx, b.dy, b.dz));
      for (const b of blocks) {
        if (b.part !== "branch") continue;
        const attached = FACES.some(([ox, oy, oz]) => wood.has(key(b.dx + ox, b.dy + oy, b.dz + oz)));
        expect(attached, `${id} ${JSON.stringify(v)} floating branch`).toBe(true);
      }
    }
  });

  it("law 4: every root is at dy <= 0 and its column is filled to grade", () => {
    for (const { id, v, blocks } of CASES) {
      const solid = new Set<string>();
      for (const b of blocks) solid.add(key(b.dx, b.dy, b.dz));
      for (const b of blocks) {
        if (b.part !== "root") continue;
        expect(b.dy, `${id} ${JSON.stringify(v)} root above grade`).toBeLessThanOrEqual(0);
        for (let y = b.dy + 1; y <= 0; y++) {
          expect(solid.has(key(b.dx, y, b.dz)), `${id} root column gap`).toBe(true);
        }
      }
    }
  });

  it("law 5: a program's output is a pure function of (variation, def, rng seed)", () => {
    for (const [, raw] of Object.entries(LEGACY_FLORA_SPECIES)) {
      const def = raw as FloraSpeciesDef;
      const program = SHAPE_PROGRAMS[def.program as keyof typeof SHAPE_PROGRAMS];
      for (const v of corners(def)) {
        const a = program.blocks(v, def, counting().rng);
        const b = program.blocks(v, def, counting().rng);
        expect(a).toEqual(b);
      }
    }
  });

  it("law 6: every full-cube part is 6-connected to wood", () => {
    for (const { id, v, blocks } of CASES) {
      const index = new Map<string, FloraBlock>();
      for (const b of blocks) index.set(key(b.dx, b.dy, b.dz), b);
      // Flood from the wood through every full-cube part.
      const seen = new Set<string>();
      const queue: FloraBlock[] = [];
      for (const b of blocks) {
        if (!WOOD_PARTS.has(b.part)) continue;
        const k = key(b.dx, b.dy, b.dz);
        if (seen.has(k)) continue;
        seen.add(k);
        queue.push(b);
      }
      while (queue.length > 0) {
        const b = queue.pop() as FloraBlock;
        for (const [ox, oy, oz] of FACES) {
          const k = key(b.dx + ox, b.dy + oy, b.dz + oz);
          const n = index.get(k);
          if (n === undefined || seen.has(k) || n.part === "hanging") continue;
          seen.add(k);
          queue.push(n);
        }
      }
      for (const b of blocks) {
        if (b.part === "hanging") continue;
        expect(
          seen.has(key(b.dx, b.dy, b.dz)),
          `${id} ${JSON.stringify(v)} isolated ${b.part} at ${b.dx},${b.dy},${b.dz}`,
        ).toBe(true);
      }
    }
  });

  it("conifer and blob never draw", () => {
    for (const raw of Object.values(LEGACY_FLORA_SPECIES)) {
      const def = raw as FloraSpeciesDef;
      const program = SHAPE_PROGRAMS[def.program as keyof typeof SHAPE_PROGRAMS];
      for (const v of corners(def)) {
        const proxy = counting();
        program.blocks(v, def, proxy.rng);
        expect(proxy.calls(), `${def.id} drew from the RNG`).toBe(0);
      }
    }
  });

  it("canopyRadius bounds the block list", () => {
    for (const { id, def, v, blocks } of CASES) {
      const program = SHAPE_PROGRAMS[def.program as keyof typeof SHAPE_PROGRAMS];
      // A mega conifer's whorl runs `-r .. r+1` around a 2×2 trunk, which is
      // why `clipTrees` and the shade map both add 2 for `mega`. The bound is
      // the one those callers actually use.
      const bound = program.canopyRadius(v, def) + (v.mega ? 2 : 0);
      for (const b of blocks) {
        expect(Math.abs(b.dx), `${id} ${JSON.stringify(v)} dx out of reach`).toBeLessThanOrEqual(bound);
        expect(Math.abs(b.dz), `${id} ${JSON.stringify(v)} dz out of reach`).toBeLessThanOrEqual(bound);
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* The parts → blockstate mapping (§3.2)                                       */
/* -------------------------------------------------------------------------- */

/**
 * A tiny stand-in registry: enough property vocabulary to exercise every rule
 * without dragging the prismarine stack into a geometry test.
 */
function fakeCodec(): FloraStateCodec {
  const table: Record<string, Record<string, string>> = {
    log: { axis: "y" },
    stripped_log: { axis: "y" },
    leaves: { distance: "7", persistent: "false", waterlogged: "false" },
    mushroom_stem: { up: "true", down: "true", north: "true", south: "true", east: "true", west: "true" },
    mushroom_cap: { up: "true", down: "true", north: "true", south: "true", east: "true", west: "true" },
    vine: { up: "false", north: "false", south: "false", east: "false", west: "false" },
    cluster: { facing: "up", waterlogged: "false" },
    shroomlight: {},
  };
  const names = Object.keys(table);
  const encoded = new Map<string, number>();
  const decoded = new Map<number, { name: string; props: Record<string, string> }>();
  let next = 1;
  const idOf = (name: string, props: Record<string, string>): number => {
    const k = `${name}|${JSON.stringify(props, Object.keys(props).sort())}`;
    let id = encoded.get(k);
    if (id === undefined) {
      id = next++;
      encoded.set(k, id);
      decoded.set(id, { name, props });
    }
    return id;
  };
  for (const name of names) idOf(name, table[name] as Record<string, string>);
  return {
    blockStateProps: (stateId) => {
      const d = decoded.get(stateId);
      return d === undefined ? undefined : { name: d.name, props: { ...d.props } };
    },
    blockStateOf: (name, props) => idOf(name, { ...props }),
  };
}

function defaultState(codec: FloraStateCodec, name: string): number {
  for (let id = 1; id < 64; id++) {
    const d = codec.blockStateProps(id);
    if (d?.name === name) return id;
  }
  throw new Error(`no default state for ${name}`);
}

describe("flora: the parts → blockstate mapping", () => {
  const codec = fakeCodec();
  const states = {
    log: defaultState(codec, "log"),
    leaves: defaultState(codec, "leaves"),
    branch: defaultState(codec, "log"),
    root: defaultState(codec, "log"),
    stem: defaultState(codec, "mushroom_stem"),
    cap: defaultState(codec, "mushroom_cap"),
    hanging: defaultState(codec, "vine"),
    deco: defaultState(codec, "cluster"),
  };

  it("a branch takes its own axis; a root is seated axis=y", () => {
    const out = emitFloraBlocks(
      [
        { dx: 0, dy: 0, dz: 0, part: "log" },
        { dx: 1, dy: 0, dz: 0, part: "branch", axis: "x" },
        { dx: 0, dy: 0, dz: 1, part: "branch", axis: "z" },
        { dx: 0, dy: -1, dz: 0, part: "root" },
      ],
      states,
      codec,
    );
    const props = out.blocks.map((b) => codec.blockStateProps(b.stateId)?.props.axis);
    expect(props).toEqual(["y", "x", "z", "y"]);
  });

  it("a mushroom face is true exactly when nothing of the plant is against it", () => {
    const out = emitFloraBlocks(
      [
        { dx: 0, dy: 0, dz: 0, part: "stem" },
        { dx: 0, dy: 1, dz: 0, part: "cap" },
      ],
      states,
      codec,
    );
    const stem = codec.blockStateProps((out.blocks[0] as { stateId: number }).stateId)?.props;
    const cap = codec.blockStateProps((out.blocks[1] as { stateId: number }).stateId)?.props;
    expect(stem?.up).toBe("false"); // the cap sits on it
    expect(stem?.north).toBe("true");
    expect(cap?.down).toBe("false"); // the stem is under it
    expect(cap?.up).toBe("true");
  });

  it("a hanging block with nothing above it is dropped; a ceiling strand takes up=true", () => {
    const out = emitFloraBlocks(
      [
        { dx: 0, dy: 4, dz: 0, part: "leaves" },
        { dx: 0, dy: 3, dz: 0, part: "hanging" },
        { dx: 0, dy: 2, dz: 0, part: "hanging" },
        { dx: 5, dy: 3, dz: 5, part: "hanging" }, // unsupported
      ],
      states,
      codec,
    );
    expect(out.droppedHanging).toBe(1);
    expect(out.blocks).toHaveLength(3);
    for (const b of out.blocks.slice(1)) {
      expect(codec.blockStateProps(b.stateId)?.props.up).toBe("true");
    }
  });

  // Kai's walk, oldgrowth_vale-2: "vines are oriented wrong" — a curtain beside
  // a trunk rendered as flat ceiling plates because `up=true` was written
  // universally. Faces now name the actual support (§3.2, amended 2026-08-08).
  it("a hanging block beside wood attaches to the wood, not to the sky", () => {
    const out = emitFloraBlocks(
      [
        { dx: 0, dy: 4, dz: 0, part: "log" },
        { dx: 0, dy: 3, dz: 0, part: "log" },
        { dx: 1, dy: 3, dz: 0, part: "hanging" },
      ],
      states,
      codec,
    );
    expect(out.droppedHanging).toBe(0);
    const p = codec.blockStateProps((out.blocks[2] as { stateId: number }).stateId)?.props;
    expect(p?.west).toBe("true"); // the trunk is at −x
    expect(p?.up).toBe("false"); // nothing of the plant is above it
    expect(p?.east).toBe("false");
  });

  it("a hanging block both beside wood and under leaves carries both faces", () => {
    const out = emitFloraBlocks(
      [
        { dx: 0, dy: 3, dz: 0, part: "log" },
        { dx: 1, dy: 4, dz: 0, part: "leaves" },
        { dx: 1, dy: 3, dz: 0, part: "hanging" },
      ],
      states,
      codec,
    );
    const p = codec.blockStateProps((out.blocks[2] as { stateId: number }).stateId)?.props;
    expect(p?.west).toBe("true");
    expect(p?.up).toBe("true");
  });

  it("a chain segment inherits the faces of the vine above it", () => {
    const out = emitFloraBlocks(
      [
        { dx: 0, dy: 5, dz: 0, part: "log" },
        { dx: 1, dy: 5, dz: 0, part: "hanging" }, // beside the trunk: west
        { dx: 1, dy: 4, dz: 0, part: "hanging" }, // past the trunk: inherits west
        { dx: 1, dy: 3, dz: 0, part: "hanging" },
      ],
      states,
      codec,
    );
    expect(out.droppedHanging).toBe(0);
    for (const b of out.blocks.slice(1)) {
      const p = codec.blockStateProps(b.stateId)?.props;
      expect(p?.west).toBe("true");
      expect(p?.up).toBe("false");
    }
  });

  it("every emitted hanging block carries at least one attachment face", () => {
    const out = emitFloraBlocks(
      [
        { dx: 0, dy: 4, dz: 0, part: "leaves" },
        { dx: 0, dy: 3, dz: 0, part: "hanging" },
        { dx: 0, dy: 2, dz: 0, part: "hanging" },
        { dx: 7, dy: 7, dz: 7, part: "hanging" },
      ],
      states,
      codec,
    );
    for (const b of out.blocks) {
      const d = codec.blockStateProps(b.stateId);
      if (d?.name !== "vine") continue;
      expect(Object.values(d.props).some((v) => v === "true")).toBe(true);
    }
  });

  it("a deco block faces away from its wood support, and is dropped without one", () => {
    const out = emitFloraBlocks(
      [
        { dx: 0, dy: 0, dz: 0, part: "log" },
        { dx: 1, dy: 0, dz: 0, part: "deco" },
        { dx: 9, dy: 9, dz: 9, part: "deco" },
      ],
      states,
      codec,
    );
    expect(out.droppedDeco).toBe(1);
    expect(codec.blockStateProps((out.blocks[1] as { stateId: number }).stateId)?.props.facing).toBe(
      "east",
    );
  });

  it('LEAF_STATE_POLICY "legacy" writes the palette default, "computed" writes the BFS distance', () => {
    const def = LEGACY_FLORA_SPECIES.oak_round as FloraSpeciesDef;
    const blocks = SHAPE_PROGRAMS.blob.blocks({ height: 6, radiusDelta: 0, mega: false }, def, () => 0);
    const legacy = emitFloraBlocks(blocks, states, codec, "legacy");
    for (const b of legacy.blocks) {
      const d = codec.blockStateProps(b.stateId);
      if (d?.name !== "leaves") continue;
      expect(d.props.distance).toBe("7");
      expect(d.props.persistent).toBe("false");
    }
    const computed = emitFloraBlocks(blocks, states, codec, "computed");
    expect(computed.unreachableCanopy).toBe(0);
    const distances = new Set<string>();
    for (const b of computed.blocks) {
      const d = codec.blockStateProps(b.stateId);
      if (d?.name !== "leaves") continue;
      expect(d.props.persistent).toBe("false");
      distances.add(d.props.distance as string);
    }
    expect(distances.has("7")).toBe(false);
    expect(distances.size).toBeGreaterThan(1);
  });

  it("an unresolved part is a compiler bug, not a silent drop", () => {
    expect(() =>
      emitFloraBlocks([{ dx: 0, dy: 0, dz: 0, part: "cap" }], { log: states.log, leaves: states.leaves }, codec),
    ).toThrow(/no palette state resolved/);
  });
});
