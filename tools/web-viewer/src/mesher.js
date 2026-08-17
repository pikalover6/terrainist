/**
 * Voxel → triangles.
 *
 * One merged buffer per 16³ section, hidden faces culled against the six
 * neighbours, coplanar faces of identical appearance merged into single quads,
 * classic four-sample ambient occlusion baked into the vertex colour together
 * with a fixed sun. Nothing here imports three.js — the mesher hands back plain
 * typed arrays, which is what lets it run in a worker and be tested in node.
 *
 * ## Greedy merging, and why the AO rule survives it
 *
 * Two faces may become one quad only when *everything* a fragment can see is
 * the same: the same block (so the same texture, tint, box and alpha), and the
 * same four AO corner levels. That is the standard rule, and it is exactly what
 * keeps AO correct — a merged quad interpolates between the same four corner
 * values its members each had, so nothing moves. The mask key is therefore
 * `paletteIndex * 256 + aoCode`, and two cells merge iff their keys are equal.
 *
 * The second half of the rule is geometric. A merged quad is a rectangle, so a
 * face may only grow along an axis its box *fills*: a fence post's side face
 * fills y but not z, and stacking two of them vertically is exact while pairing
 * them sideways would span the gap between the posts. Water's top face fills
 * both x and z, so a flat sea merges down to a handful of quads; its side faces
 * fill z but only reach 0.9 in y, so they merge horizontally and not
 * vertically. `mergeAlong` is that rule and nothing more.
 *
 * ## UVs
 *
 * A merged quad spanning W×H cells gets texture coordinates running 0..W and
 * 0..H — the texture is meant to *tile*, not stretch. Since the textures live
 * in an atlas, the tiling is finished in the fragment shader: each vertex also
 * carries the atlas cell rectangle it belongs to, and the shader wraps the
 * coordinate inside that rectangle. See `src/atlas.js`.
 */

/**
 * The six faces of a box, each as four corners in the winding that puts the
 * outward normal where `normal` says it is. `test/viewer.test.js` checks that
 * claim by taking the cross product of every face's first two edges — a
 * flipped quad is invisible under backface culling and is otherwise a
 * miserable thing to notice by eye.
 *
 * `uAxis`/`vAxis` name the two axes tangent to the face, and `flipU`/`flipV`
 * orient the texture on it: a wall's texture must stand up the right way round
 * whichever side of the block you are looking at.
 */
export const FACES = [
  {
    normal: [1, 0, 0],
    slot: 0,
    corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]],
    shade: 0.82,
    axis: 0,
    uAxis: 2,
    vAxis: 1,
    flipU: false,
    flipV: true,
  },
  {
    normal: [-1, 0, 0],
    slot: 1,
    corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]],
    shade: 0.82,
    axis: 0,
    uAxis: 2,
    vAxis: 1,
    flipU: true,
    flipV: true,
  },
  {
    normal: [0, 1, 0],
    slot: 2,
    corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],
    shade: 1.0,
    axis: 1,
    uAxis: 0,
    vAxis: 2,
    flipU: false,
    flipV: false,
  },
  {
    normal: [0, -1, 0],
    slot: 3,
    corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
    shade: 0.55,
    axis: 1,
    uAxis: 0,
    vAxis: 2,
    flipU: false,
    flipV: false,
  },
  {
    normal: [0, 0, 1],
    slot: 4,
    corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]],
    shade: 0.72,
    axis: 2,
    uAxis: 0,
    vAxis: 1,
    flipU: true,
    flipV: true,
  },
  {
    normal: [0, 0, -1],
    slot: 5,
    corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]],
    shade: 0.92,
    axis: 2,
    uAxis: 0,
    vAxis: 1,
    flipU: false,
    flipV: true,
  },
];

/**
 * sRGB 0-255 → linear 0-1.
 *
 * The colour table is written in sRGB, the way a person reads a hex code, and
 * three.js renders in linear space with an sRGB output transform. Skipping
 * this washes the whole world out to pastel — which is exactly what the first
 * build of this viewer did.
 */
export function srgbToLinear(value) {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Brightness per AO level, 0 (fully enclosed corner) to 3 (open). */
export const AO_LEVELS = [0.48, 0.68, 0.85, 1.0];

/**
 * The classic voxel AO rule: a corner is darkened by the two blocks sharing
 * its edges and the one diagonally across. Two occupied sides fully close the
 * corner, whatever the diagonal does.
 */
export function vertexAo(side1, side2, corner) {
  if (side1 && side2) return 0;
  return 3 - (Number(side1) + Number(side2) + Number(corner));
}

/** The four AO levels of one face, packed into a byte. */
export function packAo(levels) {
  return levels[0] | (levels[1] << 2) | (levels[2] << 4) | (levels[3] << 6);
}

/** Inverse of {@link packAo}. */
export function unpackAo(code) {
  return [code & 3, (code >> 2) & 3, (code >> 4) & 3, (code >> 6) & 3];
}

/**
 * May this block's face grow along `axis` when merged with its neighbour?
 *
 * Only if the box fills the cell on that axis. Anything narrower leaves a gap
 * between two neighbours that a single rectangle would paper over.
 */
export function mergeAlong(entry, axis) {
  return entry.box[axis] === 0 && entry.box[axis + 3] === 1;
}

const WHITE_CELL = [0, 0, 1, 1];

/* -------------------------------------------------------------------------- */
/* plants                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * How far a cross's quads stop short of the cell's corners. Small, and its
 * only job is to keep a plant from z-fighting the wall it grows against.
 */
export const CROSS_INSET = 0.03;

/** How far a plant may wander from the centre of its cell. */
export const CROSS_JITTER = 0.14;

/** Plants take the sun straight on, whichever way they face. */
export const CROSS_SHADE = 1.0;

/**
 * A stable pseudo-random pair in [-1, 1) for one column of the world.
 *
 * Minecraft nudges every plant off its lattice, and it is most of the reason a
 * meadow reads as a meadow rather than as a checkerboard — Kai's word for the
 * un-nudged version was "in rows". Derived from the world coordinate, so it
 * survives a chunk being dropped and re-meshed, and it never touches `Math.
 * random` (the project's determinism rule applies here too).
 */
export function plantOffset(x, z) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(z | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  const a = ((h >>> 0) % 1024) / 512 - 1;
  const b = ((h >>> 10) % 1024) / 512 - 1;
  return [a * CROSS_JITTER, b * CROSS_JITTER];
}

/**
 * One plant: two diagonal quads through the cell, each wound both ways.
 *
 * Both windings rather than a double-sided material, because a cross lives in
 * the same buffer and the same alpha-cutout material as every opaque block —
 * so it costs eight triangles and no state change, and a plant seen from the
 * far side is lit and textured exactly as from the near one. Nothing here is
 * ever merged: a merged plant is a smear, and the mask never sees one (see
 * `faceKey`).
 */
function emitCross(buffer, entry, x, y, z) {
  const cell = entry.faces === undefined ? WHITE_CELL : entry.faces[0];
  const light = entry.emissive ? 1 : CROSS_SHADE;
  const rgb = [
    srgbToLinear(entry.tint[0]) * light,
    srgbToLinear(entry.tint[1]) * light,
    srgbToLinear(entry.tint[2]) * light,
  ];
  const [ox, oz] = plantOffset(x, z);
  const lo = CROSS_INSET;
  const hi = 1 - CROSS_INSET;
  const top = y + entry.box[4];
  const planes = [
    // corner (lo, lo) → (hi, hi), and the other diagonal
    [[x + lo, z + lo], [x + hi, z + hi]],
    [[x + hi, z + lo], [x + lo, z + hi]],
  ];
  for (const [[ax, az], [bx, bz]] of planes) {
    const corners = [
      [ax + ox, y, az + oz],
      [ax + ox, top, az + oz],
      [bx + ox, top, bz + oz],
      [bx + ox, y, bz + oz],
    ];
    // v runs 1 at the ground and 0 at the tip, the same way the box faces do:
    // the atlas counts rows from the top of the sheet.
    pushQuad(buffer, corners, [[0, 1], [0, 0], [1, 0], [1, 1]], cell, rgb, true);
  }
}

/** Ground cover: one horizontal quad a hair above the floor, both windings. */
function emitFlat(buffer, entry, x, y, z) {
  const cell = entry.faces === undefined ? WHITE_CELL : entry.faces[2] ?? entry.faces[0];
  const light = entry.emissive ? 1 : 1;
  const rgb = [
    srgbToLinear(entry.tint[0]) * light,
    srgbToLinear(entry.tint[1]) * light,
    srgbToLinear(entry.tint[2]) * light,
  ];
  const h = y + entry.box[4];
  const corners = [
    [x, h, z + 1],
    [x + 1, h, z + 1],
    [x + 1, h, z],
    [x, h, z],
  ];
  pushQuad(buffer, corners, [[0, 1], [1, 1], [1, 0], [0, 0]], cell, rgb, true);
}

/** Four vertices, one quad, and optionally the same quad wound the other way. */
function pushQuad(buffer, corners, uvs, cell, rgb, doubleSided) {
  for (const winding of doubleSided ? [0, 1] : [0]) {
    const base = buffer.vertices;
    for (let k = 0; k < 4; k++) {
      const corner = corners[k];
      buffer.position.push(corner[0], corner[1], corner[2]);
      buffer.uv.push(uvs[k][0], uvs[k][1]);
      buffer.cell.push(cell[0], cell[1], cell[2], cell[3]);
      buffer.color.push(rgb[0], rgb[1], rgb[2]);
    }
    buffer.vertices += 4;
    buffer.quads += 1;
    if (winding === 0) buffer.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else buffer.index.push(base + 2, base + 1, base, base + 3, base + 2, base);
  }
}


/**
 * Mesh one 16×16×16 section.
 *
 * `sample(x, y, z)` returns a palette index in world coordinates; `palette` is
 * the resolved table from `appearance.js`. Opaque and transparent geometry come
 * back separately so the page can draw them in two passes with the depth write
 * off for the second.
 *
 * `options.merge` off is the pre-greedy mesher, quad per face — kept because
 * the tests compare the two, and a difference in *coverage* between them is
 * the only kind of merging bug that is hard to see by walking.
 */
export function meshSection(sample, palette, originX, originY, originZ, options = {}) {
  const size = options.size ?? 16;
  const merge = options.merge ?? true;
  const opaque = newBuffer();
  const transparent = newBuffer();

  // Every lookup the mesher makes — the cell, its six neighbours, and the
  // twelve AO samples around each face — lands within one block of the
  // section, so the whole neighbourhood is read *once* into a padded grid and
  // nothing below ever calls `sample` again. On the hero world this cut
  // sampling from ~150,000 calls per chunk section to 5,832, and `sample` is a
  // closure over a chunk map with a division and a hash in it: it was, by a
  // wide margin, the mesher.
  const dim = size + 2;
  const grid = new Int32Array(dim * dim * dim);
  for (let dx = -1; dx <= size; dx++) {
    for (let dy = -1; dy <= size; dy++) {
      const base = ((dx + 1) * dim + (dy + 1)) * dim;
      for (let dz = -1; dz <= size; dz++) {
        grid[base + dz + 1] = sample(originX + dx, originY + dy, originZ + dz);
      }
    }
  }
  const at = (dx, dy, dz) => grid[((dx + 1) * dim + (dy + 1)) * dim + (dz + 1)];

  // A section of nothing but air draws nothing, whatever surrounds it. One
  // scan of the core is cheaper than six mask passes that find the same.
  let empty = true;
  for (let dx = 0; dx < size && empty; dx++) {
    for (let dy = 0; dy < size && empty; dy++) {
      for (let dz = 0; dz < size; dz++) {
        if (at(dx, dy, dz) !== 0) {
          empty = false;
          break;
        }
      }
    }
  }
  if (empty) return { opaque: finish(opaque), transparent: finish(transparent) };

  // Plants first, and entirely outside the mask: they are not boxes, they never
  // merge, and they never cull or are culled. One pass over the section's own
  // cells, two crossed quads each.
  for (let dx = 0; dx < size; dx++) {
    for (let dy = 0; dy < size; dy++) {
      for (let dz = 0; dz < size; dz++) {
        const entry = palette[at(dx, dy, dz)];
        if (entry === undefined || entry.air) continue;
        if (entry.render !== "cross" && entry.render !== "flat") continue;
        const target = entry.alpha < 1 ? transparent : opaque;
        const emit = entry.render === "cross" ? emitCross : emitFlat;
        emit(target, entry, originX + dx, originY + dy, originZ + dz);
      }
    }
  }

  const mask = new Int32Array(size * size);
  const origin = [originX, originY, originZ];

  for (const face of FACES) {
    const { axis, uAxis, vAxis } = face;
    const cell = [0, 0, 0];
    for (let a = 0; a < size; a++) {
      mask.fill(-1);
      cell[axis] = a;
      for (let v = 0; v < size; v++) {
        cell[vAxis] = v;
        for (let u = 0; u < size; u++) {
          cell[uAxis] = u;
          mask[v * size + u] = faceKey(at, palette, face, cell);
        }
      }
      emitSlice(mask, size, merge, palette, face, origin, a, opaque, transparent);
    }
  }
  return { opaque: finish(opaque), transparent: finish(transparent) };
}

/**
 * The mask entry for one cell's face: `paletteIndex * 256 + aoCode`, or -1 for
 * "no face here" (air, an unknown block, or a face hidden by its neighbour).
 *
 * `at` reads the padded grid in *section-local* coordinates, so everything from
 * here down is index arithmetic.
 */
function faceKey(at, palette, face, cell) {
  const x = cell[0];
  const y = cell[1];
  const z = cell[2];
  const index = at(x, y, z);
  if (index === 0) return -1;
  const entry = palette[index];
  if (entry === undefined || entry.air) return -1;
  // A plant has no faces to mask: it was drawn, in full, by the plant pass.
  if (entry.render === "cross" || entry.render === "flat") return -1;

  const [nx, ny, nz] = face.normal;
  const full = entry.occludes;
  // A partial box never culls, but it still must not draw the faces of the
  // neighbouring solid it is embedded in; only its own faces are emitted.
  if ((full || entry.sameCulls) && hidden(at, palette, entry, index, x + nx, y + ny, z + nz)) {
    return -1;
  }

  let code = 0b11111111; // ao 3 on every corner
  if (full && !entry.emissive) {
    const levels = [0, 0, 0, 0];
    for (let k = 0; k < 4; k++) {
      levels[k] = cornerAo(at, palette, face.normal, face.corners[k], x, y, z);
    }
    code = packAo(levels);
  }
  return index * 256 + code;
}

/** Greedy-merge one slice of the mask and push the quads into the buffers. */
function emitSlice(mask, size, merge, palette, face, origin, a, opaque, transparent) {
  const { uAxis, vAxis } = face;
  for (let v = 0; v < size; v++) {
    for (let u = 0; u < size; ) {
      const key = mask[v * size + u];
      if (key < 0) {
        u++;
        continue;
      }
      const index = key >>> 8;
      const entry = palette[index];

      let width = 1;
      if (merge && mergeAlong(entry, uAxis)) {
        while (u + width < size && mask[v * size + u + width] === key) width++;
      }
      let height = 1;
      if (merge && mergeAlong(entry, vAxis)) {
        grow: while (v + height < size) {
          for (let k = 0; k < width; k++) {
            if (mask[(v + height) * size + u + k] !== key) break grow;
          }
          height++;
        }
      }
      for (let dv = 0; dv < height; dv++) {
        for (let du = 0; du < width; du++) mask[(v + dv) * size + u + du] = -1;
      }

      const target = entry.alpha < 1 ? transparent : opaque;
      emitQuad(target, entry, face, origin, a, u, v, width, height, unpackAo(key & 255));
      u += width;
    }
  }
}

function newBuffer() {
  return { position: [], color: [], uv: [], cell: [], index: [], vertices: 0, quads: 0 };
}

function finish(buffer) {
  return {
    position: new Float32Array(buffer.position),
    color: new Float32Array(buffer.color),
    uv: new Float32Array(buffer.uv),
    cell: new Float32Array(buffer.cell),
    index: buffer.vertices > 65535 ? new Uint32Array(buffer.index) : new Uint16Array(buffer.index),
    triangles: buffer.index.length / 3,
    quads: buffer.quads,
  };
}

/** Does the block at (x, y, z) hide the face of `entry` looking at it? */
function hidden(at, palette, entry, index, x, y, z) {
  const neighbour = at(x, y, z);
  if (neighbour === 0) return false;
  if (neighbour === index && entry.sameCulls) return true;
  const other = palette[neighbour];
  if (other === undefined) return false;
  return other.occludes;
}

/**
 * One quad: four vertices with position, lit colour, tiling UV and the atlas
 * cell to wrap that UV inside.
 *
 * `u`/`v` are the merged rectangle's low corner in slice coordinates and
 * `width`/`height` its extent; `a` is the slice. Every cell in the rectangle is
 * the same block with the same AO, which is what the mask guaranteed.
 */
function emitQuad(buffer, entry, face, origin, a, u, v, width, height, ao) {
  const { axis, uAxis, vAxis } = face;
  const box = entry.box;
  const light = entry.emissive ? 1 : face.shade;
  const cell = entry.faces === undefined ? WHITE_CELL : entry.faces[face.slot];
  const r = srgbToLinear(entry.tint[0]);
  const g = srgbToLinear(entry.tint[1]);
  const b = srgbToLinear(entry.tint[2]);

  const base = buffer.vertices;
  for (let k = 0; k < 4; k++) {
    const corner = face.corners[k];
    const point = [0, 0, 0];
    point[axis] = origin[axis] + a + (corner[axis] === 0 ? box[axis] : box[axis + 3]);
    point[uAxis] =
      origin[uAxis] + (corner[uAxis] === 0 ? u + box[uAxis] : u + width - 1 + box[uAxis + 3]);
    point[vAxis] =
      origin[vAxis] + (corner[vAxis] === 0 ? v + box[vAxis] : v + height - 1 + box[vAxis + 3]);
    buffer.position.push(point[0], point[1], point[2]);

    const pu = corner[uAxis] === 0 ? 0 : width;
    const pv = corner[vAxis] === 0 ? 0 : height;
    buffer.uv.push(face.flipU ? width - pu : pu, face.flipV ? height - pv : pv);
    buffer.cell.push(cell[0], cell[1], cell[2], cell[3]);

    const shade = light * AO_LEVELS[ao[k]];
    buffer.color.push(r * shade, g * shade, b * shade);
  }
  buffer.vertices += 4;
  buffer.quads += 1;
  // Split the quad along the darker diagonal, or the AO gradient creases the
  // wrong way across the face and every corner looks like a fold.
  if (ao[0] + ao[2] > ao[1] + ao[3]) {
    buffer.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  } else {
    buffer.index.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
  }
}

/** AO of one corner of one face: two edge neighbours plus the diagonal. */
function cornerAo(at, palette, normal, corner, x, y, z) {
  // The two axes tangent to this face, and which way this corner leans on each.
  const axes = [];
  for (let axis = 0; axis < 3; axis++) {
    if (normal[axis] !== 0) continue;
    const step = [0, 0, 0];
    step[axis] = corner[axis] === 0 ? -1 : 1;
    axes.push(step);
  }
  const [t1, t2] = axes;
  const occupied = (ax, ay, az) => {
    const entry = palette[at(x + normal[0] + ax, y + normal[1] + ay, z + normal[2] + az)];
    return entry !== undefined && entry.occludes;
  };
  const side1 = occupied(t1[0], t1[1], t1[2]);
  const side2 = occupied(t2[0], t2[1], t2[2]);
  const diagonal = occupied(t1[0] + t2[0], t1[1] + t2[1], t1[2] + t2[2]);
  return vertexAo(side1, side2, diagonal);
}
