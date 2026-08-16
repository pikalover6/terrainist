/**
 * Voxel → triangles.
 *
 * One merged buffer per 16³ section, hidden faces culled against the six
 * neighbours, classic four-sample ambient occlusion baked into the vertex
 * colour together with a fixed sun. Nothing here imports three.js: the mesher
 * hands back plain typed arrays, which is what makes it testable in node and
 * what would let it move into a worker unchanged.
 */

/**
 * The six faces of a box, each as four corners in the winding that puts the
 * outward normal where `normal` says it is. `test/mesher.test.mjs` checks that
 * claim by taking the cross product of every face's first two edges — a
 * flipped quad is invisible under backface culling and is otherwise a
 * miserable thing to notice by eye.
 */
export const FACES = [
  { normal: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], shade: 0.82 },
  { normal: [-1, 0, 0], corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], shade: 0.82 },
  { normal: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0 },
  { normal: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.55 },
  { normal: [0, 0, 1], corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], shade: 0.72 },
  { normal: [0, 0, -1], corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], shade: 0.92 },
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

/**
 * Mesh one 16×16×16 section.
 *
 * `sample(x, y, z)` returns a palette index in world coordinates; `palette` is
 * the resolved table from `appearance.js`. Opaque and transparent geometry come
 * back separately so the page can draw them in two passes with the depth write
 * off for the second.
 */
export function meshSection(sample, palette, originX, originY, originZ, size = 16) {
  const opaque = newBuffer();
  const transparent = newBuffer();

  for (let dx = 0; dx < size; dx++) {
    for (let dy = 0; dy < size; dy++) {
      for (let dz = 0; dz < size; dz++) {
        const x = originX + dx;
        const y = originY + dy;
        const z = originZ + dz;
        const index = sample(x, y, z);
        if (index === 0) continue;
        const entry = palette[index];
        if (entry === undefined || entry.air) continue;
        const target = entry.alpha < 1 ? transparent : opaque;
        emitBlock(target, sample, palette, entry, index, x, y, z);
      }
    }
  }
  return { opaque: finish(opaque), transparent: finish(transparent) };
}

function newBuffer() {
  return { position: [], color: [], index: [], vertices: 0 };
}

function finish(buffer) {
  return {
    position: new Float32Array(buffer.position),
    color: new Float32Array(buffer.color),
    index: buffer.vertices > 65535 ? new Uint32Array(buffer.index) : new Uint16Array(buffer.index),
    triangles: buffer.index.length / 3,
  };
}

/** Does the block at (x, y, z) hide the face of `entry` looking at it? */
function hidden(sample, palette, entry, index, x, y, z) {
  const neighbour = sample(x, y, z);
  if (neighbour === 0) return false;
  if (neighbour === index && entry.sameCulls) return true;
  const other = palette[neighbour];
  if (other === undefined) return false;
  return other.occludes;
}

function emitBlock(buffer, sample, palette, entry, index, x, y, z) {
  const [bx0, by0, bz0, bx1, by1, bz1] = entry.box;
  const full = entry.occludes;
  const r = srgbToLinear(entry.color[0]);
  const g = srgbToLinear(entry.color[1]);
  const b = srgbToLinear(entry.color[2]);

  for (const face of FACES) {
    const [nx, ny, nz] = face.normal;
    if (full && hidden(sample, palette, entry, index, x + nx, y + ny, z + nz)) continue;
    // A partial box never culls, but it still must not draw the faces of the
    // neighbouring solid it is embedded in; only its own faces are emitted.
    if (!full && entry.sameCulls && hidden(sample, palette, entry, index, x + nx, y + ny, z + nz)) {
      continue;
    }

    const light = entry.emissive ? 1 : face.shade;
    const base = buffer.vertices;
    const ao = [];
    for (const corner of face.corners) {
      const px = x + (corner[0] === 0 ? bx0 : bx1);
      const py = y + (corner[1] === 0 ? by0 : by1);
      const pz = z + (corner[2] === 0 ? bz0 : bz1);
      buffer.position.push(px, py, pz);

      const level = full && !entry.emissive ? cornerAo(sample, palette, face.normal, corner, x, y, z) : 3;
      ao.push(level);
      const shade = light * AO_LEVELS[level];
      buffer.color.push(r * shade, g * shade, b * shade);
    }
    buffer.vertices += 4;
    // Split the quad along the darker diagonal, or the AO gradient creases the
    // wrong way across the face and every corner looks like a fold.
    if (ao[0] + ao[2] > ao[1] + ao[3]) {
      buffer.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    } else {
      buffer.index.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
    }
  }
}

/** AO of one corner of one face: two edge neighbours plus the diagonal. */
function cornerAo(sample, palette, normal, corner, x, y, z) {
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
    const entry = palette[sample(x + normal[0] + ax, y + normal[1] + ay, z + normal[2] + az)];
    return entry !== undefined && entry.occludes;
  };
  const side1 = occupied(t1[0], t1[1], t1[2]);
  const side2 = occupied(t2[0], t2[1], t2[2]);
  const diagonal = occupied(t1[0] + t2[0], t1[1] + t2[1], t1[2] + t2[2]);
  return vertexAo(side1, side2, diagonal);
}
