# Cloud ↔ MacBook bridge

How a cloud Claude Code session gets worlds onto Kai's MacBook (Minecraft
installs) and gets feedback back (terrarium logs, review-import sessions,
screenshots) — **automatically whenever the Mac is awake**, with no manual
ferrying.

## Why not SSH from the cloud into the Mac

- The Mac sits behind NAT/sleep cycles; inbound SSH needs a tailnet or
  port-forwarding and a daemon that is reachable exactly when Kai happens
  to be online.
- Claude Code Cloud sandboxes have restricted egress; arbitrary outbound
  SSH is not something to build the workflow on. (A self-managed VPS could
  do Tailscale SSH — kept as an optional enhancement, not the base design.)
- Worlds never need to cross the wire anyway: compiles are
  byte-deterministic from (commit, document, seed). Shipping commits is
  shipping worlds.

## Base design: git-mediated request/result queue (pull-based)

The repo is the transport. The cloud session writes **request files**; a
launchd watcher on the Mac polls, executes, and pushes back **result
files**. When the Mac is asleep the queue simply waits; when Kai opens the
lid, it drains within a minute.

```
bridge/
  requests/<id>.json     written by the cloud session
  results/<id>.json      written by the laptop watcher (+ optional files/)
```

Request format (one JSON object per file; `id` = filename stem, unique,
e.g. `2026-07-30-install-hamlet`):

```json
{
  "action": "install-worlds" | "fetch-terrarium" | "ping",
  "params": { ... }
}
```

Supported actions (deliberately a fixed allowlist — the watcher never runs
arbitrary shell from the repo):

- **`install-worlds`** — params `{ "worlds": [{"example": "examples/hillside-village", "name": "hillside_village"}] }`.
  Watcher: `git pull` already happened → `npm ci`(if lockfile changed)`+ build` →
  `terrainist compile/devworld/terrarium` per entry → `terrainist install --replace`
  (session.lock guard applies; a held lock records a "deferred" result
  instead of corrupting a live save).
- **`fetch-terrarium`** — params `{ "session": "out/session-*.json" | null }`.
  Watcher runs `terrainist review-import`, then commits the session JSON +
  referenced screenshots under `bridge/results/<id>/` (same content
  `feedback/<date>/` gets today).
- **`ping`** — writes a result with hostname, timestamp, repo HEAD. Lets the
  cloud session discover whether the Mac is currently awake.

Result format: `{ "ok": true|false, "summary": "...", "log": "<tail>", "startedAt": ..., "commit": "<HEAD when executed>" }`.

Rules:
- A request is *pending* iff no matching result file exists. Results are
  immutable; re-running means writing a new request id.
- The watcher only ever pushes `bridge/results/**`; it never touches source.
- The cloud session polls `bridge/results/` (git pull) after pushing a
  request; `ping` first if it wants to know whether to expect fast turnaround.

## Laptop side: launchd watcher

Implementation lives in `tools/laptop-bridge/`:

- `bridge-watcher.sh` — one poll cycle: fetch; if `bridge/requests/` gained
  pending entries → pull, execute allowlisted actions, commit + push results.
  Lock-file guarded (no overlapping runs), logs to `~/Library/Logs/terrainist-bridge.log`.
- `com.terrainist.bridge.plist` — launchd agent, `StartInterval` 60s,
  `RunAtLoad`. launchd agents only run while Kai is logged in, and the
  script exits in <1s when there's nothing pending, so idle cost is nil.

Install (one-time, on the Mac):

```sh
cp tools/laptop-bridge/com.terrainist.bridge.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.terrainist.bridge.plist
```

Uninstall: `launchctl unload …` and delete the plist.

## Optional enhancement: direct SSH via Tailscale (VPS only)

If the always-on box is a self-managed VPS rather than Claude Code Cloud,
install Tailscale on both ends and the box can `ssh kai-mac` for truly
interactive work (watching the Minecraft log live, iterating on installs).
Nice-to-have; everything above works without it, and CC Cloud sessions
should not assume it exists.

## Security notes

- The watcher executes a **fixed allowlist** of project commands only;
  request JSON cannot inject shell.
- Nothing secret crosses the bridge: requests/results are project data in a
  private repo. Keys stay in each machine's local `.env`.
- The watcher refuses to run if the repo has uncommitted local changes
  (avoids clobbering in-progress local work with a pull).
