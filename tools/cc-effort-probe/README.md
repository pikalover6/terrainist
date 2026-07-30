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
