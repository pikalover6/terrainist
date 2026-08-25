# golden-prompt run — c3-after-1

- model: `google/gemini-3.7-flash` at effort `high`
- kits: `settlement` 14733e413779 (280180 B), `terrain` f98c5e85242b (40901 B)
- prompts: 3
- authored clean: 3/3
- attempts: 4 total, 2 one-shot
- tokens: 269655 in, 26014 out
- cost: $0.1499

| prompt | kit | ok | attempts | in | out | $ | nodes | archetypes | packs |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| troy_horse | settlement | yes | 2 | 173545 | 13397 | 0.0902 | 17 | 12 | 1 |
| walled_medieval_city | settlement | yes | 1 | 82692 | 6445 | 0.0431 | 16 | 12 | 0 |
| fjord_terrain | terrain | yes | 1 | 13418 | 6172 | 0.0166 | 11 | 0 | 0 |

## diagnostics raised during authoring

- `LOAM-W407` × 2
- `LOAM-T204` × 1
- `LOAM-T206` × 1
