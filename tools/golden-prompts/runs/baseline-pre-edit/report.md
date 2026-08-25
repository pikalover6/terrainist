# golden-prompt run — baseline-pre-edit

- model: `google/gemini-3.7-flash` at effort `high`
- kits: `settlement` 5bac06012ba1 (277109 B), `terrain` 42aa0fa5e330 (37054 B)
- prompts: 11
- authored clean: 11/11
- attempts: 15 total, 7 one-shot
- tokens: 1128340 in, 132241 out
- cost: $0.6382

| prompt | kit | ok | attempts | in | out | $ | nodes | archetypes | packs |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| troy_horse | settlement | yes | 1 | 81991 | 9536 | 0.0486 | 18 | 13 | 1 |
| pirate_unicorn_isles | settlement | yes | 2 | 174057 | 17379 | 0.0979 | 28 | 12 | 2 |
| hellenist_harbour | settlement | yes | 2 | 171944 | 15006 | 0.0650 | 20 | 11 | 1 |
| alien_farm | settlement | yes | 2 | 175761 | 19109 | 0.1017 | 32 | 7 | 2 |
| metropolis_hideout | settlement | yes | 2 | 172822 | 16786 | 0.0686 | 22 | 14 | 1 |
| redwood_camp | settlement | yes | 1 | 81798 | 10518 | 0.0504 | 26 | 6 | 1 |
| glowcap_vale | settlement | yes | 1 | 81789 | 12218 | 0.0536 | 24 | 8 | 1 |
| walled_medieval_city | settlement | yes | 1 | 81757 | 10417 | 0.0502 | 16 | 16 | 0 |
| railway_town | settlement | yes | 1 | 81786 | 10777 | 0.0509 | 25 | 15 | 0 |
| desert_wilderness | terrain | yes | 1 | 12301 | 4359 | 0.0128 | 6 | 0 | 0 |
| fjord_terrain | terrain | yes | 1 | 12334 | 6136 | 0.0161 | 9 | 0 | 0 |

## diagnostics raised during authoring

- `LOAM-T204` × 6
- `LOAM-T118` × 4
- `LOAM-W407` × 3
- `LOAM-T008` × 1
