/**
 * Terrainist CLI.
 *
 * Placeholder scaffold: real commands (compile a Loam file to a world .zip,
 * render a world) land alongside the G1 spike.
 */

import type { CompileResult } from "@terrainist/compiler";
import type { RenderView } from "@terrainist/render";

/** Parsed CLI invocation. Placeholder shape. */
export interface CliInvocation {
  command: string;
  args: readonly string[];
}

export type { CompileResult, RenderView };
