/**
 * **What holds a fixture up** — one vocabulary, read by two readers.
 *
 * RUINS-PLAN-v0 §5.6 states the rule the decay's `settleFixtures` fixpoint is
 * built on, and it states the reason in the same sentence: *"the support
 * predicate is the physics lint's own — `bracketedTo`, the `NEEDS_GROUND` set,
 * the hanging rule — read from one place so the sweep and the lint cannot
 * disagree."* Two mechanisms for one invariant is how `CURB_LEVEL_TOLERANCE`
 * happened, and a decay sweep that thought a wall banner stood on the floor
 * while the lint knew it hung off a wall would ship exactly the class of defect
 * the fixpoint exists to remove.
 *
 * So the **classification** lives here — which direction a fixture's support
 * lies in, given its name and its state — and both readers import it:
 *
 * - `structures/decay.ts` sweeps an op list before the world exists, and asks
 *   for the direction so it can look the right way and delete what has nothing
 *   there;
 * - `emit/physics.ts` reads a finished world back and asks the same question,
 *   then answers "is there something there" with the block registry's own
 *   `isFullCube`.
 *
 * **What is deliberately NOT here: solidity.** The lint has a registry and can
 * ask it; a fit-out has an op list and cannot. Sharing the direction is what
 * keeps the two honest; sharing a guessed `isSolid` would have made the
 * *weaker* of the two answers the shared one.
 */

/**
 * Blocks that stand on the one below them — a link in a support chain.
 *
 * The physics lint's set, verbatim, and now literally the same constant: a
 * lantern on a fence on a fence on air is the defect that made this a *chain*
 * check rather than a neighbour check, and the decay inherits both the set and
 * the reason.
 */
export const NEEDS_GROUND =
  /(_fence|_wall|_fence_gate|_carpet|_pressure_plate|_sign|torch|campfire|lantern)$/;

/** True for a block that stands on the one below it. */
export function needsGround(name: string): boolean {
  if (name.startsWith("potted_")) return true;
  // The blocks whose name ends in the suffix of a standing block but which hang
  // off a *neighbour* instead: a wall torch brackets to the block behind it, and
  // so does a wall sign. Both have their own attachment rule; asking the support
  // chain about them reads the air under a wall sign as a defect.
  if (name.endsWith("wall_torch")) return false;
  if (name.endsWith("_wall_sign") || name.endsWith("_wall_hanging_sign")) return false;
  return NEEDS_GROUND.test(name);
}

/**
 * Where a fixture's support lies.
 *
 * - `below` — it stands on the block under it (a torch, a carpet, a pot);
 * - `above` — it hangs from the block over it (a hanging lantern, a chain);
 * - `behind` — it brackets to the block its `facing` points away from (a
 *   ladder, a wall torch, a wall sign, a wall banner);
 * - `null` — nothing this vocabulary polices. A vine, a slab and a full cube
 *   are all `null`: the first two are covered by the crumble's own whole-run
 *   rule and the `floating.*` family, not by an attachment rule.
 */
export type SupportDirection = "below" | "above" | "behind" | null;

/**
 * Which way a fixture's support lies, from its name and its state.
 *
 * Order matters and is the lint's: the `behind` fixtures are pulled out first,
 * because three of them end in a suffix {@link needsGround} would otherwise
 * claim.
 */
export function supportDirection(
  name: string,
  props: Readonly<Record<string, string>> | undefined,
): SupportDirection {
  if (name === "ladder") return "behind";
  if (name.endsWith("wall_torch")) return "behind";
  if (name.endsWith("_wall_sign") || name.endsWith("_wall_hanging_sign")) return "behind";
  if (name.endsWith("_wall_banner")) return "behind";
  if (name === "painting" || name === "item_frame" || name === "glow_item_frame") return "behind";
  if (name.endsWith("lantern")) return props?.["hanging"] === "true" ? "above" : "below";
  if (name === "chain") return props?.["axis"] === "y" || props === undefined ? "above" : null;
  if (name.endsWith("_hanging_sign")) return "above";
  if (needsGround(name)) return "below";
  if (name === "flower_pot" || name.startsWith("potted_")) return "below";
  if (name.endsWith("_bed") || name.endsWith("_door")) return "below";
  if (name.endsWith("_sapling") || name === "dead_bush" || name.endsWith("_crop")) return "below";
  return null;
}

/**
 * Names that are not a block at all as far as support goes.
 *
 * A cell holding one of these supports nothing standing on it, and a fixture
 * whose support cell holds one is unsupported. Kept small and positive on
 * purpose — the failure that matters is calling something *insubstantial*
 * substantial, which is how a lantern hung under a vine survives a sweep.
 */
export const INSUBSTANTIAL =
  /^(air|cave_air|void_air|water|lava|vine|cobweb|snow|light|structure_void)$/;

/**
 * Whether a block name can hold a fixture up, on the evidence a fit-out has.
 *
 * The op-list side's answer to "is there something there", and deliberately
 * *conservative in the direction that removes*: anything not a full cube by
 * name — a slab, a stair, a fence, a pane, a torch — cannot be the anchor of a
 * bracketed fixture, so a fixture that lost its wall goes even if what is left
 * beside it is a stair. The lint asks the registry and gets the exact answer;
 * this side removes a superset, which is the safe direction, because the sweep
 * can only ever *delete*.
 */
export function canSupport(name: string): boolean {
  if (INSUBSTANTIAL.test(name)) return false;
  if (
    /(_slab|_stairs|_fence|_fence_gate|_wall|_pane|_bars|_door|_trapdoor|_sign|_banner|_carpet|_pressure_plate|_button|torch|lantern|ladder|_bed|chain|candle|_pot|_head|_skull)$/.test(
      name,
    )
  ) {
    return false;
  }
  if (name.startsWith("potted_")) return false;
  return true;
}

/**
 * Blocks a 1×2 player body cannot stand inside — **the physics lint's own set**,
 * and now literally the same constant.
 *
 * `emit/physics.ts` owned this regex; `decay.ts`'s `reachOrRefuse` needed the
 * same question answered on an op list, and asking it with a *different*
 * vocabulary is what the shipped defect was: the flood treated a flower pot's
 * cell as sealed, so it never noticed the cell was stranded, while the lint
 * treated the same cell as a place a player stands and demanded a route to it —
 * `traversal.unreachable` on a potted plant in a decayed shell.
 *
 * Deliberately a positive list of *obstacles* rather than a list of things you
 * can walk through: the failure mode that matters is calling something passable
 * that is not, because that makes a traversal simulation report a route the
 * player does not have. The lint falls through to the block registry's
 * `isFullCube` for everything else; the op-list side falls through to
 * {@link canSupport}, which is the same question answered by name.
 */
export const BODY_BLOCKING =
  /(_slab|_stairs|_fence|_wall|_bed|_pane|iron_bars|_gate|chest|barrel|furnace|smithing_table|crafting_table|fletching_table|cartography_table|loom|anvil|cauldron|composter|bookshelf|lectern|campfire|_shulker_box|hopper|beacon|conduit|lantern|bell|grindstone|stonecutter|brewing_stand|enchanting_table|_cake|dragon_egg)$/;

/** True for a block a standing player's body cannot occupy the cell of. */
export function bodyBlocking(name: string): boolean {
  return BODY_BLOCKING.test(name);
}

/**
 * Whether a player's body fits in a cell holding this block, **on the evidence
 * a fit-out has** — the op-list twin of the lint's `passableAt`.
 *
 * Two answers composed, in the lint's own order: an obstacle blocks
 * ({@link bodyBlocking}), and anything the name says is a full cube blocks
 * ({@link canSupport}, which is exactly "a full cube by name"). What is left —
 * a pot, a carpet, a torch, a sign, a button, a door, a ladder, a vine — is
 * what the lint's registry answer also lets a body stand in.
 *
 * Where the two can still differ, this side is the *narrower* one only for
 * names it cannot classify, and callers are expected to union it with whatever
 * else they know is passable.
 */
export function bodyFits(name: string): boolean {
  if (INSUBSTANTIAL.test(name)) return true;
  if (bodyBlocking(name)) return false;
  return !canSupport(name);
}
