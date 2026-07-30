#!/bin/bash
# One poll cycle of the cloud->laptop bridge (see docs/CLOUD-LAPTOP-BRIDGE.md).
# Run by launchd every 60s. Exits fast when nothing is pending.
set -euo pipefail

REPO="${TERRAINIST_REPO:-$HOME/Dev/terrainist}"
LOG="$HOME/Library/Logs/terrainist-bridge.log"
LOCK="/tmp/terrainist-bridge.lock"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >>"$LOG"; }

# No overlapping runs.
if ! mkdir "$LOCK" 2>/dev/null; then exit 0; fi
trap 'rmdir "$LOCK"' EXIT

cd "$REPO"

# Never fight in-progress local work.
if ! git diff --quiet || ! git diff --cached --quiet; then exit 0; fi

git fetch -q origin main 2>>"$LOG" || exit 0

# A request is pending iff no matching result exists on the remote.
pending() {
  git ls-tree -r --name-only "$1" bridge/requests 2>/dev/null | while read -r req; do
    id="$(basename "$req" .json)"
    if ! git cat-file -e "$1:bridge/results/$id.json" 2>/dev/null; then
      echo "$id"
    fi
  done
}
PENDING="$(pending origin/main)"
[ -z "$PENDING" ] && exit 0

log "pending requests: $(echo "$PENDING" | tr '\n' ' ')"
git pull -q --ff-only origin main

CLI="node $REPO/packages/cli/dist/index.js"
BUILT=""
ensure_build() {
  [ -n "$BUILT" ] && return 0
  npm run -s build >>"$LOG" 2>&1 && BUILT=yes
}

jget() { # jget <file> <python-expr over d>
  python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(eval(sys.argv[2]))" "$1" "$3" 2>/dev/null || true
}

run_request() {
  local id="$1" req="bridge/requests/$1.json" res="bridge/results/$1.json"
  local action started ok=true summary="" logtail="" out=""
  started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  action="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1])).get('action',''))" "$req")"
  log "run $id action=$action"

  case "$action" in
    ping)
      summary="awake on $(hostname)"
      ;;

    install-worlds)
      # params.worlds: [{"doc": "<path.loam.json>"} | {"builtin": "devworld"|"terrarium"}]
      if ! ensure_build; then ok=false; summary="npm build failed"; fi
      if $ok; then
        while read -r kind arg; do
          [ -z "$kind" ] && continue
          local wdir=""
          if [ "$kind" = doc ]; then
            local wname
            wname="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['meta']['name'])" "$arg")"
            if out="$($CLI compile "$arg" --out out --no-zip 2>&1)"; then
              wdir="out/$wname"
            fi
          elif [ "$kind" = builtin ]; then
            if out="$($CLI "$arg" --out out --no-zip 2>&1)"; then
              case "$arg" in
                devworld) wdir="out/dev_world" ;;
                terrarium) wdir="out/terrarium" ;;
              esac
            fi
          fi
          if [ -n "$wdir" ] && out="$out
$($CLI install "$wdir" --replace 2>&1)"; then
            summary+="installed $(basename "$wdir"); "
          else
            ok=false
            summary+="FAILED $kind $arg (open save defers to next cycle if lock-held); "
            logtail+="$out"$'\n'
          fi
        done < <(python3 -c "
import json,sys
for w in json.load(open(sys.argv[1])).get('params',{}).get('worlds',[]):
    if 'doc' in w: print('doc', w['doc'])
    elif 'builtin' in w: print('builtin', w['builtin'])" "$req")
      fi
      ;;

    fetch-terrarium)
      # params: {"manifest"?: path, "screenshots"?: dir} — both optional.
      if ! ensure_build; then ok=false; summary="npm build failed"; fi
      if $ok; then
        mkdir -p "bridge/results/$id"
        local args=(review-import --out "bridge/results/$id/session.json")
        local manifest screenshots
        manifest="$(jget "$req" f "d.get('params',{}).get('manifest','')")"
        screenshots="$(jget "$req" f "d.get('params',{}).get('screenshots','')")"
        [ -z "$manifest" ] && [ -f out/terrarium.manifest.json ] && manifest=out/terrarium.manifest.json
        [ -z "$screenshots" ] && screenshots="$HOME/Library/Application Support/minecraft/screenshots"
        [ -n "$manifest" ] && args+=(--manifest "$manifest")
        [ -d "$screenshots" ] && args+=(--screenshots "$screenshots")
        if out="$($CLI "${args[@]}" 2>&1)"; then
          summary="terrarium session harvested to bridge/results/$id/"
        else
          ok=false; summary="review-import failed"; logtail="$out"
        fi
      fi
      ;;

    *)
      ok=false; summary="unknown action '$action' (allowlist: ping, install-worlds, fetch-terrarium)"
      ;;
  esac

  mkdir -p bridge/results
  OK="$ok" SUMMARY="$summary" LOGTAIL="$logtail" STARTED="$started" \
  python3 - "$res" <<'PYEOF'
import json, os, subprocess, sys
json.dump({
    "ok": os.environ["OK"] == "true",
    "summary": os.environ["SUMMARY"].strip(),
    "log": os.environ["LOGTAIL"][-4000:],
    "startedAt": os.environ["STARTED"],
    "commit": subprocess.run(["git", "rev-parse", "HEAD"],
                             capture_output=True, text=True).stdout.strip(),
}, open(sys.argv[1], "w"), indent=2)
PYEOF
  git add -A "bridge/results/"
}

for id in $PENDING; do
  run_request "$id" || log "request $id crashed"
done

git commit -q -m "bridge: results for $(echo "$PENDING" | tr '\n' ' ')" || exit 0
git push -q origin main 2>>"$LOG" || log "push failed (will retry next cycle)"
log "done"
