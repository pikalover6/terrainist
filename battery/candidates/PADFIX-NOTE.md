# padfix deck (post-a3687e4)

Fresh Gemini rolls of p1/p3/p5/p7 after the platform-disease fix
(a3687e4) and its teaching (8cb9c77), seeds 301/303/305/307 — same
terrain as the *-final deck, new authoring + new compiler.

- p3 trojan_horse_in_troy: ONE-SHOT clean (0 feedback rounds, $0.05).
  First one-shot battery world ever. W521 fired once.
- p5 neopolis_abyssal_siege: clean; the doc requests its sea monsters
  with seat:"wade" + on:@terrain:coastline (the teaching, live). No
  W339 — the program did not author its own sea. W521: one leviathan
  placed 408 blocks off its soft `at`.
- p7 glowing_mushroom_vale: clean, no new warnings.
- p1 pirate_unicorn_war: LOAM-T110 at first — a real compiler bug but
  PRE-EXISTING (baseline emitted the identical voxels): gradeProfile's
  cut floor was world-constant seaLevel+1, so a street deck over the
  sacred lake shaved its y=95 rim. Fixed at source (routeFloorAt,
  b9f808d); world compiled from the preserved doc, no re-roll. See
  p1-padfix/NOTE.md.

All four installed alongside as *_padfix.
