# cc-effort-probe

Offline, zero-API-cost probe: does a given Claude Code binary honour
subagent reasoning-effort control? Adapted from the offline verifier in
https://github.com/pikalover6/claude-subagents-effort (ccpatch/verify.py).

Ground truth is `output_config.effort` on the captured request body — a
local endpoint answers every POST with canned SSE, so **nothing is ever
sent to api.anthropic.com and no tokens are spent**. Each scenario runs in
a throwaway HOME/CLAUDE_CONFIG_DIR; the real `~/.claude` is untouched.
The child request is identified by a fingerprint planted in the agent's
system prompt, not by request position; side-calls (session titling, no
tools) are filtered out.

## Usage

```sh
CC_BINARY=/path/to/claude python3 probe.py        # scenarios 1+2 (the decisive pair)
CC_BINARY=/path/to/claude python3 probe.py all    # all 5 (5 needs a patched binary)
```

Scenarios:
1. frontmatter `effort: low` on a custom agent → child should send `low`
2. control, no effort anywhere → child inherits session effort
3. stock + Agent-tool `effort:"low"` param → stock ignores it (expected `high`)
4. frontmatter `effort: 500` (integer trap) → sends NO output_config at all
5. patched binary + tool param → `low` (harness validity check)

## Measured findings (stock 2.1.220, 2026-07-29)

`[parent, child, parent]` efforts on the wire, parent at `--effort high`:

| scenario | result |
|---|---|
| 1 frontmatter low | `['high', 'low', 'high']` ✅ frontmatter works |
| 2 control | `['high', 'high', 'high']` |
| 3 tool param on stock | `['high', 'high', 'high']` (ignored) |
| 4 integer frontmatter | `['high', None, 'high']` (silently dropped) |
| 5 tool param on patched | `['high', 'low', 'high']` |

Conclusions: stock CC supports per-agent effort via `.claude/agents/*.md`
frontmatter (named levels only — integers are silently dropped; the loader
caches at session start, so mid-session edits are no-ops). The
claude-subagents-effort patch is needed only for *per-invocation* effort on
the Agent tool. `claude -p --effort <level>` also works on stock for
headless workers.

Re-run this after Claude Code updates before trusting effort-sensitive
workflows on a new version.

## Live mode (added 2026-07-29) — SPENDS REAL TOKENS

```sh
CC_BINARY=/path/to/claude python3 probe.py live [/path/to/.claude/agents]
```

Everything above is free. `live` turns the local endpoint into a
pass-through proxy to `api.anthropic.com`, copies a **real** agents
directory (defaults to this repo's `.claude/agents`) into the sandbox, and
really runs the subagents — so it measures whether effort changes *model
behaviour*, not just the request field. It spawns `sonnet-5-low` and
`sonnet-5-xhigh` on one identical search-heavy puzzle and prints
`output_config.effort` plus `usage` per request. Budget ~4 requests.

Headers are forwarded verbatim and never read, stored or printed (only
`Accept-Encoding` is forced to `identity` so the SSE usage integers are
readable). Auth: a throwaway `CLAUDE_CONFIG_DIR` isolates
history/sessions, while `CLAUDE_SECURESTORAGE_CONFIG_DIR=""` keeps the
keychain service name unsuffixed so the sandbox reuses the real
credential, and `_CLAUDE_CODE_ASSUME_FIRST_PARTY_BASE_URL=1` stops CC
treating the loopback proxy as a third-party endpoint.

### Measured live (stock 2.1.220, `claude-sonnet-5`, 2026-07-29)

| role | model on wire | effort | output tokens | answer |
|---|---|---|---|---|
| parent | `claude-sonnet-5` | `high` | — | — |
| `sonnet-5-low` | `claude-sonnet-5` | `low` | **3** | 13 ✗ |
| `sonnet-5-xhigh` | `claude-sonnet-5` | `xhigh` | **3994** | 12 ✓ |

Same parent turn, same prompt, near-identical input (`cache_read` 11692 vs
11695) — a ~1330× output-token gap and a correctness flip. Effort from
frontmatter is real, not cosmetic.

Also confirmed live: `opus-5-low`/`opus-5-max` → `claude-opus-5` at
`low`/`max`, `sonnet-5-max` → `claude-sonnet-5` at `max` (no clamping);
parent stayed `high` throughout.

## Gotcha that bit us: frontmatter `name:` is mandatory

CC 2.1.220 registers an agent type **only** from the frontmatter `name:`
field. The filename is *not* a fallback, and a definition without `name:`
is silently ignored — it never appears in the Agent tool's type list, and
`subagent_type` referencing it fails. Verified three ways:

| agent file | frontmatter | result |
|---|---|---|
| `sonnet-5-low.md` | no `name:` | **not registered** (parent sees only built-ins) |
| `sonnet-5-low.md` | `name: sonnet-5-low` | registered, child at `low` |
| `sonnet-5-low.md` | `name: renamed-type` | registered as **`renamed-type`** |

`live_sandbox()` injects the missing `name:` into its sandbox copy so the
probe still works against defs that lack it; production defs must carry it
for real.
