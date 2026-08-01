#!/bin/bash
# U3 probe: run each size sequentially, never bail on failure.
# usage: run-all.sh <variant("" or T)> <size...>
W=/home/user/terrainist/.claude/worktrees/agent-a2b0b84299e5ccf06
cd "$W" || exit 1
V="$1"; shift
mkdir -p scratch/probe/logs scratch/probe/results
for N in "$@"; do
  echo "=== ${V}${N} ==="
  node --max-old-space-size=13000 scratch/probe/run-one.mjs "$N" "$V" \
    > "scratch/probe/logs/$V$N.out" 2> "scratch/probe/logs/$V$N.err"
  echo "exit=$?"
  tail -4 "scratch/probe/logs/$V$N.err"
done
echo ALLDONE
