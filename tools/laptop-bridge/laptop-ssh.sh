#!/usr/bin/env bash
# SSH to Kai's laptop over the tailnet, through the userspace SOCKS5 proxy
# that bridge-up.sh started. Usage:
#
#   tools/laptop-bridge/laptop-ssh.sh 'uname -a'
#   tools/laptop-bridge/laptop-ssh.sh            # interactive shell
#
# Key resolution, in order:
#   1. $LAPTOP_SSH_KEY  (private key contents, from env secrets) -> written
#      to a 0600 file on first use.
#   2. ~/.ssh/claude_cloud_session (session-local keypair whose public half
#      Kai added to authorized_keys manually).

set -euo pipefail

LAPTOP_HOST=${LAPTOP_HOST:-100.67.165.113}   # kais-macbook-air-2
LAPTOP_USER=${LAPTOP_USER:-kaihoward}
SOCKS_PORT=${SOCKS_PORT:-1055}

# The sandbox reaps background daemons between turns; revive tailscaled
# from its persisted state if the SOCKS port is closed (rejoin needs no
# re-auth).
if ! nc -z localhost "$SOCKS_PORT" 2>/dev/null; then
  "$(dirname "$0")/bridge-up.sh" >&2
fi

KEY_FILE="$HOME/.ssh/laptop_bridge_key"
if [ -n "${LAPTOP_SSH_KEY:-}" ]; then
  mkdir -p "$HOME/.ssh"; chmod 700 "$HOME/.ssh"
  umask 077
  printf '%s\n' "$LAPTOP_SSH_KEY" > "$KEY_FILE"
fi
if ! [ -f "$KEY_FILE" ] || ! grep -q "PRIVATE KEY" "$KEY_FILE"; then
  # LAPTOP_SSH_KEY absent or not a private key (e.g. the .pub was pasted
  # into the secret by mistake) -> fall back to the session-local keypair.
  if [ -f "$HOME/.ssh/claude_cloud_session" ]; then
    [ -n "${LAPTOP_SSH_KEY:-}" ] &&
      echo "warn: LAPTOP_SSH_KEY is not a private key; using session key" >&2
    KEY_FILE="$HOME/.ssh/claude_cloud_session"
  else
    echo "no usable key: set LAPTOP_SSH_KEY to the PRIVATE key contents" >&2
    exit 1
  fi
fi

exec ssh -i "$KEY_FILE" \
  -o IdentitiesOnly=yes \
  -o ProxyCommand="nc -X 5 -x localhost:${SOCKS_PORT} %h %p" \
  -o StrictHostKeyChecking=accept-new \
  -o ConnectTimeout=15 \
  "${LAPTOP_USER}@${LAPTOP_HOST}" "$@"
