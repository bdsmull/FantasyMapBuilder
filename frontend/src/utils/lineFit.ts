/**
 * Mismatch flags for refined lines (#6): does a line copied down to a child map (and
 * linked with `refines`) still meet its original where the original crosses the
 * child's edge? After the original is edited on the parent, it may not.
 *
 * Compared at the child's edge only: a refined copy is free to take its own course
 * inside the map, but where it leaves the map it should meet the original's crossing.
 *   - each end of a copy that lies on the edge should have a crossing of the original
 *     near it, and each crossing should have a copy end near it;
 *   - "near" is within a tolerance of two of the child's cells.
 */

import type { TmjMap } from '../types/tmj';
import type { Pt } from './lines';
import { readLines, linePoints } from './lines';
import type { RelatedMap, Rect } from './crossScaleLines';
import { apply, clipPolyline, lineKey, mapExtent, refinesOf } from './crossScaleLines';

/** How far an end may be from the original's crossing, in the refining map's cells. */
export const EDGE_TOLERANCE_CELLS = 2;

/** A copy's end that is (or should be) on the edge. */
export interface CopyEnd {
  copyId: number;
  /** 0 or the copy's last point index. */
  index: number;
  at: Pt;
}

export interface LineFitResult {
  /**
   * ok: ends meet the original's crossings; moved: they don't any more;
   * left: the original no longer crosses the map; missing: the original is gone.
   */
  status: 'ok' | 'moved' | 'left' | 'missing';
  /** Largest distance between a copy end and the nearest crossing (or vice versa), in pixels. */
  offPx: number;
  /** Copy ends on the edge that don't meet a crossing. */
  badEnds: CopyEnd[];
  /** Crossings of the original with no copy end near them. */
  unmatchedCrossings: Pt[];
  /** Moves that snap each bad end onto the nearest crossing. */
  fixes: { copyId: number; index: number; to: Pt }[];
}

const _distToEdge = (p: Pt, r: Rect) => Math.min(Math.abs(p.x - r.x0), Math.abs(p.x - r.x1), Math.abs(p.y - r.y0), Math.abs(p.y - r.y1));
const _dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** Where a line crosses the edge of `area`: the ends of its clipped pieces that lie on the edge. */
export function edgeCrossings(points: Pt[], area: Rect): Pt[] {
  const eps = 1e-6 * Math.max(area.x1 - area.x0, area.y1 - area.y0, 1);
  const out: Pt[] = [];
  for (const piece of clipPolyline(points, points.map(() => null), area)) {
    for (const p of [piece.points[0], piece.points[piece.points.length - 1]]) {
      if (_distToEdge(p, area) <= eps) out.push(p);
    }
  }
  return out;
}

/** Compare refined copies with their original at the edge of `area` (all in one pixel space). */
export function fitRefinedLine(copies: { id: number; points: Pt[] }[], original: Pt[] | null, area: Rect, tolPx: number): LineFitResult {
  const none: LineFitResult = { status: 'ok', offPx: 0, badEnds: [], unmatchedCrossings: [], fixes: [] };
  if (!original) return { ...none, status: 'missing' };
  const crossings = edgeCrossings(original, area);
  if (crossings.length === 0) return { ...none, status: 'left' };

  const ends: CopyEnd[] = [];
  for (const c of copies) {
    const last = c.points.length - 1;
    for (const index of [0, last]) {
      if (_distToEdge(c.points[index], area) <= tolPx) ends.push({ copyId: c.id, index, at: c.points[index] });
    }
  }

  let off = 0;
  const badEnds: CopyEnd[] = [];
  const fixes: LineFitResult['fixes'] = [];
  for (const e of ends) {
    let best = crossings[0], d = Infinity;
    for (const x of crossings) if (_dist(e.at, x) < d) { d = _dist(e.at, x); best = x; }
    off = Math.max(off, d);
    if (d > tolPx) { badEnds.push(e); fixes.push({ copyId: e.copyId, index: e.index, to: best }); }
  }
  const unmatchedCrossings = crossings.filter((x) => {
    const d = Math.min(Infinity, ...ends.map((e) => _dist(e.at, x)));
    off = Math.max(off, Number.isFinite(d) ? d : 0);
    return d > tolPx;
  });
  const status = badEnds.length || unmatchedCrossings.length ? 'moved' : 'ok';
  return { status, offPx: status === 'ok' ? off : Math.max(off, tolPx), badEnds, unmatchedCrossings, fixes };
}

/** One original line and the copies of it on one map. */
export interface RefinementCheck {
  /** The map holding the copies. */
  refiningMap: string;
  /** "<map>#<id>" of the original. */
  original: string;
  originalName: string | null;
  copyIds: number[];
  /** In the open map's pixels. */
  result: LineFitResult;
}

/** Cell size of a map in the open map's pixels (the smaller side). */
const _cellPx = (m: TmjMap, rect: Rect) => Math.min((rect.x1 - rect.x0) / m.width, (rect.y1 - rect.y0) / m.height);

/**
 * Check every refinement the open map is part of:
 *   - its own lines that refine an ancestor's line;
 *   - descendants' lines that refine one of its own lines.
 * Everything is measured in the open map's pixels.
 */
export function checkRefinements(openName: string, openMap: TmjMap, related: RelatedMap[]): RefinementCheck[] {
  const out: RefinementCheck[] = [];
  const openRect = mapExtent(openMap);

  const group = (map: TmjMap, accept: (sourceMap: string) => boolean) => {
    const groups = new Map<string, { id: number; points: Pt[] }[]>();
    for (const { object } of readLines(map)) {
      const r = refinesOf(object);
      if (!r || !accept(r.map)) continue;
      const key = lineKey(r.map, r.id);
      groups.set(key, [...(groups.get(key) ?? []), { id: object.id, points: linePoints(object) }]);
    }
    return groups;
  };

  // The open map's copies of ancestors' lines
  for (const [key, copies] of group(openMap, (m) => related.some((r) => r.name === m && r.depth < 0))) {
    const [mapName, idText] = [key.slice(0, key.lastIndexOf('#')), key.slice(key.lastIndexOf('#') + 1)];
    const src = related.find((r) => r.name === mapName)!;
    const line = readLines(src.map).find((l) => l.id === Number(idText));
    const original = line ? linePoints(line.object).map((p) => apply(src.toOpen, p)) : null;
    out.push({
      refiningMap: openName, original: key, originalName: line?.object.name ?? null, copyIds: copies.map((c) => c.id),
      result: fitRefinedLine(copies, original, openRect, EDGE_TOLERANCE_CELLS * Math.min(openMap.tilewidth, openMap.tileheight)),
    });
  }

  // Descendants' copies of the open map's own lines
  for (const d of related.filter((r) => r.depth > 0)) {
    for (const [key, copies] of group(d.map, (m) => m === openName)) {
      const id = Number(key.slice(key.lastIndexOf('#') + 1));
      const line = readLines(openMap).find((l) => l.id === id);
      const placed = copies.map((c) => ({ id: c.id, points: c.points.map((p) => apply(d.toOpen, p)) }));
      out.push({
        refiningMap: d.name, original: key, originalName: line?.object.name ?? null, copyIds: copies.map((c) => c.id),
        result: fitRefinedLine(placed, line ? linePoints(line.object) : null, d.rect, EDGE_TOLERANCE_CELLS * _cellPx(d.map, d.rect)),
      });
    }
  }
  return out;
}

/** What is wrong with the copies, worded to follow "This copy" / "The copy on <map>"; null when they fit. */
export function describeRefinement(c: RefinementCheck, metersPerPx: number | null, formatDistance: (m: number) => string): string | null {
  const name = c.originalName ? `"${c.originalName}"` : 'its original';
  switch (c.result.status) {
    case 'ok': return null;
    case 'missing': return 'has lost its original: that line no longer exists';
    case 'left': return `doesn't meet ${name} any more: the original no longer crosses ${c.refiningMap}`;
    default: {
      const off = metersPerPx ? ` (up to ${formatDistance(c.result.offPx * metersPerPx)} off)` : '';
      return `doesn't meet ${name} at the map's edge any more${off}`;
    }
  }
}
