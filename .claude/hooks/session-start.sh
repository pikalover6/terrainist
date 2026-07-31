#!/bin/bash
# SessionStart hook for Claude Code on the web (cloud sessions).
#
# Everything a fresh terrainist container needs before the agent's first
# command: node deps, a compiled monorepo, and the ssh client the laptop
# bridge shells through. Local sessions skip it — the laptop already has
# all of this.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# npm install rather than ci: the container state is cached after the hook
# completes, so an incremental install on a warm cache is the fast path and
# a cold one still resolves from the committed lockfile.
npm install

# Build once so scoped vitest runs and `terrainist` CLI calls work
# immediately; tsc -b is incremental and cheap when nothing changed.
npm run build

# The laptop bridge (tools/laptop-bridge/) tunnels plain OpenSSH through a
# SOCKS5 proxy; the base image ships without an ssh client. Best-effort:
# sessions that never touch the bridge lose nothing if this fails.
if ! command -v ssh > /dev/null 2>&1; then
  (apt-get update -qq && apt-get install -y -qq openssh-client) || \
    echo "session-start: openssh-client install failed; laptop bridge will need a manual 'apt-get install openssh-client'" >&2
fi
