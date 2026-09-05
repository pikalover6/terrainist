/**
 * The sandbox an authored program runs in.
 *
 * ## Disposition 5, recorded
 *
 * This is a `node:vm` realm, and `node:vm` is **not an isolation boundary**.
 * A determined program can walk from any host object it is handed back into
 * the host realm and out. That is a knowing pre-launch choice — the threat
 * model today is *bugs, not adversaries*: the programs are written by our own
 * authoring loop, from our own prompts, and never by a third party.
 *
 * **Launch blocker.** Before a program can come from anywhere but our own
 * authoring loop, this file has to grow a real isolate (a separate process, or
 * `isolated-vm`). That is why everything below goes through {@link
 * ProgramExecutor}: the executor is a swappable seam, and swapping it must not
 * touch the fuel meter, the API, the hashes or the gate. If you are reading
 * this because you are adding one: implement the interface, register it with
 * {@link setProgramExecutor}, and the rest of `programs/` will not notice.
 *
 * ## What the realm contains
 *
 * `vm.createContext({})` gives the code its own intrinsics. A bootstrap script
 * then removes the ambient world: no clock, no timers, no IO, no dynamic code,
 * and a `Math.random` that throws with the fix hint in the message. `api` is
 * the only bridge, and `__loam_fuel` the only other injected name.
 *
 * ## The module shape
 *
 * A program is written as ESM (`export const envelope`, `export default
 * function build`), which `vm` cannot evaluate without the experimental module
 * flag. Rather than depend on a flag, the loader rewrites those two — and only
 * those two — export forms textually, which is exactly the pair the static
 * lint requires and forbids anything else.
 */

import vm from "node:vm";

import { FUEL_HOOK } from "./fuel.js";

/** The bridge object handed to a program, plus the fuel hook. */
export interface ExecutionGlobals {
  readonly api: unknown;
  /** Charged once per statement-block entry by the instrumented source. */
  readonly fuel: () => void;
}

/** One execution request. */
export interface ExecutionRequest {
  /** Already instrumented and already export-rewritten. */
  readonly code: string;
  /** Shown in stack traces. */
  readonly filename: string;
  readonly globals: ExecutionGlobals;
}

/** What the executor produces. */
export interface ExecutionResponse {
  /** The program's return value, untrusted and unvalidated. */
  readonly value: unknown;
}

/** The swappable seam. See the launch-blocker note above. */
export interface ProgramExecutor {
  /** Recorded in the compile report, so a world says which sandbox built it. */
  readonly id: string;
  run(request: ExecutionRequest): ExecutionResponse;
}

/** Globals the bootstrap removes from the realm, on top of fresh intrinsics. */
const STRIPPED = [
  "Date",
  "performance",
  "setTimeout",
  "setInterval",
  "setImmediate",
  "clearTimeout",
  "clearInterval",
  "queueMicrotask",
  "eval",
  "Function",
  "WebAssembly",
  "SharedArrayBuffer",
  "Atomics",
  "Proxy",
  "Reflect",
  "process",
  "require",
  "fetch",
];

const BOOTSTRAP = `
"use strict";
${JSON.stringify(STRIPPED)}.forEach(function (name) {
  try { delete globalThis[name]; } catch (e) { /* non-configurable: shadowed below */ }
  try {
    Object.defineProperty(globalThis, name, {
      get: function () { throw new Error(name + " is not available to an authored program"); },
      configurable: true,
    });
  } catch (e) { /* nothing else we can do from in here */ }
});
Math.random = function () {
  throw new Error("Math.random() is not available; use api.random(), which is seeded from the instance seed");
};
Object.freeze(Math);
`;

/**
 * Rewrite the two legal export forms into assignments on the module bag.
 *
 * Deliberately dumb, and safe because the static lint has already rejected
 * every other export form and every `export` inside a string is invisible to
 * a line-anchored match on stripped source.
 *
 * The envelope rewrite **keeps the binding**. Dropping `const envelope` was a
 * silent trap: a program that reads its own envelope back — `const [W, H, D] =
 * envelope;`, which is the obvious thing to write and which real model output
 * does write — died on a ReferenceError that pointed at nothing the author
 * could see. Chaining the two assignments (`const envelope =
 * __loam_module.envelope = […]`) fills the bag *and* leaves the identifier
 * bound, on one line, so stack-trace line numbers still land on the original.
 */
export function rewriteExports(source: string): string {
  return source
    .replace(/^(\s*)export\s+default\s+/gm, "$1__loam_module.default = ")
    .replace(
      /^(\s*)export\s+const\s+envelope\s*=/gm,
      "$1const envelope = __loam_module.envelope =",
    );
}

/** The `node:vm` executor. Default, and the only one until the isolate lands. */
export const nodeVmExecutor: ProgramExecutor = {
  id: "node:vm",
  run(request: ExecutionRequest): ExecutionResponse {
    const context = vm.createContext({});
    vm.runInContext(BOOTSTRAP, context, { filename: "loam:bootstrap" });

    const bag: { default?: unknown; envelope?: unknown } = {};
    Object.defineProperty(context, "__loam_module", { value: bag, enumerable: false });
    Object.defineProperty(context, "api", { value: request.globals.api, enumerable: true });
    Object.defineProperty(context, FUEL_HOOK, { value: request.globals.fuel, enumerable: true });

    vm.runInContext(`"use strict";\n${request.code}\n`, context, {
      filename: request.filename,
      displayErrors: true,
    });

    const build = bag.default;
    if (typeof build !== "function") {
      throw new TypeError("program's default export is not a function");
    }
    return { value: (build as (api: unknown) => unknown)(request.globals.api) };
  },
};

let active: ProgramExecutor = nodeVmExecutor;

/** The executor every program run goes through. */
export function getProgramExecutor(): ProgramExecutor {
  return active;
}

/** Swap the executor — the seam the real isolate lands on. */
export function setProgramExecutor(executor: ProgramExecutor): void {
  active = executor;
}
