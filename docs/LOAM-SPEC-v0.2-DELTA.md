# Loam v0.2 — Amendment Delta against v0.1

> **Status: DRAFT for Kai's ratification (2026-07-28).** This document is a
> *targeted amendment set*, not a rewrite. `docs/LOAM-SPEC-v0.1.md` stays
> byte-untouched; this file is the review artifact. Once ratified, a
> consolidation pass folds these amendments into a single v0.2 spec document.
>
> **Normative inputs, in precedence order:**
> 1. `docs/DESIGN.md` § "Post-G1 decisions" — the ratified decisions.
> 2. `docs/LOAM-TERRAIN-PROFILE-v0.md` — **fixed baseline**. Nothing here
>    renames or contradicts it; several amendments exist *because* v0.1 as
>    written cannot express it (A21–A24).
> 3. `docs/LOAM-SPEC-v0.1.md` — amended by this document.
>
> **How to read an amendment.** Each has a **Target** (the v0.1 section it
> changes), a **Change** (normative replacement or addition text), a
> **Rationale**, and a **Confidence** tag `[C:high|med|low]`. Amendments are
> independently ratifiable except where a dependency is stated.
>
> **How to ratify.** Read Part 0 (the three cross-cutting mechanisms A1/A3/A7
> that everything else leans on), then skim by part. The consolidated table is
> at the end. Anything you reject, strike by number; nothing here is entangled
> beyond its stated dependencies.

## Contents

- [Part 0 — Cross-cutting mechanisms](#part-0--cross-cutting-mechanisms) — A1–A3
- [Part I — Ratified §12 resolutions](#part-i--ratified-12-resolutions) — A4–A6
- [Part II — Coarse placement vocabulary](#part-ii--coarse-placement-vocabulary) — A7–A12
- [Part III — Terrain as field edits](#part-iii--terrain-as-field-edits) — A13–A16
- [Part IV — Spec kits](#part-iv--spec-kits) — A17–A20
- [Part V — Consequential sweep](#part-v--consequential-sweep) — A21–A27
- [Summary table](#summary-table)

---

# Part 0 — Cross-cutting mechanisms

Three amendments that later ones depend on: the internal structure of pass 3,
the stage-ordering rule, and the frame arithmetic. Ratify or reject these first.

---

## A1 — Pass 3 substages and the pass-3.5 corridor iteration (resolves Q6)

**Target:** §0.2 (pipeline table), §4.4 `along` (the "ordering hazard, resolved"
paragraph), §4.8 (constraint evaluation order), §7.5 `road.network@0`.
**Depends on:** nothing. **A7–A9 depend on this.**

### Change

Replace §0.2's single "3 | Layout solve" row with the following substage
table, and treat §4.8's phase table as naming these substages.

| Substage | Name | Reads | Writes |
|---|---|---|---|
| **3a** | **Terrain composition & products** | field nodes and their `field_edit` children (A3), `params` | master height field `H`, terrain products, published feature markers (A14) |
| **3b** | **Corridor construction** | `path` envelopes, `course` constraints (A8), `road.network@0.estimate()` | one **route corridor** polygon + coarse centerline per linear node |
| **3c** | **Domain construction** | `within`, `elevation`, `avoid`, `inside_shell`, `orientation`, `envelope.rotations`, coarse `mode:"contain"` (A10), `on` (A9) | per-node placement domain |
| **3d** | **Discrete placement** | `adjacent_to`, `along`, `beside`, `distance`, `not_overlapping`, `above`/`below`, `slope` | candidate placements |
| **3e** | **Relaxation** | all soft constraints incl. coarse `mode:"center"` | cost-minimal placements |
| **3.5** | **Corridor iteration** | corridors, placed geometry | re-routed centerlines, nudged placements |
| **3f** | **Post-placement fixups** | `terrain_conform`, envelope-level `clearance` | final `placement` records |

**Corridor contract (normative).** A *route corridor* is a polygon in the
horizontal plane plus a coarse centerline inside it. It is constructed once, at
3b, and **frozen**: substage 3.5 and pass 6 may move a centerline only *within*
its corridor and may never widen, shorten, or re-topologize it. `along` and
`beside` (A9) bind to the corridor, never to the centerline. This is the whole
content of the v0.1 §4.4 promise "buildings snap to the corridor; the road
wiggles within it", now stated as an invariant a validator can check.

**Substage 3.5, normative.** Repeat at most `maxCorridorIterations` (default
**2**) rounds. Round *k*:

1. **Re-route.** For each corridor in `nodePath` order, recompute the centerline
   inside the frozen corridor polygon using the *placed* occupancy from 3d/3e,
   with the pass-6 routing cost function (grade, occupancy, `prefer`).
2. **Re-evaluate.** For each node carrying `along`/`beside` against that
   corridor, in `layoutParams.order` then `nodePath` order, recompute lateral
   offset and `at`-position satisfaction.
3. **Nudge.** A node whose offset now falls outside its declared `offset` range
   is translated by the **minimal integer displacement along the corridor
   normal** that restores satisfaction, provided every one of its hard
   constraints still holds. Emit `LOAM-I409 NODE_NUDGED` with the displacement.
   If no such displacement exists, the node is marked *dirty* and re-enters 3c–3e
   with its corridor binding held fixed.
4. **Converge.** If nothing moved, stop. If `k = maxCorridorIterations` and
   violations remain, emit `LOAM-W408 CORRIDOR_ITERATION_CAP` and hand the
   residual violations to the relaxation ladder (§4.6) as normal.

Determinism: fixed iteration order at every step, a hard round cap, and no
dependence on parallel completion — so 3.5 satisfies §4.7 obligation 1 by
construction.

**§7.5 `road.network@0` addendum.** The generator MUST expose a
`corridors()` method usable at 3b, returning corridor polygons + coarse
centerlines from `anchors` and `pattern` alone (no placed geometry). Its pass-6
routing MUST be a refinement inside those polygons.

### Rationale

DESIGN.md ratified "build as specified, budget a corridor→place→re-route
iteration at G4". §12 Q6 flagged this as the single most likely thing to be
wrong in practice, precisely because it was under-specified. Freezing the
corridor and bounding the iteration turns an open-ended feedback loop into a
terminating, deterministic, testable one, and gives `along` a stable referent
across the loop. `[C:med]` — the mechanism is right; the default iteration
count is a guess to be tuned with G4 data.

---

## A2 — `ctx.math`, fixed-point bias, cross-arch CI (resolves Q9)

**Target:** §6.5 rule 6, §7.2 (`GenContext.math`), §7.4 (sandbox table), §7.7.
New subsection §6.8.

### Change

Add **§6.8 Deterministic math**, normative:

1. **Own implementations.** `ctx.math` MUST implement `sin`, `cos`, `tan`,
   `asin`, `acos`, `atan`, `atan2`, `exp`, `log`, `pow`, `cbrt`, `hypot` as
   explicit polynomial/rational approximations over f64. Delegating to the
   engine's `Math.*` for any of these is a spec violation, not an optimization
   choice.
2. **Permitted engine primitives.** `Math.sqrt`, `Math.abs`, `Math.floor`,
   `Math.ceil`, `Math.round`, `Math.trunc`, `Math.min`, `Math.max`,
   `Math.sign`, and f64 `+ - * /` are IEEE-754-exact in every conforming engine
   and MAY be used directly. `ctx.math.sqrt` is a thin alias of `Math.sqrt`.
3. **Test vectors are the definition.** Each `ctx.math` function ships a
   committed golden vector table (input bit pattern → output bit pattern,
   ≥4096 entries spanning the domain incl. subnormals, ±0, ±∞, NaN). A
   reimplementation is conforming iff it reproduces the table bit-for-bit. The
   spec does not state a ULP bound; **the table is the normative contract.**
4. **Integer / fixed-point bias.** Every stdlib generator MUST derive its final
   block-level decisions by **integer comparison**. f64 is permitted for
   intermediate shaping, but each generator MUST document the single point at
   which it quantizes (`Math.floor`, or `ctx.math.q16` for Q16.16 fixed point).
   Kernels defined in this delta (A13) are deliberately low-order polynomials so
   they are evaluable in fixed point without transcendentals.
5. **Noise.** The FastNoiseLite port is pinned by exact version, listed in
   `toolchain`, and covered by its own golden vector table.
6. **CI.** A determinism matrix job compares the BLAKE3 of the emitted golden
   world across at minimum `{arm64-darwin, x64-linux} × {Node LTS, Node
   current}`. Gate: **G2**.

Amend §7.4's "No engine-variant math" row to name the permitted primitives in
(2), so the lint does not fire on `Math.sqrt`/`Math.floor`.

### Rationale

DESIGN.md ratified own polynomials + integer/fixed-point bias + cross-arch CI.
The additions beyond that ratification are (a) the explicit permitted-primitive
list, without which the sandbox lint is unimplementable, and (b) golden vector
tables as the normative definition — a ULP bound is not a determinism
guarantee, and "byte-identical worlds" needs bit-identical math. Note: §12 Q9
said "CI at G1"; DESIGN.md says G2. **DESIGN.md wins** — G1 is already
accepted. `[C:high]`

---

## A3 — Implicit stage ordering; `stage` in generator metadata; no `after` (resolves Q11)

**Target:** §7.1 (`Generator<P>` interface), §7.5 (every catalog entry), §4
(explicit non-addition), §3.7 (`csg.precedence` semantics). New subsection §7.10.

### Change

**1. No ordering constraint exists.** `after` is **not** a constraint type in
v0.2 and MUST NOT be added. A document containing one gets
`LOAM-E104 UNKNOWN_CONSTRAINT_TYPE` (hard error, per §1.5's rule that anything
which can change geometry fails loud). This makes A4 a required edit, not a
cosmetic one.

**2. `stage` is generator metadata.** Extend the §7.1 interface:

```ts
export interface Generator<P> {
  readonly name: string;
  readonly version: number;
  readonly stage: Stage;              // NEW — required, not authorable
  readonly paramSchema: JSONSchema;
  // …unchanged…
}

type Stage =
  | "field" | "field_edit" | "climate" | "carve"
  | "water" | "structure" | "connective" | "decorate";
```

`stage` is declared by the generator, never by the node. An authored generator
that omits it is `LOAM-E245 STAGE_NOT_DECLARED`.

**3. Add §7.10 Execution order**, normative:

> Generator execution order is fully implicit. It is, in order of significance:
>
> 1. **Stage**, in the fixed total order
>    `field → field_edit → climate → carve → water → structure → connective → decorate`.
> 2. **Group**, where a stage defines one (only `field_edit` does: all `raise`
>    verbs, then all `carve` verbs — see A13).
> 3. **Document order** — pre-order DFS of the scene graph, siblings in
>    declaration order after `repeat`/`$proto` expansion.
>
> Stages `field` and `field_edit` execute at substage 3a (A1); `climate`
> through `connective` at pass 4/6; `decorate` at pass 7.

**4. `csg.precedence` no longer implies execution order.** Amend §3.7: precedence
governs *only* which write wins a block conflict at pass 5. Execution order is
`stage`. The two were conflated in v0.1 and Q11's recommendation; separating
them is required because the `field_edit` raise/carve grouping is orthogonal to
CSG precedence, and because a low-precedence carve (caves, `precedence: 5`) must
still execute *after* structures claim occupancy.

**5. Stage assignments for the v0 catalog** (§7.5):

| Generator | `stage` |
|---|---|
| `terrain.heightfield@0`, `terrain.density@0` | `field` |
| `terrain.edit@0` (A13) | `field_edit` |
| `terrain.climate@0` | `climate` |
| `cave.carver@0` | `carve` |
| `water.body@0` | `water` |
| `building.grammar@0`, `settlement.layout@0` | `structure` |
| `road.network@0` | `connective` |
| `scatter.forest@0`, `scatter.props@0` | `decorate` |

### Rationale

Ratified per §12 Q11's recommendation. The one place I went beyond it is point
4: Q11 proposed "implicit from `csg.precedence` plus a fixed pass sub-order",
but precedence is a *conflict* ordering, and using it for *execution* ordering
breaks as soon as a stage needs an internal grouping (which `field_edit` does on
day one). One axis per question. `[C:high]`

---

# Part I — Ratified §12 resolutions

---

## A4 — Delete the `after` constraint from Example A (exact edit)

**Target:** §10.1, the `climate` node, and the fourth bullet of the following
"Notes on what this demonstrates". **Depends on:** A3.

### Change

**Edit 1.** In `fjords.loam.json`, in the `climate` node, replace exactly:

```json
        },
        "constraints": [{ "type": "after", "target": "^.landform" }]
      },
```

with exactly:

```json
        }
      },
```

(i.e. delete the `constraints` member *and* the comma that terminated the
`params` object.)

**Edit 2.** Replace the fourth "Notes on what this demonstrates" bullet:

> - `after` is used as an ordering constraint between terrain generators. *(This
>   is a gap — see §12 Q11 …)*

with:

> - **No ordering constraint appears anywhere.** `terrain.heightfield@0`
>   (stage `field`) runs before `terrain.climate@0` (stage `climate`), which
>   runs before `cave.carver@0` (stage `carve`), entirely by the implicit stage
>   order of §7.10. Ordering is a property of the generator, not of the
>   document.

### Rationale

Ratified in DESIGN.md ("delete the stray `after` in Example A in v0.2"). With
A3 making `after` a hard `E104`, the v0.1 Example A no longer compiles, so this
edit is mandatory rather than tidy-up. `[C:high]`

---

## A5 — One-tick fluid-settling validator (resolves Q17)

**Target:** §0.2 (pass 8), §13.2 (new codes), new subsection §13.4.

### Change

Add **§13.4 Post-emit validators**, normative:

> **Fluid settling.** After pass 8 and before pass 9, the compiler simulates
> **exactly one** Minecraft fluid-spread tick over the emitted voxel field, for
> water and lava, using the vanilla flow rules for the pinned `mcVersion`. Any
> block whose state would change in that tick is an *unstable fluid block*.
>
> - ≥1 unstable fluid block → `LOAM-E450 FLUID_UNSTABLE`, compilation fails.
> - `--allow-unstable` downgrades it to `LOAM-W450 FLUID_UNSTABLE` (same name,
>   warning severity) and the compile completes.
> - The report lists the first 64 unstable positions with their owning
>   `nodePath`, so the repair loop can name the responsible node.
>
> The simulation is a pure function of the emitted field: one tick, no
> scheduling, no randomness, no wall-clock. Gate: **G2**.
>
> **Falling blocks.** `LOAM-W440 FALLING_BLOCK_UNSUPPORTED` (§10.1) is promoted
> from an aspiration to a required check in the same validator pass: any
> gravity-affected block with a non-solid block beneath it.

The terrain profile's `LOAM-T110` is the profile-scoped alias of `E450`, with
identical semantics (see A27).

### Rationale

Ratified in DESIGN.md. A world that renders correctly and floods on first tick
is the product failure Q17 named; the diagnostic code and the `--allow-unstable`
escape were the missing normative pieces, and the profile already depends on
them. `[C:high]`

---

## A6 — Envelope `size` arity is determined by `shape` (resolves Q14, **against** v0.1's lean)

**Target:** §3.3 (Common fields, `size`), §11 (`envelope.size`), §12 Q14.

### Change

Normative:

> `size` arity is a function of `shape`:
>
> | `shape` | `size` |
> |---|---|
> | `region`, `path` | `[x, z]` — a horizontal footprint. The vertical extent comes from `yMin`/`yMax`, `follows`, `bandBelow`/`bandAbove`. |
> | everything else | `[x, y, z]` |
>
> **Coercion, not rejection.** A `region`/`path` given three elements has its
> middle element **dropped** with `LOAM-W152 ENVELOPE_SIZE_COERCED`, whose
> message names the fields that actually control Y. A `box`-family shape given
> two elements is `LOAM-E153 ENVELOPE_SIZE_ARITY` with a fix-it message naming
> the missing axis. Neither case ever silently reinterprets a number.

**§12 Q14 resolution text:** *Resolved — shape-determined arity, 2D for
`region`/`path`. The "force 3D everywhere" alternative is rejected.*

### Rationale

I no longer agree with v0.1's lean toward forcing 3D, for two reasons that the
terrain profile made concrete.

1. **The profile writes `{"shape": "region", "size": [512, 512]}`,** and it is
   the normative baseline. Forcing 3D would invalidate every profile document
   for no expressive gain.
2. **Forcing 3D creates a silent lie.** An author writing
   `[512, 200, 512]` on a region reasonably expects `200` to bound Y — but a
   region's Y comes from `yMin`/`yMax`/`follows`, so the number is ignored.
   "Simpler, slightly wasteful" was optimistic: it is a number that looks
   load-bearing and is not, which is exactly the class of bug §1.1 rejected YAML
   over.

The regularity argument survives intact because arity is *derivable from
`shape`*, which the author already wrote, and because the failure mode is a
fix-it diagnostic rather than a schema error. `[C:high]`

---

# Part II — Coarse placement vocabulary

This is the largest part. A7 defines the arithmetic; A8–A9 define the syntax;
A10 defines solver behavior; A11 defines the mechanical migration from the
terrain profile's params form; A12 patches the selector grammar.

---

## A7 — Frames, zones, and fractional coordinates

**Target:** §4 (new subsection §4.9.1–§4.9.2). **Depends on:** A1.

### Change

Add **§4.9 Coarse placement**, beginning:

> ### 4.9.1 Frames
>
> A **frame** is the horizontal footprint of a resolved envelope: a min corner
> `(x0, z0)` and extents `(W, D)` in blocks. Every coarse placement constraint
> resolves against a frame, named by its `of` field (a selector, default `"^"`).
> Because parents are always placed before children (§4.7 obligation 2), `^` and
> `root` are always resolved when a child's coarse constraint is evaluated.
>
> **Axes.** `fx` runs west→east (+X); `fz` runs north→south (+Z). North is −Z,
> east is +X — identical to the terrain profile.
>
> **Fractional coordinates.** `[fx, fz] ∈ [0,1]²` maps to
> `(x0 + floor(fx·W), z0 + floor(fz·D))`. Multiplication and `floor` are
> IEEE-exact, so this is bit-reproducible across engines (A2). A component
> outside `[0,1]` is `LOAM-E166 COARSE_COORD_RANGE`.
>
> ### 4.9.2 The nine-grid
>
> A frame divides into a 3×3 grid of **zone cells**. Cell column *i* spans
> `[x0 + floor(i·W/3), x0 + floor((i+1)·W/3) − 1]` (integer division, so cells
> tile the frame exactly — no gaps, no overlap); rows likewise in Z.
>
> | token | (i, j) | | token | (i, j) |
> |---|---|---|---|---|
> | `northwest` | (0, 0) | | `north` | (1, 0) |
> | `northeast` | (2, 0) | | `west` | (0, 1) |
> | `center` | (1, 1) | | `east` | (2, 1) |
> | `southwest` | (0, 2) | | `south` | (1, 2) |
> | `southeast` | (2, 2) | | | |
>
> These nine tokens are the complete vocabulary — identical to the terrain
> profile's. Any other value is `LOAM-E162 UNKNOWN_ZONE`.
>
> A zone's **center point** is `(x0 + floor((lo+hi)/2), …)` of its cell.
>
> ### 4.9.3 Jitter
>
> A `zone` constraint's target point is the cell center displaced by
> `(jx·W, jz·D)`, where `jx = 2·u₀ − 1`, `jz = 2·u₁ − 1` scaled by `jitter`
> (default **0.10**, matching the profile's ±10%), clamped into the frame.
> `u₀, u₁` are the *2k*-th and *(2k+1)*-th `float()` draws of the node's
> **`coarse`** RNG stream, where *k* is the constraint's index in the node's
> `constraints` array. Fixed index ⇒ adding an unrelated constraint never moves
> an existing feature.
>
> Add `coarse` to §6.3's reserved stream names.

### Rationale

Everything in Part II reduces to this arithmetic, so it is stated once and
exactly. The integer-division cell boundaries and the indexed stream draws are
the two places where a reasonable implementer would otherwise diverge.
`[C:high]`

---

## A8 — New constraint types `zone`, `at`, `course`; shorthand type-key resolution

**Target:** §4.1 (shorthand desugaring), §4.4 (the constraint reference).
**Depends on:** A7.

### Change

**1. Shorthand type-key resolution (amends §4.1).** v0.1 said shorthand is "a
single type-key object". With `at` existing both as a new constraint type and as
a field of `along`, that is now ambiguous. Normative replacement:

> The type key of a shorthand constraint object is found by scanning the
> **constraint-type registry in registry order** and taking the first type whose
> name appears as a key. Registry order is the §4.4 declaration order, which
> begins:
> `within, adjacent_to, facing, along, distance, connected, align, orientation,
> clearance, terrain_conform, not_overlapping, elevation, slope, spread,
> cluster, inside_shell, above, below, centered_in, on_axis, visible_from,
> avoid, zone, at, course, on, beside`.
>
> So `{"along": "main_road", "at": 0.5}` resolves to `along` (registry order
> puts `along` first) and `{"at": [0.3, 0.7]}` resolves to `at`. A type name
> appearing as a *field* of a constraint that does not declare that field is
> `LOAM-W173 SHADOWED_TYPE_KEY`; two type keys where neither is a declared field
> of the other is `LOAM-E169 AMBIGUOUS_SHORTHAND` (write two constraints).

**2. Three new constraint types**, appended to §4.4:

---

#### `zone` — prim `zone` · def **soft** (weight 2.0)

Place the node's **anchor** in a nine-grid cell of a frame.

| Field | Type | Default | Meaning |
|---|---|---|---|
| `zone` | one of the nine tokens | — | §4.9.2 |
| `of` | selector | `"^"` | the frame |
| `mode` | `center` \| `contain` | `center` | see below |
| `jitter` | 0..1 | `0.10` | §4.9.3; `mode: "contain"` ignores it |
| `inset` | int | `0` | `contain` only |
| `partial` | 0..1 | `1.0` | `contain` only, as in `within` |

- **`mode: "center"`** (soft): a cost pulling the node's anchor toward the
  jittered zone point. **Zero cost anywhere inside the cell** (A10).
- **`mode: "contain"`** (**hard** by default): a domain restriction — the node's
  footprint lies inside the cell, inset by `inset`, `partial` of it at minimum.

---

#### `at` — prim `at` · def **soft** (weight 2.0)

Place the node's anchor at a coarse point. The primary argument is
**type-dispatched**:

| Value form | Meaning |
|---|---|
| `[fx, fz]` (array) | fractional point in the frame (§4.9.1) |
| `"selector#marker"` or `"@terrain:peak"` (string) | a **terrain anchor** (A9) |

| Field | Type | Default | Meaning |
|---|---|---|---|
| `at` | array or string | — | above |
| `of` | selector | `"^"` | frame, array form only |
| `mode` | `center` \| `contain` | `center` | as `zone` |
| `tolerance` | number | `0.05 × frameNorm` blocks | deadzone radius |
| `radius` | int | absent | `contain` only: restrict the domain to this disc |

---

#### `course` — prim `course` · def **hard**

Declare the node's **anchor course**: an ordered coarse polyline in a frame.
The node must be linear — a `path` or `region` envelope, or a `field_edit`
generator with a course verb (A13).

| Field | Type | Default | Meaning |
|---|---|---|---|
| `course` | array of 2..8 `[fx, fz]` | — | waypoints; outside 2..8 is `LOAM-E241 COURSE_WAYPOINTS` |
| `of` | selector | `"^"` | frame |
| `tolerance` | number | `0.08 × frameNorm` blocks | max deviation of the refined centerline from each waypoint |
| `width` | int | from `envelope.width` | corridor width |
| `descend` | bool | `false` (`true` for `river`) | refine under a monotone-descent constraint |

**Refinement (normative).** The compiler refines the waypoints into a smooth
centerline: **centripetal Catmull–Rom, α = 0.5**, with the first and last
waypoints duplicated as phantom control points, sampled at 1-block arclength and
rounded to integer columns with `floor`. The refined centerline MUST pass within
`tolerance` of every waypoint (relaxable at ladder step 2). With `descend`, the
refinement additionally enforces non-increasing surface height toward the last
waypoint. *The model gives intent; the compiler does geometry* — the terrain
profile's phrase, now normative for all courses.

**Course ⇒ corridor.** A `course` on a node registers that node's route corridor
at substage 3b (A1): the corridor polygon is the refined centerline buffered by
`max(width, 2 × tolerance)`, frozen thereafter. **This unifies coarse linear
placement with the Q6 corridor mechanism — a river, a ridge, and a main street
are the same object to the solver.**

---

**3. `beside` — pure sugar.** `{"beside": X, …rest}` desugars to
`{"along": X, "offset": [2, 8], "faceRoad": false, …rest}`. No new solver
primitive. If `X` is a terrain product (A9), the `along` target is that
product's polyline.

### Rationale

DESIGN.md ratified "compass zones over the parent envelope, coarse fractional
position hints, and terrain anchors". Naming the types `zone`/`at`/`course`
preserves *mechanical* migratability from the terrain profile's params (A11) —
the field names are literally the same, so the desugaring is a rename-free
lift. The type-key registry rule is the cost of that fidelity, and it is worth
paying: it is one deterministic sentence, and it makes the shorthand grammar
robust to every future type addition rather than only this one.

The `course ⇒ corridor` unification is the most consequential choice in this
part: it means the corridor machinery built for roads at G4 is the same
machinery that carries rivers and ridges at G2, and `along`/`beside` work
against terrain features for free. `[C:med]` on the sugar defaults, `[C:high]`
on the shapes.

---

## A9 — Terrain anchors: products, markers, and the `#` anchor namespace

**Target:** §4.2 (selectors), §4.4 (new type `on`), §7.3 (`markers`).
**Depends on:** A1 (3a), A7.

### Change

**1. Terrain products.** Extend §4.2's `@terrain:` list. Products are computed
at substage 3a from the composed field:

| Product | Kind | Definition |
|---|---|---|
| `coastline` | polyline set | 4-neighbour boundary between columns at/below the water surface and columns above it; traced per connected component, starting at the component's lexicographically smallest `(x, z)`, clockwise |
| `coast` / `shore` | region | within `beachWidth` of the waterline (unchanged from v0.1's `coast`) |
| `water` | region | below the water surface |
| `peak` | point set | published `peak` markers (A14), **plus** local maxima over a 16-block radius with prominence ≥ `peakProminence` (default 12) |
| `ridge` | polyline set | published `ridge`-verb crest markers, **plus**, only where none exist, a thinned single-axis-local-maximum skeleton `[C:low]` |
| `river` | polyline set | published `river`-verb courses, plus `water.body@0` river centerlines |
| `valley`, `flat`, `slope`, `cliff` | region | slope bands: `flat` ≤ 6°, `slope` 6–30°, `cliff` > `cliffThreshold`; `valley` = published valley courses buffered to their `width` |
| `cave_mouth` | point set | unchanged from v0.1 |

**Normative precedence: authored feature markers outrank derived products.**
Where a `terrain.edit@0` node published a marker, `@terrain:*` resolves to it;
derived detection exists only for regions with no authored macro terrain. This
is the syntactic consequence of DESIGN.md's "macro terrain is model-authored".

**2. The `#` anchor namespace (amends §4.2, §5.5).**

> `<selector>#<name>` addresses the node's **anchor namespace**: its declared
> **ports** ∪ its published **markers** (§7.3). Ports shadow markers of the same
> name, with `LOAM-W164 MARKER_SHADOWED_BY_PORT`. An unresolvable name is
> `LOAM-E163 UNKNOWN_ANCHOR`.
>
> Markers are typed `point` | `polyline` | `ring` | `region`. Where a constraint
> needs a point and gets a polyline, it uses the nearest point on that polyline
> to the referencing node's current anchor (evaluated at domain construction,
> re-evaluated during relaxation); a `ring` in a point context resolves to its
> centroid. `[C:med]`

Consequence: `{"facing": "the_divide#peak"}` and
`{"adjacent_to": "great_bay#mouth"}` need no new machinery — the existing
selector grammar reaches terrain features the moment they publish markers.

**3. New constraint type**, appended to §4.4:

---

#### `on` — prim `target` · def **hard**

The node's footprint sits on a terrain product or feature marker.

| Field | Type | Default | Meaning |
|---|---|---|---|
| `target` | `@terrain:<product>` or an anchor ref | — | above |
| `band` | int | `8` | blocks; widens a polyline or point product into an areal domain |
| `partial` | 0..1 | `0.5` | fraction of the footprint that must lie in the band |
| `side` | `left` \| `right` \| `any` | `any` | for polyline products, in the polyline's direction of travel |

`{"on": "@terrain:coastline"}`, `{"on": "@terrain:flat"}`,
`{"on": "volcano_kez#rim"}` are the idiomatic forms. `on` is a domain
restriction (substage 3c), demotable at ladder step 5.

### Rationale

DESIGN.md ratified `on: coastline`, `at: peak`, `beside: river` and the marker
vocabulary. Two design choices worth flagging:

- **`beside` is sugar over `along`, and `at`-with-a-string reuses the selector
  grammar.** Only `on` is a genuinely new solver primitive. Three sentences of
  DESIGN.md became one constraint type instead of three.
- **Markers share the `#` namespace with ports.** The alternative (a fourth
  sigil) buys collision-safety we do not need — terrain nodes have no ports —
  and costs every downstream consumer a second lookup path. The shadowing rule
  plus a warning covers the corner. `[C:med]`

---

## A10 — Solver semantics for coarse constraints

**Target:** §4.5 (hard/soft rule), §4.6 (relaxation ladder), §4.7 (solver
obligations), new §4.9.5. **Depends on:** A7, A8.

### Change

Add **§4.9.5 Solver semantics**, normative:

> **Anchors.** A coarse constraint constrains the node's **anchor**, defined as:
> the horizontal center of the node's footprint for placeable nodes; the kernel
> origin (point verbs) or centerline (course verbs) for `field_edit` generators,
> which the solver never translates (A15).
>
> **Soft cost, with a deadzone.** For `mode: "center"`:
>
> ```
> frameNorm = 0.5 · sqrt(W² + D²)          // sqrt is IEEE-exact (A2)
> d         = horizontal distance from the anchor to the nearest point of
>             the target region (the zone cell, or the tolerance disc for `at`)
> cost      = weight · (d / frameNorm)     // 0 inside the target region
> ```
>
> The **deadzone is essential**: a cost measured to the cell *center* would pull
> every zoned feature onto a 3×3 lattice and make every world look gridded.
> Intent is "somewhere in the north", not "at the north point".
>
> **Seeded initialization.** The jittered zone point (§4.9.3) is the node's
> *preferred initial anchor* at substage 3d. Packing and relaxation start there
> and may move it anywhere in the zero-cost region at no cost. This is what
> makes coarse placement read as authored rather than snapped.
>
> **Hard coarse constraints and the ladder.** `mode: "contain"` and `on` are
> domain restrictions applied at 3c alongside `within`. Unlike `within` and
> `not_overlapping`, they **are demotable** at ladder step 5, because the
> implicit `within: "^"` still bounds the domain after demotion — demoting them
> cannot make the domain unbounded. Demotion order is unchanged (lowest weight,
> then reverse declaration order, then `nodePath`).
>
> **Empty intersection.** If two or more hard coarse domains intersect to
> nothing (`{"zone": "north", "mode": "contain"}` + `{"zone": "south", "mode":
> "contain"}`), that is `LOAM-E165 COARSE_DOMAIN_EMPTY` at 3c, naming both
> constraints — distinct from `E170 CANNOT_FIT`, which means the domain is
> non-empty but too small.
>
> **Competing placement lint.** A node carrying a coarse `mode: "center"`
> constraint *and* `centered_in`/`on_axis` against the same frame gets
> `LOAM-W167 COMPETING_PLACEMENT`. Both are soft, so the world still compiles;
> the report lists both costs so the repair loop can see the tug-of-war.

Amend §4.5's summary rule to: *topological facts are hard, aesthetic
preferences are soft, and* **coarse intent is soft while coarse containment is
hard**.

Amend §4.7 with obligation 7: *the solver MUST record, per node, the resolved
frame, the target point/region, and the realized coarse cost, in `report.json`.*
Without it, "why is my volcano not in the center" is undebuggable.

### Rationale

The deadzone is the single most important decision in Part II and the easiest
one to get wrong by writing the obvious cost function. The demotability
carve-out is the second: `within` is undemotable because demoting it unbounds
the domain, and that reasoning simply does not transfer to a zone cell nested
inside a parent envelope. `[C:med]` on the exact cost normalization (it will
need tuning against real worlds); `[C:high]` on the deadzone and demotability
rules.

---

## A11 — Mechanical desugaring from the terrain profile's params form

**Target:** new §4.9.4; informative alignment with the terrain profile's
"Upgrade path". **Depends on:** A7–A10.

### Change

Add **§4.9.4 Profile params ⇄ constraint form**, normative:

> A terrain-profile document (`"profile": "terrain"`, A21) expresses coarse
> placement inside generator `params` because the profile has no layout solver.
> A v0.2 compiler MUST accept both forms and MUST rewrite params form into
> constraint form **before `specHash` is computed** (§6.6), so that equivalent
> documents hash identically and cache interchangeably.
>
> | Params form (in `params`) | Desugars to |
> |---|---|
> | `"at": [fx, fz]` | `{"at": [fx,fz], "of": "root", "strength": "soft"}` |
> | `"zone": "<token>"` | `{"zone": "<token>", "of": "root", "strength": "soft", "jitter": 0.10}` |
> | `"course": [[fx,fz], …]` | `{"course": [[fx,fz], …], "of": "root", "strength": "hard", "tolerance": 0.08}` |
> | `"area": {"zone": t}` | `{"zone": t, "of": "root", "mode": "contain", "strength": "hard"}` |
> | `"area": {"at": [fx,fz], "radius": r}` | `{"at": [fx,fz], "of": "root", "mode": "contain", "radius": r, "strength": "hard"}` |
> | `"area": {"all": true}` | *nothing* — equivalent to the implicit `within: "^"` |
> | `meta.spawn: {"zone"\|"at": …}` | not a constraint; resolved by the same §4.9.1–4.9.3 arithmetic against the root frame |
>
> **`of` is `"root"`, not `"^"`.** The profile defines all coarse coordinates as
> fractions of the **root region**, and profile edit nodes are children of the
> heightfield node. `"^"` would happen to work today (the heightfield's envelope
> is `"inherit"`) and would silently break the moment a document nests a smaller
> field node. `root` is defined by A12.
>
> **Both forms are permanently valid.** Params form is not deprecated; it is the
> terse authoring form for terrain documents, and the desugaring is lossless in
> both directions.
>
> **Duplicate placement.** A node carrying the same placement in both forms, or
> more than one of `at`/`zone`/`course` in params, is
> `LOAM-E168 DUPLICATE_PLACEMENT`.

### Rationale

The terrain profile explicitly promised "params-based placement here is designed
to be mechanically migratable" and predicted a `{"placement": {...}}` wrapper.
This delta does better than the prediction: because A8 kept the field names
identical, migration is a *move* between two objects with no renaming, and no
wrapper key is needed. The one substantive choice is `of: "root"` — a
deliberate correctness-over-convenience call, explained above. `[C:high]`

---

## A12 — Selector grammar additions

**Target:** §4.2.

### Change

Add to §4.2's table:

| Form | Meaning |
|---|---|
| `root` | the root node of the world document — the outermost frame |
| `parent` | exactly `^` (§3.2 reserves the word; §4.2 never defined it) |
| `<selector>#<marker>` | a published marker (A9), same namespace as ports |
| `@terrain:coastline`, `@terrain:peak` | new products (A9) |

`~` remains reserved and unassigned in v0.2.

### Rationale

§3.2 reserved `parent` and `root` as selector words but §4.2 never gave them
meaning — a latent gap that A11 turns into a real one. `[C:high]`

---

# Part III — Terrain as field edits

---

## A13 — `terrain.edit@0` enters the §7 stdlib catalog

**Target:** §7.5 (new catalog entry, inserted after `terrain.density@0`).
**Depends on:** A3 (stage), A7–A9 (placement).

### Change

Insert into §7.5:

---

#### `terrain.edit@0` · stage `field_edit`

A **field edit**: a kernel contributed to the master height field before any
block exists. Adopted from `docs/LOAM-TERRAIN-PROFILE-v0.md` unchanged, plus the
generalizations marked **[v0.2]**.

| Param | Type | Default | Meaning |
|---|---|---|---|
| `verb` | enum | required | table below; unknown is `LOAM-E244 UNKNOWN_TERRAIN_VERB` |
| `strength` | 0..1 | `1` | scales the kernel. **Not** the constraint field `strength` (hard/soft) — different namespace, noted because the collision is confusing |
| `at` / `zone` / `course` | — | — | exactly one; params form (A11) or the equivalent constraints **[v0.2]** |
| `blend` **[v0.2]** | `max` \| `add` (raise), `min` \| `sub` (carve) | `max` / `min` | within-group composition |

| `verb` | group | placement | params (defaults) |
|---|---|---|---|
| `ridge` | raise | course | `width` (48), `height` (50), `profile: "sharp"\|"rounded"` ("rounded") |
| `peak` | raise | at/zone | `radius` (56), `height` (70), `profile` ("sharp") |
| `volcano` | raise | at/zone | `radius` (64), `height` (80), `caldera` (true), `calderaDepth` (12), `lava` (true — lava lake strictly inside the caldera rim, settle-safe) |
| `plateau` | raise | at/zone | `radius` (64), `height` (25), `rim` (8 — falloff width) |
| `island` | raise | at/zone | `radius` (48), `height` (30) |
| `valley` | carve | course | `width` (40), `depth` (30) |
| `river` | carve | course | `width` (10), `depth` (6) — carves to a water surface **at `seaLevel`** in v0 |
| `basin` | carve | at/zone | `radius` (56), `depth` (20), `water` (false — fills to rim−1 only when the rim is fully closed, else `LOAM-W242 BASIN_RIM_OPEN` and no water) |

**Kernel shapes [v0.2].** Radial verbs contribute `h(d) = height · f(d/radius)`
for `d ≤ radius`, 0 beyond; course verbs contribute `h(d) = height · f(d/(width/2))`
where `d` is the distance to the refined centerline.

- `profile: "sharp"` → `f(t) = 1 − t` (a cone: pointed summit, straight flanks)
- `profile: "rounded"` → `f(t) = 1 − t²·(3 − 2t)` (smoothstep)

Both are low-order polynomials so they evaluate exactly in Q16.16 fixed point
(A2 rule 4). Volcano/basin `caldera`/`rim` subtract a second, smaller radial
kernel inside the first.

**Composition [v0.2].** Within the `raise` group, in document order,
`H ← max(H, H_base + strength·h)` by default; `blend: "add"` accumulates
instead. Within the `carve` group, each verb computes its target surface
`T = H_groupStart − strength·h` against the field state at the **start of the
carve group** and composes `H ← min(H, T)`; `blend: "sub"` subtracts instead.
Max/min composition is the default because two overlapping `peak` verbs should
read as a mountain range, not as one 140-block superpeak.

**Course refinement** is §4.9's Catmull–Rom refinement (A8); `river` sets
`descend: true`.

**Markers published:** see A14. **Ports:** none. **Emits:** no ops — a field
contribution plus markers. **`estimate()`** returns the ancestor field node's
frame; the node is never translated.

---

### Rationale

Verb table, defaults, groups, and the raise-then-carve rule are the profile's,
verbatim — that was the instruction and it is right. The three additions are
gaps the profile left open that an implementer must otherwise invent:
kernel shape (needed for determinism), within-group composition (the profile
specifies group order but not what two overlapping peaks do), and the
constraint-form placement alternative. `[C:high]` on adoption, `[C:med]` on the
composition defaults.

---

## A14 — Feature markers published by terrain edits

**Target:** §7.3 (`GenResult.markers`), §4.9. **Depends on:** A9, A13.

### Change

Type the `markers` field of §7.3:

```ts
type Marker =
  | { name: string; kind: "point";    at: [number, number, number] }
  | { name: string; kind: "polyline"; points: [number, number, number][] }
  | { name: string; kind: "ring";     points: [number, number, number][] }
  | { name: string; kind: "region";   mask: OccupancyMask };
```

Every `terrain.edit@0` node publishes, in its node-local frame:

| `verb` | markers |
|---|---|
| `peak`, `island` | `center` (point), `peak` (point, the summit column), `foot` (ring at the kernel base) |
| `volcano` | `center`, `peak`, `foot`, `rim` (ring, the caldera lip) |
| `plateau` | `center`, `peak` (the plateau top's centroid column), `foot`, `rim` (ring, the falloff start) |
| `basin` | `center` (the lowest column), `foot`, `rim` (ring, the basin lip) |
| `ridge` | `center` (polyline, the refined crest), `peak` (highest crest column), `head`/`mouth` (points, first/last waypoint ends), `side_a`/`side_b` (polylines offset by ±`width`/2) |
| `valley`, `river` | `center` (polyline, the refined thalweg), `head`/`mouth` (points; for `river`, `mouth` is the downhill end), `side_a`/`side_b` (banks at ±`width`/2) |

Markers are addressable as `<node-id>#<marker>` (A9), recorded in the compile
report, and resolved at substage 3a — so structural nodes placed at 3c–3e can
constrain against them in the same solve.

### Rationale

DESIGN.md: "terrain features are named nodes exposing anchors (peak, pass, foot,
side-a/side-b) so structures constrain against them and repair loops can address
them by name." The profile already publishes `center`/`peak`/`foot`/`mouth`/`head`;
this adds `rim` and `side_a`/`side_b` and fixes them per verb so a kit can teach
them as a closed table. `pass` from DESIGN.md is deliberately **omitted**: a
saddle between two independently-authored peaks is not a property of either
node, and inventing it now would need a cross-feature analysis pass. Deferred,
noted in A26. `[C:high]`

---

## A15 — Field targets: density interaction, nesting, and non-placement

**Target:** §3.1 (`children` by kind), §7.2 (`GenContext`), §7.5
(`terrain.density@0`). **Depends on:** A3, A13.

### Change

Normative:

**1. Field targets.** A generator with stage `field` owns a **field target**:
the master height field `H(x, z)` over its frame, plus (for `terrain.density@0`)
a density function. `ctx.field` is exposed to `field` and `field_edit`
generators only:

```ts
interface FieldEditor {
  readonly frame: Frame;              // A7
  raise(kernel: Kernel): void;        // composes per A13
  carve(kernel: Kernel): void;
  sample(x: number, z: number): number;  // H at the current composition point
}
```

**2. Attachment.** A `terrain.edit@0` node edits the field target of its
**nearest ancestor field node**. No such ancestor is `LOAM-E240
EDIT_WITHOUT_FIELD`. (The terrain profile's `LOAM-T004` is the profile-scoped,
stricter form: *direct* child only.)

**3. Field-edit children are not placed.** The solver does not translate,
rotate, or lay out a `field_edit` node. Its frame is its field ancestor's frame;
its `placement.translation` is that ancestor's. An `envelope` on such a node is
ignored with `LOAM-W243 ENVELOPE_IGNORED_ON_FIELD_EDIT`. Amend §3.1's "which
kinds may have `children`" table: a `generator` node's static children are laid
out inside its envelope **except** children whose generator's stage is
`field_edit`, which are consumed at 3a.

**4. Nested field nodes.** A `field`-stage node whose frame lies inside another
field node's frame composes into the outer field over its own footprint:

| `compose` | Effect over the inner footprint |
|---|---|
| `replace` (default) | outer `H` replaced by inner `H` |
| `add` / `max` / `min` | as named |

cross-faded linearly over `blend` blocks (default **16**) inward from the inner
footprint boundary. Edits attach to the *nearest* field ancestor, so an edit
inside the inner node shapes the inner field before composition — which is what
makes "a detailed island field nested in an ocean field" behave.

**5. `terrain.density@0` interaction.** Field edits are height-domain; a density
field is 3D. The height field is applied to the density evaluation as a
**vertical shift**:

```
density′(x, y, z) = density(x, y − H(x, z), z)
```

Consequence: every terrain verb behaves identically with or without overhangs,
and overhang structure rides the edited landform instead of fighting it. A
document may therefore add `terrain.density@0` to an existing terrain plan
without re-authoring a single edit. `[C:med]`

**6. Materialization happens exactly once**, at the end of the `field_edit`
stage, after all composition. Caves (`carve` stage) subtract from the
materialized voxels; they are not field edits.

### Rationale

Everything here is a gap the profile deliberately left open (it forbids nesting
and forbids `terrain.density@0`) and that v0.2 must answer to be more than a
profile. The vertical-shift rule for density is the one genuinely novel claim
and the one to scrutinize: it is exact for the common case (a landform raised
under an overhang stack) and approximate where an author wants overhang
*character* to change with elevation. `[C:med]`

---

## A16 — Normative rule: terrain features are field edits, never stamps

**Target:** §7 preamble, §13 (new lint).

### Change

Add to the §7 preamble, normative:

> **Terrain features MUST be field edits composed before materialization, never
> structures stamped afterward.** A macro landform — ridge, peak, volcano,
> plateau, island, valley, river, basin — is a contribution to the height field
> evaluated once with everything else, not a mesh, a primitive, or a voxel
> region written over finished ground.
>
> This is an architectural rule, not a style preference. Stamping breaks four
> things at once: the surface classifier can no longer see the true slope, biome
> assignment reads the pre-stamp field, `terrain_conform` and `heightAt()` lie to
> every structure placed nearby, and the seams between stamp and ground are
> permanent.
>
> **Enforced by lint.** `LOAM-W441 STAMPED_TERRAIN` fires when a node whose
> generator's stage is not `field`/`field_edit` writes over a footprint of more
> than **256 columns** with ≥ **60%** of its writes resolving to `ground.*` or
> `liquid.*` symbols. Thresholds are overridable per node via `validate`
> (§13.3), with the suppression recorded in the report as usual.

Also add: **macro terrain is model-authored.** Every landform above a size
threshold (default: radius or half-width ≥ 32 blocks) SHOULD exist as a named
`terrain.edit@0` node rather than as noise parameters, so it has an id, a seed,
markers, and a name the repair loop can address. A region that does not care may
opt out explicitly with a wilderness fill (a base field plus an
`"area": {"all": true}` scatter, per the profile).

### Rationale

DESIGN.md item 3, verbatim in intent. The contribution here is making it
*checkable*: an architectural rule that only lives in prose gets violated by the
first agent that finds it easier to write a big `prism`. `[C:high]` on the rule,
`[C:med]` on the lint thresholds.

---

# Part IV — Spec kits

New **§14**, in four amendments so they can be ratified separately.

---

## A17 — §14.1–14.4: roles, kit anatomy, budgets, and the build

**Target:** new §14.

### Change

> ## §14 Spec kits
>
> ### 14.1 What a kit is, and is not
>
> A **spec kit** is a compiled, versioned, role-scoped excerpt of this
> specification, delivered to an authoring agent as its system context. The
> division of labor is fixed:
>
> | Concern | Owned by |
> |---|---|
> | Syntactic validity | **Constrained decoding** against the role's schema subset (§1.1) |
> | Situational context (this node's envelope, ports, budget, siblings) | The **contract block** (§1.3) |
> | Role semantics — what the fields *mean* and which to reach for | The **kit** |
> | Everything else | `loam-doc` on demand (§14.5) — never the full spec |
>
> Kits are not RAG. Nothing about kit assembly is similarity-based; a kit is a
> deterministic build artifact.
>
> ### 14.2 Roles
>
> | Role | Writes | Kit sections |
> |---|---|---|
> | `terrain-node-author` | terrain plans, field edits, biome themes | core + §2.2/2.5, §3.3 envelopes, §4.9 coarse placement, §7.5 `terrain.*` + `scatter.forest@0`, the terrain profile |
> | `subdivider` | L2 subtrees under a contract | core + §1.3 modules/contracts, §3 in full, §4 tier-1 constraints, §5 ports, §3.8/3.9 repeat & prototypes |
> | `generator-author` | authored TS generators | core + §7.1–7.4, §7.7, §7.10, §8 op set, §6.3–6.5 + §6.8 determinism |
> | `asset-prompter` | `kind: "asset"` nodes | core + §9.1–9.7, §2.4 motifs, §9.3 prompt augmentation |
>
> The **common core**, in every kit: §0.3 cheat sheet, §3.1 field table, a
> one-paragraph §3.2 ids-are-load-bearing, §4.1 shorthand rule, §2.2 symbols +
> dot-fallback, a "never do this" list, and the `loam-doc` topic index.
>
> New roles are added by adding a kit source file; the role list is data, not
> spec text.
>
> ### 14.3 Budgets
>
> Budgets are stated in **bytes**, not tokens, because tokenizers differ per
> model and CI must be deterministic (≈4 bytes/token as a working conversion):
>
> | Part | Max |
> |---|---|
> | common core | 6 KiB |
> | role sections | 12 KiB |
> | worked examples | 8 KiB |
> | **total kit** | **24 KiB** |
>
> Over budget is a build failure, not a warning. The budget is the forcing
> function that keeps kits curated.
>
> ### 14.4 Kit sources and the build
>
> A kit source is `kits/<role>.kit.md` with front matter:
>
> ```yaml
> loam: "0.2"
> role: terrain-node-author
> sourceSections: ["§0.3", "§3.1", "§4.9", "§7.5/terrain.edit@0", …]
> sourceHash: "b3:9c41…"      # written by the build
> examples: ["examples/kits/terrain-basic.loam.json", …]
> topics: ["coarse-placement", "terrain-verbs", …]
> ```
>
> `loam kit build` resolves each `sourceSections` entry against the spec at the
> pinned version, concatenates the cited bodies, records their BLAKE3 as
> `sourceHash`, splices the role prose and examples, and checks the budgets.
>
> **CI checks (all blocking):**
>
> 1. Every `sourceSections` entry resolves → else `LOAM-E901 KIT_SECTION_MISSING`.
> 2. `sourceHash` matches the current spec → else `LOAM-E903 KIT_STALE`. **This
>    is what makes drift impossible: editing a cited spec section fails CI until
>    the kit is rebuilt and re-reviewed.**
> 3. Every example parses, validates against the schema, and compiles with zero
>    `E` diagnostics → else `LOAM-E900 KIT_EXAMPLE_INVALID`.
> 4. A *teaching-the-error* example may declare `expect: ["E170", …]`; its
>    diagnostic set must match exactly.
> 5. Byte budgets (§14.3).
> 6. Every topic a kit references exists in `topics.json` → else
>    `LOAM-W902 KIT_TOPIC_MISSING`.

### Rationale

DESIGN.md item 1, ratified. The two decisions worth a look: **byte budgets over
token budgets** (CI determinism, model-independence), and **`sourceHash` staleness
as a blocking check** — without it, "kits cannot drift" is an intention rather
than a property. `[C:med]` on the specific byte numbers, `[C:high]` on the
mechanism.

---

## A18 — §14.5: the `loam-doc` lookup tool

**Target:** new §14.5.

### Change

> ### 14.5 `loam-doc` — the only retrieval mechanism
>
> ```
> loam-doc <topic>              # a spec topic, verbatim
> loam-doc --code <CODE>        # a diagnostic's §13 row + mapped topic + fix hint
> loam-doc --list               # the full topic index
> ```
>
> **Deterministic resolution, in order:** exact topic-id match → unique
> case-insensitive prefix match → otherwise return the topic list. **Never
> fuzzy, never embedding-based, never ranked.** An ambiguous prefix returns the
> candidates, not a guess.
>
> Topics live in a build-generated `topics.json` (`topic id → section anchor`)
> with stable ids across MINOR versions. Output is capped at **8 KiB**; any
> section longer than that is split at build time into numbered subtopics
> (`coarse-placement.1`, `.2`), so runtime output is never truncated
> mid-sentence.
>
> The tool is registered in the implementer agent's tool list. Its calls are
> logged into the world manifest for session reproducibility — informative only;
> `loam-doc` never influences the compile, so it carries no determinism weight.

### Rationale

DESIGN.md: "RAG only as a small deterministic `loam-doc <topic>` lookup tool —
similarity-search context assembly is nondeterministic and stays out of the main
path." Build-time splitting rather than runtime truncation is the detail that
makes the cap safe. `[C:high]`

---

## A19 — §14.6–14.7: the diagnostic-driven retry protocol and the code→topic map

**Target:** new §14.6–14.7; §13.2 (every code gains a topic + fix hint column at
consolidation).

### Change

> ### 14.6 Diagnostic-driven retry
>
> Normative loop, per authoring task:
>
> 1. **Attempt 0** — constrained decode against the role's schema subset, with
>    the role kit and the contract block in context.
> 2. **Validate** — compile far enough to produce diagnostics. Order them
>    canonically: severity (`E` before `W`), then code ascending, then
>    `nodePath`.
> 3. **Repair prompt**, assembled deterministically from:
>    - the original contract block, verbatim;
>    - **only the offending node(s)**, verbatim, plus their parent's `id` and
>      `envelope` for context — never the whole document, never a sibling's body;
>    - the diagnostics, in canonical order, each with its one-line fix hint;
>    - for at most `maxExcerpts` (default **3**) distinct codes, most severe
>      first, the spec excerpt registered in the code→topic map (§14.7);
>    - an instruction to return only the corrected node(s).
> 4. **Retry budget** — `maxRepairs` default **2** per node. On exhaustion,
>    escalate: mark the node `optional: true` and let the ladder drop it
>    (`E405`), or return to the planner for re-subdivision. Every escalation is
>    recorded in the report.
> 5. **Determinism boundary.** The repair prompt is a pure function of
>    (document, diagnostics, kit id) — therefore cacheable, diffable, and
>    covered by golden tests in CI. The *model call* is not deterministic; the
>    **world** is deterministic given the final document. This is the same
>    boundary as the asset lockfile (§9.8), stated for authoring.
>
> ### 14.7 The code→topic map
>
> `diagnostics.json` maps every §13 code to: a one-line **fix hint** written in
> the imperative, the **topic** whose excerpt to attach, and optionally one
> minimal **worked example** of the correct form.
>
> ```json
> "E170": { "hint": "Shrink the child, or set flexible:true on the parent envelope.",
>           "topic": "envelope-fitting", "example": "examples/fix/E170.loam.json" }
> ```
>
> CI: a code in §13 with no entry is `LOAM-W904 CODE_WITHOUT_TOPIC`. This map is
> the load-bearing artifact of the whole retry protocol — a diagnostic without a
> fix hint and an excerpt makes a repair prompt that is just the error message
> again.

### Rationale

DESIGN.md: "Validation failures trigger diagnostic-driven retry (attach the §13
diagnostic + relevant spec excerpt to the repair prompt)." The additions are the
guardrails that keep repair cheap: node-scoped context, a hard excerpt cap, a
retry budget with a defined escalation, and the explicit statement of where
determinism stops. `[C:med]` on the numeric defaults.

---

## A20 — §14.8: kit versioning and provenance

**Target:** new §14.8; §1.2 (`meta.generatedBy`).

### Change

> ### 14.8 Versioning
>
> A kit id is `loam-kit/<role>@<loamVersion>-<buildHash8>`, e.g.
> `loam-kit/terrain-node-author@0.2-9c41ab7e`.
>
> - A spec MINOR bump rebuilds every kit; ids change; `sourceHash` checks (A17)
>   guarantee no kit survives a spec edit unreviewed.
> - A kit-only editorial change changes `buildHash` alone.
> - Agents pin an **exact** kit id. A kit whose `loam` front-matter version
>   differs from the compiler's is `LOAM-E901`-adjacent and refuses to load.
> - The kit ids that produced a document are recorded in
>   `meta.generatedBy.kits: string[]`, so a world can always report what taught
>   the agents that wrote it. (`meta.generatedBy` is already an open object in
>   §11, so this needs no schema change.)

### Rationale

Without provenance, a quality regression traced to a kit edit is unfalsifiable.
Recording kit ids in `meta` costs nothing and makes "which kit version wrote
this world" answerable from the artifact alone. `[C:high]`

---

# Part V — Consequential sweep

Amendments A21–A24 exist because **the terrain profile, as written, is not a
valid v0.1 document.** The profile is normative; v0.1 must yield.

---

## A21 — Document header: `profile` and `meta.spawn`

**Target:** §1.2 (header fields), §11 (root schema, `meta`).

### Change

Add two keys:

| Field | Type | Req | Notes |
|---|---|---|---|
| `profile` | string | no | Names a restricted **profile** of the language. v0.2 defines one: `"terrain"` (`docs/LOAM-TERRAIN-PROFILE-v0.md`). A profile narrows what is legal; it never adds syntax. Unknown profile → `LOAM-E101`. |
| `meta.spawn` | object | no | `{"zone": "<token>"}` or `{"at": [fx, fz]}`, resolved against the root frame (A7). Default: the `largest_flat` marker nearest the region center sitting ≥ 2 blocks above sea level. Resolution is deterministic. |

Both are additive, so §1.5's forward-compat rule already covers a 0.2 compiler
reading a `"loam": "0.1"` document that carries them. Profile documents SHOULD
declare `"loam": "0.2"` going forward; existing `0.1` profile documents remain
accepted.

### Rationale

v0.1's root schema is `additionalProperties: false`, so `"profile": "terrain"`
is `LOAM-E101` and `meta`'s closed property set rejects `spawn`. The normative
profile document uses both on line 3 and line 8. `[C:high]`

---

## A22 — `mix` palette value form

**Target:** §2.2 (value forms), §11 (`blockSpec`).

### Change

Add a fourth palette value form:

> 4. **Mix object** — `{"mix": [[blockId, weight], …]}`, equivalent to the array
>    of `{block, w}` objects it desugars to. Weights are numbers ≥ 0. Selection
>    is position-hashed exactly as in form 3.

`{"mix": [["minecraft:gravel", 2], ["minecraft:basalt", 1]]}`
≡ `[{"block": "minecraft:gravel", "w": 2}, {"block": "minecraft:basalt", "w": 1}]`.

### Rationale

The terrain profile's style block uses `mix` (its `ground.beach` example), which
matches no v0.1 `blockSpec` branch. It is also genuinely terser than the object
array for the common weighted-ground case, which is most of what a terrain
document writes. `[C:high]`

---

## A23 — Core symbol set additions

**Target:** §2.2 (core symbol table).

### Change

Add to the **Ground** row: `ground.underwater`, `ground.peak`.
Add to the **Nature** row: `foliage.snow_layer`.

Defaults in `std:default`: `ground.underwater` → `minecraft:gravel`,
`ground.peak` → `minecraft:stone`, `foliage.snow_layer` →
`minecraft:snow[layers=1]`.

### Rationale

Three symbols are referenced by normative text and resolve to nothing under
v0.1's dot-fallback (there is no bare `ground` symbol, so `ground.underwater`
falls all the way through to `LOAM-E210`): `ground.underwater` and `ground.peak`
are in the terrain profile's materials list, and `foliage.snow_layer` is named
by §7.5 `scatter.forest@0`'s `snowLine` param in v0.1 itself. `[C:high]`

---

## A24 — `region` envelope with neither `size` nor `footprint`

**Target:** §3.3 (shapes table).

### Change

> A `region` envelope declaring neither `size` nor `footprint` inherits the
> **parent's footprint**, exactly as `shape: "inherit"` would, retaining its own
> `follows`/`yMin`/`yMax`/`band*` vertical treatment.

### Rationale

The terrain profile's scatter node writes
`{"shape": "region", "follows": "terrain"}` with no size. v0.1's schema permits
it but the prose does not say what it means. This is the obvious reading and the
one the profile intends. `[C:high]`

---

## A25 — Consolidated §11 schema deltas

**Target:** §11.

### Change

At consolidation, the JSON Schema skeleton takes exactly these edits:

1. Root: add `"profile": {"type": "string"}`.
2. `meta`: add `"spawn"` (oneOf zone-object / at-object).
3. `blockSpec`: add the `mix` branch (A22).
4. `envelope.size`: keep `minItems: 2, maxItems: 3`; arity is enforced by the
   post-schema validator per A6 (a schema-level `if/then` on `shape` is possible
   but bloats constrained-decoding grammars for no diagnostic benefit).
5. `constraint.type` enum: add `"zone"`, `"at"`, `"course"`, `"on"`, `"beside"`.
6. `constraint` properties: add `"zone"` (enum of the nine tokens), `"of"`
   (selector), `"course"` (array of 2..8 `vec2` unit pairs), `"jitter"` (unit),
   `"band"` (integer), `"descend"` (boolean), `"radius"` (integer); widen `"at"`
   to `oneOf[number, range, [unit, unit], selector-string]`; widen `"mode"` —
   already `{"type": "string"}`, unchanged.
7. `generatorCall` / node `params`: unchanged (generator params validate against
   the registry in the second pass, where `terrain.edit@0`'s verb-dependent
   param schema lives).
8. `node`: no new keys. `stage` is generator metadata, never authorable (A3).

Note for consolidation: §11's own "known limits" list gains an item — the
`constraint` flat union is now carrying five more types and its unknown-field
diagnostics are correspondingly vaguer. The `oneOf`-discriminated-on-`type`
rewrite deferred in v0.1 should be scheduled at G4 rather than deferred again.

### Rationale

Collected in one place so the schema change is reviewable as a unit rather than
reconstructed from twelve amendments. `[C:high]`

---

## A26 — §12 status updates

**Target:** §12.

### Change

| Q | New status |
|---|---|
| **Q5** (constraint vocabulary too large) | **Amended.** Tier 1 (G4) gains the coarse types: `zone`, `at`, `course`, `on`. They are **required at G2**, ahead of everything else in tier 1, because the terrain profile depends on them. `beside` is sugar and needs no tier. Everything else unchanged. |
| **Q6** (route corridors) | **Resolved** — A1. |
| **Q9** (float determinism) | **Resolved** — A2 (CI gate G2, per DESIGN.md, not Q9's G1). |
| **Q11** (sibling generator ordering) | **Resolved** — A3, A4. |
| **Q14** (envelope size arity) | **Resolved** — A6, *against* v0.1's stated lean; rationale in A6. |
| **Q17** (fluid correctness) | **Resolved** — A5. |
| **Q13** (`decorate` in two places) | Unchanged, but now interacts with A3: biome-theme scatter and node `decorate` both run at stage `decorate`; document order within the stage settles precedence, which supersedes Q13's ad-hoc "biome first, node wins" rule. Fold at consolidation. |
| **Q3** (positional seeds / optional `uid`) | Still open; A14's markers make node ids even more load-bearing (a renamed terrain node breaks every anchor reference to it), which strengthens the case for optional `uid`. Flagged, not decided. |

**New open question, added to §12:**

> **Q21 — Cross-feature terrain anchors.** DESIGN.md's anchor list includes
> `pass` (the saddle between two peaks). A14 omits it, because a saddle is a
> property of a *pair* of features, not of either node, and computing it needs a
> cross-feature analysis at 3a with no obvious owner or naming scheme.
> **Recommendation:** leave it out of v0.2; revisit if G2/G3 worlds actually want
> to place things in passes. `[C:med]`

### Rationale

Housekeeping, plus one substantive change: Q5's tier list predates the coarse
vocabulary and would otherwise schedule G2's dependencies at G4. `[C:high]`

---

## A27 — New diagnostic codes; the `T` namespace

**Target:** §13.2.

### Change

Append to §13.2:

| Code | Name | Introduced by |
|---|---|---|
| `W152` | envelope size coerced (region/path given 3 elements) | A6 |
| `E153` | envelope size arity (box family given 2 elements) | A6 |
| `E162` | unknown zone token | A7 |
| `E163` | unknown anchor (no such port or marker) | A9 |
| `W164` | marker shadowed by a port of the same name | A9 |
| `E165` | coarse domains intersect to nothing | A10 |
| `E166` | coarse coordinate outside [0,1] | A7 |
| `W167` | competing placement (coarse + `centered_in`/`on_axis`) | A10 |
| `E168` | duplicate placement (params and constraint, or two of at/zone/course) | A11 |
| `E169` | ambiguous shorthand (two unrelated type keys) | A8 |
| `W173` | shadowed type key | A8 |
| `W408` | corridor iteration cap reached | A1 |
| `I409` | node nudged by corridor iteration | A1 |
| `E240` | terrain edit with no ancestor field node | A15 |
| `E241` | course waypoint count outside 2..8 | A8 |
| `W242` | basin rim open, water not filled | A13 |
| `W243` | envelope ignored on a field-edit node | A15 |
| `E244` | unknown terrain verb | A13 |
| `E245` | authored generator declares no `stage` | A3 |
| `W441` | stamped terrain (non-field node writing bulk ground) | A16 |
| `E450` / `W450` | fluid unstable after one settling tick (`W` under `--allow-unstable`) | A5 |
| `E900` | kit example invalid | A17 |
| `E901` | kit cites a section that does not exist | A17 |
| `W902` | kit references a topic missing from the index | A17 |
| `E903` | kit stale (cited spec sections changed) | A17 |
| `W904` | diagnostic code with no topic mapping | A19 |

**The `T` namespace.** `LOAM-T***` is reserved for **profile-scoped**
diagnostics. Every `T` code MUST either (a) report a profile *restriction* that
has no core-language equivalent, or (b) alias a core code with identical
semantics. Current mappings:

| Profile code | Status |
|---|---|
| `T001` `GENERATOR_NOT_IN_PROFILE` | profile restriction (a) |
| `T002`, `T003`, `T004` | profile restrictions (a); `T004` is the strict form of `E240` |
| `T105` | alias of `W242` |
| `T110` | alias of `E450` |

### Rationale

Codes are the interface between the compiler and the repair loop (A19), so they
are enumerated rather than left to the implementer. The `T` namespace rule stops
profile-scoped codes from quietly forking the core diagnostic vocabulary.
`[C:high]`

---

# Summary table

| # | Target §§ | Change |
|---|---|---|
| **A1** | §0.2, §4.4, §4.8, §7.5 | Pass 3 substages 3a–3f; frozen route corridors; bounded, deterministic pass-3.5 corridor→place→re-route→nudge iteration (Q6) |
| **A2** | §6.5, §7.2, §7.4, new §6.8 | `ctx.math` as own polynomials defined by golden vector tables; permitted IEEE-exact primitives; integer/fixed-point quantization rule; cross-arch determinism CI at G2 (Q9) |
| **A3** | §7.1, §3.7, new §7.10 | `stage` in generator metadata; fixed stage order; execution order fully implicit; `csg.precedence` demoted to conflict-only; `after` stays a hard `E104` (Q11) |
| **A4** | §10.1 | Exact edit deleting Example A's `after` constraint and rewriting its explanatory bullet (Q11) |
| **A5** | §0.2, new §13.4 | One-tick fluid-settling validator; `E450`/`W450`; `W440` promoted to a required check (Q17) |
| **A6** | §3.3, §11, §12 Q14 | Envelope `size` arity determined by `shape`; 2D kept for `region`/`path`; coercion + fix-it diagnostics; "force 3D" rejected (Q14) |
| **A7** | new §4.9.1–4.9.3 | Frames, fractional coordinates, the nine-grid with exact integer cell boundaries, indexed-draw jitter, `coarse` RNG stream |
| **A8** | §4.1, §4.4 | Constraint types `zone`, `at`, `course`; `beside` as sugar over `along`; shorthand type-key registry-order resolution; course⇒corridor unification |
| **A9** | §4.2, §4.4, §7.3 | Terrain products incl. `coastline`/`peak`; authored markers outrank derived products; `#` anchor namespace (ports ∪ markers); new `on` constraint |
| **A10** | §4.5–4.7, new §4.9.5 | Coarse solver semantics: anchors, deadzone cost, seeded initialization, hard-coarse demotability, `E165`, `W167`, report obligation |
| **A11** | new §4.9.4 | Lossless mechanical desugaring of the terrain profile's `zone`/`at`/`course`/`area` params into constraints, `of: "root"`, canonicalized before `specHash` |
| **A12** | §4.2 | Selector additions: `root`, `parent`, marker refs, new `@terrain:` products |
| **A13** | §7.5 | `terrain.edit@0` catalog entry: profile verb table verbatim + kernel shapes, within-group max/min composition, constraint-form placement |
| **A14** | §7.3, §4.9 | Typed markers; per-verb publication table (center/peak/foot/rim/mouth/head/side_a/side_b); resolved at 3a; `pass` deferred |
| **A15** | §3.1, §7.2, §7.5 | Field targets and `ctx.field`; edits attach to nearest field ancestor; field-edit children not solver-placed; nested field composition; `terrain.density@0` vertical-shift rule; materialize once |
| **A16** | §7 preamble, §13 | Normative: terrain features are field edits, never stamps; macro terrain is model-authored; enforced by `W441` |
| **A17** | new §14.1–14.4 | Spec kits: roles, common core, byte budgets, kit sources, `loam kit build`, blocking CI incl. `sourceHash` staleness |
| **A18** | new §14.5 | `loam-doc`: exact/prefix-only deterministic lookup, `topics.json`, build-time splitting, no similarity search |
| **A19** | new §14.6–14.7 | Diagnostic-driven retry: canonical diagnostic order, node-scoped repair prompts, 3-excerpt cap, 2-retry budget with escalation; the code→topic map |
| **A20** | new §14.8, §1.2 | Kit ids, rebuild rules, exact pinning, `meta.generatedBy.kits` provenance |
| **A21** | §1.2, §11 | Document `profile` key and `meta.spawn` — without these the terrain profile is not a valid document |
| **A22** | §2.2, §11 | `{"mix": [[block, weight], …]}` palette value form |
| **A23** | §2.2 | Core symbols `ground.underwater`, `ground.peak`, `foliage.snow_layer` |
| **A24** | §3.3 | `region` with no `size`/`footprint` inherits the parent footprint |
| **A25** | §11 | Consolidated schema deltas; schedule the discriminated-union rewrite at G4 |
| **A26** | §12 | Q5 retiered (coarse types required at G2); Q6/Q9/Q11/Q14/Q17 resolved; Q13 folded into stage order; new Q21 on cross-feature anchors |
| **A27** | §13.2 | 26 new diagnostic codes; `LOAM-T***` reserved as the profile namespace with an alias discipline |

---

*Delta authored 2026-07-28 against `docs/LOAM-SPEC-v0.1.md`,
`docs/LOAM-TERRAIN-PROFILE-v0.md` (normative baseline), and `docs/DESIGN.md`
§ "Post-G1 decisions". Review targets, in order of value: **A8/A10** (coarse
placement syntax and solver cost — the part most likely to need tuning),
**A15** (field composition and the density vertical-shift rule — the one novel
claim), **A1** (corridor freezing — the Q6 bet), and **A6** (the one place this
delta overrules a v0.1 recommendation).*
