# Terrainist — Catalog Expansion v0

> **PROPOSAL, 2026-08-11.** The premise is ratified (Kai: the catalog is to be
> massively fleshed out, past 441, with culture/era form packs and niche
> immersion pieces); everything below it — the packs, the ids, the wiring, the
> sequence — is decision material. §7 carries proposed replacement text for
> `docs/DESIGN.md`'s "catalog curation over catalog completion" line; the
> orchestrator integrates it, this document does not.
>
> Companions: `packages/stdlib/src/structures/catalog.ts` (the registry and its
> id-stability law), `docs/kits/settlement-author.md` §9d/§9e (the intent
> surface and the icon register), `docs/SHIP-PLAN-v0.md` §8 (the frozen
> battery), `docs/FARM-PLAN-v0.md` §14 (what F17 deliberately left out).

## 1. Why

The product law is the **icon law**: the medium cannot whisper, so a world
communicates identity only through icons at saturation, and U1 is the stranger
test — a stranger names the prompt from ten seconds at any street corner
(DESIGN, "Product"; SHIP-PLAN §8.2 as amended 2026-08-10).

The Troy candidate-3 walk is the lesson this document exists to answer. The
`sun_clay` theme did its job — the shells came out sandstone, plaster and pale
flat roofs, exactly as the palette promised — and the world still did not read
as Troy, because **the palette was right and every form was borrowed**. A
medieval townhouse in sandstone is a medieval townhouse. Troy wants colonnades,
a stoa down one side of the agora, houses that turn their backs to the street
around a court, a megaron on the citadel; none of that is expressible, because
the catalog can say `townhouse` and it can say `sun_clay`, and their product is
not antiquity.

That is the general shape of the gap. Themes, motifs and eras are *modifiers*;
the noun is the archetype, and the catalog's 441 nouns cluster in the
medieval-village corner the project started in, exactly as its own header
comment says. A bespoke program delivers a landmark — one per prompt, three per
world at budget — and saturation is delivered by the **fabric**, which is drawn
from the catalog. Breadth here is therefore not taxonomy-filling: it is the only
mechanism by which a street corner two hundred blocks from the centerpiece can
still scream the prompt.

The bounds do not move: a structure belongs here if a competent builder could
make it out of blocks and a player could recognise it. Everything below is
realizable by the existing deterministic pipeline — new `BuildingArchetype`s,
new `PROP_GENERATORS` entries, new `SweptProfile` clients, new floor-plane
treatments. No new runtime technology is assumed anywhere in this document.

## 2. What a pack is

A **form pack** is a named set of catalog entries answering one culture, era or
genre, shipped and accepted together. It carries a **thesis** (one line naming
what a prompt in this space cannot currently say); its **entries**; its
**vocabulary claim** — the tag words its archetypes take in the
`archetypeOfTags` cascade, claiming nothing an earlier table claims, the
discipline the catalog notes already record (*"Tags `wind_turbine`/`turbine`;
`windpump` stays the waterworks prop's"*); its **affinity** (eras, themes and
district characters, used for suggestion and a warning, never as a hard gate);
and its **exhibit world** — one walk, one acceptance (§5).

**Size classes**, used in the tables below and nowhere else in the codebase yet:
`XS` a prop you step over (≤ 3³); `S` 5–9 across; `M` 11–17; `L` 19–31; `XL`
33+; `LIN` linear, sized by its run rather than its envelope.

**Ids are stable forever** — a rename is a migration, not an edit. Every id
below was checked against all 441 existing ids and against the other 144
proposed ids: zero collisions, zero internal duplicates. One near-miss worth
recording: `pyramid` is already a *roof-value* alias in `structures/core.ts`
(`value === "pyramid"` → `hip`). Different namespace, so the archetype id is
legal — but the Nile pack's tag table must claim `pyramid`/`great_pyramid`
deliberately, and nobody should later "fix" the apparent clash by renaming the
entry.

## 3. Pack inventory

Nine packs, 145 entries, taking the catalog from 441 to 586.

### 3.1 Classical Mediterranean — 24 entries

**Thesis.** Antiquity is a *form* vocabulary — the colonnade, the peristyle, the
stepped sanctuary terrace — and the catalog has only its palette. Troy, Athens,
a Hellenist waterfront and a Roman forum are all currently medieval towns in
sandstone.

Affinity: era `ancient`; themes `sun_clay`, `white_quartz`; characters `civic`,
`core`, `waterfront`. Covers battery **P3** and **P5**.

| id | name | category | kind | size | curator's note |
|---|---|---|---|---|---|
| `stoa` | Stoa | commercial | building | XL | The agora's long side: a two-deep colonnade of the full run with a closed shop wall behind it, so the street face is columns and the back is trade. |
| `peristyle_house` | Peristyle house | residential | building | M | The courtyard house with its court *colonnaded* — a post ring standing on a stylobate course one cell in from the wall, rooms opening only inward. |
| `megaron` | Megaron | residential | building | L | The palace hall: a deep porch of two columns *in antis* between projecting wall stubs, one long room behind it, a raised hearth ring off the lantern column. |
| `propylaea` | Propylaea | civic | building | L | A gateway that is only a gateway — a columned front and back with a through-passage and no room at all, straddling the way into a sanctuary. |
| `bouleuterion` | Bouleuterion | civic | building | M | The council chamber's ancient parent: stepped seating in a half-ring turned to a speaker's floor, roofed, with the entry cut through the flat side. |
| `peripteral_temple` | Peripteral temple | religious | building | L | The colonnade on all four sides, a solid cella inside it, a pediment gable over the short face. The generic `temple` (Track A) stays the cella-and-porch one. |
| `tholos` | Tholos | religious | building | M | The round one: a ring of columns on a stepped circular crepidoma under a shallow conical roof, a drum wall inside the ring. |
| `sanctuary_treasury` | Treasury | religious | building | S | A miniature temple with two columns and no room to speak of — the votive building a sanctuary carries a dozen of. |
| `palaestra` | Palaestra | leisure | building | L | A square sand court with a colonnade on all four sides and changing cells behind one range; the middle is deliberately empty. |
| `gymnasion` | Gymnasion | leisure | building | XL | The palaestra plus a covered running track down one long flank — the longest colonnade in the pack. |
| `odeon` | Odeon | leisure | building | L | The roofed small theatre: stepped seating in a half-ring under a full roof, a low stage wall across the chord. |
| `hippodrome_spina` | Spina | leisure | prop | XL | The racecourse's central barrier — a long low plinth with turning posts at both ends and an obelisk or two standing on it. |
| `agora_colonnade` | Free-standing colonnade | infrastructure | infrastructure | LIN | A sweep client: columns at a fixed interval on a stylobate with a continuous entablature over them, following a street or a square's edge. |
| `triumphal_arch` | Triumphal arch | memorial | infrastructure | L | The arch that spans a *road*, not a room: piers either side of the carriageway, a continuous crown, an attic band of names over it. |
| `rostra` | Rostra | civic | prop | M | The speaker's platform in a forum: a stepped masonry dais with a rail, facing the open ground. |
| `herm_post` | Herm | street-furniture | prop | XS | A square shaft with a blocky head course on it, at corners and boundaries. The cheapest classical repeat in the pack, and the saturation piece. |
| `votive_column` | Votive column | memorial | prop | M | One column standing alone on a plinth with a figure, urn or tripod on its capital. |
| `column_drums` | Fallen column drums | ruins | prop | M | A row of cylinder drums lying where the shaft fell, half in the grass, with the capital at the end of the run. |
| `ship_shed` | Ship shed | transport-water | building | XL | The *neosoikos*: a long open-fronted shed running down to the water on a slipway floor, one hull's width, in a row of its own kind. |
| `trireme` | Trireme | transport-water | prop | L | The oared warship: a low slim hull with a bronze ram at the stem, a single square sail, oar ports in two banks and an eye painted at the bow. |
| `nymphaeum` | Nymphaeum | waterworks | building | M | The monumental fountain: a niched screen wall with basins under it, water in the floor plane on the bathhouse's pool predicate. |
| `acropolis_terrace` | Sanctuary terrace | infrastructure | infrastructure | LIN | Polygonal masonry retaining that *raises* a sanctuary above its town — the retaining pass's grandest client, with a stair cut into one face. |
| `olive_press` | Olive press | rural | building | S | A stone trough press with a beam and weight stone, jars ranked along the far wall. |
| `pithos_store` | Pithos store | commercial | prop | S | Great storage jars sunk to the shoulder in a paved yard, lids beside them — the classical warehouse, outdoors. |

### 3.2 Nautical & Pirate — 20 entries

**Thesis.** The catalog has an excellent fleet and almost no *shore*. A pirate
haven needs the jolly roger, the gallows on the point, the careened hull and the
chain across the harbour mouth — none of which is a ship.

Affinity: eras `renaissance`, `industrial`; themes `boreal_pine`,
`temperate_timber`; characters `waterfront`, `lanes`. Covers battery **P1**
(pirate half).

| id | name | category | kind | size | curator's note |
|---|---|---|---|---|---|
| `jolly_roger_mast` | Jolly roger mast | military | prop | M | A ship's mast standing on land over the harbour with a black banner at the head and a yard crossing it — the pirate icon, and it costs two hundred blocks. |
| `gallows` | Gallows | civic | prop | S | Two posts, a beam, a noose of chain and a trap platform, on a paved point where the harbour can see it. |
| `gibbet_cage` | Gibbet cage | civic | prop | XS | An iron-bar cage hung from a single arm at a crossroads. Repeats cheaply; three of them say more than one gallows. |
| `careening_beach` | Careening beach | transport-water | infrastructure | L | A hull hove down on its side on the sand, tackle running from the mastheads to shore anchors, fires and pitch barrels under it. |
| `beached_wreck` | Beached wreck | ruins | prop | L | A broken hull driven up the strand — ribs open to the sky, the stern half gone, cargo spilled up the tideline. Distinct from Track A's submerged `sunken_ship`. |
| `cannon_battery` | Shore battery | military | infrastructure | LIN | A sweep client: an earth-and-timber parapet with embrasures at intervals, guns on trucks behind them, shot piles and a ready magazine. |
| `powder_magazine` | Powder magazine | military | building | S | Set apart from everything: thick buttressed walls, a vaulted roof, one door, no windows, lanterns *outside* the wall only. |
| `martello_tower` | Sea tower | military | building | M | A squat round tower on a rock or a mole, battered walls, one gun platform on top, entered by a ladder at first-floor height. |
| `chandlery` | Ship chandlery | commercial | building | M | The shop that sells a voyage: rope coils, blocks and lanterns hung from the ceiling plane, barrels of tar and salt beef, a counter under a hanging model. |
| `sail_loft` | Sail loft | industrial | building | L | One long clear upper floor with the cloth laid out on it, seam benches down the walls, a hoist door in the gable. |
| `fish_drying_rack` | Drying racks | rural | prop | M | Split fish on horizontal poles between A-frames, in ranks. Repeats down a whole shoreline and reads at fifty blocks. |
| `salt_house` | Salt house | industrial | building | S | The store beside Track A's `salt_pans`: white heaps in bays, a raking floor, wide low doors. |
| `treasure_cache` | Treasure cache | ruins | prop | XS | Chests half out of the sand under a lone palm, a spade standing in the spoil, one lid open. The most literal icon in the catalog and unapologetic about it. |
| `smugglers_landing` | Smugglers' landing | transport-water | prop | M | A stair cut into a cove wall down to mooring rings, crates stacked above the tideline, a shuttered lantern on a hook. |
| `capstan` | Quay capstan | street-furniture | prop | XS | A drum with bar sockets on a paved quay, hawser coiled at its foot. |
| `treadwheel_crane` | Treadwheel crane | industrial | building | L | The harbour crane: a timber housing with the great wheel inside it and a jib swinging out over the water. A silhouette, not a shed. |
| `anchor_stack` | Anchor stack | street-furniture | prop | S | Old anchors leaned together with chain heaped round them at the head of a quay. |
| `daymark` | Daymark | transport-water | prop | M | A whitewashed stone cone on a headland with no light in it — the lighthouse's mute cousin, and cheap enough to put on three headlands. |
| `harbour_chain_tower` | Chain tower | military | infrastructure | L | The pair that closes a port: two towers on opposite moles with a chain slung between them across the water. Ships as a pair or not at all. |
| `whalebone_arch` | Whalebone arch | memorial | prop | M | Two jaw bones meeting over a path at the top of the town. Niche, immediate, and it names a whaling port in one glance. |

### 3.3 Arcane & Magical — 16 entries

**Thesis.** The fantasy corner has towers and one shrine. A magical *place* —
the unicorn island of P1, a mage college, a warded valley — needs the ground to
glow, the paths to be marked, and the beasts to have somewhere to live.

Affinity: eras `medieval`, `ancient`; themes `white_quartz`, `temperate_timber`;
characters `civic`, `lanes`, `park`. Covers battery **P1** (unicorn half).

| id | name | category | kind | size | curator's note |
|---|---|---|---|---|---|
| `rune_circle` | Rune circle | fantasy | prop | M | A ring inlaid *into* the floor plane — glowing symbol courses on polished stone, no vertical stone at all. The counterpart to `standing_stones`, which is all vertical. |
| `ley_marker` | Ley marker | fantasy | prop | XS | A knee-high waystone with one glowing glyph face, set beside a path. Twenty of these along a road is what makes a valley read as enchanted. |
| `crystal_outcrop` | Crystal outcrop | fantasy | prop | M | Amethyst and quartz spires erupting from the ground at an angle, budding smaller clusters at the base. |
| `arcane_academy` | Arcane academy | fantasy | building | XL | The wizard's tower gone collegiate: a cloistered teaching hall with two unequal towers, orrery hall, and shelves where a chapel would put pews. |
| `summoning_hall` | Summoning hall | fantasy | building | L | One tall room, a circle written into the floor plane, brazier pedestals at the cardinal points and a gallery rail high on the walls. |
| `arcane_library` | Arcane library | fantasy | building | L | Shelf ranges to the ceiling plane with ladder rails, reading lecterns lit by hung lanterns, one shelf bay left as a gap that goes nowhere. |
| `scrying_pool` | Scrying pool | fantasy | prop | S | A still rimmed basin on the pool predicate with glow under the water and a kneeling step on one side. |
| `blossom_shrine` | Blossom shrine | fantasy | building | S | An open pavilion of pale timber under a cherry canopy, ribbons on the posts, a low altar with no figure on it. |
| `pegasus_stable` | Winged-mount stable | fantasy | building | L | Stalls with no doors and an open loft above them — the mounts leave upward — with a landing ledge projecting from the gable. |
| `unicorn_paddock` | Paddock | fantasy | prop | L | White fencing round grazed ground with a blossom tree, a trough and a gate; the icon is the enclosure, not an occupant. |
| `arcane_orrery` | Orrery | fantasy | prop | M | Armillary rings on a plinth with a lit core, each ring a course of blocks in its own plane. |
| `floating_stair` | Floating stair | fantasy | infrastructure | LIN | Detached treads climbing to a door, on `floating_platform`'s disguised-stem trick — a veiled thread carries each tread, and the eye reads the gap. |
| `warded_gate` | Warded gate | fantasy | infrastructure | M | An arch across a road with a rune band up both piers and a glowing keystone; nothing hangs in the opening. |
| `spirit_lantern_row` | Lantern row | fantasy | prop | LIN | A run of posts with paper lanterns at head height along a path, spaced by arc length. The pack's saturation piece. |
| `dragon_skeleton` | Dragon skeleton | fantasy | prop | XL | A picked wyrm laid out where it fell: spine flush in the ground plane, ribs standing on it, the skull turned to one side. |
| `moon_dial` | Moon dial | fantasy | prop | M | A great disc set into a paved terrace with a leaning gnomon and glowing hour marks. |

### 3.4 Alien & Sci-fi — 19 entries

**Thesis.** An invasion needs mass and staging, and the kit already says so — but
everything it can currently reach for is a bespoke program. A world where the
*only* alien thing is the landmark reads as a museum. This pack is the invasion's
fabric: the traces, the barricades, and the human side's answer to it.

Affinity: eras `modern`, `far_future`; themes `modern_city`; characters `core`,
`industrial`, `grid`. Covers battery **P2** and **P4**.

| id | name | category | kind | size | curator's note |
|---|---|---|---|---|---|
| `crop_circle` | Crop circle | rural | infrastructure | XL | Flattened geometry in a standing field — a floor-plane treatment only, no block above the crop. The cheapest strong icon proposed anywhere in this document. |
| `quarantine_fence` | Quarantine line | military | infrastructure | LIN | Chain-link on posts with warning banners at intervals, floodlight masts every fifth panel and a gate where a road crosses it. A sweep client. |
| `containment_tent` | Containment tent | science | prop | M | An inflated white dome with a ribbed skin, an airlock tube out one side and a generator humming at the back. |
| `field_lab_trailer` | Field lab trailer | science | prop | S | A boxed trailer up on jacks with a step, an aerial and a shuttered hatch; three in a row is a response, one is a rumour. |
| `sensor_mast` | Sensor mast | science | prop | S | A tripod carrying a small dish, a solar panel and a blinking head. |
| `dish_array` | Dish array | science | prop | L | Several big parabolic dishes on pedestals, all aimed the same way — the aim is the read. |
| `xeno_spire` | Xeno spire | fantasy | building | XL | Chitinous organic massing that tapers and twists, grown rather than built, with openings where the shell parted. |
| `hive_mound` | Hive mound | fantasy | building | L | A low resinous mound with three tunnel mouths at ground level and a vent crown; inside is chambered, not roomed. |
| `bio_pod_cluster` | Bio-pod cluster | fantasy | prop | S | Glowing egg pods in a huddle, two split open, the ground under them stained. Built for double-digit counts. |
| `crash_furrow` | Crash furrow | ruins | infrastructure | LIN | A scorched gouge dragged across the terrain with debris thrown out either side and the thing that made it at the end of the run. Gives a scatter its direction. |
| `barricade_line` | Street barricade | military | infrastructure | LIN | Improvised across a carriageway: wrecked vehicles, sandbags, concrete blocks and wire, with one deliberate gap. |
| `sandbag_emplacement` | Sandbag emplacement | military | prop | S | A horseshoe of bags at a corner with a firing step and an ammunition crate. |
| `mobile_command_post` | Command vehicle | military | prop | M | An armoured box body with an awning off one flank, map table under it and a mast of antennae. |
| `blast_door` | Blast door | underground | infrastructure | M | The way into a hillside: a slab-faced door in a concrete surround with a hydraulic frame, sunk in a cut with a ramp down to it. The P4 hideout's front page. |
| `hydroponics_bay` | Hydroponics bay | science | building | L | Racked trays under grow-lamp glow, pipe runs at the plate, a water plant at one end. What a hideout eats. |
| `sentry_turret` | Sentry turret | military | prop | XS | A short pedestal with a swivelling head and a lamp, at a gate or on a roof parapet. |
| `airlock_vestibule` | Airlock vestibule | modern | infrastructure | S | A double-door chamber projecting from a wall with a step-through sill and a warning band round it. |
| `maglev_pylon` | Guideway pylon | infrastructure | infrastructure | LIN | A raised guideway on tapered piers at a fixed interval — the far-future viaduct, on the sweep engine. |
| `derelict_mech` | Derelict walker | ruins | prop | XL | A fallen machine on its side, one leg still folded under it, hull plates open and the cockpit dark. |

### 3.5 Agrarian — 16 entries

**Thesis.** F17 shipped the field and the farmstead; the *countryside between*
them is still empty, and it is what makes a farm town read as agriculture at eye
level. Everything here is on FARM-PLAN §14's excluded list or beside it, and
none of it is a planting grammar.

Affinity: eras `medieval` … `industrial`; themes `temperate_timber`,
`birchwood_downs`; characters `lanes`, `rowhouse`. Covers battery **P2** (farm
half; F17 already carries the assertion's hook).

| id | name | category | kind | size | curator's note |
|---|---|---|---|---|---|
| `hedgerow` | Hedgerow | rural | infrastructure | LIN | The living boundary FARM-PLAN §14.2 named as missing: persistent leaves on a low bank, thickening at corners, with standard trees left in the line. |
| `dry_stone_wall` | Dry stone wall | rural | infrastructure | LIN | The upland field wall: a battered double course with through-stones and a coping of stood stones. A sweep client, and what a hill town's fields want. |
| `field_gate` | Field gate | rural | prop | XS | A five-bar gate hung between a hanging post and a slapping post, with a stile stone beside it. Every wall and hedge run wants one. |
| `cart_track` | Cart track | rural | infrastructure | LIN | Two ruts with a grass baulk between them, unpaved, following the ground rather than cutting it — the road engine's humblest profile. |
| `cow_byre` | Byre | rural | building | M | Standings either side of a central dunging passage, a feed walk at the head, half-doors on the yard. |
| `duck_pond` | Duck pond | rural | prop | M | A rimmed pond on the pool predicate with reeds at one edge, a plank ramp and a small house on stilts over the water. |
| `midden_heap` | Midden | rural | prop | S | The muck heap by the yard: coarse dirt banked against three walls with a fork standing in it and steam where the season allows. |
| `dutch_barn` | Dutch barn | rural | building | L | Open on all four sides: piers, a curved roof, and nothing but stacked hay between them. The read is the absence of walls. |
| `smokehouse` | Smokehouse | rural | building | S | A small blind hut with a low fire pit and racks up in the roof; the only opening is the door. |
| `dairy` | Dairy | rural | building | S | Deliberately cold and north-facing: slate shelves round three walls, churns, a stone floor kept wet, small high windows. |
| `sheep_dip` | Sheep dip | rural | prop | S | A narrow sunken trough with a race of hurdles funnelling into it and a draining pen the far side. |
| `wool_shed` | Shearing shed | rural | building | L | A raised board floor with catching pens under one end and the wool table down the middle. |
| `staddle_granary` | Staddle granary | rural | prop | S | A grain box raised on mushroom-shaped stones so the rats cannot climb, reached by a ladder that does not touch it. |
| `hop_yard` | Hop yard | rural | infrastructure | XL | Poles on a grid with wire runs between their heads; the plants are the flora grammar's problem and the frame is not. |
| `stock_pens` | Stock pens | rural | prop | L | A grid of hurdle pens off a droving lane with a weigh crush and an auctioneer's step. |
| `well_sweep` | Well sweep | rural | prop | M | The counterweighted lever over an open well — a raked beam on a forked post, bucket at one end and a stone at the other. |

### 3.6 Wilds & Camps — 12 entries

**Thesis.** Battery P6 asks for a logging camp and the catalog has `tent`,
`caravan` and `campsite`. Extraction in the wilderness — logging, trapping,
placer work — is a whole settlement idiom and it is the F13 half F17 explicitly
deferred.

Affinity: eras `medieval` … `industrial`; themes `boreal_pine`; characters
`industrial`, `lanes`. Covers battery **P6**.

| id | name | category | kind | size | curator's note |
|---|---|---|---|---|---|
| `logging_camp` | Logging camp | nomadic | prop | XL | A compound on `campsite`'s precedent: bunk shanty, cook shack, a saw trestle, the fire, and the ground churned to mud between them. |
| `log_flume` | Log flume | infrastructure | infrastructure | LIN | A V-trough on trestles running downhill with water in it — the sweep engine carrying a contained channel rather than a carriageway. |
| `log_landing` | Log landing | industrial | prop | L | The deck at the road head: whole trunks cross-stacked between anchor posts, ends squared to the track. |
| `sawpit` | Sawpit | industrial | prop | S | A trestle over an open pit with a two-man saw standing in the kerf and sawdust banked at one end. |
| `river_log_boom` | Log boom | waterworks | infrastructure | LIN | Chained trunks strung across a river corralling a raft of loose logs behind them, anchored to a bank pier at each end. |
| `fire_lookout_tower` | Fire lookout | civic | building | L | A glazed cab on braced legs above the canopy, with a switchback stair and a map table you can see from below. |
| `stump_field` | Cut-over | ruins | infrastructure | XL | The ground a camp leaves: stumps at plausible spacing, slash piles, and one great stump too big to have been worth taking. |
| `rope_bridge` | Rope bridge | infrastructure | infrastructure | LIN | Plank treads slung between two cable runs with hand lines, sagging to the middle and anchored to trees or posts. |
| `waystation` | Waystation | rural | building | S | A shelter on a long road: three walls, a hearth, a bench, a woodpile kept full, and no door. |
| `hunting_lodge` | Hunting lodge | leisure | building | L | A trophy hall with a great hearth, antlers on the beam, a gun rack and boots by the door. |
| `spar_pole` | Spar pole | industrial | prop | L | A topped tree rigged with blocks and guy lines as a yarding mast — the tallest thing in a cut-over and visible from everywhere. |
| `hunters_cache` | Cache | nomadic | prop | XS | A box on four peeled poles above bear height with the bark stripped off the legs. |

### 3.7 Frontier West — 14 entries

**Thesis.** "A wild west town" is one of the most likely sentences a stranger
will type, and the era alias already routes it to `industrial`. What arrives is
a Victorian mill town: no false fronts, no boardwalk, no saloon.

Affinity: era `industrial`; themes `temperate_timber`, `boreal_pine`;
characters `lanes`, `rowhouse`.

| id | name | category | kind | size | curator's note |
|---|---|---|---|---|---|
| `false_front_saloon` | Saloon | commercial | building | M | The false front is the entry: a flat parapet screen carried a storey above the real roof, swing doors, a long bar and a stair to the rooms. |
| `boardwalk` | Boardwalk | infrastructure | infrastructure | LIN | A raised plank sidewalk on posts with a step down at each cross-street and a post-and-rail edge — the frontage's own sweep profile. |
| `water_tank_trestle` | Water tank | infrastructure | prop | L | A banded timber tank on a braced trestle beside the track with a swing spout hanging off it. |
| `assay_office` | Assay office | commercial | building | S | A barred counter, a small furnace and scales, a strongbox in the corner and a shingle over the door. |
| `stamp_mill` | Stamp mill | industrial | building | XL | Built down a slope in stages: ore bin at the top, the stamp battery under it, tables below that. The stepping is the read. |
| `sluice_box` | Sluice box | industrial | infrastructure | LIN | A riffled trough on trestles with water running through it, tailings fanned out at the low end. |
| `placer_claim` | Placer claim | industrial | prop | M | A worked gravel bar: spoil ridges, a rocker cradle, a claim post with a board nailed to it. |
| `telegraph_office` | Telegraph office | civic | building | S | One room, a key desk under the window, wire coming in through the gable to a pole outside. |
| `livery_stable` | Livery stable | rural | building | L | Wide doors both ends, a straw floor, a loft with a hay door, and rigs parked in the aisle. |
| `wagon_shop` | Wagon shop | industrial | building | M | Wheels on the wall, a tyring platform outside the door, a forge in the corner and half a wagon on trestles. |
| `mission_church` | Mission church | religious | building | M | Adobe massing with a stepped bell gable carrying two bells, buttressed side walls, a single deep door. |
| `cantina` | Cantina | commercial | building | S | A shaded arcade off the street, a plain bar inside, terracotta and whitewash, shutters instead of glass. |
| `boot_hill_row` | Boot hill | memorial | prop | M | A crooked line of timber grave markers on a bare rise outside town, fenced with wire, no two the same height. |
| `dugout_shanty` | Dugout | vernacular | building | S | Cut back into a bank with a timber front wall and a turf roof at the level of the ground behind it. |

### 3.8 Nile & Ancient Egypt — 12 entries

**Thesis.** The catalog cannot say **pyramid**. Nor sphinx, nor hypostyle hall.
Egypt is a top-tier typed prompt with the most recognisable silhouette in
architecture, and `ziggurat` is not it.

Affinity: era `ancient`; theme `sun_clay`; characters `civic`, `core`.

| id | name | category | kind | size | curator's note |
|---|---|---|---|---|---|
| `pyramid` | Pyramid | religious | building | XL | The true smooth-faced one on a square base, a cased apex, one small door low on the north face and a causeway running away from it. Tags `pyramid`/`great_pyramid` — note the roof-value alias in `core.ts` and claim deliberately. |
| `sphinx` | Sphinx | memorial | prop | XL | A recumbent body with the forelegs extended and a headdress block — a program-grade sculpt the grammar can still do as a prop, and the one entry here worth checking against the bespoke tier first. |
| `mastaba` | Mastaba | memorial | building | M | The bench tomb: a battered rectangular block with a flat top, a false door on one face and a real one nowhere. |
| `hypostyle_hall` | Hypostyle hall | religious | building | XL | A forest of columns on a grid, the central aisle's columns taller than the rest so a clerestory band opens between them. |
| `mortuary_temple` | Mortuary temple | religious | building | XL | Terraced against a cliff: colonnaded storeys stepping back, a ramp on the axis climbing through all of them. |
| `pylon_gate` | Pylon gate | religious | infrastructure | XL | Two battered trapezoid towers flanking a lower doorway, flagstaff grooves up the faces, banners standing in them. |
| `sphinx_avenue` | Avenue of sphinxes | memorial | infrastructure | LIN | Paired recumbent figures at a fixed interval down both sides of a processional way. A sweep client whose feature *is* the interval. |
| `nilometer` | Nilometer | waterworks | building | M | A stepped shaft down to river level with a graduated column in it and a covered head at the top. |
| `sacred_lake` | Sacred lake | waterworks | prop | L | A rectangular stone-lined basin with steps down all four sides, on the pool predicate, inside a precinct wall. |
| `mudbrick_granary` | Beehive granary | rural | building | S | Corbelled mud domes in a row on a shared plinth, filled from a hatch at the crown and drawn from a hole at the foot. |
| `felucca` | Felucca | transport-water | prop | M | One raked mast with a long lateen yard, a shallow open hull and an awning aft. |
| `canopic_shrine` | Shrine chapel | religious | building | S | A small chapel with a cavetto cornice and a torus roll at every corner — the two mouldings that make a block read as Egyptian. |

### 3.9 East Asian — 12 entries

**Thesis.** `hanok`, `machiya`, `pagoda`, `junk` and `tea_house` exist as
isolated houses; the *public* forms that frame them — the gate, the wall, the
garden, the castle — do not, so an East Asian prompt produces one correct house
in a European town.

Affinity: eras `medieval`, `early_modern`; themes `temperate_timber`,
`white_quartz`; characters `civic`, `lanes`, `park`.

| id | name | category | kind | size | curator's note |
|---|---|---|---|---|---|
| `torii` | Torii | religious | prop | M | Two posts, a curved upper lintel and a straight tie under it. Repeats down an approach in ranks and is the pack's saturation piece. |
| `moon_gate` | Moon gate | infrastructure | infrastructure | M | A perfect circular opening in a garden wall, coped round, with the path passing through it. |
| `paifang` | Paifang | infrastructure | infrastructure | L | A multi-bay ceremonial arch over a street with tiled eaves over each bay and a name board in the middle span. |
| `zen_garden` | Dry garden | leisure | prop | M | Raked gravel written into the floor plane with placed stones and moss, walled on three sides and viewed from a veranda on the fourth. |
| `tenshu_keep` | Castle keep | military | building | XL | Stacked tiered storeys, each smaller than the one below, over a battered stone base with a curved cyclopean face; gables break every second eave. |
| `castle_base_wall` | Battered stone base | military | infrastructure | LIN | The curved *ōgi* revetment the keep stands on — the retaining pass's most demanding client, and buildable as a swept course with a coping. |
| `drum_tower` | Drum tower | civic | building | L | A tiered gate tower on a masonry podium with an arch through it and a drum hung in the upper storey. |
| `shoji_teahouse` | Tea house pavilion | leisure | building | S | The garden pavilion: a low crawl-in entry, a mat floor, a hearth recess and one alcove. Distinct from Track A's commercial `tea_house`. |
| `spirit_wall` | Spirit wall | infrastructure | infrastructure | S | A free-standing screen wall set one pace inside a gate so the way in must turn. |
| `stone_lantern` | Stone lantern | street-furniture | prop | XS | A pedestal, a fire box with cut faces and a capstone, at a path's turn or a pond's edge. |
| `dragon_boat` | Dragon boat | transport-water | prop | L | A long narrow hull with a carved head at the stem and a tail at the stern, oars ranked along both sides. |
| `bell_pavilion` | Bell pavilion | religious | building | M | An open pavilion on a raised podium with a great bell hung from the beam and a striking log slung beside it — the tiered-eave answer to `bell_tower`'s masonry shaft. |

### 3.10 Packs deliberately NOT proposed, named

So a later reader can tell "not proposed" from "forgotten": **Wasteland
scavenger** (folded into 3.4 — `barricade_line`, `blast_door`,
`quarantine_fence` are its strongest members and they earn their place there);
**Mesoamerican** (ball court, stelae, cenote shrine — real, and `ziggurat`
covers the silhouette badly enough that it deserves a pack later);
**Polar/Arctic** (`igloo` carries it alone today); **Festive winter**
(a genuinely common typed prompt, but almost all of it is palette and props);
**Subaquatic**; **Steampunk** (the works wave already covers most of it).

## 4. Selection wiring

Existence is half the work. A pack that ships and is never reached for is worth
exactly zero, and this section is the larger half of the design.

### 4.1 The finding this section starts from

**`intent.character.archetypes.prefer / forbid / weights` is grounded and
never consumed.** `structures/vocabulary.ts` checks every word against the
catalog and raises `LOAM-W483` for what it cannot place; no fan-out row reads
the key (`ArchetypeBias` appears in exactly two places — its declaration in
`packages/spec/src/intent/types.ts` and that vocabulary check); and the only
path from a document to a lot's archetype is `pickArchetype(params.mix, …)` in
`layout/district.ts`, with `params.characters[…]` choosing the mix for a city
cell. So the kit's own worked example — the unicorn island with
`"archetypes": { "prefer": ["chapel", "cottage"], "forbid": ["warehouse"] }` —
changes *nothing about which buildings are built*; that island reads different
only because its `params.mix` happens to say the same thing beside it. This is
DESIGN's second failure mode by name (*machinery that exists and never runs*),
and it is the highest-leverage fix in this document: the channel every pack
needs already exists in the spec, the kit, the classifier's output and the
examples.

**Recommendation B1 — wire it.** One fan-out row, `grammar.mix`, owned by
`layout/` and registered through `intent/seam.ts`, total in the fan-out sense:
handed the mix the district was about to use (`ctx.today`), it returns that mix
unchanged when no scope declares `character.archetypes`, so
`intent-identity.test.ts` still hashes equal. When a scope does declare one, the
row applies, in this order:

1. **`forbid` wins over everything**, including an explicit `params.mix` entry
   and a pack expansion. A forbidden id is removed; a mix emptied by forbidding
   falls back to `ctx.today` with a diagnostic rather than to no buildings.
2. **explicit `prefer`** entries are prepended in declaration order (the mix is
   a positional draw in declaration order, so position *is* weight).
3. **`weights`** multiply an id's occurrences in the expanded mix, integer-
   rounded, capped so one id cannot take a whole quarter.
4. whatever remains of `ctx.today` follows.

### 4.2 The pack channel — a fourth list vocabulary, not a new dial

The obvious move is a new intent dial — `architecturalStyle: "classical"`. **Do
not add one.** Three reasons, in order of weight:

1. **It duplicates `era` and would be allowed to disagree with it.** `era` is
   already an open string through a closed alias table, and `classical`,
   `greek`, `roman` and `antiquity` are all already in `ERA_ALIASES` pointing at
   `ancient`. A second scalar carrying the same claim gives every document two
   places to say "Troy" and one place for them to contradict each other; a dial
   that can disagree with another dial is a bug factory, and the resolver would
   need a precedence rule nobody can remember.
2. **Style is not a scalar.** What Troy actually needed was *a set of nouns*.
   Era, theme and motifs are all one-value-per-scope; the missing thing is a
   list, and the intent layer already has three lists with grounding, aggregated
   warnings, near-miss suggestions and array-replaces-whole inheritance.
3. **The gap is genuinely the fabric's archetype mix**, which is exactly what
   B1 wires. A new dial would have to reach the same place by a longer road.

**Recommendation B2 — `character.formPacks: string[]`**, a *fourth* grounded
list beside `archetypes`, `props` and `flora`. One word buys a whole form
vocabulary:

```json
"character": {
  "label": "Troy, before the sack",
  "materialTheme": "sun_clay",
  "formPacks": ["classical_mediterranean"],
  "archetypes": { "prefer": ["megaron"], "forbid": ["townhouse", "terrace"] }
}
```

Mechanics, all of them borrowed from what exists:

- `formPacks` is grounded against a `FORM_PACKS` registry in stdlib with the
  same machinery as the other three lists — an unknown word draws one
  aggregated warning naming the legal packs and the near matches
  (`LOAM-W489 INTENT_FORM_PACK_UNKNOWN`), never a fatal.
- A pack expands, at grounding time, to its **fabric-eligible** members: the
  `building` entries whose size class the quarter's lots can hold. Props and
  infrastructure do not enter the mix; they arrive through `props.prefer`, the
  street-furniture headliner rule and explicit nodes.
- **Precedence** (one order, stated once): `archetypes.forbid` > explicit
  `archetypes.prefer` > `formPacks` expansion > `ctx.today`. So a pack is a
  *default vocabulary*, and an author who names a specific archetype always
  outranks the pack that also contains it.
- **The reach law**, copied verbatim from the flora grammar because it is what
  made that layer safe: *a document that does not name a pack compiles
  byte-identically.* Capability arrives by authorship and the kit, never by
  changed defaults. No pack is ever implied by an era.

### 4.3 Era, theme and district gating

**Affinity is advice, not a gate.** Each pack declares
`{ eras, themes, characters }`. Those are used in exactly three places and
nowhere else:

- the **classifier's prompt** lists the packs with a one-line thesis each, so
  the pre-pass can write `formPacks` from ordinary prompt language — this is the
  same shape as the era alias table and the flora keyword list, and it is the
  step that actually makes the packs reachable;
- the **kit** teaches the pack list in §9d beside `materialTheme`, with the
  Troy sentence spelled out ("`sun_clay` is the palette; `classical_mediterranean`
  is the *forms*; a prompt from antiquity wants both");
- a **warning** when a scope names a pack whose eras do not include the scope's
  resolved era class (`LOAM-W490`), naming both. A modern Hellenist city (P5) is
  precisely the legal case that must not be blocked — era `modern` plus
  `classical_mediterranean` is the *point* of that prompt, so this can never be
  an error.

**Tag claims** are the second reachability path and are mandatory per pack: one
`<pack>ArchetypeOfTags` table per pack, registered in the `archetypeOfTags`
cascade, claiming only words no earlier table claims, with the exceptions
recorded in the entry's own catalog note exactly as the existing waves do. This
is what makes `{"tags": ["stoa"]}` on a leaf node work without any intent at
all.

### 4.4 What is deliberately not proposed

- **No new `materialTheme`.** Troy's lesson is that the palette was *right*; six
  themes plus per-scope `palettes` overrides span what these packs need. The one
  honest gap is an organic/xeno palette for 3.4's `xeno_spire` and `hive_mound`
  — it is Kai's call (§8 Q3), not this document's.
- **No new `STRUCTURE_CATEGORIES`.** Every proposed entry lands in one of the
  existing 24. Xeno-organic goes to `fantasy`, which is what that category is
  for.
- **No autonomous pack selection.** Nothing infers a pack from a prompt except
  the classifier pre-pass, whose output is printed and overridable by
  `--intent`. Consistent with the locked "critique → repair is manual".

## 5. Exhibit plan

**One pack, one exhibit world, one walk, one acceptance.** This is the whole
reason packs are the unit: Kai accepts twenty-four classical forms in a single
walk instead of twenty-four times.

The machinery exists — `packages/compiler/src/exhibits/*.ts` export rows,
`devworld-rows.ts` is the seam (one import, one spread), `devworld.ts` lays
them out. A pack exhibit must:

1. **Show every entry.** No entry ships unwalked. `test/catalog.test.ts` already
   refuses an `implemented` claim the registries do not back; the pack exhibit
   test additionally asserts every pack member appears in some row, so an entry
   cannot be implemented and invisible.
2. **Use a footprint shaped like the thing**, never the cottage gradient — the
   `relicSizeFor` precedent, per pack, with the reasoning written in the header
   comment (a stoa on a square plot is a shed; a `peripteral_temple` on a small
   square has its colonnade touching the cella).
3. **Give each entry its own row**, four cells across a gradient of theme (the
   pack's affinity themes first), size, and storey count, with one cell at the
   pack's expected default so a reader can see the thing the mix will actually
   build.
4. **Label by rule, not by sign.** The convention is already fixed and is worth
   restating because it is easy to break: *each row is fronted by a gravel rule
   running its whole length, laid two blocks south of the row, which is what
   lets you say "third building, stoa row" without placing a single sign.* Row
   labels key the layout, so **two rows with one label is a collision, not an
   extra exhibit** — every pack row is labelled `<pack>_<entry_id>`.
5. **Put props and infrastructure in their own sections.** Props go on the prop
   grid south of the building rows (they are laid out on rotated extents, not
   envelopes). Linear entries — `agora_colonnade`, `hedgerow`, `boardwalk`,
   `sphinx_avenue`, `castle_base_wall` — need a **run**, not a cell: a straight
   segment, a curve, a corner, and one crossing a slope, because every linear
   defect this project has found lived on a diagonal or a grade.
6. **Carry one context strip per pack**: three or four entries composed as they
   would actually stand — the stoa on an agora edge with a colonnade and two
   herms; the drying racks, capstan and anchor stack on one quay — because a
   catalog row shows the object and only a composition shows the *idiom*.
7. **Lint zero on all 26 rules**, like every shipped world. A pack exhibit is a
   generated world read back off disk.
8. **Give every bespoke program row one sloped cell**, so that a rigid sole —
   the same footing on every column — is visible in the exhibit rather than
   only in a walk of a real world.

## 6. Prioritization

Track A (the 98 `not_started` burn-down) is underway and is not sequenced here.
These packs are Track B. Ranked by battery coverage first, then breadth.

| # | Pack | Entries | Battery | Rationale |
|---|---|---|---|---|
| **B0** | **Selection wiring (§4)** | — | all | Not a pack. `grammar.mix` + `formPacks` + kit + classifier. **Nothing below it is reachable without it**, and it is the cheapest item in the table. |
| 1 | Classical Mediterranean | 24 | **P3, P5** | Two of seven battery prompts, and the only one with a walked failure diagnosis behind it (Troy c3). |
| 2 | Alien & Sci-fi | 18 | **P2, P4** | Two battery prompts. P2's invasion needs mass in the *fabric*; P4's hideout needs a door and a reason to eat. |
| 3 | Nautical & Pirate | 20 | **P1** (half) | P1 asserts two islands reading as opposed worlds; this is one of them. |
| 4 | Arcane & Magical | 16 | **P1** (half) | The other one. 3 and 4 must land together or P1 gets one characterful island and one generic one. |
| 5 | Wilds & Camps | 12 | **P6** | The logging camp P6 names outright. Smallest pack here. |
| 6 | Agrarian | 16 | P2 (hooked) | F17 already satisfies P2's farm assertion; this raises it from "legibly agriculture" to "a countryside". Highest ratio of immersion to effort in the document. |
| 7 | Frontier West | 14 | — | Highest breadth-of-prompt value of the non-battery packs; "wild west town" currently produces a Victorian mill town. |
| 8 | Nile & Ancient Egypt | 12 | — | The catalog cannot say *pyramid*, which is close to indefensible for a Minecraft product. Ranked below Frontier only because `sphinx` and `pyramid` are also strong bespoke-tier candidates and may not need catalog entries at all (§8 Q6). |
| 9 | East Asian | 12 | — | Real gap, but the existing houses mean a prompt gets *something* right today, which none of 7 or 8 do. |

**Against the calendar.** The feature-stop backstop is **2026-08-28** (SHIP-PLAN
§8.4); after it only battery FAILs and launch machinery may be worked. Honestly
scoped, **B0 plus packs 1–3 is what plausibly fits**, and B0 plus pack 1 is what
fits comfortably. Packs 4–9 are post-launch work, and saying so now is better
than discovering it on the 27th. If Kai wants P1 walked with both islands
characterful before freeze, packs 3 and 4 displace pack 2, and P2/P4 ride on the
bespoke tier alone.

**Sequencing inside a pack**, three waves: (a) tag table + catalog rows +
exhibit skeleton; (b) the building archetypes, in size order, largest first —
they are the ones whose footprints teach the exhibit; (c) props, infrastructure
and the context strip. Wave (b) is `opus-5-low` work against a written pack
spec; the linear entries in (c) want a medium slot because every one of them is
a sweep client on a diagonal.

## 7. Doctrine amendment — proposed replacement text

`docs/DESIGN.md`, "Smaller, high-leverage", currently ends:

> - Catalog curation over catalog completion — entry #441 is worth less than one
>   well-made monument.

**Proposed replacement** (not applied here; the orchestrator integrates):

> - **Catalog breadth in the prompt's own vocabulary.** Curation decides *which*
>   entries, never *how many*. The line this replaces — "entry #441 is worth
>   less than one well-made monument" — named a real failure (filling a taxonomy
>   for the taxonomy's sake) and drew the wrong conclusion, because the icon law
>   changed what an entry is for. A world screams its prompt only when the
>   ordinary fabric is built out of the prompt's own forms: Troy in `sun_clay`
>   reskinned medieval townhouse shells and read as a sandstone village, because
>   the palette was right and every form was borrowed. So the bar for a new
>   entry is not "does the taxonomy have a hole" but **"is there a sentence a
>   stranger would type that the catalog cannot say?"** — against which a stoa,
>   a jolly roger mast and a crop circle each earn their place and a fourth kind
>   of warehouse does not. Entries arrive in **form packs**, one culture, era or
>   genre at a time, each accepted in a single walk of its own exhibit world and
>   each reachable from ordinary prompt language before it ships — because an
>   unreachable entry is worth zero however well made, and that, not the count,
>   is what curation is for. See `docs/CATALOG-EXPANSION-v0.md`.

## 8. Open questions for Kai

1. **Does Track B start before the 2026-08-28 feature stop, and how far?**
   Recommendation: B0 (the wiring) plus pack 1 pre-freeze; everything else
   after. B0 alone is defensible as a *bug fix* — `character.archetypes` not
   being read is a defect, not a feature.
2. **`character.formPacks` — yes?** It is a spec-surface addition (a new
   `CHARACTER_KEYS` member, a new grounded vocabulary, a new warning code), and
   spec surface is yours. The alternative is "no pack key; authors and the
   classifier write the member ids into `archetypes.prefer` by hand", which
   works and is wordier and will be done inconsistently.
3. **A seventh `materialTheme` for organic/xeno?** `xeno_spire` and `hive_mound`
   in `modern_city` will read as concrete sculpture. Recommendation: yes, one —
   but only when pack 2 is actually scheduled, not now.
4. **Do packs land in the catalog as `not_started` rows up front, or only as
   they are built?** The catalog's stated premise is that listing the unbuilt is
   the point ("a to-do list cannot tell you what you are not thinking about") —
   which argues for adding all 143 now and letting the coverage map show 343/584.
   Against: the `not_started` count goes 98 → 241 while Track A is burning it
   down, and that number is read as a progress metric.
5. **Nine exhibit walks.** Each pack costs you one walk. Acceptable, or should
   small packs be paired into one exhibit world?
6. **`pyramid` and `sphinx`: catalog entries or bespoke landmarks?** The pyramid
   is a repeating fabric form (three of them, plus queens' pyramids) and belongs
   in the catalog. The sphinx is one sculpture per world, which is the bespoke
   tier's exact case. Recommendation: keep `pyramid`, drop `sphinx` from the
   pack and let the program author it — but it is a judgement about where the
   line sits, and you own that line.
7. **`peripteral_temple` beside Track A's generic `temple`.** Precedent-setting:
   it is the first deliberate "the generic one *and* the specific one" pair, and
   the same question will recur (`amphitheater`/`odeon`,
   `tea_house`/`shoji_teahouse`, both proposed above). Recommendation: allow it,
   and make the note on the generic entry say what the specific one took, so the
   split stays visible at the entries that make it.
