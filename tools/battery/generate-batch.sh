#!/bin/zsh
# Parallel battery generation — run several `terrainist generate` jobs
# concurrently instead of in file order.
#
# Generation is two-natured: authoring rounds are API-bound (the box idles
# on the network) and compiles are CPU-bound. Two jobs overlap those phases
# almost for free; past that the compiles start fighting for cores, which is
# why the default cap is 2 (raise with --max for authoring-heavy batches).
#
# Usage:
#   tools/battery/generate-batch.sh <jobs-file> --out-root <dir> [--max N]
#
# The jobs file is one job per line, pipe-separated (prompts never contain
# pipes; everything else never contains spaces):
#
#   slug|seed|model|effort|prompt
#
# `model` and `effort` may be `-` for the pinned defaults. Blank lines and
# `#` comments are skipped. Each job writes <out-root>/<slug>/ and
# <out-root>/<slug>-generate.log, and its exit code to <out-root>/<slug>.exit.
#
# Standing rules this script assumes you honored before running it:
#   - the dist is BUILT FROM A COMMITTED TREE (never emit worlds from a dist
#     carrying in-flight agent code);
#   - installs happen afterwards, alongside, never --replace.
set -u
cd "${0:A:h}/../.." || exit 1

if (( $# < 3 )); then
  echo "usage: $0 <jobs-file> --out-root <dir> [--max N]" >&2
  exit 2
fi

JOBS_FILE="$1"; shift
OUT_ROOT=""
MAX=2
while (( $# > 0 )); do
  case "$1" in
    --out-root) OUT_ROOT="$2"; shift 2 ;;
    --max) MAX="$2"; shift 2 ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done
[[ -z "$OUT_ROOT" ]] && { echo "--out-root is required" >&2; exit 2; }
[[ -r "$JOBS_FILE" ]] || { echo "cannot read jobs file: $JOBS_FILE" >&2; exit 2; }
mkdir -p "$OUT_ROOT"

running() { jobs -rp | wc -l | tr -d ' '; }

run_one() {
  local slug="$1" seed="$2" model="$3" effort="$4" prompt="$5"
  local -a flags
  flags=(--seed "$seed" --keep-doc --compile-rounds 4)
  [[ "$model" != "-" ]] && flags+=(--model "$model")
  [[ "$effort" != "-" ]] && flags+=(--effort "$effort")
  rm -rf "$OUT_ROOT/$slug"
  node packages/cli/dist/index.js generate "$prompt" "${flags[@]}" \
    --out "$OUT_ROOT/$slug" > "$OUT_ROOT/$slug-generate.log" 2>&1
  echo $? > "$OUT_ROOT/$slug.exit"
}

typeset -a SLUGS
while IFS= read -r line; do
  [[ -z "$line" || "$line" == \#* ]] && continue
  IFS='|' read -r slug seed model effort prompt <<< "$line"
  while (( $(running) >= MAX )); do sleep 5; done
  echo "[launch] $slug (seed $seed, model ${model}, effort ${effort})"
  run_one "$slug" "$seed" "$model" "$effort" "$prompt" &
  SLUGS+=("$slug")
done < "$JOBS_FILE"

wait

STATUS=0
for slug in "${SLUGS[@]}"; do
  code="$(cat "$OUT_ROOT/$slug.exit" 2>/dev/null || echo missing)"
  errors="$(grep -c 'error LOAM' "$OUT_ROOT/$slug-generate.log" 2>/dev/null || echo '?')"
  echo "=== $slug: exit=$code, $errors errors ==="
  tail -3 "$OUT_ROOT/$slug-generate.log"
  [[ "$code" == "0" ]] || STATUS=1
done
echo "=== batch complete ==="
exit $STATUS
