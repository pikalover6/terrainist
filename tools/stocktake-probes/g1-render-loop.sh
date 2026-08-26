S=/private/tmp/claude-501/-Users-kaihoward-Dev-terrainist/2b841858-0cd5-4ee7-a91f-8948e9e8b722/scratchpad
touch $S/g1/rendered.txt
while true; do
  for id in $(grep "exit=0" $S/g1/out/status.txt 2>/dev/null | awk '{print $1}'); do
    grep -qx "$id" $S/g1/rendered.txt && continue
    echo "$id" >> $S/g1/rendered.txt
    bash $S/g1/render.sh $id
  done
  [ -f $S/g1/gen.done ] && [ "$(grep -c exit=0 $S/g1/out/status.txt)" = "$(wc -l < $S/g1/rendered.txt | tr -d ' ')" ] && { echo ALL >> $S/g1/render.log; break; }
  sleep 20
done
