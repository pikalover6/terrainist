S=/private/tmp/claude-501/-Users-kaihoward-Dev-terrainist/2b841858-0cd5-4ee7-a91f-8948e9e8b722/scratchpad
for id in "$@"; do
  R=$(ls $S/p5/out/$id/out/*.report.json 2>/dev/null | head -1); [ -z "$R" ] && { echo "$id no report" >> $S/p5/render.log; continue; }
  W=$(ls -d $S/p5/out/$id/out/*/ | head -1); W=${W%/}
  B=$(node -e '
const r=JSON.parse(require("fs").readFileSync(process.argv[1])); let x0=1e9,z0=1e9,x1=-1e9,z1=-1e9; const pl=r.layout?.placements??[];
for(const p of pl){const [tx,,tz]=p.translation; const [sx,,sz]=p.size; x0=Math.min(x0,tx); z0=Math.min(z0,tz); x1=Math.max(x1,tx+sx); z1=Math.max(z1,tz+sz);}
if(!pl.length||!isFinite(x0)){x0=-200;z0=-200;x1=200;z1=200;}
const w=x1-x0, d=z1-z0; if(w>420||d>420){const cx=(x0+x1)/2,cz=(z0+z1)/2; x0=cx-210;x1=cx+210;z0=cz-210;z1=cz+210;}
console.log([Math.round(x0-24),Math.round(z0-24),Math.round(x1+24),Math.round(z1+24)].join(" "));' $R)
  echo "$id bounds $B" >> $S/p5/render.log
  node $S/probe2/shot-tall.mjs $W $S/p5/$id.png $B >> $S/p5/render.log 2>&1
done
echo "DONE $@" >> $S/p5/render.log
