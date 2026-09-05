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
const NEEDS_GROUND =
  /(_fence|_wall|_fence_gate|_carpet|_pressure_plate|_sign|torch|campfire|(?<!sea_)lantern)$/;

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
  // **The shutter** (2026-08-13, Kai's walk: "a lot of the ruined/destroyed
  // buildings often have floating trapdoors"). An *open* trapdoor is hinged to
  // the block its `facing` points away from — the wall of the window it
  // shutters — exactly as a wall sign is, and the crumble takes that wall away
  // under it. Vanilla never pops a trapdoor, so no support rule ever asked
  // about it and the fixpoint stepped straight over the single most visible
  // ruin defect there is: **6,568** of them, counted over all 258 building
  // archetypes at two decay bands plus the five relics that decay from their
  // own profiles.
  //
  // A *closed* trapdoor is not a shutter at all: it is a horizontal panel —
  // a table top, an awning, a cart wheel, a ship's batten, a boat's gunwale —
  // held up by nothing in vanilla and by nothing here either, so it stays
  // outside this vocabulary. Measured, not assumed: the closed ones survive a
  // decay at exactly the count they survive an intact build, which is the
  // shape of "the decay is not stranding these".
  //
  // **The lint has no matching rule, on purpose** (2026-08-13). A trapdoor is
  // the repo's general-purpose flat plate: a boat's oar and a junk's sail
  // batten (`props.ts`, `ships-wave6.ts`) are open trapdoors hinged to nothing
  // *by design*, and two intact archetypes hang shutters proud of the facade.
  // A world-level `unsupported.trapdoor` would redden all of them, so this
  // clause is read by the decay's sweep — which only ever runs inside a shell
  // the author asked to ruin — and the regression bar is
  // `test/decay-orphans.test.ts` over the whole catalog rather than a 28th
  // rule. Revisit if those placements are ever given real anchors.
  if (name.endsWith("_trapdoor")) return props?.["open"] === "true" ? "behind" : null;
  // A button and a lever are mounted on whichever face `face` names, and the
  // wall case is the one the crumble strands — 35 buttons and 16 levers over
  // the same sweep, a control panel's worth of switches left pressed into thin
  // air. `facing` on the wall case points away from the block, as everything
  // else `behind` does.
  if (name.endsWith("_button") || name === "lever") {
    const face = props?.["face"];
    if (face === "floor") return "below";
    if (face === "ceiling") return "above";
    return "behind";
  }
  // `sea_lantern` ends in "lantern" and is a full cube that needs nothing —
  // read as a hanging lamp it was 350 of the thirteen anchors' physics
  // findings (Stocktake unit 27, F14).
  if (name === "sea_lantern") return null;
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
 * Whether a fixture's anchor has to be a **full cube**, or merely *something*.
 *
 * Every other bracketed fixture in this vocabulary needs a solid face: a ladder
 * on a glass pane is not a thing vanilla will place. A **shutter is**. Window
 * shutters are hung on the pane's own cell all over the catalog — 464 of them
 * on intact buildings, and 197 that survive a decay with the pane still in
 * front of them — and holding a trapdoor to {@link canSupport}, which is "full
 * cube by name", would have made the sweep strip the shutters off every ruined
 * window whose glass outlived its wall. That is not the defect; the defect is a
 * shutter hinged to **air**.
 *
 * So the trapdoor gets the *lenient* anchor test — not air, not water, not a
 * vine — and everything else keeps the strict one. Split here rather than at
 * the call site so the lint can ask the same question the sweep does.
 */
export function anchorNeedsFullCube(name: string): boolean {
  return !name.endsWith("_trapdoor");
}

/**
 * Whether a block name is *something* rather than nothing — the lenient anchor
 * test {@link anchorNeedsFullCube} selects for. The complement of
 * {@link INSUBSTANTIAL}, named so callers read it as a question about support.
 */
export function substantial(name: string): boolean {
  return !INSUBSTANTIAL.test(name);
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
