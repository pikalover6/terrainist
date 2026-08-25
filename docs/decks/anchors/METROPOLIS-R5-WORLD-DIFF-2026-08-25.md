# Metropolis r5 — ANCHOR (9b4dd50) vs HEAD (085e22d) world diff

Same document bytes, same seed, two compilers. Read back from raw region NBT
(palette-decoded), 100,663,296 voxels compared over 1024 chunks / 4 regions.

## Summary (12 lines)
1. **Ground / retaining.** Terrain graded differently: `stone -> dirt` ×31,941 and
   `dirt -> grass_block` ×6,142 — the retaining subsystem swapped from banked seams
   (W411 ×64 at anchor) to revetted tiers (W413 ×18 at head); W411 is now silent.
2. **Roads.** Road surface churns rather than shrinks: `smooth_stone -> gray_concrete`
   ×4,917, `dirt/polished_diorite -> smooth_stone` ×16,237; T239 (water-floor lift
   clamped on street stations) appears ×10 at head, ×0 at anchor.
3. **Buildings — the dominant change.** City-block roll shifted: 103 placements → 90,
   terraces 68 → 45, infills 28 → 38, envelope volume 985,607 → 717,295 (−27%).
   Net concrete/quartz loss: gray −20,558, white −18,264, light_gray −11,376,
   smooth_stone −25,034, polished_diorite −17,288, smooth_quartz −4,638.
4. **Named icons survive.** `shattered_tower_spire`, `hollow_corporate_hub`,
   `hideout_sentry_tower`, `hideout_power_hub` are placed at byte-identical
   footprints and sizes on both sides — no icon lost, but their interiors re-rolled.
5. **Vegetation.** Trees up (9,355 → 9,401; understory 113 → 120); oak_leaves +3,606,
   spruce_leaves +668, oak_log +624, moss_carpet +142, moss_block +28.
6. **Vines LOSE voxels: 42,441 → 41,582 (−859)**, `vine -> air` ×4,215 gross.
7. **Water.** River/pools gain: 87,298 → 87,934 (+636); a new I526 ×16 declines to
   grade water-majority platforms. landFraction 0.84752 → 0.84717.
8. **Ruined palette.** mossy_cobblestone −87, mossy_stone_bricks −8,
   gray_stained_glass −240 → 0, polished_blackstone −145 → 0; cracked_stone_bricks
   unchanged (2,276). stone_bricks +5,100 (`polished_andesite -> stone_bricks` ×4,710).
9. **Glass.** glass_pane 14,795 → 11,689 (−3,106) — building fit-out, tracks the
   lost terrace envelope volume.
10. **Programs / fit-out.** W511 (skyscraper has no shell decay mode) 14 → 16;
    bookshelf −923, lantern −781 — interior program density down with envelope.
11. **Biomes** changed in 19 chunks: plains→forest ×2,592 quarter-cells, plus
    small beach/windswept/ocean shifts. level.dat: spawn y 76 → 75, nothing else.
12. **Overall: 521,997 differing voxels = 0.5186%** of the volume; 96% of them sit
    inside `world.ruined_metro`. Diagnostics 86 → 75.

**T6 checklist, voxels LOST anchor → head:** vines −859 (LOST); ruined palette
partially LOST (mossy_cobblestone −87, gray_stained_glass −240, polished_blackstone
−145); fallen towers NOT lost (identical footprints); street trees NOT lost (+3,606
leaves); river NOT lost (+636 water).

## Top 25 transitions
```
  gray_concrete -> air  51047
  white_concrete -> air  39462
  stone -> dirt  31941
  smooth_stone -> air  30536
  light_gray_concrete -> air  29707
  air -> gray_concrete  27495
  air -> white_concrete  19694
  polished_diorite -> air  15461
  air -> light_gray_concrete  15167
  polished_diorite -> smooth_stone  11087
  smooth_quartz -> air  9672
  dirt -> smooth_stone  9525
  smooth_stone -> polished_diorite  7576
  dirt -> polished_diorite  6712
  polished_andesite -> air  6383
  dirt -> grass_block  6142
  air -> smooth_quartz  5899
  glass_pane -> air  5102
  smooth_stone -> gray_concrete  4917
  polished_andesite -> stone_bricks  4710
  dirt -> stone  4439
  dirt -> air  4431
  air -> stone  4315
  vine -> air  4215
  smooth_stone -> white_concrete  4073
```

## Block census (anchor vs head)
```
block                        anchor      head   delta
acacia_leaves                     0        42   +42
acacia_log                        0         9   +9
azalea_leaves                  5678      5718   +40
birch_leaves                     56        84   +28
birch_log                        12        18   +6
cherry_leaves                    70        98   +28
cherry_log                       15        21   +6
coarse_dirt                    5566      5702   +136
cracked_stone_bricks           2276      2276   0
dark_oak_leaves               25995     25995   0
dark_oak_log                   8776      8776   0
deepslate                  17171426  17171532   +106
flowering_azalea_leaves         388       388   0
glass_pane                    14795     11689   -3106
gray_concrete                 73644     53086   -20558
gray_stained_glass              240         0   -240
jungle_leaves                    28        84   +56
jungle_log                        6        18   +12
moss_block                     1839      1867   +28
moss_carpet                   14829     14971   +142
mossy_cobblestone              1425      1338   -87
mossy_stone_bricks             1565      1557   -8
oak_leaves                   615704    619310   +3606
oak_log                      136563    137187   +624
spruce_leaves                111292    111960   +668
spruce_log                    17736     17864   +128
stone_bricks                   2626      7726   +5100
stripped_oak_log                 20        40   +20
tinted_glass                    180       180   0
vine                          42441     41582   -859
water                         87298     87934   +636
```

## Heatmap — differing voxels per 16x16 column cell (0-9 = log scale, # = 1000+)
```
     -256-192-128-64 0   64  128 192 
 -256 ................................
 -240 ................................
 -224 ................................
 -208 ................................
 -192 ................................
 -176 ................................
 -160 ...........22...................
 -144 ...........58#7#788888#888#84...
 -128 ............################5...
 -112 ...........178787###########5...
  -96 .......365018###############6...
  -80 ......578#708###############5...
  -64 .....786##728###############6...
  -48 ....6#777743################6...
  -32 ...576543..38888788#########6...
  -16 ...4754444.08######888######6...
    0 .....4...340################6...
   16 .....4....428###############4...
   32 .....4......###########8####3...
   48 ...........28############8##5...
   64 ............################5...
   80 ...........28#8####8#####8##4...
   96 ............3.2.2.22124653431...
  112 ................................
  128 ................................
  144 ................................
  160 ................................
  176 ................................
  192 ................................
  208 .......65.......43..............
  224 .......44.......................
  240 ................................
```

## Y histogram (8-block bands)
```
  y48..55: 171
  y56..63: 5895
  y64..71: 58040
  y72..79: 141475
  y80..87: 109702
  y88..95: 89683
  y96..103: 66692
  y104..111: 35989
  y112..119: 7907
  y120..127: 2344
  y128..135: 2318
  y136..143: 1701
  y144..151: 74
  y152..159: 6
```

## Attribution — 15 hottest cells and the node footprints they fall in
```
x-48..-33 z-128..-113  n=9177  :: ruined_metro, shattered_tower_spire
x-16..-1 z-128..-113  n=5976  :: ruined_metro, hollow_corporate_hub
x96..111 z-16..-1  n=5540  :: ruined_metro, infill_97_-14
x16..31 z0..15  n=5418  :: ruined_metro, terrace_15_2
x64..79 z-48..-33  n=5138  :: ruined_metro, terrace_53_-57, terrace_53_-36, infill_66_-46
x96..111 z64..79  n=4928  :: ruined_metro, terrace_86_59, terrace_86_74
x128..143 z-48..-33  n=4763  :: ruined_metro, terrace_122_-57, terrace_122_-36, infill_122_-46, infill_136_-46
x160..175 z0..15  n=4687  :: ruined_metro, terrace_158_1
x160..175 z-96..-81  n=4501  :: ruined_metro, terrace_158_-92
x160..175 z-80..-65  n=4391  :: ruined_metro, terrace_158_-78
x16..31 z-80..-65  n=4321  :: ruined_metro, terrace_15_-78
x160..175 z32..47  n=4283  :: ruined_metro, terrace_158_23, terrace_158_38
x160..175 z-16..-1  n=4159  :: ruined_metro, terrace_158_-14
x128..143 z-96..-81  n=4155  :: ruined_metro, terrace_122_-92
x16..31 z64..79  n=4105  :: ruined_metro, terrace_15_59, terrace_15_74
```

## Diagnostics (per side, count + first message, 200 chars)

| code | anchor | head |
|---|---|---|
| LOAM-W411 | 64 | 0 |
| LOAM-W413 | 0 | 18 |
| LOAM-I526 | 0 | 16 |
| LOAM-T239 | 0 | 10 |
| LOAM-W511 | 14 | 16 |

- **W411** (anchor only): `a seam in "world.ruined_metro" drops 8 blocks over 25 column(s), past the 6 blocks a retaining wall is built for, so the two platforms were graded into each other as a bank`
- **W413** (head only): `a seam in "world.ruined_metro" drops 8 blocks over 17 column(s) and was served by a revetted stack of 2 tier(s) (faces 4+4), but 2 of those tier(s) found no ground to stand on and 2 seam column(s) …`
- **I526** (head only): `platform "block.22371.6" in "world.ruined_metro" is mostly water and is not graded: its columns keep the pristine terrain and the water on it`
- **T239** (head only): `the water floor asked street segment "segment:ew3!world.ruined_metro" to stand above its own natural ground at 17 of 260 station(s), by up to 8 block(s); clamped to 2 so the rim's lift could not pr…`
- **W511** (both): `"skyscraper" has no shell decay mode — it is built by its own generator rather than the shell fit-out — so the decay was not applied at all`

## Crop — hottest cell (x-48..-33 z-128..-113, `shattered_tower_spire`), 48x48 top-surface

Legend: `.` grass/dirt/sand  `#` stone/concrete/brick  `r` road surface (smooth_stone /
gray concrete)  `T` leaves/log  `v` vine  `~` water  `m` moss  `?` other  ` ` void

```
crop x-56..-9 z-136..-89   ANCHOR                                            |  HEAD
 -136 #r###r.#rr#r##r#.?#??#r#??##?rrr#?r#r####??#r#?? | #r###r.#rr#r##r#..##.#r#####.rrr#.r#r####r#rr##r
 -135 ####.#########..###??#.#??#######?#####.#??###?? | ####.#########..######.##########.#####.########
 -134 ######.######.#################rr.########.####. | ###############################rr.##############
 -133 #rr##r#r?r##r#rrr#?rr#?#??r#rr#####rrrr#????r#r# | ##r##r#r?r##r#rrr#?rr#?#??r#r#######rrr#????r#r#
 -132 ##r#r#####################?.r#######r..######### | ##r#r#####################?.r#######r..#########
 -131 ##r#?#####################?#r##rrr##r..#r#rrrrrr | ##r#?#####################?#r##rrr##r..#r#rrrrrr
 -130 ##r#?###########r#########?.r##rr.##rTTTr#rrrrrr | ##r#?###########r#########?.r##rr.##rTTTr#rrrrrr
 -129 .#r#r#######################r##rrr.#rTTT?#rrrrrr | .#r#r#######################r##rrr.#rTTT?#rrrrrr
 -128 ##r#?#####################?#r##rrr.#rTTTr#rrrrrr | ##r#?#####################?#r##rrr.#rTTTr#rrrrrr
 -127 ##r#?#####################?#r##rrr##r...##rrrrrr | ##r#?#####################?#r##rrr##r...##rrrrrr
 -126 ##r#?#####################?.r##rrr##r...?#rrrrrr | ##r#?#####################?.r##rrr##r...?#rrrrrr
 -125 ?#r#######################?#r##rrr##r..#?#rrrrrr | .#r#######################?#r##rrr##r..#?#rrrrrr
 -124 ##r.?#####################r#r##rrr.#r..###rrrrrr | ##r.?#####################r#r##rrr.#r..###rrrrrr
 -123 ##r?r#####################?#?#.rrr##rTTT?#r##rrr | ##r?r#####################?#?#.rrr##rTTT?#r##rrr
 -122 ##r#############?###########?##rrr##rTTT?#r##rrr | ##r#############?###########?##rrr##rTTT?#r##rrr
 -121 .#r.?#######################?##rrr##rTTT?#rrrrrr | .#r.?#######################?##rrr##rTTT?#rrrrrr
 -120 ##?#?#####################?#r#..rr##r...?#rrrrrr | ##?#?#####################?#r#..rr##r...?#rrrrrr
 -119 ##r#?#######################r##.rr##r..###rrrrrr | ##r#?#######################r##.rr##r..###rrrrrr
 -118 ##r#?#######################r##rrr?#r..#?#rrrrrr | ##r#?#######################r##rrr.#r..#?#rrrrrr
 -117 ##r#?#####################?#r##rr.##r...r#rrrrrr | ##r#?#####################?#r##rr.##r...r#rrrrrr
 -116 ##r#?##################?##?#r##rrr##rTTT##rrrrrr | ##r#?##################?##?#r##rrr##rTTT##rrrrrr
 -115 ##r#?#####################?.r##rrr##rTTT?#rrrrrr | ##r#?#####################?.r##rrr##rTTT?#rrrrrr
 -114 ##r#?#####################?#r##rrr##rTTT?####### | ##r#?#####################?#r##rrr##rTTT?#######
 -113 ##r.#???#????#r????#?r?r#?#.r##rrr##r..##???##?# | .#r.#???#????#r????#?r?r#?#.r##rrr##r..##???##?#
 -112 ##r.#####.#???#??#########.#r##r.r##r..####.#### | ##r.#####.#???#.##########.#r##r.r##r..####.####
 -111 ##r............??...........r##rrr##r........... | ##r.........................r##rrr##r...........
 -110 ##r.?.......................r#.rrr##r........... | ##r.?.......................r#.rrr##r...........
 -109 ##????....???..??....??.....r##r.r##?TTT........ | ##????....???..??....??.....r##r.r##?TTT........
 -108 ##?.?....??....??..........?r##rrr##?TTT........ | ##?.?....??....??..........?r##rrr##?TTT........
 -107 .#?.........?..??..........?r##rrr##?TTT........ | .#?.........?..??..........?r##rrr##?TTT........
 -106 ?#r....??.............?...?.r##.rr##r........... | .#r....??.............?...?.r##.rr##r...........
 -105 ##r.........................r##rrr##r........... | ##r.........................r##rrr##r...........
 -104 ##r................?...?....r##rrr##r.........TT | ##r................?...?....r##rrr##r.........TT
 -103 ##r..????...????..???..?....###rrr##r?..????..TT | ##r..????...????..???..?....###rrr##r?..????..TT
 -102 ##r................?........r#######r.........TT | ##r................?........r#######r.........TT
 -101 .rrrrrrrrrrrrrrrrrrrrrrrrr???r#####rrrrrrrrrrrrr | .#rrrrrrrrrrrrrrrrrrrrrrrr???#######rrrrrrrrrrrr
 -100 ###############################r.r############## | ###############################r.r##############
  -99 #############.################################## | #############.##################################
  -98 rr##rrrrrrrrrrrrrrrrrrrr?rr##.rrrrrr##rr?r..rrr. | rr##rrrrrrrrrrrrrrrrrrrr.rr##.rrrrrr##rr.r..rrr.
  -97 rr##rrrrrrrrrrrrrrr?rrrrrrr##rrrrrrr##rrrrrrrrrr | rr##rrrrrrrrrrrrrrr.rrrrrrr##rrrrrrr##rrrrrrrrrr
  -96 .r##rrrrrrrrrrrrrrrrrrrrrrr##rrrrrrr##rrrrrrrrrr | .r##rrrrrrrrrrrrrrrrrrrrrrr##rrrrrrr##rrrrrrrrrr
  -95 ####?.#########?####?###################.####### | ####..#########.####.###################.#######
  -94 .##############################rrr############## | .##############################rrr##############
  -93 #rr########################?rr#####rr########### | ##r########################?r#######r###########
  -92 ##r?#######r#####r#########?r#######r?########## | ##r?#######r#####r#########?r#######r?##########
  -91 ##rrrrrrrrrrrrrrrr#########rr##rrr##r#rrrrrrrr#r | ##rrrrrrrrrrrrrrrr#########rr##rrr##r#rrrrrrrr#r
  -90 ##?rrrrrrrrrrrrrrr#########rr##.r..#?#rrrrrrrr#r | ##?rrrrrrrrrrrrrrr#########rr##.r..#?#rrrrrrrr#r
  -89 ##?rrrrrrrrrrrrrrr#########rr##r.r##r#rrrrrrrr#r | ##?rrrrrrrrrrrrrrr#########rr##r.r##r#rrrrrrrr#r```
