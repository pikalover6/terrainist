// Full-pipeline sibling of run.mjs: every golden prompt through `terrainist generate`
// (intent, authoring, programs, compile-feedback rounds, emit) at the current kit
// bytes, each to its own folder + log. Pair with record-generate-run.mjs.
//   node tools/golden-prompts/generate-all.mjs <outDir> [concurrency=3] [only=id,id]
//   ... [promptsFile]   a roster other than prompts.json (the Stocktake Run's probes.json)
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = process.argv[2];
const CONC = Number(process.argv[3] ?? 3);
const only = process.argv[4] ? process.argv[4].split(",") : null;
const promptsFile = process.argv[5] ? path.resolve(process.argv[5]) : path.join(ROOT, "tools/golden-prompts/prompts.json");
const suite = JSON.parse(fs.readFileSync(promptsFile, "utf8"));
const queue = suite.prompts.filter((p) => !only || only.includes(p.id));
const status = path.join(OUT, "status.txt");
fs.mkdirSync(OUT, { recursive: true });
let running = 0;

function next() {
  while (running < CONC && queue.length) {
    const p = queue.shift();
    running++;
    const dir = path.join(OUT, p.id);
    fs.mkdirSync(dir, { recursive: true });
    const log = fs.openSync(path.join(dir, "generate.log"), "w");
    const t0 = Date.now();
    const args = [
      path.join(ROOT, "packages/cli/dist/index.js"), "generate", p.prompt,
      "--seed", String(p.seed), "--kit", p.kit ?? "settlement",
      "--out", path.join(dir, "out"), "--keep-doc", "--no-zip",
    ];
    fs.appendFileSync(status, `${p.id} START ${new Date().toISOString()}\n`);
    const ch = spawn("node", args, {
      cwd: ROOT, stdio: ["ignore", log, log],
      env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=8192" },
    });
    ch.on("exit", (code) => {
      fs.closeSync(log);
      fs.appendFileSync(status, `${p.id} exit=${code} secs=${Math.round((Date.now() - t0) / 1000)}\n`);
      running--;
      next();
      if (!running && !queue.length) fs.appendFileSync(status, "ALL DONE\n");
    });
  }
}
next();
