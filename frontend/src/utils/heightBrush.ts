/**
 * Height brush: one "dab" of the Height tool applied to a height patch.
 *
 * Distances are measured in cells: on square maps along each axis's tile size,
 * on hex maps in centre-to-centre spacing (the hex's flat-to-flat width), so a
 * radius of 1 reaches the neighbouring samples. Every sample the brush changes is
 * marked hand-set in the edit mask; "release" only clears that mark.
 */

import type { TmjMap } from '../types/tmj';
import type { HeightPatch, CellRect } from './heightGrid';
import { hexNeighbours } from './heightGrid';
import { hexLayout, hexCenter } from '../canvas/hexGeometry';

/**
 * 'spot' places and selects spot heights, 'contour' draws and edits contour lines,
 * instead of painting (see utils/spotHeights.ts and utils/contours.ts). Lakes and seas
 * have a tool of their own (Water).
 */
export type HeightBrushMode = 'raise' | 'lower' | 'set' | 'smooth' | 'release' | 'spot' | 'contour';

/** Modes that place or edit marks instead of painting heights. */
export const MARK_MODES: HeightBrushMode[] = ['spot', 'contour'];

export interface HeightBrush {
  mode: HeightBrushMode;
  /** Radius in cells (at least 0.5). */
  radius: number;
  /** Raise/lower amount per dab at the brush centre, in cm. */
  strengthCm: number;
  /** Height that "set" flattens to, and new spot heights get, in cm. */
  targetCm: number;
  /** Reach of new spot heights, in cells (default DEFAULT_REACH_CELLS). */
  spotReachCells?: number;
  /** Height of new contour lines, in cm (default: the Set target). */
  contourCm?: number;
  /** Reach of new contour lines, in cells (default DEFAULT_REACH_CELLS). */
  contourReachCells?: number;
  /** Surface height of new water bodies (Water tool), in cm (default: the Set target). */
  waterCm?: number;
}

export const DEFAULT_HEIGHT_BRUSH: HeightBrush = { mode: 'raise', radius: 2, strengthCm: 100, targetCm: 0 };

/**
 * Samples within this fraction of a cell of the brush edge count as outside. Hex
 * centres aren't exactly equidistant (tile sizes are rounded to whole pixels), so
 * without it a radius of 1 would catch some neighbours but not others.
 */
const EDGE_TOLERANCE = 0.05;

const INT32_MIN = -2_147_483_648;
const INT32_MAX = 2_147_483_647;
const _clamp = (v: number) => Math.min(INT32_MAX, Math.max(INT32_MIN, Math.round(v)));

/** Soft falloff: 1 at the centre, 0 at the radius. */
export function falloff(d: number, radius: number): number {
  if (d >= radius) return 0;
  const t = d / radius;
  return (1 - t * t) * (1 - t * t);
}

interface Sample { index: number; d: number; col: number; row: number }

/** Samples within `radius` cells of map pixel (x, y). */
function samplesInBrush(map: TmjMap, patch: HeightPatch, x: number, y: number, radius: number): Sample[] {
  const result: Sample[] = [];
  if (map.orientation === 'hexagonal') {
    const layout = hexLayout(map);
    const unit = Math.min(layout.tileWidth, layout.tileHeight) || 1;
    const colStep = layout.staggerX ? layout.columnWidth : layout.tileWidth + layout.sideLengthX;
    const rowStep = layout.staggerX ? layout.tileHeight + layout.sideLengthY : layout.rowHeight;
    const reach = radius * unit;
    const c0 = Math.max(0, Math.floor((x - reach) / colStep) - 1);
    const c1 = Math.min(patch.cols - 1, Math.ceil((x + reach) / colStep) + 1);
    const r0 = Math.max(0, Math.floor((y - reach) / rowStep) - 1);
    const r1 = Math.min(patch.rows - 1, Math.ceil((y + reach) / rowStep) + 1);
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const c = hexCenter(layout, col, row);
        const d = Math.hypot(c.x - x, c.y - y) / unit;
        if (d < radius - EDGE_TOLERANCE) result.push({ index: row * patch.cols + col, d, col, row });
      }
    }
  } else {
    const fx = x / map.tilewidth;
    const fy = y / map.tileheight;
    const c0 = Math.max(0, Math.floor(fx - radius));
    const c1 = Math.min(patch.cols - 1, Math.ceil(fx + radius));
    const r0 = Math.max(0, Math.floor(fy - radius));
    const r1 = Math.min(patch.rows - 1, Math.ceil(fy + radius));
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const d = Math.hypot(col - fx, row - fy);
        if (d < radius - EDGE_TOLERANCE) result.push({ index: row * patch.cols + col, d, col, row });
      }
    }
  }
  return result;
}

function _neighbourAverage(map: TmjMap, patch: HeightPatch, col: number, row: number, snapshot: Int32Array): number {
  let sum = 0, n = 0;
  if (map.orientation === 'hexagonal') {
    for (const nb of hexNeighbours(map, col, row)) { sum += snapshot[nb.row * patch.cols + nb.col]; n++; }
  } else {
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const c = col + dc, r = row + dr;
      if (c >= 0 && r >= 0 && c < patch.cols && r < patch.rows) { sum += snapshot[r * patch.cols + c]; n++; }
    }
  }
  return n ? sum / n : snapshot[row * patch.cols + col];
}

/**
 * Apply one dab at map pixel (x, y), mutating the patch. `beforeChange(index)` is
 * called once per sample about to change (so the caller can record undo data).
 * Returns the changed samples' bounding box, or null if nothing changed.
 */
export function applyDab(
  map: TmjMap,
  patch: HeightPatch,
  x: number,
  y: number,
  brush: HeightBrush,
  beforeChange: (index: number) => void,
): CellRect | null {
  if (MARK_MODES.includes(brush.mode)) return null; // these modes don't paint
  const radius = Math.max(0.5, brush.radius);
  const samples = samplesInBrush(map, patch, x, y, radius);
  const snapshot = brush.mode === 'smooth' ? patch.cm.slice() : patch.cm;
  let rect: CellRect | null = null;

  for (const s of samples) {
    const oldCm = patch.cm[s.index];
    const oldMask = patch.mask[s.index];
    let newCm = oldCm;
    switch (brush.mode) {
      case 'raise': newCm = _clamp(oldCm + brush.strengthCm * falloff(s.d, radius)); break;
      case 'lower': newCm = _clamp(oldCm - brush.strengthCm * falloff(s.d, radius)); break;
      case 'set': newCm = _clamp(brush.targetCm); break;
      case 'smooth': {
        const avg = _neighbourAverage(map, patch, s.col, s.row, snapshot);
        newCm = _clamp(oldCm + (avg - oldCm) * 0.5 * falloff(s.d, radius));
        break;
      }
      case 'release': break;
    }
    // Set protects every sample it covers (an explicit value, even if unchanged);
    // raise/lower/smooth only the ones they actually change; release unprotects.
    const newMask = brush.mode === 'release' ? 0 : brush.mode === 'set' || newCm !== oldCm ? 1 : oldMask;
    if (newCm === oldCm && newMask === oldMask) continue;
    beforeChange(s.index);
    patch.cm[s.index] = newCm;
    patch.mask[s.index] = newMask;
    rect = rect
      ? { c0: Math.min(rect.c0, s.col), r0: Math.min(rect.r0, s.row), c1: Math.max(rect.c1, s.col), r1: Math.max(rect.r1, s.row) }
      : { c0: s.col, r0: s.row, c1: s.col, r1: s.row };
  }
  return rect;
}

/** Distance between two map-pixel points in cells, for dab spacing during a drag. */
export function cellDistance(map: TmjMap, a: { x: number; y: number }, b: { x: number; y: number }): number {
  if (map.orientation === 'hexagonal') {
    const layout = hexLayout(map);
    return Math.hypot(a.x - b.x, a.y - b.y) / (Math.min(layout.tileWidth, layout.tileHeight) || 1);
  }
  return Math.hypot((a.x - b.x) / map.tilewidth, (a.y - b.y) / map.tileheight);
}
