/**
 * Intent resolution — inheritance along the node path.
 *
 * Resolution happens **once**, at pipeline pass 2 (inherit L3 styles), and
 * produces a {@link ResolvedIntent} per node path. Every consumer reads the
 * resolved record; nobody re-reads the document. That is the same discipline
 * `ResolvedStyle` keeps, and for the same reason: two consumers that each parse
 * the document are two consumers that will eventually disagree about it.
 *
 * The merge is §2.8's style rule, verbatim:
 *
 * - **scalars replace** — a district's `wealth` overrides the world's;
 * - **objects merge key by key** — a district may set `character.motifs`
 *   without losing the world's `character.materialTheme`;
 * - **arrays replace whole** — `prefer` / `forbid` lists override rather than
 *   accumulate, because accumulating them makes "this island has no oak"
 *   unexpressible under a world that prefers oak.
 *
 * Nothing here imports a subsystem (fan-out law 1), and nothing here decides
 * what a dial *does* — that is the registry's job, next door.
 */

import {
  DEFAULT_ERA_CLASS,
  INTENT_KEY,
  INTENT_NODE_KINDS,
  eraClassOf,
  warning,
  type EraClass,
  type LoamDiagnostic,
  type SemanticIntent,
} from "@terrainist/spec/ir";

/** An intent that declares nothing — the identity of the merge. */
export const EMPTY_INTENT: SemanticIntent = Object.freeze({});

/**
 * What a node path resolved to.
 *
 * `declared` is false when nothing anywhere on the path said anything; the
 * byte-identity law is stated over exactly that case.
 */
export interface ResolvedIntent {
  readonly nodePath: string;
  /** World = 0. */
  readonly depth: number;
  /** The merged dials. */
  readonly intent: SemanticIntent;
  /** `era` dispatched through the closed alias table. */
  readonly eraClass: EraClass;
  /** True when the author declared `era` at all (so `eraClass` is meaningful). */
  readonly eraDeclared: boolean;
  /** True when any scope on this path declared anything. */
  readonly declared: boolean;
}

/** Every node path's resolved intent, plus what resolving it had to say. */
export interface IntentResolution {
  readonly byPath: ReadonlyMap<string, ResolvedIntent>;
  /** World scope: the document's own intent merged over nothing. */
  readonly root: ResolvedIntent;
  readonly diagnostics: readonly LoamDiagnostic[];
}

/** The resolved record for a document that declares no intent at all. */
export function emptyResolvedIntent(nodePath = "", depth = 0): ResolvedIntent {
  return {
    nodePath,
    depth,
    intent: EMPTY_INTENT,
    eraClass: DEFAULT_ERA_CLASS,
    eraDeclared: false,
    declared: false,
  };
}

/** A document shaped enough to resolve intent from. Both profiles satisfy it. */
export interface IntentDocumentLike {
  readonly intent?: SemanticIntent;
  readonly root: {
    readonly id: string;
    readonly kind?: string;
    readonly intent?: SemanticIntent;
    readonly children?: readonly unknown[];
  };
}

/**
 * Resolve every node path's intent.
 *
 * Total by construction: a document with no `intent` anywhere yields a map
 * whose every entry is {@link emptyResolvedIntent}, and every fan-out row must
 * answer such a record with today's value.
 */
export function resolveIntents(doc: IntentDocumentLike): IntentResolution {
  const diagnostics: LoamDiagnostic[] = [];
  const byPath = new Map<string, ResolvedIntent>();

  const world = merge(EMPTY_INTENT, doc.intent);
  const rootNode = doc.root;
  const rootIntent = merge(world, rootNode.intent);
  const declaredAtRoot = doc.intent !== undefined || rootNode.intent !== undefined;
  const root = finish(rootNode.id, 0, rootIntent, declaredAtRoot, diagnostics);
  byPath.set(rootNode.id, root);
  // The document-level record is reachable under the empty path too, so a
  // caller that has no node in hand (the emitter, the report) can still ask.
  byPath.set("", { ...root, nodePath: "" });

  walk(rootNode.children ?? [], rootNode.id, 1, rootIntent, declaredAtRoot, byPath, diagnostics);

  return { byPath, root, diagnostics };
}

function walk(
  children: readonly unknown[],
  parentPath: string,
  depth: number,
  parent: SemanticIntent,
  parentDeclared: boolean,
  byPath: Map<string, ResolvedIntent>,
  diagnostics: LoamDiagnostic[],
): void {
  for (const [index, raw] of children.entries()) {
    if (typeof raw !== "object" || raw === null) continue;
    const node = raw as {
      id?: unknown;
      kind?: unknown;
      children?: unknown;
      [INTENT_KEY]?: unknown;
    };
    const id = typeof node.id === "string" ? node.id : `children[${index}]`;
    const path = `${parentPath}.${id}`;

    const carries =
      typeof node.kind === "string" && (INTENT_NODE_KINDS as readonly string[]).includes(node.kind);
    const own = carries ? (node[INTENT_KEY] as SemanticIntent | undefined) : undefined;
    const merged = merge(parent, own);
    const declared = parentDeclared || own !== undefined;
    byPath.set(path, finish(path, depth, merged, declared, diagnostics));

    if (Array.isArray(node.children)) {
      walk(node.children, path, depth + 1, merged, declared, byPath, diagnostics);
    }
  }
}

function finish(
  nodePath: string,
  depth: number,
  intent: SemanticIntent,
  declared: boolean,
  diagnostics: LoamDiagnostic[],
): ResolvedIntent {
  const era = intent.era;
  const dispatched = eraClassOf(era);
  if (era !== undefined && dispatched === undefined) {
    diagnostics.push(
      warning(
        "INTENT_ERA_UNKNOWN",
        nodePath,
        `era "${era}" is not in the dispatch table; the fan-out uses "${DEFAULT_ERA_CLASS}"`,
        `keep the word if it is what the world is about — it still reaches prompts — or use one that dispatches, e.g. "medieval", "industrial", "far_future"`,
      ),
    );
  }
  return {
    nodePath,
    depth,
    intent,
    eraClass: dispatched ?? DEFAULT_ERA_CLASS,
    eraDeclared: era !== undefined,
    declared,
  };
}

/**
 * Look up the nearest enclosing scope's resolved intent.
 *
 * Node paths are dotted, so "nearest enclosing" is a walk up the dots — the
 * layout solver invents synthetic paths under a district (one per infilled
 * building) and those must inherit the district's character without the
 * resolver having to know they exist.
 */
export function intentFor(resolution: IntentResolution, nodePath: string): ResolvedIntent {
  let path = nodePath;
  for (;;) {
    const hit = resolution.byPath.get(path);
    if (hit !== undefined) return hit;
    const cut = path.lastIndexOf(".");
    if (cut === -1) break;
    path = path.slice(0, cut);
  }
  return resolution.root;
}

/**
 * Merge a child intent over a parent, per §2.8.
 *
 * Exported because the fan-out's tests state the rule directly, and because a
 * caller that has two intents and no tree (the authoring pre-pass, merging a
 * CLI override over a classified one) needs exactly this and nothing else.
 */
export function merge(parent: SemanticIntent, child: SemanticIntent | undefined): SemanticIntent {
  if (child === undefined) return parent;
  return mergeObjects(parent as Record<string, unknown>, child as Record<string, unknown>) as SemanticIntent;
}

function mergeObjects(
  parent: Record<string, unknown>,
  child: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...parent };
  for (const [key, value] of Object.entries(child)) {
    if (value === undefined) continue;
    const prior = out[key];
    if (isPlainObject(prior) && isPlainObject(value)) {
      out[key] = mergeObjects(prior, value);
    } else {
      // Scalars replace; arrays replace **whole** — see the header.
      out[key] = value;
    }
  }
  return out;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A one-line-per-scope summary for the compile report.
 *
 * Only the scopes that declared something: on a document with no intent this is
 * an empty array, which is the report saying exactly what the compiler did.
 * Deliberately strings and not diagnostics — a code that fires on every world
 * with an intent would land in the authoring loop's feedback set, which is the
 * mistake `LIFE_PASS_EMPTY` exists to record.
 */
export function intentReportLines(resolution: IntentResolution): readonly string[] {
  return [...resolution.byPath.values()]
    .filter((r) => r.declared && r.nodePath !== "")
    .map((r) => {
      const label = r.intent.character?.label;
      const dials = [
        r.intent.era === undefined ? undefined : `era=${r.intent.era}→${r.eraClass}`,
        r.intent.wealth === undefined ? undefined : `wealth=${r.intent.wealth}`,
        r.intent.decline === undefined ? undefined : `decline=${r.intent.decline}`,
        r.intent.formality === undefined ? undefined : `formality=${r.intent.formality}`,
      ].filter((d): d is string => d !== undefined);
      return `${r.nodePath}${label === undefined ? "" : ` "${label}"`}${dials.length === 0 ? "" : ` [${dials.join(", ")}]`}`;
    });
}
