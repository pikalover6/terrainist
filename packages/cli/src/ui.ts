/**
 * `terrainist ui` — the local web UI.
 *
 * One Node HTTP server, one HTML page (`../ui/index.html`), no framework and
 * no build step. It does three things, each through the same code the command
 * line uses:
 *
 * - **generate**: runs `terrainist generate` as a child process and streams
 *   its log to the page over server-sent events. One job at a time. A failed
 *   generation is shown, never retried.
 * - **list**: every world folder under `--out`, with the Loam 1 document that
 *   made it (name, date, prompt) and where this server installed it.
 * - **install**: the same `installWorld` as `terrainist install`, into the
 *   saves folder typed on the page (the platform default, or `--saves`, is
 *   offered first); never replaces an existing save.
 */

import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defaultModel, findRepoRoot } from "@terrainist/agents";

import { parseArgs } from "./args.js";
import { defaultSavesDir, installWorld } from "./install.js";

/** Default port. */
export const DEFAULT_UI_PORT = 4747;

interface Job {
  readonly id: string;
  readonly prompt: string;
  readonly seed: string | undefined;
  readonly effort: string | undefined;
  readonly model: string | undefined;
  readonly startedAt: number;
  status: "running" | "done" | "failed";
  code: number | null;
  readonly lines: string[];
  readonly listeners: Set<ServerResponse>;
  /** The world folder, once the log names it. */
  worldDir: string | undefined;
}

interface UiOptions {
  readonly port: number;
  readonly outDir: string;
  /** The saves folder the page offers first. */
  readonly savesDir: string;
}

export function parseUiArgs(args: readonly string[]): UiOptions {
  const { flags } = parseArgs(args, {
    flags: {
      "--port": {
        type: "value",
        missingMessage: "--port requires a number",
        validate: (v) => {
          const n = Number(v);
          if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error("--port must be an integer in 1..65535");
        },
      },
      "--out": { type: "value", aliases: ["-o"], missingMessage: "--out requires a directory" },
      "--saves": { type: "value", missingMessage: "--saves requires a directory" },
    },
    positionals: { max: 0 },
    unknown: "unknown option",
    allowDoubleDash: true,
  });
  return {
    port: typeof flags["--port"] === "string" ? Number(flags["--port"]) : DEFAULT_UI_PORT,
    outDir: path.resolve(typeof flags["--out"] === "string" ? (flags["--out"] as string) : "out"),
    savesDir: typeof flags["--saves"] === "string" ? path.resolve(flags["--saves"] as string) : defaultSavesDir(),
  };
}

export async function runUi(args: readonly string[]): Promise<number> {
  const options = parseUiArgs(args);
  const server = createUiServer(options);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, "127.0.0.1", () => resolve());
  });
  console.log(`terrainist ui at http://localhost:${options.port}/  (worlds in ${options.outDir}; Ctrl-C to stop)`);
  await new Promise<void>((resolve) => {
    const stop = (): void => {
      server.close();
      resolve();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
  return 0;
}

/** The server, separated from `runUi` so a test can bind it to port 0. */
export function createUiServer(options: UiOptions): ReturnType<typeof createServer> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const pagePath = path.join(here, "..", "ui", "index.html");
  const cliEntry = path.join(here, "index.js");
  const repoRoot = findRepoRoot();
  const jobs = new Map<string, Job>();
  const installed = new Map<string, string>();

  const json = (res: ServerResponse, status: number, body: unknown): void => {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-cache" });
    res.end(JSON.stringify(body));
  };
  const text = (res: ServerResponse, status: number, body: string): void => {
    res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" });
    res.end(body);
  };
  const readBody = async (req: IncomingMessage): Promise<Record<string, unknown>> => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks).toString("utf8");
    if (raw.trim() === "") return {};
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  };
  /** A world folder name from the client: one path segment, existing, with a level.dat. */
  const worldDirOf = (name: unknown): string | undefined => {
    if (typeof name !== "string" || name === "" || name !== path.basename(name) || name.startsWith(".")) return undefined;
    const dir = path.join(options.outDir, name);
    return existsSync(path.join(dir, "level.dat")) ? dir : undefined;
  };

  // --- generate ------------------------------------------------------------

  const startJob = (prompt: string, seed: string | undefined, effort: string | undefined, model: string | undefined): Job => {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const job: Job = {
      id,
      prompt,
      seed,
      effort,
      model,
      startedAt: Date.now(),
      status: "running",
      code: null,
      lines: [],
      listeners: new Set(),
      worldDir: undefined,
    };
    jobs.set(id, job);
    const argv = [cliEntry, "generate", prompt, "--out", options.outDir, "--no-zip"];
    if (seed !== undefined) argv.push("--seed", seed);
    if (effort !== undefined) argv.push("--effort", effort);
    if (model !== undefined) argv.push("--model", model);
    const child = spawn(process.execPath, argv, {
      cwd: repoRoot,
      env: { ...process.env, NODE_OPTIONS: process.env["NODE_OPTIONS"] ?? "--max-old-space-size=8192" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const push = (line: string): void => {
      job.lines.push(line);
      const m = /^\s{2}world\s+(\S.*)$/.exec(line);
      if (m !== null) job.worldDir = m[1] as string;
      const frame = `data: ${JSON.stringify(line)}\n\n`;
      for (const l of job.listeners) l.write(frame);
    };
    const pipe = (stream: NodeJS.ReadableStream): void => {
      let rest = "";
      stream.setEncoding("utf8");
      stream.on("data", (chunk: string) => {
        rest += chunk;
        const parts = rest.split("\n");
        rest = parts.pop() ?? "";
        for (const p of parts) push(p);
      });
      stream.on("end", () => {
        if (rest !== "") push(rest);
      });
    };
    pipe(child.stdout);
    pipe(child.stderr);
    child.on("error", (err) => {
      push(`terrainist ui: could not start generate: ${err.message}`);
    });
    child.on("close", (code) => {
      job.code = code;
      job.status = code === 0 ? "done" : "failed";
      const frame = `event: done\ndata: ${JSON.stringify({ code, status: job.status })}\n\n`;
      for (const l of job.listeners) {
        l.write(frame);
        l.end();
      }
      job.listeners.clear();
    });
    return job;
  };
  const jobSummary = (job: Job): Record<string, unknown> => ({
    id: job.id,
    prompt: job.prompt,
    seed: job.seed,
    effort: job.effort,
    model: job.model,
    startedAt: job.startedAt,
    status: job.status,
    code: job.code,
    world: job.worldDir === undefined ? undefined : path.basename(job.worldDir),
  });

  // --- worlds --------------------------------------------------------------

  const listWorlds = async (): Promise<Record<string, unknown>[]> => {
    let names: string[];
    try {
      names = await readdir(options.outDir);
    } catch {
      return [];
    }
    const out: Record<string, unknown>[] = [];
    for (const name of names.sort()) {
      const dir = path.join(options.outDir, name);
      if (!existsSync(path.join(dir, "level.dat"))) continue;
      const st = await stat(dir);
      const base = name.replace(/_\d{4}(-\d+)?$/, "");
      const docPath = path.join(options.outDir, `${base}.loam.json`);
      let prompt: string | undefined;
      let seed: unknown;
      if (existsSync(docPath)) {
        try {
          const doc = JSON.parse(await readFile(docPath, "utf8")) as Record<string, unknown>;
          if (typeof doc["prompt"] === "string") prompt = doc["prompt"];
          seed = doc["seed"];
        } catch {
          // an unreadable document is still a world
        }
      }
      out.push({
        name,
        dir,
        doc: existsSync(docPath) ? docPath : undefined,
        prompt,
        seed,
        date: st.mtimeMs,
        installed: installed.get(name),
      });
    }
    return out.sort((a, b) => (b["date"] as number) - (a["date"] as number));
  };

  // --- routes --------------------------------------------------------------

  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const p = decodeURIComponent(url.pathname);
      const method = req.method ?? "GET";

      if (p === "/" || p === "/index.html") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
        res.end(await readFile(pagePath));
        return;
      }

      if (p === "/api/worlds" && method === "GET") {
        return json(res, 200, { outDir: options.outDir, savesDir: options.savesDir, model: defaultModel(), worlds: await listWorlds() });
      }

      if (p === "/api/jobs" && method === "GET") {
        return json(res, 200, { jobs: [...jobs.values()].map(jobSummary).sort((a, b) => (b["startedAt"] as number) - (a["startedAt"] as number)) });
      }

      if (p === "/api/generate" && method === "POST") {
        const body = await readBody(req);
        const prompt = typeof body["prompt"] === "string" ? body["prompt"].trim() : "";
        if (prompt === "") return json(res, 400, { error: "a prompt is required" });
        const seed = typeof body["seed"] === "string" && body["seed"].trim() !== "" ? body["seed"].trim() : undefined;
        if (seed !== undefined && !/^-?\d+$/.test(seed)) return json(res, 400, { error: "the seed must be a decimal integer" });
        const effort = typeof body["effort"] === "string" && body["effort"] !== "" ? body["effort"] : undefined;
        if (effort !== undefined && !/^[\w-]+$/.test(effort)) return json(res, 400, { error: "effort must be one word, e.g. low, medium or high" });
        const model = typeof body["model"] === "string" && body["model"].trim() !== "" ? body["model"].trim() : undefined;
        if (model !== undefined && !/^[\w./:@-]+$/.test(model)) return json(res, 400, { error: "the model id has characters a model id cannot have" });
        if ([...jobs.values()].some((j) => j.status === "running")) return json(res, 409, { error: "a generation is already running; wait for it to finish" });
        const job = startJob(prompt, seed, effort, model);
        return json(res, 202, jobSummary(job));
      }

      const events = /^\/api\/jobs\/([^/]+)\/events$/.exec(p);
      if (events !== null && method === "GET") {
        const job = jobs.get(events[1] as string);
        if (job === undefined) return json(res, 404, { error: "no such job" });
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        for (const line of job.lines) res.write(`data: ${JSON.stringify(line)}\n\n`);
        if (job.status !== "running") {
          res.write(`event: done\ndata: ${JSON.stringify({ code: job.code, status: job.status })}\n\n`);
          res.end();
          return;
        }
        job.listeners.add(res);
        req.on("close", () => job.listeners.delete(res));
        return;
      }

      if (p === "/api/install" && method === "POST") {
        const body = await readBody(req);
        const dir = worldDirOf(body["world"]);
        if (dir === undefined) return json(res, 404, { error: "no such world" });
        const typed = typeof body["savesDir"] === "string" ? body["savesDir"].trim() : "";
        const savesDir = typed === "" ? options.savesDir : path.resolve(typed.replace(/^~(?=$|\/)/, process.env["HOME"] ?? "~"));
        const result = await installWorld({ worldDir: dir, savesDir });
        installed.set(path.basename(dir), result.installedPath);
        return json(res, 200, { world: path.basename(dir), installedPath: result.installedPath, folderName: result.folderName, renamed: result.renamed });
      }

      return text(res, 404, "not found");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!res.headersSent) json(res, 500, { error: message });
      else res.end();
    }
  });
}
