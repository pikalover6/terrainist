# Walk card — montfort_hill_k1 ("A walled medieval city on a hill, its castle keep above the rooftops", seed 311)

Golden prompt walled_medieval_city (the noise-floor prompt). Authored one-shot;
two compile-feedback rounds (six E170 CANNOT_FIT: the keep 15×15, the high
church 13×17 and the guildhall 13×15 found no block big enough inside the
city — the keep ended as a root-level building on the summit); no bespoke
program requested; $0.106. The model wrote `"archetype": "keep"` — cluster
3's canonical spelling — and `params.walls` with gates.

Stations — `/tp` then ONE question each:
1. `/tp -6 104 -82` — the keep (y 101), north of the walled quarter (levels 82
   and 93). Does it crown the hill above the rooftops, and is it inside or
   outside the circuit?
2. `/tp -15 85 -51` — the circuit wall's north edge (masonry, height 7, eight
   towers, three gates). Does the wall read as the icon of a walled city?
3. `/tp 0 80 143` — spawn, the lower town at level 82. Building spacing after
   the distance-from-the-face fix: too tight, too loose, or right?
4. `/tp -20 92 40` — the step between the two levels (82 → 93). Retained edge,
   bank, or raw cut?
5. `/tp -88 78 200` — the lowland holding (a farm precinct: yard, parcels,
   farmstead). Do the farmhouse doorsteps step down honestly?

Known debts: the high church and guildhall may be absent (E170); T112 a river
with no sea, ponded; 8× frontage-tie drift notes; W489 walls declared both
ways (one circuit built, benign). Spawn (0, 77, 143).
