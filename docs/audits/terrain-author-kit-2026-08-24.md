# Audit: Loam Terrain Author Kit

**Source audited:** `/Users/kaihoward/Dev/terrainist/docs/kits/terrain-author.md`
**Cross-checked against:** `packages/spec/src/terrain/{validate,types,diagnostics}.ts`,
`packages/spec/src/intent/{types,validate}.ts`, `packages/compiler/src/terrain/*`,
`packages/stdlib/src/noise/index.ts`, and `docs/kits/settlement-author.md`.
**Method mirrors:** `loam_settlement_author_kit_audit.md` (house style). Unlike that audit,
this one *could* read the compiler, so every finding is tagged with which side the code supports.
**Read-only:** no file in the repo was modified; no tests run.

## Executive conclusion

The terrain kit is in **substantially better shape than the settlement kit**. It is 1/7th the
size, its parameter tables agree with the validator's numeric specs and the compiler's defaults
almost everywhere I checked, all fourteen fenced JSON examples parse, and it has none of the
"registry-history-as-instruction" rot that dominates the settlement document. It is close to
what a Layer-A stable authoring policy should look like.

Its defects are of a different character. They cluster into three groups:

1. **The kit's closure claims are false.** It states three times, in the strongest possible
   terms, that its own enumeration is exhaustive — "Nothing else is allowed", "Any key not
   listed in this kit is an error", "the table above is exhaustive per verb". The validator
   accepts a materially larger surface than the kit documents: `authored:<id>` landmark
   children and `scatter.program@0` at the root, a top-level `programs` key, `tags`/`seedSalt`/
   `intent` on every node, `scaleReference` on the heightfield, and five `intent` / ten
   `intent.character` keys the kit never names. The kit is a *subset* presented as *the*
   grammar, which both suppresses real capability and teaches a false model of the language.
2. **Two self-contradictions with real behavioural consequence:** the biome key (§1 offers it,
   §5 says it does not exist), and the wilderness-fill density band (§6's own recommended
   0.02–0.05 band sits entirely at or above the compiler's forest-biome coverage threshold,
   so the paragraph warning that a fill "no longer paints the `forest` biome" is false for
   every value the kit itself recommends — including both worked examples).
3. **Cross-kit divergence.** The settlement kit claims "sections 1–8 are the terrain vocabulary,
   unchanged". They are not. The most important divergence — `scatter.forest@0.area.radius` —
   is documented as **blocks** here and as a **0.01–1 fraction** there. The compiler agrees
   with this kit; the settlement kit is wrong, and its `LOAM-T118` diagnostic text says so
   explicitly. (The settlement audit's C17 diagnosed this backwards: it assumed the examples
   were broken and the prose correct. The code says the reverse.)

Recommendation: this document does **not** need re-architecting the way the settlement kit does.
It needs a correctness pass (§Phase 1 below) and a schema-generation pass for the enumerations
it currently hand-maintains. It should stay one prompt.

## Size and structural profile

- **814 lines**
- **5,582 whitespace-delimited words**
- **37,054 characters**
- **17 fenced blocks**: 14 `json`, 1 `text` (the zone grid), 2 unlabelled `strata` fragments
- **All 14 JSON fences parse as valid JSON** (verified with `json.loads`)
- Largest sections: §6 `scatter.forest@0` (~180 lines incl. the 21-row species catalog),
  §10 complete example (~70 lines), §7 `cave.carver@0` (~72 lines)
- The species catalog table is the single largest table (21 rows) and the most defensible one:
  its description column carries genuine art direction a schema cannot express.

For contrast, the settlement kit is 4,392 lines / 45,702 words. The terrain kit is not
suffering from bulk.

---

# 1. Correctness findings (C*)

## C1. "Nothing else is allowed" at the root is false — the validator accepts two more child kinds

**Kit, §1:** "`root.children` holds **exactly one** `terrain.heightfield@0`, **exactly one**
`terrain.climate@0`, and any number of `scatter.forest@0` and `cave.carver@0` nodes. Nothing
else is allowed."

**Code** (`packages/spec/src/terrain/validate.ts:445-467`) dispatches root children as:

- `generator` starting with `"authored:"` → `validateAuthoredReference` + `validateLandmarkParams`
  + `validateLandmarkConstraints`. The source comment is emphatic:
  *"The bespoke tier is legal in the terrain profile too — a monument on pure terrain is the
  contract's own first example."*
- `generator === "scatter.program@0"` → `validateProgramScatterParams`
- only then the four generators the kit names.

**Also:** top-level `unknownKeys` (line 189) permits `["loam","profile","meta","style","intent",
"programs","root"]` — seven keys. The kit says six and omits `programs`, which is the very key
an `authored:<id>` reference resolves against.

**Which side is right:** the code. The kit is stale/incomplete.

**Risk:** high, and in the *suppressive* direction. An LLM given a prompt like "a lone monolith
on a moor" or "a wrecked ship on the shore" is told, in the kit's most forceful sentence, that
this is impossible on a terrain document. It will silently degrade to a `peak` edit. This is
the terrain-side mirror of settlement C1, but with the opposite sign: settlement's whitelist was
too *narrow relative to its own later text*; this one is too narrow relative to the compiler.

**Fix:** either document the bespoke tier + `programs` in the terrain kit (it is genuinely
supported), or — if the intent is that terrain-only authoring stays program-free — say so as a
*policy* choice ("this profile supports authored programs; do not use them here") rather than a
false statement about legality. Generate the child-kind union from `PROFILE_GENERATORS` plus the
two special dispatches.

## C2. `intent.climate.biome` (§1) vs "There is no biome key anywhere in the document" (§5)

**§1** explicitly lists `climate` as
`{ "biome": "minecraft:<id>", "temperature": -1..1, "humidity": -1..1, "snow": ... }`
and adds that on a terrain document "the climate dials are the ones that bite: they outrank the
terrain's own climate over the scope that declares them."

**§5**, 200 lines later, closes with: "Biomes are **derived**, never named directly… **There is
no biome key anywhere in the document.**"

**Code:** `packages/spec/src/intent/validate.ts:237` accepts
`["biome","temperature","humidity","snow","blend"]` on `intent.climate`;
`intent/types.ts:169-174` describes `biome` as *"Precedence rung 1 of the biome contract (§4)…
Outranks everything."*

**Which side is right:** §1 and the code. §5's absolute sentence is false.

**Risk:** high. These are flat contradictions of the same fact inside one prompt, and §5's
version is the more memorable phrasing (bolded absolute). This is settlement C6 reproduced
verbatim in the terrain kit — meaning the fix has to be applied in both places.

**Fix:** rewrite §5's closer as: "`terrain.climate@0` takes no biome id — terrain biomes are
derived from height, slope and climate. The only biome override in the language is
`intent.climate.biome`, which pins the biome across the scope that declares it."

## C3. The recommended wilderness-fill density band contradicts the kit's own biome warning

**§6** says: "below `density` 0.02 it plants scattered trees over open country… it will not read
as forest and no longer paints the `forest` biome."

**§6's own table** and **§8 item 3** both give the wilderness band as **0.02–0.05**.

**Code:** `packages/compiler/src/terrain/vegetation.ts:86` `FOREST_COVERAGE_DENSITY = 0.02`, and
line 1032 gates on `params.density >= FOREST_COVERAGE_DENSITY`. So *the entire recommended band
is at or above the threshold* — every value the kit recommends for a wilderness fill **does**
paint the forest/taiga biome.

**Both worked examples make the whole world forest.** §9's `wilderness` node is
`{"area": {"all": true}, "density": 0.04}`; §10's is `0.03`. With `all: true` and density above
the coverage threshold, the coverage mask covers every eligible column in the region, so
`biomes.ts` paints the entire lowland as `forest`/`taiga` rather than `plains`. For §10 —
*"a small volcanic island ringed by black beaches"* — that is very likely not the intended world.

**Which side is right:** the code. The prose and both examples are inconsistent with it.

**Risk:** critical, because it is invisible: the document validates, compiles, produces trees at
a plausible density, and quietly loses the `plains` biome across the map. This is exactly the
class of defect the settlement audit called out as "examples demonstrate the error the prose
warns against" (its C17), and it is the one place where the terrain kit has the same disease.

**Fix:** state the threshold as a number ("a node at `density` ≥ 0.02 marks its whole area as
forested for biome purposes, whatever the trees actually do"), move the wilderness band strictly
below it (e.g. 0.008–0.018), and re-pin both worked examples. If the intent is that a
whole-region fill should never drive biome, the better fix is in the compiler: exempt
`area.all` nodes from the coverage mask.

## C4. "Any key not listed in this kit is an error" — the validator accepts five per-node keys the kit never names

**Code:** every node validator (`validate.ts:409, 574, 626, 709, 732, 952`) passes an allow-list
of `["id","kind","generator","envelope","params","children","tags","seedSalt","constraints",
"ports","intent"]`.

The kit documents `id`, `kind`, `generator`, `params`, `children`, `envelope` (root only),
`label`, `note`. It never mentions **`tags`**, **`seedSalt`**, or per-node **`intent`** — all
legal. And it says flatly "No `constraints`, no `ports`" while the allow-list carries both
(they are then rejected by `checkNoConstraints` for plain generators, but *accepted and
partially honoured* on an `authored:` landmark child — line 461 explicitly validates
`at`/`zone` constraints on one).

(`label`/`note` are fine: `packages/spec/src/checks.ts:17` defines
`ALWAYS_ALLOWED = ["label", "note"]`, which `unknownKeys` unions into every allow-list. The kit
is correct here.)

**Which side is right:** the code, on `tags`/`seedSalt`/`intent`/landmark-constraints.

**Risk:** medium — suppressed capability, plus an absolute claim the model can be shown is false.

**Fix:** generate the per-node key union from the validator. Keep the "do not invent keys"
policy sentence, but stop claiming the kit's list is the complete legal set.

## C5. `scaleReference` is a real heightfield param with its own diagnostic, undocumented in the kit

**Code:** `validate.ts:1051-1112` — `scaleReference` is in the heightfield param allow-list,
has a dedicated validator, a 16..4096 integer range mirroring the envelope size, and its own
warning `LOAM-T117 SCALE_REFERENCE_INERT` when declared without any spatial param to scale.
`stdlib/src/noise/index.ts:67-79` documents the semantics: frequencies are divided by
(longest side ÷ scaleReference), so a 1024-wide world gets the same landform *size* as the
512-wide world the params were tuned at.

**Kit §3** says "All params optional" and gives a 15-row table that omits it entirely.

**Which side is right:** the code. This is a genuinely useful authoring knob — arguably the
single most useful one for a model that has been taught `frequency` values calibrated at 512
and then asked for a 1024 region, which §1 explicitly invites ("1024 for a sprawling landscape").

**Risk:** medium-high, and it compounds: the kit teaches absolute frequency values
(`0.001 = huge landforms, 0.008 = busy and small`) *and* variable region sizes, without the
one param that reconciles them.

**Fix:** add a `scaleReference` row and one sentence in §1's envelope note: "if you change
`size` away from 512, set `scaleReference: 512` on the heightfield so the frequency guidance in
§3 still means what it says."

## C6. `intent` is under-documented against a shared validator

**Kit §1** gives `intent` as `era`, `wealth`, `decline`, `formality`, `climate`, `character`
(with `label`, `palettes`, `flora`).

**Code:** `INTENT_KEYS` (`intent/types.ts:379`) = the above **plus `event` and `tokens`**.
`CHARACTER_KEYS` (line 391) = 13 keys: `label`, `materialTheme`, `palettes`, `archetypes`,
`props`, `flora`, `formPacks`, `motifs`, `programs`, `urbanForm`, `courtyards`, `ground`,
`fortification`. `intent.climate` also accepts **`blend`**.

Most of the extra character keys are settlement-only in effect, so omitting them from a terrain
kit is defensible *as editorial selection*. But `materialTheme` and `climate.blend` plausibly
affect terrain, and `event` (`kind`/`severity`/`recency`) certainly could.

**Which side is right:** the code is the legality authority; the kit's omission is an editorial
choice presented as a legality claim (see C4).

**Fix:** mark the terrain kit's intent table as "the intent keys that do something on a terrain
document", not as the intent schema.

## C7. `style` accepts only `palettes`, but `intent.climate.biome` points at `style.biomeThemes`

**Code:** `validateStyle` (`validate.ts:332`) allows exactly `["palettes"]`.
`intent/types.ts:173` documents `intent.climate.biome` as *"A vanilla biome id, **or a
`style.biomeThemes` id**."*

So the intent layer advertises a `style` sub-key the terrain validator rejects. Either
`biomeThemes` is settlement-only (in which case the terrain kit's §1 `biome` line should say
"a vanilla `minecraft:` id only, here"), or the terrain `style` allow-list is stale.

**Risk:** low-medium — the kit already narrows this to `minecraft:<id>`, which happens to be the
safe subset. But it is an unremarked divergence between two spec packages.

## C8. The forest table double-documents `snowLine` without saying which wins

`snowLine` appears as a node-level row ("Node-level it applies to every species") *and* inside
the `species` row ("optional `snowLine` (absolute Y ceiling for this species)"), with the
parenthetical "(or as well)". `types.ts:255-260` resolves it: *"Absent, the node's
`params.snowLine` applies"* — species overrides node.

The kit's "or as well" is true but never states the precedence. Small, but it is the only place
in the kit with a two-level override and no stated winner.

**Fix:** one clause — "a species' own `snowLine` overrides the node's."

## C9. The final checklist requires "at least one forest"; nothing else does

**§11:** "One heightfield, one climate, at least one forest."
**§6:** "Any number of nodes."
**Code:** `validateRootChildren` counts heightfields and climates and errors on ≠ 1
(`validate.ts:513-534`). There is **no forest count check** anywhere; `LOAM-T119 SCATTER_EMPTY`
fires only for a node that planted zero trees, not for a document with no forest node.

**Which side is right:** the code. Zero forests is legal.

**Risk:** medium-high, identical to settlement C9, and more acute here: a terrain-only kit is
exactly the kit that gets asked for a salt flat, a lava waste, a moonscape, an ice sheet. The
checklist's location (last line before output) gives it disproportionate weight.

**Fix:** demote to a heuristic — "unless the world is deliberately treeless, give it at least
one forest node" — or drop it and let §6's two-node default pattern carry the guidance.

## C10. §3 leaks settlement mechanics into a terrain-only kit

**§3:** "the settlement's own ground is clamped separately, so the ambient heightfield is the
only thing the prompt's landscape can reach."

There is no settlement on a terrain document. This sentence is copied from — or shared with —
the settlement kit and is meaningless (worse: actively confusing) in this profile. Same for
§6's `avoidTags`, whose only documented tags are `structure`/`road`/`plaza`
(`vegetation.ts:337, 857`), none of which exist in the terrain profile: the param is inert here.

**Fix:** rewrite §3's sentence without the settlement clause. Either drop `avoidTags` from the
terrain forest table or annotate it "no effect in this profile — terrain has no occupancy tags."

## C11. v0.2 spec-version references inside a `loam: "0.1"` kit

§7 twice cites "the v0.2 §7 enum" / "the v0.2 §7 table" to explain why `lava_tube`, `lavaLevel`,
`waterTable`, `surfaceOpenings` and `protectTags` are rejected. The code carries the same framing
(`validate.ts:142-155`, `CAVE_UNIMPLEMENTED`), so this is faithful — but the kit's own header
pins `"loam": "0.1"` and never explains that there is a second version axis (spec version vs
document version).

This is settlement C11 in miniature, and the fix is the same: name the axes, or drop the version
citation and just say what is rejected.

**Note on §-numbering:** §7's "v0.2 §7" collides with the *kit's own* §7 (which is the cave
section). A model reading "the v0.2 §7 enum" inside kit-§7 has no way to know these are
different documents.

---

# 2. High-risk LLM interface design findings (H*)

## H1. `radius` carries three unrelated shapes across four node types

- `terrain.edit@0.radius` — scalar, **blocks**, 1..2048 (`EDIT_NUMS`)
- `scatter.forest@0.area.radius` — scalar, **blocks**, must be > 0, warns below 2
- `cave.carver@0.radius` — **`[min, max]` pair**, blocks, ints 1..12
- `cave.carver@0.chambers.radius` — scalar, blocks, 3..24

Within this kit the *units* are at least consistent (all blocks), which is a real improvement
over the settlement kit. But the *arity* is not: a model that has written `radius: 56` on a
`peak` will write `radius: 4` on a carver and get `LOAM-T1xx` for a type error.

**Recommendation:** in the cave table, lead the row with the shape (`"radius": [min, max]`)
rather than the word, as the kit already does in its example. Longer term, `radiusRange` for
the carver.

## H2. `profile` means two unrelated things

`"profile": "terrain"` at the document root, and `"profile": "sharp"|"rounded"` on every edit
verb. Both appear in §10's flagship example, 40 lines apart. The kit never remarks on it.

**Recommendation:** rename the edit param (`falloff`, `edgeProfile`) or, minimally, add a
one-line note. This is the terrain kit's version of settlement's `at` overload — less severe
because the value spaces do not overlap, but it costs the model a type inference every time.

## H3. `density` means two incompatible quantities

`scatter.forest@0.density` is *trees per eligible column* (0..1). `cave.carver@0.density` is a
**systems-per-area rate** — the kit says "one per ≈9000 blocks of area at `1`, capped at 64".
These share nothing but a name and a 0..1 range, so a model transferring intuition ("0.3 is
sparse") gets it exactly backwards between the two.

## H4. `frequency` appears four times with four scales and no shared reference

`heightfield.frequency` (0.0035), `heightfield.warp.frequency` (0.004),
`heightfield.continentalness.frequency` (0.0009), `climate.temperatureFrequency` (0.0012),
`cave.frequency` (0.012) — a 13× spread, all documented as "0..1", all meaning "cycles per
block" at different scales. The kit gives good anchors for the heightfield one
(`0.001 = huge, 0.008 = busy`) and none for the others.

**Recommendation:** give each `frequency` row a two-value anchor the way the heightfield row has
one. This is the cheapest quality win in the document.

## H5. `entrances` is typed as `true|false|int 0..8` — a tri-typed field with an asymmetric default

The table's default column says `0`, the range column says `true`/`false` or int. So `true`
means… some number ≥ 1, unspecified. The `surfaceOpenings` rejection hint in the code says
`"entrances": 2 (or true)`, implying `true` is a real form.

**Recommendation:** state what `true` resolves to. A model choosing between `true` and `2` with
no stated equivalence will pick inconsistently across documents.

## H6. The checklist is a second source of truth and already drifted

§11 restates rules from §1, §4, §6 in imperative form. One of the seven restatements is already
wrong (C9, "at least one forest"). This is structurally the same failure as settlement H10, just
caught early: a checklist that paraphrases rules will drift from them.

**Recommendation:** make §11 purely *procedural* (output shape, no prose, no fences) and let it
**point** at sections rather than paraphrase them. The one exception worth keeping verbatim is
"north is small `fz`" — it is a fact models get wrong and a checklist is the right place for it.

## H7. The strata "do not write `budget` or `exclusion`" rule has no enforcement I could find

§6 says: "Do **not** write `budget` or `exclusion` on the emergent layer." I found no
`budget`/`exclusion` handling in `packages/spec/src/terrain/validate.ts`. If they are not in the
strata allow-list they are already errors (and the sentence should say so); if they *are*
accepted, the sentence is a soft norm the validator won't back. Either way the current phrasing —
a prohibition with a rationale but no stated consequence — is the weakest form.

---

# 3. Token / attention findings (L*)

The terrain kit is not bloated. These are refinements, not the structural surgery the settlement
kit needs.

## L1. §8 "Current-state guidance" is ~80% restatement

Its eight numbered items restate: water routing (§4 already says `flooded`/`basin` rules),
forest density (§6's table), `irregularity`/`meander` defaults (§4's modifier table, which
already bolds "**The default is right.**"), volcano dressing and lava-is-caldera-only (§4's
rules list), palettes (§8's own next subsection).

Items 1, 5 and 8 (unstable-fluid compile failure) carry information found nowhere else. The rest
is a third copy.

**Recommendation:** cut §8 to the three novel items and fold the rest back into their sections.
Saves ~350 words and removes three drift surfaces.

## L2. `label` on every example node is teaching a habit that costs output tokens

§10's example labels five of its eight nodes with prose captions ("the broad shield the cone sits
on"). These are genuinely useful for human debugging, but a model reading the flagship example
learns that labels are expected, and pays for them on every generation.

**Recommendation:** keep labels on two nodes in one example and add "labels are optional and for
humans; omit them unless the world is being reviewed." (Also see C4 — verify they validate.)

## L3. Diagnostic codes appear before generation

`LOAM-T114` appears twice in §7. The model cannot act on a code number while authoring; it can
act on the sentence beside it. This is settlement L3 at 1/25th the volume — trivial to fix,
worth fixing so it never grows.

**Recommendation:** drop the code strings; keep the prose. Codes belong in the repair pass.

## L4. `"style": { "palettes": {} }` in the skeleton is copied boilerplate

An empty palettes object is emitted by any model following the skeleton literally, and means
nothing. §10 shows the useful form.

**Recommendation:** drop `style` from the skeleton entirely (it is optional per
`validateStyle`'s `if (style === undefined) return`), or show it with one real override.

## L5. Host-derivable metadata

Same as settlement L9, smaller list: `loam: "0.1"`, `profile: "terrain"`, `root.kind:
"composite"`, `meta.prompt` (the host has the prompt), and arguably `meta.worldSeed`. Five fields
of pure ceremony per document, three of them constants.

## L6. The zone grid ASCII block is worth its tokens

Noting the opposite for once: the `text` fence in §2 mapping the nine zone tokens to fz/fx
values is compact, unambiguous, and fixes the single most common LLM error in this domain
(north/south sign). Keep it exactly as is.

---

# 4. Cross-kit divergences (settlement claims to be a superset)

`settlement-author.md:11-12`: *"The settlement profile is a **superset of the terrain profile**:
everything in sections 1–8 below is the terrain vocabulary, **unchanged**."*

| Topic | Terrain kit | Settlement kit | Code says |
|---|---|---|---|
| `forest.area.radius` | **blocks** (`radius: 150`, `120`, `170`, `180`) | "**a fraction of the region radius**, 0.01–1… this is the one that bites" (line 342) | **Blocks.** `validate.ts:1031-1044` requires a positive number, warns via `LOAM-T118` below **2 blocks**, and its fix text reads *"radius is in BLOCKS, while `at` is fractional"* and gives the conversion `radius = f × E / 2`. The terrain kit is right; **the settlement kit is wrong**, and its own examples (150/180) were correct all along. |
| `cave.carver@0` | full section §7 | "**not in this profile**" (line 52) | Correct — but it means "sections 1–8 unchanged" is false on its face. |
| Biome | §5: "no biome key anywhere" | same claim, plus `intent.climate.biome` later | `intent.climate.biome` is legal in both. Both kits carry the same false absolute. |
| Root children | 4 generators, "nothing else" | district/city/precinct/infra/authored/scatter.program | Terrain **also** accepts `authored:` + `scatter.program@0` (C1). Neither kit's list is the code's list. |

**Action:** the settlement kit's line 342 is a live, high-severity bug — it teaches a fractional
radius that would place a sub-block wood and trip `LOAM-T118` on every forest node.
**This should be fixed in the settlement kit before anything in this audit.** It also means the
settlement audit's finding C17 should be re-graded: the defect is in the prose, not the examples.

---

# 5. What is worth preserving

- **The species catalog's description column.** "the pale vertical stroke", "pink, and the only
  pink there is", "the leaning grandfather: half its limbs dead". This is art direction a schema
  cannot carry, and it is the reason the kit produces varied woods. Do not compress it.
- **The layer/climates disclaimer** under the catalog — "the **layer** column is what the species
  is for, not a restriction" — is exactly the right way to state a soft default.
- **The fantasy-species gate** (§6). "A medieval fishing village must not sprout glow trees" is a
  semantic invariant the compiler enforces structurally (`fantasy: true` in
  `flora/species.ts:243`) and the kit explains *why*. Model and code agree; the prose earns
  its place.
- **"When to reach for a giant: sparingly."** One or two emergents per wood, never on a
  wilderness fill. This is walked-in taste, not derivable from anything.
- **The fungal grove worked example** and its framing ("a grove is not 'a forest with mushrooms
  in it': its **canopy layer is fungal**"). Best example in the document.
- **The intent-over-geometry contract** and the fractional-coordinate invariant — and note that,
  unlike the settlement kit, this one has **no absolute-coordinate escape hatch** anywhere. The
  invariant is actually clean here. Guard it.
- **The honest-limits framing** throughout §4/§7/§8: "gorges and canyons are dry by design",
  "a `ravine` under a shallow ridge is simply shorter… it is clipped, never allowed to breach".
  Telling a model what the compiler *will not* do prevents more bad output than telling it what
  it will.
- **Numeric tables that match the code.** I verified `HEIGHTFIELD_NUMS`, `EDIT_NUMS`,
  `CLIMATE_NUMS`, `FOREST_NUMS`, `VERB_SHAPE_KEYS`, `NOISE_STACK_DEFAULTS` and `FOREST_DEFAULTS`
  against the kit's tables and found **no numeric disagreement**. The per-verb shape-param table
  in §4 is an exact match for `VERB_SHAPE_KEYS`. That is unusual and worth protecting with a test.

---

# 6. Prioritized remediation

## Phase 0 — one-line fix outside this kit (do first)

1. `docs/kits/settlement-author.md:342` — forest `area.radius` is **blocks**, not a 0.01–1
   fraction. Delete the "same word, two units" warning; it describes a hazard that does not
   exist. (See §4 above.)

## Phase 1 — correctness, no architecture

2. **C3** — fix the wilderness density band and re-pin both worked examples (biome-silent bug).
3. **C2** — scope the "no biome key" sentence in §5 against `intent.climate.biome`.
4. **C1** — decide policy on `authored:`/`scatter.program@0`/`programs` in terrain, then either
   document them or state the exclusion as policy rather than legality.
5. **C9** — remove "at least one forest" from §11 or demote it to a heuristic.
6. **C5** — add `scaleReference` to the §3 table plus one sentence tying it to region size.
7. **C10** — delete the settlement clause from §3; annotate or drop `avoidTags`.
8. **C8** — state species-`snowLine`-beats-node-`snowLine`.
9. **C11** — drop the `LOAM-T114` codes and the "v0.2 §7" citations, or name the version axes.

## Phase 2 — generate the enumerations

11. Emit the per-node key allow-lists, `PROFILE_GENERATORS`, `VERB_SHAPE_KEYS`, `CAVE_STYLES`,
    `INTENT_KEYS`/`CHARACTER_KEYS`, the palette-symbol list and the species table from the spec
    package. Every one of these is currently hand-mirrored, and C1/C4/C5/C6 are all instances of
    the same mirror going stale.
12. Replace all three closure claims ("Nothing else is allowed", "Any key not listed in this kit
    is an error", "the table above is exhaustive per verb") with generated lists — the third one
    is currently *true*, which is precisely why it will be the next to break.

## Phase 3 — CI

13. Parse **and validate** every fenced JSON example against the real terrain validator. All 14
    parse today; none are known to validate.
14. Assert the kit's default columns against `NOISE_STACK_DEFAULTS`, `FOREST_DEFAULTS`,
    `UNDERGROWTH_DEFAULTS` and the `*_NUMS` specs. These currently agree — a test freezes that.
15. A golden-prompt suite for the terrain profile specifically: treeless desert (C9),
    whole-region wilderness fill (C3), 1024-region with tuned frequencies (C5), inland lake,
    fjord, archipelago, volcano, fungal grove, cave-only world.

## Phase 4 — interface refinements (optional)

16. H2 (`profile` overload), H1 (carver `radius` arity), H3/H4 (`density`/`frequency` anchors).
17. Trim §8 to its three novel items (L1); drop the empty `style` from the skeleton (L4).

---

# 7. Line-level issue index

| Approx. lines | Issue |
|---:|---|
| 34 vs code `validate.ts:189` | top level omits the legal `programs` key |
| 37–40 vs 234 | `intent.climate.biome` offered in §1, "no biome key anywhere" in §5 (**C2**) |
| 43–45 vs code `validate.ts:445-467` | "Nothing else is allowed" — `authored:` and `scatter.program@0` are legal root children (**C1**) |
| 49 vs code allow-lists | "No `constraints`, no `ports`" — both in the allow-list; constraints honoured on landmark children (**C4**) |
| 53 vs `INTENT_KEYS`/`CHARACTER_KEYS`/node keys | "Any key not listed in this kit is an error" is false (**C4/C6**) |
| 70–72 vs `scaleReference` | region size may vary but the frequency-rescaling param is undocumented (**C5**) |
| 105–108 | "the settlement's own ground is clamped separately" — no settlement in this profile (**C10**) |
| 136–153 | heightfield table omits `scaleReference` (**C5**) |
| 166–173 | verb shape table — verified exact match for `VERB_SHAPE_KEYS`; keep, and generate |
| 229–234 | "There is no biome key anywhere in the document" (**C2**) |
| 268 vs 411–416 vs 506 | wilderness band 0.02–0.05 vs "below 0.02 no longer paints forest" vs `FOREST_COVERAGE_DENSITY = 0.02` (**C3**) |
| 275 | node-level vs species-level `snowLine`, precedence unstated (**C8**) |
| 276 | `avoidTags` — inert in the terrain profile (**C10**) |
| 346–348 | "do not write `budget` or `exclusion`" — no enforcement found (**H7**) |
| 402–408 vs 411–416 | "use two forest nodes as a default pattern" immediately precedes the warning that the second one is not woods |
| 446–454 | `density` (cave) and `density` (forest) are incompatible quantities (**H3**); `entrances` tri-typed (**H5**) |
| 466–468, 482–484 | `LOAM-T114` codes + "v0.2 §7" citations colliding with the kit's own §7 (**C11**, **L3**) |
| 492–520 | §8 restates §4/§6; only items 1, 5, 8 are novel (**L1**) |
| 631–637, 788–792 | both worked wilderness fills (0.04, 0.03) paint the whole region forest (**C3**) |
| 708, 773 vs 18–19 | edit `"profile": "sharp"` vs document `"profile": "terrain"` (**H2**) |
| 21 | `"style": { "palettes": {} }` boilerplate in the skeleton (**L4**) |
| 803 | "at least one forest" — not validator-enforced (**C9**) |
| 800–814 | checklist paraphrases §1/§4/§6 and has already drifted (**H6**) |
| settlement `:342` | forest radius documented as a fraction; the code says blocks (**cross-kit**) |

---

# 8. Bottom line

The terrain kit is what the settlement kit should be shrunk *into*: a compact policy document
with good taste, honest limits, and numeric tables that currently match the compiler. Its
problems are not accretion — they are **mirror drift** (hand-copied enumerations that the code
has since outgrown) and **two prose absolutes that are simply false** (the biome key, the
wilderness-fill biome threshold).

Fix the settlement kit's forest-radius line first, because it is actively wrong today. Then run
Phase 1 on this kit — ten edits, none structural. Then generate the enumerations, because every
C-finding here except C2 and C3 exists only because a list is maintained in two places.

Do not re-architect this document. It should remain one prompt.
