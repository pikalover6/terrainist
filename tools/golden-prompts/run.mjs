// The golden-prompt suite — A0 of the STOCKTAKE campaign.
//
// Kit edits cannot be byte-gated. A compiler change proves itself by shasum
// against a clean-checkout build; a kit change cannot, because the thing it
// changes is a model's behaviour and the model is nondeterministic even at
// temperature 0. This runner is the substitute gate: it authors a fixed roster
// of prompts against whatever kit bytes are currently on disk, records what the
// model did, and `score.mjs` diffs two such runs.
//
// It is AUTHORING ONLY. No bespoke programs, no compile rounds, no emit — those
// are three more sources of variance and about three quarters of the bill, and
// none of them is what a kit edit moves first. The intent pre-pass DOES run,
// because production authoring runs it and its output is injected into the
// author call, but it is cached to disk: paying for the same classification on
// every pass would add both cost and variance to a stage no kit edit touches.
//
//   node tools/golden-prompts/run.mjs --label baseline-pre-edit
//   node tools/golden-prompts/run.mjs --label after-units --only troy_horse,fjord_terrain
//   node tools/golden-prompts/run.mjs --dry-run          # zero API calls
//
// A full pass is ~11 authoring calls. Run it at CLUSTER boundaries, never per
// edit.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");

const agents = await import(new URL("../../packages/agents/dist/index.js", import.meta.url).href);
const stdlib = await import(new URL("../../packages/stdlib/dist/index.js", import.meta.url).href);

const {
  AUTHORING_MODEL_ID,
  AUTHORING_REASONING_EFFORT,
  AuthoringFailedError,
  authorLoamDoc,
  classifyPromptIntent,
  kitRelativePath,
  sumUsage,
} = agents;

/* -------------------------------------------------------------------------- */
/* arguments                                                                  */
/* -------------------------------------------------------------------------- */

function parseArgs(argv) {
  const out = {
    label: undefined,
    only: undefined,
    concurrency: 3,
    model: AUTHORING_MODEL_ID,
    effort: AUTHORING_REASONING_EFFORT,
    intent: true,
    refreshIntent: false,
    candidateMenu: false,
    dryRun: false,
    outRoot: path.join(HERE, "runs"),
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${arg} requires a value`);
      return v;
    };
    switch (arg) {
      case "--label": out.label = next(); break;
      case "--only": out.only = next().split(",").map((s) => s.trim()).filter(Boolean); break;
      case "--concurrency": out.concurrency = Math.max(1, Number(next())); break;
      case "--model": out.model = next(); break;
      case "--effort": out.effort = next(); break;
      case "--no-intent": out.intent = false; break;
      case "--refresh-intent": out.refreshIntent = true; break;
      case "--candidate-menu": out.candidateMenu = true; break;
      case "--dry-run": out.dryRun = true; break;
      case "--refresh": out.refresh = true; break;
      case "--out-root": out.outRoot = path.resolve(next()); break;
      case "--help": case "-h": out.help = true; break;
      default: throw new Error(`unexpected argument ${arg}`);
    }
  }
  return out;
}

const USAGE = `
usage: node tools/golden-prompts/run.mjs [flags]

  --label <name>       Run directory name under runs/. Required unless --dry-run.
  --only a,b,c         Run only these prompt ids.
  --concurrency N      Parallel authoring calls (default 3).
  --model <id>         Override the pinned authoring model.
  --effort <level>     Override the pinned reasoning effort.
  --no-intent          Skip the intent pre-pass entirely.
  --refresh-intent     Re-classify instead of reading the intent cache.
  --candidate-menu     Inject the per-run candidate menu (WS-A2) built from the
                       cached intent. The LABEL decides, never the environment:
                       a run's own record says whether a menu went in, so two
                       labels differ by this flag and nothing else.
  --dry-run            Print the plan and the cost estimate; make no API calls.
  --refresh            Re-author prompts this run directory already has, instead
                       of resuming past them.
  --out-root <dir>     Where run directories go (default tools/golden-prompts/runs).

A run RESUMES by default: every prompt's record is written the moment it
finishes, and re-invoking with the same --label authors only what is missing.
A pass is ~20 minutes of wall time and real money; it must never lose a
completed call to an interrupted process.
`;

/* -------------------------------------------------------------------------- */
/* what a document says — the vocabulary census                               */
/* -------------------------------------------------------------------------- */

const ARCHETYPE_IDS = new Set(stdlib.BUILDING_ARCHETYPES);
const FORM_PACK_IDS = new Set(stdlib.formPackIds());

/** Every node in the tree, depth-first, with its depth below the root. */
function* walkNodes(root, depth = 0) {
  if (root === null || typeof root !== "object") return;
  yield { node: root, depth };
  const children = Array.isArray(root.children) ? root.children : [];
  for (const child of children) yield* walkNodes(child, depth + 1);
}

/** Every `intent` object anywhere in the document — world scope and below. */
function collectIntents(doc) {
  const found = [];
  if (doc.intent !== undefined) found.push(doc.intent);
  for (const { node } of walkNodes(doc.root)) {
    if (node.intent !== undefined) found.push(node.intent);
  }
  return found;
}

function addAll(set, values) {
  if (!Array.isArray(values)) return;
  for (const v of values) if (typeof v === "string") set.add(v);
}

/**
 * The census of one authored document.
 *
 * Everything here is a number `score.mjs` can diff, and every field exists
 * because some audit finding or WS-C headline predicted it would move. The
 * archetype set is resolved the way the compiler resolves it — an explicit
 * `params.archetype` and `archetypeOfTags(tags)` are both real spellings — so
 * "reach" means what the world got, not what the model typed.
 */
function censusDocument(doc) {
  const archetypes = new Set();
  const packs = new Set();
  const props = new Set();
  const species = new Set();
  const generators = new Set();
  const envelopes = [];
  const constraintKinds = new Set();

  let nodes = 0;
  let maxDepth = 0;
  let constraints = 0;
  let constraintsWithStrength = 0;
  let hardConstraints = 0;
  let forests = 0;
  let forestFillsAtOrAboveCoverage = 0;
  let forestRadiiBelowTwo = 0;
  let explicitArchetypeParams = 0;
  let programReferences = 0;
  let conformsTrue = 0;
  let labels = 0;

  for (const { node, depth } of walkNodes(doc.root)) {
    nodes++;
    maxDepth = Math.max(maxDepth, depth);
    if (typeof node.label === "string") labels++;

    const gen = typeof node.generator === "string" ? node.generator : undefined;
    if (gen !== undefined) {
      generators.add(gen);
      if (gen.startsWith("authored:")) programReferences++;
    }

    const params = node.params !== null && typeof node.params === "object" ? node.params : {};

    // --- archetype identity, both spellings -------------------------------
    if (typeof params.archetype === "string") {
      explicitArchetypeParams++;
      archetypes.add(params.archetype);
    }
    if (Array.isArray(node.tags)) {
      const resolved = stdlib.archetypeOfTags(node.tags.filter((t) => typeof t === "string"));
      if (typeof resolved === "string") archetypes.add(resolved);
      // A tag that IS an archetype id counts too: the model often writes the
      // canonical name straight into `tags` and the matcher picks it up.
      for (const tag of node.tags) if (ARCHETYPE_IDS.has(tag)) archetypes.add(tag);
    }
    addAll(archetypes, params.mix);
    if (typeof params.prop === "string") props.add(params.prop);

    // --- the forest node, where the units bug lives -----------------------
    if (gen === "scatter.forest@0") {
      forests++;
      const area = params.area !== null && typeof params.area === "object" ? params.area : {};
      const density = typeof params.density === "number" ? params.density : undefined;
      if (area.all === true && density !== undefined && density >= 0.02) {
        forestFillsAtOrAboveCoverage++;
      }
      if (typeof area.radius === "number" && area.radius < 2) forestRadiiBelowTwo++;
      for (const s of Array.isArray(params.species) ? params.species : []) {
        if (typeof s === "string") species.add(s);
        else if (s !== null && typeof s === "object" && typeof s.id === "string") species.add(s.id);
        else if (s !== null && typeof s === "object" && typeof s.shape === "string") species.add(s.shape);
      }
    }

    if (params.conforms === true) conformsTrue++;

    // --- envelopes: the field where the model copies the kit's numbers ----
    const env = node.envelope !== null && typeof node.envelope === "object" ? node.envelope : undefined;
    if (env !== undefined && Array.isArray(env.size)) envelopes.push(env.size.join("x"));

    for (const c of Array.isArray(node.constraints) ? node.constraints : []) {
      if (c === null || typeof c !== "object") continue;
      constraints++;
      if (c.strength !== undefined) constraintsWithStrength++;
      if (c.strength === "hard") hardConstraints++;
      for (const key of Object.keys(c)) {
        if (key !== "strength" && key !== "label" && key !== "note") constraintKinds.add(key);
      }
    }
  }

  for (const intent of collectIntents(doc)) {
    const character = intent.character !== null && typeof intent.character === "object" ? intent.character : {};
    addAll(archetypes, character.archetypes);
    addAll(props, character.props);
    addAll(species, character.flora);
    addAll(packs, character.formPacks);
  }

  const declaredPacks = [...packs].filter((p) => FORM_PACK_IDS.has(p));
  const eras = collectIntents(doc)
    .map((i) => (typeof i.era === "string" ? i.era : undefined))
    .filter((e) => e !== undefined);

  return {
    nodes,
    maxDepth,
    generators: [...generators].sort(),
    archetypes: [...archetypes].sort(),
    archetypesInCatalog: [...archetypes].filter((a) => ARCHETYPE_IDS.has(a)).length,
    formPacks: declaredPacks.sort(),
    props: [...props].sort(),
    species: [...species].sort(),
    envelopes,
    constraints,
    constraintKinds: [...constraintKinds].sort(),
    constraintsWithStrength,
    hardConstraints,
    forests,
    forestFillsAtOrAboveCoverage,
    forestRadiiBelowTwo,
    explicitArchetypeParams,
    programReferences,
    conformsTrue,
    labels,
    eras,
    bytes: JSON.stringify(doc).length,
  };
}

/* -------------------------------------------------------------------------- */
/* the intent cache                                                           */
/* -------------------------------------------------------------------------- */

const INTENT_CACHE = path.join(HERE, "intent-cache.json");

function readIntentCache() {
  try {
    return JSON.parse(fs.readFileSync(INTENT_CACHE, "utf8"));
  } catch {
    return {};
  }
}

function writeIntentCache(cache) {
  fs.writeFileSync(INTENT_CACHE, `${JSON.stringify(cache, null, 2)}\n`);
}

/* -------------------------------------------------------------------------- */
/* one prompt                                                                 */
/* -------------------------------------------------------------------------- */

const ZERO_USAGE = { promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 };

function usageRecord(usage) {
  return {
    promptTokens: usage.promptTokens ?? 0,
    completionTokens: usage.completionTokens ?? 0,
    reasoningTokens: usage.reasoningTokens ?? 0,
    cost: usage.cost ?? 0,
  };
}

async function runOne(entry, options, cache) {
  const started = Date.now();
  const kitName = entry.kit;
  const record = {
    id: entry.id,
    family: entry.family,
    kit: kitName,
    prompt: entry.prompt,
    seed: entry.seed,
    size: entry.size,
    model: options.model,
    effort: options.effort,
    ok: false,
  };

  // --- intent pre-pass, cached -------------------------------------------
  let intent;
  const cacheKey = `${entry.id}::${options.model}`;
  if (options.intent) {
    const cached = cache[cacheKey];
    if (cached !== undefined && !options.refreshIntent) {
      intent = Object.keys(cached.intent ?? {}).length > 0 ? cached.intent : undefined;
      record.intent = { source: "cache", value: cached.intent ?? {} };
      record.intentUsage = { ...usageRecord(ZERO_USAGE), cached: true };
    } else {
      const classified = await classifyPromptIntent({ prompt: entry.prompt, model: options.model });
      if (!classified.failed && Object.keys(classified.intent).length > 0) intent = classified.intent;
      cache[cacheKey] = { prompt: entry.prompt, intent: classified.intent, failed: classified.failed };
      writeIntentCache(cache);
      record.intent = { source: "fresh", value: classified.intent, failed: classified.failed };
      record.intentUsage = usageRecord(classified.usage);
    }
  } else {
    record.intent = { source: "skipped", value: {} };
    record.intentUsage = usageRecord(ZERO_USAGE);
  }

  // --- the candidate menu (WS-A2), off unless --candidate-menu ------------
  // Built from the SAME intent the author call is given, so a run's menu is a
  // function of its cached classification and nothing else. An intent that
  // names no pack and no resolvable era yields no menu at all — which is not a
  // failure to record quietly: it is the difference between "the menu did not
  // help" and "there was never a menu", and only the record can tell them
  // apart after the money is spent.
  let candidateMenu;
  const menu =
    options.candidateMenu && intent !== undefined
      ? stdlib.candidateMenuForIntent(intent)
      : undefined;
  if (menu !== undefined && menu.entries.length > 0) candidateMenu = menu.text;
  record.menu = !options.candidateMenu
    ? { injected: false, reason: "flag off" }
    : intent === undefined
      ? { injected: false, reason: "no intent" }
      : menu.entries.length === 0
        ? { injected: false, reason: "empty menu (no pack, no era)", packs: [], ids: [] }
        : {
            injected: true,
            ids: menu.ids.length,
            estimatedTokens: menu.estimatedTokens,
            packs: menu.packs,
            eraClass: menu.eraClass ?? null,
            menuIds: menu.ids,
          };

  // --- the authoring call -------------------------------------------------
  try {
    const result = await authorLoamDoc({
      prompt: entry.prompt,
      size: entry.size,
      worldSeed: entry.seed,
      model: options.model,
      reasoningEffort: options.effort,
      kitName,
      ...(intent === undefined ? {} : { intent }),
      ...(candidateMenu === undefined ? {} : { candidateMenu }),
    });
    record.ok = true;
    record.attempts = result.attempts;
    record.diagnostics = result.diagnosticsPerAttempt.map((per) =>
      per.map((d) => ({ code: d.code, name: d.name, severity: d.severity, nodePath: d.nodePath })),
    );
    record.usage = usageRecord(result.usage);
    record.resolvedModel = result.model;
    record.census = censusDocument(result.doc);
    record.doc = result.doc;
  } catch (err) {
    if (!(err instanceof AuthoringFailedError)) throw err;
    record.ok = false;
    record.attempts = err.attempts;
    record.diagnostics = err.diagnosticsPerAttempt.map((per) =>
      per.map((d) => ({ code: d.code, name: d.name, severity: d.severity, nodePath: d.nodePath })),
    );
    record.usage = usageRecord(err.usage);
    record.error = err.message;
  }

  record.wallMs = Date.now() - started;
  return record;
}

/* -------------------------------------------------------------------------- */
/* the pool                                                                   */
/* -------------------------------------------------------------------------- */

/** Run `worker` over `items` with at most `limit` in flight, preserving order. */
async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

/* -------------------------------------------------------------------------- */
/* main                                                                       */
/* -------------------------------------------------------------------------- */

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function loadSuite(options) {
  const suite = JSON.parse(fs.readFileSync(path.join(HERE, "prompts.json"), "utf8"));
  const defaults = suite.defaults ?? {};
  let entries = suite.prompts.map((p) => ({
    ...p,
    kit: p.kit ?? defaults.kit ?? "settlement",
    size: p.size ?? defaults.size ?? 512,
  }));
  if (options.only !== undefined) {
    const wanted = new Set(options.only);
    const known = new Set(entries.map((e) => e.id));
    for (const id of wanted) if (!known.has(id)) throw new Error(`--only names an unknown prompt id: ${id}`);
    entries = entries.filter((e) => wanted.has(e.id));
  }
  return { suite, entries };
}

/**
 * Every envelope size printed inside a kit's fenced JSON, as `AxBxC`.
 *
 * WS-C headline 4: 84% of authored building envelopes are triples the kit
 * prints literally, against 11% for the one field the kit has no table for.
 * Recording the kit's own literals with the run is what lets `score.mjs` say
 * whether a kit edit moved that number — and it has to be recorded AT run
 * time, because the kit bytes are what the model saw.
 */
function kitEnvelopeLiterals(markdown) {
  const literals = new Set();
  const fences = markdown.matchAll(/```json\n([\s\S]*?)\n```/g);
  for (const fence of fences) {
    let value;
    try {
      value = JSON.parse(fence[1]);
    } catch {
      continue;
    }
    const stack = [value];
    while (stack.length > 0) {
      const item = stack.pop();
      if (item === null || typeof item !== "object") continue;
      if (Array.isArray(item)) {
        stack.push(...item);
        continue;
      }
      const size = item.envelope?.size ?? (Array.isArray(item.size) ? item.size : undefined);
      if (Array.isArray(size) && size.every((n) => typeof n === "number")) literals.add(size.join("x"));
      stack.push(...Object.values(item));
    }
  }
  return [...literals].sort();
}

/** The sha of the kit bytes this run will send, per kit actually used. */
function kitFingerprints(entries) {
  const out = {};
  for (const kit of new Set(entries.map((e) => e.kit))) {
    const relative = kitRelativePath(kit);
    const bytes = fs.readFileSync(path.join(REPO, relative));
    out[kit] = {
      path: relative,
      sha256: sha256(bytes),
      bytes: bytes.length,
      envelopeLiterals: kitEnvelopeLiterals(bytes.toString("utf8")),
    };
  }
  return out;
}

function renderReport(summary) {
  const lines = [
    `# golden-prompt run — ${summary.label}`,
    "",
    `- model: \`${summary.model}\` at effort \`${summary.effort}\``,
    `- kits: ${Object.entries(summary.kits).map(([k, v]) => `\`${k}\` ${v.sha256.slice(0, 12)} (${v.bytes} B)`).join(", ")}`,
    `- prompts: ${summary.records.length}`,
    `- authored clean: ${summary.totals.ok}/${summary.records.length}`,
    `- attempts: ${summary.totals.attempts} total, ${summary.totals.oneShot} one-shot`,
    `- tokens: ${summary.totals.promptTokens} in, ${summary.totals.completionTokens} out`,
    `- cost: $${summary.totals.cost.toFixed(4)}`,
    "",
    "| prompt | kit | ok | attempts | in | out | $ | nodes | archetypes | packs |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const r of summary.records) {
    const c = r.census;
    lines.push(
      `| ${r.id} | ${r.kit} | ${r.ok ? "yes" : "NO"} | ${r.attempts ?? "-"} | ` +
        `${r.usage?.promptTokens ?? 0} | ${r.usage?.completionTokens ?? 0} | ` +
        `${(r.usage?.cost ?? 0).toFixed(4)} | ${c?.nodes ?? "-"} | ${c?.archetypes.length ?? "-"} | ${c?.formPacks.length ?? "-"} |`,
    );
  }
  const codes = Object.entries(summary.totals.diagnosticCodes).sort((a, b) => b[1] - a[1]);
  if (codes.length > 0) {
    lines.push("", "## diagnostics raised during authoring", "");
    for (const [code, n] of codes) lines.push(`- \`${code}\` × ${n}`);
  }
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE.trim());
    return 0;
  }

  const { entries } = loadSuite(options);
  const kits = kitFingerprints(entries);

  if (options.dryRun) {
    // The estimate is WS-C's measured authoring median ($0.2391/world) times
    // the roster. It is an estimate and says so; the real number lands in the
    // run summary.
    const estimate = entries.length * 0.2391;
    console.log(`golden-prompt suite — DRY RUN, no API calls\n`);
    console.log(`model    ${options.model} at effort ${options.effort}`);
    console.log(`intent   ${options.intent ? "pre-pass on (cached where possible)" : "skipped"}`);
    for (const [kit, fp] of Object.entries(kits)) {
      console.log(`kit      ${kit}: ${fp.path} ${fp.sha256.slice(0, 12)} (${fp.bytes} B)`);
    }
    console.log(`prompts  ${entries.length}\n`);
    const cache = readIntentCache();
    for (const e of entries) {
      const cached = cache[`${e.id}::${options.model}`] !== undefined;
      console.log(
        `  ${e.id.padEnd(22)} ${e.kit.padEnd(11)} seed ${String(e.seed).padEnd(5)} ` +
          `intent ${options.intent ? (cached ? "cached" : "WILL CLASSIFY") : "off"}   ${e.prompt}`,
      );
    }
    console.log(`\nestimated spend  ~$${estimate.toFixed(2)} (WS-C median authoring cost × ${entries.length})`);
    // Measured on the 2026-08-24 baseline: 90 s for a one-shot document, 250–360 s
    // when the validator retry loop runs. An authoring call against a 277 KB kit
    // is slow, and a pass is long enough that it must be run detached.
    console.log(
      `estimated wall   ~${Math.ceil((entries.length / options.concurrency) * 5)} min at concurrency ${options.concurrency} (measured 90–360 s/prompt)`,
    );
    return 0;
  }

  if (options.label === undefined) throw new Error("--label is required (or use --dry-run)");
  const outDir = path.join(options.outRoot, options.label);
  fs.mkdirSync(outDir, { recursive: true });

  const cache = readIntentCache();

  // --- resume -------------------------------------------------------------
  // A pass is ~20 minutes of network wall and real money. The first baseline
  // attempt lost four completed authoring calls to a harness timeout because
  // nothing was written until the end; a record now lands the moment its call
  // returns, and a re-run with the same label authors only what is missing.
  const recordPath = (id) => path.join(outDir, `${id}.record.json`);
  const resumed = [];
  const todo = [];
  for (const entry of entries) {
    if (!options.refresh && fs.existsSync(recordPath(entry.id))) {
      resumed.push(JSON.parse(fs.readFileSync(recordPath(entry.id), "utf8")));
    } else {
      todo.push(entry);
    }
  }

  console.log(
    `golden-prompt suite — ${todo.length} prompt(s) to author at concurrency ${options.concurrency}` +
      `${resumed.length === 0 ? "" : `, ${resumed.length} resumed from ${options.label}`}\n`,
  );

  // A heartbeat, and not only for the human: a long authoring call is the one
  // place a dropped promise would let the event loop drain and take the run
  // with it. While this timer is armed an interrupted run hangs visibly rather
  // than vanishing quietly.
  const heartbeat = setInterval(() => {}, 60_000);
  let authored;
  try {
    authored = await pool(todo, options.concurrency, async (entry) => {
      const record = await runOne(entry, options, cache);
      // Write BEFORE reporting, so what the console claims is on disk.
      if (record.doc !== undefined) {
        fs.writeFileSync(path.join(outDir, `${record.id}.doc.json`), `${JSON.stringify(record.doc, null, 2)}\n`);
        delete record.doc;
      }
      fs.writeFileSync(recordPath(record.id), `${JSON.stringify(record, null, 2)}\n`);
      console.log(
        `  ${record.ok ? "ok  " : "FAIL"} ${record.id.padEnd(22)} ` +
          `${record.attempts ?? "-"} attempt(s)  $${(record.usage?.cost ?? 0).toFixed(4)}  ` +
          `${Math.round(record.wallMs / 1000)}s`,
      );
      return record;
    });
  } finally {
    clearInterval(heartbeat);
  }

  // Back into roster order, so two runs' summaries line up row for row.
  const byId = new Map([...resumed, ...authored].map((r) => [r.id, r]));
  const records = entries.map((e) => byId.get(e.id)).filter((r) => r !== undefined);

  const diagnosticCodes = {};
  for (const r of records) {
    for (const per of r.diagnostics ?? []) {
      for (const d of per) diagnosticCodes[d.code] = (diagnosticCodes[d.code] ?? 0) + 1;
    }
  }

  const usages = records.map((r) => r.usage ?? ZERO_USAGE);
  const intentUsages = records.map((r) => r.intentUsage ?? ZERO_USAGE);
  const totals = {
    ok: records.filter((r) => r.ok).length,
    attempts: records.reduce((n, r) => n + (r.attempts ?? 0), 0),
    oneShot: records.filter((r) => r.attempts === 1).length,
    promptTokens: usages.reduce((n, u) => n + u.promptTokens, 0),
    completionTokens: usages.reduce((n, u) => n + u.completionTokens, 0),
    cost: usages.reduce((n, u) => n + u.cost, 0) + intentUsages.reduce((n, u) => n + u.cost, 0),
    diagnosticCodes,
  };

  const summary = {
    suite: "golden-prompts-v0",
    label: options.label,
    // Deliberately no timestamp: two runs of the same kit bytes should differ
    // only where the model differed, and a clock in the file makes every diff
    // noisy. The run directory's mtime is the record of when it happened.
    model: options.model,
    effort: options.effort,
    intentPrepass: options.intent,
    kits,
    totals,
    records,
  };

  fs.writeFileSync(path.join(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, "report.md"), renderReport(summary));

  console.log(
    `\n${totals.ok}/${records.length} authored clean, ${totals.attempts} attempt(s), ` +
      `$${totals.cost.toFixed(4)}\nwrote ${path.relative(REPO, outDir)}/`,
  );
  return totals.ok === records.length ? 0 : 1;
}

// Importable so the census can be exercised against archived battery documents
// without spending a cent — see `test-census.mjs`.
export { censusDocument, kitEnvelopeLiterals };

const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) process.exitCode = await main();
