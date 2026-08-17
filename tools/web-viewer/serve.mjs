/**
 * The dev server — `node serve.mjs [port]`.
 *
 * Exists for one reason: a server that sends no cache headers lets the
 * browser heuristically cache a WORKER's module graph across a hard reload,
 * and the page then runs new main-thread code against a stale mesher — a
 * split that cost a live debugging session. `Cache-Control: no-cache` makes
 * every reload revalidate everything.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.argv[2] ?? 8765);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".gz": "application/gzip",
  ".css": "text/css",
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    let path = normalize(decodeURIComponent(url.pathname));
    if (path.endsWith("/")) path += "index.html";
    const file = join(root, path);
    if (!file.startsWith(root)) throw new Error("traversal");
    const body = await readFile(file);
    res.writeHead(200, {
      "Content-Type": TYPES[extname(file)] ?? "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "Cache-Control": "no-cache" });
    res.end("not found");
  }
}).listen(port, () => console.log(`web-viewer at http://localhost:${port}/`));
