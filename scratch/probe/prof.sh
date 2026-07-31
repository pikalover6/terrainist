#!/bin/bash
W=/home/user/terrainist/.claude/worktrees/agent-a2b0b84299e5ccf06
cd "$W" || exit 1
N="${1:-2048}"
rm -rf scratch/probe/prof
mkdir -p scratch/probe/prof
node --max-old-space-size=13000 --cpu-prof --cpu-prof-dir=scratch/probe/prof \
  --cpu-prof-interval=2000 scratch/probe/run-one.mjs "$N" > scratch/probe/logs/prof.out 2>&1
echo "exit=$?"
ls -la scratch/probe/prof
echo PROFDONE
