/**
 * Draw a road or river line (#6). Width is real-world (meters, per point) scaled by
 * the map's pixels per meter, but never thinner than a visible minimum, so roads
 * still show on coarse maps. Roads get a dark casing; water is a single stroke.
 * Called inside the renderer's pan transform; map pixels scale by `zoom`.
 */

import type { TmjObject } from '../types/tmj';
import type { LineClass } from '../data/lineClasses';
import { linePoints, pointWidthsM } from '../utils/lines';

/** A rectangle in map pixels. */
export interface LineRect { x0: number; y0: number; x1: number; y1: number }

export interface LineDrawOptions {
  /** Areas where the line is hidden (a more detailed map refines it there). */
  exclude?: LineRect[];
  /** Only draw inside this area. */
  clipTo?: LineRect | null;
  /** Opacity (ghost lines from other maps are faded). */
  alpha?: number;
}

/** Thinnest a line is drawn, in screen pixels. */
const _MIN_SCREEN_PX = 1.5;
/** Screen width when the map has no scale (meters can't be converted). */
const _NO_SCALE_PX: Record<LineClass['kind'], number> = { road: 3, water: 4 };
const _CASING = 'rgba(40, 30, 20, 0.85)';

/** How a renderer should draw line objects; null skips them. */
export type LineStyleFn = (obj: TmjObject) => { cls: LineClass; pixelsPerMeter: number | null; exclude?: LineRect[] } | null;

/** Screen widths at each point. */
export function screenWidths(obj: TmjObject, cls: LineClass, pixelsPerMeter: number | null, zoom: number): number[] {
  return pointWidthsM(obj, cls).map((m) =>
    pixelsPerMeter ? Math.max(_MIN_SCREEN_PX, m * pixelsPerMeter * zoom) : _NO_SCALE_PX[cls.kind]);
}

function _stroke(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], widths: number[], color: string, extra: number): void {
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (widths.every((w) => w === widths[0])) {
    ctx.lineWidth = widths[0] + extra;
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    return;
  }
  // Varying width: each segment with the average of its ends (round caps hide the joins)
  for (let i = 0; i + 1 < pts.length; i++) {
    ctx.lineWidth = (widths[i] + widths[i + 1]) / 2 + extra;
    ctx.beginPath();
    ctx.moveTo(pts[i].x, pts[i].y);
    ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
    ctx.stroke();
  }
}

export function drawLine(
  ctx: CanvasRenderingContext2D, obj: TmjObject, zoom: number, cls: LineClass, pixelsPerMeter: number | null,
  opts: LineDrawOptions = {},
): void {
  const pts = linePoints(obj).map((p) => ({ x: p.x * zoom, y: p.y * zoom }));
  if (pts.length < 2) return;
  const widths = screenWidths(obj, cls, pixelsPerMeter, zoom);
  ctx.save();
  if (opts.alpha !== undefined) ctx.globalAlpha *= opts.alpha;
  if (opts.clipTo) {
    const r = opts.clipTo;
    ctx.beginPath();
    ctx.rect(r.x0 * zoom, r.y0 * zoom, (r.x1 - r.x0) * zoom, (r.y1 - r.y0) * zoom);
    ctx.clip();
  }
  // Everything except the excluded areas (holes via the even-odd rule; one at a time, as they may overlap)
  for (const r of opts.exclude ?? []) {
    const big = 1e7;
    ctx.beginPath();
    ctx.rect(-big, -big, 2 * big, 2 * big);
    ctx.rect(r.x0 * zoom, r.y0 * zoom, (r.x1 - r.x0) * zoom, (r.y1 - r.y0) * zoom);
    ctx.clip('evenodd');
  }
  if (cls.kind === 'road') _stroke(ctx, pts, widths, _CASING, 2);
  _stroke(ctx, pts, widths, cls.color, 0);
  ctx.restore();
}
