/**
 * Minimal project-local argument reader.
 *
 * Covers values, booleans, unknown flags, `--flag=value`, `--`, missing
 * values, and negative numeric values. No third-party framework.
 *
 * One mechanism for every retained command — manual `for`-loops elsewhere are
 * removed. The reader preserves exact error wording per command; callers keep
 * any value validation that produces their own messages.
 */

type FlagSpec = {
  type: "boolean" | "value";
  /** aliases like "-o" for "--out" */
  aliases?: readonly string[];
  /** message when a value flag has no following token */
  missingMessage?: string;
  /** repeat strategy: last wins (default) or accumulate */
  repeat?: "last" | "accumulate";
  /** validate the raw string value immediately; throw to preserve input-order errors */
  validate?: (value: string) => void;
};

export type ArgSpec = {
  flags: Record<string, FlagSpec>;
  /** positional allowance; absence means validate elsewhere */
  positionals?: {
    max?: number;
  };
  /** how to report an unrecognised flag */
  unknown?: "unknown option" | "unexpected argument";
  /** if true, a bare "-x" not in flags is a positional (generate's prompt) */
  singleDashAsPositional?: boolean;
  /** if true, a bare "--" ends option parsing */
  allowDoubleDash?: boolean;
};

export type ParsedArgs = {
  /** flags keyed by canonical flag (e.g. "--out") */
  flags: Record<string, string | boolean | string[]>;
  positionals: string[];
};

export function parseArgs(args: readonly string[], spec: ArgSpec): ParsedArgs {
  const flagMap: Record<string, { canonical: string; cfg: FlagSpec }> = {};
  for (const [canonical, cfg] of Object.entries(spec.flags)) {
    flagMap[canonical] = { canonical, cfg };
    if (cfg.aliases) for (const a of cfg.aliases) flagMap[a] = { canonical, cfg };
  }

  const flags: Record<string, string | boolean | string[]> = {};
  const positionals: string[] = [];

  let i = 0;
  let stop = false;
  while (i < args.length) {
    const token = args[i] as string;

    if (!stop && spec.allowDoubleDash && token === "--") {
      stop = true;
      i++;
      continue;
    }

    if (!stop && token.startsWith("-")) {
      const eq = token.indexOf("=");
      let flagPart = token;
      let valueFromEq: string | undefined;
      if (eq !== -1) {
        flagPart = token.slice(0, eq);
        valueFromEq = token.slice(eq + 1);
      }

      const entry = flagMap[flagPart];
      if (entry) {
        const { canonical, cfg } = entry;
        if (cfg.type === "boolean") {
          if (valueFromEq !== undefined) {
            const mode = spec.unknown ?? "unknown option";
            if (mode === "unexpected argument") throw new Error(`unexpected argument ${String(token)}`);
            else throw new Error(`unknown option ${token}`);
          }
          flags[canonical] = true;
          i++;
          continue;
        } else {
          let value: string | undefined = valueFromEq;
          if (value === undefined) {
            const next = args[i + 1] as string | undefined;
            if (next === undefined || (spec.allowDoubleDash && next === "--")) {
              if (cfg.missingMessage !== undefined) throw new Error(cfg.missingMessage);
              throw new Error(`${String(flagPart)} requires a value`);
            }
            value = next;
            i += 2;
          } else {
            i++;
          }
          if (cfg.validate) cfg.validate(value);
          if (cfg.repeat === "accumulate") {
            const arr = (flags[canonical] as string[] | undefined) ?? [];
            arr.push(value);
            flags[canonical] = arr;
          } else {
            flags[canonical] = value;
          }
          continue;
        }
      } else {
        if (spec.singleDashAsPositional && !token.startsWith("--")) {
          if (spec.positionals?.max === 0) throw new Error(`unexpected argument ${String(token)}`);
          if (spec.positionals?.max !== undefined && positionals.length >= spec.positionals.max) {
            throw new Error(`unexpected argument ${String(token)}`);
          }
          positionals.push(token);
          i++;
          continue;
        }
        const mode = spec.unknown ?? "unknown option";
        if (mode === "unexpected argument") throw new Error(`unexpected argument ${String(token)}`);
        else throw new Error(`unknown option ${token}`);
      }
    } else {
      if (spec.positionals?.max === 0) throw new Error(`unexpected argument ${String(token)}`);
      if (spec.positionals?.max !== undefined && positionals.length >= spec.positionals.max) {
        throw new Error(`unexpected argument ${String(token)}`);
      }
      positionals.push(token);
      i++;
    }
  }

  if (spec.positionals?.max !== undefined && positionals.length > spec.positionals.max) {
    const excess = positionals[spec.positionals.max] as string;
    throw new Error(`unexpected argument ${String(excess)}`);
  }

  return { flags, positionals };
}
