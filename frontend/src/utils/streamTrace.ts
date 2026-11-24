/**
 * Convert to River (#39): turn a stream from the Flow view into a drawn river line.
 *
 * A stream is the path water takes over the surface (see flow.ts). From the picked
 * place it is followed up the main branch (the one with the most water) to where the
 * stream begins, and down to where it ends: a lake or the sea, the map's edge, or a
 * river already drawn (the new line then ends on it). The path is simplified, and the
 * land draining into it picks the class: brook, stream or river.
 */

import type { TmjMap } from '../types/tmj';
import type { LineClass } from '../data/lineClasses';
import type { FlowMap } from './flow';
import { samplePixels } from './flow';
import type { LineRef, Pt } from './lines';
import { linePoints, nearestOnLine } from './lines';
import type { WaterMap } from './water';
import { NO_WATER, sampleAreaM2 } from './water';
import { canonicalSample, wrapPeriodPx, wrapsX } from './worldWrap';

/** Catchment (km²) below which a converted stream is a brook, then a stream; larger is a river. */
const _BROOK_MAX_KM2 = 10;
const _STREAM_MAX_KM2 = 100;
/** Simplification tolerance, in cells. */
const _SIMPLIFY_CELLS = 0.5;
/** How close (in cells) a stream must come to a drawn river to end on it. */
const _JOIN_CELLS = 0.75;

/** Where a converted river ends ('seam': a wrapped map's east or west edge, which a line can't cross). */
export type StreamEnd = 'water' | 'edge' | 'river' | 'seam';

export interface StreamRiver {
  /** The samples followed, source first. */
  samples: number[];
  /** The line's points (simplified), map pixels, source first. */
  points: Pt[];
  /** Line class ID for it. */
  classId: string;
  /** Land draining into it at its end: samples, and m² when the map has a scale. */
  catchmentSamples: number;
  catchmentM2: number | null;
  end: StreamEnd;
}

export interface StreamPicker {
  /** The stream within `radius` map pixels of (x, y) as a river, or null when there's none. */
  at(x: number, y: number, radius: number): StreamRiver | null;
}

/** Douglas–Peucker: drop points within `tolerance` of the line through their neighbours. */
export function simplifyPath(points: Pt[], tolerance: number): Pt[] {
  if (points.length <= 2) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let worst = -1, worstD = tolerance;
    for (let i = a + 1; i < b; i++) {
      const d = nearestOnLine([points[a], points[b]], points[i].x, points[i].y).d;
      if (d > worstD) { worst = i; worstD = d; }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/**
 * The water class for a stream draining `areaM2` (null without a scale: a stream):
 * brook, stream or river, from the built-in IDs when the world set has them, else the
 * nearest water class by width.
 */
export function riverClassFor(areaM2: number | null, classes: LineClass[]): string {
  const km2 = areaM2 === null ? null : areaM2 / 1e6;
  const want = km2 === null ? 'stream' : km2 < _BROOK_MAX_KM2 ? 'brook' : km2 < _STREAM_MAX_KM2 ? 'stream' : 'river';
  const water = classes.filter((c) => c.kind === 'water');
  if (water.some((c) => c.id === want)) return want;
  if (!water.length) return want;
  // A world set with its own waterways: narrowest for brooks, widest for rivers
  const byWidth = [...water].sort((a, b) => a.widthM - b.widthM);
  return want === 'brook' ? byWidth[0].id : want === 'river' ? byWidth[byWidth.length - 1].id : byWidth[Math.floor((byWidth.length - 1) / 2)].id;
}

/**
 * A picker for the streams of `flow` (as the Flow view shows them: at least
 * `streamSamples` samples draining through, not under water). `rivers` are the drawn
 * water lines, where a converted stream ends; `metersPerUnit` sizes the catchment.
 */
export function streamPicker(
  map: TmjMap,
  cols: number,
  rows: number,
  flow: FlowMap,
  water: WaterMap | null,
  streamSamples: number,
  rivers: LineRef[],
  classes: LineClass[],
  metersPerUnit: number | null,
): StreamPicker {
  const n = cols * rows;
  const T = Math.max(2, streamSamples);
  const { x, y } = samplePixels(map, cols, rows);
  const cell = Math.min(map.tilewidth, map.tileheight);
  const canonical = canonicalSample(map, cols);
  const period = wrapsX(map) ? wrapPeriodPx(map) : 0;
  const acrossSeam = (a: number, b: number) => period > 0 && Math.abs(x[a] - x[b]) > period / 2;
  const dry = (i: number) => !water || water.surface[i] === NO_WATER;
  const isStream = (i: number) => flow.accumulation[i] >= T && dry(i);

  // The streams' samples, and what drains into each (only stream samples matter)
  const streams: number[] = [];
  for (let i = 0; i < n; i++) if (canonical(i) === i && isStream(i)) streams.push(i);
  const donors = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = flow.receiver[i];
    if (r < 0 || flow.accumulation[i] < T || canonical(i) !== i) continue;
    const list = donors.get(r);
    if (list) list.push(i); else donors.set(r, [i]);
  }

  // Drawn rivers near each stream sample (the nearest one, if within reach)
  const riverLines = rivers.map((r) => linePoints(r.object));
  const joinD = _JOIN_CELLS * cell;
  const onRiver = new Map<number, Pt>();
  for (const i of streams) {
    let best: Pt | null = null, bestD = joinD;
    for (const pts of riverLines) {
      const near = nearestOnLine(pts, x[i], y[i]);
      if (near.d <= bestD) {
        const a = pts[near.segment], b = pts[near.segment + 1] ?? a;
        best = { x: a.x + (b.x - a.x) * near.t, y: a.y + (b.y - a.y) * near.t };
        bestD = near.d;
      }
    }
    if (best) onRiver.set(i, best);
  }

  const trace = (start: number): StreamRiver | null => {
    if (onRiver.has(start)) return null; // already a drawn river
    // Up the main branch to where the stream begins
    const up: number[] = [];
    let c = start;
    const seen = new Set<number>([start]);
    for (;;) {
      let best = -1;
      for (const d of donors.get(c) ?? []) {
        if (!seen.has(d) && dry(d) && !acrossSeam(c, d) && (best < 0 || flow.accumulation[d] > flow.accumulation[best])) best = d;
      }
      if (best < 0) break;
      seen.add(best);
      up.push(best);
      if (onRiver.has(best)) break; // a drawn river upstream: start on it
      c = best;
    }
    // Down to where it ends
    const down: number[] = [];
    let end: StreamEnd = 'edge';
    c = start;
    for (;;) {
      const r = flow.receiver[c];
      if (r < 0) { end = 'edge'; break; }
      if (seen.has(r)) break;
      if (acrossSeam(c, r)) { end = 'seam'; break; }
      seen.add(r);
      down.push(r);
      if (!dry(r)) { end = 'water'; break; }
      if (onRiver.has(r)) { end = 'river'; break; }
      c = r;
    }
    const samples = [...up.reverse(), start, ...down];
    if (samples.length < 2) return null;
    const pts: Pt[] = samples.map((i) => ({ x: x[i], y: y[i] }));
    // Meet drawn rivers exactly
    const first = onRiver.get(samples[0]);
    if (first) pts[0] = first;
    const last = onRiver.get(samples[samples.length - 1]);
    if (end === 'river' && last) pts[pts.length - 1] = last;
    // Up to the seam: on a square map, where it crosses is this edge's copy of the next sample
    if (end === 'seam' && map.orientation !== 'hexagonal') {
      const from = samples[samples.length - 1], to = flow.receiver[from];
      const edge = { x: x[from] > period / 2 ? period : 0, y: y[to] };
      if (edge.x !== x[from]) pts.push(edge);
    }
    // The land draining in, just above where it ends (not counting the water it joins)
    const lastOwn = end === 'edge' || end === 'seam' ? samples[samples.length - 1] : samples[samples.length - 2];
    const catchmentSamples = flow.accumulation[lastOwn];
    const catchmentM2 = metersPerUnit ? catchmentSamples * sampleAreaM2(metersPerUnit) : null;
    return {
      samples,
      points: simplifyPath(pts, _SIMPLIFY_CELLS * cell),
      classId: riverClassFor(catchmentM2, classes),
      catchmentSamples,
      catchmentM2,
      end,
    };
  };

  return {
    at(px, py, radius) {
      let best = -1, bestD = radius;
      for (const i of streams) {
        const d = Math.hypot(x[i] - px, y[i] - py);
        if (d <= bestD) { best = i; bestD = d; }
      }
      return best < 0 ? null : trace(best);
    },
  };
}
