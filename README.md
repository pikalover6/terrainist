# Terrainist

Text prompt → Minecraft world.

A language model writes a short **Loam 1** document from your prompt — the land,
the climate, the woods, the roads, and every *thing* in the world by name and
place. A deterministic compiler turns that document into a Minecraft Java world
(1.21.11, Anvil region files) you can drop into your saves folder and walk.
Same document, same seed: byte-identical world, no model in the loop.

## Requirements

- Node ≥ 22
- An API key for any OpenAI-compatible chat-completions API (OpenRouter by
  default), used only by `generate` and `ui`. Everything else runs offline.

## Install and build

```sh
git clone https://github.com/pikalover6/terrainist.git
cd terrainist
npm install
npm run build
```

`npx terrainist --help` prints the commands; `npx terrainist <command> --help`
prints that command's options.

## Configure

Three settings, read from the environment or a `.env` file at the repo root:

```
TERRAINIST_API_KEY=...                          # or OPENROUTER_API_KEY
TERRAINIST_API_BASE=https://openrouter.ai/api/v1  # any OpenAI-compatible root
TERRAINIST_MODEL=google/gemini-3.8-flash          # the model id
```

Only the key is required. The request is the plain OpenAI chat-completions
shape (`model`, `messages`, `temperature`, `reasoning_effort`, `max_tokens`),
so OpenRouter, OpenAI, or a local server such as Ollama or vLLM are drop-in
through `TERRAINIST_API_BASE`.

## Run

```sh
# prompt → document → world, in out/
npx terrainist generate "a fishing village of stilt houses on a cold northern fjord"

# …and copy it straight into Minecraft's saves folder
npx terrainist generate "a walled hill town above a river bend" --install

# compile a document you already have (no model call)
npx terrainist compile out/fjord_village.loam.json

# copy a world folder into a saves folder (never replaces a save)
npx terrainist install out/fjord_village_0904 --saves "<path to saves>"

# the local web UI: generate with a live log, list worlds, install
npx terrainist ui
```

`generate` keeps the document beside the world as `<name>.loam.json`; if the
model's first reply was rejected by the validator, every rejected reply is kept
as `<name>.authoring.json`. Options worth knowing: `--seed` (default: derived
from the prompt, so the same words give the same world), `--effort`,
`--temperature`, `--model`, `--size`, `--out`, `--keep-doc` (also keep the
lowered document and the compile report), `--compile-rounds N` (show the model
the compiler's findings and ask for a revision; default 0).

The default saves folder is the platform's `.minecraft/saves`; pass `--saves`
or type a path on the UI page for a launcher with its own instance folders.

## The language

`npx terrainist kit` prints the authoring kit: the reference the model writes
against, and the whole of Loam 1 in one document. In short, a document is

```
{ "loam": "1", "name", "seed", "prompt", "size",
  "palette", "intent",
  "terrain": { sea, base, relief, scale, ridged, curve, ocean, beach, snowline },
  "land":    [ ridge | peak | volcano | plateau | island | valley | river | basin … ],
  "climate", "woods", "roads",
  "things":  [ { "id", "is", "size", "where", … } ] }
```

Every thing says what it **is** — a catalog id (`npx terrainist catalog` lists
them), a fabric (`plaza`, `district`, `city`), a compound (`farm`, `airport`,
`harbour`), or any new name with a `brief`, for which a bespoke program is
written — and **where** it goes, in relations (`zone`, `at`, `near`, `distance`,
`facing`, `on`, `along`, `beside`, `tunnel`) rather than coordinates.

## How it works

| package | role |
| --- | --- |
| `packages/spec` | Loam 1: vocabulary, validator, and the lowering onto the compiler's internal representation (`@terrainist/spec/ir`) |
| `packages/stdlib` | the structure catalog (buildings, props, form packs), noise, terrain edit verbs, classification |
| `packages/compiler` | the deterministic pipeline: terrain fields → settlement layout → ground contract → structures and bespoke programs → vegetation → validation → Anvil emit |
| `packages/agents` | the model calls: intent classifier, document author (validator diagnostics drive retries), program author |
| `packages/cli` | the `terrainist` command and the web UI |
| `kits/` | the authoring kit, generated from `kits/src` and the code's registries (`npm run kit`) |

Tests: `npm test` (the compiler suites build whole worlds; give Node memory:
`NODE_OPTIONS=--max-old-space-size=8192 npx vitest run --maxWorkers=4`).
`packages/compiler/test/loam1-smoke.test.ts` compiles three reference worlds
twice and checks the region files are byte-identical.

## License

MIT.
