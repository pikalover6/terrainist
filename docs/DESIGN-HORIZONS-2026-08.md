# Terrainist — Design Horizons
*How far this can be pushed, and what to build next — 2026-08-01*


## Where the machine actually is

Terrainist now builds a settlement the way a place actually comes to exist. Terrain first, because the ground was there before anyone arrived. Then arterials, routed over that real ground toward things that matter: a shoreline, a valley, a river crossing. The faces of that road network become quarters, which is to say quarters are the *residue* of movement rather than rectangles someone drew. Each quarter cuts itself into blocks, blocks into lots, and a building is a thing that stands on a lot with its door on the street.

That inversion is the whole asset. Almost every generator in this space starts from objects and scatters them; ours starts from the void and lets the solid be what is left over. It is why a diagonal boulevard produces wedge-shaped corner blocks without anyone implementing wedges, and why a quarter on a hillside meets its neighbour at an angle without anyone specifying the angle.

The current stack, bottom to top: a deterministic heightfield with editable verbs (rivers, ridges, basins, plateaus); an arterial armature; a polygon partition into quarters with per-cell character, orientation, block size and palette drift; street skeletons clipped to each polygon; block and lot subdivision; a terrace generator that builds a whole block face as one assembly with shared party walls; a prominence field that gives the skyline a peak instead of a plateau; a life pass that dresses eye level; and a set-piece layer that closes vistas on landmarks. Underneath all of it: a 26-rule physics lint that must read back zero, and byte-for-byte determinism from spec plus seed.

> The generator is no longer the bottleneck on plausibility. It is now the bottleneck on *variety*.

That distinction matters for everything that follows. A year ago the honest criticism was "these buildings are wrong." Today it is "these cities are all the same city." The second problem is more interesting, more valuable, and requires a completely different kind of work.


## How much creative possibility is really here?

The question behind the question is: can a prompt produce a world that feels authored, or does it only ever produce a differently-tuned instance of one world? Right now, honestly: mostly the latter. But the reason is specific and fixable, and it is not a lack of randomness.


### The ratio that actually governs uniqueness

A world is roughly a hundred thousand meaningful decisions. An LLM author currently makes between ten and forty of them — region size, sea fraction, a river course, a city footprint, a handful of mixes and densities, five or six landmarks. Everything else is derived. That ratio is not inherently bad; a good architect makes few decisions and delegates the rest to craft. The problem is *which* decisions the author holds. They are almost all quantitative. None of them are structural.

Adding more parameters will not fix this, and this is the trap I would most want us to avoid. Ten new sliders produce ten-dimensional variations on one theme, and a viewer reads all of them as the same generator with different settings — which is exactly the criticism we already have. Variety that a human perceives as *creative* comes from differences in organising principle, not differences in magnitude.


### What we cannot currently express at all

Here is the useful test: name a real or fictional settlement and ask whether our vocabulary could describe it. The failures are informative, because they are all failures of *form*, not of detail.

| Settlement form | Why the current fabric cannot express it |
|---|---|
| Canal city (Venice, Amsterdam) | Water is an obstacle to route around, never a circulation network. Streets and canals cannot be the same graph. |
| Cliff / terraced town (Positano, Bhutan) | A quarter levels itself to one terrace. Multi-level fabric with stairs as primary circulation does not exist. |
| Radial / concentric plan (Paris, Karlsruhe) | Arterials are drives, spines, diagonals and one ring. There is no hub-and-spoke armature and no concentric block ring. |
| Grown medieval organic (Fez, Siena) | "Organic" is a jittered grid whose lines still span edge to edge. There are no cul-de-sacs, no branching lane trees, no irregular courtyard blocks. |
| Stilt / floating settlement | Every building needs solid ground under a footprint. There is no over-water foundation model. |
| Cave or overhang settlement | Structures are surface objects. Nothing builds into a ceiling or a rock face. |
| Linear strip (mining valley, oasis road) | A city is a footprint with an interior. A settlement that is 2000 x 120 has no vocabulary. |
| Vertical / stacked (arcology, mega-structure) | One building per lot, one ground plane. No stacking, no interior streets. |
| Ruined or abandoned quarter | Decay exists per-archetype but not as a property of a place. A quarter cannot be dead. |


### The proposal: urban form as a plugin, not a parameter

The single highest-leverage change available to us is to make the armature-and-partition strategy pluggable, exactly as the building grammar is pluggable by archetype. A city node would take a **form** — `radial`, `canal`, `terraced`, `linear`, `organic-grown`, `grid` — and each form supplies its own armature, its own partition, and its own block model, while everything downstream (lots, frontage, terraces, prominence, life, set pieces) stays exactly as it is.

This is cheap in a way that is easy to miss. The expensive machinery — subdivision, frontage alignment, terraces, the physics gate, the dressing passes — is form-agnostic already. What each new form needs is a way to draw its skeleton and a way to cut its cells. That is perhaps two to four days of work per form, against a payoff of a genuinely different-looking world each time. Six forms would multiply our expressible world space by more than anything else on this list.


### The second axis: time

Our quarters differ by *where* they are. Real cities differ by *when* they were built, and that is what a viewer reads as history. A medieval core with a nineteenth-century grid wrapped around it and a modern tower cluster punched into one corner is instantly legible as a real place, and we can nearly express it today — per-cell character, mix and palette are already independent. What is missing is an era concept that binds a cell's fabric density, street width, block size, palette, roof forms, and wear into one coherent draw.

> A city that was built all at once looks generated. A city with three eras in it looks like it happened.

I would rate era higher than any new archetype. It is a small amount of code — a table of era profiles and a rule for which cells get which — and it changes the read of every world we make.


### The third axis: negative space and consequence

Every quarter we generate is either built or a park. Real places have quarters that are half-finished, burnt, flooded, condemned, walled off, or simply never developed. A single `state` per cell — thriving, declining, ruined, under construction, flooded — driving coverage, decay, palette and prop selection would give worlds a narrative texture that no amount of building variety can substitute for. It also composes for free with the ruins archetypes already in the catalog.


## Fewer, far larger structures

The instinct here is right, and I would go further than the question implies: I think the marginal value of catalog entry number 400 is close to zero, and the marginal value of one well-made 120-block monument is enormous.


### Why size beats count

A player remembers about five things from a world. Not five hundred — five. They remember the silhouette on the hill, the bridge they crossed, the thing they could see from three streets away. Ninety-eight small archetypes fill a street; they do not produce a memory. The catalog's job is *texture*, and we have enough texture. What we lack is *events*.

There is also a compounding argument. A large structure is where all our other machinery pays off at once: it terminates a vista, it anchors the prominence field, it justifies a square, it gives the life pass something to crowd around, and it is what a screenshot is *of*. Small archetypes do none of that individually.


### The technical unlock: a monument is a tiny city

The reason we have not built 150-block structures is that the building grammar generates one shell with one interior, and that model does not survive at scale — a cathedral is a nave plus aisles plus transepts plus a cloister plus a tower, and a castle is a curtain wall plus baileys plus a keep plus outbuildings. Trying to express those as one shell is why they would come out as boxes.

But we already own the machinery to do it properly. A compound structure is a footprint subdivided into parts with adjacency and circulation between them — which is precisely the settlement problem at a smaller scale. Applying the layout solver recursively inside a building footprint is, I believe, the single most valuable piece of engineering available to us after urban forms. It converts "one huge structure" from a bespoke authoring job into a generative one, and it is reusable across every monument we would ever want.

> A castle is a walled town with one owner. A cathedral is a street plan under a roof.


### The twenty-four I would build, in priority order

Prioritised by silhouette value — how much a world changes by containing one — rather than by how interesting they are to implement.

| Tier | Structures | Why this tier |
|---|---|---|
| 1 - Skyline | Cathedral complex; hilltop castle with curtain wall and baileys; stadium/arena; mine headframe with spoil heaps; grand station with train shed; lighthouse-and-harbour-fort | Visible from anywhere in the world. Each one alone changes the world's identity. |
| 2 - Crossing | Multi-span stone viaduct; suspension/rope bridge over a gorge; dam with spillway; canal lock flight; city gate with barbican | Infrastructure that makes terrain readable as a place people had to solve. |
| 3 - Enclosure | Monastery on a crag; university quad; palace with formal gardens; walled old town; caravanserai; shipyard with drydock | Compound structures with real courtyards - the recursive-solver showcase. |
| 4 - Strange | World-tree with structures in its canopy; giant mushroom colony; ziggurat/step temple; petrified colossus; sunken cathedral; observatory on a spire; arcology tower | The ones that make a world feel like a fantasy setting rather than a simulation. |

Twenty-four monuments across four waves, at roughly one wave per focused push, is a realistic shape. I would build the recursive compound-structure solver first and take the schedule hit, because building six of these by hand and then discovering we need the solver anyway is the expensive path.


## How flexible is the settlement generator, honestly?

Very flexible within its form; quite rigid about the form itself. It is worth being precise about which is which, because the flexible axes are where authoring effort pays off today, and the rigid ones are the engineering backlog.


### What an author can already move

- **Armature** - number of diagonals, whether there is a ring, whether the city is coastal, city size class.
- **Quarter character** - eight characters, each with its own mix, and the assignment is driven by real geometry (relief, water frontage, centrality, compactness) rather than a draw.
- **Density and grain** - block size per city and per character, density class, lot coverage.
- **Skyline** - prominence field with core decay, waterfront bonus, landmark spikes; storeys from 2 to 28 with setbacks and rooftop kit.
- **Materials** - four themes, per-quarter palette drift, per-building material triples.
- **Set pieces** - up to six anchors, filterable by kind, with landmarks pinnable to a named arterial's terminus.
- **Landform** - full heightfield control plus editable verbs, and now a scale reference so a landform grows with the world.


### What is hard-coded, and what each would unlock

| Rigid assumption | What relaxing it buys |
|---|---|
| Cells come from arterial faces only | Any non-road partition: a river-defined quarter, a wall-defined old town, a rail-severed industrial belt. |
| Blocks are axis-aligned inside a rotated cell | Curved and radial block rings; concentric plans; blocks that follow a contour. |
| Lots are the block perimeter | Courtyard blocks with interior lots, mews, back-land development - the texture of a real old quarter. |
| One ground plane per quarter | Terraced hillside towns, multi-level streets, bridges as circulation rather than decoration. |
| One building per lot (terraces excepted) | Compounds, yards with outbuildings, farmsteads - anything with a boundary and stuff inside it. |
| Streets are the only circulation | Canals, stairs, funiculars, elevated walkways, alleys as a real network. |
| A building fronts exactly one street | Corner buildings that turn properly; buildings addressing a square rather than a street. |

The ordering I would recommend: courtyard blocks first (cheapest, and it is the difference between a modern grid and an old quarter), then multi-level ground, then non-road partitions. Curved geometry is the most expensive and I would defer it — a 15-degree quantised world already reads as varied, and true curves fight the determinism rules hard.


## Tripo, and where generated meshes actually belong

My honest read: Tripo is valuable, but not for buildings, and not at compile time. Used carelessly it would cost us the two properties that make this project defensible - determinism and correctness. Used well it solves a problem the grammar genuinely cannot.


### What a grammar is bad at

Our building grammar is good at things with rules: walls, floors, doors, circulation, roofs, windows on a rhythm. It is structurally bad at things with *no* rules — a statue, a figurehead, a twisted idol, a beached whale skeleton, an alien flower, a gnarled root formation, a fountain's centrepiece. Those are exactly what a mesh generator is good at, and exactly what makes a world feel hand-made when a player finds one.

> Let the grammar build what has rules. Let the mesh pipeline build what has none.


### The one architectural rule I would insist on

**Tripo must be an offline asset foundry, never a compile-time dependency.** A world compile must remain a pure function of spec plus seed. The moment a network service with non-deterministic output sits inside the compile path, we lose byte-identical reproduction, we lose the ability to regression-test worlds, and we lose the physics guarantee, because nobody lints an asset that did not exist when the test was written.

The shape that works: a separate `tripo-forge` tool takes a prompt, gets a mesh, voxelises it, repairs it, maps its colours to a curated block palette, runs the physics lint over it, and commits the result as a versioned structure asset with its prompt and provenance recorded. The world compiler only ever consumes committed assets. Assets are reviewed by a human once, then they are as deterministic as anything else in the repo.


### The four problems that will actually bite

| Problem | Why it bites | Mitigation |
|---|---|---|
| Support and floating blocks | A voxelised mesh has overhangs and disconnected islands everywhere. Our lint rejects all of them. | A repair pass: connectivity analysis, then either add hidden support or prune the island. Non-negotiable before an asset is committed. |
| Palette mapping | Mesh colour space is continuous; Minecraft is a few hundred blocks with texture noise. | A curated palette per material family plus ordered dithering. Hand-pick the palettes; do not use nearest-RGB, it produces mud. |
| Scale and legibility | Below about 15 blocks a voxelised mesh reads as a blob. Above about 80 it reads as terrain. | Target 20-60 blocks. Author the prompt for silhouette, not detail. |
| Cost and review | Every asset needs a human look. That does not scale to hundreds. | Treat it as a curated collection, tens not hundreds. Quality over count is the whole thesis anyway. |

Done this way I would expect Tripo to earn its place — a library of perhaps forty to eighty sculptural objects that the set-piece and prop layers can call on, giving worlds a hand-made quality no grammar will ever produce. Done the other way, as a live call inside the compiler, I would expect it to quietly destroy the project's best properties.


## How much control does the LLM author really have?

More than it looks from the outside, and less than it needs. The deliberate design decision - that authors never emit coordinates - is correct and should not be revisited. But the vocabulary an author has instead is almost entirely about quantity, and a model reasoning about a prompt thinks in qualities.

| Axis | Control | Notes |
|---|---|---|
| Terrain form | High | Heightfield parameters plus editable verbs with courses. An author can genuinely describe a landscape. |
| What exists | High | Mixes, per-character mixes, archetypes, landmark nodes, precinct kits. |
| Where things are | Medium | Zones, distance, adjacency, facing, along, within. Deliberately not coordinates. Adequate but coarse - there is no way to say "on the far bank" or "where the two roads meet". |
| What things look like | Low-Medium | One theme per world plus palette overrides. No per-building or per-quarter material intent beyond the automatic drift. |
| Interiors | None | Fit-outs belong to the archetype. An author cannot ask for a library that is mostly a reading room. |
| Fabric shape | Low | Grid or organic, and a block size. This is the biggest single gap. |
| Mood, era, story | None | There is no vocabulary at all. This is the second biggest gap and the most valuable to close. |


### The feature I would build before any other author-facing work

A **semantic intent layer**: a small set of dials that mean something to a language model and fan out into dozens of existing knobs. Not new machinery — a mapping onto machinery we already have.

- `era` - medieval, industrial, modern, far-future. Binds block size, street width, density, palette, roof forms, prop selection.
- `wealth`, optionally per quarter - drives storeys, materials, ornament rate, wear, garden treatment.
- `decline` - the ruin and abandonment dial. Coverage down, decay up, vegetation reclaiming pavement.
- `event` - flood, fire, siege, boom. A one-word history that leaves consistent traces across every pass.
- `formality` - how much the plan was designed versus grown. Straightness, vista discipline, block regularity.

This matters because of how authoring actually works. A model handed a prompt like "a prosperous river city that never recovered from the flood" currently has to translate that into sea fractions and block sizes, and it will do it badly and inconsistently. Handed `era`, `wealth`, `decline` and `event`, it does the thing language models are actually good at. I would expect this to improve authored-world quality more than any compiler feature on this list, and it is a few days of work.


## Everything that is not a building

This is the largest gap between what we build and what a world contains, and it is where I would spend the most creative energy. Roughly: our settlements are excellent and our landscapes are wallpaper.


### A flora grammar, as a first-class generator family

Scatter currently places trees from four shapes. That is a decoration system, not a generator. What is missing is a flora grammar with the same standing as the building grammar — deterministic branching with real structure, at scales the vanilla game never reaches.

- **Canopy giants** (40-90 blocks) - tapered trunk, branch whorls at height intervals, canopy as nested shells rather than a blob, buttress roots that meet the ground properly, hollows, and platform-capable limbs.
- **Ancients** (100+) - a tree as a site: aerial roots forming a colonnade, structures built into the canopy, rope bridges between limbs, a hollow trunk with an interior. This is a monument, not a plant.
- **Fungal** - giant caps with gills, shelf fungus stacked on cliffs, spore towers, glowing mycelium fields, a whole fungal forest biome.
- **Fantasy strata** - crystal formations, petrified forests, floating islands with root chains hanging beneath, bioluminescent swamp, coral cathedrals for underwater work, bone and fossil features.
- **Groves and stands** - flora that composes: a clearing with a ring of ancients, an avenue of planted trees along a drive, an orchard grid, a windbreak line following a field edge.

The technical note that matters: this is all deterministic integer work, and the physics lint already knows how to check it. A branching model with quantised angles is no harder than the 15-degree street rotation we already ship. Leaves need support-chain discipline, which the lint will enforce for free.


### Infrastructure - the stuff that makes terrain legible

| Generator | What it produces |
|---|---|
| infra.bridge@0 | A real bridge kit: beam, arch, truss, suspension, rope. Piers founded on the actual riverbed, approach ramps, balustrades, lamps. Today a bridge is a widened road deck. |
| infra.wall@0 | Curtain walls that follow terrain with towers at intervals, gates, wall-walks, and a proper relationship to the fabric inside them. |
| infra.aqueduct@0 | Arched water carriage across a valley - one of the highest silhouette-value objects in the whole list. |
| infra.canal@0 | Navigable water as circulation: cuts, embankments, lock flights, towpaths, basins and wharves. |
| infra.rail@0 | Track with cuttings, embankments, tunnel portals, viaducts, sidings, yards. Rail is what makes an industrial world read as industrial. |
| infra.mine@0 | Headframe, winding house, spoil heaps, adits into a hillside, tramways down to a processing works. |
| infra.terrace@0 | Agricultural terracing that follows contour with retaining walls - and the same machinery gives us hillside settlement terraces. |


### Farms, and why they matter more than they sound

Farmland is what makes a settlement look inhabited from a distance, and we have almost none of it. A real agricultural layer is field parcels that follow contour and boundary rather than a grid, hedgerows and drystone walls, gates and stiles, irrigation channels, orchards and vineyards on the slopes that suit them, paddies on the flat, barns and silos sited in relation to the fields they serve rather than dropped nearby, and a track network that connects them to the road.

> A city with no hinterland looks like a model. A city with fields around it looks like it eats.

I would also want the camp and nomadic register — fishing camps on a shore, logging camps at a treeline, a caravanserai on a route, a pilgrim shrine at a pass, charcoal burners in a wood. These are cheap to build, they fill the enormous empty space between settlements, and they are the difference between a world and a diorama.


## What makes this a product

An opinion, since it was invited. The market position is not "generates Minecraft worlds" - several things do that. It is that our worlds look like somebody built them, and that we can guarantee they are correct.


### Three pillars, in the order they matter


#### Legibility - can a player describe the world afterwards?

This is the test I would hold every feature to. "The town on the bluff with the cathedral you can see from the bridge" is a world that succeeded. Vistas, silhouettes, landmarks and terminated boulevards all serve this and nothing else. It is why the set-piece layer matters more than its block count suggests.


#### Coherence - does everything look like the same place and time?

Incoherence is the loudest tell of generation. One anachronistic roof, one palette that belongs to another world, and the illusion goes. Era, palette discipline and consistent wear are the defence, and they are cheap.


#### Incident - is there a reason to walk another hundred blocks?

The life pass was the first real investment here and it worked. The next tier is incident at landscape scale: something on the horizon worth reaching.


### The demo problem

A screenshot undersells this project badly, because the thing we are good at — coherence across a kilometre — is invisible in a 90-degree frame. Two artifacts would sell it far better, and both are nearly free given the data the compiler already produces: a **rendered plan map** of each world, poster-style, showing the arterials, quarters, water and landmarks; and a scripted **flythrough path** along the vista axes we already compute. The map in particular is a genuinely striking object and it is a report-to-SVG job, not a graphics project.


### The moat

Determinism plus the physics gate is a real competitive advantage and I do not think it is widely appreciated. Any approach that generates worlds by sampling a learned model cannot promise that a door opens, that a staircase reaches the floor above, that nothing floats, or that the same prompt gives the same world twice. We can promise all four, and we can promise them because we spent months making a lint that reads worlds back off disk and refuses to ship on any finding. That is the thing to say out loud in any pitch.


## What I would do next

Ordered by value per unit of effort, with my honest estimate of size. I have tried to be ruthless about sequencing: the things that unlock other things come first, even when something further down the list is more fun.

|  | Work | Size | Why here |
|---|---|---|---|
| 1 | Semantic intent layer (era, wealth, decline, event, formality) | S | Days of work. Changes every world an LLM authors, and makes prompts translate honestly. Nothing else on this list has that ratio. |
| 2 | Urban forms as plugins - radial, canal, terraced, linear, grown | M | The direct answer to "all the settlements are the same." Downstream machinery is already form-agnostic. |
| 3 | Recursive compound structures (a monument is a tiny city) | M | Unlocks the entire monument tier. Building six monuments by hand first is the expensive path. |
| 4 | Flora grammar - canopy giants, ancients, fungal, fantasy strata | M | The biggest visible gap outside settlements, and it makes every wilderness shot worth taking. |
| 5 | Infrastructure family - bridges, walls, aqueducts, rail, canals, mines | M | Makes terrain legible as something people had to solve. High silhouette value per block. |
| 6 | Agricultural layer - fields, hedgerows, orchards, farmsteads, tracks | S-M | Cheap, and it is what makes a settlement look like it eats. |
| 7 | Monument tier 1 and 2 - twelve structures | M | After 3. These are the things a player remembers. |
| 8 | Tripo asset foundry - offline, committed, lint-gated | M | Sculptural objects a grammar cannot make. Strictly offline, or it costs us determinism. |
| 9 | Courtyard blocks and multi-level ground | M | The two fabric rigidities most worth relaxing. Unlocks old quarters and hill towns properly. |
| 10 | Plan-map and flythrough artifacts | S | The demo problem. Nearly free given what the report already holds. |


### If there were only one week

The intent layer and one urban form — I would pick canal or terraced, because both are visibly different from anything we have shipped and both stress the fabric in useful ways. That combination would produce, by the end of the week, a world nobody would guess came from the same generator as Bayline. Everything else can wait.


### What I would deliberately not do

- **Do not finish the 440-entry catalog.** The remaining ninety-eight entries are worth less than one monument. Finish the ones that fill obvious gaps and stop.
- **Do not add parameters to the existing form.** More sliders on one city model produce more instances of one city.
- **Do not put a model in the compile path.** Not Tripo, not anything. The determinism guarantee is the moat.
- **Do not build autonomous critique-and-repair.** It remains a standing decision, and it is the right one - a repair loop optimises against the lint, and the lint is not the same thing as good.


## Risks, and what I am least sure about


### The risks I would actually worry about

- **Verification time is becoming the bottleneck.** A 1024-square world compiles in under a minute and takes twenty minutes to lint, because the lint reads the world back off disk. At 2048 that is hours. If world size keeps growing this stops being a background task and starts being a schedule.
- **Cross-pass interactions are the dominant bug class now.** Three of the four real bugs in the last round were passes that were each individually correct - a lantern that sealed a stairwell, a stall straddling a graded step, a landmark seated in a hillside. Each pass verified clean alone. This will get worse as passes multiply, and pinned contracts help less than they look.
- **Cost of authoring worlds by hand.** Every world in the repo was hand-written by an agent taking real care. If the product is prompt-to-world, the model has to do this unaided, and we have not measured how well it does since the fabric changed.
- **Catalog rot.** The theme sweep found that a theme was only ever as tested as the archetypes that happened to use it. The same will be true of forms, eras and flora. Cross-product testing needs to keep pace with vocabulary growth or we ship silent breakage.


### Where I could be wrong

The strongest counter-argument to everything above is that **form variety may matter less than I think, and detail density more.** It is possible that a player walking one well-dressed city never notices it is the same plan as another world, and that what actually sells is incident per hundred blocks. If that is true, the life pass and the catalog are the right investment and urban forms are an expensive detour.

I do not believe it, because the criticism that started this round was precisely a form criticism made from a screenshot — the rectangles were legible immediately, before any question of detail. But it is testable cheaply: build one alternative form, put it beside Bayline, and see which one a fresh viewer finds more interesting. I would run that test before committing to the full six.

> The generator is good enough that the interesting question is no longer whether it works. It is what we want it to say.

