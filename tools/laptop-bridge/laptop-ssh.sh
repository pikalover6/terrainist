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

KEY_FILE="$HOME/.ssh/laptop_bridge_key"
if [ -n "${LAPTOP_SSH_KEY:-}" ]; then
  if [ ! -f "$KEY_FILE" ]; then
    mkdir -p "$HOME/.ssh"; chmod 700 "$HOME/.ssh"
    umask 077
    printf '%s\n' "$LAPTOP_SSH_KEY" > "$KEY_FILE"
  fi
elif [ -f "$HOME/.ssh/claude_cloud_session" ]; then
  KEY_FILE="$HOME/.ssh/claude_cloud_session"
else
  echo "no key: set LAPTOP_SSH_KEY or create ~/.ssh/claude_cloud_session" >&2
  exit 1
fi

exec ssh -i "$KEY_FILE" \
  -o ProxyCommand="nc -X 5 -x localhost:${SOCKS_PORT} %h %p" \
  -o StrictHostKeyChecking=accept-new \
  -o ConnectTimeout=15 \
  "${LAPTOP_USER}@${LAPTOP_HOST}" "$@"
