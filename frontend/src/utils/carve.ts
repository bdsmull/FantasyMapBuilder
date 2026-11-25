/**
 * Carving drawn rivers into the heights (#8 phase 4), so the ground and the drawn
 * rivers agree and derived flow follows them.
 *
 * Along each water line (River, Stream, Brook, Canal, …) the bed is the ground along
 * the line minus a depth from the river's width (a tenth of the width, 0.3 m to 5 m),
 * made to fall all the way from the higher end to the lower one (it never rises
 * downstream). Every height sample within half the river's width of the line, and at
 * least the nearest ones on a coarse map, is lowered to the bed where it's higher.
 * Nothing is ever raised. Hand-set heights are kept (unless asked otherwise, for views).
 */

import type { TmjMap } from '../types/tmj';
import type { HeightPatch } from './heightGrid';
import { heightAt } from './heightGrid';
import { canonicalSample, shiftsOnto, turnPx } from './worldWrap';
import type { LineRef, Pt } from './lines';
import { linePoints, readWidths, pixelsPerMeter } from './lines';
import type { LineClass } from '../data/lineClasses';
import { classForType } from '../data/lineClasses';
import { pixelToCell } from './worldSurface';
import { samplePixels } from './flow';

/** Channel depth for a river width, meters. */
export function riverDepthM(widthM: number): number {
  return Math.min(5, Math.max(0.3, widthM / 10));
}

/** The water lines among `lines` (by their class's kind). */
export function waterLines(lines: LineRef[], classes: LineClass[]): LineRef[] {
  return lines.filter((l) => classForType(l.object.type, classes).cls.kind === 'water');
}

export interface CarveResult {
  cm: Int32Array;
  /** Samples lowered. */
  changed: number;
}

/** Samples nearer than this many cells to a river are always carved, so the channel stays connected. */
const _MIN_REACH_CELLS = 0.75;

/** Lower the ground along the water lines (see the module comment). */
export function carveRivers(
  map: TmjMap,
  patch: HeightPatch,
  rivers: LineRef[],
  classes: LineClass[],
  metersPerUnit: number | null,
  opts: { keepHandSet?: boolean } = {},
): CarveResult {
  const { cols, rows } = patch;
  const out = patch.cm.slice();
  if (rivers.length === 0) return { cm: out, changed: 0 };
  const keepHandSet = opts.keepHandSet ?? true;
  const ppm = (metersPerUnit ? pixelsPerMeter(map, metersPerUnit) : null) ?? 0;
  const pos = samplePixels(map, cols, rows);
  // Pixels per cell (the smaller side), for spacing and the minimum reach
  const c0 = pixelToCell(map, 0, 0), c1 = pixelToCell(map, 1, 1);
  const cellPx = 1 / Math.max(Math.abs(c1.u - c0.u), Math.abs(c1.v - c0.v), 1e-9);
  const target = new Float64Array(out.length).fill(Infinity);
  const turn = turnPx(map);
  let samplesX0 = Infinity, samplesX1 = -Infinity;
  for (const x of pos.x) { samplesX0 = Math.min(samplesX0, x); samplesX1 = Math.max(samplesX1, x); }

  for (const river of rivers) {
    const pts = linePoints(river.object);
    if (pts.length < 2) continue;
    const cls = classForType(river.object.type, classes).cls;
    const widths = readWidths(river.object).map((w) => w ?? cls.widthM);
    // Distance along the line at each point
    const along = [0];
    for (let k = 1; k < pts.length; k++) along.push(along[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
    const total = along[along.length - 1];
    const widthAt = (s: number) => {
      let k = 0;
      while (k < pts.length - 2 && along[k + 1] < s) k++;
      const span = along[k + 1] - along[k];
      const t = span ? (s - along[k]) / span : 0;
      return widths[k] + (widths[k + 1] - widths[k]) * t;
    };
    const pointAt = (s: number): Pt => {
      let k = 0;
      while (k < pts.length - 2 && along[k + 1] < s) k++;
      const span = along[k + 1] - along[k];
      const t = span ? (s - along[k]) / span : 0;
      return { x: pts[k].x + (pts[k + 1].x - pts[k].x) * t, y: pts[k].y + (pts[k + 1].y - pts[k].y) * t };
    };

    // The bed profile: ground minus depth, every half cell, falling from the higher end
    const steps = Math.max(1, Math.ceil(total / (cellPx / 2)));
    const bed = new Float64Array(steps + 1);
    for (let j = 0; j <= steps; j++) {
      const s = (total * j) / steps;
      const p = pointAt(s);
      bed[j] = heightAt(map, patch, p.x, p.y) - riverDepthM(widthAt(s)) * 100;
    }
    // Never rising downstream: from the higher end, each step is at most the one before
    if (bed[steps] > bed[0]) for (let j = steps - 1; j >= 0; j--) bed[j] = Math.min(bed[j], bed[j + 1]);
    else for (let j = 1; j <= steps; j++) bed[j] = Math.min(bed[j], bed[j - 1]);
    const bedAt = (s: number) => {
      const f = (s / (total || 1)) * steps;
      const j = Math.min(Math.floor(f), steps - 1);
      const t = f - j;
      return steps === 0 ? bed[0] : bed[j] * (1 - t) + bed[Math.min(j + 1, steps)] * t;
    };

    // Lower the samples near each segment
    const maxReach = Math.max(_MIN_REACH_CELLS * cellPx, (Math.max(...widths) / 2) * ppm);
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k], b = pts[k + 1];
      const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
      const x0 = Math.min(a.x, b.x) - maxReach, x1 = Math.max(a.x, b.x) + maxReach;
      const y0 = Math.min(a.y, b.y) - maxReach, y1 = Math.max(a.y, b.y) + maxReach;
      // On a wrapped map, also the samples a turn away that a segment by the seam reaches
      for (const shift of shiftsOnto(turn, x0, x1, samplesX0, samplesX1)) {
        for (let i = 0; i < out.length; i++) {
          const px = pos.x[i] - shift, py = pos.y[i];
          if (px < x0 || px > x1 || py < y0 || py > y1) continue;
          const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len2));
          const s = along[k] + t * Math.sqrt(len2);
          const reach = Math.max(_MIN_REACH_CELLS * cellPx, (widthAt(s) / 2) * ppm);
          if (Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy)) > reach) continue;
          target[i] = Math.min(target[i], bedAt(s));
        }
      }
    }
  }

  // A wrapped square map's last column is its first: carve both the same
  const canonical = canonicalSample(map, cols);
  for (let i = 0; i < out.length; i++) {
    const c = canonical(i);
    if (c !== i) target[c] = target[i] = Math.min(target[c], target[i]);
  }

  let changed = 0;
  for (let i = 0; i < out.length; i++) {
    if (target[i] === Infinity || (keepHandSet && patch.mask[i])) continue;
    const v = Math.round(target[i]);
    if (v < out[i]) { out[i] = v; changed++; }
  }
  return { cm: out, changed };
}
