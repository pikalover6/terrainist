# Metropolis document diff — OLD r5 anchor vs NEW before-sample (2026-08-25)

Same prompt, seed 304. OLD = `battery/candidates/p4-gem1/overgrown_metropolis_hideout.loam.json` (53 KB).
NEW = `tools/golden-prompts/runs/before-sample/metropolis_hideout.doc.json` (24 KB).
Document-level evidence only — no compile, no render.

## Summary against T6 (10 lines)

1. **Fallen towers — OLD yes, NEW weaker.** OLD: two decayed towers (`shattered_tower_spire` 16 floors decay 0.88, `hollow_corporate_hub` decay 0.8) **plus** an authored program `overgrown_skyscraper_skeleton` (envelope 18x42x18) scattered `count: 8` over `area:{all:true}` — eight standing skeletons across the map. NEW: the same two decayed towers, and **no skeleton program at all**; its only program is `comm_array_tower`. Census: `generators` LOST `scatter.program@0` and `authored:high_tech_sanctuary_bunker`.
2. **Vines — both only in prose.** Neither doc has a vine param/tag. OLD carries them in `intent.tokens.visual_brief` ("skyscraper skeletons draped in massive ve…") and node labels ("wrapped in vines"); NEW in `intent.tokens.icons` ("smothered in vines and canopy trees") and a label. So vines are a **compiler/decay-dressing matter**, not authoring drift — except that OLD's 8 skeleton programs gave the vines something to grow on.
3. **Trees in the streets — OLD yes, NEW narrower.** OLD `massive_overgrowth` (scatter.forest): `area:{all:true}`, density **0.22**, clumping 0.55, `deadwood 0.22` — covers the whole envelope including the district. NEW `metro_overgrowth`: `area:{at:[0.5,0.5],radius:240}`, density **0.18**, `edgeFalloff:16`, deadwood 0.08, plus a token `wilderness_scatter` at density **0.012**. Census confirms: `forestFillsAtOrAboveCoverage: OLD=1 NEW=0`.
4. **River — OLD yes, NEW no.** OLD `collapsed_canal_river` — `verb: river`, course to `"coast"`, width 16 depth 8. NEW replaced it with `collapsed_highway` — `verb: valley`, `flooded: never` — plus `central_impact_crater` (`verb: basin`, `water: true`, r44). A dry trench and a puddle instead of a river through the city.
5. **Ruined palette — OLD yes, NEW half.** OLD `style.palettes`: road.surface `mossy_cobblestone`, road.shoulder `coarse_dirt`, ground.cliff `deepslate` — exactly the T6 triad. NEW: road.surface `cracked_stone_bricks`, shoulder `mossy_cobblestone`, plaza.path **`gray_concrete`**, plaza.border `moss_block`; **no `ground.cliff` key at all** — deepslate and coarse dirt both gone, grey concrete introduced.
6. **Named archetypes — NEW leans on them.** `explicitArchetypeParams: OLD=0 NEW=6`; every NEW building node carries `params.archetype` (skyscraper, office, bunker_complex, laboratory, field_station, battery_shed). OLD named none in params, tagging instead. This is the "few named archetypes" half of the T6 anti-pattern.
7. **Era drift.** `intent.era`: OLD `modern` → NEW `far_future`; `wealth` 0.3 → 0.5, `formality` 0.4 → 0.6. A wealthier, more formal, far-future city is the grey-concrete read.
8. **Flora species drift.** OLD prefer `oak_spreading`/`spruce_tall`, species sprawling_oak / weeping_willow / tall_spruce. NEW prefer `oak_round`, species broadleaf_canopy (jungle), creeping_oak, river_willow, wild_oak, kapok emergent, tree_fern. Jungle-flavoured, but at lower density and bounded radius.
9. **What both have (→ compiler's problem if it still looks clean):** the district (`grid`, `density: high`, blockSize 42/44, plaza, same `mix`), the two decay-0.8+ towers, a scatter.forest node, `barricade_line` across the district, the solar_array prop, the bunker/lab/power-hub cluster, and vine language in tokens.
10. **What is authoring/teaching drift (OLD had, NEW lacks):** the river verb; `ground.cliff: deepslate` + `coarse_dirt` shoulder; the 8-count `overgrown_skyscraper_skeleton` program scatter; the `high_tech_sanctuary_bunker` authored program; full-envelope forest coverage; props `cairn`/`log_pile`; the `watchtower` archetype; the era `modern`.

## Side by side

### intent
| key | OLD | NEW |
|---|---|---|
| era | modern | far_future |
| wealth / decline / formality | 0.3 / 0.9 / 0.4 | 0.5 / 0.85 / 0.6 |
| climate humidity/temp | 0.6 / 0.2 | 0.5 / 0.2 |
| character.label | overgrown ruined metropolis with high-tech hideout | overgrown ruined metropolis hideout |
| materialTheme / urbanForm | modern_city / grid | modern_city / grid |
| flora.prefer | oak_spreading, spruce_tall | oak_round, spruce_tall |
| archetypes.prefer | bunker_complex, laboratory, field_station, **watchtower** | bunker_complex, laboratory, field_station |
| motifs | massing towered, roof flat, **windowRhythm sparse** | massing towered, roof flat |
| character.programs | — (programs authored, not declared in intent) | comm_array_tower (landmark, 15x24x15) |
| tokens | fittings, infra, visual_brief | terrain, fittings, infra, **icons** |

### style.palettes
| slot | OLD | NEW |
|---|---|---|
| road.surface | mossy_cobblestone | cracked_stone_bricks |
| road.shoulder | coarse_dirt | mossy_cobblestone |
| ground.cliff | **deepslate** | *(absent)* |
| plaza.path | *(absent)* | **gray_concrete** |
| plaza.border | *(absent)* | moss_block |

### terrain sub-verbs
| OLD | NEW |
|---|---|
| `metropolis_shelf` plateau r170 h6 | `urban_shelf` plateau r200 h6 |
| **`collapsed_canal_river` verb river, course →"coast", w16 d8, sharp** | `collapsed_highway` verb **valley**, w28 d10, **flooded: never** |
| — | `central_impact_crater` verb basin, r44 d12, **water: true** |
| terrain: amp 24, oct 5, freq .003, erosion 2, soil 3, beachWidth 4 | amp 22, oct 5, freq .003, lacunarity 2, gain .5, erosion 2, **warp {20,.004}**, soil 4 |

### vegetation
| | OLD `massive_overgrowth` | NEW `metro_overgrowth` (+ `wilderness_scatter`) |
|---|---|---|
| area | `{all: true}` | `{at:[.5,.5], radius:240}` (+ all:true at 0.012) |
| density / spacing / clumping | 0.22 / 3 / 0.55 | 0.18 / 3 / 0.45 |
| maxSlope / elevation | 38 / [1,90] | 35 / [1,90] |
| edgeFalloff | — | 16 |
| undergrowth | grass .6, flowers .12, **deadwood .22** | grass .55, flowers .12, deadwood .08 |
| avoidTags | structure, road, plaza | structure, road, plaza |
| emergent | giant_beech (beech_giant) | giant_kapok (kapok_emergent), ancient_spruce |
| understory | hazel_brush | tree_fern_shrub, hazel_understory |
| canopy species | sprawling_oak w3, weeping_willow, tall_spruce | broadleaf_canopy w3 (jungle_broadleaf), creeping_oak, river_willow |

### district + buildings
| OLD | NEW |
|---|---|
| `ruined_metro` grid/high/blockSize 42/plaza, tags [ruins, metropolis, urban] | `ruined_metropolis` grid/high/blockSize 44/plaza, tags [district, ruins, metropolis] |
| `shattered_tower_spire` tags[skyscraper,landmark] floors 16 decay **0.88** (no archetype param) | `shattered_tower_prime` **archetype: skyscraper** floors 16 decay 0.85, windowRhythm dense |
| `hollow_corporate_hub` tags[office,landmark] floors 10 decay 0.8 | `decayed_corporate_center` **archetype: office** floors 12 decay 0.8, windowRhythm dense |
| `hideout_bunker` tags[bunker_complex,house,landmark] — no params (authored program) | `bunker_shelter` **archetype: bunker_complex**, entrance blast_door, basement d5 bunker_hold |
| `hideout_lab` tags[laboratory,house] floors 1, airlock_vestibule | `bio_synth_lab` **archetype: laboratory**, airlock_vestibule, basement d4 vault |
| `hideout_sentry_tower` tags[**watchtower**] floors 2 | `scout_field_station` **archetype: field_station**, airlock_vestibule |
| `hideout_power_hub` tags[battery_shed] floors 1 | `hideout_power_hub` **archetype: battery_shed** floors 1 |
| — | `satellite_uplink` tags[landmark,comms], seat: pad |

### scatters, props, paths
| OLD | NEW |
|---|---|
| **`skyscraper_skeletons`: program `overgrown_skyscraper_skeleton`, count 8, area all, spacing 45, maxSlope 25** | *(nothing equivalent)* |
| **`sensor_relays`: program `scavenged_sensor_relay`, count 6, area all, spacing 35** | *(nothing equivalent)* |
| props: solar_array, **cairn**, **log_pile** | props: solar_array, **helipad** |
| `perimeter_barricade` barricade_line across ruined_metro | `approach_barricade` barricade_line across ruined_metropolis |
| `connecting_corridors` anchors[district+3], pattern **organic**, w3, lanterns **false** | `service_conduits` anchors[4 + `#tag:house`], pattern **grid**, w3, lanterns **true** (spacing 16) |

### constraints
OLD 10, all unqualified: 1 zone:center, 4 terrain_conform (flatten x2, cut_fill x3), 4 distance-to-anchor (ruined_metro 8–48; hideout_bunker 12–80/12–80/12–90). No `strength` on any.
NEW 14: 1 zone:center, 5 terrain_conform, 5 distance (3 of them `strength: soft`), plus **new kinds** `facing: bunker_shelter`, `connected: bunker_shelter via tunnel style dressed`. Distances are tighter (6–22, 8–28, 8–30, 10–34, 10–32) — a compacted hideout cluster.

### programs
| OLD (3) | NEW (1) |
|---|---|
| `high_tech_sanctuary_bunker` 32x22x32 — plugin, builds the bunker from theme palettes | — |
| `overgrown_skyscraper_skeleton` 18x42x18 — plugin, the 8-count scatter | — |
| `scavenged_sensor_relay` 9x20x9 — plugin, the 6-count scatter | — |
| — | `comm_array_tower` 15x26x15 (declared envelope 15x24x15), single landmark, `conforms`/`conformHash` present |

### census diff (arrays as sets)
```
generators:   LOST authored:high_tech_sanctuary_bunker, scatter.program@0 | GAINED authored:comm_array_tower
archetypes:   LOST watchtower | GAINED bunker, convenience_store, cottage, field_station
props:        LOST cairn, log_pile | GAINED helipad
species:      LOST sprawling_oak, tall_spruce, weeping_willow | GAINED broadleaf_canopy, creeping_oak, river_willow, wild_oak
envelopes:    LOST 260x240, 19x44x17, 7x19x7 | GAINED 280x260, 19x52x17, 13x11x13, 11x11x13, 15x24x15
archetypesInCatalog  12 -> 15      constraints 10 -> 14      constraintsWithStrength 0 -> 3
constraintKinds GAINED connected, facing, style, via
forests 1 -> 2      forestFillsAtOrAboveCoverage 1 -> 0      explicitArchetypeParams 0 -> 6
labels 18 -> 19     eras modern -> far_future                bytes 53043 -> 23881
```

## Reading (§6: separate compiler / authoring / teaching)

- **Authoring or teaching drift, not the compiler:** the missing river verb, the missing `ground.cliff: deepslate` and `coarse_dirt` shoulder, the introduced `gray_concrete` plaza, the loss of *all three* authored programs (notably the 8-count skyscraper-skeleton scatter, the single biggest source of "fallen towers"), the forest shrinking from `{all:true}` to a radius with edge falloff, and the shift to `params.archetype` on every building. NEW is less than half the bytes of OLD; the document simply asks for less.
- **Both docs share it, so any remaining visual gap is a compiler matter:** vines exist only as prose in *both* — whatever puts vines on a tower is decay dressing, not an authored param; the two decay-0.85+ towers; the high-density grid district with the same `mix`; the barricade; the forest node's avoidTags. If OLD compiled with vines and NEW does not, that is the compiler; if neither does, the vine read in OLD came from the skeleton *program's* own block placement.
- **Note for the next station:** `intent.era` flipping `modern` → `far_future` is a candidate single cause for both the palette shift and the archetype-naming style; worth a fixed-kit re-roll to see whether era is being chosen by the authoring roll or taught.
