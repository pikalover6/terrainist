# Loam v0.1 — Draft Syntax Specification

> **Status: DRAFT for human + Claude review (2026-07-27).** Nothing here is
> locked. This document specifies the *syntax and semantics* of Loam v0.1, the
> deterministic world-spec language described in `docs/DESIGN.md`. It is design
> work only — no compiler code exists yet.
>
> Confidence is marked inline as `[C:high]`, `[C:med]`, `[C:low]`. Anything
> `[C:low]` is a coin-flip I made to keep the spec complete and internally
> consistent; treat those as open questions (all are collected in §12).
>
> Design bias, stated once and applied everywhere: **this format is written by
> LLM agents under token budgets.** Where "elegant" and "regular + explicit +
> good defaults" conflict, this spec picks regular. Every field has a default;
> the shortest valid node is three keys.

---

> **Post-review status (2026-07-28):** §12 Q6/Q9/Q11/Q17 ratified as
> recommended. Three v0.2 directions decided after review — role-scoped spec
> kits, a coarse placement vocabulary, and terrain-features-as-field-edits
> with model-authored macro terrain — see "Post-G1 decisions" in
> `docs/DESIGN.md` before building on the affected sections (§4, §7).

## Table of contents

- [§0 Orientation](#0-orientation)
- [§1 Document format & framing](#1-document-format--framing)
- [§2 L3 — Style directives](#2-l3--style-directives)
- [§3 L2 — Scene graph node anatomy](#3-l2--scene-graph-node-anatomy)
- [§4 Constraint vocabulary](#4-constraint-vocabulary)
- [§5 Ports](#5-ports)
- [§6 Determinism & seeds](#6-determinism--seeds)
- [§7 L1 — Generator interface & stdlib catalog](#7-l1--generator-interface--stdlib-catalog)
- [§8 L0 — Voxel IR](#8-l0--voxel-ir)
- [§9 Asset nodes](#9-asset-nodes)
- [§10 Worked examples](#10-worked-examples)
- [§11 Appendix A — JSON Schema skeleton](#11-appendix-a--json-schema-skeleton)
- [§12 Open questions](#12-open-questions)
- [§13 Appendix B — diagnostic codes](#13-appendix-b--diagnostic-codes)

---

## §0 Orientation

### 0.1 The four layers, and who writes each

| Layer | Content | Primary author | Written per world |
|---|---|---|---|
| **L3** | style directives — palettes, era, mood, motifs, biome themes | Planner (Opus) | ~1 document |
| **L2** | scene graph — nodes, envelopes, constraints, ports | Planner + implementers (GLM) | tens–hundreds of modules |
| **L1** | generators — stdlib invocations (params only) or authored TS | Implementers | mostly zero-token (stdlib) |
| **L0** | voxel IR — CSG ops over palette symbols | Compiler (rarely hand-written) | machine-generated |

L2 is the layer that matters for token cost. Everything in this spec is tuned
so that a competent implementer agent can emit a correct L2 subtree in a few
hundred tokens.

### 0.2 Where each field is consumed

The pipeline in `DESIGN.md` is nine passes. This table is the contract between
syntax and pipeline; every field in this spec appears in exactly one "first
consumed" row.

| Pass | Name | Reads | Writes |
|---|---|---|---|
| 1 | Parse + validate | whole document, `loam`, `requires` | AST, diagnostics |
| 2 | Style inherit | `style`, `styleOverride`, `seal` | resolved style per node |
| 3 | Layout solve | `envelope`, `constraints`, `layout`, generator `estimate()` | `placement` per node (translation + yaw) |
| 4 | Generator expansion | `generator`, `params`, resolved style, seed | L0 ops, child nodes, resolved ports |
| 5 | CSG merge | L0 ops, `csg.precedence` | voxel field |
| 6 | Connective pass | `connected` constraints, resolved ports | roads/tunnels/bridges as L0 ops |
| 7 | Decorate | `decorate` blocks, occupancy | L0 ops |
| 8 | Light + heightmaps | voxel field | chunk metadata |
| 9 | Anvil emit | voxel field, `meta` | world `.zip` |

An important consequence, spelled out because agents get it wrong: **`connected`
does not place anything.** It contributes a soft proximity term in pass 3 and is
*realized* in pass 6, once both endpoints are concrete geometry. You cannot
route a tunnel to a building that does not exist yet.

### 0.3 Cheat sheet — the terse forms an agent should reach for

```json
{ "id": "watchtower", "kind": "generator", "generator": "building.grammar@0",
  "envelope": { "size": [9, 24, 9] },
  "constraints": [{ "within": "^" }, { "along": "main_road", "offset": 4 }],
  "ports": { "door": { "type": "door", "face": "auto" } } }
```

Defaults that make this work: `envelope.shape` defaults to `box`;
`envelope.anchor` defaults to `terrain`; constraints default to `hard` unless
§4's table says otherwise; `^` means "parent"; a `door` port defaults to width
1, height 2, sill at the node's floor.

---

## §1 Document format & framing

### 1.1 Serialization: JSON is canonical; JSON5 is accepted on input `[C:high]`

**Recommendation: canonical Loam is UTF-8 JSON (RFC 8259). Authoring tools MAY
accept JSON5. YAML is not part of the pipeline.**

The reasoning, in priority order:

1. **Constrained decoding.** Loam is emitted by LLMs. JSON Schema → grammar
   constrained sampling (or provider structured-output / tool-call modes) makes
   a syntax error *impossible*, not merely unlikely. There is no equivalent for
   YAML at any provider. For a system whose per-world cost is dominated by
   retries, this single argument outweighs everything else.
2. **Mechanical reassembly.** Specs are assembled from many independently
   authored subtrees (`DESIGN.md`: "reassembly is mechanical"). Splicing JSON
   values is a tree operation. Splicing YAML is a *text-indentation* operation,
   and every module boundary becomes a place where a 40-deep tree can be
   re-indented wrong.
3. **Determinism.** Subtree caching is keyed on spec-hash. JSON has a well-known
   canonicalization (JCS, RFC 8785); YAML's round-trip identity is a research
   project. See §6.6.
4. **No type ambiguity.** YAML 1.1's `no`→`false`, `26.2`→float, `NO_ROOF`
   coercions and the Norway problem are exactly the class of bug that produces a
   world that compiles and is silently wrong. Block state strings like
   `on=true`, era tokens like `no`, and version strings like `1.20` are all
   real hazards.
5. **Token cost is close to a wash.** YAML saves braces; JSON saves nothing but
   is denser per key once keys are short. Measured on the §10 examples, YAML is
   ~8–12% cheaper — not enough to buy the above.

The one thing YAML has that JSON lacks is **comments**, and LLM-authored specs
benefit from rationale-carrying comments. Loam solves this in-band instead:

- Every object may carry a `"note"` string (ignored by the compiler, preserved
  through canonicalization, surfaced in diagnostics and render critiques).
- `label` on nodes is prose for humans, critics, and asset prompts.

**JSON5 tolerance layer.** The reference parser accepts JSON5 (comments,
trailing commas, unquoted identifier keys, single quotes) when the file
extension is `.loam.json5` or the parser is invoked with `--tolerant`. It
immediately normalizes to canonical JSON. JSON5 is a *convenience for humans and
for hand-repair*; agents emit strict JSON. `[C:high]`

**File extensions.** `*.loam.json` (canonical), `*.loam.json5` (tolerant),
`*.loam.bundle.json` (single-file bundle, §1.3).

### 1.2 Document kinds

Every Loam file is a *document* with a required header. There are four kinds:

| `kind` | Purpose | Root payload |
|---|---|---|
| `world` | The compilation unit. Exactly one per world. | `style`, `root`, `meta` |
| `module` | An independently authored subtree, referenced by a parent. | `contract`, `node` |
| `style` | A reusable style pack (base styles, era packs). | `style` |
| `bundle` | All of the above inlined into one file for shipping/caching. | `documents` |

A `world` document:

```json
{
  "loam": "0.1",
  "kind": "world",
  "meta": {
    "name": "Misty Fjords",
    "prompt": "misty fjords with a black-sand coast",
    "worldSeed": "0x5f3a19c2",
    "mcVersion": "26.2",
    "generatedBy": { "planner": "claude-opus-5", "implementer": "glm-5.2" }
  },
  "requires": { "loamFeatures": [], "stdlib": "0.1", "generators": [] },
  "style": { "...": "see §2" },
  "root": { "...": "an L2 node, see §3" }
}
```

Header fields:

| Field | Type | Req | Notes |
|---|---|---|---|
| `loam` | `"MAJOR.MINOR"` | yes | Spec version. Must be first key by convention. |
| `kind` | enum | yes | `world` \| `module` \| `style` \| `bundle` |
| `meta` | object | world only | Provenance; see below |
| `requires` | object | no | Capability gate, §1.5 |
| `imports` | object | no | Named module/style references, §1.3 |

`meta` fields: `name`, `prompt` (the user's original text — kept for the render
critic and for asset prompt context), `worldSeed` (string; hex `0x…`, decimal,
or arbitrary UTF-8 which is hashed to 64 bits — see §6.1), `mcVersion`,
`generatedBy`, `createdAtIso` (**informational only; never read by the
compiler** — determinism forbids wall-clock input), `toolchain` (filled in by
the compiler on emit: compiler version, stdlib version, asset-lock hash).

### 1.3 Multi-file modules

Specs are assembled from many independently authored subtrees. Loam makes the
*subdivision contract* from `DESIGN.md` a first-class, checkable artifact.

A parent references a child module in its `children` array:

```json
{ "$module": "modules/old_town.loam.json", "as": "old_town",
  "contract": {
    "envelope": { "shape": "box", "size": [320, 96, 320], "flexible": true },
    "ports": { "north_gate": { "type": "road_stub", "face": "north" } },
    "styleRef": "world",
    "tags": ["settlement"],
    "tokenBudget": 8000
  } }
```

The module file:

```json
{
  "loam": "0.1",
  "kind": "module",
  "contract": {
    "envelope": { "shape": "box", "size": [320, 96, 320], "flexible": true },
    "ports": { "north_gate": { "type": "road_stub", "face": "north" } },
    "styleRef": "world",
    "tags": ["settlement"],
    "tokenBudget": 8000
  },
  "node": { "id": "old_town", "kind": "composite", "...": "..." }
}
```

Rules `[C:high]`:

1. The `contract` block appears **twice** — declared by the parent, echoed by
   the child. The loader compares them after canonicalization. Mismatch is
   `LOAM-E120 CONTRACT_MISMATCH`, a hard error. This is what makes reassembly
   mechanical: a subtree either honors the interface it was handed or it fails
   loudly at link time, not at render time.
2. The child's `node.id` MUST equal the reference's `as` (or the reference's
   `as` is omitted and the child's id is used). Ids determine `nodePath`, which
   determines seeds (§6) — so ids are load-bearing, not cosmetic.
3. Module paths are **relative to the referencing document**, POSIX-separated,
   confined to the spec root (no `..` escaping the root, no absolute paths, no
   URLs in v0.1). `[C:high]`
4. A module may itself reference further modules. The reference graph must be a
   **tree**, not a DAG: a module may be referenced once. (Reuse is expressed
   with `prototypes`, §3.9, not with shared module references — sharing would
   make `nodePath` ambiguous and break seed derivation.) `[C:med]`
5. `imports` at document level gives short aliases for repeated paths:
   `"imports": { "civic": "modules/civic/", "era": "styles/ancient.loam.json" }`
   then `{ "$module": "civic:town_hall.loam.json" }`.

**Bundles.** For caching, transport, and the final artifact, a whole spec
flattens to one document:

```json
{ "loam": "0.1", "kind": "bundle",
  "entry": "world.loam.json",
  "documents": { "world.loam.json": { "...": "..." },
                 "modules/old_town.loam.json": { "...": "..." } } }
```

Bundling is a pure, reversible transform. `loam bundle` and `loam unbundle`
round-trip byte-identically after canonicalization. The compiler's real input is
always a bundle; the multi-file form is an authoring convenience. `[C:high]`

**Why not inline everything?** Because agents work in parallel with private
token budgets and no shared file lock. One file per agent means no merge
conflicts and no whole-document rewrites. `[C:high]`

### 1.4 Anatomy of a reference

Four reference sigils appear in values; they never collide because each has a
distinct prefix `[C:med]`:

| Form | Meaning | Valid in |
|---|---|---|
| `{"$module": "path"}` | splice a module document here | `children` |
| `{"$proto": "name", "with": {…}}` | instantiate a prototype (§3.9) | `children` |
| `"node.path"` | a node selector (§4.2) | constraint targets |
| `"node.path#port"` | a port reference (§5.5) | constraint targets |
| `"@symbol"` | a palette symbol (§8.3) | L0 ops, generator params |
| `"$style.tokens.key"` | read a style token (§2.7) | generator params |

### 1.5 Versioning & forward compatibility

`loam` is `MAJOR.MINOR`. Within a MAJOR, MINOR bumps are additive only:
new optional fields, new constraint types, new generators, new ops. A compiler
supporting `0.N` MUST accept `0.M` for `M <= N`, and MUST reject `0.M` for
`M > N` unless every unknown construct in the document is ignorable by the rule
below.

**The forward-compat rule, stated as one sentence:** *anything that can change
geometry fails loud when unknown; anything advisory is dropped with a warning.*

| Unknown thing | Behavior |
|---|---|
| Unknown top-level document key | error `LOAM-E101` |
| Unknown node key | error `LOAM-E102` |
| Unknown `kind` | error `LOAM-E103` |
| Unknown constraint type | error `LOAM-E104` — a silently dropped constraint produces a plausible, wrong world |
| Unknown port `type` | error `LOAM-E105` |
| Unknown L0 `op` | error `LOAM-E106` |
| Unknown generator name/version | error `LOAM-E107` |
| Unknown key inside `hints` | warn `LOAM-W110`, ignore |
| Unknown key inside `style.tokens` | ignore silently (open bag by design) |
| Unknown key inside a generator's `params` | error by default; warn if generator declares `"openParams": true` |
| Any key prefixed `x-` anywhere | ignore silently, preserve through canonicalization |
| `note`, `label` | never interpreted |

`requires` lets a document assert what it needs so failures happen at pass 1
with a good message rather than deep in pass 4:

```json
"requires": {
  "loamFeatures": ["shell-interior-envelope", "voxel-mask-envelope"],
  "stdlib": ">=0.1",
  "generators": ["building.grammar@0", "road.network@0"],
  "assets": true
}
```

If `assets: true` and the asset pipeline is unavailable (pre-G6), the compiler
uses each asset node's `fallback` (§9.7) and emits `LOAM-W301`, rather than
failing. `[C:high]`

**Deprecation.** A MINOR may deprecate a field; deprecated fields keep working
for the remainder of the MAJOR and emit `LOAM-W1xx`. Removal requires a MAJOR.
v0.x is explicitly pre-stability: **v0.1 → v0.2 may break anything**, and the
repo will carry a migration note instead of a compatibility shim until v1.0.
`[C:high]`

---

## §2 L3 — Style directives

Style is the world-level inherited context that keeps hundreds of independently
generated subtrees coherent. It answers: *what blocks does "wall" mean here, and
what does this place feel like?*

A style block appears in three places: the `world` document's `style` key
(the root style), a `style` document (a reusable pack), and any node's `style`
key (an override patch, §2.8).

### 2.1 Full shape

```json
"style": {
  "id": "ancient_cat_city",
  "extends": ["std:medieval_stone", "styles/cats.loam.json"],
  "era": "ancient",
  "mood": ["reverent", "ruined", "misty"],
  "palettes": { "...": "§2.2" },
  "motifs": { "...": "§2.4" },
  "biomeThemes": { "...": "§2.5" },
  "lighting": { "...": "§2.6" },
  "decay": { "level": 0.4, "modes": ["moss", "rubble", "missing_blocks"] },
  "scale": { "unit": 1.0, "floorHeight": 5, "doorWidth": 2 },
  "tokens": { "...": "§2.7" },
  "seal": ["palettes.wall"],
  "note": "free text, ignored"
}
```

Every field is optional. A world with no `style` block gets `std:default`.

### 2.2 Palettes — symbolic names over namespaced ids `[C:high]`

**Rule: L2 and L1 never name a Minecraft block. They name a symbol; style maps
symbols to blocks.** This is what makes one scene graph re-skinnable from
"ancient sandstone" to "frozen basalt" by editing one block, and it's what lets
a subtree authored by an agent that never saw the world's palette still look
right.

```json
"palettes": {
  "wall": "minecraft:deepslate_bricks",
  "wall.accent": ["minecraft:cracked_deepslate_bricks", "minecraft:deepslate_tiles"],
  "floor": [
    { "block": "minecraft:polished_deepslate", "w": 7 },
    { "block": "minecraft:deepslate_tiles",    "w": 2 },
    { "block": "minecraft:cracked_deepslate_tiles", "w": 1 }
  ],
  "stairs": { "block": "minecraft:deepslate_brick_stairs", "shape": "stairs" },
  "slab":   { "block": "minecraft:deepslate_brick_slab",   "shape": "slab" },
  "glass":  "minecraft:brown_stained_glass_pane",
  "light":  { "block": "minecraft:lantern", "state": { "hanging": "true" } }
}
```

**Value forms**, in order of terseness — all three are valid for any symbol:

1. **String** — a block id, optionally with inline state:
   `"minecraft:oak_stairs[facing=north,half=bottom,waterlogged=false]"`.
   The `[k=v,…]` suffix is parsed by Loam, not passed through.
2. **Array** — uniform-weight variants. `["a","b"]` ≡ each weight 1.
3. **Object** — `{ block, state?, w?, shape?, when? }`, or an array of those.

Object fields:

| Field | Type | Notes |
|---|---|---|
| `block` | string | namespaced id, required |
| `state` | object | blockstate properties as strings; merged over inline `[…]` |
| `w` | number ≥0 | selection weight, default 1 |
| `shape` | enum | declares this entry's *form class*: `full` (default), `stairs`, `slab`, `fence`, `wall`, `pane`, `door`, `trapdoor`, `carpet`, `plant`, `fluid`. Lets generators ask for "the stairs form of `@wall`" — see §2.3 |
| `when` | object | conditional selection, §2.9 |

**Weighted selection is position-hashed, not sequential.** The variant for a
block at world `(x,y,z)` is chosen by `hash(nodeSeed, "palette", symbol, x, y, z)`
(§6.3), never by draw order. This is essential: it makes palette texture
independent of op order, chunk order, and parallel expansion order. `[C:high]`

**Symbol naming.** Dot-separated lowercase path segments,
`[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*`. Dots imply *fallback*, not nesting:
resolving `wall.accent.ruined` tries `wall.accent.ruined`, then `wall.accent`,
then `wall`. An agent can reference specific symbols without the style having
declared them and still get something sane. Unresolvable after full fallback is
`LOAM-E210 UNKNOWN_SYMBOL`. `[C:high]` — this fallback rule is the single
highest-leverage LLM-friendliness feature in the spec.

**Core symbol set.** `std:default` defines these; every style inherits them, so
every symbol always resolves. Generators may rely on their existence.

| Group | Symbols |
|---|---|
| Structure | `wall`, `wall.accent`, `wall.base`, `pillar`, `beam`, `floor`, `ceiling`, `roof`, `roof.ridge`, `trim`, `foundation` |
| Forms | `stairs`, `slab`, `fence`, `wall_block`, `pane`, `door`, `trapdoor` |
| Openings | `glass`, `window_frame`, `bars` |
| Light | `light`, `light.wall`, `light.ceiling`, `light.ambient` |
| Ground | `ground.surface`, `ground.subsurface`, `ground.deep`, `ground.beach`, `ground.cliff`, `ground.path` |
| Nature | `foliage.log`, `foliage.leaves`, `foliage.sapling`, `foliage.grass`, `foliage.flower`, `foliage.vine`, `foliage.crop` |
| Liquid | `liquid.water`, `liquid.lava`, `liquid.surface_ice` |
| Infra | `path.surface`, `path.edge`, `road.surface`, `road.edge`, `road.marking`, `bridge.deck`, `bridge.rail`, `tunnel.wall`, `tunnel.floor`, `tunnel.support` |
| Decor | `decor.rubble`, `decor.moss`, `decor.banner`, `decor.pot`, `decor.crate` |
| Meta | `air` (always `minecraft:air`), `void` (carve marker, §8.4) |

`air` and `void` are reserved and MUST NOT be redefined (`LOAM-E211`).

### 2.3 Form families

Real builds need the stairs/slab/fence relatives of a material. Declaring each
separately is token-expensive and error-prone, so a style may declare a
**family** and let Loam derive forms:

```json
"families": {
  "deepslate_brick": {
    "full": "minecraft:deepslate_bricks",
    "stairs": "minecraft:deepslate_brick_stairs",
    "slab": "minecraft:deepslate_brick_slab",
    "wall": "minecraft:deepslate_brick_wall"
  }
},
"palettes": { "wall": { "family": "deepslate_brick" } }
```

A symbol bound to a family resolves to the family's `full` form by default;
`@wall:stairs` resolves to the family's `stairs` form. If the family lacks the
requested form, Loam falls back to `full` and warns `LOAM-W212`. The `:form`
suffix is the only punctuation-in-symbol-reference in the language. `[C:med]`

A `std:families` table ships with the stdlib covering all vanilla families, so
a style usually writes `{"family": "deepslate_brick"}` and gets four blocks.

### 2.4 Era, mood, motifs

These are the "coherence" fields. They are consumed by (a) stdlib generators
that branch on them, (b) asset prompt construction, (c) the decorate pass, and
(d) the render critic's rubric.

```json
"era": "ancient",
"mood": ["reverent", "ruined", "misty"],
"motifs": {
  "architecture": ["pointed_arch", "buttress", "cat_effigy", "stepped_gable"],
  "roofType": "steep_gable",
  "windowRhythm": "tall_narrow_paired",
  "ornamentDensity": 0.6,
  "symmetry": "bilateral",
  "massing": "vertical",
  "footprintStyle": "irregular_organic",
  "settlementPattern": "organic_radial"
}
```

| Field | Type | Vocabulary |
|---|---|---|
| `era` | string | **Open vocabulary**, suggested: `primitive`, `ancient`, `classical`, `medieval`, `renaissance`, `industrial`, `victorian`, `modern`, `brutalist`, `futuristic`, `post_apocalyptic`, `fantasy_high`, `fantasy_dark` |
| `mood` | string[] | open; suggested: `cozy`, `grand`, `reverent`, `menacing`, `ruined`, `pristine`, `bustling`, `abandoned`, `misty`, `sunbaked`, `frozen`, `verdant`, `arid` |
| `motifs.architecture` | string[] | open; free-form motif tags, passed to asset prompts and to `building.grammar` |
| `motifs.roofType` | enum | `flat`, `shed`, `gable`, `steep_gable`, `hip`, `mansard`, `dome`, `spire`, `vault`, `thatch_cone` |
| `motifs.windowRhythm` | enum | `none`, `sparse`, `regular`, `dense`, `tall_narrow`, `tall_narrow_paired`, `banded`, `arcade` |
| `motifs.ornamentDensity` | 0..1 | scalar knob into decorate + facade rules |
| `motifs.symmetry` | enum | `none`, `bilateral`, `radial`, `strict_grid` |
| `motifs.massing` | enum | `low`, `balanced`, `vertical`, `sprawling`, `stacked` |
| `motifs.footprintStyle` | enum | `rectilinear`, `irregular_organic`, `radial`, `courtyard`, `cross` |
| `motifs.settlementPattern` | enum | `grid`, `organic_radial`, `linear_road`, `cluster`, `terraced`, `ribbon` |

**Open vs closed vocabularies `[C:med]`:** `era` and `mood` are open strings
because the product's whole premise is wacky prompts ("1000 cyborg-unicorn
dealerships") and a closed enum would be a bottleneck the planner has to fight.
The enumerated `motifs.*` fields are closed because stdlib generators `switch`
on them; unknown values there are `LOAM-E220`, and the planner is expected to
express anything unlisted through `motifs.architecture` (open) or `tokens`.

### 2.5 Biome themes

Biome themes bind climate regions to vanilla biome ids, ground palettes, and
scatter tables. The terrain generator (§7.5) assigns a theme per column; every
other pass reads it for free.

```json
"biomeThemes": {
  "fjord_slope": {
    "biome": "minecraft:windswept_gravelly_hills",
    "palettes": {
      "ground.surface": [{ "block": "minecraft:grass_block", "w": 6 },
                         { "block": "minecraft:podzol", "w": 3 },
                         { "block": "minecraft:stone", "w": 1 }],
      "ground.subsurface": "minecraft:coarse_dirt",
      "ground.cliff": "minecraft:stone"
    },
    "scatter": [
      { "generator": "scatter.forest@0",
        "params": { "species": "spruce_tall", "density": 0.18, "maxSlope": 34 } }
    ],
    "climate": { "temperature": -0.2, "humidity": 0.7 },
    "where": { "elevation": [8, 90], "slope": [12, 60] },
    "weather": { "precipitation": "rain", "fogDensity": 0.7 }
  }
}
```

| Field | Type | Notes |
|---|---|---|
| `biome` | string | vanilla biome id written into chunk biome data |
| `palettes` | object | palette overrides active only where this theme applies — the same symbol resolution as §2.2 |
| `scatter` | array | generator invocations run by the decorate pass within this theme |
| `climate` | object | `temperature`, `humidity`, `weirdness` in −1..1; used for blending and for vanilla-parameter export |
| `where` | object | assignment predicate: `elevation` `[min,max]` in blocks relative to sea level, `slope` `[min,max]` degrees, `distanceToWater` `[min,max]`, `continentalness` `[min,max]` |
| `weather` | object | `precipitation`: `none`\|`rain`\|`snow`; `fogDensity` 0..1 (advisory — Java client fog is biome-driven, so this maps to biome choice, `[C:low]`) |
| `priority` | int | tie-break when multiple `where` predicates match; higher wins, default 0 |

If two themes match a column and priorities tie, the **lexicographically first
theme id** wins. Deterministic and boring on purpose. `[C:high]`

### 2.6 Lighting

```json
"lighting": {
  "interiorSource": "@light",
  "interiorSpacingBlocks": 7,
  "targetInteriorLevel": 9,
  "exteriorSource": "@light.wall",
  "exteriorSpacingBlocks": 12,
  "mobproofInteriors": true,
  "glowUnderwater": false
}
```

`mobproofInteriors: true` makes the decorate pass add light sources until every
interior floor block is ≥ `targetInteriorLevel`. This is a quality feature, not
a syntax one, but it lives in style because it is a *world-wide aesthetic
decision*. `[C:med]`

### 2.7 `tokens` — the open extension bag

```json
"tokens": {
  "cat_worship": 0.9,
  "banner_pattern": "cat_silhouette",
  "preferred_wood": "dark_oak"
}
```

Scalars and strings only (no nesting, `[C:med]` — flat keeps merge semantics
trivial). Read by generator params via `"$style.tokens.preferred_wood"` and by
authored generators via `ctx.style.tokens`. Unknown keys never error. This is
the pressure valve for "the planner needs to say something the schema doesn't
have a field for", and it is deliberately underpowered so it does not become the
whole language.

### 2.8 Inheritance & override semantics `[C:high]`

Every node has a **resolved style**, computed in pass 2 by folding down the tree.

**Precedence, lowest to highest:**

1. `std:default`
2. Each entry of the world style's `extends`, in array order (later wins)
3. The world style's own fields
4. For each ancestor node from root to parent, that node's `style` patch, in
   depth order
5. The node's own `style` patch
6. Active `biomeThemes[...].palettes` for the column being written (terrain and
   decorate passes only — structures do not get re-skinned by the biome they
   land in unless they opt in with `"biomeSkin": true`) `[C:med]`

Generator *defaults* sit **below** all of this: a generator's built-in fallback
for a symbol applies only if resolution fails entirely.

**Merge rules for a patch:**

| Source type | Rule |
|---|---|
| Object | deep merge, key by key |
| Array | **replace wholesale** (no element merging, no append-by-position) |
| Scalar | replace |
| `null` value | delete the key (`"palettes": {"decor.banner": null}`) |
| `{"$replace": true, …}` | replace the whole object instead of merging |
| `{"$append": [...]}` inside an array-valued key | append to inherited array |

Arrays replacing wholesale is the boring, predictable choice; `$append` covers
the common "add one more motif" case without positional semantics. `[C:med]`

A node's `style` may also be a **string** — the id of a style document or a
`std:` pack — which is shorthand for `{"extends": ["<that>"]}` applied at that
node.

**Sealing.** An ancestor may lock parts of the style against descendant
override:

```json
"seal": ["palettes.wall", "palettes.roof", "era"]
```

A descendant patch touching a sealed path is `LOAM-E221 SEALED_STYLE_OVERRIDE`.
This exists because coherence is the whole point of L3, and a 40-agent run will
otherwise drift. The planner seals; implementers cannot. `[C:med]`

**Debuggability requirement:** the compiler MUST be able to emit, per node, the
provenance of every resolved symbol (`--explain-style node.path`). Without it,
debugging a 300-node style cascade is hopeless.

### 2.9 Conditional palette entries

```json
"palettes": {
  "wall": [
    { "block": "minecraft:deepslate_bricks", "w": 8 },
    { "block": "minecraft:cracked_deepslate_bricks", "w": 4,
      "when": { "decay": [0.3, 1.0] } },
    { "block": "minecraft:mossy_cobblestone", "w": 3,
      "when": { "decay": [0.5, 1.0], "yBelow": 6, "exposedToSky": false } }
  ]
}
```

`when` predicates available in v0.1 `[C:med]`:

| Key | Type | Meaning |
|---|---|---|
| `decay` | `[min,max]` | style `decay.level` in range |
| `yBelow` / `yAbove` | int | block Y relative to the node's floor |
| `exposedToSky` | bool | evaluated after CSG merge |
| `nearWater` | int | within N blocks of a water block |
| `biomeTheme` | string[] | current column's theme id |
| `tag` | string[] | the emitting node carries one of these tags |

Entries whose `when` fails get weight 0. If all entries fail, the symbol falls
back per §2.2's dot-fallback, then to `LOAM-E210`.

---

## §3 L2 — Scene graph node anatomy

The scene graph is a tree: `world → region → district → feature → detail`. Depth
is unbounded but the validator warns past 12 (`LOAM-W130`) because seeds,
transforms, and solver work all compose down the tree.

### 3.1 Fields common to all kinds

```json
{
  "id": "cathedral_of_the_cat",
  "kind": "asset",
  "label": "Cat-shaped cathedral dominating the plaza",
  "envelope": { "shape": "box", "size": [80, 60, 80] },
  "constraints": [ { "within": "old_town" }, { "facing": "plaza#center" } ],
  "ports": { "main_door": { "type": "door", "face": "south" } },
  "tags": ["landmark", "civic", "sacred"],
  "style": { "palettes": { "wall": "minecraft:calcite" } },
  "params": {},
  "children": [],
  "csg": { "precedence": 20, "mode": "replace" },
  "seedSalt": "",
  "optional": false,
  "hints": {},
  "budget": { "maxOps": 2000000 },
  "note": "ignored by the compiler"
}
```

| Field | Type | Default | Kinds | Purpose |
|---|---|---|---|---|
| `id` | string | — (required) | all | unique among **siblings**; forms `nodePath` |
| `kind` | enum | — (required) | all | `composite` \| `generator` \| `asset` \| `primitive` |
| `label` | string | `""` | all | prose; feeds asset prompts, critic, logs. Never parsed |
| `envelope` | object | `{"shape":"auto"}` | all | requested volume, **not** a position (§3.3) |
| `constraints` | array | `[]` | all | relations to siblings/ancestors (§4) |
| `ports` | object | `{}` | all | named interface points (§5) |
| `tags` | string[] | `[]` | all | selector targets, decorate filters, validator rules |
| `style` | object\|string | `{}` | all | style patch or pack id (§2.8) |
| `params` | object | `{}` | generator, asset, primitive | kind-specific payload |
| `children` | array | `[]` | composite (also generator/asset, see below) | child nodes, `$module`, or `$proto` refs |
| `csg` | object | see §3.7 | all | merge precedence and mode |
| `seedSalt` | string | `""` | all | reroll without renaming (§6.2) |
| `optional` | bool | `false` | all | solver may drop this node rather than fail (§4.6) |
| `repeat` | object | absent | all | expand into N siblings (§3.8) |
| `hints` | object | `{}` | all | **soft, ignorable** advisory bag (§3.10) |
| `budget` | object | inherited | all | resource caps for expansion (§7.9) |
| `decorate` | array | `[]` | all | decorate-pass invocations scoped to this node (§7.8) |
| `validate` | object | `{}` | all | per-node lint overrides (§13.3) |
| `note` | string | — | all | ignored |

**Which kinds may have `children`:**

| Kind | `children` | Semantics |
|---|---|---|
| `composite` | yes, primary | children are laid out inside this envelope |
| `generator` | yes, optional | *additional* static children, merged with the children the generator emits at runtime; ids must not collide (`LOAM-E140`) |
| `asset` | yes, only if `role: "shell"` | children are placed in the interior cavity envelope (§9.5) |
| `primitive` | no (`LOAM-E141`) | leaves by definition |

### 3.2 `id` rules `[C:high]`

- Pattern: `^[a-z][a-z0-9_]{0,62}$`. Lowercase, underscore, no dots (dots are
  the path separator), no `#` (port separator), no `@`, no `:`.
- Unique among siblings. Duplicates are `LOAM-E142 DUPLICATE_ID`.
- `nodePath` = ancestor ids joined with `.`, starting at the root node's id:
  `world.old_town.plaza.cathedral_of_the_cat`.
- **Ids are load-bearing.** `seed = hash(worldSeed, nodePath)` (§6). Renaming a
  node rerolls everything beneath it and invalidates its cache entry. Agents
  should choose descriptive, stable ids on the first try; the repair loop should
  prefer `seedSalt` over renaming.
- Reserved: `world` is allowed only as the root node's id; `^`, `~`, `self`,
  `parent`, `root` are reserved selector words.

### 3.3 Envelopes

An envelope is a **requested bounding volume in node-local space with no
position**. The solver assigns the position (§4.3). This is the mechanism by
which LLMs never emit absolute coordinates.

```json
"envelope": {
  "shape": "box",
  "size": [64, 24, 40],
  "minSize": [40, 16, 24],
  "maxSize": [96, 40, 64],
  "flexible": true,
  "anchor": "terrain",
  "anchorOffset": 0,
  "padding": 2,
  "rotations": [0, 90, 180, 270],
  "mirror": false,
  "grow": "none"
}
```

**Shapes:**

| `shape` | Extra fields | Notes |
|---|---|---|
| `box` | `size: [x,y,z]` | the default and the workhorse |
| `cylinder` | `radius`, `height` | axis is always +Y in v0.1 |
| `sphere` | `radius` | |
| `dome` | `radius`, `height` | treated as a half-ellipsoid |
| `prism` | `footprint: [[x,z], …]`, `height` | polygon extruded up; must be simple (non-self-intersecting), CCW |
| `region` | `footprint` or `size: [x,z]`, `yMin`/`yMax` or `follows: "terrain"`, `bandBelow`, `bandAbove` | a 2D area with a vertical band — **the right shape for terrain, forests, biomes, road networks** |
| `path` | `width`, centerline supplied by the `along`/`connected` machinery | a linear corridor; roads, rivers, walls |
| `inherit` | — | exactly the parent's envelope (minus `padding`) |
| `auto` | — | size from children (composite), from the generator's `estimate()` (generator), or from `asset.size` (asset) |
| `mask` | `source: "<nodePath>#interior"` | voxel-mask envelope; produced by `shell` assets (§9.5), never hand-written |

**Common fields:**

| Field | Type | Default | Meaning |
|---|---|---|---|
| `size` | `[x,y,z]` ints | — | requested extent in blocks |
| `minSize` / `maxSize` | `[x,y,z]` | `size` | resize range, used **only if `flexible`** |
| `flexible` | bool | `false` | opt-in resizing |
| `anchor` | enum | `terrain` | vertical datum: `terrain` (floor sits on solved ground height), `sea`, `absolute` (world Y from `anchorOffset`), `parent_floor`, `parent_ceiling`, `float` |
| `anchorOffset` | int | `0` | blocks added to the datum (negative = buried — this is how you say "underground") |
| `padding` | int or `[x,y,z]` | `0` | keep-clear margin outside the envelope |
| `rotations` | int[] | `[0,90,180,270]` | yaw values the solver may choose; `[0]` pins orientation |
| `mirror` | bool | `false` | solver may mirror across local X |
| `grow` | enum | `none` | `none`\|`up`\|`down`\|`out`\|`any` — permission for pass 4 to exceed the envelope; overflow beyond this is `LOAM-E150 ENVELOPE_OVERFLOW` |

**Terse forms** (the only value-level sugar in the language, §1.4):

| Sugar | Desugars to |
|---|---|
| `"envelope": [64, 24, 40]` | `{"shape":"box","size":[64,24,40]}` |
| `"envelope": {"size":[64,24,40]}` | shape defaults to `box` |
| `"envelope": "inherit"` / `"auto"` | `{"shape":"inherit"}` / `{"shape":"auto"}` |

**Local origin.** Node-local coordinates put `(0,0,0)` at the envelope's
**minimum corner**, not the center — generators and LLMs both index from a
corner more reliably, and all local coordinates stay non-negative. `[C:high]`
Non-box shapes use their bounding box's min corner.

**Y bounds.** Java Edition 26.2 overworld is Y ∈ `[-64, 320)`. An envelope
resolving outside that is `LOAM-E151 OUT_OF_WORLD_BOUNDS`. Sea level defaults to
63 and is set in the terrain generator's params, not in envelopes.

### 3.4 `kind: "composite"`

Subdivides its envelope among children.

```json
{
  "kind": "composite",
  "layout": "packed",
  "layoutParams": { "spacing": 4, "axis": "z", "cols": 3, "jitter": 0.15,
                    "align": "center", "order": "declaration" },
  "children": []
}
```

| `layout` | Meaning |
|---|---|
| `free` | position from constraints + non-overlap only (default) |
| `packed` | greedy deterministic packing, then constraint relaxation |
| `grid` | rows/cols; `cols`, `spacing`, `align` |
| `linear` | strung along `axis` (`x`\|`z`) or along an `along` target |
| `radial` | ring around the envelope center; `radius`, `startAngle` |
| `terraced` | linear along the dominant slope, stepping in Y |
| `manual` | children carry explicit `offset: [x,y,z]` in parent-local space; the solver only validates. **Escape hatch** — see §12 Q7 |

`layoutParams.order` (`declaration` \| `id` \| `largest_first`) fixes the
solver's deterministic iteration order. Default `declaration`, so the authoring
agent's ordering is meaningful and stable. `[C:med]`

Composites emit no voxels; they contribute an occupancy region and a transform.

### 3.5 `kind: "generator"`

Invokes a deterministic parameterized program (§7).

```json
{
  "kind": "generator",
  "generator": "building.grammar@0",
  "params": { "floors": 3, "roof": "steep_gable", "bays": 4 },
  "emitsChildren": true,
  "source": null
}
```

| Field | Type | Notes |
|---|---|---|
| `generator` | string | `name@majorVersion` for stdlib (`terrain.heightfield@0`), or `authored:<id>` |
| `params` | object | validated against the generator's param schema; unknown keys error unless the generator sets `openParams` |
| `source` | string\|object\|null | for `authored:` — a path to a `.gen.ts` module or `{"inline": "…"}` `[C:med]` |
| `emitsChildren` | bool (default `false`) | if true the generator may return child nodes that re-enter the pipeline at pass 3; must be declared so the compiler can schedule the nested solve |

Generator nodes may carry static `children` (merged with emitted ones) and
`ports` the generator is contractually obliged to honor (§5.6).

### 3.6 `kind: "asset"` and `kind: "primitive"`

`asset` is specified in full in §9. `primitive` carries L0 ops directly:

```json
{
  "kind": "primitive",
  "id": "beacon_plinth",
  "envelope": [5, 4, 5],
  "params": { "ops": [
    { "op": "fill", "from": [0,0,0], "to": [4,2,4], "block": "@wall" },
    { "op": "fill", "from": [1,3,1], "to": [3,3,3], "block": "@light" }
  ] }
}
```

Primitives are for the last 5% — a specific altar, a sign, a fixed detail. They
are the only place an author writes coordinates, and those coordinates are
**node-local**, so the no-absolute-coordinates rule still holds. Ops: §8.

### 3.7 `csg` — precedence and merge mode

```json
"csg": { "precedence": 20, "mode": "replace", "carveOnly": false }
```

| Field | Type | Default | Meaning |
|---|---|---|---|
| `precedence` | int | by kind — terrain `0`, structural generators `10`, connective `15`, assets `20`, primitives `30`, decorate `40` | higher wins on conflict |
| `mode` | enum | `replace` | `replace` (overwrite), `keep` (write only into `air`), `carve` (subtract — write air), `blend` (write only over lower-precedence *natural* blocks) |
| `carveOnly` | bool | `false` | node contributes subtraction only (e.g. a cave system) |

Ties in `precedence` break by (depth, then solver order, then `nodePath`
lexicographic) — never by order of parallel completion. `[C:high]`

### 3.8 `repeat` `[C:med]`

```json
{ "id": "house", "kind": "generator", "generator": "building.grammar@0",
  "repeat": { "count": 12, "idPattern": "house_{i:02}", "vary": { "floors": [1, 2] } },
  "constraints": [{ "along": "^.main_street", "offset": [3, 6] }] }
```

Expanded at pass 1 into 12 sibling nodes `house_00 … house_11`, each with its own
`nodePath` and therefore its own seed — *unique but similar*, which is exactly
the `rough-vision.txt` residential-area requirement for almost no tokens.

| Field | Type | Notes |
|---|---|---|
| `count` | int 1..512 | hard cap 512 per repeat (`LOAM-E143`) |
| `idPattern` | string | `{i}` or `{i:0N}`; must yield unique ids |
| `vary` | object | per-param `[min,max]` numeric range or `["a","b"]` categorical choice, drawn from the instance's `"repeat"` RNG stream |
| `indexParam` | string | if set, the instance index is injected into `params[indexParam]` |

Expansion happens **before** seeding, so `nodePath` contains the concrete id and
no bracket syntax is needed anywhere in the language.

### 3.9 `prototypes` and `$proto` `[C:med]`

Reuse without breaking `nodePath` uniqueness:

```json
"prototypes": {
  "cottage": { "kind": "generator", "generator": "building.grammar@0",
               "envelope": [7, 8, 9],
               "params": { "floors": 1, "roof": "thatch_cone" },
               "ports": { "door": { "type": "door", "face": "auto" } } }
},
"root": { "children": [
  { "$proto": "cottage", "as": "cottage_north", "with": { "params": { "floors": 2 } } }
] }
```

`prototypes` may appear on a `world` document or any composite node; lookup walks
up the tree. `with` is a deep-merge patch (§2.8 rules) over the prototype.
Instantiation happens at pass 1, yielding an ordinary node with a real id, so
seeds and caching behave normally.

### 3.10 `hints` — soft, always-ignorable

```json
"hints": { "interiorTheme": "library", "crowdedness": 0.7,
           "preferSouthFacing": true, "notes": "should feel oppressive" }
```

Anything in `hints` MAY be ignored by any pass with no diagnostic beyond
`LOAM-W110`. This is where an agent puts intent it cannot express structurally;
it is *never* load-bearing. Contrast `params` (validated, load-bearing) and
`style.tokens` (world-level, read by generators).

---

## §4 Constraint vocabulary

Constraints are how position gets expressed without coordinates. They relate a
node to siblings, ancestors, terrain features, or ports.

### 4.1 Canonical and shorthand forms `[C:high]`

Canonical:

```json
{ "type": "distance", "target": "town_hall", "min": 20, "max": 60,
  "measure": "surface", "axis": "horizontal", "strength": "hard", "weight": 1.0 }
```

Shorthand — a **single type-key object** whose value is that type's *primary
argument*, with remaining fields as siblings of the key:

```json
{ "within": "old_town" }
{ "distance": "town_hall", "min": 20, "max": 60 }
{ "facing": "plaza#center", "tolerance": 20, "strength": "soft" }
```

Desugaring is mechanical: `{"<type>": X, …rest}` → `{"type":"<type>",
"<primaryArg>": X, …rest}`. Each type's primary argument is named in §4.4. Both
forms are always valid; the compiler canonicalizes before hashing. Agents should
use shorthand.

Common fields on every constraint:

| Field | Type | Default | Meaning |
|---|---|---|---|
| `type` | enum | — | constraint type |
| `strength` | `hard`\|`soft` | per-type (§4.4) | see §4.5 |
| `weight` | number >0 | `1.0` | soft-cost multiplier; ignored when `hard` |
| `tolerance` | number | per-type | slack before the constraint counts as violated |
| `note` | string | — | ignored |

### 4.2 Selectors — what a target may be `[C:med]`

| Form | Example | Meaning |
|---|---|---|
| Absolute node path | `"world.old_town.plaza"` | from root |
| Relative path | `"plaza"` | resolved by walking out from `self`: siblings, then each ancestor's children, then their descendants. First match wins; ambiguity is `LOAM-E160 AMBIGUOUS_SELECTOR` |
| `^`, `^^` | `"^"` | parent, grandparent |
| `^.main_street` | | explicit sibling-of-parent — **the preferred, unambiguous form** |
| `self` | | this node (`clearance`, `orientation`) |
| Port ref | `"town_hall#tunnel_stub"` | a specific port (§5.5) |
| Tag set | `"#tag:road"` | all nodes carrying tag `road`; per-type set semantics in §4.4 |
| Terrain feature | `"@terrain:coast"` | derived from pass 3's terrain preview. v0.1 features: `coast`, `water`, `ridge`, `valley`, `flat`, `slope`, `cliff`, `river`, `cave_mouth` `[C:med]` |
| Biome theme | `"@theme:fjord_slope"` | region where a theme applies |
| World anchor | `"@world:spawn"`, `"@world:center"`, `"@world:origin"` | fixed points |

Cross-module references resolve after link (§1.3), but a module referencing
outside its own subtree without declaring it in `contract.sees` gets
`LOAM-W161` — the contract is supposed to be the interface. `[C:med]`

### 4.3 What the solver produces

For every node, pass 3 produces a **placement**:

```json
{ "nodePath": "world.old_town.cathedral",
  "translation": [1240, 68, -320],
  "yaw": 90, "mirror": false, "size": [80, 60, 80],
  "satisfied": ["within", "facing"],
  "relaxed": [{ "type": "distance", "target": "town_hall", "slack": 4 }] }
```

Transform = integer translation + yaw ∈ {0, 90, 180, 270} + optional mirror
across local X. **No arbitrary rotation, no scaling.** This is the key
simplification that makes the system exact: every transform is a
voxel-preserving bijection, nothing ever resamples, and a subtree compiled in
isolation is bit-identical to the same subtree compiled in place. `[C:high]`

Yaw is clockwise viewed from above (+Y down). Under yaw 90 a local point
`(x, y, z)` in a box of size `(X, Y, Z)` maps to `(Z−1−z, y, x)` with new size
`(Z, Y, X)`, and faces map `north→east→south→west→north`.

### 4.4 The constraint reference

Legend: **prim** = primary argument for shorthand; **def** = default strength.

---

#### `within` — prim `target` · def **hard**

The node's envelope lies entirely inside the target's placed envelope, inset by
the target's `padding`.

| Field | Type | Default | Meaning |
|---|---|---|---|
| `target` | selector | — | container node, or an `@theme:`/`@terrain:` region |
| `inset` | int | `0` | extra margin inside the target |
| `partial` | 0..1 | `1.0` | fraction of self's volume that must be inside |

Solver obligation: hard `within` is a **domain restriction applied before any
relaxation**, not a cost. If `minSize` cannot fit, that is `LOAM-E170
CANNOT_FIT` and only growing a flexible parent (ladder step 4) can help.
**Every child has an implicit `within: "^"`** unless it declares `within`
explicitly or sets `escapesParent: true`. `[C:high]`

---

#### `adjacent_to` — prim `target` · def **hard**

The envelopes touch: nearest-face gap within `[gap.min, gap.max]`, with at least
`overlap` blocks of shared face.

| Field | Type | Default |
|---|---|---|
| `target` | selector | — |
| `gap` | `[min,max]` or int | `[0, 1]` |
| `face` | `north`\|`south`\|`east`\|`west`\|`up`\|`down`\|`any` | `any` — which face of **self** touches |
| `overlap` | int or `"full"` | `2` |
| `share` | `edge`\|`face` | `face` |

---

#### `facing` — prim `target` · def **soft** (weight 2.0)

The node's **front** is oriented toward the target. "Front" is, in order: the
port named by `frontPort`; else the port tagged `primary`; else a port named
`main_door` or `door`; else local −Z (north). If none exists,
`LOAM-E171 NO_FRONT_DEFINED`.

| Field | Type | Default |
|---|---|---|
| `target` | selector (node, port, or `@terrain:…`) | — |
| `tolerance` | degrees | `45` |
| `frontPort` | port name | auto, per above |
| `strict` | bool | `false` — require exact cardinal alignment |

Because yaw is quantized to 90°, `tolerance: 45` means "nearest cardinal is good
enough", which is nearly always achievable. Making `facing` hard produces
spurious unsat for no visual gain — hence the soft default.

---

#### `along` — prim `target` · def **hard**

Place the footprint beside a **linear** target (road, path, river, wall) at a
lateral offset, front toward the line.

| Field | Type | Default | Meaning |
|---|---|---|---|
| `target` | selector | — | must resolve to a node with a polyline or a `path` envelope |
| `offset` | int or `[min,max]` | `[1, 4]` | lateral distance from the line's edge |
| `side` | `left`\|`right`\|`any` | `any` | side, in the line's direction of travel |
| `faceRoad` | bool | `true` | also imposes `facing` on the line |
| `spacing` | int | `2` | minimum gap to other `along` siblings on the same line |
| `at` | 0..1 or `[min,max]` | `[0,1]` | normalized position along the line |

**Ordering hazard, resolved:** `along` targets a road, but roads are *routed* in
pass 6. Therefore a linear target must exist in pass 3 as a node with a `path`
envelope — a **route corridor** — and pass 6 refines the exact centerline
*inside* that corridor. Buildings snap to the corridor; the road wiggles within
it. `[C:high]` This is what makes "houses along the main street" work despite
the late connective pass.

---

#### `distance` — prim `target` · def **hard**

| Field | Type | Default |
|---|---|---|
| `target` | selector or set selector | — |
| `min` / `max` | number (blocks) | `0` / `∞` |
| `measure` | `center`\|`surface`\|`port` | `surface` |
| `axis` | `3d`\|`horizontal`\|`vertical` | `horizontal` |
| `aggregate` | `all`\|`any`\|`nearest` | `all` (set targets) |

`{"distance": "#tag:house", "min": 6}` is the idiomatic "don't crowd".

---

#### `connected` — prim `to` · def **hard**, realized in pass 6

```json
{ "connected": "town_hall#tunnel_stub", "via": "tunnel",
  "from": "self#tunnel_stub", "style": "ancient_brick",
  "width": 3, "height": 4, "maxGrade": 0.25, "maxLength": 400,
  "prefer": "shortest" }
```

| Field | Type | Default | Meaning |
|---|---|---|---|
| `to` | port ref or node selector | — | a bare node selector means "any compatible port on it" |
| `from` | port ref | auto-selected compatible port on self | source |
| `via` | `road`\|`path`\|`tunnel`\|`bridge`\|`rail`\|`stair`\|`canal` | inferred from port types (§5.4) | connector kind |
| `style` | string | inherited | style pack for the connector's palettes |
| `width` / `height` | int | from `via` defaults | cross-section |
| `maxGrade` | number | `0.25` road, `0.5` path, `0.1` rail | rise/run limit |
| `maxLength` | int | `∞` | routing gives up past this → `LOAM-E180 UNROUTABLE` |
| `prefer` | `shortest`\|`gentlest`\|`scenic`\|`hidden` | `shortest` | pathfinding cost bias |
| `bidirectional` | bool | `true` | declaring on one side suffices |

Pass 3 behavior: a **soft proximity cost** plus a hard reachability
precondition (both endpoints must exist and expose compatible ports). Actual
routing is pass 6. This is `DESIGN.md`'s "the church and town hall are connected
by an underground tunnel" made first-class and solvable.

---

#### `align` — prim `target` · def **soft** (weight 1.0)

| Field | Type | Default |
|---|---|---|
| `target` | selector or set selector | — |
| `axis` | `x`\|`y`\|`z` | required |
| `mode` | `center`\|`min`\|`max`\|`front`\|`back` | `center` |
| `tolerance` | int | `1` |

`{"align": "#tag:facade", "axis": "x", "mode": "front"}` gives a street wall.

---

#### `orientation` — prim `value` · def **hard**

| Field | Type | Notes |
|---|---|---|
| `value` | `north`\|`south`\|`east`\|`west`, or degrees ∈ {0,90,180,270}, or `"downhill"`\|`"uphill"`\|`"toward:<selector>"` | absolute or derived yaw |
| `axis` | `front`\|`long`\|`short` | `front` — which of the node's axes is oriented |

Intersected with `envelope.rotations`; empty intersection is `LOAM-E172`.

---

#### `clearance` — prim `amount` · def **hard**

Empty (non-solid) volume around the node or one of its ports.

| Field | Type | Default | Meaning |
|---|---|---|---|
| `amount` | int | — | blocks of clearance |
| `direction` | `up`\|`down`\|`north`\|`south`\|`east`\|`west`\|`front`\|`horizontal`\|`all` | `all` | |
| `of` | `self` or a port ref on self | `self` | `{"clearance": 3, "of": "self#main_door", "direction": "front"}` = don't build a wall in front of the door |
| `against` | `solid`\|`any_node`\|`terrain` | `solid` | what counts as obstruction |

Checked twice: as a placement constraint in pass 3 (against envelopes) and as a
**lint against real geometry** after pass 6 (`LOAM-W420 BLOCKED_PORT`). The
second check is what catches `DESIGN.md`'s "doors into walls".

---

#### `terrain_conform` — prim `mode` · def **hard**

How the node meets the ground. This single field prevents the most common ugly
failure (floating or half-buried buildings).

| `mode` | Behavior |
|---|---|
| `flatten` | terrain under the footprint levelled to one Y (the `reference` statistic), with a retaining skirt |
| `cut_fill` | cut above, fill below, blended over `blend` blocks — default for buildings |
| `drape` | the node's own geometry follows the heightfield per column (roads, paths, walls, farms) |
| `terrace` | levelled in steps of `step` blocks |
| `stilts` | node keeps its Y; supports generated down to ground |
| `float` | no interaction (airships, floating islands) |
| `bury` | placed below the surface, terrain closed over it |

| Field | Type | Default |
|---|---|---|
| `mode` | enum above | `cut_fill` |
| `reference` | `min`\|`max`\|`mean`\|`median` | `median` |
| `blend` | int | `4` (blend radius outside the footprint) |
| `maxSlope` | degrees | `∞` (refuse steeper ground) |
| `step` | int | `3` (terrace mode) |
| `skirt` | bool | `true` (foundation walls down to grade) |

Defaults when undeclared: `cut_fill` for `asset`/`generator` structures, `drape`
for anything tagged `road`/`path`/`wall`, `float` when `envelope.anchor` is
`float` or `absolute`. `[C:med]`

---

#### Additional v0.1 types

| Type | prim | def | Meaning |
|---|---|---|---|
| `not_overlapping` | `target` | hard | explicit non-overlap with a node or tag set. **Implicit between all siblings** unless one sets `overlapAllowed: true` |
| `elevation` | `range` | hard | `{"elevation": [10, 40], "datum": "sea"}`; datum `sea`\|`terrain`\|`absolute` |
| `slope` | `range` | hard | the footprint's ground slope in degrees must be in range |
| `spread` | `target` | soft | maximize the minimum distance within a tag set (pairs with `repeat`) |
| `cluster` | `target` | soft | inverse of `spread` — pull toward a set's centroid |
| `inside_shell` | `target` | hard | placed inside a `shell` asset's interior cavity (§9.5); implies a `mask` domain |
| `above` / `below` | `target` | hard | strict Y ordering, optional `gap` |
| `centered_in` | `target` | soft (3.0) | self's center over the target's footprint center |
| `on_axis` | `target` | soft | on the target's symmetry axis (plaza axis, nave axis) |
| `visible_from` | `target` | soft | line-of-sight over the terrain preview; expensive, capped at 8 per world `[C:low]` |
| `avoid` | `target` | hard | keep out of a region (`@terrain:water`, `#tag:farmland`) with `margin` |

### 4.5 Hard vs soft `[C:high]`

- **Hard** — the solver must satisfy it or climb the relaxation ladder (§4.6)
  and report. Never silently violated.
- **Soft** — a cost term `weight × violation`; the solver minimizes total soft
  cost. Never a failure.

Defaults are **per-type** rather than uniform, because uniform-hard guarantees
over-constrained LLM specs and uniform-soft guarantees mush. The rule encoded in
the defaults: **topological facts are hard** (`within`, `adjacent_to`,
`connected`, `not_overlapping`, `elevation`, `terrain_conform`), **aesthetic
preferences are soft** (`facing`, `align`, `centered_in`, `spread`, `cluster`,
`on_axis`, `visible_from`).

Any constraint can be flipped with `strength`. An agent that wants something but
can live without it should write `"strength": "soft"` — the single most useful
habit for avoiding unsat.

### 4.6 Unsatisfiability and the relaxation ladder `[C:high]`

The solver never crashes and never silently produces garbage. On failure to place
a node it climbs this ladder, recording every step in the solver report:

1. **Absorb into soft cost.** If the hard set is satisfiable, done.
2. **Relax `tolerance`** by up to 2×, in a fixed order (`weight` ascending, then
   `nodePath`). → `LOAM-W401 TOLERANCE_RELAXED`
3. **Shrink flexible envelopes** toward `minSize`, largest node first.
   → `LOAM-W402 ENVELOPE_SHRUNK`
4. **Grow the parent** if its envelope is `flexible` and growth doesn't violate
   the grandparent. → `LOAM-W403 PARENT_GROWN`
5. **Demote hard constraints to soft**, one at a time, in a fixed order (lowest
   `weight`, then reverse declaration order, then `nodePath`). Never demote
   `within` (domain becomes unbounded) or `not_overlapping` (bodies
   interpenetrate). → `LOAM-E404 CONSTRAINT_DEMOTED` — error severity; does not
   stop the compile but gates the repair loop.
6. **Drop the node** if `optional: true`, with its subtree. → `LOAM-E405
   NODE_DROPPED`
7. **Fail** with `LOAM-E406 UNSATISFIABLE`, naming the minimal conflicting
   constraint set (greedy removal, not a real MUS algorithm in v0.1). `[C:med]`

The ladder is deterministic: same input → same rung → same world. The solver
report is a first-class artifact (`report.json`) consumed by the deterministic
validators and by the repair loop — an agent asked to fix a world is told
exactly which constraint it over-specified.

### 4.7 Solver obligations `[C:high]`

The solver MUST:

1. Be **deterministic**: fixed iteration order (`layoutParams.order`, then
   `nodePath`), jitter only from `stream(node, "layout")`, no hash-map iteration
   order, no float accumulation whose order depends on parallelism.
2. Be **hierarchical**: a parent's children are a self-contained subproblem
   inside the parent's placed envelope. A subtree's internal layout must not
   depend on anything outside its parent's envelope and contract — this is what
   licenses parallel compilation and subtree caching.
3. **Terminate**: hard cap (default 10 000 relaxation steps per composite), then
   fall to the ladder.
4. **Place every node or account for it** in the report.
5. Respect `envelope.rotations`, `mirror`, integer translation only.
6. Produce a **terrain preview** before structural placement, since
   `terrain_conform`, `elevation`, `slope`, and `@terrain:*` all need ground
   heights. The terrain generator must therefore expose a cheap `heightAt(x, z)`
   evaluable without full expansion (§7.5).

Non-obligations for v0.1: no global optimality, no SAT/SMT, no backtracking
across composite boundaries. `DESIGN.md` calls for "simple deterministic
packing/relaxation, upgradable in isolation"; this vocabulary is deliberately
expressible as costs + domain restrictions so a better solver is a drop-in.

### 4.8 Constraint evaluation order

| Phase | Applied |
|---|---|
| Domain construction | `within`, `elevation`, `avoid`, `inside_shell`, `orientation`, `envelope.rotations` |
| Discrete placement | `adjacent_to`, `along`, `distance`, `not_overlapping`, `above`/`below`, `slope` |
| Relaxation (cost min) | `facing`, `align`, `centered_in`, `spread`, `cluster`, `on_axis`, `visible_from`, all soft |
| Post-placement fixups | `terrain_conform`, envelope-level `clearance` |
| Pass 6 | `connected` realization |
| Post-geometry lint | voxel-level `clearance`, port reachability, road-graph connectivity |

---

## §5 Ports

A port is a **named interface point** on a node: where a door is, where a road
leaves a plot, where a tunnel meets a cellar. Ports are what make connectivity a
solvable statement instead of a coordinate guess.

### 5.1 Declaration

```json
"ports": {
  "main_door":   { "type": "door",        "face": "south", "at": "center", "width": 3, "height": 4 },
  "service_door":{ "type": "door",        "face": "east",  "at": [0.8, 0.0], "tags": ["private"] },
  "tunnel_stub": { "type": "tunnel_stub", "face": "down",  "at": "center", "y": -6, "width": 3, "height": 4 },
  "north_road":  { "type": "road_stub",   "face": "north", "width": 7, "allows": ["road", "bridge"] }
}
```

Port names follow the id pattern (`^[a-z][a-z0-9_]{0,62}$`) and are unique
within a node.

| Field | Type | Default | Meaning |
|---|---|---|---|
| `type` | enum | — (required) | §5.3 |
| `face` | `north`\|`south`\|`east`\|`west`\|`up`\|`down`\|`any`\|`auto` | `any` | which face of the node-local envelope the port sits on. `auto` = the generator or the solver picks and reports back |
| `at` | `"center"` \| `[u, v]` ∈ 0..1 | `"center"` | normalized position **on that face**; `u` runs along the face's horizontal axis (west→east or north→south), `v` runs vertically (bottom→top) |
| `y` | int | face-dependent | vertical offset from the node's floor, overriding `at[1]`; negative = below the floor (cellars, tunnel stubs) |
| `width` | int | per-type | opening width in blocks |
| `height` | int | per-type | opening height in blocks |
| `required` | bool | `true` | if a required port cannot be connected or realized, that is an error; optional ports degrade to a warning |
| `capacity` | int | `1` | how many connectors may terminate here |
| `allows` | string[] | per-type (§5.4) | which `via` kinds may attach |
| `tags` | string[] | `[]` | `primary` marks the node's front (§4.4 `facing`); others are free |
| `level` | int | `0` | which floor this port belongs to (buildings); `-1` = cellar |
| `outward` | bool | `true` | whether the connector leaves the node (false = an internal junction) |
| `cut` | bool | type-dependent | whether the compiler must physically cut an opening at this port (§5.6) |
| `note` | string | — | ignored |

Terse form: `"door": { "type": "door", "face": "auto" }` is a complete, valid
port. Everything else defaults sensibly.

### 5.2 Face geometry, and what rotation does

Faces are declared in **node-local** space, before placement. When the solver
assigns a yaw, faces rotate with the node: yaw 90 maps
`north→east→south→west→north`; `up`/`down` are invariant. A port declared
`face: "south"` on a node placed at yaw 90 ends up facing west in world space.

This is the reason ports are declared by face rather than by coordinate: the
author says "the door is on the front", and the solver retains freedom to rotate
the building to satisfy `facing`, `along`, and `orientation`.

A port's **resolved form**, produced after pass 4 and consumed by pass 6:

```json
{ "ref": "world.old_town.town_hall#tunnel_stub",
  "position": [1252, 54, -318],
  "outwardNormal": [0, -1, 0],
  "width": 3, "height": 4,
  "floorY": 54,
  "type": "tunnel_stub",
  "allows": ["tunnel"],
  "capacity": 1, "used": 0 }
```

`position` is the **center of the opening's inner face**, in world coordinates.
`outwardNormal` points away from the node — the direction a connector departs.

### 5.3 Port types

| Type | Default w×h | Typical `face` | Meaning |
|---|---|---|---|
| `door` | 1 × 2 | horizontal | pedestrian entrance; compiler cuts an opening and places a door block from `@door` |
| `gate` | 3 × 4 | horizontal | large ceremonial/defensive entrance in a wall or facade |
| `arch` | 3 × 4 | horizontal | opening with no door block |
| `window` | 1 × 2 | horizontal | not connectable; exists so facade generators and lint agree on where glass goes |
| `road_stub` | 5 × 1 | horizontal | where a road meets a plot boundary |
| `path_stub` | 2 × 1 | horizontal | footpath equivalent |
| `tunnel_stub` | 3 × 4 | any, often `down` | underground connector terminus |
| `bridge_stub` | 5 × 1 | horizontal | elevated deck terminus |
| `rail_stub` | 2 × 3 | horizontal | minecart rail terminus |
| `dock` | 5 × 1 | horizontal | waterline mooring; must be at sea/river level |
| `canal_stub` | 3 × 2 | horizontal | water channel terminus |
| `stair_top` / `stair_bottom` | 2 × 3 | `up` / `down` | vertical circulation between levels |
| `shaft` | 3 × 3 | `up`/`down` | vertical open shaft (wells, lift wells, chimneys) |
| `socket` | — | any | generic typed attachment point: "a statue goes here", "a child node docks here". Carries `socketKind` (free string) |
| `interior` | — | — | **reserved**: auto-generated by `shell` assets (§9.5); names the interior cavity envelope |

Unknown types are `LOAM-E105` (§1.5): a dropped port silently disconnects a
world.

### 5.4 Compatibility & `via` inference `[C:med]`

| `via` | Valid endpoint types | Default w×h | Notes |
|---|---|---|---|
| `road` | `road_stub`, `gate`, `arch` | 5 × 1 | drapes to terrain, obeys `maxGrade` |
| `path` | `path_stub`, `door`, `arch`, `gate` | 2 × 1 | narrower, steeper allowed |
| `tunnel` | `tunnel_stub`, `shaft`, `stair_bottom` | 3 × 4 | carves through rock; adds supports from `@tunnel.support` |
| `bridge` | `bridge_stub`, `road_stub`, `gate` | 5 × 1 | spans water/chasms; adds piers and `@bridge.rail` |
| `rail` | `rail_stub` | 2 × 3 | strict grade limit |
| `stair` | `stair_top`, `stair_bottom`, `shaft` | 2 × 3 | vertical connection within or between nodes |
| `canal` | `canal_stub`, `dock` | 3 × 2 | water-filled, must be level |

Inference when `via` is omitted: if both endpoint types appear in exactly one
row of this table, use that row; if more than one matches, use the first in the
order `road, path, tunnel, bridge, rail, stair, canal`; if none matches, that is
`LOAM-E181 INCOMPATIBLE_PORTS`.

Reconciliation rules when two ports differ:

1. **Width** — the connector uses `min(a.width, b.width)`, and each endpoint gets
   a short flare section widening to its declared width. Warn `LOAM-W182` if the
   ratio exceeds 2×.
2. **Height** — likewise `min`, with a headroom check against `clearance`.
3. **Elevation** — the connector must satisfy `maxGrade` over the routed
   distance; if it cannot, pass 6 inserts a `stair` segment when both ports
   `allows` it, else `LOAM-E180 UNROUTABLE`.
4. **Capacity** — exceeding `capacity` is `LOAM-E183 PORT_OVERSUBSCRIBED`.
5. **Waterline** — `dock` and `canal_stub` must resolve within ±1 of the water
   surface, else `LOAM-W184`.

### 5.5 Port references

`<node-selector>#<port-name>`. The node selector uses the §4.2 grammar, so
`^.town_hall#tunnel_stub`, `self#main_door`, and
`world.old_town.town_hall#tunnel_stub` are all valid. `#port` with no node
selector is invalid — write `self#port` (`LOAM-E185`).

A bare node selector where a port ref is expected means "any compatible port on
that node", resolved deterministically by: matching type first, then lowest
current `used` count, then lexicographic port name.

### 5.6 The generator/asset obligation `[C:high]`

Declaring a port is a **contract on geometry**, not a hint:

1. A `generator` node that declares ports receives them in `ctx.ports` and MUST
   return resolved positions for every one, or throw. Failure to resolve is
   `LOAM-E186 PORT_NOT_HONORED`.
2. The compiler then verifies against the real voxel field: at each port there
   must be an actual opening of at least `width × height`, floor-supported, with
   `clearance` on the outward side. Violations are `LOAM-W420 BLOCKED_PORT` and
   `LOAM-W421 PORT_NOT_WALKABLE` — the deterministic lints from `DESIGN.md`.
3. For nodes where the compiler owns the geometry (assets, §9.6), `cut: true`
   makes the compiler physically cut the opening after voxelization, guaranteeing
   the door exists even though nothing knew the mesh's shape in advance.
4. Composites expose descendants' ports upward:

```json
"ports": { "front_gate": { "expose": "cathedral#main_door" } }
```

`expose` re-publishes a descendant's resolved port under a new name on the
parent, so a district can be connected to a road without the road pass knowing
which building inside owns the door. Exposed ports inherit type, width, height,
and capacity from the target and MUST NOT redeclare them (`LOAM-E187`).

---

## §6 Determinism & seeds

The whole product rests on this: **same spec + same seed → byte-identical
world.** This section is normative and precise, because "deterministic" is only
true if every implementer agrees on the exact hash.

### 6.1 The world seed

`meta.worldSeed` is one of:

- a hex string `"0x5f3a19c2"` → parsed as a 64-bit unsigned integer
- a decimal string or JSON number with integer value → 64-bit unsigned (numbers
  outside ±2^53 MUST be written as strings; `LOAM-E190` otherwise)
- any other UTF-8 string → `worldSeed = truncate64(BLAKE3(utf8(s)))`

Loam stores the resolved 64-bit value in the emitted world's `level.dat` so a
world can always report the seed it came from. The Minecraft-visible world seed
is the same value (so vanilla features, if any are enabled, agree).

### 6.2 Node seeds

```
nodeSeed(n) = BLAKE3_256( LE64(worldSeed) ‖ 0x00 ‖ utf8(nodePath(n)) ‖ 0x00 ‖ utf8(seedSalt(n)) )
```

- `‖` is byte concatenation; `LE64` is little-endian 8 bytes.
- `nodePath` is the dot-joined id chain from the root node (§3.2), UTF-8, no
  normalization beyond the id charset (which is ASCII, so none is needed).
- `seedSalt` defaults to `""`.
- The result is 256 bits, used directly as PRNG state material.

**Why BLAKE3** `[C:med]`: fast, tree-structured, available in TS via
`@noble/hashes` with a pure-JS fallback, and stable across platforms. SHA-256 is
an acceptable substitute; whichever is chosen must be pinned in the compiler's
`toolchain` record, since changing it rerolls every world ever generated.

**`seedSalt` is the correct repair knob.** When the render critic says "this
tower looks wrong, try again", the repair agent bumps `seedSalt` from `""` to
`"a"`. The node's identity, path, constraints, and cache key for *everything
else* stay intact, and only that subtree rerolls. Renaming the node would do the
same thing but would also break every constraint that referenced it.

### 6.3 Named RNG streams `[C:high]`

A node never draws from one linear stream. It draws from **named streams**:

```
streamSeed(n, name) = BLAKE3_256( nodeSeed(n) ‖ 0x01 ‖ utf8(name) )
```

Reserved stream names: `layout`, `repeat`, `palette`, `scatter`, `grammar`,
`jitter`, `decor`, `carve`, `noise`. Generators may declare their own.

This matters more than it looks. With a single stream, adding one extra
`rng.next()` call inside the roof code shifts every subsequent draw and changes
the whole building — so a bug fix in one subsystem silently rerolls unrelated
geometry, and golden-file tests become useless noise. With named streams, a
change to roof logic touches only the `grammar` stream and leaves scatter,
palette, and layout byte-identical. **Generators MUST use a named stream per
subsystem.**

**Position-keyed draws.** Any decision attached to a specific block or column
uses a position-keyed hash rather than a sequential draw:

```
value(n, name, x, y, z) = BLAKE3_256( streamSeed(n, name) ‖ LE32(x) ‖ LE32(y) ‖ LE32(z) )
```

This makes per-block choices (palette variant selection, scatter jitter, decay
speckling) **independent of iteration order**, which is what allows chunked,
parallel, and partial evaluation to agree. `[C:high]`

### 6.4 The PRNG

Sequential draws use **xoshiro256\*\*** seeded by the first 256 bits of the
stream seed (with the all-zero state replaced by `0x9E3779B97F4A7C15…` per the
reference implementation).

Derived values are specified exactly, so two implementations cannot drift:

| Call | Definition |
|---|---|
| `nextU64()` | xoshiro256** step |
| `float()` | `(nextU64() >>> 11) * 2^-53` → `[0, 1)` |
| `int(lo, hi)` | Lemire rejection sampling over `hi-lo+1`, inclusive both ends |
| `pick(array)` | `array[int(0, array.length-1)]` |
| `weighted(entries)` | cumulative weights in **declaration order**, threshold `float() * totalWeight` |
| `gaussian()` | Box–Muller using two `float()` draws; second value discarded, never cached |
| `shuffle(array)` | Fisher–Yates descending, using `int(0, i)` |

`gaussian()` explicitly discards its second value because caching it would make
results depend on how many gaussians were previously drawn.

### 6.5 The determinism rules

Normative for the compiler, the stdlib, and every authored generator:

1. **No wall-clock.** `Date`, `performance.now`, timezones, and locales are
   unavailable in the sandbox (§7.7). `meta.createdAtIso` is never read.
2. **No unseeded randomness.** `Math.random` is removed from the sandbox global.
3. **No ambient environment.** No filesystem, no network, no env vars, no
   `process`, no locale-dependent string collation (all sorting is by UTF-8 code
   unit).
4. **Deterministic iteration.** Object keys are iterated in sorted order, never
   insertion order. `Map`/`Set` iteration is forbidden in generator code unless
   the container was built in a deterministic order.
5. **Deterministic parallelism.** Sibling subtrees compile in parallel but their
   op streams are concatenated in `nodePath` order before CSG merge. No reduction
   depends on completion order.
6. **Float discipline.** All arithmetic is f64. Voxelization is `Math.floor`.
   No `Math.fround`, no SIMD, no accumulating sums over unordered collections.
   Transcendental functions (`sin`, `cos`, `pow`) are *not* IEEE-specified across
   engines — so the sandbox exposes only `ctx.math`, a pinned deterministic
   implementation, and the noise primitives are the pinned FastNoiseLite port
   rather than raw trig. `[C:med]` — a real hazard; see §12 Q9.
7. **Content-addressed assets.** External asset generation (Tripo) is not
   deterministic, so its outputs are content-addressed and pinned in a lockfile
   (§9.8). Given the lockfile, the compile is deterministic; without it, only the
   non-asset portion is guaranteed.
8. **Pinned toolchain.** Compiler version, stdlib version, block-data version,
   and asset-lock hash are recorded in the emitted world and in the manifest.
   Determinism is claimed *within* a toolchain, not across versions.

### 6.6 Spec hashing, caching, and why recompiles are byte-identical

`specHash(node)` = BLAKE3 of the **JCS-canonicalized** (RFC 8785) JSON of the
node's fully desugared subtree, with `note`, `label`, and `x-*` keys stripped,
plus the node's resolved style and contract. Cache key for a compiled subtree is
`(specHash, nodeSeed, toolchainId)`.

The byte-identity argument, end to end:

1. Parsing and desugaring are pure functions of the document bytes.
2. Style resolution is a pure fold over a fixed tree in a fixed order.
3. Layout solving is deterministic by §4.7 obligation 1 and terminates by
   obligation 3.
4. Generator expansion is pure given `(envelope, params, style, seed, ports)` —
   enforced by the sandbox, not by convention.
5. CSG merge order is total and explicit (§3.7).
6. Routing, decoration, and lighting are pure functions of the merged voxel field
   plus position-keyed streams.
7. Anvil emit serializes chunks in a fixed order with fixed NBT key ordering and
   fixed compression settings (`zlib` level 6, no timestamps in the stream —
   note that gzip/zip *containers* must have their mtime fields zeroed, a real
   and easily missed detail `[C:high]`).

Every step is a pure function; the composition is a pure function; therefore
recompiling is byte-identical. The G1 golden-file test exists to keep this
honest.

### 6.7 Subtree reproducibility in isolation

Because `nodeSeed` depends only on `worldSeed` and `nodePath` — not on siblings,
not on placement, not on compile order — any subtree can be compiled standalone
and will produce identical voxels. Combined with the §4.7 hierarchy obligation
(a subtree's layout depends only on its parent's envelope and contract), this
gives:

- **Parallel agent authoring** with no coordination beyond the contract.
- **Subtree caching** across repair iterations: fixing the cathedral doesn't
  recompile the forest.
- **Isolated debugging**: `loam compile --only world.old_town.cathedral` renders
  exactly what appears in the full world.

The tradeoff, stated plainly: node identity is positional in the tree, so
**moving a node to a different parent rerolls it**. That is the price of
path-derived seeds and it is the right trade — the alternative (explicit stable
GUIDs on every node) costs tokens on every node forever to buy something needed
rarely. `[C:med]`

---

## §7 L1 — Generator interface & stdlib catalog

A generator is a **deterministic parameterized program producing voxels**. Two
flavors, per `DESIGN.md`: curated **stdlib** generators (zero tokens once
parameterized — bias toward these) and **authored** TypeScript written by an LLM
against a strict sandbox.

### 7.1 The two-phase contract `[C:high]`

Every generator implements two functions:

```ts
export interface Generator<P> {
  readonly name: string;            // "building.grammar"
  readonly version: number;         // 0  → referenced as "building.grammar@0"
  readonly paramSchema: JSONSchema; // validated at pass 1
  readonly openParams?: boolean;    // default false (§1.5)
  readonly emitsChildren?: boolean;

  /** Pass 3. Cheap. Called before placement is known. */
  estimate(ctx: EstimateContext<P>): Estimate;

  /** Pass 4. Called with a concrete placement. */
  generate(ctx: GenContext<P>): GenResult;
}
```

`estimate()` exists to break the chicken-and-egg between layout and expansion:
the solver needs a size before it can place, but the size may depend on the
params. It MUST be cheap (no voxel work), MUST be pure, and MUST be *honest* —
if `generate()` later exceeds the estimated envelope, that is `LOAM-E150
ENVELOPE_OVERFLOW` unless `envelope.grow` permits it.

```ts
interface Estimate {
  size: [number, number, number];          // preferred, node-local
  minSize?: [number, number, number];
  maxSize?: [number, number, number];
  ports?: Record<string, PortHint>;        // for face: "auto" ports
  footprintMask?: Uint8Array;              // optional 2D occupancy, for tight packing
  costHint?: number;                       // relative op-count estimate, for scheduling
}
```

### 7.2 What a generator receives

```ts
interface GenContext<P> {
  // — identity & determinism —
  readonly nodePath: string;
  readonly seed: Uint8Array;                       // nodeSeed, §6.2
  rng(stream: string): Rng;                        // named stream, §6.3
  hash(stream: string, x: number, y: number, z: number): number; // position-keyed, [0,1)

  // — geometry —
  readonly envelope: ResolvedEnvelope;             // node-local; origin (0,0,0) = min corner
  readonly placement: Placement;                   // world translation, yaw, mirror (read-only)
  readonly terrain: TerrainSampler;                // heightAt / slopeAt / themeAt / isWater
  readonly parentOccupancy: OccupancyView;         // read-only: what siblings already claim

  // — inputs —
  readonly params: P;                              // validated against paramSchema
  readonly style: ResolvedStyle;                   // §2; .palette(sym), .tokens, .era, .motifs
  readonly ports: PortRequest[];                   // ports the node declared — MUST be honored

  // — outputs —
  readonly out: OpBuilder;                         // fill/prism/sphere/line/brush/carve/…
  child(spec: NodeSpec): void;                     // only if emitsChildren
  resolvePort(name: string, p: ResolvedPortLocal): void;

  // — housekeeping —
  readonly budget: Budget;                         // remaining ops / fuel
  readonly math: DeterministicMath;                // pinned sin/cos/pow/sqrt (§6.5 rule 6)
  readonly noise: NoiseFactory;                    // pinned FastNoiseLite
  log(msg: string): void;                          // diagnostics only, never affects output
}
```

`style.palette("wall")` returns a resolved palette handle, not a block id — the
generator emits `@wall` symbols and per-block variant selection happens at CSG
time via position-keyed hashing (§2.2), so generators never need to think about
weighted choice.

### 7.3 What a generator returns

```ts
interface GenResult {
  ops: Op[];                       // L0 ops in node-local coordinates (§8)
  children?: NodeSpec[];           // re-enter the pipeline at pass 3; requires emitsChildren
  ports: Record<string, ResolvedPortLocal>;  // every declared port, resolved
  occupancy?: OccupancyMask;       // what this node claims, for the decorate pass
  heightfield?: Int16Array;        // terrain generators only: the authoritative surface
  markers?: Marker[];              // named points for later passes (spawn, plaza center, …)
  diagnostics?: Diagnostic[];
}
```

Ops are emitted in node-local coordinates and transformed once, by the compiler,
using the node's placement. **A generator never sees or writes world
coordinates** — it cannot, structurally, break the no-absolute-coordinates rule.
(`ctx.placement` is exposed read-only for terrain sampling and for
`prefer: "scenic"`-style decisions; writing through it is not possible.)

### 7.4 The sandbox `[C:high]`

Authored generators run under these restrictions. They are enforced, not
documented-and-hoped-for.

| Restriction | Mechanism |
|---|---|
| No IO | no `fs`, `net`, `process`, `fetch`; module resolution allowlist is `loam/std` only |
| No clock | `Date`, `performance` removed from the global object |
| No unseeded randomness | `Math.random` removed; only `ctx.rng` / `ctx.hash` |
| No engine-variant math | `Math.sin/cos/tan/pow/exp/log` shadowed by `ctx.math` equivalents; direct use is a lint error |
| Bounded time | instruction-count "fuel" budget (default 50M), not wall-clock — wall-clock limits would be nondeterministic |
| Bounded memory | op-count cap and array allocation cap from `budget` |
| Bounded output | ops must lie within `envelope` + `grow`; violations are clipped and reported |
| No global state | module top-level mutable state is frozen after load; a generator called twice with the same context produces the same result |
| No dynamic code | `eval`, `Function`, `import()` unavailable |

Execution is in a locked-down realm (`node:vm` with a frozen context in v0.1;
`isolated-vm` or a worker with a restricted realm is the hardening path).
`[C:med]` The threat model here is *bugs*, not adversaries — LLM-authored
generators fail by looping forever or writing 400M blocks, not by attacking the
host. Cost control, not security, is the primary driver.

### 7.5 Stdlib catalog v0

Nine generators. Each entry gives the param schema (as a table — the machine
schema lives in the stdlib package), the ports it can honor, and what it emits.

---

#### `terrain.heightfield@0`

The workhorse for G2. Produces a 2.5D surface with materials by slope and
elevation. Emits a `heightfield` that every later pass reads.

| Param | Type | Default | Meaning |
|---|---|---|---|
| `seaLevel` | int | `63` | world Y of the water surface |
| `baseHeight` | int | `70` | mean land height |
| `amplitude` | number | `40` | vertical scale of the primary octave stack |
| `octaves` | int 1..10 | `5` | |
| `frequency` | number | `0.0035` | base frequency (per block) |
| `lacunarity` | number | `2.0` | |
| `gain` | number | `0.5` | |
| `ridged` | bool | `false` | ridged-multifractal instead of fBm — this is the fjord/mountain switch |
| `warp` | object | `{"amount": 0, "frequency": 0.01}` | domain warp; `amount` in blocks |
| `erosionPasses` | int 0..8 | `0` | cheap thermal-erosion smoothing over the heightfield |
| `curve` | array of `[input, output]` | identity | remap the normalized height; the primary shaping knob |
| `continentalness` | object | absent | `{frequency, seaFraction}` — large-scale land/ocean mask |
| `cliffThreshold` | degrees | `55` | above this slope, use `@ground.cliff` and skip soil |
| `soilDepth` | int | `3` | `@ground.subsurface` thickness under `@ground.surface` |
| `beachWidth` | int | `4` | blocks either side of sea level that use `@ground.beach` |
| `underwaterMaterial` | symbol | `@ground.subsurface` | |
| `bedrock` | bool | `true` | emit a bedrock floor at world bottom |
| `waterFill` | bool | `true` | fill below `seaLevel` with `@liquid.water` |
| `themes` | string[] | all | restrict which `biomeThemes` may be assigned |

Ports: none. Emits: ops + `heightfield` + `markers` (`highest_point`,
`largest_flat`, `coast_points`). `estimate()` returns the node's region size and
is O(1). Also exposes the pass-3 `heightAt(x, z)` sampler required by §4.7.6 —
implemented by evaluating the same noise stack without materialization.

---

#### `terrain.density@0` `[C:med]`

3D density field for overhangs, floating islands, and cliff undercuts. Same
noise params as above plus:

| Param | Type | Default | Meaning |
|---|---|---|---|
| `squashFactor` | number | `0.6` | vertical gradient bias; higher = flatter |
| `overhangStrength` | number | `0.4` | 0 disables 3D behavior entirely |
| `floaters` | object | absent | `{density, minRadius, maxRadius, yRange}` |
| `surfaceRule` | array | see below | ordered rules mapping (depth-from-surface, y, slope) → symbol |

Emits a full 3D voxel field, so it is 5–20× the cost of `heightfield`. Use it
where the *prompt* calls for it, not by default. Its `heightAt` sampler returns
the topmost solid, which is more expensive; the solver caches it per column.

---

#### `terrain.climate@0`

Assigns `biomeThemes` to columns and writes the chunk biome array.

| Param | Type | Default |
|---|---|---|
| `temperatureFrequency` | number | `0.0012` |
| `humidityFrequency` | number | `0.0015` |
| `blendRadius` | int | `8` (theme-boundary dithering, position-keyed) |
| `latitudeGradient` | number | `0` (temperature bias per 1000 blocks of Z) |
| `forceTheme` | string | absent (single-theme worlds) |

Emits: no ops, only per-column theme assignment + biome data. Runs before
scatter so scatter can read it.

---

#### `scatter.forest@0`

| Param | Type | Default | Meaning |
|---|---|---|---|
| `species` | array | required | see below |
| `density` | number 0..1 | `0.15` | trees per eligible column |
| `spacing` | number | `3` | Poisson-disk minimum spacing in blocks |
| `clumping` | number 0..1 | `0.4` | 0 = uniform, 1 = strongly clustered |
| `maxSlope` | degrees | `35` | |
| `elevation` | `[min,max]` | `[1, 200]` | relative to sea level |
| `edgeFalloff` | int | `12` | density taper near the region boundary |
| `avoidTags` | string[] | `["road","building","plaza"]` | occupancy classes to skip |
| `undergrowth` | object | `{"grass": 0.35, "flowers": 0.05, "deadwood": 0.02}` | |
| `snowLine` | int | absent | above this Y, add `@foliage.snow_layer` |

`species` entries: `{ id, weight, shape, minHeight, maxHeight, trunkPalette,
leafPalette, radius, branchiness }`, where `shape` ∈ `spruce_tall`, `spruce_squat`,
`oak_round`, `oak_gnarled`, `birch_slim`, `jungle_giant`, `acacia_flat`,
`palm`, `dead_snag`, `mushroom`, `custom_l0`.

Uses only the `scatter` stream, position-keyed — so adding a species does not
move the trees of other species. Emits ops + occupancy.

---

#### `scatter.props@0`

Same masking machinery, for non-tree clutter: boulders, driftwood, crates,
lanterns, market stalls, rubble piles.

| Param | Type | Default |
|---|---|---|
| `props` | array of `{ id, weight, ops \| proto, footprint, alignToSlope }` | required |
| `density` | number | `0.05` |
| `nearTags` / `avoidTags` | string[] | `[]` / `["road"]` |
| `alongTags` | string[] | `[]` (bias placement to road edges, wall bases) |
| `clusterSize` | `[min,max]` | `[1,1]` |

---

#### `road.network@0`

Builds a road graph over anchor points and port stubs, then drapes surfaces.
Registers **route corridors** in pass 3 (so `along` works, §4.4) and refines
centerlines in pass 6.

| Param | Type | Default | Meaning |
|---|---|---|---|
| `anchors` | selector[] | required | nodes/ports the network must reach |
| `pattern` | enum | `organic` | `grid`, `organic`, `radial`, `ribbon`, `minimal_spanning` |
| `hierarchy` | array | see below | road classes, widest first |
| `blockSize` | `[x,z]` | `[24, 24]` | grid pattern only |
| `maxGrade` | number | `0.25` | |
| `bridgeThreshold` | int | `3` | span water/gaps wider than this with a bridge |
| `tunnelThreshold` | int | `12` | cut through terrain taller than this |
| `junctionStyle` | enum | `plain` | `plain`, `plaza`, `roundabout`, `stairs` |
| `curvature` | number 0..1 | `0.3` | organic wander |
| `crown` | int | `0` | raise the road surface above grade |
| `lighting` | object | `{"spacing": 12, "symbol": "@light.wall"}` | |

`hierarchy` entries: `{ class, width, surface, edge, maxGrade, connects }` —
e.g. `[{class:"main", width:7, surface:"@road.surface"}, {class:"lane", width:3,
surface:"@path.surface"}]`.

Emits ops + a road graph consumed by `along` constraints and by the connectivity
validator (`LOAM-W430 DISCONNECTED_ROAD_GRAPH`).

---

#### `cave.carver@0`

Subtractive. Runs with `csg.mode: "carve"`.

| Param | Type | Default | Meaning |
|---|---|---|---|
| `style` | enum | `worm` | `worm`, `cheese`, `spaghetti`, `ravine`, `chamber_network`, `lava_tube` |
| `density` | number 0..1 | `0.3` | |
| `radius` | `[min,max]` | `[2, 5]` | |
| `yRange` | `[min,max]` | `[-56, 50]` | absolute world Y |
| `verticality` | number 0..1 | `0.3` | how much the worms climb/dive |
| `chambers` | object | absent | `{count, radius, spacing}` large caverns |
| `lavaLevel` | int | `-48` | fill below this with `@liquid.lava`; `null` disables |
| `waterTable` | int | absent | fill below this with water |
| `decorate` | bool | `true` | dripstone, glow lichen, gravel floors from the style |
| `surfaceOpenings` | int | `0` | number of cave mouths to force to daylight; registers `@terrain:cave_mouth` |
| `protectTags` | string[] | `["building","foundation"]` | never carve into these occupancies |

`protectTags` is the field that keeps caves from eating the town's foundations —
carving respects occupancy claimed by higher-precedence nodes.

---

#### `building.grammar@0`

The parameterized building generator. Footprint → massing → floors → facade →
roof, each stage seeded from the `grammar` stream.

| Param | Type | Default | Meaning |
|---|---|---|---|
| `floors` | int 1..24 | `2` | |
| `floorHeight` | int | from `style.scale.floorHeight` (`4`) | |
| `footprint` | enum | from `style.motifs.footprintStyle` | `rect`, `l_shape`, `t_shape`, `u_shape`, `cross`, `courtyard`, `irregular` |
| `bays` | int | `auto` | facade module count on the long side |
| `roof` | enum | from `style.motifs.roofType` | see §2.4 |
| `roofPitch` | number | `1.0` | rise per run |
| `wallSymbol` / `trimSymbol` / `roofSymbol` | symbol | `@wall` / `@trim` / `@roof` | palette overrides |
| `windowRhythm` | enum | from style | §2.4 |
| `windowRatio` | number 0..1 | `0.35` | glazed fraction of the facade |
| `entrance` | object | `{"port": "door", "porch": false, "steps": true}` | |
| `interior` | enum | `rooms` | `none` (solid shell), `open`, `rooms`, `hall`, `warehouse` |
| `furnish` | number 0..1 | `0.4` | interior prop density |
| `basement` | int | `0` | floors below grade; auto-creates a `tunnel_stub`-capable cellar when > 0 |
| `tower` | object | absent | `{count, height, placement}` corner/central towers |
| `variance` | number 0..1 | `0.3` | how far this instance may drift from the archetype — the "unique but similar" knob for `repeat` |
| `decayOverride` | number | from style | |

Ports honored: `door`, `gate`, `arch`, `window`, `tunnel_stub` (requires
`basement ≥ 1`), `stair_top`, `stair_bottom`, `road_stub`. Emits ops + resolved
ports + occupancy + `markers` (`entrance`, `ridge`, `interior_center`).

---

#### `settlement.layout@0` (`emitsChildren: true`)

The "generate a whole town from creative guidance" generator from
`rough-vision.txt`. Emits **child nodes**, not voxels: plots, a road network
node, and per-plot `building.grammar` children — which then go through the normal
solve/expand pipeline and can be individually overridden.

| Param | Type | Default | Meaning |
|---|---|---|---|
| `population` | int | `20` | approximate building count |
| `pattern` | enum | from `style.motifs.settlementPattern` | §2.4 |
| `mix` | array | see below | building-type distribution |
| `plotSize` | `[min,max]` per axis | `[[7,14],[7,14]]` | |
| `roadParams` | object | `{}` | passed to `road.network@0` |
| `wall` | object | absent | `{enabled, thickness, height, gates}` — perimeter wall with gate ports |
| `plaza` | object | `{"count": 1, "size": [24, 24]}` | |
| `farmland` | number 0..1 | `0.15` | fraction of the envelope given to fields |
| `density` | number 0..1 | `0.5` | packing tightness |
| `landmarkSlots` | int | `0` | reserved empty plots, exposed as `socket` ports for the planner to fill with assets |

`mix` entries: `{ archetype, weight, params }` where `archetype` names a
prototype or a `building.grammar` param preset (`cottage`, `longhouse`, `shop`,
`smithy`, `inn`, `chapel`, `warehouse`, `tower_house`).

`landmarkSlots` is the important one for the agent architecture: the planner can
say "lay out a town of 30 buildings and leave me two landmark plots", then attach
the cat-cathedral asset to a slot without hand-placing anything.

---

#### `water.body@0`

| Param | Type | Default |
|---|---|---|
| `kind` | enum | `lake` — `lake`, `river`, `pond`, `waterfall`, `fjord_inlet` |
| `level` | int | `seaLevel` |
| `depth` | `[min,max]` | `[2, 8]` |
| `bankMaterial` | symbol | `@ground.beach` |
| `flow` | bool | `false` (rivers/waterfalls) |
| `width` | `[min,max]` | `[6, 16]` (river) |

---

#### Planned, not in v0

Listed so agents know not to reference them: `wall.perimeter@0`,
`farm.field@0`, `ruin.decay@0`, `interior.rooms@0`, `bridge.span@0`,
`mine.shafts@0`, `dungeon.rooms@0`, `vegetation.reef@0`.

### 7.6 Authored generators

```json
{ "kind": "generator", "generator": "authored:cyborg_unicorn_dealership",
  "source": "generators/cyborg_unicorn_dealership.gen.ts",
  "params": { "lotSize": [30, 40], "unicornCount": 8 } }
```

An authored generator is a TypeScript module exporting a `Generator<P>`. It is
type-checked, lint-checked against the sandbox rules, and executed under §7.4.
Per `DESIGN.md`, each authored generator carries render tests; the compiler
refuses to run one whose declared `paramSchema` does not validate.

This is the controlled version of on-the-fly spec extension: an agent can invent
a whole new class of structure without touching the language.

### 7.7 Generator determinism obligations

Restating §6.5 as generator-author rules: use `ctx.rng(name)` with a **named
stream per subsystem**; use `ctx.hash(...)` for anything positional; never
iterate a `Set`/`Map` built in nondeterministic order; never branch on
`ctx.log`; never accumulate floats over unordered collections; return ops in a
deterministic order (the compiler sorts by op index anyway, but stable output
makes goldens diffable).

### 7.8 The decorate pass hook

```json
"decorate": [
  { "generator": "scatter.props@0", "params": { "density": 0.08 } },
  { "generator": "scatter.forest@0", "params": { "species": [], "density": 0.02 } }
]
```

Decorate invocations are ordinary generators run in pass 7 with
`csg.precedence: 40` and read-only access to the merged voxel field and the
occupancy map. They may not carve, may not move anything, and are skipped
silently if the budget is exhausted — decoration is the one thing that degrades
rather than fails. `[C:med]`

### 7.9 Budgets

```json
"budget": { "maxOps": 2000000, "maxBlocks": 40000000, "fuel": 50000000, "maxChildren": 256 }
```

Inherited down the tree; a child may only shrink its budget, never grow it
(`LOAM-E195`). Exhaustion is `LOAM-E196 BUDGET_EXCEEDED`, except in the decorate
pass (warning `LOAM-W197`, output truncated deterministically by op index).

---

## §8 L0 — Voxel IR

Everything compiles to L0: palette-symbol block placements and CSG ops. It is
rarely hand-written; it exists so nothing is magic.

### 8.1 Coordinate spaces `[C:high]`

- **Node-local**: origin `(0,0,0)` at the envelope's min corner, axes aligned to
  Minecraft's (+X east, +Y up, +Z south). All L0 ops are expressed here.
- **World**: Minecraft absolute coordinates, Y ∈ `[-64, 320)`.
- The compiler transforms local → world exactly once per node, using the
  placement from pass 3.

Transform composition down the tree:

```
T_world(node) = T_world(parent) ∘ T_local(node)
T_local(node) = translate(offset_in_parent) ∘ rotY(yaw) ∘ mirrorX?
```

Because every component is an integer translation, a 90° yaw, or an axis mirror,
composition is exact in integer arithmetic — no floating point, no resampling,
no accumulation error at depth 12. A node's voxels are the same voxels wherever
it lands. `[C:high]`

Ops that fall outside the node's envelope (plus `grow` allowance) are **clipped**
and reported as `LOAM-W151 OP_CLIPPED`; clipping rather than failing keeps a
small bug from voiding a whole world, but the diagnostic gates the repair loop.

### 8.2 The op set

Every op shares these fields:

| Field | Type | Default | Meaning |
|---|---|---|---|
| `op` | enum | required | op name |
| `block` | symbol or block spec | `"@wall"` | what to write (§8.3) |
| `mode` | `replace`\|`keep`\|`carve`\|`blend` | inherited from node `csg.mode` | per-op override |
| `filter` | symbol/block/`"solid"`/`"air"`/`"natural"`/`"liquid"` | absent | only affect blocks matching this |
| `hollow` | bool or int | `false` | shell-only; int = wall thickness |
| `state` | object | absent | blockstate overrides merged over the palette entry |
| `axis`/`facing` | enum | absent | for directional blocks (logs, stairs); `"auto"` derives from op geometry |
| `jitter` | number 0..1 | `0` | position-keyed probability of skipping a block — cheap roughening |

**Primitive ops:**

| Op | Fields | Meaning |
|---|---|---|
| `fill` | `from: [x,y,z]`, `to: [x,y,z]` | inclusive axis-aligned box |
| `prism` | `footprint: [[x,z],…]`, `yMin`, `yMax` | extruded simple polygon |
| `sphere` | `center`, `radius` \| `radii: [rx,ry,rz]` | ellipsoid |
| `cylinder` | `center`, `radius`, `height`, `axis: "x"\|"y"\|"z"` | |
| `cone` | `base`, `radius`, `height`, `axis`, `taper` | cones and spires; `taper: 0` is a full cone |
| `line` | `from`, `to`, `thickness` | 3D Bresenham with a thickness kernel |
| `brush` | `polyline: [[x,y,z],…]`, `radius`, `profile: "round"\|"square"\|"flat"`, `taper` | swept stroke — the tunnel/river/branch op |
| `heightfield` | `origin: [x,z]`, `size: [w,d]`, `data: Int16Array\|encoded`, `surface`, `subsurface`, `depth` | bulk terrain; one op instead of millions |
| `voxels` | `origin`, `size`, `data` (RLE-encoded palette indices), `palette: string[]` | asset output and `.schem` import (§9) |
| `place` | `at: [x,y,z]` | single block, with full `state` control |
| `replace` | `from`, `to`, `match`, `block` | region-scoped substitution (used by decay/moss passes) |
| `light` | `at`, `level` | a lighting hint, not a block — consumed by pass 8 |
| `marker` | `at`, `name` | names a point for later passes (spawn, port anchors, plaza center) |

**CSG ops** take a `children` array of ops and combine their *masks*:

| Op | Meaning |
|---|---|
| `union` | write where any child writes; later children win within the group |
| `intersect` | write only where **all** children would write |
| `carve` | subtract children 2..n from child 1 (write air) — the `DESIGN.md` "carve" primitive |
| `difference` | alias of `carve` |
| `group` | no boolean effect; scopes a shared `mode`/`block`/transform to its children |
| `transform` | `translate`, `rotY`, `mirror` applied to children; integer/90° only |

Example — a hollow dome with a doorway carved out:

```json
{ "op": "carve", "children": [
  { "op": "sphere", "center": [16, 0, 16], "radius": 16, "hollow": 2, "block": "@wall" },
  { "op": "fill", "from": [14, 0, 0], "to": [18, 4, 3], "block": "@air" }
] }
```

### 8.3 Palette symbol resolution

A `block` value is one of:

| Form | Meaning |
|---|---|
| `"@wall"` | palette symbol; resolved via the node's style with dot-fallback (§2.2) |
| `"@wall:stairs"` | the `stairs` form of the symbol's family (§2.3) |
| `"@air"` / `"@void"` | reserved: air, and the carve marker |
| `"minecraft:stone"` | a literal block id — **allowed but discouraged**; lint `LOAM-W213 LITERAL_BLOCK` fires outside `primitive` nodes, because literals defeat re-skinning |
| `{ "block": …, "state": … }` | inline block spec |

Resolution happens at **CSG merge time**, not at generator time. The generator
emits `@wall`; the merger resolves it against the emitting node's resolved style,
then picks the weighted variant using
`hash(nodeSeed, "palette", symbol, x, y, z)` in world coordinates. Consequences:

- Re-skinning a world costs zero recompilation of generator logic.
- Variant texture is stable under rotation of *other* nodes and under parallel
  compilation.
- Two adjacent nodes with different styles meet cleanly at their boundary.

`state` merging order, lowest to highest: family/form defaults → palette entry
`state` → op `state` → auto-derived directional properties (`facing`, `axis`,
`half`, `shape`, `waterlogged`).

**Waterlogging** is derived, not authored: any non-full block written into a
column below the water level gets `waterlogged=true` if the block supports it.
`[C:med]`

### 8.4 Merge semantics

Pass 5 walks all ops in a total order — `(csg.precedence, depth, solver order,
nodePath, op index)` — and applies each to the voxel field:

| `mode` | Rule |
|---|---|
| `replace` | write unconditionally |
| `keep` | write only if the target is currently `air` |
| `carve` | write `air` (or the `@void` marker, which resolves to air at emit) |
| `blend` | write only if the target was written by a strictly lower-precedence node **and** is tagged `natural` (terrain output) — this is how a building sits into a hillside without erasing a neighbor |

`filter` further restricts: `{"filter": "natural"}` affects only terrain-written
blocks; `{"filter": "@liquid.water"}` only water.

Occupancy: every write records its owning `nodePath` in a parallel array. That
is what powers `avoidTags`, `protectTags`, decorate masking, and the "floating
structure" lint.

### 8.5 Why the IR is deliberately small

Eleven primitives plus six CSG ops covers everything the stdlib needs, and the
two bulk ops (`heightfield`, `voxels`) carry the volume so the op stream stays
small — a 512×512 terrain is one op, not 12 million. Anything more expressive
belongs in L1, where it can be tested. L0 exists to be *obvious*, and to be the
single place where "what block goes here" is finally decided.

---

## §9 Asset nodes

`kind: "asset"` is an AI-generated mesh voxelized into blocks. Per `DESIGN.md`
the pipeline lands at G6, but **the interface exists from day one** so it is
never bolted on — and so that pre-G6 compiles degrade gracefully via `fallback`.

### 9.1 Full shape

```json
{
  "id": "cathedral_of_the_cat",
  "kind": "asset",
  "label": "Cathedral shaped like a seated cat, wings folded, eyes of stained glass",
  "envelope": { "shape": "box", "size": [80, 60, 80] },
  "params": {
    "prompt": "a colossal seated cat carved as a gothic cathedral, folded stone wings, arched doorway at the chest, weathered granite",
    "negativePrompt": "modern, cartoon, text, floating parts",
    "role": "shell",
    "sizeMode": "fit",
    "front": "south",
    "symmetry": "bilateral_x",
    "detail": 0.7,
    "paletteHints": {
      "strategy": "style_first",
      "colorMap": [
        { "hex": "#8a8f8b", "symbol": "@wall" },
        { "hex": "#4d5150", "symbol": "@wall.accent" },
        { "hex": "#f2c14e", "symbol": "@glass" }
      ],
      "restrictTo": ["@wall", "@wall.accent", "@trim", "@glass", "@roof"],
      "emissiveSymbol": "@light"
    },
    "shell": {
      "thickness": 3,
      "interiorPadding": 1,
      "minCavityVolume": 8000,
      "cavitySelect": "largest",
      "exposeInterior": true,
      "floorLevels": [0, 18, 36]
    },
    "fallback": { "generator": "building.grammar@0",
                  "params": { "floors": 5, "roof": "spire", "footprint": "cross" } },
    "provider": { "name": "tripo", "model": "tripo-v3", "polish": true },
    "pin": null
  },
  "ports": {
    "main_door": { "type": "gate", "face": "south", "at": "center",
                   "width": 5, "height": 8, "cut": true }
  },
  "children": []
}
```

### 9.2 Prompt & generation params

| Field | Type | Default | Meaning |
|---|---|---|---|
| `prompt` | string | required | the mesh prompt. The compiler **augments** it with style context (§9.3) before calling the provider |
| `negativePrompt` | string | `""` | |
| `provider` | object | `{"name":"tripo"}` | `name`, `model`, plus provider options; the model id is pinned in the lockfile |
| `detail` | 0..1 | `0.5` | mesh detail / poly budget request |
| `symmetry` | enum | `none` | `none`, `bilateral_x`, `bilateral_z`, `radial` — enforced *after* voxelization by mirroring the dominant half, which fixes the "one ear is lumpy" failure mode `[C:med]` |
| `variants` | int | `1` | request N meshes and pick deterministically by `hash(nodeSeed,"asset")`; costs N× |

### 9.3 Prompt augmentation `[C:med]`

The prompt sent to the provider is assembled deterministically:

```
<params.prompt>
Style: <style.era>, <style.mood joined>. Motifs: <style.motifs.architecture joined>.
Form: single connected solid, <symmetry>, front facing viewer, no base plate, no text.
Proportions: fits a <X>×<Y>×<Z> block bounding box.
```

Deterministic assembly matters because the *prompt string* is part of the asset
cache key (§9.8). Node `label` is appended when present; `hints` never are.

### 9.4 `role` — the boolean role

| `role` | Meaning |
|---|---|
| `solid` | voxelized mesh is written as blocks. The default; statues, ships, trees, monuments |
| `shell` | mesh is voxelized, then **hollowed** by inward offset; the cavity becomes an envelope children fill (§9.5) |
| `carve` | mesh is used only as a *subtractive mask* against whatever is already there — carve a cat-shaped hole in a cliff, a cave in the shape of a skull |

`role` is the single field that turns "a giant ice-cream cone" into "a museum
inside a giant ice-cream cone", which is why `DESIGN.md` calls it a compiler
feature rather than a hack.

### 9.5 Shell interiors `[C:high]` (the ice-cream-cone case)

For `role: "shell"`, after voxelization:

1. **Solidify** — fill the mesh's interior to get a closed solid `S`.
2. **Erode** — compute `I = erode(S, thickness)`, the inward offset. `I` is the
   candidate cavity; `S \ I` is the wall shell that gets blocks.
3. **Select** — find connected components of `I`; keep per `cavitySelect`
   (`largest` | `all` | `lowest` | `named`). Components below
   `minCavityVolume` are discarded (they become solid wall).
4. **Publish** — the selected cavity is exposed as a **voxel-mask envelope**
   named `<nodePath>#interior`, and — if `exposeInterior: true` — as an implicit
   `interior` port (§5.3).
5. **Fill** — the asset node's `children` are solved *inside that mask*, not
   inside a box. Children get an implicit `inside_shell: "^"` constraint, and the
   solver's domain is the cavity's voxel occupancy.
6. **Level** — `floorLevels` (node-local Y values) inserts floor slabs across the
   cavity at those heights, turning an organic blob into usable storeys. Each
   floor is exposed as a sub-region `#interior@level0`, `#interior@level1`, … so
   children can say `{"within": "^#interior@level1"}`.

| `shell` field | Type | Default | Meaning |
|---|---|---|---|
| `thickness` | int | `2` | wall thickness in blocks |
| `interiorPadding` | int | `1` | extra inset before children may occupy |
| `minCavityVolume` | int | `512` | discard smaller pockets |
| `cavitySelect` | enum | `largest` | `largest`, `all`, `lowest`, `named` |
| `exposeInterior` | bool | `true` | publish the `interior` port |
| `floorLevels` | int[] | `[]` | node-local Y of inserted floors |
| `floorSymbol` | symbol | `@floor` | |
| `stairwell` | bool | `true` | auto-generate vertical circulation between floors, with `stair_top`/`stair_bottom` ports |
| `sealBottom` | bool | `true` | close the cavity's underside so the interior isn't open to terrain |

Failure modes are explicit rather than silent: a shell with no cavity above
`minCavityVolume` is `LOAM-E310 NO_INTERIOR_CAVITY`; children that don't fit the
cavity go through the normal relaxation ladder (§4.6) and may be dropped if
`optional`.

### 9.6 Ports on assets

Nobody knows the mesh's geometry until it exists, so asset ports are resolved by
a **post-voxelization cutting pass**:

1. Ray-march inward from the declared `face` at the declared `at` position until
   solid shell is hit.
2. Cut an opening of `width × height` through the shell (following the surface
   normal, so it stays a doorway and not a slot).
3. Frame it with `@window_frame`/`@trim`, and place a door from `@door` for
   `door`/`gate` types.
4. Register the resolved port at the *inner* face of the cut.

`cut: true` (default for `door`, `gate`, `arch`, `tunnel_stub` on assets) makes
this mandatory; `cut: false` asserts the mesh already has an opening there and
lints if it doesn't (`LOAM-W422 EXPECTED_OPENING_MISSING`). This guarantees the
cathedral has a door regardless of what the mesh generator produced.

### 9.7 `fallback` — pre-G6 and failure behavior `[C:high]`

```json
"fallback": { "generator": "building.grammar@0",
              "params": { "floors": 5, "roof": "spire", "footprint": "cross" } }
```

Used when: the asset pipeline is unavailable (`requires.assets` unmet, pre-G6),
the provider errors after retries, voxelization fails validation, or
`--no-assets` is passed. The node compiles as if it were
`{"kind": "generator", …fallback}` with the same envelope, ports, tags, and
style, and emits `LOAM-W301 ASSET_FALLBACK_USED`.

Every asset node SHOULD declare a fallback; the validator warns
(`LOAM-W302 NO_ASSET_FALLBACK`) if it doesn't. This is what keeps G4/G5 worlds
compiling while the asset pipeline is still being built, and what keeps a
provider outage from failing a paid customer's world.

### 9.8 Determinism & the asset lockfile `[C:high]`

External mesh generation is **not** deterministic. Loam confines the
nondeterminism to one artifact.

```
assetCacheKey = BLAKE3( canonical({
  promptAugmented, negativePrompt, provider, detail, symmetry, variants,
  role, sizeMode, size, front, shell, paletteHints,
  voxelizerVersion, blockDataVersion, nodeSeed
}) )
```

`assets.lock.json`:

```json
{ "loam": "0.1", "kind": "asset-lock",
  "entries": {
    "b3:7f21…": { "provider": "tripo/tripo-v3",
                  "meshSha256": "…", "schemSha256": "…",
                  "path": "assets/b3-7f21….schem",
                  "size": [78, 60, 74] } }
}
```

Rules:

1. Cache hit → the `.schem` is used; no provider call; fully deterministic.
2. Cache miss with a lockfile entry but a missing artifact → hard error
   `LOAM-E311 ASSET_ARTIFACT_MISSING` (never silently regenerate: it would
   change the world).
3. Cache miss with no entry → call the provider, voxelize, write the artifact,
   append the entry. **This compile is not reproducible until the lock is
   committed** — the manifest records `assetsResolved: false`.
4. `params.pin: "b3:7f21…"` forces a specific artifact regardless of the
   computed key — how you keep a mesh you liked while editing the prompt text.
5. Sponge `.schem` is the interchange format, per `DESIGN.md` (free WorldEdit
   compatibility, and a human can open one).

The honest statement of the determinism guarantee: **given the asset lockfile,
the whole compile is byte-identical; without it, everything except asset voxels
is.**

### 9.9 Voxelization & block matching

Fixed pipeline, versioned as `voxelizerVersion` (part of the cache key):

1. **Normalize** — center the mesh, orient `front` to local −Z, scale per
   `sizeMode`: `fit` (uniform scale to fit the envelope, preserving aspect),
   `exact` (non-uniform stretch to exactly fill), `scaleToFit` (uniform, may
   under-fill), `preserveScale` (use `size` as literal blocks, may clip).
2. **Rasterize** — three-axis raycasting into the voxel grid; a voxel is solid
   if ≥2 of 3 axis tests report interior (majority vote kills most leaks).
3. **Repair** — flood-fill from outside to find true exterior; anything
   unreachable is interior. Fill pinholes below `hollowTolerance` (default 8
   voxels).
4. **Sample color** — per solid voxel, average the mesh's surface albedo within
   its cell; interior voxels inherit the nearest surface color.
5. **Match blocks** — per `paletteHints.strategy`:
   - `style_first` (default): match only within `restrictTo` symbols, in
     CIEDE2000 over the style's resolved blocks. Keeps assets in-palette at the
     cost of color fidelity — usually the right trade for coherence.
   - `color_first`: match against the full block-color table, then snap to the
     nearest style symbol only if within `snapThreshold`.
   - `explicit`: use `colorMap` only; unmatched → `@wall`.
6. **Post-process** — apply `symmetry`; strip disconnected floaters below
   `minIslandVolume` (default 12); emit a `voxels` op (§8.2).

| `paletteHints` field | Type | Default |
|---|---|---|
| `strategy` | enum | `style_first` |
| `colorMap` | array of `{hex, symbol}` | `[]` (highest priority in all strategies) |
| `restrictTo` | symbol[] | all style symbols |
| `snapThreshold` | number | `18` (ΔE) |
| `emissiveSymbol` | symbol | `@light` (mesh emissive materials map here) |
| `transparentSymbol` | symbol | `@glass` |
| `dither` | bool | `false` (position-keyed ordered dithering between the two nearest matches) |

Block-color data comes from client-jar textures or an existing dataset (Mineways
et al.), versioned as `blockDataVersion`.

### 9.10 Interaction with the rest of the pipeline

| Pass | Asset behavior |
|---|---|
| 3 Layout | uses `envelope`; `shape: "auto"` takes `params.size` |
| 4 Expansion | cache lookup → voxelize → one `voxels` op; shell hollowing runs here; children re-enter pass 3 against the cavity mask |
| 5 CSG | default `precedence: 20`, `mode: "replace"`; `role: "carve"` forces `mode: "carve"` |
| 6 Connective | ports were cut in pass 4, so routing sees ordinary resolved ports |
| 7 Decorate | occupancy is the voxel mask, so scatter never grows a tree through the cat's face |

---

## §10 Worked examples

Three complete, valid Loam documents. Example A is a single file (the G2/G3
target). Example B shows multi-file modules and the contract handshake (G4).
Example C shows assets, shells, and the tunnel sentence (G5/G6).

### 10.1 Example A — "misty fjords with a black-sand coast"

Terrain only, one file, no structures. This is the G3 acceptance case.

**`fjords.loam.json`**

```json
{
  "loam": "0.1",
  "kind": "world",
  "meta": {
    "name": "Misty Fjords",
    "prompt": "misty fjords with a black-sand coast",
    "worldSeed": "0x5f3a19c2",
    "mcVersion": "26.2"
  },
  "requires": { "stdlib": ">=0.1", "assets": false },

  "style": {
    "id": "cold_basalt_coast",
    "era": "primitive",
    "mood": ["misty", "frozen", "grand"],
    "families": {
      "basalt": { "full": "minecraft:basalt", "stairs": "minecraft:polished_basalt",
                  "slab": "minecraft:smooth_basalt", "wall": "minecraft:cobblestone_wall" }
    },
    "palettes": {
      "ground.surface": [
        { "block": "minecraft:grass_block", "w": 6 },
        { "block": "minecraft:podzol", "w": 3 },
        { "block": "minecraft:moss_block", "w": 1 }
      ],
      "ground.subsurface": [
        { "block": "minecraft:coarse_dirt", "w": 3 },
        { "block": "minecraft:dirt", "w": 2 }
      ],
      "ground.deep": "minecraft:deepslate",
      "ground.cliff": [
        { "block": "minecraft:stone", "w": 5 },
        { "block": "minecraft:andesite", "w": 3 },
        { "block": "minecraft:tuff", "w": 2 },
        { "block": "minecraft:mossy_cobblestone", "w": 1,
          "when": { "yBelow": 12, "nearWater": 6 } }
      ],
      "ground.beach": [
        { "block": "minecraft:blackstone", "w": 6 },
        { "block": "minecraft:gravel", "w": 3 },
        { "block": "minecraft:black_concrete_powder", "w": 2 },
        { "block": "minecraft:basalt", "w": 1 }
      ],
      "liquid.water": "minecraft:water",
      "liquid.surface_ice": "minecraft:ice",
      "foliage.log": "minecraft:spruce_log",
      "foliage.leaves": "minecraft:spruce_leaves",
      "foliage.grass": [
        { "block": "minecraft:short_grass", "w": 6 },
        { "block": "minecraft:fern", "w": 4 }
      ],
      "foliage.flower": [
        { "block": "minecraft:blue_orchid", "w": 2 },
        { "block": "minecraft:lily_of_the_valley", "w": 3 }
      ],
      "decor.rubble": "minecraft:cobblestone",
      "decor.moss": "minecraft:moss_carpet"
    },
    "biomeThemes": {
      "black_shore": {
        "biome": "minecraft:stony_shore",
        "palettes": { "ground.surface": { "$replace": true,
                      "block": "minecraft:blackstone" } },
        "where": { "elevation": [-2, 4], "distanceToWater": [0, 6] },
        "priority": 10,
        "climate": { "temperature": -0.3, "humidity": 0.8 },
        "weather": { "precipitation": "rain", "fogDensity": 0.8 },
        "scatter": [
          { "generator": "scatter.props@0",
            "params": { "density": 0.03,
                        "props": [
                          { "id": "driftwood", "weight": 3, "footprint": [3, 1],
                            "ops": [{ "op": "line", "from": [0,0,0], "to": [2,0,1],
                                      "thickness": 1, "block": "@foliage.log" }] },
                          { "id": "boulder", "weight": 5, "footprint": [3, 3],
                            "ops": [{ "op": "sphere", "center": [1,0,1], "radius": 2,
                                      "block": "@ground.cliff" }] }
                        ] } }
        ]
      },
      "fjord_slope": {
        "biome": "minecraft:grove",
        "where": { "elevation": [4, 88], "slope": [0, 42] },
        "climate": { "temperature": -0.2, "humidity": 0.7 },
        "weather": { "precipitation": "rain", "fogDensity": 0.7 },
        "scatter": [
          { "generator": "scatter.forest@0",
            "params": {
              "density": 0.17, "spacing": 3, "clumping": 0.55,
              "maxSlope": 34, "elevation": [5, 80], "edgeFalloff": 10,
              "species": [
                { "id": "spruce_tall", "weight": 6, "shape": "spruce_tall",
                  "minHeight": 9, "maxHeight": 17, "radius": 2 },
                { "id": "spruce_squat", "weight": 3, "shape": "spruce_squat",
                  "minHeight": 5, "maxHeight": 8, "radius": 3 },
                { "id": "snag", "weight": 1, "shape": "dead_snag",
                  "minHeight": 4, "maxHeight": 9, "radius": 1 }
              ],
              "undergrowth": { "grass": 0.4, "flowers": 0.06, "deadwood": 0.03 }
            } }
        ]
      },
      "high_crag": {
        "biome": "minecraft:jagged_peaks",
        "palettes": { "ground.surface": { "$replace": true,
                      "block": "minecraft:snow_block" } },
        "where": { "elevation": [88, 400] },
        "climate": { "temperature": -0.9, "humidity": 0.4 },
        "weather": { "precipitation": "snow" },
        "scatter": []
      },
      "cliff_face": {
        "biome": "minecraft:windswept_gravelly_hills",
        "where": { "slope": [42, 90] },
        "priority": 5,
        "climate": { "temperature": -0.4, "humidity": 0.6 },
        "scatter": []
      }
    },
    "lighting": { "mobproofInteriors": false }
  },

  "root": {
    "id": "world",
    "kind": "composite",
    "label": "A drowned mountain range: deep water inlets between steep walls",
    "envelope": { "shape": "region", "size": [1024, 1024],
                  "yMin": -64, "yMax": 200, "anchor": "absolute" },
    "layout": "free",
    "children": [
      {
        "id": "landform",
        "kind": "generator",
        "generator": "terrain.heightfield@0",
        "label": "Ridged fjord terrain: sharp ridges, deep glacial troughs",
        "envelope": "inherit",
        "tags": ["terrain"],
        "params": {
          "seaLevel": 63,
          "baseHeight": 58,
          "amplitude": 88,
          "octaves": 6,
          "frequency": 0.0026,
          "lacunarity": 2.1,
          "gain": 0.48,
          "ridged": true,
          "warp": { "amount": 34, "frequency": 0.0016 },
          "erosionPasses": 3,
          "curve": [[0.0, -0.55], [0.34, -0.18], [0.42, 0.02],
                    [0.55, 0.30], [0.78, 0.78], [1.0, 1.0]],
          "continentalness": { "frequency": 0.0007, "seaFraction": 0.42 },
          "cliffThreshold": 46,
          "soilDepth": 3,
          "beachWidth": 5,
          "underwaterMaterial": "@ground.beach",
          "waterFill": true,
          "bedrock": true
        },
        "note": "curve is the fjord shape: a long flat trough below sea level, then a hard shoulder at 0.42 that produces near-vertical walls"
      },
      {
        "id": "climate",
        "kind": "generator",
        "generator": "terrain.climate@0",
        "envelope": "inherit",
        "tags": ["terrain"],
        "params": {
          "temperatureFrequency": 0.0009,
          "humidityFrequency": 0.0013,
          "blendRadius": 10,
          "latitudeGradient": -0.35
        },
        "constraints": [{ "type": "after", "target": "^.landform" }]
      },
      {
        "id": "sea_caves",
        "kind": "generator",
        "generator": "cave.carver@0",
        "label": "Wave-cut caves and tubes at the waterline",
        "envelope": { "shape": "region", "size": [1024, 1024],
                      "yMin": 40, "yMax": 78, "anchor": "absolute" },
        "tags": ["cave"],
        "csg": { "mode": "carve", "precedence": 5 },
        "optional": true,
        "params": {
          "style": "worm",
          "density": 0.12,
          "radius": [2, 4],
          "yRange": [46, 72],
          "verticality": 0.15,
          "lavaLevel": null,
          "surfaceOpenings": 6,
          "decorate": true,
          "protectTags": []
        }
      },
      {
        "id": "deep_caves",
        "kind": "generator",
        "generator": "cave.carver@0",
        "envelope": { "shape": "region", "size": [1024, 1024],
                      "yMin": -60, "yMax": 44, "anchor": "absolute" },
        "tags": ["cave"],
        "csg": { "mode": "carve", "precedence": 5 },
        "params": {
          "style": "spaghetti",
          "density": 0.28,
          "radius": [2, 5],
          "yRange": [-56, 40],
          "verticality": 0.35,
          "chambers": { "count": 40, "radius": 14, "spacing": 90 },
          "lavaLevel": -48,
          "decorate": true
        }
      }
    ],
    "decorate": [
      { "generator": "scatter.props@0",
        "params": {
          "density": 0.012,
          "avoidTags": ["road", "building"],
          "props": [
            { "id": "erratic", "weight": 4, "footprint": [4, 4],
              "ops": [{ "op": "sphere", "center": [2, 0, 2], "radii": [2, 1, 2],
                        "block": "@ground.cliff", "jitter": 0.25 }] },
            { "id": "mossy_stump", "weight": 2, "footprint": [2, 2],
              "ops": [{ "op": "cylinder", "center": [1, 0, 1], "radius": 1,
                        "height": 2, "axis": "y", "block": "@foliage.log" },
                      { "op": "place", "at": [1, 2, 1], "block": "@decor.moss" }] }
          ]
        } }
    ]
  }
}
```

Notes on what this demonstrates:

- **No coordinates anywhere.** The only numbers are sizes, frequencies, and
  material weights.
- The black-sand coast is a *palette* decision (`ground.beach`), a *biome theme*
  (`black_shore`, priority 10 so it beats `fjord_slope` at the waterline), and a
  `beachWidth`. Three cheap knobs, no bespoke code.
- The blackstone-dominant beach mix is deliberate: `gravel` and
  `black_concrete_powder` are falling blocks, so they're minority weights over a
  non-falling base. A "black sand" palette of pure gravel would collapse into
  the water on first tick — exactly the kind of thing the deterministic
  validators should lint (`LOAM-W440 FALLING_BLOCK_UNSUPPORTED`).
- `after` is used as an ordering constraint between terrain generators. *(This
  is a gap — see §12 Q11: v0.1 as written has no `after` constraint. Either add
  it or make terrain ordering implicit by precedence. Recommendation: implicit,
  and drop this line.)*

### 10.2 Example B — small village with roads and ports

Two files: a world document and one module. Demonstrates the contract handshake,
route corridors, `repeat`, and port-driven roads.

**`village.loam.json`**

```json
{
  "loam": "0.1",
  "kind": "world",
  "meta": {
    "name": "Hollow Beck",
    "prompt": "a small medieval village in a river valley",
    "worldSeed": "hollow-beck-01",
    "mcVersion": "26.2"
  },
  "imports": { "mods": "modules/" },

  "style": {
    "id": "damp_medieval",
    "extends": ["std:medieval_timber"],
    "era": "medieval",
    "mood": ["cozy", "bustling"],
    "scale": { "floorHeight": 4, "doorWidth": 1 },
    "motifs": {
      "roofType": "gable",
      "windowRhythm": "regular",
      "ornamentDensity": 0.35,
      "footprintStyle": "rectilinear",
      "settlementPattern": "organic_radial"
    },
    "families": {
      "cobble": { "full": "minecraft:cobblestone",
                  "stairs": "minecraft:cobblestone_stairs",
                  "slab": "minecraft:cobblestone_slab",
                  "wall": "minecraft:cobblestone_wall" },
      "oak": { "full": "minecraft:oak_planks", "stairs": "minecraft:oak_stairs",
               "slab": "minecraft:oak_slab", "fence": "minecraft:oak_fence" }
    },
    "palettes": {
      "wall": "minecraft:white_terracotta",
      "wall.base": { "family": "cobble" },
      "beam": "minecraft:dark_oak_log[axis=y]",
      "floor": { "family": "oak" },
      "roof": [
        { "block": "minecraft:deepslate_tiles", "w": 5 },
        { "block": "minecraft:cracked_deepslate_tiles", "w": 2, "when": { "decay": [0.2, 1.0] } }
      ],
      "trim": { "family": "oak" },
      "glass": "minecraft:glass_pane",
      "door": "minecraft:oak_door",
      "light": { "block": "minecraft:lantern", "state": { "hanging": "true" } },
      "light.wall": "minecraft:lantern",
      "road.surface": [
        { "block": "minecraft:dirt_path", "w": 7 },
        { "block": "minecraft:coarse_dirt", "w": 2 },
        { "block": "minecraft:cobblestone", "w": 1 }
      ],
      "road.edge": "minecraft:cobblestone",
      "path.surface": "minecraft:dirt_path",
      "bridge.deck": { "family": "oak" },
      "bridge.rail": "minecraft:oak_fence"
    },
    "decay": { "level": 0.15, "modes": ["moss"] },
    "seal": ["palettes.roof", "palettes.wall", "era"]
  },

  "root": {
    "id": "world",
    "kind": "composite",
    "envelope": { "shape": "region", "size": [768, 768],
                  "yMin": -64, "yMax": 160, "anchor": "absolute" },
    "children": [
      {
        "id": "landform",
        "kind": "generator",
        "generator": "terrain.heightfield@0",
        "envelope": "inherit",
        "tags": ["terrain"],
        "params": {
          "seaLevel": 63, "baseHeight": 72, "amplitude": 26,
          "octaves": 4, "frequency": 0.0031, "ridged": false,
          "erosionPasses": 2, "soilDepth": 4, "beachWidth": 3
        }
      },
      {
        "id": "beck",
        "kind": "generator",
        "generator": "water.body@0",
        "label": "The stream the village is named for",
        "envelope": { "shape": "path", "width": 9 },
        "tags": ["river", "water"],
        "constraints": [
          { "within": "^" },
          { "terrain_conform": "drape" }
        ],
        "params": { "kind": "river", "width": [5, 9], "depth": [1, 3],
                    "flow": true, "bankMaterial": "@ground.beach" }
      },
      {
        "$module": "mods:hollow_beck.loam.json",
        "as": "hollow_beck",
        "contract": {
          "envelope": { "shape": "box", "size": [180, 48, 180],
                        "minSize": [140, 48, 140], "flexible": true },
          "ports": {
            "north_road": { "type": "road_stub", "face": "north", "width": 5 },
            "south_road": { "type": "road_stub", "face": "south", "width": 5 }
          },
          "styleRef": "world",
          "tags": ["settlement"],
          "sees": ["^.beck", "^.landform"],
          "tokenBudget": 8000
        }
      },
      {
        "id": "outlying_farms",
        "kind": "generator",
        "generator": "settlement.layout@0",
        "envelope": { "shape": "region", "size": [220, 220],
                      "yMin": 0, "yMax": 40, "anchor": "terrain" },
        "tags": ["settlement", "rural"],
        "optional": true,
        "emitsChildren": true,
        "constraints": [
          { "distance": "hollow_beck", "min": 60, "max": 200 },
          { "avoid": "@terrain:water", "margin": 8 },
          { "slope": [0, 12] },
          { "connected": "hollow_beck#north_road", "via": "path", "width": 2 }
        ],
        "params": {
          "population": 5,
          "pattern": "cluster",
          "density": 0.2,
          "farmland": 0.55,
          "plotSize": [[9, 16], [9, 16]],
          "mix": [
            { "archetype": "longhouse", "weight": 3 },
            { "archetype": "warehouse", "weight": 1,
              "params": { "floors": 1, "interior": "warehouse" } }
          ]
        }
      }
    ]
  }
}
```

**`modules/hollow_beck.loam.json`**

```json
{
  "loam": "0.1",
  "kind": "module",
  "contract": {
    "envelope": { "shape": "box", "size": [180, 48, 180],
                  "minSize": [140, 48, 140], "flexible": true },
    "ports": {
      "north_road": { "type": "road_stub", "face": "north", "width": 5 },
      "south_road": { "type": "road_stub", "face": "south", "width": 5 }
    },
    "styleRef": "world",
    "tags": ["settlement"],
    "sees": ["^.beck", "^.landform"],
    "tokenBudget": 8000
  },

  "prototypes": {
    "cottage": {
      "kind": "generator",
      "generator": "building.grammar@0",
      "envelope": { "shape": "box", "size": [8, 9, 10],
                    "minSize": [7, 8, 8], "maxSize": [11, 12, 13],
                    "flexible": true },
      "tags": ["building", "house", "facade"],
      "params": {
        "floors": 2, "footprint": "rect", "roof": "gable", "roofPitch": 1.0,
        "bays": 3, "windowRatio": 0.3, "interior": "rooms",
        "furnish": 0.45, "variance": 0.4
      },
      "ports": {
        "door": { "type": "door", "face": "auto", "width": 1, "height": 2,
                  "tags": ["primary"] }
      },
      "constraints": [
        { "terrain_conform": "cut_fill", "reference": "median", "blend": 3 },
        { "distance": "#tag:house", "min": 3 }
      ]
    }
  },

  "node": {
    "id": "hollow_beck",
    "kind": "composite",
    "label": "A village of about twenty buildings straddling the beck",
    "envelope": { "shape": "box", "size": [180, 48, 180],
                  "minSize": [140, 48, 140], "flexible": true },
    "layout": "free",
    "tags": ["settlement"],
    "constraints": [
      { "avoid": "@terrain:water", "margin": 2, "strength": "soft" },
      { "distance": "^.beck", "min": 0, "max": 40, "measure": "surface" },
      { "slope": [0, 16] }
    ],
    "ports": {
      "north_road": { "expose": "main_street#north_end" },
      "south_road": { "expose": "main_street#south_end" }
    },
    "children": [
      {
        "id": "main_street",
        "kind": "generator",
        "generator": "road.network@0",
        "label": "Main street with lanes branching to each plot",
        "envelope": { "shape": "path", "width": 7 },
        "tags": ["road", "infrastructure"],
        "csg": { "precedence": 15 },
        "constraints": [{ "terrain_conform": "drape" }],
        "ports": {
          "north_end": { "type": "road_stub", "face": "north", "width": 5 },
          "south_end": { "type": "road_stub", "face": "south", "width": 5 }
        },
        "params": {
          "anchors": ["self#north_end", "self#south_end",
                      "^.market_square", "^.chapel#door", "^.inn#door"],
          "pattern": "organic",
          "curvature": 0.35,
          "maxGrade": 0.2,
          "bridgeThreshold": 3,
          "junctionStyle": "plaza",
          "hierarchy": [
            { "class": "main", "width": 5, "surface": "@road.surface",
              "edge": "@road.edge" },
            { "class": "lane", "width": 2, "surface": "@path.surface",
              "connects": ["#tag:house"] }
          ],
          "lighting": { "spacing": 14, "symbol": "@light.wall" }
        }
      },
      {
        "id": "market_square",
        "kind": "composite",
        "label": "Open cobbled square with a well",
        "envelope": { "shape": "box", "size": [26, 6, 26], "flexible": true,
                      "minSize": [18, 6, 18] },
        "tags": ["plaza", "public"],
        "constraints": [
          { "adjacent_to": "^.main_street", "gap": [0, 1] },
          { "terrain_conform": "flatten", "reference": "median", "skirt": true },
          { "centered_in": "^", "strength": "soft", "weight": 2 }
        ],
        "ports": {
          "center": { "type": "socket", "face": "up", "at": "center",
                      "socketKind": "monument" }
        },
        "children": [
          {
            "id": "well",
            "kind": "primitive",
            "envelope": [5, 6, 5],
            "constraints": [{ "centered_in": "^" }],
            "params": { "ops": [
              { "op": "fill", "from": [0, 0, 0], "to": [4, 0, 4], "block": "@road.edge" },
              { "op": "fill", "from": [1, 0, 1], "to": [3, 1, 3], "block": "@wall.base" },
              { "op": "fill", "from": [2, 0, 2], "to": [2, 0, 2], "block": "@liquid.water" },
              { "op": "cylinder", "center": [2, 1, 2], "radius": 1, "height": 4,
                "axis": "y", "block": "@beam", "hollow": true },
              { "op": "fill", "from": [1, 5, 1], "to": [3, 5, 3], "block": "@roof" },
              { "op": "place", "at": [2, 4, 2], "block": "@light" }
            ] }
          }
        ]
      },
      {
        "id": "chapel",
        "kind": "generator",
        "generator": "building.grammar@0",
        "label": "Small stone chapel with a squat bell tower",
        "envelope": { "shape": "box", "size": [12, 18, 20] },
        "tags": ["building", "civic", "facade"],
        "constraints": [
          { "along": "^.main_street", "offset": [2, 5], "faceRoad": true },
          { "distance": "^.market_square", "max": 40 },
          { "terrain_conform": "cut_fill" },
          { "clearance": 4, "of": "self#door", "direction": "front" }
        ],
        "params": {
          "floors": 1, "floorHeight": 9, "footprint": "rect", "roof": "steep_gable",
          "roofPitch": 1.6, "bays": 4, "windowRhythm": "tall_narrow",
          "windowRatio": 0.4, "interior": "hall", "furnish": 0.3,
          "tower": { "count": 1, "height": 8, "placement": "front" },
          "variance": 0.1
        },
        "ports": {
          "door": { "type": "arch", "face": "south", "at": "center",
                    "width": 2, "height": 3, "tags": ["primary"] }
        }
      },
      {
        "id": "inn",
        "kind": "generator",
        "generator": "building.grammar@0",
        "label": "Two-storey inn with a covered porch on the square",
        "envelope": { "shape": "box", "size": [14, 12, 12] },
        "tags": ["building", "civic", "facade"],
        "constraints": [
          { "adjacent_to": "^.market_square", "gap": [1, 4] },
          { "facing": "^.market_square", "tolerance": 45 },
          { "terrain_conform": "cut_fill" }
        ],
        "params": {
          "floors": 2, "footprint": "l_shape", "roof": "gable", "bays": 5,
          "windowRatio": 0.35, "interior": "rooms", "furnish": 0.6,
          "entrance": { "port": "door", "porch": true, "steps": true },
          "variance": 0.15
        },
        "ports": {
          "door": { "type": "door", "face": "auto", "width": 2, "height": 3,
                    "tags": ["primary"] }
        }
      },
      {
        "$proto": "cottage",
        "as": "house",
        "with": {
          "repeat": {
            "count": 16,
            "idPattern": "house_{i:02}",
            "vary": { "floors": [1, 2], "bays": [2, 4], "roofPitch": [0.8, 1.3] }
          },
          "constraints": [
            { "along": "^.main_street", "offset": [2, 6], "spacing": 3 },
            { "terrain_conform": "cut_fill", "reference": "median", "blend": 3 },
            { "distance": "#tag:house", "min": 3 },
            { "align": "#tag:facade", "axis": "x", "mode": "front",
              "strength": "soft", "weight": 0.5 },
            { "clearance": 2, "of": "self#door", "direction": "front" }
          ]
        }
      },
      {
        "id": "footbridge",
        "kind": "generator",
        "generator": "building.grammar@0",
        "label": "Plank bridge over the beck",
        "envelope": { "shape": "box", "size": [4, 5, 16], "flexible": true },
        "tags": ["infrastructure"],
        "optional": true,
        "constraints": [
          { "adjacent_to": "^.main_street", "gap": [0, 2] },
          { "terrain_conform": "float" }
        ],
        "params": { "floors": 1, "interior": "none", "roof": "flat",
                    "wallSymbol": "@bridge.deck", "trimSymbol": "@bridge.rail" },
        "ports": {
          "north_end": { "type": "path_stub", "face": "north", "width": 2 },
          "south_end": { "type": "path_stub", "face": "south", "width": 2 }
        }
      }
    ],
    "decorate": [
      { "generator": "scatter.props@0",
        "params": {
          "density": 0.05,
          "alongTags": ["road"],
          "avoidTags": ["road", "building"],
          "clusterSize": [1, 3],
          "props": [
            { "id": "crate", "weight": 4, "footprint": [1, 1],
              "ops": [{ "op": "place", "at": [0, 0, 0], "block": "@decor.crate" }] },
            { "id": "barrel", "weight": 3, "footprint": [1, 1],
              "ops": [{ "op": "place", "at": [0, 0, 0], "block": "minecraft:barrel" }] },
            { "id": "flowerpot", "weight": 2, "footprint": [1, 1],
              "ops": [{ "op": "place", "at": [0, 0, 0], "block": "@decor.pot" }] }
          ]
        } }
    ]
  }
}
```

What this demonstrates:

- **The contract handshake.** The parent declares an envelope + two road stubs +
  a token budget; the module echoes it byte-for-byte. A different agent wrote
  the module without ever seeing the world file.
- **Route corridors.** `main_street` exists as a `path`-envelope node in pass 3,
  so 16 houses can be constrained `along` it before pass 6 knows the exact
  centerline.
- **`repeat` + `vary` + `variance`.** Sixteen houses, one prototype, ~15 lines.
  Each has a distinct `nodePath` → distinct seed → unique-but-similar, which is
  the residential-area requirement from `rough-vision.txt` solved structurally.
- **Ports flowing upward.** The village's `north_road` is just an alias for the
  road network's `north_end`, so the world-level connection to `outlying_farms`
  never needs to know how the village is built inside.
- **`seal`** on `palettes.roof`/`wall`/`era` — the planner locks the look, and
  the module author (a cheaper model) cannot drift it.

### 10.3 Example C — cat-shaped cathedral, tunnelled to the town hall

The G5 + G6 acceptance sentence, as one document. The cathedral is a `shell`
asset with rooms inside it; the tunnel is a first-class `connected` constraint.

**`cat_city.loam.json`**

```json
{
  "loam": "0.1",
  "kind": "world",
  "meta": {
    "name": "Bastet's Rest",
    "prompt": "ruined ancient city that worshipped cats as gods",
    "worldSeed": "0x0cae7a11",
    "mcVersion": "26.2"
  },
  "requires": {
    "loamFeatures": ["shell-interior-envelope", "voxel-mask-envelope"],
    "stdlib": ">=0.1",
    "generators": ["building.grammar@0", "road.network@0", "terrain.heightfield@0"],
    "assets": true
  },

  "style": {
    "id": "cat_cult_ancient",
    "era": "ancient",
    "mood": ["reverent", "ruined", "sunbaked"],
    "families": {
      "sandstone": { "full": "minecraft:smooth_sandstone",
                     "stairs": "minecraft:smooth_sandstone_stairs",
                     "slab": "minecraft:smooth_sandstone_slab",
                     "wall": "minecraft:sandstone_wall" },
      "deepslate_brick": { "full": "minecraft:deepslate_bricks",
                           "stairs": "minecraft:deepslate_brick_stairs",
                           "slab": "minecraft:deepslate_brick_slab",
                           "wall": "minecraft:deepslate_brick_wall" }
    },
    "palettes": {
      "wall": { "family": "sandstone" },
      "wall.accent": [
        { "block": "minecraft:cut_sandstone", "w": 5 },
        { "block": "minecraft:chiseled_sandstone", "w": 2 }
      ],
      "wall.base": { "family": "deepslate_brick" },
      "pillar": "minecraft:chiseled_sandstone",
      "floor": "minecraft:smooth_sandstone",
      "roof": "minecraft:cut_sandstone",
      "trim": "minecraft:cut_sandstone_slab",
      "glass": [
        { "block": "minecraft:orange_stained_glass", "w": 4 },
        { "block": "minecraft:yellow_stained_glass", "w": 3 },
        { "block": "minecraft:brown_stained_glass", "w": 2 }
      ],
      "light": "minecraft:lantern",
      "light.wall": "minecraft:torch",
      "ground.surface": [
        { "block": "minecraft:sand", "w": 6 },
        { "block": "minecraft:sandstone", "w": 3 },
        { "block": "minecraft:coarse_dirt", "w": 1 }
      ],
      "ground.subsurface": "minecraft:sandstone",
      "ground.deep": "minecraft:sandstone",
      "ground.cliff": "minecraft:sandstone",
      "road.surface": [
        { "block": "minecraft:smooth_sandstone", "w": 5 },
        { "block": "minecraft:cut_sandstone", "w": 3 },
        { "block": "minecraft:sand", "w": 2, "when": { "decay": [0.3, 1.0] } }
      ],
      "road.edge": "minecraft:sandstone_wall",
      "tunnel.wall": { "family": "deepslate_brick" },
      "tunnel.floor": "minecraft:polished_deepslate",
      "tunnel.support": "minecraft:dark_oak_fence",
      "decor.rubble": [
        { "block": "minecraft:sandstone", "w": 3 },
        { "block": "minecraft:sand", "w": 2 }
      ],
      "decor.banner": "minecraft:orange_banner"
    },
    "motifs": {
      "architecture": ["cat_effigy", "stepped_ziggurat", "colonnade",
                       "carved_lintel", "obelisk"],
      "roofType": "flat",
      "windowRhythm": "tall_narrow_paired",
      "ornamentDensity": 0.7,
      "symmetry": "bilateral",
      "massing": "vertical",
      "footprintStyle": "rectilinear",
      "settlementPattern": "grid"
    },
    "decay": { "level": 0.55, "modes": ["rubble", "missing_blocks", "moss"] },
    "scale": { "floorHeight": 5, "doorWidth": 2 },
    "tokens": { "cat_worship": 1.0, "banner_pattern": "cat_silhouette" },
    "lighting": { "interiorSpacingBlocks": 8, "targetInteriorLevel": 8,
                  "mobproofInteriors": true },
    "seal": ["era", "palettes.wall", "decay"]
  },

  "root": {
    "id": "world",
    "kind": "composite",
    "envelope": { "shape": "region", "size": [640, 640],
                  "yMin": -64, "yMax": 200, "anchor": "absolute" },
    "children": [
      {
        "id": "landform",
        "kind": "generator",
        "generator": "terrain.heightfield@0",
        "envelope": "inherit",
        "tags": ["terrain"],
        "params": {
          "seaLevel": 63, "baseHeight": 78, "amplitude": 22,
          "octaves": 4, "frequency": 0.0024, "erosionPasses": 2,
          "soilDepth": 5, "cliffThreshold": 50
        }
      },
      {
        "id": "old_town",
        "kind": "composite",
        "label": "The ruined sacred quarter, laid out on a grid around a plaza",
        "envelope": { "shape": "box", "size": [280, 90, 280],
                      "minSize": [220, 90, 220], "flexible": true,
                      "anchor": "terrain" },
        "tags": ["district", "sacred"],
        "layout": "free",
        "constraints": [
          { "slope": [0, 14] },
          { "centered_in": "^", "strength": "soft" }
        ],
        "children": [
          {
            "id": "plaza",
            "kind": "composite",
            "label": "Great processional plaza",
            "envelope": { "shape": "box", "size": [70, 8, 70], "flexible": true,
                          "minSize": [50, 8, 50] },
            "tags": ["plaza", "public"],
            "constraints": [
              { "terrain_conform": "flatten", "reference": "median", "skirt": true },
              { "centered_in": "^", "strength": "soft", "weight": 3 }
            ],
            "ports": {
              "center": { "type": "socket", "face": "up", "at": "center",
                          "socketKind": "monument" },
              "north_gate": { "type": "road_stub", "face": "north", "width": 7 },
              "south_gate": { "type": "road_stub", "face": "south", "width": 7 }
            },
            "children": [
              {
                "id": "obelisk",
                "kind": "primitive",
                "envelope": [3, 22, 3],
                "tags": ["monument"],
                "constraints": [{ "centered_in": "^" }],
                "params": { "ops": [
                  { "op": "fill", "from": [0, 0, 0], "to": [2, 0, 2], "block": "@wall.base" },
                  { "op": "fill", "from": [0, 1, 0], "to": [2, 17, 2], "block": "@pillar",
                    "jitter": 0.06 },
                  { "op": "cone", "base": [1, 18, 1], "radius": 1, "height": 4,
                    "axis": "y", "taper": 0, "block": "@wall.accent" }
                ] }
              }
            ]
          },
          {
            "id": "cathedral_of_the_cat",
            "kind": "asset",
            "label": "A colossal seated cat, carved as a cathedral, wings folded against its flanks",
            "envelope": { "shape": "box", "size": [80, 60, 80],
                          "minSize": [64, 48, 64], "flexible": true,
                          "anchor": "terrain", "rotations": [0, 90, 180, 270] },
            "tags": ["landmark", "sacred", "civic"],
            "csg": { "precedence": 20, "mode": "replace" },
            "constraints": [
              { "within": "old_town" },
              { "facing": "plaza#center", "tolerance": 45 },
              { "adjacent_to": "plaza", "gap": [2, 10] },
              { "terrain_conform": "cut_fill", "reference": "median", "blend": 6 },
              { "clearance": 6, "of": "self#main_door", "direction": "front" },
              { "connected": "town_hall#tunnel_stub", "via": "tunnel",
                "from": "self#crypt_stub", "style": "ancient_brick",
                "width": 3, "height": 4, "maxGrade": 0.3, "prefer": "hidden" }
            ],
            "params": {
              "prompt": "a colossal seated cat carved as an ancient temple, folded stone wings, tall arched doorway between the forepaws, weathered sandstone, hollow interior",
              "negativePrompt": "modern, cartoon, text, floating parts, base plate",
              "role": "shell",
              "sizeMode": "fit",
              "front": "south",
              "symmetry": "bilateral_x",
              "detail": 0.75,
              "variants": 1,
              "paletteHints": {
                "strategy": "style_first",
                "restrictTo": ["@wall", "@wall.accent", "@pillar", "@trim", "@glass"],
                "colorMap": [
                  { "hex": "#d8c49a", "symbol": "@wall" },
                  { "hex": "#b39a68", "symbol": "@wall.accent" },
                  { "hex": "#f2a33c", "symbol": "@glass" }
                ],
                "emissiveSymbol": "@light",
                "transparentSymbol": "@glass"
              },
              "shell": {
                "thickness": 3,
                "interiorPadding": 1,
                "minCavityVolume": 6000,
                "cavitySelect": "largest",
                "exposeInterior": true,
                "floorLevels": [0, 16],
                "floorSymbol": "@floor",
                "stairwell": true,
                "sealBottom": true
              },
              "fallback": {
                "generator": "building.grammar@0",
                "params": { "floors": 4, "floorHeight": 9, "footprint": "cross",
                            "roof": "spire", "bays": 5, "interior": "hall",
                            "windowRhythm": "tall_narrow_paired",
                            "tower": { "count": 2, "height": 14, "placement": "front" } }
              },
              "provider": { "name": "tripo", "model": "tripo-v3", "polish": true },
              "pin": null
            },
            "ports": {
              "main_door": { "type": "gate", "face": "south", "at": "center",
                             "width": 5, "height": 8, "cut": true,
                             "tags": ["primary"] },
              "crypt_stub": { "type": "tunnel_stub", "face": "down",
                              "at": "center", "y": -8, "width": 3, "height": 4,
                              "cut": true }
            },
            "children": [
              {
                "id": "nave",
                "kind": "generator",
                "generator": "building.grammar@0",
                "label": "Colonnaded hall filling the cat's chest cavity",
                "envelope": { "shape": "auto" },
                "tags": ["interior"],
                "constraints": [
                  { "inside_shell": "^" },
                  { "within": "^#interior@level0" },
                  { "terrain_conform": "float" }
                ],
                "params": {
                  "floors": 1, "floorHeight": 14, "footprint": "irregular",
                  "roof": "flat", "interior": "hall", "furnish": 0.5,
                  "windowRatio": 0.0, "wallSymbol": "@pillar", "variance": 0.2
                }
              },
              {
                "id": "reliquary",
                "kind": "primitive",
                "label": "Altar of the nine lives",
                "envelope": [7, 4, 7],
                "tags": ["interior", "shrine"],
                "optional": true,
                "constraints": [
                  { "inside_shell": "^^" },
                  { "within": "^^#interior@level1" },
                  { "centered_in": "^^", "strength": "soft", "weight": 3 }
                ],
                "params": { "ops": [
                  { "op": "fill", "from": [0, 0, 0], "to": [6, 0, 6], "block": "@floor" },
                  { "op": "fill", "from": [1, 1, 1], "to": [5, 1, 5], "block": "@wall.accent" },
                  { "op": "fill", "from": [2, 2, 2], "to": [4, 2, 4], "block": "@pillar" },
                  { "op": "place", "at": [3, 3, 3], "block": "@light" },
                  { "op": "place", "at": [0, 1, 0], "block": "@decor.banner" },
                  { "op": "place", "at": [6, 1, 6], "block": "@decor.banner" }
                ] }
              }
            ]
          },
          {
            "id": "town_hall",
            "kind": "generator",
            "generator": "building.grammar@0",
            "label": "Stepped civic hall with a deep vaulted cellar",
            "envelope": { "shape": "box", "size": [34, 24, 26] },
            "tags": ["landmark", "civic", "facade"],
            "constraints": [
              { "within": "old_town" },
              { "adjacent_to": "plaza", "gap": [2, 8] },
              { "facing": "plaza#center", "tolerance": 45 },
              { "distance": "cathedral_of_the_cat", "min": 40, "max": 140 },
              { "terrain_conform": "cut_fill", "reference": "median" },
              { "clearance": 5, "of": "self#main_door", "direction": "front" }
            ],
            "params": {
              "floors": 2,
              "floorHeight": 6,
              "footprint": "rect",
              "roof": "flat",
              "bays": 7,
              "windowRhythm": "arcade",
              "windowRatio": 0.45,
              "interior": "hall",
              "furnish": 0.4,
              "basement": 2,
              "entrance": { "port": "main_door", "porch": true, "steps": true },
              "variance": 0.1
            },
            "ports": {
              "main_door": { "type": "gate", "face": "north", "at": "center",
                             "width": 3, "height": 5, "tags": ["primary"] },
              "tunnel_stub": { "type": "tunnel_stub", "face": "down",
                               "at": [0.5, 0.0], "y": -10, "level": -2,
                               "width": 3, "height": 4 },
              "road_front": { "type": "road_stub", "face": "north", "width": 5 }
            }
          },
          {
            "id": "processional_way",
            "kind": "generator",
            "generator": "road.network@0",
            "label": "Grid of ruined avenues radiating from the plaza",
            "envelope": { "shape": "region", "size": [280, 280],
                          "yMin": -4, "yMax": 20, "anchor": "terrain" },
            "tags": ["road", "infrastructure"],
            "csg": { "precedence": 15 },
            "constraints": [{ "terrain_conform": "drape" }],
            "params": {
              "anchors": ["plaza#north_gate", "plaza#south_gate",
                          "town_hall#road_front", "cathedral_of_the_cat#main_door",
                          "#tag:residence"],
              "pattern": "grid",
              "blockSize": [34, 34],
              "maxGrade": 0.18,
              "junctionStyle": "plaza",
              "crown": 1,
              "hierarchy": [
                { "class": "processional", "width": 9, "surface": "@road.surface",
                  "edge": "@road.edge" },
                { "class": "street", "width": 5, "surface": "@road.surface" },
                { "class": "alley", "width": 2, "surface": "@path.surface",
                  "connects": ["#tag:residence"] }
              ],
              "lighting": { "spacing": 16, "symbol": "@light.wall" }
            }
          },
          {
            "id": "residences",
            "kind": "generator",
            "generator": "settlement.layout@0",
            "label": "Ruined dwellings filling the grid blocks",
            "envelope": { "shape": "region", "size": [240, 240],
                          "yMin": 0, "yMax": 30, "anchor": "terrain" },
            "tags": ["residence", "district"],
            "emitsChildren": true,
            "constraints": [
              { "within": "old_town" },
              { "distance": "plaza", "min": 20 },
              { "avoid": "#tag:landmark", "margin": 6 }
            ],
            "params": {
              "population": 34,
              "pattern": "grid",
              "density": 0.6,
              "plotSize": [[8, 15], [8, 15]],
              "landmarkSlots": 2,
              "roadParams": { "maxGrade": 0.2, "junctionStyle": "plain" },
              "mix": [
                { "archetype": "cottage", "weight": 6,
                  "params": { "floors": 1, "roof": "flat", "variance": 0.5 } },
                { "archetype": "tower_house", "weight": 2,
                  "params": { "floors": 3, "roof": "flat", "variance": 0.4 } },
                { "archetype": "shop", "weight": 2,
                  "params": { "floors": 2, "interior": "open" } }
              ]
            }
          }
        ]
      },
      {
        "id": "catacombs",
        "kind": "generator",
        "generator": "cave.carver@0",
        "label": "Cat catacombs beneath the sacred quarter",
        "envelope": { "shape": "region", "size": [300, 300],
                      "yMin": -40, "yMax": 40, "anchor": "absolute" },
        "tags": ["cave", "underground"],
        "csg": { "mode": "carve", "precedence": 5 },
        "constraints": [
          { "within": "^" },
          { "distance": "old_town", "max": 40, "measure": "center" }
        ],
        "params": {
          "style": "chamber_network",
          "density": 0.22,
          "radius": [3, 6],
          "yRange": [-36, 36],
          "verticality": 0.25,
          "chambers": { "count": 18, "radius": 11, "spacing": 46 },
          "lavaLevel": null,
          "decorate": true,
          "surfaceOpenings": 2,
          "protectTags": ["building", "foundation", "landmark"]
        }
      }
    ],
    "decorate": [
      { "generator": "scatter.props@0",
        "params": {
          "density": 0.07,
          "avoidTags": ["road", "building", "plaza"],
          "clusterSize": [2, 5],
          "props": [
            { "id": "rubble_pile", "weight": 6, "footprint": [3, 3],
              "ops": [{ "op": "sphere", "center": [1, 0, 1], "radii": [1, 1, 1],
                        "block": "@decor.rubble", "jitter": 0.4 }] },
            { "id": "fallen_column", "weight": 3, "footprint": [5, 2],
              "ops": [{ "op": "cylinder", "center": [0, 0, 0], "radius": 1,
                        "height": 5, "axis": "x", "block": "@pillar",
                        "jitter": 0.2 }] },
            { "id": "cat_statue", "weight": 1, "footprint": [2, 2],
              "ops": [{ "op": "fill", "from": [0, 0, 0], "to": [1, 0, 1],
                        "block": "@wall.base" },
                      { "op": "fill", "from": [0, 1, 0], "to": [0, 2, 0],
                        "block": "@wall.accent" }] }
          ]
        } }
    ]
  }
}
```

What this demonstrates:

- **The sentence works.** "The cathedral and town hall are connected by an
  underground tunnel" is one `connected` constraint plus a `tunnel_stub` on each
  end. Pass 3 pulls them into plausible proximity (40–140 blocks, hard
  `distance`); pass 6 routes the actual tunnel through solved rock with
  `prefer: "hidden"` and `maxGrade: 0.3`. Neither the cathedral's author nor the
  town hall's author needed to know where the other ended up.
- **The shell case.** The cat is a mesh; `role: "shell"` hollows it; `nave` and
  `reliquary` are ordinary L2 nodes solved *inside the cat's chest cavity*
  against a voxel mask, on floors inserted at local Y 0 and 16.
- **The asset never breaks the build.** `fallback` is a cross-plan spired
  building — so this exact file compiles today at G4 (with `LOAM-W301`) and
  becomes a cat at G6, with no edits.
- **The doorway is guaranteed.** `main_door` has `cut: true`, so the compiler
  cuts a 5×8 gate through the mesh's shell wherever the cat's chest ends up,
  rather than hoping the mesh generator made a hole.
- **Coherence under decomposition.** `seal` on `era`/`palettes.wall`/`decay`
  means the residential district — likely expanded by a cheaper model — cannot
  drift the look, no matter what it writes into its own `style`.

---

## §11 Appendix A — JSON Schema skeleton

Structural, not final-exhaustive. Draft 2020-12. Per-generator `params` schemas
live in the stdlib package and are applied as a second validation pass once
`generator` is known (JSON Schema alone can't dispatch on a registry). Shorthand
constraint forms are validated **after** desugaring, so this schema describes the
canonical form; the tolerant entry point desugars first.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://terrainist.dev/schema/loam-0.1.json",
  "title": "Loam v0.1",
  "$defs": {
    "id":       { "type": "string", "pattern": "^[a-z][a-z0-9_]{0,62}$" },
    "symbol":   { "type": "string", "pattern": "^@[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)*(:[a-z_]+)?$" },
    "blockId":  { "type": "string", "pattern": "^[a-z0-9_]+:[a-z0-9_/.]+(\\[[^\\]]*\\])?$" },
    "selector": { "type": "string", "minLength": 1 },
    "portRef":  { "type": "string", "pattern": "^[^#]+#[a-z][a-z0-9_]*$" },
    "vec3i":    { "type": "array", "items": { "type": "integer" },
                  "minItems": 3, "maxItems": 3 },
    "vec2i":    { "type": "array", "items": { "type": "integer" },
                  "minItems": 2, "maxItems": 2 },
    "range":    { "type": "array", "items": { "type": "number" },
                  "minItems": 2, "maxItems": 2 },
    "unit":     { "type": "number", "minimum": 0, "maximum": 1 },

    "blockSpec": {
      "oneOf": [
        { "$ref": "#/$defs/blockId" },
        { "type": "array", "items": { "$ref": "#/$defs/blockSpec" } },
        { "type": "object",
          "properties": {
            "block":  { "$ref": "#/$defs/blockId" },
            "family": { "type": "string" },
            "state":  { "type": "object", "additionalProperties": { "type": "string" } },
            "w":      { "type": "number", "minimum": 0 },
            "shape":  { "enum": ["full","stairs","slab","fence","wall","pane",
                                 "door","trapdoor","carpet","plant","fluid"] },
            "when":   { "$ref": "#/$defs/paletteCondition" },
            "$replace": { "type": "boolean" }
          },
          "anyOf": [ { "required": ["block"] }, { "required": ["family"] },
                     { "required": ["$replace"] } ],
          "additionalProperties": false }
      ]
    },

    "paletteCondition": {
      "type": "object",
      "properties": {
        "decay": { "$ref": "#/$defs/range" },
        "yBelow": { "type": "integer" }, "yAbove": { "type": "integer" },
        "exposedToSky": { "type": "boolean" },
        "nearWater": { "type": "integer" },
        "biomeTheme": { "type": "array", "items": { "type": "string" } },
        "tag": { "type": "array", "items": { "type": "string" } }
      },
      "additionalProperties": false
    },

    "style": {
      "type": "object",
      "properties": {
        "id": { "type": "string" },
        "extends": { "type": "array", "items": { "type": "string" } },
        "era": { "type": "string" },
        "mood": { "type": "array", "items": { "type": "string" } },
        "families": {
          "type": "object",
          "additionalProperties": {
            "type": "object",
            "additionalProperties": { "$ref": "#/$defs/blockId" } } },
        "palettes": {
          "type": "object",
          "propertyNames": { "pattern": "^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)*$" },
          "additionalProperties": {
            "oneOf": [ { "$ref": "#/$defs/blockSpec" }, { "type": "null" } ] } },
        "motifs": {
          "type": "object",
          "properties": {
            "architecture": { "type": "array", "items": { "type": "string" } },
            "roofType": { "enum": ["flat","shed","gable","steep_gable","hip",
                                   "mansard","dome","spire","vault","thatch_cone"] },
            "windowRhythm": { "enum": ["none","sparse","regular","dense",
                                       "tall_narrow","tall_narrow_paired",
                                       "banded","arcade"] },
            "ornamentDensity": { "$ref": "#/$defs/unit" },
            "symmetry": { "enum": ["none","bilateral","radial","strict_grid"] },
            "massing": { "enum": ["low","balanced","vertical","sprawling","stacked"] },
            "footprintStyle": { "enum": ["rectilinear","irregular_organic",
                                         "radial","courtyard","cross"] },
            "settlementPattern": { "enum": ["grid","organic_radial","linear_road",
                                            "cluster","terraced","ribbon"] }
          },
          "additionalProperties": false },
        "biomeThemes": {
          "type": "object",
          "additionalProperties": {
            "type": "object",
            "properties": {
              "biome": { "$ref": "#/$defs/blockId" },
              "palettes": { "type": "object" },
              "scatter": { "type": "array",
                           "items": { "$ref": "#/$defs/generatorCall" } },
              "climate": { "type": "object",
                           "properties": {
                             "temperature": { "type": "number" },
                             "humidity": { "type": "number" },
                             "weirdness": { "type": "number" } },
                           "additionalProperties": false },
              "where": { "type": "object",
                         "properties": {
                           "elevation": { "$ref": "#/$defs/range" },
                           "slope": { "$ref": "#/$defs/range" },
                           "distanceToWater": { "$ref": "#/$defs/range" },
                           "continentalness": { "$ref": "#/$defs/range" } },
                         "additionalProperties": false },
              "weather": { "type": "object",
                           "properties": {
                             "precipitation": { "enum": ["none","rain","snow"] },
                             "fogDensity": { "$ref": "#/$defs/unit" } },
                           "additionalProperties": false },
              "priority": { "type": "integer" }
            },
            "required": ["biome"],
            "additionalProperties": false } },
        "lighting": { "type": "object" },
        "decay": { "type": "object",
                   "properties": { "level": { "$ref": "#/$defs/unit" },
                                   "modes": { "type": "array",
                                              "items": { "type": "string" } } },
                   "additionalProperties": false },
        "scale": { "type": "object" },
        "tokens": { "type": "object",
                    "additionalProperties": {
                      "type": ["string","number","boolean"] } },
        "seal": { "type": "array", "items": { "type": "string" } },
        "note": { "type": "string" }
      },
      "additionalProperties": false
    },

    "envelope": {
      "oneOf": [
        { "$ref": "#/$defs/vec3i" },
        { "enum": ["inherit", "auto"] },
        { "type": "object",
          "properties": {
            "shape": { "enum": ["box","cylinder","sphere","dome","prism",
                                "region","path","inherit","auto","mask"] },
            "size": { "type": "array", "items": { "type": "integer" },
                      "minItems": 2, "maxItems": 3 },
            "minSize": { "$ref": "#/$defs/vec3i" },
            "maxSize": { "$ref": "#/$defs/vec3i" },
            "radius": { "type": "number" },
            "radii": { "type": "array", "items": { "type": "number" },
                       "minItems": 3, "maxItems": 3 },
            "height": { "type": "integer" },
            "width": { "type": "integer" },
            "footprint": { "type": "array", "items": { "$ref": "#/$defs/vec2i" } },
            "yMin": { "type": "integer" }, "yMax": { "type": "integer" },
            "bandBelow": { "type": "integer" }, "bandAbove": { "type": "integer" },
            "follows": { "enum": ["terrain","sea"] },
            "flexible": { "type": "boolean" },
            "anchor": { "enum": ["terrain","sea","absolute","parent_floor",
                                 "parent_ceiling","float"] },
            "anchorOffset": { "type": "integer" },
            "padding": { "oneOf": [ { "type": "integer" },
                                    { "$ref": "#/$defs/vec3i" } ] },
            "rotations": { "type": "array",
                           "items": { "enum": [0, 90, 180, 270] },
                           "minItems": 1, "uniqueItems": true },
            "mirror": { "type": "boolean" },
            "grow": { "enum": ["none","up","down","out","any"] },
            "source": { "type": "string" },
            "offset": { "$ref": "#/$defs/vec3i" }
          },
          "additionalProperties": false }
      ]
    },

    "constraint": {
      "type": "object",
      "properties": {
        "type": { "enum": ["within","adjacent_to","facing","along","distance",
                           "connected","align","orientation","clearance",
                           "terrain_conform","not_overlapping","elevation","slope",
                           "spread","cluster","inside_shell","above","below",
                           "centered_in","on_axis","visible_from","avoid"] },
        "target": { "oneOf": [ { "$ref": "#/$defs/selector" },
                               { "type": "array",
                                 "items": { "$ref": "#/$defs/selector" } } ] },
        "to": { "$ref": "#/$defs/selector" },
        "from": { "$ref": "#/$defs/portRef" },
        "strength": { "enum": ["hard","soft"] },
        "weight": { "type": "number", "exclusiveMinimum": 0 },
        "tolerance": { "type": "number" },
        "min": { "type": "number" }, "max": { "type": "number" },
        "range": { "$ref": "#/$defs/range" },
        "amount": { "type": "integer" },
        "mode": { "type": "string" },
        "value": {}, "axis": { "type": "string" },
        "gap": { "oneOf": [ { "type": "integer" }, { "$ref": "#/$defs/range" } ] },
        "offset": { "oneOf": [ { "type": "integer" }, { "$ref": "#/$defs/range" } ] },
        "at": { "oneOf": [ { "type": "number" }, { "$ref": "#/$defs/range" } ] },
        "side": { "enum": ["left","right","any"] },
        "face": { "enum": ["north","south","east","west","up","down","any"] },
        "overlap": { "oneOf": [ { "type": "integer" }, { "const": "full" } ] },
        "measure": { "enum": ["center","surface","port"] },
        "aggregate": { "enum": ["all","any","nearest"] },
        "via": { "enum": ["road","path","tunnel","bridge","rail","stair","canal"] },
        "width": { "type": "integer" }, "height": { "type": "integer" },
        "maxGrade": { "type": "number" }, "maxLength": { "type": "integer" },
        "prefer": { "enum": ["shortest","gentlest","scenic","hidden"] },
        "bidirectional": { "type": "boolean" },
        "style": { "type": "string" },
        "direction": { "type": "string" },
        "of": { "type": "string" },
        "against": { "enum": ["solid","any_node","terrain"] },
        "reference": { "enum": ["min","max","mean","median"] },
        "blend": { "type": "integer" }, "step": { "type": "integer" },
        "skirt": { "type": "boolean" }, "maxSlope": { "type": "number" },
        "inset": { "type": "integer" }, "partial": { "$ref": "#/$defs/unit" },
        "margin": { "type": "integer" }, "datum": { "enum": ["sea","terrain","absolute"] },
        "spacing": { "type": "integer" }, "faceRoad": { "type": "boolean" },
        "frontPort": { "type": "string" }, "strict": { "type": "boolean" },
        "share": { "enum": ["edge","face"] },
        "note": { "type": "string" }
      },
      "required": ["type"],
      "additionalProperties": false
    },

    "port": {
      "type": "object",
      "oneOf": [
        { "properties": { "expose": { "$ref": "#/$defs/portRef" },
                          "note": { "type": "string" } },
          "required": ["expose"], "additionalProperties": false },
        { "properties": {
            "type": { "enum": ["door","gate","arch","window","road_stub","path_stub",
                               "tunnel_stub","bridge_stub","rail_stub","dock",
                               "canal_stub","stair_top","stair_bottom","shaft",
                               "socket","interior"] },
            "face": { "enum": ["north","south","east","west","up","down","any","auto"] },
            "at": { "oneOf": [ { "const": "center" },
                               { "type": "array", "items": { "$ref": "#/$defs/unit" },
                                 "minItems": 2, "maxItems": 2 } ] },
            "y": { "type": "integer" },
            "width": { "type": "integer", "minimum": 1 },
            "height": { "type": "integer", "minimum": 1 },
            "required": { "type": "boolean" },
            "capacity": { "type": "integer", "minimum": 1 },
            "allows": { "type": "array", "items": { "type": "string" } },
            "tags": { "type": "array", "items": { "type": "string" } },
            "level": { "type": "integer" },
            "outward": { "type": "boolean" },
            "cut": { "type": "boolean" },
            "socketKind": { "type": "string" },
            "note": { "type": "string" }
          },
          "required": ["type"], "additionalProperties": false }
      ]
    },

    "op": {
      "type": "object",
      "properties": {
        "op": { "enum": ["fill","prism","sphere","cylinder","cone","line","brush",
                         "heightfield","voxels","place","replace","light","marker",
                         "union","intersect","carve","difference","group","transform"] },
        "block": { "oneOf": [ { "$ref": "#/$defs/symbol" },
                              { "$ref": "#/$defs/blockSpec" } ] },
        "mode": { "enum": ["replace","keep","carve","blend"] },
        "filter": { "type": "string" },
        "hollow": { "oneOf": [ { "type": "boolean" }, { "type": "integer" } ] },
        "state": { "type": "object" },
        "axis": { "enum": ["x","y","z"] },
        "facing": { "type": "string" },
        "jitter": { "$ref": "#/$defs/unit" },
        "from": { "$ref": "#/$defs/vec3i" }, "to": { "$ref": "#/$defs/vec3i" },
        "at": { "$ref": "#/$defs/vec3i" }, "center": { "$ref": "#/$defs/vec3i" },
        "base": { "$ref": "#/$defs/vec3i" }, "origin": { "type": "array" },
        "radius": { "type": "number" },
        "radii": { "type": "array", "items": { "type": "number" },
                   "minItems": 3, "maxItems": 3 },
        "height": { "type": "integer" }, "thickness": { "type": "number" },
        "taper": { "type": "number" },
        "polyline": { "type": "array", "items": { "$ref": "#/$defs/vec3i" } },
        "footprint": { "type": "array", "items": { "$ref": "#/$defs/vec2i" } },
        "yMin": { "type": "integer" }, "yMax": { "type": "integer" },
        "profile": { "enum": ["round","square","flat"] },
        "size": { "type": "array", "items": { "type": "integer" } },
        "data": {}, "palette": { "type": "array", "items": { "type": "string" } },
        "match": { "type": "string" }, "level": { "type": "integer" },
        "name": { "type": "string" },
        "translate": { "$ref": "#/$defs/vec3i" },
        "rotY": { "enum": [0, 90, 180, 270] },
        "mirror": { "type": "boolean" },
        "children": { "type": "array", "items": { "$ref": "#/$defs/op" } },
        "note": { "type": "string" }
      },
      "required": ["op"],
      "additionalProperties": false
    },

    "generatorCall": {
      "type": "object",
      "properties": {
        "generator": { "type": "string",
                       "pattern": "^([a-z][a-z0-9_]*\\.[a-z][a-z0-9_]*@[0-9]+|authored:[a-z][a-z0-9_]*)$" },
        "params": { "type": "object" }
      },
      "required": ["generator"],
      "additionalProperties": false
    },

    "assetParams": {
      "type": "object",
      "properties": {
        "prompt": { "type": "string", "minLength": 1 },
        "negativePrompt": { "type": "string" },
        "role": { "enum": ["solid","shell","carve"] },
        "sizeMode": { "enum": ["fit","exact","scaleToFit","preserveScale"] },
        "size": { "$ref": "#/$defs/vec3i" },
        "front": { "enum": ["north","south","east","west"] },
        "symmetry": { "enum": ["none","bilateral_x","bilateral_z","radial"] },
        "detail": { "$ref": "#/$defs/unit" },
        "variants": { "type": "integer", "minimum": 1, "maximum": 8 },
        "hollowTolerance": { "type": "integer" },
        "minIslandVolume": { "type": "integer" },
        "paletteHints": {
          "type": "object",
          "properties": {
            "strategy": { "enum": ["style_first","color_first","explicit"] },
            "colorMap": { "type": "array",
                          "items": { "type": "object",
                                     "properties": {
                                       "hex": { "type": "string",
                                                "pattern": "^#[0-9a-fA-F]{6}$" },
                                       "symbol": { "$ref": "#/$defs/symbol" } },
                                     "required": ["hex","symbol"],
                                     "additionalProperties": false } },
            "restrictTo": { "type": "array", "items": { "$ref": "#/$defs/symbol" } },
            "snapThreshold": { "type": "number" },
            "emissiveSymbol": { "$ref": "#/$defs/symbol" },
            "transparentSymbol": { "$ref": "#/$defs/symbol" },
            "dither": { "type": "boolean" }
          },
          "additionalProperties": false },
        "shell": {
          "type": "object",
          "properties": {
            "thickness": { "type": "integer", "minimum": 1 },
            "interiorPadding": { "type": "integer", "minimum": 0 },
            "minCavityVolume": { "type": "integer", "minimum": 0 },
            "cavitySelect": { "enum": ["largest","all","lowest","named"] },
            "exposeInterior": { "type": "boolean" },
            "floorLevels": { "type": "array", "items": { "type": "integer" } },
            "floorSymbol": { "$ref": "#/$defs/symbol" },
            "stairwell": { "type": "boolean" },
            "sealBottom": { "type": "boolean" }
          },
          "additionalProperties": false },
        "fallback": { "$ref": "#/$defs/generatorCall" },
        "provider": { "type": "object",
                      "properties": { "name": { "type": "string" },
                                      "model": { "type": "string" },
                                      "polish": { "type": "boolean" } },
                      "required": ["name"] },
        "pin": { "type": ["string","null"] }
      },
      "required": ["prompt"],
      "additionalProperties": false
    },

    "node": {
      "type": "object",
      "properties": {
        "id": { "$ref": "#/$defs/id" },
        "kind": { "enum": ["composite","generator","asset","primitive"] },
        "label": { "type": "string" },
        "envelope": { "$ref": "#/$defs/envelope" },
        "constraints": { "type": "array", "items": { "$ref": "#/$defs/constraint" } },
        "ports": { "type": "object",
                   "propertyNames": { "$ref": "#/$defs/id" },
                   "additionalProperties": { "$ref": "#/$defs/port" } },
        "tags": { "type": "array", "items": { "type": "string" } },
        "style": { "oneOf": [ { "type": "string" }, { "$ref": "#/$defs/style" } ] },
        "params": { "type": "object" },
        "children": { "type": "array", "items": { "$ref": "#/$defs/childRef" } },
        "prototypes": { "type": "object",
                        "additionalProperties": { "$ref": "#/$defs/node" } },
        "generator": { "type": "string" },
        "source": { "type": ["string","object","null"] },
        "emitsChildren": { "type": "boolean" },
        "layout": { "enum": ["free","packed","grid","linear","radial",
                             "terraced","manual"] },
        "layoutParams": { "type": "object" },
        "csg": { "type": "object",
                 "properties": { "precedence": { "type": "integer" },
                                 "mode": { "enum": ["replace","keep","carve","blend"] },
                                 "carveOnly": { "type": "boolean" } },
                 "additionalProperties": false },
        "seedSalt": { "type": "string" },
        "optional": { "type": "boolean" },
        "escapesParent": { "type": "boolean" },
        "overlapAllowed": { "type": "boolean" },
        "biomeSkin": { "type": "boolean" },
        "repeat": { "type": "object",
                    "properties": {
                      "count": { "type": "integer", "minimum": 1, "maximum": 512 },
                      "idPattern": { "type": "string" },
                      "vary": { "type": "object" },
                      "indexParam": { "type": "string" } },
                    "required": ["count","idPattern"],
                    "additionalProperties": false },
        "hints": { "type": "object" },
        "budget": { "type": "object" },
        "decorate": { "type": "array", "items": { "$ref": "#/$defs/generatorCall" } },
        "validate": { "type": "object" },
        "note": { "type": "string" }
      },
      "required": ["id","kind"],
      "allOf": [
        { "if": { "properties": { "kind": { "const": "generator" } },
                  "required": ["kind"] },
          "then": { "required": ["generator"] } },
        { "if": { "properties": { "kind": { "const": "asset" } },
                  "required": ["kind"] },
          "then": { "properties": { "params": { "$ref": "#/$defs/assetParams" } },
                    "required": ["params"] } },
        { "if": { "properties": { "kind": { "const": "primitive" } },
                  "required": ["kind"] },
          "then": { "properties": {
                      "params": { "type": "object",
                                  "properties": {
                                    "ops": { "type": "array",
                                             "items": { "$ref": "#/$defs/op" } } },
                                  "required": ["ops"] },
                      "children": { "maxItems": 0 } },
                    "required": ["params"] } }
      ],
      "$comment": "additionalProperties is false in strict mode except keys matching ^x-",
      "additionalProperties": false
    },

    "childRef": {
      "oneOf": [
        { "$ref": "#/$defs/node" },
        { "type": "object",
          "properties": { "$module": { "type": "string" },
                          "as": { "$ref": "#/$defs/id" },
                          "contract": { "$ref": "#/$defs/contract" } },
          "required": ["$module"], "additionalProperties": false },
        { "type": "object",
          "properties": { "$proto": { "type": "string" },
                          "as": { "$ref": "#/$defs/id" },
                          "with": { "type": "object" } },
          "required": ["$proto"], "additionalProperties": false }
      ]
    },

    "contract": {
      "type": "object",
      "properties": {
        "envelope": { "$ref": "#/$defs/envelope" },
        "ports": { "type": "object",
                   "additionalProperties": { "$ref": "#/$defs/port" } },
        "styleRef": { "type": "string" },
        "tags": { "type": "array", "items": { "type": "string" } },
        "sees": { "type": "array", "items": { "$ref": "#/$defs/selector" } },
        "tokenBudget": { "type": "integer" },
        "note": { "type": "string" }
      },
      "required": ["envelope"],
      "additionalProperties": false
    }
  },

  "type": "object",
  "required": ["loam", "kind"],
  "properties": {
    "loam": { "type": "string", "pattern": "^0\\.[0-9]+$" },
    "kind": { "enum": ["world","module","style","bundle"] },
    "meta": {
      "type": "object",
      "properties": {
        "name": { "type": "string" },
        "prompt": { "type": "string" },
        "worldSeed": { "type": ["string","integer"] },
        "mcVersion": { "type": "string" },
        "generatedBy": { "type": "object" },
        "createdAtIso": { "type": "string" },
        "toolchain": { "type": "object" }
      },
      "additionalProperties": false },
    "requires": {
      "type": "object",
      "properties": {
        "loamFeatures": { "type": "array", "items": { "type": "string" } },
        "stdlib": { "type": "string" },
        "generators": { "type": "array", "items": { "type": "string" } },
        "assets": { "type": "boolean" }
      },
      "additionalProperties": false },
    "imports": { "type": "object", "additionalProperties": { "type": "string" } },
    "prototypes": { "type": "object",
                    "additionalProperties": { "$ref": "#/$defs/node" } },
    "style": { "$ref": "#/$defs/style" },
    "root": { "$ref": "#/$defs/node" },
    "contract": { "$ref": "#/$defs/contract" },
    "node": { "$ref": "#/$defs/node" },
    "entry": { "type": "string" },
    "documents": { "type": "object" }
  },
  "allOf": [
    { "if": { "properties": { "kind": { "const": "world" } }, "required": ["kind"] },
      "then": { "required": ["root"] } },
    { "if": { "properties": { "kind": { "const": "module" } }, "required": ["kind"] },
      "then": { "required": ["contract","node"] } },
    { "if": { "properties": { "kind": { "const": "style" } }, "required": ["kind"] },
      "then": { "required": ["style"] } },
    { "if": { "properties": { "kind": { "const": "bundle" } }, "required": ["kind"] },
      "then": { "required": ["entry","documents"] } }
  ],
  "additionalProperties": false
}
```

Known limits of this skeleton, to be closed before G4:

- `constraint` is a flat union of every type's fields; the real schema should be
  a `oneOf` discriminated on `type` so unknown-field errors point at the right
  constraint. Deferred because a flat union is far more forgiving during early
  authoring, and because constrained-decoding grammars are smaller for it.
- `params` for generators is `{}` here; the second-pass registry validation is
  where the real checking happens.
- `additionalProperties: false` everywhere is the strict-mode shape; the
  tolerant parser relaxes it to allow `x-` keys, per §1.5.

---

## §12 Open questions

Every decision I was not confident about, with a recommendation.

**Q1 — JSON vs JSON5 as the *authoring* format.** I recommend strict JSON,
justified by constrained decoding (§1.1). But comments genuinely help agents
reason, and `note`/`label` are a weaker substitute. **Recommendation:** ship
strict JSON; measure whether agents actually use `note` for rationale. If not,
enable JSON5 for agent-authored modules only and normalize at link time.
`[C:high on JSON, C:med on the tolerance layer]`

**Q2 — One file or many?** Multi-file with a contract handshake (§1.3) is right
for parallel agents, but adds a link step and a whole class of contract-mismatch
errors. **Recommendation:** keep multi-file, but make bundles the *only* thing
the compiler ingests, so multi-file support is a thin, testable front end.
`[C:high]`

**Q3 — Should `nodePath` seeds be positional?** Positional seeds mean moving a
node in the tree rerolls it. The alternative is a mandatory stable `uid` per
node, costing tokens on every node forever. **Recommendation:** keep positional;
add an *optional* `uid` in v0.2 that, when present, replaces `nodePath` in the
seed derivation. That way stability is opt-in for nodes that need it (landmarks
a user liked) and free for the other 95%. `[C:med]`

**Q4 — Are per-type default strengths too clever?** A single global default
("everything hard") is more predictable and easier to document in a system
prompt; per-type defaults (§4.5) are friendlier but require the agent to
remember a table. **Recommendation:** keep per-type, because the failure mode of
global-hard (constant unsat on `facing`) is much worse than the failure mode of
per-type (occasional surprise). Mitigate by having the compiler echo effective
strengths in the solver report. `[C:med]`

**Q5 — Is the constraint vocabulary too large for v0.1?** Twenty-two types is a
lot to implement for G4. **Recommendation:** implement in two tiers. Tier 1
(G4): `within`, `adjacent_to`, `distance`, `along`, `orientation`,
`terrain_conform`, `not_overlapping`, `elevation`, `facing`, `connected`,
`clearance`. Tier 2 (G5+): the rest. Tier 2 types must still *parse* and must
produce `LOAM-W407 CONSTRAINT_NOT_IMPLEMENTED` rather than an error — so specs
written against the full vocabulary stay valid. `[C:high]`

**Q6 — `along` route corridors.** §4.4 resolves the road-ordering hazard by
requiring linear targets to exist as `path`-envelope nodes in pass 3. This is
the single most likely thing in this spec to be wrong in practice, because it
requires the road network generator to produce a *plausible* corridor before it
knows where buildings go, and then buildings shift the ideal road. **Recommendation:**
build it as specified, but plan for a pass 3.5 "coarse route" iteration
(corridor → buildings → re-route within corridor → nudge buildings) at G4, and
budget time for it. `[C:low — flag for Kai]`

**Q7 — `layout: "manual"` and explicit `offset`.** This is a coordinate escape
hatch, which contradicts the no-absolute-coordinates rule — though the
coordinates are parent-local, so it is weaker than it looks. **Recommendation:**
keep it, because debugging without it is miserable, but make the validator emit
`LOAM-W144 MANUAL_LAYOUT` on every use, and forbid it in agent-authored modules
via a lint profile. `[C:med]`

**Q8 — Style `seal`.** Sealing prevents drift but will also block legitimate
local variation ("this one building is marble"). **Recommendation:** keep, and
add `sealExcept` in v0.2 if it bites. Watch for agents fighting the seal and
producing worse specs to route around it. `[C:med]`

**Q9 — Cross-engine float determinism.** §6.5 rule 6 pins transcendental math
behind `ctx.math` because `Math.sin` is not IEEE-specified. This is a real
correctness risk that will only show up when someone runs the compiler on a
different Node version or arch. **Recommendation:** implement `ctx.math` with
explicit polynomial approximations from day one (not wrappers over `Math`), and
add a CI determinism test across at least two architectures at G1. Cheap now,
extremely expensive to retrofit. `[C:high that it matters; C:med on the
implementation]`

**Q10 — BLAKE3 vs SHA-256.** BLAKE3 is faster and TS-available; SHA-256 is more
universally implemented and needs no extra dependency in some environments.
**Recommendation:** BLAKE3 via `@noble/hashes`, pinned by exact version in
`toolchain`. The choice matters only in that it must never change silently.
`[C:med]`

**Q11 — Ordering between sibling generators.** Example A (§10.1) used an
`after` constraint that does not exist in §4's vocabulary — a real gap I hit
while writing the example. Terrain must run before climate, which must run
before scatter. **Recommendation:** do *not* add an `after` constraint. Make
ordering implicit from `csg.precedence` plus a fixed pass sub-order (heightfield
→ density → climate → carve → structures → connective → decorate), and give
generators a declared `stage` in their stdlib metadata. Explicit ordering
constraints in a declarative language invite cycles. **The `after` line in
Example A should be deleted once this is settled.** `[C:med]`

**Q12 — Interior generation.** §9.5 inserts floors into shells and
`building.grammar` has an `interior` param, but there is no real
room-partitioning generator in v0. Interiors are where "walking around the
world" disappointment concentrates. **Recommendation:** add `interior.rooms@0`
at G5 with BSP partitioning + door graph + furnish tables, and treat interior
quality as a G5 acceptance criterion, not a G7 polish item. `[C:med]`

**Q13 — Should `decorate` be a node field or a separate document section?**
Currently per-node (§7.8) and per-biome-theme (§2.5), which means two places to
look. **Recommendation:** keep both — node-scoped decoration is genuinely
different from biome-scoped — but document the precedence (biome theme first,
then node, node wins on conflict). `[C:low]`

**Q14 — Envelope `size` for `region` shapes is 2D, elsewhere 3D.** An
irregularity that will trip agents. **Recommendation:** accept `[x,z]` for
`region`/`path` and `[x,y,z]` everywhere else, but have the validator emit a
*specific* fix-it message rather than a schema error. Alternatively force 3D
everywhere and ignore Y for regions — simpler, slightly wasteful. Leaning toward
forcing 3D for regularity. `[C:low]`

**Q15 — Asset `variants > 1`.** Generating N meshes and picking one
deterministically is the obvious quality lever, but it multiplies the most
expensive part of the pipeline. **Recommendation:** ship the field, default 1,
and only let the *repair loop* raise it — after a render critique rejects the
first mesh. `[C:med]`

**Q16 — How does the user's prompt reach asset prompts?** `meta.prompt` is
world-global; the augmentation in §9.3 uses style + label but not the original
user text. **Recommendation:** do not inject `meta.prompt` into asset prompts —
it leads to every statue in the world being a cat. The planner should put the
relevant intent in each asset's `prompt`/`label`. Revisit if assets come back
off-theme. `[C:med]`

**Q17 — Water and fluid correctness.** Waterlogging is derived (§8.3) and
falling blocks are linted (§10.1), but flowing water, fluid updates on load, and
lava/water interaction are unaddressed. A world that looks right in a render and
then floods on first tick is a serious product failure. **Recommendation:** add
a `fluid-settling` validator at G2 that simulates one tick of fluid spread over
the emitted field and reports instability. `[C:high that it's needed]`

**Q18 — Chunk-boundary and structure-integrity concerns at emit.** Not covered
here at all (this is a spec, not an emitter design), but `LOAM-W440`-class lints
and heightmap/lighting correctness are where 26.2 compatibility will actually
break. **Recommendation:** G1's spike should include a lighting + heightmap
round-trip check, not just "the world loads". `[C:high]`

**Q19 — Token cost of this format in practice.** Everything here is designed for
LLM writability but that is an untested hypothesis. **Recommendation:** at G3,
instrument: tokens per node, schema-violation rate per model, and the ratio of
shorthand to canonical constraints. If GLM 5.2 gets constraint shorthand wrong
more than ~2% of the time, drop shorthand and go canonical-only — regularity
beats terseness when the writer is unreliable. `[C:med]`

**Q20 — `emitsChildren` and nested solving.** A generator that emits children
triggers a nested pass 3, which can recurse (`settlement.layout@0` emitting
buildings that are themselves generators). Depth and cost are unbounded in the
current design. **Recommendation:** cap nested expansion at depth 3 and require
`budget.maxChildren`; a generator that wants deeper structure should emit a
composite and let the normal tree handle it. `[C:med]`

---

## §13 Appendix B — diagnostic codes

### 13.1 Severity

| Level | Meaning |
|---|---|
| `E` | error — compilation fails, **except** where §4.6 says otherwise (`E404`, `E405` complete the compile but gate the repair loop) |
| `W` | warning — compilation completes; feeds the repair loop and the render critique rubric |
| `I` | info — recorded in the report only |

### 13.2 Codes referenced in this document

| Code | Name | §|
|---|---|---|
| `E101`–`E107` | unknown document key / node key / kind / constraint / port type / op / generator | §1.5 |
| `W110` | unknown hint key ignored | §1.5 |
| `E120` | contract mismatch between parent and module | §1.3 |
| `W130` | node depth exceeds 12 | §3 |
| `E140` | generator child id collides with static child | §3.1 |
| `E141` | primitive node has children | §3.1 |
| `E142` | duplicate sibling id | §3.2 |
| `E143` | repeat count out of range | §3.8 |
| `W144` | manual layout used | §12 Q7 |
| `E150` | envelope overflow | §3.3 |
| `W151` | op clipped to envelope | §8.1 |
| `E151` | envelope out of world bounds | §3.3 |
| `E160` | ambiguous selector | §4.2 |
| `W161` | undeclared cross-module reference | §4.2 |
| `E170` | cannot fit within container | §4.4 |
| `E171` | no front defined for `facing` | §4.4 |
| `E172` | orientation incompatible with allowed rotations | §4.4 |
| `E180` | unroutable connection | §4.4 |
| `E181` | incompatible ports | §5.4 |
| `W182` | port width mismatch > 2× | §5.4 |
| `E183` | port oversubscribed | §5.4 |
| `W184` | dock/canal not at waterline | §5.4 |
| `E185` | port ref missing node selector | §5.5 |
| `E186` | declared port not honored by generator | §5.6 |
| `E187` | exposed port redeclares geometry | §5.6 |
| `E190` | numeric seed out of safe integer range | §6.1 |
| `E195` | child budget exceeds parent budget | §7.9 |
| `E196` | budget exceeded | §7.9 |
| `W197` | decorate truncated by budget | §7.9 |
| `E210` | unknown palette symbol after fallback | §2.2 |
| `E211` | attempt to redefine reserved symbol | §2.2 |
| `W212` | family lacks requested form | §2.3 |
| `W213` | literal block id outside a primitive node | §8.3 |
| `E220` | unknown enum value in `motifs` | §2.4 |
| `E221` | sealed style path overridden | §2.8 |
| `W301` | asset fallback used | §9.7 |
| `W302` | asset node has no fallback | §9.7 |
| `E310` | shell produced no interior cavity | §9.5 |
| `E311` | asset artifact missing from lockfile path | §9.8 |
| `W401` | tolerance relaxed | §4.6 |
| `W402` | envelope shrunk | §4.6 |
| `W403` | parent grown | §4.6 |
| `E404` | hard constraint demoted to soft | §4.6 |
| `E405` | optional node dropped | §4.6 |
| `E406` | unsatisfiable constraint set | §4.6 |
| `W407` | constraint parsed but not implemented in this tier | §12 Q5 |
| `W420` | port blocked by geometry | §5.6 |
| `W421` | port not walkable (no supported floor) | §5.6 |
| `W422` | expected opening missing in asset mesh | §9.6 |
| `W430` | disconnected road graph | §7.5 |
| `W440` | falling block unsupported | §10.1 |

### 13.3 Per-node lint overrides

```json
"validate": { "allow": ["W420"], "deny": ["W144"], "strict": false }
```

`allow` suppresses a code for this node and its subtree (with a recorded
justification in the report); `deny` promotes a warning to an error. Suppression
is deliberately awkward to write, and every suppression appears in the report,
because the deterministic validators are the cheap feedback loop and silently
disabling them is how worlds get shipped with doors into walls.

---

*End of Loam v0.1 draft. Written 2026-07-27 against `docs/DESIGN.md` (GOAL 0
output). Review targets, in order of value: §4 (constraint semantics and the
relaxation ladder), §6 (determinism rules), §9.5 (shell interiors), and §12 Q6,
Q9, Q11, Q17.*
