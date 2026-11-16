/**
 * Map elevation ("height patch"): pure helpers for the sample grid, interpolation,
 * contour bands, colors and display.
 *
 * Heights are absolute whole centimeters (int32). They are sampled at cell corners
 * on square maps ((width + 1) x (height + 1)) and at cell centres on hex maps
 * (width x height), row-major. The edit mask marks values set by hand (1).
 * Storage and transfer: see server/heights.py.
 */

import type { TmjMap } from '../types/tmj';
import { hexLayout, hexCenter, pixelToHex } from '../canvas/hexGeometry';
import type { UnitSystem } from '../data/mapScales';

export interface HeightPatch {
  cols: number;
  rows: number;
  /** Absolute heights in whole centimeters, row-major. */
  cm: Int32Array;
  /** 1 where a value was set by hand (protected from regeneration). */
  mask: Uint8Array;
}

/** Tiled custom property (type "file") linking a map to its height patch. */
export const HEIGHTS_PROPERTY = 'heights';

export function heightsPropertyValue(mapName: string): string {
  return `../heights/${mapName}.tif`;
}

export function hasHeightsProperty(map: TmjMap): boolean {
  return (map.properties ?? []).some((p) => p.name === HEIGHTS_PROPERTY && p.value);
}

/** Size of a map's height sample grid. */
export function sampleGrid(map: Pick<TmjMap, 'orientation' | 'width' | 'height'>): { cols: number; rows: number } {
  return map.orientation === 'hexagonal'
    ? { cols: map.width, rows: map.height }
    : { cols: map.width + 1, rows: map.height + 1 };
}

/** A new patch with every sample at `cm`. */
export function createPatch(map: TmjMap, cm: number): HeightPatch {
  const { cols, rows } = sampleGrid(map);
  return { cols, rows, cm: new Int32Array(cols * rows).fill(Math.round(cm)), mask: new Uint8Array(cols * rows) };
}

const _sample = (p: HeightPatch, col: number, row: number) => p.cm[row * p.cols + col];

/** Height range (cm) of a patch. */
export function patchRange(p: HeightPatch): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const v of p.cm) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

// ---------------------------------------------------------------------------
// Interpolation
// ---------------------------------------------------------------------------

/** Height (cm, fractional) at a square-map pixel: bilinear between the 4 cell corners. */
function squareHeightAt(map: TmjMap, p: HeightPatch, x: number, y: number): number {
  const fx = Math.min(Math.max(x / map.tilewidth, 0), p.cols - 1);
  const fy = Math.min(Math.max(y / map.tileheight, 0), p.rows - 1);
  const c0 = Math.min(Math.floor(fx), p.cols - 2);
  const r0 = Math.min(Math.floor(fy), p.rows - 2);
  const tx = fx - Math.max(c0, 0);
  const ty = fy - Math.max(r0, 0);
  if (p.cols < 2 || p.rows < 2) return _sample(p, 0, 0);
  const h00 = _sample(p, c0, r0), h10 = _sample(p, c0 + 1, r0);
  const h01 = _sample(p, c0, r0 + 1), h11 = _sample(p, c0 + 1, r0 + 1);
  return (h00 * (1 - tx) + h10 * tx) * (1 - ty) + (h01 * (1 - tx) + h11 * tx) * ty;
}

/** Neighbouring hex centres around (col, row), sorted by angle. */
export function hexNeighbours(map: TmjMap, col: number, row: number): { col: number; row: number; x: number; y: number }[] {
  const layout = hexLayout(map);
  const c = hexCenter(layout, col, row);
  const reach = 1.5 * Math.max(layout.tileWidth, layout.tileHeight);
  const found = [];
  for (let dc = -1; dc <= 1; dc++) {
    for (let dr = -1; dr <= 1; dr++) {
      const nc = col + dc, nr = row + dr;
      if ((dc === 0 && dr === 0) || nc < 0 || nr < 0 || nc >= map.width || nr >= map.height) continue;
      const n = hexCenter(layout, nc, nr);
      const d = Math.hypot(n.x - c.x, n.y - c.y);
      if (d <= reach) found.push({ col: nc, row: nr, x: n.x, y: n.y, d });
    }
  }
  return found
    .sort((a, b) => a.d - b.d)
    .slice(0, 6)
    .sort((a, b) => Math.atan2(a.y - c.y, a.x - c.x) - Math.atan2(b.y - c.y, b.x - c.x));
}

/** Height (cm) at a hex-map pixel: interpolated in the triangle of the hex centre and two neighbours. */
function hexHeightAt(map: TmjMap, p: HeightPatch, x: number, y: number): number {
  const layout = hexLayout(map);
  const { col, row } = pixelToHex(layout, x, y, map.width, map.height);
  const c = hexCenter(layout, col, row);
  const hc = _sample(p, col, row);
  const ns = hexNeighbours(map, col, row);
  for (let i = 0; i < ns.length; i++) {
    const a = ns[i];
    const b = ns[(i + 1) % ns.length];
    // Barycentric coordinates of (x, y) in triangle (c, a, b)
    const det = (a.y - b.y) * (c.x - b.x) + (b.x - a.x) * (c.y - b.y);
    if (Math.abs(det) < 1e-9) continue;
    const w1 = ((a.y - b.y) * (x - b.x) + (b.x - a.x) * (y - b.y)) / det;
    const w2 = ((b.y - c.y) * (x - b.x) + (c.x - b.x) * (y - b.y)) / det;
    const w3 = 1 - w1 - w2;
    if (w1 >= -1e-9 && w2 >= -1e-9 && w3 >= -1e-9) {
      return w1 * hc + w2 * _sample(p, a.col, a.row) + w3 * _sample(p, b.col, b.row);
    }
  }
  return hc; // map edge: no surrounding triangle
}

/** Height (cm, fractional) at a map pixel position. */
export function heightAt(map: TmjMap, p: HeightPatch, x: number, y: number): number {
  return map.orientation === 'hexagonal' ? hexHeightAt(map, p, x, y) : squareHeightAt(map, p, x, y);
}

// ---------------------------------------------------------------------------
// Bands, colors, formatting
// ---------------------------------------------------------------------------

const _BAND_METERS: Record<string, number> = {
  room: 1, battle: 1, dungeon: 2, site: 5, town: 10, city: 25,
  local: 50, province: 100, kingdom: 250, continent: 250, world: 500,
};
const _BAND_FEET: Record<string, number> = {
  room: 2, battle: 5, dungeon: 5, site: 10, town: 25, city: 50,
  local: 100, province: 250, kingdom: 500, continent: 1000, world: 1000,
};

/** Contour band spacing in cm, chosen from the map's scale and shown units. */
export function bandIntervalCm(scaleId: string | undefined, units: UnitSystem): number {
  if (units === 'imperial') return (_BAND_FEET[scaleId ?? ''] ?? 25) * 30.48;
  return (_BAND_METERS[scaleId ?? ''] ?? 10) * 100;
}

type Rgb = [number, number, number];

// Hypsometric tints: heights in meters.
const _WATER: [number, Rgb][] = [[-8000, [8, 24, 70]], [-2000, [27, 72, 150]], [-200, [64, 130, 205]], [0, [150, 205, 240]]];
const _LAND: [number, Rgb][] = [
  [0, [70, 140, 70]], [300, [145, 190, 95]], [800, [225, 215, 135]],
  [1500, [195, 155, 105]], [2500, [140, 105, 75]], [4000, [185, 178, 170]], [6000, [255, 255, 255]],
];

function _lerpStops(stops: [number, Rgb][], v: number): Rgb {
  if (v <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [h1, c1] = stops[i];
    if (v <= h1) {
      const [h0, c0] = stops[i - 1];
      const t = (v - h0) / (h1 - h0);
      return [0, 1, 2].map((k) => Math.round(c0[k] + (c1[k] - c0[k]) * t)) as Rgb;
    }
  }
  return stops[stops.length - 1][1];
}

/** Maps with less relief than this get the palette stretched over their own range. */
export const RELATIVE_COLOR_RANGE_CM = 50_000;

/**
 * Color for a height (cm). Uses absolute hypsometric tints when the map spans more
 * than 500 m or reaches below sea level; otherwise stretches the land palette over
 * the map's own range so small relief stays visible.
 */
export function heightColor(cm: number, range: { min: number; max: number }): Rgb {
  const absolute = range.max - range.min > RELATIVE_COLOR_RANGE_CM || range.min < 0;
  if (absolute) return cm < 0 ? _lerpStops(_WATER, cm / 100) : _lerpStops(_LAND, cm / 100);
  const span = Math.max(range.max - range.min, 1);
  return _lerpStops(_LAND, ((cm - range.min) / span) * 4000);
}

/** Band index of a height (whole bands of `intervalCm`). */
export function bandOf(cm: number, intervalCm: number): number {
  return Math.floor(cm / intervalCm);
}

/** Human-readable height in the map's units, e.g. "1,240.5 m" or "4,068 ft". */
export function formatHeight(cm: number, units: UnitSystem): string {
  if (units === 'imperial') {
    const ft = cm / 30.48;
    return `${ft.toLocaleString('en-US', { maximumFractionDigits: Math.abs(ft) < 100 ? 1 : 0 })} ft`;
  }
  const m = cm / 100;
  return `${m.toLocaleString('en-US', { maximumFractionDigits: Math.abs(m) < 100 ? 2 : 1 })} m`;
}

/** Parse a height typed in the map's units ("1240", "1,240.5") to whole cm; null if invalid. */
export function parseHeightToCm(text: string, units: UnitSystem): number | null {
  const v = Number(text.replace(/,/g, '').trim());
  if (!Number.isFinite(v) || text.trim() === '') return null;
  const cm = Math.round(units === 'imperial' ? v * 30.48 : v * 100);
  return Math.abs(cm) <= 2_147_483_647 ? cm : null;
}
