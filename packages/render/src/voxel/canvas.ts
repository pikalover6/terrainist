/**
 * Vendored 2026-07-27 from the mcai prototype (packages/voxel-renderer);
 * carried over as proven code per docs/DESIGN.md.
 */

import { encodePng } from "./png.js";

/** A straightforward RGBA8 software canvas: blend, blit, tile, encode. */
export class Canvas {
  readonly data: Uint8Array;

  constructor(readonly width: number, readonly height: number, background: [number, number, number, number] = [18, 20, 24, 255]) {
    this.data = new Uint8Array(width * height * 4);
    this.fill(background);
  }

  fill(color: [number, number, number, number]): void {
    for (let i = 0; i < this.data.length; i += 4) {
      this.data[i] = color[0];
      this.data[i + 1] = color[1];
      this.data[i + 2] = color[2];
      this.data[i + 3] = color[3];
    }
  }

  /** Source-over blend of one pixel. `alpha` is 0..1. */
  blend(x: number, y: number, r: number, g: number, b: number, alpha: number): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    if (alpha >= 1) {
      this.data[i] = r;
      this.data[i + 1] = g;
      this.data[i + 2] = b;
      this.data[i + 3] = 255;
      return;
    }
    const inv = 1 - alpha;
    this.data[i] = Math.round(r * alpha + this.data[i]! * inv);
    this.data[i + 1] = Math.round(g * alpha + this.data[i + 1]! * inv);
    this.data[i + 2] = Math.round(b * alpha + this.data[i + 2]! * inv);
    this.data[i + 3] = 255;
  }

  rect(x0: number, y0: number, w: number, h: number, color: [number, number, number, number]): void {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) this.blend(x, y, color[0], color[1], color[2], color[3] / 255);
    }
  }

  /** Copy another canvas in at an offset (opaque copy). */
  blit(source: Canvas, dx: number, dy: number): void {
    for (let y = 0; y < source.height; y++) {
      const ty = dy + y;
      if (ty < 0 || ty >= this.height) continue;
      for (let x = 0; x < source.width; x++) {
        const tx = dx + x;
        if (tx < 0 || tx >= this.width) continue;
        const si = (y * source.width + x) * 4;
        const ti = (ty * this.width + tx) * 4;
        this.data[ti] = source.data[si]!;
        this.data[ti + 1] = source.data[si + 1]!;
        this.data[ti + 2] = source.data[si + 2]!;
        this.data[ti + 3] = 255;
      }
    }
  }

  /** Nearest-neighbour downscale by an integer factor, averaging the samples. */
  downscale(factor: number): Canvas {
    if (factor <= 1) return this;
    const out = new Canvas(Math.max(1, Math.floor(this.width / factor)), Math.max(1, Math.floor(this.height / factor)));
    for (let y = 0; y < out.height; y++) {
      for (let x = 0; x < out.width; x++) {
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let sy = y * factor; sy < Math.min(this.height, (y + 1) * factor); sy++) {
          for (let sx = x * factor; sx < Math.min(this.width, (x + 1) * factor); sx++) {
            const i = (sy * this.width + sx) * 4;
            r += this.data[i]!;
            g += this.data[i + 1]!;
            b += this.data[i + 2]!;
            n++;
          }
        }
        if (n === 0) continue;
        const i = (y * out.width + x) * 4;
        out.data[i] = Math.round(r / n);
        out.data[i + 1] = Math.round(g / n);
        out.data[i + 2] = Math.round(b / n);
        out.data[i + 3] = 255;
      }
    }
    return out;
  }

  /** Draw text with the built-in 5x7 bitmap font. */
  text(x: number, y: number, message: string, color: [number, number, number, number] = [235, 235, 235, 255], scale = 1): void {
    let cursor = x;
    for (const character of message.toUpperCase()) {
      const glyph = FONT[character] ?? FONT["?"]!;
      for (let row = 0; row < 7; row++) {
        const bits = glyph[row]!;
        for (let column = 0; column < 5; column++) {
          if ((bits & (1 << (4 - column))) === 0) continue;
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              this.blend(cursor + column * scale + sx, y + row * scale + sy, color[0], color[1], color[2], color[3] / 255);
            }
          }
        }
      }
      cursor += 6 * scale;
    }
  }

  toPng(): Buffer {
    return encodePng(this.width, this.height, this.data);
  }
}

/** Tile canvases into a labelled contact sheet. */
export function contactSheet(
  panels: Array<{ canvas: Canvas; label: string }>,
  columns: number,
  gap = 10,
  labelHeight = 16,
): Canvas {
  const rows = Math.ceil(panels.length / columns);
  let cellWidth = 0;
  let cellHeight = 0;
  for (const panel of panels) {
    cellWidth = Math.max(cellWidth, panel.canvas.width);
    cellHeight = Math.max(cellHeight, panel.canvas.height);
  }
  const sheet = new Canvas(
    columns * cellWidth + (columns + 1) * gap,
    rows * (cellHeight + labelHeight) + (rows + 1) * gap,
    [12, 13, 16, 255],
  );
  panels.forEach((panel, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = gap + column * (cellWidth + gap);
    const y = gap + row * (cellHeight + labelHeight + gap);
    sheet.text(x, y + 4, panel.label, [200, 205, 215, 255], 1);
    sheet.blit(panel.canvas, x, y + labelHeight);
  });
  return sheet;
}

/** Minimal 5x7 uppercase font; each row is a 5-bit mask, MSB leftmost. */
const FONT: Record<string, number[]> = {
  " ": [0, 0, 0, 0, 0, 0, 0],
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
  N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  "0": [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  "1": [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  "2": [0x0e, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1f],
  "3": [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
  "4": [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  "5": [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  "6": [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  "7": [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  "8": [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  "9": [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  "-": [0x00, 0x00, 0x00, 0x1f, 0x00, 0x00, 0x00],
  "_": [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1f],
  ".": [0x00, 0x00, 0x00, 0x00, 0x00, 0x0c, 0x0c],
  ",": [0x00, 0x00, 0x00, 0x00, 0x0c, 0x04, 0x08],
  ":": [0x00, 0x0c, 0x0c, 0x00, 0x0c, 0x0c, 0x00],
  "/": [0x01, 0x01, 0x02, 0x04, 0x08, 0x10, 0x10],
  "(": [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02],
  ")": [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08],
  "[": [0x0e, 0x08, 0x08, 0x08, 0x08, 0x08, 0x0e],
  "]": [0x0e, 0x02, 0x02, 0x02, 0x02, 0x02, 0x0e],
  "+": [0x00, 0x04, 0x04, 0x1f, 0x04, 0x04, 0x00],
  "=": [0x00, 0x00, 0x1f, 0x00, 0x1f, 0x00, 0x00],
  "%": [0x18, 0x19, 0x02, 0x04, 0x08, 0x13, 0x03],
  "#": [0x0a, 0x0a, 0x1f, 0x0a, 0x1f, 0x0a, 0x0a],
  "?": [0x0e, 0x11, 0x01, 0x02, 0x04, 0x00, 0x04],
  "!": [0x04, 0x04, 0x04, 0x04, 0x04, 0x00, 0x04],
  "<": [0x02, 0x04, 0x08, 0x10, 0x08, 0x04, 0x02],
  ">": [0x08, 0x04, 0x02, 0x01, 0x02, 0x04, 0x08],
  "*": [0x00, 0x0a, 0x04, 0x1f, 0x04, 0x0a, 0x00],
};
