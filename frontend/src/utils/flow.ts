/**
 * Where rain would go (#8 phase 4): flow paths and hollows worked out from the heights.
 * A view only: nothing here is stored or changes the heights.
 *
 * The surface is first filled up to its spill points ("priority flood" with a tiny
 * slope across flats), so every place has a way down to the map's edge or to water.
 * Each sample then drains to its steepest lower neighbour (8 around a square corner, 6
 * around a hex), and the flow adds up downstream: a stream shows where enough ground
 * drains through. Hollows are where the filled surface is above the ground, i.e. where
 * water would pool if nothing else drained it. Lakes and the sea are outlets.
 */

import type { TmjMap } from '../types/tmj';
import { hexLayout, hexCenter } from '../canvas/hexGeometry';
import { sampleNeighbours } from './terrainHeights';
import type { WaterMap } from './water';
import { NO_WATER } from './water';

/** Rise added per step across flat filled ground, cm, so flow keeps moving. */
const _EPSILON = 1e-3;
/** Hollows shallower than this (cm) are ignored. */
export const MIN_HOLLOW_CM = 1;

export interface FlowMap {
  /** The sample each sample drains to, or -1 (map edge, water). */
  receiver: Int32Array;
  /** Samples draining through each sample, itself included. */
  accumulation: Float64Array;
  /** Water depth a hollow would hold at each sample, cm (0 outside hollows). */
  hollowCm: Float32Array;
}

/** Map-pixel position of every height sample (square: cell corners; hex: centres). */
export function samplePixels(map: TmjMap, cols: number, rows: number): { x: Float64Array; y: Float64Array } {
  const x = new Float64Array(cols * rows), y = new Float64Array(cols * rows);
  const layout = map.orientation === 'hexagonal' ? hexLayout(map) : null;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      if (layout) {
        const c = hexCenter(layout, col, row);
        x[i] = c.x; y[i] = c.y;
      } else {
        x[i] = col * map.tilewidth; y[i] = row * map.tileheight;
      }
    }
  }
  return { x, y };
}

/** Neighbours for flow: 8 around a square corner (diagonals too), 6 around a hex. */
function _flowNeighbours(map: TmjMap, cols: number, rows: number): (i: number) => number[] {
  if (map.orientation === 'hexagonal') return sampleNeighbours(map, cols, rows);
  return (i) => {
    const col = i % cols, row = (i - col) / cols;
    const out: number[] = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dc && !dr) continue;
        const c = col + dc, r = row + dr;
        if (c >= 0 && r >= 0 && c < cols && r < rows) out.push(r * cols + c);
      }
    }
    return out;
  };
}

/** A binary min-heap of sample indices by priority. */
class _Heap {
  private items: number[] = [];
  constructor(private readonly prio: Float64Array) {}
  get size() { return this.items.length; }
  push(i: number): void {
    const a = this.items, p = this.prio;
    a.push(i);
    let k = a.length - 1;
    while (k > 0) {
      const up = (k - 1) >> 1;
      if (p[a[up]] <= p[a[k]]) break;
      [a[up], a[k]] = [a[k], a[up]];
      k = up;
    }
  }
  pop(): number {
    const a = this.items, p = this.prio;
    const top = a[0], last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1;
        let m = k;
        if (l < a.length && p[a[l]] < p[a[m]]) m = l;
        if (r < a.length && p[a[r]] < p[a[m]]) m = r;
        if (m === k) break;
        [a[m], a[k]] = [a[k], a[m]];
        k = m;
      }
    }
    return top;
  }
}

/**
 * Flow over the ground `cm` (e.g. with drawn rivers carved in, see carve.ts). Water
 * from `water` is an outlet, at its surface.
 */
export function computeFlow(map: TmjMap, cols: number, rows: number, cm: ArrayLike<number>, water: WaterMap | null): FlowMap {
  const n = cols * rows;
  const neighbours = _flowNeighbours(map, cols, rows);
  const { x, y } = samplePixels(map, cols, rows);
  const filled = new Float64Array(n);
  const done = new Uint8Array(n);
  const outlet = new Uint8Array(n);
  const heap = new _Heap(filled);

  // Outlets: the map's edge and all water
  for (let i = 0; i < n; i++) {
    const col = i % cols, row = (i - col) / cols;
    const wet = water && water.surface[i] !== NO_WATER;
    if (wet || col === 0 || row === 0 || col === cols - 1 || row === rows - 1) {
      filled[i] = wet ? Math.max(cm[i], water!.surface[i]) : cm[i];
      outlet[i] = 1;
      done[i] = 1;
      heap.push(i);
    }
  }
  // Priority flood: raise each place to at least just above where it was reached from
  while (heap.size) {
    const c = heap.pop();
    for (const j of neighbours(c)) {
      if (done[j]) continue;
      done[j] = 1;
      filled[j] = Math.max(cm[j], filled[c] + _EPSILON);
      heap.push(j);
    }
  }

  // Each place drains to its steepest lower neighbour on the filled surface
  const receiver = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    if (outlet[i]) continue;
    let best = -1, bestSlope = 0;
    for (const j of neighbours(i)) {
      const drop = filled[i] - filled[j];
      if (drop <= 0) continue;
      const slope = drop / Math.hypot(x[i] - x[j], y[i] - y[j]);
      if (slope > bestSlope) { bestSlope = slope; best = j; }
    }
    receiver[i] = best;
  }

  // Add up downstream, highest first
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => filled[b] - filled[a]);
  const accumulation = new Float64Array(n).fill(1);
  for (const i of order) if (receiver[i] >= 0) accumulation[receiver[i]] += accumulation[i];

  const hollowCm = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const depth = filled[i] - cm[i];
    if (!outlet[i] && depth >= MIN_HOLLOW_CM) hollowCm[i] = depth;
  }
  return { receiver, accumulation, hollowCm };
}

/** A default stream threshold: samples draining through a place before a stream shows. */
export function defaultStreamSamples(cols: number, rows: number): number {
  return Math.max(12, Math.round(Math.sqrt(cols * rows) * 1.5));
}
