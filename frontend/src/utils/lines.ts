/**
 * Roads and rivers as lines (#6): Tiled polyline objects.
 *
 * A line's points are stored relative to the object's x/y (Tiled's polyline), its
 * class ID as the object type (see data/lineClasses.ts), and optional per-point
 * widths in meters as a `widths` custom property: a comma-separated list where a
 * blank entry means "the class width", e.g. "20,,25,40". Tiled shows it as text.
 */

import type { TmjMap, TmjObject, TmjProperty } from '../types/tmj';
import { isObjectLayer } from '../types/tmj';
import type { LineClass } from '../data/lineClasses';
import { cellToPixel } from './worldSurface';

export interface Pt { x: number; y: number }

export const WIDTHS_PROPERTY = 'widths';

/** Whether an object is a line (a polyline with at least two points). */
export function isLine(o: TmjObject): boolean {
  return Array.isArray(o.polyline) && o.polyline.length >= 2;
}

/** A line's points in map pixels. */
export function linePoints(o: TmjObject): Pt[] {
  return (o.polyline ?? []).map((p) => ({ x: o.x + p.x, y: o.y + p.y }));
}

/** Object position and relative points for absolute map-pixel points (anchored at the first). */
export function toPolyline(points: Pt[]): { x: number; y: number; polyline: Pt[] } {
  const o = points[0] ?? { x: 0, y: 0 };
  return { x: o.x, y: o.y, polyline: points.map((p) => ({ x: p.x - o.x, y: p.y - o.y })) };
}

/** Per-point widths in meters (null = the class width), one per point. */
export function readWidths(o: TmjObject): (number | null)[] {
  const n = o.polyline?.length ?? 0;
  const raw = o.properties?.find((p) => p.name === WIDTHS_PROPERTY)?.value;
  const parts = typeof raw === 'string' ? raw.split(',') : [];
  return Array.from({ length: n }, (_, i) => {
    const t = (parts[i] ?? '').trim();
    const v = Number(t);
    return t !== '' && Number.isFinite(v) && v > 0 ? v : null;
  });
}

/** Properties with the per-point widths written (or removed when none is set). */
export function writeWidths(props: TmjProperty[] | undefined, widths: (number | null)[]): TmjProperty[] {
  const rest = (props ?? []).filter((p) => p.name !== WIDTHS_PROPERTY);
  if (widths.every((w) => w === null)) return rest;
  const text = widths.map((w) => (w === null ? '' : String(Math.round(w * 100) / 100))).join(',');
  return [...rest, { name: WIDTHS_PROPERTY, type: 'string', value: text }];
}

/** Width in meters at each point, using the class width where none is set. */
export function pointWidthsM(o: TmjObject, cls: LineClass): number[] {
  return readWidths(o).map((w) => w ?? cls.widthM);
}

/** Map pixels per meter, from the map's cell size; null without a scale. */
export function pixelsPerMeter(map: TmjMap, mpu: number | undefined): number | null {
  if (!mpu) return null;
  const a = cellToPixel(map, 0, 0), b = cellToPixel(map, 1, 1);
  return ((Math.abs(b.x - a.x) + Math.abs(b.y - a.y)) / 2) / mpu;
}

/** Length of a line in meters (null without a scale). */
export function lineLengthM(points: Pt[], ppm: number | null): number | null {
  if (!ppm) return null;
  let d = 0;
  for (let i = 1; i < points.length; i++) d += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return d / ppm;
}

/** Closest point on a line to (x, y): distance, segment index and position along it (0..1). */
export function nearestOnLine(points: Pt[], x: number, y: number): { d: number; segment: number; t: number } {
  let best = { d: Infinity, segment: 0, t: 0 };
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i], b = points[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2));
    const d = Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy));
    if (d < best.d) best = { d, segment: i, t };
  }
  return best;
}

export interface LineRef {
  id: number;
  layerIndex: number;
  object: TmjObject;
}

/** All lines on the map, in drawing order (bottom first); hidden layers are skipped when asked. */
export function readLines(map: TmjMap, visibleOnly = false): LineRef[] {
  const out: LineRef[] = [];
  map.layers.forEach((layer, layerIndex) => {
    if (!isObjectLayer(layer) || (visibleOnly && !layer.visible)) return;
    for (const o of layer.objects) if (isLine(o) && (!visibleOnly || o.visible)) out.push({ id: o.id, layerIndex, object: o });
  });
  return out;
}

/** The topmost line within `radius` map pixels of (x, y), or null. */
export function lineAt(lines: LineRef[], x: number, y: number, radius: number): LineRef | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (nearestOnLine(linePoints(lines[i].object), x, y).d <= radius) return lines[i];
  }
  return null;
}

/** Index of the point within `radius` of (x, y), or -1. */
export function pointAt(points: Pt[], x: number, y: number, radius: number): number {
  let best = -1, bestD = radius;
  points.forEach((p, i) => {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d <= bestD) { best = i; bestD = d; }
  });
  return best;
}

/** Index of the segment whose midpoint is within `radius` of (x, y), or -1. */
export function midpointAt(points: Pt[], x: number, y: number, radius: number): number {
  for (let i = 0; i + 1 < points.length; i++) {
    const mx = (points[i].x + points[i + 1].x) / 2, my = (points[i].y + points[i + 1].y) / 2;
    if (Math.hypot(mx - x, my - y) <= radius) return i;
  }
  return -1;
}

/**
 * Points and widths with a point inserted after `segment`. Its width is the average of
 * its neighbours' when both are set; otherwise blank (the class width).
 */
export function insertPoint(points: Pt[], widths: (number | null)[], segment: number, p: Pt): { points: Pt[]; widths: (number | null)[] } {
  const a = widths[segment], b = widths[segment + 1];
  const w = a !== null && b !== null ? (a + b) / 2 : null;
  return {
    points: [...points.slice(0, segment + 1), p, ...points.slice(segment + 1)],
    widths: [...widths.slice(0, segment + 1), w, ...widths.slice(segment + 1)],
  };
}

/** Points and widths without point `i`. */
export function removePoint(points: Pt[], widths: (number | null)[], i: number): { points: Pt[]; widths: (number | null)[] } {
  return { points: points.filter((_, k) => k !== i), widths: widths.filter((_, k) => k !== i) };
}
