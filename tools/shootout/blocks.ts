/**
 * The Luna-vs-Tripo shootout's interchange format.
 *
 * A structure is a bag of solid blocks in a local frame: min corner at
 * (0,0,0), y up, air omitted. Both producers (`luna-structure.ts`,
 * `tripo-gen.ts`) write this; `assemble.ts` consumes it.
 */

export interface BlockEntry {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Namespaced block id, e.g. `minecraft:stone_bricks`. */
  readonly id: string;
}

export interface BlocksDoc {
  readonly name: string;
  /** Bounding size [dx, dy, dz]; every block sits inside it. */
  readonly size: readonly [number, number, number];
  readonly blocks: readonly BlockEntry[];
}

/** Validate an already-parsed JSON value, returning a typed document. */
export function parseBlocksDoc(raw: unknown, source = "<blocks>"): BlocksDoc {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`${source}: expected an object`);
  }
  const doc = raw as Record<string, unknown>;

  const name = doc["name"];
  if (typeof name !== "string" || name === "") {
    throw new Error(`${source}.name: expected a non-empty string`);
  }

  const sizeRaw = doc["size"];
  if (!Array.isArray(sizeRaw) || sizeRaw.length !== 3 || !sizeRaw.every(isNonNegInt)) {
    throw new Error(`${source}.size: expected [dx, dy, dz] of non-negative integers`);
  }
  const size: [number, number, number] = [
    sizeRaw[0] as number,
    sizeRaw[1] as number,
    sizeRaw[2] as number,
  ];

  const blocksRaw = doc["blocks"];
  if (!Array.isArray(blocksRaw) || blocksRaw.length === 0) {
    throw new Error(`${source}.blocks: expected a non-empty array`);
  }
  const blocks: BlockEntry[] = blocksRaw.map((entry, i) => {
    const where = `${source}.blocks[${i}]`;
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error(`${where}: expected an object`);
    }
    const b = entry as Record<string, unknown>;
    for (const axis of ["x", "y", "z"] as const) {
      if (!isNonNegInt(b[axis])) throw new Error(`${where}.${axis}: expected a non-negative integer`);
    }
    const id = b["id"];
    if (typeof id !== "string" || !id.includes(":")) {
      throw new Error(`${where}.id: expected a namespaced block id`);
    }
    return { x: b["x"] as number, y: b["y"] as number, z: b["z"] as number, id };
  });

  for (const b of blocks) {
    if (b.x >= size[0] || b.y >= size[1] || b.z >= size[2]) {
      throw new Error(`${source}: block (${b.x},${b.y},${b.z}) falls outside size [${size.join(", ")}]`);
    }
  }

  return { name, size, blocks };
}

function isNonNegInt(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
