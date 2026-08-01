import fs from "node:fs";
import path from "node:path";
const HERE = path.dirname(new URL(import.meta.url).pathname);
const dir = path.join(HERE, "results");
const rows = [];
for (const f of fs.readdirSync(dir).sort()) {
  const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  const t = d.timings ?? {};
  const ss = d.city?.structureStats ?? {};
  rows.push({
    world: f.replace(".json", ""),
    ok: d.ok,
    wall_s: +(d.wallMs / 1000).toFixed(1),
    rss_MB: d.peakRssMB,
    heap_MB: d.peakHeapMB,
    layout_s: t.layout ? +(t.layout / 1000).toFixed(1) : 0,
    struct_s: t.structures ? +(t.structures / 1000).toFixed(1) : 0,
    scatter_s: t.scatter ? +(t.scatter / 1000).toFixed(1) : 0,
    field_s: t.field ? +(t.field / 1000).toFixed(1) : 0,
    emit_s: t.emit ? +(t.emit / 1000).toFixed(1) : 0,
    emit_fill_s: d.emitSplit ? +(d.emitSplit.fillMs / 1000).toFixed(1) : 0,
    emit_conn_s: d.emitSplit ? +(d.emitSplit.connectionsMs / 1000).toFixed(1) : 0,
    emit_write_s: d.emitSplit ? +(d.emitSplit.regionWriteMs / 1000).toFixed(1) : 0,
    chunks: d.stats?.chunkCount,
    structBlocks: d.stats?.structureBlockCount,
    buildings: ss.buildingCount,
    streetCols: ss.streetColumns,
    trees: d.stats?.treeCount,
    out_MB: d.outputBytes ? +(d.outputBytes / 1048576).toFixed(1) : 0,
    warn: d.warnings,
    fail: d.diagnostics?.[0]?.slice(0, 60) ?? d.error?.slice(0, 80) ?? "",
  });
}
console.table(rows);
