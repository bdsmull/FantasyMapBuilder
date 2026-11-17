/**
 * Spot heights (#8 phase 3c): known heights at points, e.g. a summit or a ford.
 *
 * Stored as Tiled point objects of type "spot height" with custom properties
 * `height` (float, meters) and `reach` (float, cells), in an object layer (the
 * editor creates "Spot heights" on first use). Tiled and game exports can read them.
 *
 * "Fit to spot heights" bends the current surface so it passes through each spot,
 * keeping its shape (terrain, generated detail, painting): the difference at each
 * spot is spread smoothly over the spot's reach and fades to nothing at its edge.
 * The bend is an interpolating radial-basis correction with a compactly supported
 * kernel (Wendland C2), so spots stay exact even when their reaches overlap.
 * Hand-set heights are kept.
 */

import type { TmjMap, TmjObject, TmjProperty } from '../types/tmj';
import { isObjectLayer } from '../types/tmj';
import type { HeightPatch } from './heightGrid';
import { heightAt } from './heightGrid';
import { pixelToCell, sampleCell } from './worldSurface';

export const SPOT_TYPE = 'spot height';
export const SPOT_LAYER = 'Spot heights';
export const SPOT_HEIGHT_PROPERTY = 'height';
export const SPOT_REACH_PROPERTY = 'reach';
export const DEFAULT_REACH_CELLS = 10;
export const MIN_REACH_CELLS = 0.5;

export interface Spot {
  id: number;
  layerIndex: number;
  name: string;
  x: number;
  y: number;
  cm: number;
  reachCells: number;
}

function _num(props: TmjProperty[] | undefined, name: string): number | null {
  const v = props?.find((p) => p.name === name)?.value;
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Whether an object is a spot height (a point of type "spot height" with a height). */
export function isSpot(o: TmjObject): boolean {
  return o.type === SPOT_TYPE && _num(o.properties, SPOT_HEIGHT_PROPERTY) !== null;
}

/** All spot heights on the map, from every object layer. */
export function readSpots(map: TmjMap): Spot[] {
  const spots: Spot[] = [];
  map.layers.forEach((layer, layerIndex) => {
    if (!isObjectLayer(layer)) return;
    for (const o of layer.objects) {
      if (!isSpot(o)) continue;
      spots.push({
        id: o.id, layerIndex, name: o.name, x: o.x, y: o.y,
        cm: Math.round(_num(o.properties, SPOT_HEIGHT_PROPERTY)! * 100),
        reachCells: Math.max(MIN_REACH_CELLS, _num(o.properties, SPOT_REACH_PROPERTY) ?? DEFAULT_REACH_CELLS),
      });
    }
  });
  return spots;
}

/** A spot height object's properties for a height (cm) and reach (cells), keeping any others. */
export function spotProperties(existing: TmjProperty[] | undefined, cm: number, reachCells: number): TmjProperty[] {
  const rest = (existing ?? []).filter((p) => p.name !== SPOT_HEIGHT_PROPERTY && p.name !== SPOT_REACH_PROPERTY);
  return [
    ...rest,
    { name: SPOT_HEIGHT_PROPERTY, type: 'float', value: cm / 100 },
    { name: SPOT_REACH_PROPERTY, type: 'float', value: Math.max(MIN_REACH_CELLS, reachCells) },
  ];
}

/** The spot nearest (x, y) within `radius` map pixels, or null. */
export function spotNear(spots: Spot[], x: number, y: number, radius: number): Spot | null {
  let best: Spot | null = null, bestD = radius;
  for (const s of spots) {
    const d = Math.hypot(s.x - x, s.y - y);
    if (d <= bestD) { best = s; bestD = d; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Fitting
// ---------------------------------------------------------------------------

/** Wendland C2 kernel: 1 at t = 0, smoothly 0 at t >= 1. */
const _kernel = (t: number) => (t >= 1 ? 0 : (1 - t) ** 4 * (4 * t + 1));

/** Solve A x = b by Gaussian elimination with partial pivoting (A is n x n, row-major). */
function _solve(A: Float64Array, b: Float64Array, n: number): Float64Array {
  const M = A.slice(), x = b.slice();
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(M[i * n + k]) > Math.abs(M[p * n + k])) p = i;
    if (p !== k) {
      for (let j = 0; j < n; j++) [M[k * n + j], M[p * n + j]] = [M[p * n + j], M[k * n + j]];
      [x[k], x[p]] = [x[p], x[k]];
    }
    const piv = M[k * n + k] || 1e-12;
    for (let i = k + 1; i < n; i++) {
      const f = M[i * n + k] / piv;
      if (f === 0) continue;
      for (let j = k; j < n; j++) M[i * n + j] -= f * M[k * n + j];
      x[i] -= f * x[k];
    }
  }
  for (let k = n - 1; k >= 0; k--) {
    let s = x[k];
    for (let j = k + 1; j < n; j++) s -= M[k * n + j] * x[j];
    x[k] = s / (M[k * n + k] || 1e-12);
  }
  return x;
}

export interface FitResult {
  cm: Int32Array;
  /** Samples that moved. */
  changed: number;
  /** Largest remaining difference at a spot (cm), e.g. where hand-set heights hold the surface. */
  maxMissCm: number;
}

/** A tiny diagonal boost so spots at the same place (or nearly) don't make the system singular. */
const _RIDGE = 1e-9;
/** Re-measuring after a fit corrects for interpolation between samples; a few rounds converge. */
const _ROUNDS = 4;

/** Bend the surface so it passes through every spot. */
export function fitToSpots(map: TmjMap, patch: HeightPatch, spots: Spot[]): FitResult {
  const { cols, rows } = patch;
  const out = patch.cm.slice();
  const n = spots.length;
  if (n === 0) return { cm: out, changed: 0, maxMissCm: 0 };
  const at = spots.map((s) => pixelToCell(map, s.x, s.y));
  // Kernel matrix: spot j's influence at spot i
  const A = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      A[i * n + j] = _kernel(Math.hypot(at[i].u - at[j].u, at[i].v - at[j].v) / spots[j].reachCells) + (i === j ? _RIDGE : 0);
    }
  }
  // Each round: measure what's left at the spots, spread a correction, apply it
  const total = new Float64Array(out.length);
  const working = { cols, rows, cm: out, mask: patch.mask };
  let maxMiss = 0;
  for (let round = 0; round < _ROUNDS; round++) {
    const residual = new Float64Array(n);
    maxMiss = 0;
    for (let i = 0; i < n; i++) {
      residual[i] = spots[i].cm - heightAt(map, working, spots[i].x, spots[i].y);
      maxMiss = Math.max(maxMiss, Math.abs(residual[i]));
    }
    if (maxMiss < 0.5) break; // within half a centimetre
    const c = _solve(A, residual, n);
    for (let j = 0; j < n; j++) {
      if (c[j] === 0) continue;
      const R = spots[j].reachCells;
      // Samples within reach: a box in cell space (hex centres sit up to half a row lower)
      const c0 = Math.max(0, Math.floor(at[j].u - R - 1)), c1 = Math.min(cols - 1, Math.ceil(at[j].u + R + 1));
      const r0 = Math.max(0, Math.floor(at[j].v - R - 1)), r1 = Math.min(rows - 1, Math.ceil(at[j].v + R + 1));
      for (let row = r0; row <= r1; row++) {
        for (let col = c0; col <= c1; col++) {
          const i = row * cols + col;
          if (patch.mask[i]) continue;
          const s = sampleCell(map, col, row);
          const w = _kernel(Math.hypot(s.u - at[j].u, s.v - at[j].v) / R);
          if (w === 0) continue;
          total[i] += c[j] * w;
        }
      }
    }
    for (let i = 0; i < out.length; i++) {
      if (total[i] !== 0) out[i] = Math.max(-2_147_483_648, Math.min(2_147_483_647, Math.round(patch.cm[i] + total[i])));
    }
  }
  // What's left after the last round
  maxMiss = 0;
  for (const s of spots) maxMiss = Math.max(maxMiss, Math.abs(s.cm - heightAt(map, working, s.x, s.y)));
  let changed = 0;
  for (let i = 0; i < out.length; i++) if (out[i] !== patch.cm[i]) changed++;
  return { cm: out, changed, maxMissCm: maxMiss };
}
