/**
 * Heightmaps for game engines (#46): export a map's heights as a 16-bit grid plus the
 * numbers that restore real heights, and import such a grid back onto a map.
 *
 * Engines (Unity, Unreal, Godot terrain plugins) import a grid of 0..65535 steps and
 * a vertical range. The grid here covers the map's height samples:
 *   - square maps: the cell-corner samples, (width + 1) x (height + 1), as they are;
 *   - hex maps: a square grid over the hex centres, one sample per cell each way
 *     (engines can't read staggered hex rows).
 * "2ⁿ + 1" resamples that grid to a square size Unity requires (33 … 4097), stretched to
 * fit; the engine terrain is then set to the map's real width and length.
 *
 * Rows run top (north) first, columns left (west) first. Positions are in cell space
 * (see worldSurface.ts): one unit is one cell, which is `mpu` meters along either axis.
 */

import type { TmjMap } from '../types/tmj';
import type { HeightPatch } from './heightGrid';
import { heightAt, sampleGrid } from './heightGrid';
import { cellToPixel, sampleCell } from './worldSurface';

export const HEIGHTMAP_STEPS = 65535;
export const POW2_MIN = 33;
export const POW2_MAX = 4097;

export type HeightmapFormat = 'png' | 'raw';
export type HeightmapSize = 'native' | 'pow2';

/** The cell-space rectangle a map's heightmap spans, from its first sample to its last. */
export interface HeightmapFrame { u0: number; v0: number; u1: number; v1: number }

export function heightmapFrame(map: TmjMap): HeightmapFrame {
  return map.orientation === 'hexagonal'
    ? { u0: 0.5, v0: 0.5, u1: Math.max(map.width - 0.5, 0.5), v1: Math.max(map.height - 0.5, 0.5) }
    : { u0: 0, v0: 0, u1: map.width, v1: map.height };
}

/** The smallest 2ⁿ + 1 that holds `n` samples, within 33 … 4097. */
export function pow2Side(n: number): number {
  let side = POW2_MIN;
  while (side < n && side < POW2_MAX) side = (side - 1) * 2 + 1;
  return side;
}

/** Heightmap size (samples) for a map. */
export function heightmapSize(map: TmjMap, size: HeightmapSize): { cols: number; rows: number } {
  const native = map.orientation === 'hexagonal'
    ? { cols: map.width, rows: map.height }
    : sampleGrid(map);
  if (size === 'native') return native;
  const side = pow2Side(Math.max(native.cols, native.rows));
  return { cols: side, rows: side };
}

/** A heightmap's size and real spacing. */
export interface HeightmapLayout {
  cols: number;
  rows: number;
  /** Meters between neighbouring samples, across and down. */
  spacingXM: number;
  spacingYM: number;
  /** Meters from the first sample to the last, across and down. */
  widthM: number;
  heightM: number;
}

/** Heights sampled for export, in cm (fractional). */
export interface HeightmapGrid extends HeightmapLayout {
  cm: Float64Array;
}

/** Size and spacing of a map's heightmap, without sampling it. */
export function heightmapLayout(map: TmjMap, size: HeightmapSize, mpu: number): HeightmapLayout {
  const { cols, rows } = heightmapSize(map, size);
  const frame = heightmapFrame(map);
  const widthM = (frame.u1 - frame.u0) * mpu;
  const heightM = (frame.v1 - frame.v0) * mpu;
  return {
    cols, rows, widthM, heightM,
    spacingXM: cols > 1 ? widthM / (cols - 1) : 0,
    spacingYM: rows > 1 ? heightM / (rows - 1) : 0,
  };
}

const _at = (frame: HeightmapFrame, i: number, n: number, axis: 'u' | 'v') => {
  const a = axis === 'u' ? frame.u0 : frame.v0;
  const b = axis === 'u' ? frame.u1 : frame.v1;
  return n > 1 ? a + (i * (b - a)) / (n - 1) : (a + b) / 2;
};

/** Sample a map's heights (or its assembled surface) onto the export grid. */
export function sampleHeightmap(map: TmjMap, patch: HeightPatch, size: HeightmapSize, mpu: number): HeightmapGrid {
  const layout = heightmapLayout(map, size, mpu);
  const { cols, rows } = layout;
  const frame = heightmapFrame(map);
  const cm = new Float64Array(cols * rows);
  if (size === 'native' && map.orientation !== 'hexagonal') {
    cm.set(patch.cm); // the corner samples themselves
  } else {
    for (let j = 0; j < rows; j++) {
      const v = _at(frame, j, rows, 'v');
      for (let i = 0; i < cols; i++) {
        const p = cellToPixel(map, _at(frame, i, cols, 'u'), v);
        cm[j * cols + i] = heightAt(map, patch, p.x, p.y);
      }
    }
  }
  return { ...layout, cm };
}

/** Lowest and highest heights of a grid (cm, rounded outwards to whole cm). */
export function gridRange(grid: { cm: ArrayLike<number> }): { minCm: number; maxCm: number } {
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < grid.cm.length; i++) {
    const v = grid.cm[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return Number.isFinite(min) ? { minCm: Math.floor(min), maxCm: Math.ceil(max) } : { minCm: 0, maxCm: 0 };
}

export interface Quantized {
  steps: Uint16Array;
  minCm: number;
  maxCm: number;
  /** Meters per step (0 when the range is flat). */
  metersPerStep: number;
  /** Samples outside the range, clamped to its ends. */
  clipped: number;
}

/** Heights -> 0 … 65535 steps across [minCm, maxCm]. */
export function quantize(grid: { cm: ArrayLike<number> }, range: { minCm: number; maxCm: number }): Quantized {
  const { minCm, maxCm } = range;
  const span = maxCm - minCm;
  const steps = new Uint16Array(grid.cm.length);
  let clipped = 0;
  for (let i = 0; i < grid.cm.length; i++) {
    const v = grid.cm[i];
    if (v < minCm - 0.5 || v > maxCm + 0.5) clipped++;
    steps[i] = span > 0 ? Math.round(Math.min(Math.max((v - minCm) / span, 0), 1) * HEIGHTMAP_STEPS) : 0;
  }
  return { steps, minCm, maxCm, metersPerStep: span > 0 ? span / 100 / HEIGHTMAP_STEPS : 0, clipped };
}

/** Little-endian 16-bit RAW (Unity's "Windows" byte order, Unreal's .r16). */
export function rawBytes(steps: Uint16Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(steps.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < steps.length; i++) view.setUint16(i * 2, steps[i], true);
  return out;
}

/** The numbers an engine needs, written beside the image (and inside a PNG). */
export interface HeightmapInfo {
  map: string;
  format: HeightmapFormat;
  width: number;
  height: number;
  minM: number;
  maxM: number;
  metersPerStep: number;
  spacingXM: number;
  spacingYM: number;
  widthM: number;
  heightM: number;
  rowOrder: 'top-first';
  byteOrder?: 'little-endian';
  assembled?: boolean;
}

export function heightmapInfo(
  mapName: string, format: HeightmapFormat, grid: HeightmapLayout, q: Quantized, assembled: boolean,
): HeightmapInfo {
  const r = (v: number, d = 1e6) => Math.round(v * d) / d;
  return {
    map: mapName,
    format,
    width: grid.cols,
    height: grid.rows,
    minM: q.minCm / 100,
    maxM: q.maxCm / 100,
    metersPerStep: r(q.metersPerStep, 1e9),
    spacingXM: r(grid.spacingXM),
    spacingYM: r(grid.spacingYM),
    widthM: r(grid.widthM),
    heightM: r(grid.heightM),
    rowOrder: 'top-first',
    ...(format === 'raw' ? { byteOrder: 'little-endian' as const } : {}),
    ...(assembled ? { assembled: true } : {}),
  };
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/** A heightmap read from a file: fractions 0 … 1 of its range, row-major, top row first. */
export interface HeightmapSource {
  width: number;
  height: number;
  fractions: Float32Array;
}

/** Fractions from unpacked samples (see the server's decode: u8, u16 or f32). */
export function samplesToFractions(buffer: ArrayBuffer, sample: 'u8' | 'u16' | 'f32'): Float32Array {
  const view = new DataView(buffer);
  if (sample === 'u8') {
    const bytes = new Uint8Array(buffer);
    return Float32Array.from(bytes, (b) => b / 255);
  }
  const n = buffer.byteLength / (sample === 'u16' ? 2 : 4);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = sample === 'u16' ? view.getUint16(i * 2, true) / HEIGHTMAP_STEPS : view.getFloat32(i * 4, true);
  }
  return out;
}

/** A square size for a headerless 16-bit RAW file, or null if it isn't square. */
export function guessRawSide(byteLength: number): number | null {
  if (byteLength % 2) return null;
  const side = Math.round(Math.sqrt(byteLength / 2));
  return side > 0 && side * side * 2 === byteLength ? side : null;
}

/** A 16-bit RAW file as a heightmap source. */
export function rawSource(bytes: ArrayBuffer, width: number, height: number, littleEndian = true): HeightmapSource | null {
  if (width < 1 || height < 1 || bytes.byteLength !== width * height * 2) return null;
  const view = new DataView(bytes);
  const fractions = new Float32Array(width * height);
  for (let i = 0; i < fractions.length; i++) fractions[i] = view.getUint16(i * 2, littleEndian) / HEIGHTMAP_STEPS;
  return { width, height, fractions };
}

/** Bilinear read of a source at fractional sample position (x, y), clamped to its edges. */
function _sourceAt(src: HeightmapSource, x: number, y: number): number {
  const fx = Math.min(Math.max(x, 0), src.width - 1);
  const fy = Math.min(Math.max(y, 0), src.height - 1);
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, src.width - 1), y1 = Math.min(y0 + 1, src.height - 1);
  const tx = fx - x0, ty = fy - y0;
  const f = src.fractions, w = src.width;
  return (f[y0 * w + x0] * (1 - tx) + f[y0 * w + x1] * tx) * (1 - ty)
    + (f[y1 * w + x0] * (1 - tx) + f[y1 * w + x1] * tx) * ty;
}

export interface ImportResult {
  cm: Int32Array;
  mask: Uint8Array;
  /** Samples whose height (or hand-set mark) changed. */
  changed: number;
  /** Hand-set samples left as they were. */
  kept: number;
}

/**
 * Lay a heightmap over the whole map (stretched to fit, like an engine terrain) and
 * turn it into heights across [minCm, maxCm]. Hand-set samples keep their height
 * when `keepHandSet`; otherwise they take the imported one and lose their mark.
 */
export function importHeightmap(
  map: TmjMap, patch: HeightPatch, src: HeightmapSource,
  range: { minCm: number; maxCm: number }, keepHandSet: boolean,
): ImportResult {
  const frame = heightmapFrame(map);
  const du = frame.u1 - frame.u0 || 1, dv = frame.v1 - frame.v0 || 1;
  const hex = map.orientation === 'hexagonal';
  const cm = patch.cm.slice();
  const mask = patch.mask.slice();
  let changed = 0, kept = 0;
  for (let row = 0; row < patch.rows; row++) {
    for (let col = 0; col < patch.cols; col++) {
      const i = row * patch.cols + col;
      if (keepHandSet && patch.mask[i]) { kept++; continue; }
      const { u, v } = hex ? sampleCell(map, col, row) : { u: col, v: row };
      const f = _sourceAt(src, ((u - frame.u0) / du) * (src.width - 1), ((v - frame.v0) / dv) * (src.height - 1));
      const value = Math.round(range.minCm + f * (range.maxCm - range.minCm));
      if (value !== cm[i] || mask[i]) changed++;
      cm[i] = value;
      mask[i] = 0;
    }
  }
  return { cm, mask, changed, kept };
}
