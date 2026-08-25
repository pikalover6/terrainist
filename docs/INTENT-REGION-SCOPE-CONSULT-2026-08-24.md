# The multi-place intent gap — a design consult

**Status:** consult, no code written. Raised by the WS-A2 candidate-menu
measurement (2026-08-24); the mechanism below is probed, not theorised.

## The one-line finding

**A prompt that names two places has no world-scope `era` or `formPacks` — by
design — and every consumer that reads world scope is therefore blind to it.**
The candidate menu is one such consumer. So is the pack expansion in
`mix-intent.ts`. The result is that `nautical_pirate` was unreachable for the
battery's pirate prompt before the authoring model ever spoke, and no amount of
context injection can reach it.

## What was actually observed

`pirate_unicorn_isles` ("A pirate island and a unicorn island, at war.") is one
of the six form packs the model-behavior audit found at **zero member reach**
(`docs/audits/model-behavior-2026-08-24.md` headline 2). The cached
classification for it, verbatim from `tools/golden-prompts/intent-cache.json`:

```json
{
  "climate": { "temperature": 0.6, "humidity": 0.3, "snow": "never" },
  "tokens": {
    "terrain": "two distinct islands separated by a contested strait of open water",
    "region_pirate_island": "era renaissance, wealth 0.35, decline 0.4, formality 0.15; materialTheme temperate_timber; formPacks [nautical_pirate]; prefer archetypes tavern, watchtower, warehouse, lighthouse; props galleon, cart; fortified buccaneer cove, ship repair yards, coastal artillery",
    "region_unicorn_island": "era renaissance, wealth 0.85, decline 0.05, formality 0.75; materialTheme white_quartz; prefer archetypes church, manor, watchtower; props standing_stones, fountain; sacred unicorn pastures, pristine defensive ramparts and magical shrine towers"
  }
}
```

There is no `era` and no `character.formPacks`. But **the classifier did not
miss the pirates.** It named the pack, the era, the theme, the archetypes and
the props — for each island separately — and put them where it was told to.

## Why it did that: the instruction is explicit

`packages/agents/src/intent-prepass.ts:651-661`, in the classifier's own system
prompt:

> **ONE PLACE PER TOKEN — DO NOT MERGE PLACES.**
> If the prompt names SEVERAL distinct places (two islands, a city and a ruin),
> you must NOT write one `character` block covering both: an averaged intent is
> what makes every region come out looking the same. Instead, structurally:
> 1. Top level (era/wealth/decline/formality/character) carries ONLY what is
>    genuinely shared by every place — often just `climate`. **When the places
>    disagree on a dial, OMIT that dial at the top level.**
> 2. Emit one entry in `tokens` per place, keyed `region_<place>`, whose value
>    names that place's own era, wealth, decline, formality, materialTheme and
>    preferred archetypes/props. The document author turns one token into one
>    region's own character block, so a missing token is a missing region.

The worked example at `intent-prepass.ts:364-366` is *this exact prompt* —
`region_unicorn_isle` and `region_pirate_cove`. The classifier reproduced its
own documentation. This is a ratified design working precisely as written, and
the instruction is right: an averaged intent for a pirate island and a unicorn
island would be worse than either.

## Where the gap actually is

The instruction ends "**the document author turns one token into one region's
own character block**". That hand-off is prose to prose:
`intentKitContext` (`intent-prepass.ts:836-849`) dumps the intent JSON into the
user turn and tells the author to give each region node its own `intent`. It is
the only consumer of `region_*` that exists.

Every *structural* consumer reads world scope:

| consumer | reads | multi-place prompt sees |
|---|---|---|
| `buildCandidateMenu` (WS-A2) | `intent.era`, `intent.character.formPacks` | nothing → empty menu |
| pack expansion, `mix-intent.ts` | resolved scope's `formPacks` | nothing, unless the author wrote a region intent |
| `LOAM-W517` era/pack affinity | resolved era class | nothing |

`SemanticIntent.tokens` is documented as *"Open extension bag, per §2.7. Never
switched on by stdlib code."* So the classifier's best work on a multi-place
prompt lands in the one field the system promises never to read.

**The consequence is a whole prompt class, not one prompt.** Any world with two
characters — two islands, a city and its ruin, a town and the camp besieging
it — empties world scope by instruction, and therefore cannot be reached by any
mechanism conditioned on world scope. The candidate menu inherits this
completely: it is structurally unable to help a multi-place prompt.

## What this does NOT explain

Worth stating so the consult is not over-claimed. The measurement found five
menu-bearing prompts adopting zero menu ids (`glowcap_vale`, `redwood_camp`,
`walled_medieval_city`, `railway_town`, `metropolis_hideout`). Those are **not**
this bug — their intents carry era and pack correctly, the menu was built and
injected, and the model preferred familiar generic ids (`witch_hut` over
`witch_stilt_hut`, `sawmill` over `sawpit`). That is a binding problem and is
recorded separately. This consult covers only the multi-place class.

Equally: `desert_wilderness` and `fjord_terrain` also have no era and no pack,
and are **correct**. Both are terrain-kit prompts with no habitation; their
intents carry biome, climate, flora and `materialTheme` appropriately. An era
and a form pack would be wrong for a salt flat. Only the multi-place case is a
gap.

## Options, for ruling

**A — union at world scope (cheapest, no contract change).** Teach the
classifier that when it omits a dial because places disagree, it should still
write `character.formPacks` as the **union** of the regions' packs. Legal today:
packs are advice, never a gate (`CATALOG-EXPANSION-v0` §4.3), and the array rule
means a region that writes its own `formPacks` **replaces** the inherited list
whole — so a world-scope union does not average anything, provided the author
writes region intents. The menu then covers both islands.
*Risk:* if the author writes no region intents, the union expands into every
quarter, which is the flattening the ONE PLACE rule exists to prevent. Mitigated
by the fact that the union is advice and `prefer`/`forbid` outrank it, but not
eliminated.

**B — structured regions in the pre-pass output (the real fix).** Give the
classifier a region dimension: `regions: [{ name, intent }]` beside the
world-scope `SemanticIntent`, validated like any other intent. Consumers that
want per-place vocabulary read it structurally; the menu becomes the union of
per-region menus, labelled per region. *Cost:* a spec contract change
(`SemanticIntent`, `INTENT_KEYS`, the validator, `intentKitContext`), and it
touches ratified disposition 3. This is the honest answer to "the tokens bag is
carrying load-bearing structure".

**C — parse `region_*` free text.** Have the menu (and mix-intent) read packs
out of the token sentences. *Not recommended:* it blesses an open extension bag
as a real interface, which is how contracts rot, and the values are model-written
prose with no grammar.

**D — do nothing.** Multi-place prompts keep their per-region richness through
the author's prose path, which demonstrably works to a degree (the pirate
document authors clean and scores 13-15 archetypes). The pack simply stays
unreachable for this class.

## Recommendation

**B, staged behind A.** A is a one-paragraph classifier-prompt change that makes
the pack retrievable this week and is reversible; B is the contract fix that
stops the `tokens` bag from silently carrying structure, and it should ride A3's
dynamic-context work rather than being rushed ahead of it. Both are Kai's ruling,
not this document's.

Whatever is chosen, one thing is independent of the choice and worth doing
regardless: **the bug-first law applies.** The classifier's instruction is not
wrong and must not be "fixed" by teaching around it — the averaging it prevents
is a real failure mode, and any change must keep the two islands distinguishable.
