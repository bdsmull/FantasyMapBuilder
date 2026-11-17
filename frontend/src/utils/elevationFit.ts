/**
 * How well a child map's heights fit its parent (#8 phase 2b), and re-base.
 *
 * A child's edge is the part of it inside the blending band. There its heights
 * should meet the parent's own stored heights (not the blended display). The
 * difference (parent - child) at each edge sample gives:
 *   - the mismatch: flagged when the average size of the difference exceeds one
 *     contour band of the parent's scale
 *   - re-base: shift the whole child by the average difference, or by a plane
 *     fitted to the differences ("tilt to match") so a child on a slope leans with it.
 * Re-base changes the child's stored heights; its hand-set marks are kept as they are.
 */

import type { TmjMap } from '../types/tmj';
import type { HeightPatch } from './heightGrid';
import { heightAt } from './heightGrid';
import type { ChildPlacement } from './worldSurface';
import { blendWeight, cellToPixel, sampleCell } from './worldSurface';

export interface EdgeFit {
  /** Edge samples compared. */
  samples: number;
  /** Average of (parent - child), cm: positive = the child sits too low. */
  meanDiffCm: number;
  /** Average size of the difference, cm. */
  meanAbsDiffCm: number;
  /** Best-fit plane of the difference over child cell space: a + b * u + c * v (cm). */
  plane: { a: number; b: number; c: number };
}

/** Compare the child's edge band with the parent's own heights under it. Null without edge samples. */
export function edgeFit(
  child: TmjMap, childPatch: HeightPatch, place: ChildPlacement, parent: TmjMap, parentPatch: HeightPatch,
): EdgeFit | null {
  let n = 0, sum = 0, sumAbs = 0;
  // Normal equations for the plane fit (sums of products of 1, u, v and the difference)
  let su = 0, sv = 0, suu = 0, svv = 0, suv = 0, sd = 0, sud = 0, svd = 0;
  for (let row = 0; row < childPatch.rows; row++) {
    for (let col = 0; col < childPatch.cols; col++) {
      const { u, v } = sampleCell(child, col, row);
      const pu = place.left + u / place.scale, pv = place.top + v / place.scale;
      if (blendWeight(place, pu, pv) >= 1) continue; // interior, not edge
      const p = cellToPixel(parent, pu, pv);
      const d = heightAt(parent, parentPatch, p.x, p.y) - childPatch.cm[row * childPatch.cols + col];
      n++; sum += d; sumAbs += Math.abs(d);
      su += u; sv += v; suu += u * u; svv += v * v; suv += u * v;
      sd += d; sud += u * d; svd += v * d;
    }
  }
  if (n === 0) return null;
  const mean = sum / n;
  return { samples: n, meanDiffCm: mean, meanAbsDiffCm: sumAbs / n, plane: _solvePlane(n, su, sv, suu, svv, suv, sd, sud, svd) ?? { a: mean, b: 0, c: 0 } };
}

/** Least-squares plane via Cramer's rule; null when the samples don't span a plane. */
function _solvePlane(n: number, su: number, sv: number, suu: number, svv: number, suv: number,
  sd: number, sud: number, svd: number): { a: number; b: number; c: number } | null {
  const det3 = (m: number[]) =>
    m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
  const M = [n, su, sv, su, suu, suv, sv, suv, svv];
  const det = det3(M);
  if (Math.abs(det) < 1e-9 * Math.max(1, n * suu * svv)) return null;
  const a = det3([sd, su, sv, sud, suu, suv, svd, suv, svv]) / det;
  const b = det3([n, sd, sv, su, sud, suv, sv, svd, svv]) / det;
  const c = det3([n, su, sd, su, suu, sud, sv, suv, svd]) / det;
  return { a, b, c };
}

/** True when the child's edges are off by more than one contour band of the parent. */
export function isMismatch(fit: EdgeFit | null, parentIntervalCm: number): boolean {
  return !!fit && fit.meanAbsDiffCm > parentIntervalCm;
}

const _clampInt32 = (v: number) => Math.max(-2_147_483_648, Math.min(2_147_483_647, Math.round(v)));

/** The child's heights after re-basing: shifted by the average difference, or by the fitted plane. */
export function rebasedHeights(child: TmjMap, childPatch: HeightPatch, fit: EdgeFit, tilt: boolean): Int32Array {
  const out = new Int32Array(childPatch.cm.length);
  const { a, b, c } = fit.plane;
  for (let row = 0; row < childPatch.rows; row++) {
    for (let col = 0; col < childPatch.cols; col++) {
      const i = row * childPatch.cols + col;
      let shift = fit.meanDiffCm;
      if (tilt) {
        const { u, v } = sampleCell(child, col, row);
        shift = a + b * u + c * v;
      }
      out[i] = _clampInt32(childPatch.cm[i] + shift);
    }
  }
  return out;
}

/** Smallest and largest change re-base would make (cm). */
export function rebaseShiftRange(child: TmjMap, childPatch: HeightPatch, fit: EdgeFit, tilt: boolean): { min: number; max: number } {
  if (!tilt) return { min: fit.meanDiffCm, max: fit.meanDiffCm };
  const { a, b, c } = fit.plane;
  let min = Infinity, max = -Infinity;
  // A plane's extremes are at the corners of the sample grid
  for (const [col, row] of [[0, 0], [childPatch.cols - 1, 0], [0, childPatch.rows - 1], [childPatch.cols - 1, childPatch.rows - 1]]) {
    const { u, v } = sampleCell(child, col, row);
    const s = a + b * u + c * v;
    min = Math.min(min, s); max = Math.max(max, s);
  }
  return { min, max };
}
