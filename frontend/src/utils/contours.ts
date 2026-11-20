/**
 * Contour lines (#8 phase 3d): lines of known height, e.g. traced from a topographic
 * map. Fitting (with spot heights) bends the surface so it follows every contour.
 *
 * Stored as Tiled objects of type "contour": a polyline, or a polygon when the contour
 * closes on itself (around a hill or a hollow), with the custom properties `height`
 * (float, meters) and `reach` (float, cells) like spot heights. The editor keeps them
 * in a "Contours" object layer. They are not roads or rivers (see utils/lines.ts).
 */

import type { TmjMap, TmjObject } from '../types/tmj';
import { isObjectLayer } from '../types/tmj';
import type { Pt } from './lines';
import { CONTOUR_TYPE, nearestOnLine } from './lines';
import { pixelToCell, cellToPixel } from './worldSurface';
import { SPOT_HEIGHT_PROPERTY, SPOT_REACH_PROPERTY, DEFAULT_REACH_CELLS, MIN_REACH_CELLS } from './spotHeights';
import type { KnownHeight } from './surfaceFit';

export { CONTOUR_TYPE };
export const CONTOUR_LAYER = 'Contours';
/** Contour points are fitted every this many cells along the line. */
export const CONTOUR_SPACING_CELLS = 0.5;

export interface Contour {
  id: number;
  layerIndex: number;
  name: string;
  /** Points in map pixels; a closed contour's last point joins back to the first. */
  points: Pt[];
  closed: boolean;
  cm: number;
  reachCells: number;
}

function _num(o: TmjObject, name: string): number | null {
  const v = o.properties?.find((p) => p.name === name)?.value;
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Whether an object is a contour (a polyline or polygon of type "contour" with a height). */
export function isContour(o: TmjObject): boolean {
  if (o.type !== CONTOUR_TYPE || _num(o, SPOT_HEIGHT_PROPERTY) === null) return false;
  return (o.polyline?.length ?? 0) >= 2 || (o.polygon?.length ?? 0) >= 3;
}

/** A contour object's points in map pixels. */
export function contourPoints(o: TmjObject): Pt[] {
  return (o.polygon ?? o.polyline ?? []).map((p) => ({ x: o.x + p.x, y: o.y + p.y }));
}

/** All contours on the map, from every object layer. */
export function readContours(map: TmjMap): Contour[] {
  const out: Contour[] = [];
  map.layers.forEach((layer, layerIndex) => {
    if (!isObjectLayer(layer)) return;
    for (const o of layer.objects) {
      if (!isContour(o)) continue;
      out.push({
        id: o.id, layerIndex, name: o.name, points: contourPoints(o), closed: !!o.polygon,
        cm: Math.round(_num(o, SPOT_HEIGHT_PROPERTY)! * 100),
        reachCells: Math.max(MIN_REACH_CELLS, _num(o, SPOT_REACH_PROPERTY) ?? DEFAULT_REACH_CELLS),
      });
    }
  });
  return out;
}

/** Object geometry for points (anchored at the first): `polygon` when closed, else `polyline`. */
export function contourShape(points: Pt[], closed: boolean): Pick<TmjObject, 'x' | 'y' | 'polyline' | 'polygon'> {
  const o = points[0] ?? { x: 0, y: 0 };
  const rel = points.map((p) => ({ x: p.x - o.x, y: p.y - o.y }));
  return closed ? { x: o.x, y: o.y, polygon: rel } : { x: o.x, y: o.y, polyline: rel };
}

/** The points as drawn: a closed contour repeats its first point at the end. */
export function contourPath(c: Pick<Contour, 'points' | 'closed'>): Pt[] {
  return c.closed && c.points.length > 2 ? [...c.points, c.points[0]] : c.points;
}

/** The topmost contour within `radius` map pixels of (x, y), or null. */
export function contourAt(contours: Contour[], x: number, y: number, radius: number): Contour | null {
  for (let i = contours.length - 1; i >= 0; i--) {
    if (nearestOnLine(contourPath(contours[i]), x, y).d <= radius) return contours[i];
  }
  return null;
}

/** Fewest points a contour keeps when one is removed. */
export function minContourPoints(closed: boolean): number {
  return closed ? 3 : 2;
}

/**
 * The contours as known heights for fitting: points every CONTOUR_SPACING_CELLS along
 * each line (measured in cells, so hex rows count like columns), plus every vertex.
 */
export function contourTargets(map: TmjMap, contours: Contour[]): KnownHeight[] {
  const out: KnownHeight[] = [];
  for (const c of contours) {
    const path = contourPath(c).map((p) => pixelToCell(map, p.x, p.y));
    const add = (u: number, v: number) => {
      const p = cellToPixel(map, u, v);
      out.push({ x: p.x, y: p.y, cm: c.cm, reachCells: c.reachCells });
    };
    path.forEach((a, i) => {
      if (i === path.length - 1) {
        if (!c.closed) add(a.u, a.v); // a closed path's last point is its first
        return;
      }
      const b = path[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(b.u - a.u, b.v - a.v) / CONTOUR_SPACING_CELLS));
      for (let k = 0; k < n; k++) add(a.u + ((b.u - a.u) * k) / n, a.v + ((b.v - a.v) * k) / n);
    });
  }
  return out;
}
