# golden-prompt run — probe-1

- model: `google/gemini-3.7-flash` at effort `high`
- kits: `settlement` c22cb4fe309b (284406 B), `terrain` 0adfac8d7704 (41193 B)
- prompts: 6
- authored clean: 6/6
- attempts: 7 total, 5 one-shot
- tokens: 525781 in, 73196 out
- cost: $0.3618

| prompt | kit | ok | attempts | in | out | $ | nodes | archetypes | packs |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| probe_monastery | settlement | yes | 1 | 84019 | 11916 | 0.0538 | 23 | 11 | 1 |
| probe_two_villages | settlement | yes | 1 | 83835 | 15199 | 0.0599 | 33 | 11 | 1 |
| probe_bronze_tundra | settlement | yes | 1 | 83908 | 11069 | 0.0522 | 25 | 10 | 1 |
| probe_caldera | terrain | yes | 1 | 13552 | 7512 | 0.0192 | 9 | 0 | 0 |
| probe_temple_bell | settlement | yes | 2 | 176615 | 17153 | 0.0984 | 23 | 9 | 1 |
| probe_sky_whale | settlement | yes | 1 | 83852 | 10347 | 0.0508 | 19 | 12 | 1 |

## diagnostics raised during authoring

- `LOAM-W519` × 1
- `LOAM-T210` × 1
