/**
 * One texture, every block.
 *
 * A merged quad spanning nine grass blocks wants the grass texture nine times,
 * not stretched once — so the mesher hands out UVs that run 0..W and 0..H and
 * the shader wraps them. Wrapping inside an atlas needs two things from the
 * layout, and this module exists to guarantee both:
 *
 * 1. **The cell rectangle travels with the vertex.** `cellOf(file)` is that
 *    rectangle in normalised atlas coordinates; the mesher copies it into a
 *    vertex attribute and the fragment shader does
 *    `cell.xy + fract(uv) * cell.zw`.
 * 2. **A cell must survive its own mipmaps.** Each 16×16 tile is drawn *four
 *    times* into a 32×32 cell — a 2×2 tiling, which is exactly the wrap the
 *    shader is about to do. The used rectangle is the middle 16×16, so eight
 *    pixels of correct continuation surround it on every side and the blur at
 *    every mip level down to one texel per cell reads its own texture rather
 *    than its neighbour's. Padding by repetition, rather than by clamping, is
 *    the whole trick.
 *
 * Slot 0 is always plain white. A block with no mapped texture points at it
 * and its flat colour comes through the multiply untouched — which is how
 * "unmapped renders exactly as it did before textures" is a property of the
 * layout rather than a branch in the shader.
 *
 * Nothing here touches the DOM until {@link drawAtlas}: the layout is pure
 * arithmetic, so node can test it.
 */

/** Edge of one texture, in pixels. RE:Fi is a 16px pack. */
export const TILE = 16;

/** Edge of one atlas cell: the tile, plus half a tile of wrap on each side. */
export const CELL = TILE * 2;

/** The white cell, and the file name nothing may use for a real texture. */
export const WHITE = "";

/**
 * Lay out `files` into a square-ish atlas.
 *
 * The order is the caller's, so it is the caller's job to sort — the vendored
 * `FILES.txt` order and a sorted palette both work, and both are stable, which
 * is what keeps a layout comparable between runs.
 */
export function atlasLayout(files) {
  const unique = [WHITE, ...files.filter((file) => file !== WHITE)];
  const seen = new Set();
  const slots = [];
  for (const file of unique) {
    if (seen.has(file)) continue;
    seen.add(file);
    slots.push(file);
  }

  const columns = Math.max(1, Math.ceil(Math.sqrt(slots.length)));
  const rows = Math.ceil(slots.length / columns);
  const width = columns * CELL;
  const height = rows * CELL;
  const pad = (CELL - TILE) / 2;

  const cells = new Map();
  slots.forEach((file, slot) => {
    const column = slot % columns;
    const row = Math.floor(slot / columns);
    cells.set(file, [
      (column * CELL + pad) / width,
      (row * CELL + pad) / height,
      TILE / width,
      TILE / height,
    ]);
  });

  return { slots, columns, rows, width, height, cells, pad };
}

/** The cell rectangle for `file`, or the white cell when it has none. */
export function cellOf(layout, file) {
  return layout.cells.get(file) ?? layout.cells.get(WHITE);
}

/**
 * Paint the atlas.
 *
 * `images` maps file name → anything `drawImage` accepts. A file with no image
 * is left white, so a texture that failed to load degrades to the flat-colour
 * look rather than to a black block.
 *
 * An animation strip (`16×64`, say) contributes its **first frame**: the pack
 * animates water and kelp, the viewer does not, and the top frame is the one
 * the pack's own still previews use.
 */
export function drawAtlas(layout, images, createCanvas) {
  const canvas = createCanvas(layout.width, layout.height);
  const context = canvas.getContext("2d", { willReadFrequently: false });
  context.imageSmoothingEnabled = false;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, layout.width, layout.height);

  layout.slots.forEach((file, slot) => {
    if (file === WHITE) return;
    const image = images.get(file);
    if (image === undefined) return;
    const column = slot % layout.columns;
    const row = Math.floor(slot / layout.columns);
    const frame = Math.min(image.width, image.height);
    // Four copies, offset by half a cell, so the middle TILE×TILE window sits
    // on a seamless field of its own texture.
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        context.drawImage(
          image,
          0,
          0,
          frame,
          frame,
          column * CELL + dx * TILE,
          row * CELL + dy * TILE,
          TILE,
          TILE,
        );
      }
    }
  });
  return canvas;
}

/** Fetch every file in the layout as an `ImageBitmap`. Browser only. */
export async function loadAtlasImages(layout, baseUrl) {
  const images = new Map();
  await Promise.all(
    layout.slots
      .filter((file) => file !== WHITE)
      .map(async (file) => {
        try {
          const response = await fetch(`${baseUrl}/${file}`);
          if (!response.ok) return;
          images.set(file, await createImageBitmap(await response.blob()));
        } catch {
          // A missing texture is a white cell and a flat colour, not a crash.
        }
      }),
  );
  return images;
}
