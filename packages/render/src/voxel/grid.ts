/**
 * Vendored 2026-07-27 from the mcai prototype (packages/voxel-renderer);
 * carried over as proven code per docs/DESIGN.md.
 */

/**
 * A dense, render-ready copy of a bounded region of a voxel world.
 *
 * Every renderer in this package reads a `VoxelGrid` rather than the world it
 * came from, so the same drawing code serves a composed host-side state, a
 * single node's overlay, or region files read back off a packaged world.
 */

export interface GridBounds {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export class VoxelGrid {
  readonly sizeX: number;
  readonly sizeY: number;
  readonly sizeZ: number;
  /** Palette index per cell; 0 is always air. */
  readonly cells: Uint16Array;
  readonly palette: string[];

  private readonly paletteIndex = new Map<string, number>();

  /**
   * Per-column biome, interned like the block palette; index 0 means "unknown"
   * (untinted). Biomes are stored per 4x4x4 cell in a world, but every renderer
   * here tints by the surface column, so one biome per (x, z) is enough — and
   * it keeps the extra memory at 1/height of a full 3D array.
   */
  private biomeCells?: Uint16Array;
  readonly biomePalette: string[] = [""];
  private readonly biomeIndex = new Map<string, number>([["", 0]]);

  constructor(readonly bounds: GridBounds) {
    this.sizeX = bounds.maxX - bounds.minX + 1;
    this.sizeY = bounds.maxY - bounds.minY + 1;
    this.sizeZ = bounds.maxZ - bounds.minZ + 1;
    if (this.sizeX <= 0 || this.sizeY <= 0 || this.sizeZ <= 0) {
      throw new Error(`Empty grid bounds ${JSON.stringify(bounds)}`);
    }
    this.cells = new Uint16Array(this.sizeX * this.sizeY * this.sizeZ);
    this.palette = ["minecraft:air"];
    this.paletteIndex.set("minecraft:air", 0);
  }

  /** Intern a block state, returning its palette index. */
  intern(blockState: string): number {
    const existing = this.paletteIndex.get(blockState);
    if (existing !== undefined) return existing;
    const index = this.palette.length;
    if (index > 0xffff) throw new Error("VoxelGrid palette exceeded 65536 entries");
    this.palette.push(blockState);
    this.paletteIndex.set(blockState, index);
    return index;
  }

  private offset(x: number, y: number, z: number): number {
    return ((y - this.bounds.minY) * this.sizeZ + (z - this.bounds.minZ)) * this.sizeX + (x - this.bounds.minX);
  }

  contains(x: number, y: number, z: number): boolean {
    const b = this.bounds;
    return x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY && z >= b.minZ && z <= b.maxZ;
  }

  setIndex(x: number, y: number, z: number, paletteIndex: number): void {
    this.cells[this.offset(x, y, z)] = paletteIndex;
  }

  set(x: number, y: number, z: number, blockState: string): void {
    this.cells[this.offset(x, y, z)] = this.intern(blockState);
  }

  /** Palette index at an absolute position; 0 (air) outside the grid. */
  indexAt(x: number, y: number, z: number): number {
    if (!this.contains(x, y, z)) return 0;
    return this.cells[this.offset(x, y, z)]!;
  }

  blockAt(x: number, y: number, z: number): string {
    return this.palette[this.indexAt(x, y, z)]!;
  }

  /** Record the biome of a column (namespaced name); "" clears it. */
  setColumnBiome(x: number, z: number, biome: string): void {
    if (!this.containsColumn(x, z)) return;
    let index = this.biomeIndex.get(biome);
    if (index === undefined) {
      index = this.biomePalette.length;
      this.biomePalette.push(biome);
      this.biomeIndex.set(biome, index);
    }
    this.biomeCells ??= new Uint16Array(this.sizeX * this.sizeZ);
    this.biomeCells[this.columnOffset(x, z)] = index;
  }

  /** Biome of a column, or `undefined` when none was recorded. */
  biomeAt(x: number, z: number): string | undefined {
    if (this.biomeCells === undefined || !this.containsColumn(x, z)) return undefined;
    const name = this.biomePalette[this.biomeCells[this.columnOffset(x, z)]!];
    return name === undefined || name === "" ? undefined : name;
  }

  /** True when any column carries a biome, i.e. tinting has something to do. */
  get hasBiomes(): boolean {
    return this.biomeCells !== undefined;
  }

  private containsColumn(x: number, z: number): boolean {
    const b = this.bounds;
    return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
  }

  private columnOffset(x: number, z: number): number {
    return (z - this.bounds.minZ) * this.sizeX + (x - this.bounds.minX);
  }

  /** Fill from any block accessor, one call per cell. */
  static from(bounds: GridBounds, blockAt: (x: number, y: number, z: number) => string): VoxelGrid {
    const grid = new VoxelGrid(bounds);
    // Cache the resolved palette index per distinct block state; block
    // accessors return interned-ish strings, and a Map hit is far cheaper than
    // re-walking the grid palette.
    for (let y = bounds.minY; y <= bounds.maxY; y++) {
      for (let z = bounds.minZ; z <= bounds.maxZ; z++) {
        for (let x = bounds.minX; x <= bounds.maxX; x++) {
          const block = blockAt(x, y, z);
          if (block === "minecraft:air" || block === "air" || block === "") continue;
          grid.set(x, y, z, block);
        }
      }
    }
    return grid;
  }

  /** Bounds of the non-air content, or undefined when the grid is empty. */
  contentBounds(): GridBounds | undefined {
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    const b = this.bounds;
    for (let y = b.minY; y <= b.maxY; y++) {
      for (let z = b.minZ; z <= b.maxZ; z++) {
        for (let x = b.minX; x <= b.maxX; x++) {
          if (this.cells[this.offset(x, y, z)] === 0) continue;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (z < minZ) minZ = z;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
          if (z > maxZ) maxZ = z;
        }
      }
    }
    if (minX === Infinity) return undefined;
    return { minX, minY, minZ, maxX, maxY, maxZ };
  }
}
