#!/bin/bash
# Compile the fourteen law-5 documents into $1 and write payload shas to $1/PAYLOADS.
ROOT=/Users/kaihoward/Dev/terrainist; OUT=$1; mkdir -p $OUT; : > $OUT/PAYLOADS
DOCS="battery/candidates/troy_r22/trojan_horse_troy.loam.json battery/candidates/hellenist_r22/thalassa_polis.loam.json battery/candidates/pirates_r22/pirates_vs_unicorns.loam.json $(ls $ROOT/docs/decks/*_k1/*.loam.json | sed "s#$ROOT/##") examples/hillside-village.loam.json examples/site-plan-hillside.loam.json examples/site-plan-hillside-steep.loam.json tools/golden-prompts/runs/before-sample/walled_medieval_city.doc.json"
for d in $DOCS; do
  case $d in examples/*|tools/*) id=$(basename $d | sed 's/\.loam\.json//; s/\.doc\.json//');; *) id=$(basename $(dirname $d));; esac
  NODE_OPTIONS=--max-old-space-size=8192 node $ROOT/packages/cli/dist/index.js compile $ROOT/$d --out $OUT/$id --no-zip --report $OUT/$id.report.json > $OUT/$id.log 2>&1
  sha=$(node $ROOT/tools/worlds/world-payload-sha.mjs "$(ls -d $OUT/$id/*/ | head -1)" | cut -c1-16)
  echo "$id $sha" >> $OUT/PAYLOADS
done
echo DONE >> $OUT/PAYLOADS
