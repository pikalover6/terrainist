# Audit: Loam Settlement Author Kit

**Source audited:** `5e4ec146-3487-4f4f-8a8e-97e64fb076e4.md`  
**Scope:** LLM-facing authoring contract, internal consistency, token/attention efficiency, maintainability, likely model failure modes, and whether this should remain one prompt/call.  
**Not audited:** actual compiler implementation or validator source. Where the document disagrees with itself, this audit can identify the contradiction but cannot determine which side matches the current codebase.

## Executive conclusion

The kit is not failing because the core idea is wrong. The core idea is strong: the LLM describes semantic intent, a deterministic compiler owns geometry, and the validator catches bad authoring. The problem is **feature accretion has turned the prompt into a second, hand-maintained copy of the compiler registry**.

That has produced two distinct costs:

1. **Correctness drift.** There are now direct contradictions about allowed root node kinds, building archetype selection, building dimensions/floors, biome authoring, era names, tag ownership, forest cardinality, and absolute coordinates. Some examples teach fields that nearby prose explicitly says are errors.
2. **Attention/token waste.** The model receives a large amount of registry history, alias-collision history, diagnostics, anecdotes, and irrelevant catalog entries on every request, even when the user asks for a simple glade or hamlet.

The right target is **not necessarily “multiple LLM calls for every world.”** A single authoring call can remain perfectly reasonable for simple and medium worlds. The stronger recommendation is:

> **Do not use one monolithic static prompt. Use a small stable authoring policy + machine-generated schema + dynamically selected catalog/module context + deterministic validation/repair.**

For genuinely complex worlds, a two-stage planner → Loam author flow is likely cleaner, but that decision does depend more on the rest of the codebase.

## Size and structural profile

Mechanical measurements of the current file:

- **4,392 lines**
- **45,702 whitespace-delimited words**
- **277,109 characters**
- **61 fenced JSON examples**, all of which parse as syntactically valid JSON
- Section 9 alone is **23,529 words**, slightly over half of the whole document
- `building.grammar@0` plus its archetype material (roughly lines 708–1580) is **13,997 words**
- The matcher/catalog tables inside that area (roughly lines 808–1536) are **12,746 words**
- `character.programs` is **4,943 words**

This means the largest reduction is available without touching the valuable terrain/settlement reasoning at all. The archetype registry and its alias history dominate the prompt.

---

# 1. Critical correctness issues

These are the findings most likely to make an LLM emit invalid or semantically wrong Loam even when it follows the prompt faithfully.

## C1. The root-child whitelist is obsolete and contradicts later sections

**Early contract (around lines 47–51):** `root.children` is said to contain exactly one heightfield, exactly one climate, any forests, optionally plaza/building/prop/road, and **“Nothing else is allowed.”**

Later the same document adds root-level or root-placeable concepts including:

- `district`
- `city`
- `infra.entry@0`
- `precinct.airport@0`
- `precinct.harbour@0`
- `precinct.farm@0`
- `authored:<id>` landmarks
- `scatter.program@0`

Section 9 itself already calls `district` and `city` root children (around lines 663–674), directly contradicting the “hard rules” near the top.

**Risk:** very high. The earliest rules are framed as validator-enforced invariants and the later rules are framed as legal features. A model cannot satisfy both.

**Fix:** never hand-maintain this list in prose. Generate a compact “legal root node union” from the same registry/schema the validator uses. If different node kinds are legal only in certain positions, encode that structurally in the schema.

## C2. “Settlement is a superset of terrain unchanged” is false inside the same introduction

Around lines 11–13, the settlement profile is described as a **superset of the terrain profile** with sections 1–8 unchanged. Around lines 52–56, `cave.carver@0` is explicitly excluded even though the terrain profile has it.

**Risk:** medium-high. It damages trust in the opening mental model and creates ambiguity for any future terrain feature.

**Fix:** replace “superset / unchanged” with “shares the terrain authoring vocabulary below, except for the explicit capability differences listed here.” Better: derive the shared node set from schema composition rather than prose.

## C3. Building archetype selection has mutually exclusive contracts

The document says:

- Around lines 799–802: **archetype comes from `tags`, not from a param**.
- Around line 1447: **“There is no `archetype` param; writing one is an error.”**
- Around line 1892: the district mix vocabulary is described as the same list that **`params.archetype`** and building tags draw on.
- Multiple worked examples use `params.archetype`, including roughly lines 1656, 1665, 2099, and 2273.

Examples include forms such as:

```json
"params": { "archetype": "skyscraper", "floors": 18 }
```

while the prose says this field is an error. The district example is even more problematic: its `opera` child requests `opera_house` with **3 floors and a 25×19 horizontal footprint**, while the catalog entry for `opera_house` says **1–2 floors** and recommends `[15, 15, 19]`. So the example is not merely using disputed syntax; it also appears to violate the catalog it is supposed to demonstrate.

**Risk:** critical. Examples have high behavioral influence on an LLM, and here they directly teach a forbidden field.

**Fix options:**

### Preferred architectural fix

Make archetype a **canonical explicit field** (for example `params.archetype` or top-level `archetype`) and make `tags` semantic metadata/selectors rather than dispatch control. Keep tag-based dispatch only as a backwards-compatibility fallback if needed.

This would also eliminate a large fraction of the alias-precedence prompt burden.

### Minimal documentation fix

If the compiler still truly dispatches only from tags, remove every `params.archetype` example/reference and give child landmarks the real archetype tag, e.g. `tags: ["skyscraper", "landmark"]`.

## C4. The generic building size/floor contract is obsolete for many legal archetypes

Around lines 731–745, the kit teaches:

- width/depth **7–13**
- floors **1–2**, with more “clamped to 2”

Later:

- the tall grammar allows horizontal footprints **7–24** and up to **20 floors** (around lines 1537–1575)
- many catalog entries use 15, 17, 19, 21, or larger dimensions
- district/city landmark examples use 18 floors and 21×19 footprints

The final checklist then repeats the obsolete small-building rule around lines 4370–4373: habitation means buildings with width 7–13 and the small-building height formula.

**Risk:** critical. The final checklist is especially dangerous because it appears immediately before output and can override the richer rules above.

**Fix:** split the concept explicitly:

- **ordinary shell grammar defaults:** 7–13, 1–2 floors
- **archetype-specific envelope constraints:** sourced from the archetype registry
- **tall grammar:** its own separate limits

Never put the ordinary-shell limits in the global final checklist.

## C5. The archetype precedence table is visibly corrupted by accretion

The matching table around lines 808–832 starts with a sequence of priority rows and then repeats priority numbers and fallback rows multiple times. For example, after a complete-looking 1–13 sequence, it adds more 10/11/12/13/14 rows, then repeats 10/11/12/13 again.

The surrounding catalog also has inconsistent historical labels such as:

- multiple unrelated “table 9”, “table 10”, “table 11”, etc.
- wave sections presented out of chronological/priority order
- duplicated adjacent headings around lines 1157–1158: `Wave 3C (table 10)` and `Wave 3C (table 11)`

**Risk:** critical if the model is expected to reason about tag collisions. It is also a strong sign that the prompt is functioning as release-history documentation rather than an authoring interface.

**Fix:** delete hand-written precedence history from the LLM prompt. Generate one canonical registry view from code. Better still, adopt explicit canonical archetype selection so alias precedence becomes mostly irrelevant to generated documents.

## C6. Biome authoring is both forbidden and supported

Around lines 303–308, the climate section says biomes are derived and **“There is no biome key anywhere in the document.”**

Around line 2805, `intent.climate` explicitly supports:

```json
{ "biome": "minecraft:<id>", ... }
```

**Risk:** high. These are direct opposites.

**Fix:** scope the earlier statement accurately, e.g.:

> `terrain.climate@0` does not take a biome id; terrain biomes are derived. Settlement-scoped `intent.climate.biome` may override the derived biome inside its scope.

## C7. The era vocabulary disagrees with itself

Around line 2800, canonical era classes include `early_modern`.

Around lines 2810–2830, the same section says the internal classes include `renaissance`, and examples map colonial/pirate/baroque/age-of-sail to `renaissance`.

**Risk:** high because era affects many downstream passes and the document strongly recommends always setting it.

**Fix:** choose one canonical enum and generate both the enum and alias table from code. If `renaissance` is merely an alias for `early_modern`, say so explicitly and only recommend the canonical output value.

## C8. Bare `station` changes ownership inside the prompt

Around line 882, the “depths” discussion says bare `station` belongs to nobody.

Around lines 1518 onward, Wave 6A says bare `station` belongs to the train station and explains that this was intentionally reserved earlier.

There is also intermediate text saying bare `station` was left free for the future railway station.

**Risk:** medium-high. The chronology is understandable to a human maintainer, but an LLM sees all states simultaneously.

**Fix:** remove historical ownership statements. Present only the current canonical alias table.

## C9. Forest cardinality conflicts with the final checklist

The early hard rules say root may contain **any number** of `scatter.forest@0` nodes, which naturally includes zero.

The final checklist says every document has “one heightfield, one climate, **at least one forest**” (around line 4365).

This is particularly suspect for deserts, bare alpine terrain, moonscapes, or other intentionally treeless worlds.

**Risk:** medium-high. The final checklist can force unwanted vegetation.

**Fix:** decide whether a forest is actually validator-required. If not, remove “at least one forest.” If vegetation is desirable by default, express it as a conditional authoring heuristic, not a global invariant.

## C10. JSON-only output conflicts with “when in doubt, ask”

The opening contract requires the entire output to be one JSON object and forbids prose (lines 3–5).

The bespoke-program guidance later says **“When in doubt, ask.”** (around line 3022).

In a one-shot API authoring call, the model cannot both ask a clarification and satisfy the output contract.

**Risk:** medium-high, depending on how this prompt is invoked.

**Fix:** choose an interaction contract:

- If the author call is one-shot: replace “ask” with a deterministic fallback rule.
- If clarification is allowed: make that a separate planner/interaction state before entering JSON-author mode.

## C11. Version terminology is ambiguous

The document hard-codes `"loam": "0.1"`, while later sections describe parts of “the v0.2 vocabulary” that parse but are ignored (for example around lines 3588 and 3750).

This may be intentional if the registry vocabulary version is distinct from the profile version, but the document does not explain that distinction.

**Risk:** medium. It makes it unclear whether the kit itself is stale or whether multiple version axes exist.

**Fix:** explicitly name version axes. If there is only one version, remove v0.2 references from a v0.1 kit. If there are separate registry/profile versions, expose both with unambiguous names.

## C12. Basement values are incompletely specified early

The early building param table around line 750 lists `basement` as `true`, `3..5`, or `{depth: 3..5}`.

Later, the depths/tunnel sections state that `false` and `0` explicitly mean no cellar (around lines 879 and 3676 onward).

**Risk:** medium. The later description is richer, but the canonical parameter table should not omit valid forms.

**Fix:** have one generated parameter schema and let prose explain semantics, not duplicate accepted values in multiple places.


## C13. Bespoke-program constraint examples use an undocumented `distance` shape

The general constraint section teaches the shorthand form:

```json
{ "distance": "plaza", "min": 8, "max": 60 }
```

But bespoke-program examples around lines 3185 and 3225 instead use:

```json
{ "distance": { "to": "camp", "max": 90 } }
```

No surrounding schema explains this nested `to` form. It may be a legal longhand retained by the parser, or it may be stale example syntax.

**Risk:** medium-high because constraint syntax is central and the alternate form appears only in high-salience examples.

**Fix:** choose one canonical emitted form and make every example use it. If longhand remains supported for compatibility, document it as accepted input but still tell the model to emit one normalized shape.

## C14. A character palette example uses an undocumented palette symbol

The palette symbol section names `ground.surface`, `ground.subsurface`, `ground.stone`, `ground.cliff`, `ground.beach`, etc. The two-region character example later uses `ground.grass`, which does not appear anywhere else in the kit.

**Risk:** medium-high under the kit's own rule that invented keys/symbols are errors.

**Fix:** verify the actual palette registry. If `ground.grass` is stale, change the example to `ground.surface`; if it is a valid settlement-scoped symbol, add it to the generated palette registry instead of leaving it implicit.

## C15. Bespoke centerpiece policy conflicts with bespoke failure policy

The program section says the prompt's centerpiece **should be a bespoke landmark even when a stock archetype can approximate it**. Later it says a program may fail its gate and be dropped, and therefore **the world's legibility must never depend on a program existing**.

Both goals are reasonable, but together they need an explicit fallback rule.

**Fix:** require every identity-critical bespoke request to have a fallback delivery mechanism (stock archetype, prop, terrain form, or repeated motif) that still passes the stranger test if the program is dropped. Alternatively, only make a program mandatory after it has successfully passed its generation/lint gate and repair the Loam document if it fails.


## C16. Galleon placement guidance contradicts the prop catalog and water semantics

The prop catalog marks `galleon` as a **water** prop. The following “big prop needs big flat ground” paragraph nevertheless uses the galleon as an example of something “marked flat” that wants a `plateau` edit, and the settlement-composition section later groups “a keep, a tall building, a campsite or a galleon” together as needing a level patch/plateau.

A plateau is sensible insurance for large ground structures, but raising/flattening land under a water-only hull can remove or shallow the water it needs. This also conflicts with the harbour/land-water guidance elsewhere.

**Fix:** separate placement heuristics by base type:

- large **ground** props need genuinely flat ground or a pad/plateau;
- large **water** props need enough connected water footprint/depth and should not be “fixed” with a land plateau;
- large **shore** props need both a usable dry apron and adjacent water.

This is another good candidate for registry metadata rather than prose: `base`, footprint, flatness/depth requirements, and whether the prop may alter ground should be machine-readable.


## C17. Both bounded-forest examples violate the documented forest `radius` type/range

The main `scatter.forest@0` example uses:

```json
"area": { "at": [0.5, 0.5], "radius": 150 }
```

and the fungal-grove example uses `radius: 180`.

But the parameter table immediately below says forest-area `radius` is a **fraction of the region radius** in roughly **0.01–1**, explicitly contrasting it with terrain-edit radii in blocks and warning that this unit mismatch “is the one that bites.”

This is one of the clearest prompt defects in the file: the examples demonstrate exactly the unit error the prose warns against.

**Risk:** critical. Examples are likely to dominate model behavior, and `150`/`180` are impossible under the documented fractional range.

**Fix:** determine the compiler truth and update both schema and examples. If the intended API really is fractional, use values such as `0.25`/`0.35`. If the compiler evolved to block radii, update the parameter table and remove the unit-warning text. Longer-term, rename the field to make units explicit.


## C18. `distance` measurement semantics contradict themselves within Section 10

The named-set-piece guidance around line 3570 says **distance is measured to the node's edge**. Roughly sixty lines later, the constraint notes say **`distance` measures between centres by default** and requires `"measure": "surface"` for face-to-face measurement.

These cannot both describe the default behavior.

**Risk:** high because spacing/tethering is one of the main mechanisms used instead of absolute coordinates. A model following the wrong interpretation can place landmarks materially too close or too far away.

**Fix:** define one canonical measurement model in the constraint schema, including the exact geometry used for `min`/`max`, and make all prose/examples refer to it. If `measure` has an enum, document/generate the complete enum.


## C19. “Every building needs `terrain_conform`” does not hold for district/city child landmarks

The district rules say landmark children are placed by frontage and **constraints on a district child are ignored**. The constraint notes later say **every building needs a `terrain_conform`**. The final checklist repeats the universal terrain-conform expectation for habitation.

A district/city child landmark therefore cannot satisfy the rule in the same way as a root-level solver-placed building. Its parent fabric is evidently responsible for its ground.

**Fix:** scope the rule: every **root-level solver-placed building** needs terrain conforming unless its container/generator owns ground preparation. Parent-managed children and precinct internals should be explicit exceptions in the schema/policy.


## C20. `intent` has two world-scope homes without documented precedence

The intent section says `intent` is legal both at the **top level** and on the **root composite**, in addition to district/city scope. The inheritance section explains how district/city overrides world intent, but does not explain what happens if both top-level and root intent are present.

If these are aliases for the same scope, exposing both to the LLM is unnecessary ambiguity. If one overrides the other, that precedence is currently missing from the authoring contract.

**Fix:** normalize generated documents to one canonical world-scope location. Keep the other only as parser compatibility if needed, and have the compiler normalize it before authoring/inheritance.


## C21. Bespoke landmarks are told to become district children, but district/city children are documented as `building.grammar@0` only

The district and city field tables both define `children` as **`building.grammar@0` nodes**. The bespoke-program “prominence law” later says that if a custom landmark belongs inside the town, make the `authored:<id>` node a **child of the district**.

Those contracts differ on whether an authored program node is a legal district child.

**Risk:** high. This is exactly the sort of placement rule a model will follow for a centerpiece, so a stale child-type rule can break the most important node in a world.

**Fix:** have the parent-child schema state the real union. If district/city can host arbitrary landmark generators, say so and generate the union. If they can host only building grammar nodes, the prominence guidance needs a different supported mechanism for seating bespoke landmarks inside fabric.


## C22. Bespoke seating has two competing “defaults”

In the seating section, `seat: "conform"` is described as **the default the compiler picks for a bespoke program whose author followed the ground**. The very next mode, `seat: "pad"`, is described as **the default, and what you get by writing nothing**.

The likely intended behavior is conditional: omit `seat` → use `conform` when the program was certified terrain-aware, otherwise use `pad`. But that is not what the wording currently says.

**Fix:** document a single `auto`/omitted decision rule, then describe `conform` and `pad` as explicit overrides. If feasible, exposing an explicit `seat: "auto"` internally can make the default decision auditable while the LLM usually omits it.

---

# 2. High-risk LLM interface design issues

These may be legal in the compiler but make the authoring language harder for an LLM than it needs to be.

## H1. `at` is severely overloaded

The document uses `at` for several unrelated meanings:

- terrain/forest fractional placement (`[fx, fz]`)
- a soft structure constraint with fractional coordinates
- `prop.place@0` absolute block columns (`{"x": ..., "z": ...}`)
- the symbolic string `"pier"`
- normalized position along an `along` corridor (`0.5` or a range)

This forces the model to infer type and units from local context every time.

**Recommendation:** use distinct field names in the authoring surface even if the compiler internally normalizes them, e.g. `atFraction`, `atBlock`, `anchor`, `positionAlong`. At minimum, remove the absolute-block form from the LLM-facing schema unless it is genuinely necessary.

## H2. The document’s strongest placement invariant has an escape hatch that negates it

The introduction says **“You never write absolute block coordinates.”** (around lines 7–8).

The prop section later exposes `{"at": {"x": ..., "z": ...}}` as an **absolute-column escape hatch** (around line 2437).

Even if technically useful, this weakens a very valuable global invariant.

**Recommendation:** keep absolute placement as an internal/debug API, not an ordinary LLM authoring feature. If it must remain, rename it so it cannot be confused with fractional `at`.

## H3. `radius` uses incompatible units in different node types

The document itself calls out the hazard: terrain edit `radius` is blocks; forest area `radius` is a fraction of the region radius.

When the authoring guide has to say “same word, two units, and this is the one that bites,” that is evidence the schema should change.

**Recommendation:** rename one side (`radiusBlocks`, `radiusFraction`) in the LLM-facing representation. A translation layer can preserve old compiler structures if necessary.

## H4. `terrain_conform` is not specified centrally enough

The constraints section lists `terrain_conform` but its legal modes and subfields are spread across the rest of the document. Later, farm precincts use `terrain_conform: "drape"`, while ordinary building guidance focuses on `cut_fill` and `flatten`.

The same word `drape` also appears as a seating mode for bespoke programs, which compounds ambiguity.

**Recommendation:** one canonical constraint schema should list every legal `terrain_conform` mode and mode-specific fields. Then the prose only explains when each is appropriate.

## H5. Direct buildings and district mixes use different archetype interfaces

A district `mix` uses canonical archetype names. A direct building is taught to trigger its archetype through tags/aliases. `intent.character.archetypes` also uses catalog IDs.

This creates unnecessary translation work for the LLM and is probably why `params.archetype` keeps “accidentally” appearing in examples.

**Recommendation:** unify all three around canonical archetype IDs.

## H6. Tags currently serve too many roles

Tags appear to be simultaneously:

- archetype dispatch aliases
- semantic categories (`house`, `trade`, `craft`)
- selectors for constraints (`#tag:house`)
- thematic metadata (`landmark`, `civic`, `urban`)

A field used both as executable dispatch and free semantic metadata inevitably needs alias-priority rules.

**Recommendation:** split executable identity from semantic tags. For example:

```json
{
  "archetype": "skyscraper",
  "tags": ["house", "landmark"]
}
```

That single change could remove thousands of prompt words about alias collisions.

## H7. `character.flora` says “there are exactly four” while the forest catalog has 21 shapes

The forest section lists 21 species shapes. Later, `intent.character.flora` says tree shapes “are exactly four” and lists the legacy four.

This may be technically correct if `character.flora` is wired only to a smaller registry, but the wording makes the global vocabulary look contradictory.

**Recommendation:** say explicitly: “`character.flora` currently accepts only these four legacy registry IDs; `scatter.forest@0.species` has the larger species vocabulary.” Better: let both consume the same registry if feasible.

## H8. The model is told to run a CLI that it may not have

The intent section says to run `terrainist catalog` and `terrainist catalog --category prop` for full lists.

If the authoring LLM call has no shell/tool access, this is unusable instruction. Worse, the prompt simultaneously says unknown IDs are dropped or error, encouraging a model to guess from an incomplete ellipsis.

**Recommendation:** never tell an unaided authoring call to consult an unavailable external catalog. Inject the relevant catalog entries into its context, or expose a real catalog tool.

## H9. The “stranger test” is useful, but its operational wording is risky

The thematic/icon reasoning is one of the strongest parts of the kit. However, the final checklist says to **list** the prompt’s icons before finishing while the output contract forbids anything except JSON.

Modern models usually keep such planning internal, but this is still a competing instruction.

**Recommendation:** reword as a silent preflight criterion:

> Before emitting JSON, internally verify that each required icon has an explicit delivery mechanism in the document.

Also note that palette-based icons do not naturally have a node id, so “find each by node id” is too narrow.

## H10. The final checklist is not a safe source of truth

The last section mixes genuine global invariants with old village-specific heuristics and feature-specific rules. Because of its location and imperative style, it likely has disproportionate influence.

Examples of problematic checklist items:

- “at least one forest”
- universal 7–13 building width
- universal small-building height formula
- universal plaza/road assumptions for all habitation

A city, precinct, or non-plaza settlement can legitimately violate those assumptions.

**Recommendation:** make the final preflight **short and schema-derived**. It should only contain invariants that are truly universal.


## H11. Internal generator names leak into the author-facing language

Walls are authored through `params.walls` on a district/city; the wall section explicitly says that is the entire authoring surface. Elsewhere, the icon guidance and final checklist refer to an **`infra.wall@0` ring/circuit** and say to “write the wall.”

That wording makes an internal implementation identity look like an authorable root generator, especially because `infra.entry@0` *is* directly authorable nearby.

**Recommendation:** distinguish internal implementation generators from public authoring nodes. In the LLM prompt, say “set `params.walls`” and omit `infra.wall@0` unless the model can legally emit it.

---

# 3. Prompt-length and attention inefficiencies

## L1. The archetype catalog is the largest avoidable cost

Approximately 12.7k words are spent on archetype tables, “wave” history, collision explanations, and precedence discussions.

For most requests the model needs perhaps 5–20 relevant archetypes, not hundreds plus the history of why one alias was reserved six waves ago.

**Recommendation:** keep the full catalog outside the static prompt as structured registry data. Retrieve/inject only:

- canonical ID
- concise semantic description
- accepted aliases only if aliases remain necessary
- envelope/floor constraints
- special compatibility flags (`plainRect`, tall grammar, etc.)

Do not inject development-wave history.

## L2. Development history is being used as runtime instruction

Phrases such as “Wave 5A”, “table 12”, “an earlier table owns”, “left free on purpose”, and “this is that later” document how the catalog evolved, not how an author should use its current state.

That information is valuable for maintainers but actively harmful in an LLM prompt because it presents superseded states alongside current ones.

**Recommendation:** move it to changelog/maintainer docs. The LLM gets only current canonical behavior.

## L3. Diagnostic codes are overrepresented

The kit mentions **58 diagnostic-code occurrences across 46 unique LOAM codes**.

The model rarely needs the code number before generating. It needs the semantic consequence and fix. Exact codes are more useful after validation.

**Recommendation:** remove most codes from the authoring prompt. Let the validator return them during a repair pass, with targeted remediation text.

## L4. Failure anecdotes are valuable evidence but expensive runtime context

The “walked Troy”, pirate/unicorn island, harbour-city, and similar cases are excellent regression-test material. They are less valuable as repeated runtime prompt text.

**Recommendation:** convert anecdotes into golden tests. Keep only the distilled invariant in the author prompt.

Example:

- Runtime prompt: “For multiple named islands, use one island edit per landmass and preserve water between them.”
- Regression test: keep the full pirate/unicorn failure case.

## L5. Current-state guidance, composition guidance, examples, and final checklist repeat the same ideas

Water connectivity, plateau insurance, forest density, terrain conforming, road anchoring, and settlement spacing recur in sections 4, 7, 8, 12, 13, and 14.

Repetition can improve compliance up to a point, but here it also increases the chance that one copy becomes stale while another is updated.

**Recommendation:** one canonical rule + one example. A final preflight may repeat only the highest-value invariant in a few words.

## L6. `formPacks` is an enormous single table cell

The `character.formPacks` row around line 2854 contains a very long inline catalog of pack IDs plus rich descriptions and alias caveats.

Besides raw token cost, this is poor for:

- diffs
- semantic chunking/retrieval
- targeted prompt assembly
- human review

There is even a visible punctuation artifact before `feudal_japanese` (`).,`), another sign the row has exceeded a maintainable format.

**Recommendation:** one structured record per form pack, stored outside the core prompt. Inject only the selected/relevant packs.

## L7. Bespoke-program guidance should be conditional context

`character.programs` is nearly 5k words. A plain landscape, ordinary village, or normal city does not need most of it.

**Recommendation:** planner/classifier decides whether the prompt contains a bespoke centerpiece or repeating custom icon. Only then inject the program-authoring module.

## L8. Worked examples should be fewer, schema-tested, and representative

The document has many fragments plus a complete example. Examples are useful, but every example becomes another de facto source of truth.

**Recommendation:** keep a small set of golden examples selected by task class and validate them in CI against the current compiler/schema. Never ship an example that the current validator rejects.

## L9. Static/derivable metadata can be injected by the host

The LLM currently authors or copies fields that the host already knows or can derive:

- `loam: "0.1"`
- `profile: "settlement"`
- `root.id: "world"`
- `root.kind: "composite"`
- `meta.prompt`: the host already has the user prompt
- potentially `worldSeed`: often better assigned outside the model
- potentially `meta.name`: could be host slugification if creative naming is not important
- `label` / `note`: useful for debugging and human inspection, but they do not need to be encouraged on nearly every example if compact output matters

**Recommendation:** consider generating a partial payload containing only semantic author choices, then have the host wrap/inject static metadata. If labels are valuable for reports, make them an explicit debug/readability mode; otherwise omit them by default. This reduces output tokens and removes trivial failure modes.

---

# 4. Specific stale/ambiguous areas that should be reconciled

This is a checklist for a codebase-backed follow-up audit.

| Area | Document states | Conflicting state | What codebase audit should answer |
|---|---|---|---|
| Root child union | Only terrain/climate/forest/plaza/building/prop/road | district/city/infra/precinct/authored/scatter-program later | Exact legal child kinds by parent |
| Archetype selection | Tags only; `archetype` is error | examples and prose use `params.archetype` | Is explicit archetype accepted today? |
| Floors | 1–2, clamp above 2 | tall grammar up to 20; 3-floor examples | Per-archetype floor schema |
| Footprint | 7–13 ordinary | 15–25+ entries and tall 7–24 | Per-archetype envelope bounds |
| Forest count | any number | final says at least one | Is zero legal? |
| Biome | never authored | `intent.climate.biome` | Scope/precedence of biome override |
| Era | `early_modern` class | `renaissance` class | Canonical enum + aliases |
| Station alias | belongs to nobody | belongs to train station | Current alias owner |
| Basement | true/3..5/object | false/0 also valid | Complete accepted union |
| Absolute props | global “never absolute” | prop absolute escape hatch | Keep, rename, or hide from LLM |
| Versions | profile 0.1 | “v0.2 vocabulary” references | Version-axis model |
| `terrain_conform` | cut/fill/flatten examples | farm uses drape | Complete mode enum/field schema |
| `intent` placement | structure-node field list omits it | district/city/root/top allow it | Canonical node field union and inheritance |
| Flora | 21 forest species | character flora exactly four | Separate registries or stale limitation? |

---

# 5. What is worth preserving

The audit is not a recommendation to compress everything into a dry JSON Schema. Several kinds of prose are doing valuable work that a validator cannot replace.

## Keep: intent-over-geometry philosophy

The strongest invariant is that the LLM describes coarse intent and the solver owns geometry. This is exactly the right division of labor for generative terrain/layout.

## Keep: semantic failure guidance where the compiler cannot infer intent

Examples:

- water that must flood needs actual sea connectivity
- a settlement needs enough land under its envelope
- two named islands need actual separate landmasses and water between them
- a ruined city is not a bag of ruin archetypes
- an installation such as an airport/harbour should use a precinct rather than independently scattered props
- a custom centerpiece should be a program only when the stock catalog cannot carry the prompt identity

These are semantic decisions. They belong in the LLM-facing policy, though usually in shorter form.

## Keep: “icons / stranger test” as a planning heuristic

This is a good way to combat generic but pretty outputs. It should be retained as an internal planning criterion, not as a requirement to emit an extra list.

## Keep: envelope and terrain compatibility heuristics

The compiler can reject impossible combinations, but the model benefits from knowing that large/tall structures need appropriate ground and that certain urban forms require particular spatial scales.

## Keep: deterministic compiler ownership

Where the compiler can derive exact geometry—walls, gates, routes, precinct internals, city armatures—the prompt correctly tells the model not to micromanage it. That principle should become even more aggressive as the project grows.

---

# 6. Recommended prompt architecture

## 6.1 Replace the monolith with four layers

### Layer A — stable author policy

A small human-written prompt, ideally a few thousand words at most, containing only:

1. output contract
2. intent-over-geometry principle
3. coordinate/placement semantics
4. terrain-before-settlement semantic rules
5. when to choose village vs district vs city vs precinct
6. intent/character semantics
7. when bespoke programs are justified
8. a short silent preflight

This should change rarely.

### Layer B — machine-generated schema

Generated directly from the same source of truth as the validator:

- allowed node kinds by parent
- required/optional fields
- enum values
- numeric ranges
- union types
- cardinality
- constraint/port forms
- generator-specific params

If your model/API supports schema-constrained decoding, use it. Even without constrained decoding, injecting a compact generated schema is safer than hand-maintained prose.

### Layer C — dynamically selected registry/catalog context

First route the request by capability. The document itself says terrain-only worlds are valid; such a request should not pay the context cost of the settlement, city, precinct, infrastructure, and bespoke-program manuals. A wilderness request can receive only the terrain authoring policy/schema while the host still wraps the result in whatever profile the compiler requires.

For settlement requests, only inject entries relevant to the user prompt or the planner output:

- archetypes
- props
- form packs
- flora/species
- infra entries
- precincts
- special programs module

The catalog should be generated from code/registry records, not copied into prose.

### Layer D — validator feedback on repair

After generation:

1. parse JSON
2. run the real Loam validator/compiler dry run
3. if invalid or semantically degraded, send the candidate plus diagnostics to a repair call
4. repair only the affected areas

Do not pre-spend thousands of tokens explaining 46 diagnostic codes that may never trigger.

## 6.2 A useful intermediate representation for complex prompts

For large worlds, a first pass could produce a compact **WorldBrief** rather than Loam itself. Example conceptual fields:

```json
{
  "scale": "city",
  "terrain": ["coast", "two islands", "volcanic ridge"],
  "settlements": [
    {"role": "pirate_haven", "era": "early_modern", "form": "grown"},
    {"role": "rival_fortress", "era": "early_modern", "form": "radial"}
  ],
  "required_icons": ["galleon", "harbour chain", "fortress wall"],
  "modules": ["harbour", "walls", "infra", "programs"],
  "bespoke": ["flagship_wreck"]
}
```

The host then uses that brief to retrieve exact registry slices and invokes the Loam author with only relevant context.

This stage does not have to be another expensive LLM call in every case. It could be:

- skipped for simple prompts
- done by a small/fast model
- partly deterministic keyword/registry retrieval
- produced internally by the same model if your serving architecture supports staged reasoning

---

# 7. Should the task be handled in a single prompt/call?

## Short answer

**Single authoring call: often yes. Single giant static prompt: no.**

## When one authoring call is enough

A single call is appropriate when the request is approximately:

- one landscape
- one hamlet/village/district
- no multi-faction composition
- no bespoke centerpiece program
- limited special infrastructure

With a dynamically assembled prompt, the model should be able to produce the final Loam JSON directly.

## When a planning stage becomes worthwhile

Use an explicit planner/brief stage when the prompt combines several of:

- multiple settlements or factions
- multiple landmasses/water relationships
- a city plus special precincts
- strong historical/cultural theming
- several required visual icons
- siege/invasion/disaster staging
- bespoke programs
- large-scale city composition

Those requests require the model to do **requirement decomposition and schema authoring at the same time**. Separating them reduces omission risk and lets you retrieve only the registry entries actually needed.

## Why splitting by “terrain call” and “settlement call” is not automatically best

Terrain and settlement are tightly coupled in this language: landmass size, coast placement, slopes, plateaus, water access, city envelope, and special precincts constrain each other. A hard terrain-first LLM split can create coordination problems unless both stages share a brief and the second can request/repair terrain changes.

A better split is usually:

1. **semantic plan / world brief**
2. **single integrated Loam authoring pass**
3. **deterministic validation + targeted repair**

That preserves cross-layer composition while reducing cognitive load.

---

# 8. Highest-leverage language/API redesigns

These are more invasive than documentation cleanup but could dramatically simplify the prompt.

## R1. Add canonical `archetype` identity

This is the single strongest candidate.

Current design makes the model understand thousands of words of tag-alias precedence. Yet district mixes already operate on canonical archetype IDs, and the examples repeatedly “want” to write an explicit archetype field.

Recommended author-facing shape:

```json
{
  "generator": "building.grammar@0",
  "archetype": "skyscraper",
  "tags": ["house", "landmark"]
}
```

or, if params are preferred:

```json
"params": { "archetype": "skyscraper", "floors": 18 }
```

The compiler can retain tag-based fallback for older documents.

## R2. Make units explicit in field names or types

Problem pairs:

- terrain radius in blocks vs forest radius as fraction
- `at` fractional vs absolute vs symbolic vs path position

Recommended authoring API should encode the unit in the field/type so prose is not the only guardrail.

## R3. Move placement/debug escape hatches out of normal author mode

Absolute prop placement is likely useful for debugging or handcrafted fixtures. It is counterproductive in a prompt built around solver-owned geometry.

Consider separate authoring profiles/modes:

- semantic author mode for LLMs
- low-level/debug mode for humans/tests

## R4. Let the host inject boilerplate

If possible, the LLM should not spend attention copying constants or known user metadata. Have it author the semantic body and let the host wrap it into the full document.

## R5. Prefer canonical IDs over natural-language aliases in generated output

Aliases are helpful for user input and retrieval. Generated JSON should use canonical IDs wherever possible. This shrinks the need to teach collision behavior and makes documents stable across wording changes.

---

# 9. Suggested target size

A precise target depends on the model and prompt distribution, but a reasonable goal is:

- **core stable policy:** ~3k–6k words
- **task-specific schema/catalog appendix:** ~1k–5k words for ordinary requests
- **program module:** injected only when needed
- **examples:** 1–2 selected examples, not the entire history

That puts a normal request in roughly the **5k–10k word** instruction range rather than ~45.7k words, while still allowing a complex request to pull more context when it genuinely needs it.

This is a plausible **75–85% average reduction** in static instruction volume without deleting the important semantic knowledge.

---

# 10. Prioritized remediation plan

## Phase 1 — correctness cleanup before any architecture work

1. Reconcile the legal root-child union.
2. Decide whether explicit `archetype` is legal; fix all examples accordingly.
3. Remove the obsolete universal 7–13 / 1–2 rules from the final checklist.
4. Replace the corrupted matcher-priority table with one current generated view.
5. Fix `early_modern` vs `renaissance`.
6. Scope the “no biome key” statement around `intent.climate.biome`.
7. Resolve `station` ownership.
8. Resolve zero-forest legality.
9. Clarify version terminology.
10. Reconcile basement and `terrain_conform` accepted forms.

These changes should happen even if the project keeps the current single-prompt architecture.

## Phase 2 — remove registry duplication

1. Export machine-readable node/param schemas from the compiler.
2. Export archetype/prop/form-pack registries from the compiler.
3. Generate LLM-facing compact tables from those sources.
4. Delete wave/changelog/collision-history prose from runtime context.
5. Move anecdotes into regression tests/maintainer docs.

## Phase 3 — dynamic context assembly

1. Classify the user prompt into required modules.
2. Retrieve only relevant catalog entries.
3. Inject bespoke-program docs only when required.
4. Keep one integrated authoring call for simple/medium tasks.

## Phase 4 — validation/repair loop

1. Validate every model output deterministically.
2. Return only actionable diagnostics plus affected schema fragments to a repair pass.
3. Optionally compile a low-cost preview/report and repair severe semantic warnings such as insufficient land or unresolved targets.

## Phase 5 — optional semantic planner

Add a WorldBrief/planning stage for complex multi-region prompts if empirical tests show omission/composition failures remain after dynamic context and validation.

---

# 11. Regression and CI recommendations

The project has enough language surface now that the author kit should be tested like code.

## Documentation/schema tests

- Parse every fenced JSON example.
- Validate every fenced JSON example against the current Loam validator.
- Fail CI if an example uses an unknown key or obsolete enum.
- Generate root node/cardinality tables rather than hand-write them.
- Generate final enum lists from registry definitions.
- Detect duplicate/conflicting canonical alias owners.
- Detect documentation references to params not present in schema.
- Detect schema params that have no author-facing description if they require semantic judgment.

## Golden-prompt suite

At minimum include:

1. treeless desert wilderness
2. dense old forest
3. fjord with sea-connected water
4. island pair with preserved strait
5. simple hamlet
6. farm village requiring `precinct.farm@0`
7. harbour settlement requiring water/land balance
8. large modern city with tall grammar
9. ancient walled city
10. ruined district via `intent.decline`
11. hillside/stepped district
12. train station using the bare/current canonical alias
13. bunker/depths case
14. city + sibling airport/harbour precinct
15. invasion/siege with bespoke centerpiece + repeated scatter
16. terrain-only world with no structures

For each, assert not only schema validity but critical semantic properties: water remains water, required settlements fit on land, requested icons exist, no unwanted modern fittings in pre-modern worlds, etc.

## Prompt-ablation tests

Once the prompt is modular, measure whether removing a module changes outputs for requests that should not need it. If a plain hamlet changes materially when the airport catalog is omitted, there is unwanted cross-contamination.

---

# 12. Line-level issue index

This index is intended to make the cleanup pass fast.

| Approx. lines | Issue |
|---:|---|
| 11–13 vs 52–56 | “terrain superset unchanged” vs cave exclusion |
| 47–51 vs 663–674+ | stale root child whitelist |
| 322/456 vs 342 | forest examples use radius 150/180 while docs say fractional radius 0.01–1 |
| 303–308 vs ~2805 | “no biome key anywhere” vs `intent.climate.biome` |
| 731–745 vs 1537–1575 | ordinary building limits presented as global vs tall grammar |
| 799–832 | archetype-from-tags rule + corrupted matcher priority table |
| 879 vs 750 / 3676+ | basement `0`/`false` accepted later but omitted early |
| ~882 vs ~1518 | bare `station` ownership conflict |
| 1157–1158 | duplicated Wave 3C heading with two table numbers |
| ~1447 vs 1656/1665/1892/2099/2273 | `archetype` param forbidden vs used |
| ~1550 vs final ~4370 | tall footprint/floors vs stale final small-building checklist |
| ~1685/~2121 vs ~3211 | district/city children documented as building grammar only, but bespoke authored landmark is told to become a district child |
| ~1901 vs ~3625/~4371 | district child constraints are ignored vs “every building needs terrain_conform” |
| ~2437 vs 7–8 | absolute prop placement escape hatch vs global prohibition |
| ~2787–2792 | `intent` allowed at both top-level and root with no stated precedence |
| ~2800 vs 2810+ | `early_modern` vs `renaissance` canonical era |
| ~2854 | oversized `formPacks` registry embedded in one prose/table cell |
| ~2876/~2882 | asks model to run CLI for missing catalog entries |
| ~2884 vs 353–382 | character flora “exactly four” vs larger species vocabulary |
| ~2931/~2949 vs 541–548 | `ground.grass` used but not present in documented palette symbols |
| ~3022 vs 3–5 | “when in doubt, ask” vs JSON-only author mode |
| ~3018 vs 3179–3180 | centerpiece should be bespoke vs world must not depend on bespoke program success |
| ~3185/~3225 vs 3528+ | nested `{distance:{to:...}}` examples vs canonical shorthand constraint syntax |
| ~3430–3450 | both `conform` and `pad` are described as the omitted/default bespoke seat |
| ~3570 vs ~3630 | `distance` is said to be edge-based and centre-based by default |
| ~3588/~3750 vs 28/43 | v0.2 vocabulary references inside `loam: 0.1` kit |
| ~2427–2437 and ~4247 | galleon is water-based but is used as a “flat ground / plateau” example |
| ~4131/~4194 | `terrain_conform: drape` appears outside a centralized mode schema |
| 4365 | final checklist adds “at least one forest” |
| 4370–4373 | final checklist reasserts village-only building assumptions globally |

---

# 13. Bottom line

The project has crossed the point where an LLM prompt should double as the full language reference manual.

The current kit “works” because it contains a lot of good semantic knowledge and because the compiler/validator appears forgiving and diagnostic-rich. But the same redundancy that made it robust when the language was small now creates **contradictory authority** as the feature set grows.

The best next move is not primarily to hand-edit 45k words down to 30k. It is to change what the prompt is responsible for:

- **Compiler/schema owns legality.**
- **Registry owns catalog IDs, aliases, sizes, and precedence.**
- **LLM policy owns semantic choices and composition heuristics.**
- **Retriever/host owns which registry slices the model sees.**
- **Validator/repair loop owns correction after generation.**

With that separation, the useful parts of this document can become shorter, more stable, and more influential because they are no longer competing with thousands of lines of stale mechanical detail.
