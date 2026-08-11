/**
 * The world's material theme, as an authored program sees it (`api.theme`).
 *
 * ## Why this exists
 *
 * A walked Troy shipped a bespoke `hidden_greeks` program that invented four
 * palettes of its own — sandstone, red sandstone, stone bricks, terracotta,
 * each with a wool flag — and scattered them through a city built in sun clay.
 * Nothing was wrong with the program: it had no way to ask what the world was
 * made of, so it guessed, and a guess is foreign by construction. Every other
 * builder in the compiler — the building grammar, the streets, the retaining
 * walls, the curtain wall — reads the settlement's dealt {@link MaterialTheme}.
 * This file is that same read, projected into plain frozen strings a program
 * can index.
 *
 * ## The vocabulary is not new
 *
 * `ground` is `GroundMaterials`, `wood`/`stone`/`roof` are the grammar's
 * `WoodSet`/`StoneSet`/`RoofSet`, and `wall` is the curtain's `WallMaterials`
 * — the same five roles the fortification dial derives. A program that writes
 * `api.theme.ground.revetment` is naming the very block the retaining wall
 * beside it is faced with. No parallel names were invented, deliberately: two
 * vocabularies for one palette is how the drift starts again.
 *
 * ## Determinism, and the gate
 *
 * The theme is dealt from `hash(worldSeed, rootPath)` before any program runs,
 * so reading it draws nothing. The **authoring gate** knows no world, and runs
 * every program against {@link VERIFICATION_THEME} — a pinned theme, the same
 * one on every host — which is what keeps `outputHash` a property of the
 * *program*. A theme-reading program therefore builds different blocks in the
 * world than it did under the gate, and that is correct: the hash pins the
 * code, the seating and the palette are the world's business.
 */

import type {
  ProgramGroundRoles,
  ProgramRoofRoles,
  ProgramStoneRoles,
  ProgramTheme,
  ProgramWallRoles,
  ProgramWoodRoles,
} from "@terrainist/spec";
import {
  ALL_MATERIAL_THEMES,
  MATERIAL_THEMES,
  type MaterialTheme,
  type RoofSet,
  type StoneSet,
  type WoodSet,
} from "@terrainist/stdlib";

import { wallMaterialsOfTheme } from "../structures/walls.js";
import { groundMaterials } from "../terrain/palette.js";

/**
 * The theme a program sees when the caller has none.
 *
 * The gate, the terrarium and the exhibits all run programs outside a
 * settlement, and "no theme" must still be *a* theme rather than a hole: a
 * program that reads `api.theme.stone.primary` may never get `undefined`, or
 * every such program becomes a crash the moment it is verified. The first
 * shipped theme is that answer, and it is pinned — changing it changes every
 * verified `outputHash` of every theme-reading program in every document.
 */
export const DEFAULT_PROGRAM_THEME: MaterialTheme = MATERIAL_THEMES[0] as MaterialTheme;

/** Full block strings, as the API promises: `"minecraft:mud_bricks"`. */
function qualified(block: string): string {
  return block.includes(":") ? block : `minecraft:${block}`;
}

function groundRoles(theme: MaterialTheme): ProgramGroundRoles {
  const g = groundMaterials(theme);
  return Object.freeze({
    pavement: qualified(g.pavement),
    kerb: qualified(g.kerb),
    tread: qualified(g.tread),
    revetment: qualified(g.revetment),
    coping: qualified(g.coping),
    plinth: qualified(g.plinth),
    weep: qualified(g.weep),
    rail: qualified(g.rail),
    stairs: qualified(g.stairs),
    slab: qualified(g.slab),
    bank: qualified(g.bank),
    scree: qualified(g.scree),
  });
}

function woodRoles(wood: WoodSet): ProgramWoodRoles {
  return Object.freeze({
    id: wood.id,
    planks: qualified(wood.planks),
    log: qualified(wood.log),
    stripped: qualified(wood.stripped),
    stairs: qualified(wood.stairs),
    slab: qualified(wood.slab),
    fence: qualified(wood.fence),
    door: qualified(wood.door),
    trapdoor: qualified(wood.trapdoor),
  });
}

function stoneRoles(stone: StoneSet): ProgramStoneRoles {
  return Object.freeze({
    id: stone.id,
    primary: qualified(stone.primary),
    accent: qualified(stone.accent),
    stairs: qualified(stone.stairs),
    slab: qualified(stone.slab),
    wall: qualified(stone.wall),
  });
}

function roofRoles(roof: RoofSet): ProgramRoofRoles {
  return Object.freeze({
    id: roof.id,
    stairs: qualified(roof.stairs),
    slab: qualified(roof.slab),
    solid: qualified(roof.solid),
  });
}

function wallRoles(theme: MaterialTheme): ProgramWallRoles {
  const m = wallMaterialsOfTheme(theme);
  return Object.freeze({
    core: qualified(m.core),
    walk: qualified(m.walk),
    parapet: qualified(m.parapet),
    merlon: qualified(m.merlon),
    tower: qualified(m.tower),
  });
}

/**
 * Project a dealt theme into the frozen, string-only view a program is handed.
 *
 * The **lead** set of each family, not a dealt triple: a program is one icon,
 * not a street of houses, and the deal exists to keep neighbours distinct from
 * each other. Taking `[0]` makes the palette a pure function of the theme id,
 * which is what lets two instances of one plugin agree without coordinating.
 */
export function programThemeOf(theme: MaterialTheme | undefined): ProgramTheme {
  const t = theme ?? DEFAULT_PROGRAM_THEME;
  return Object.freeze({
    id: t.id,
    ground: groundRoles(t),
    wood: woodRoles(t.woods[0] as WoodSet),
    stone: stoneRoles(t.stones[0] as StoneSet),
    roof: roofRoles(t.roofs[0] as RoofSet),
    wall: wallRoles(t),
  });
}

/** The dealt theme with this id, or `undefined` when nothing carries it. */
export function materialThemeById(id: string | undefined): MaterialTheme | undefined {
  if (id === undefined) return undefined;
  return ALL_MATERIAL_THEMES.find((t) => t.id === id);
}

/**
 * The theme every gate run and every themeless caller sees.
 *
 * Pinned, and computed once: it is part of what `outputHash` means.
 */
export const VERIFICATION_THEME: ProgramTheme = programThemeOf(undefined);
