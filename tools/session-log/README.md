# tools/session-log

Renders the **project-memory page**: four committed memory cells (coarse →
fine) followed by the live Claude Code session log, as one self-contained
HTML file.

The page is **generated, never hand-maintained**. Memory lives in files
(`.claude/memory/cell-1.md … cell-4.md`); this tool is only the renderer.

Plain ESM, zero npm dependencies, Node 18+.

## Usage

```
node tools/session-log/render.mjs --out <html> \
    [--transcript <path>]... [--since <ISO|24h|3d>] [--cells <dir>]
```

| flag | default | meaning |
|---|---|---|
| `--out` | *(required)* | output HTML path; parent dirs are created |
| `--cells` | `.claude/memory` | directory holding `cell-1.md` … `cell-4.md` |
| `--transcript` | newest `.jsonl` in the project's transcript dir | repeatable; entries from all files are merged and sorted |
| `--since` | `36h` | duration (`90m`, `36h`, `2d`, `1w`) or anything `Date.parse` accepts |

Transcript dir: `~/.claude/projects/-Users-kaihoward-Dev-terrainist/`.

Examples:

```
# the standing render
node tools/session-log/render.mjs --out /tmp/memory.html

# a 48-hour window, explicit transcript
node tools/session-log/render.mjs --out /tmp/memory.html --since 48h \
    --transcript ~/.claude/projects/-Users-kaihoward-Dev-terrainist/<uuid>.jsonl
```

A missing cell file renders its section with a "not yet written" note, so
the page is always renderable while cells are still being authored.

## What gets kept from the transcript

Transcripts are streamed line by line (they reach tens of MB), and the
filter is deliberately aggressive — false negatives are cheaper than noise.

**Kept**

- **Assistant text blocks** only — the orchestrator's own words to Kai,
  verbatim. `tool_use` and `thinking` blocks are dropped entirely.
- **Genuine human user messages** — rendered as quote-style dividers.

**Dropped**

- anything with `isSidechain` (subagent turns) or `isMeta` (hook feedback,
  self check-ins replayed as user turns);
- non-`user`/`assistant` records: `attachment`, `system`, `queue-operation`,
  `permission-mode`;
- any user turn containing a `tool_result` block;
- user text containing `<task-notification`, `<system-reminder>`,
  `<local-command`, `<command-name>`, `[SYSTEM NOTIFICATION`, `Caveat:`,
  `Stop hook feedback:`, `[Request interrupted`, or beginning with any
  `<tag>`;
- harness filler: `Continue from where you left off.`, bare `continue`.

Entries outside `--since` are skipped. Surviving entries are sorted
ascending and grouped under local-time day headers, **newest last**.

## Markdown

`renderMd` is a small, safe subset: headers, paragraphs, `-`/`1.` lists,
blockquotes, fenced code, `---` rules, pipe tables, and inline
bold / italic / `code` / links. **All input is HTML-escaped first**, so
markup in the source is inert; links are restricted to `http(s):`,
`mailto:`, relative paths, and fragments.

## Output

One file: a `<title>`, an inline `<style>`, and the page content — no
`<!DOCTYPE>` / `<html>` / `<head>` / `<body>` wrapper, no external
resources of any kind (safe under a strict CSP). Light and dark themes via
`prefers-color-scheme` plus `:root[data-theme=...]` overrides; palette and
typography match the project's other pages (warm paper, spruce green,
Iowan/Georgia display, system body, mono for stamps and code). Code blocks
and tables scroll inside their own `overflow-x: auto` container so the page
never scrolls horizontally.
