#!/usr/bin/env bash
# Bring up the Tailscale laptop bridge from a Claude Code Cloud container.
#
# Joins the tailnet in userspace mode (no TUN device needed) and exposes a
# SOCKS5 proxy on localhost:1055 that `laptop-ssh.sh` tunnels through.
#
# Auth, in order of preference:
#   1. $TS_AUTHKEY set (reusable+ephemeral+preauthorized key from the admin
#      console) -> fully unattended join.
#   2. No key -> prints an interactive login URL; hand it to Kai to approve.
#
# Idempotent: safe to re-run; if already up it just prints status.

set -euo pipefail

TS_STATE_DIR=${TS_STATE_DIR:-/var/lib/tailscale}
TS_SOCK=${TS_SOCK:-/var/run/tailscale/tailscaled.sock}
TS_VERSION=${TS_VERSION:-1.98.10}
SOCKS_PORT=${SOCKS_PORT:-1055}
HOSTNAME_ARG=${TS_HOSTNAME:-terrainist-cloud}

log() { echo "[bridge-up] $*"; }

# --- 1. Install binaries if missing -----------------------------------------
if ! command -v tailscaled >/dev/null 2>&1; then
  log "installing tailscale ${TS_VERSION} static build to /usr/local/bin"
  tmp=$(mktemp -d)
  curl -sSL -o "$tmp/ts.tgz" \
    "https://pkgs.tailscale.com/stable/tailscale_${TS_VERSION}_amd64.tgz"
  tar xzf "$tmp/ts.tgz" -C "$tmp"
  cp "$tmp/tailscale_${TS_VERSION}_amd64/tailscale" \
     "$tmp/tailscale_${TS_VERSION}_amd64/tailscaled" /usr/local/bin/
  rm -rf "$tmp"
fi

# --- 2. Start tailscaled (userspace networking) -----------------------------
mkdir -p "$TS_STATE_DIR" "$(dirname "$TS_SOCK")"
if ! tailscale --socket="$TS_SOCK" status >/dev/null 2>&1; then
  log "starting tailscaled (userspace, socks5 on localhost:${SOCKS_PORT})"
  nohup tailscaled \
    --state="$TS_STATE_DIR/tailscaled.state" \
    --socket="$TS_SOCK" \
    --tun=userspace-networking \
    --socks5-server="localhost:${SOCKS_PORT}" \
    >>"${TS_STATE_DIR}/tailscaled.log" 2>&1 &
  disown
  sleep 3
fi

# --- 3. Join the tailnet ----------------------------------------------------
# BackendState is "Running" once joined; "NeedsLogin" when not yet authed.
state=$(tailscale --socket="$TS_SOCK" status --json 2>/dev/null |
  grep -o '"BackendState": *"[^"]*"' | cut -d'"' -f4 || true)
if [ "$state" = "Running" ]; then
  log "already joined:"
  tailscale --socket="$TS_SOCK" status
  exit 0
fi

if [ -n "${TS_AUTHKEY:-}" ]; then
  log "joining tailnet with TS_AUTHKEY (unattended)"
  tailscale --socket="$TS_SOCK" up --authkey="$TS_AUTHKEY" \
    --hostname="$HOSTNAME_ARG"
  tailscale --socket="$TS_SOCK" status
else
  log "TS_AUTHKEY not set -> interactive login."
  log "hand the URL below to Kai to approve this container:"
  # `tailscale up` blocks until approved; run it in the foreground so the
  # URL prints here, and this script returns once the join completes.
  tailscale --socket="$TS_SOCK" up --hostname="$HOSTNAME_ARG"
  tailscale --socket="$TS_SOCK" status
fi
