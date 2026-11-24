/**
 * Elevation overlay: colored contour bands with optional hillshading, drawn over
 * the tile layers (below objects).
 *
 * Square maps: a smooth raster. Heights are bilinear between cell corners, so bands
 * and contour edges follow the interpolated surface. Hex maps: one flat fill per hex
 * (its centre height), shaded from the slope to its neighbours.
 *
 * Results are cached per height patch object and settings. Painting edits a patch in
 * place and records what changed (dirtyRect), so only that region is redrawn; a
 * fullRefresh (end of a stroke, undo) or different settings rebuild everything.
 * Called inside the renderer's pan transform.
 */

import type { TmjMap } from '../types/tmj';
import type { HeightPatch } from '../utils/heightGrid';
import { bandOf, heightColor, hexNeighbours, patchRange } from '../utils/heightGrid';
import { hexLayout, hexTopLeft, hexPolygon, hexCenter } from './hexGeometry';
import { visibleHexRange } from './hexRenderer';
import { mod, wrapsX } from '../utils/worldWrap';

export interface ElevationOverlayOptions {
  opacity: number;
  hillshade: boolean;
  /** Contour band spacing in cm. */
  intervalCm: number;
}

/** Upper bound on raster pixels for a square map (keeps building it fast). */
const _MAX_RASTER_PIXELS = 4_000_000;
const _MAX_PIXELS_PER_CELL = 8;
const _CONTOUR_DARKEN = 0.7;

// Light from the north-west, 45 degrees up (x right, y down, z up)
const _LIGHT = (() => {
  const v = [-1, -1, Math.SQRT2];
  const n = Math.hypot(...v);
  return v.map((c) => c / n) as [number, number, number];
})();

/**
 * Brightness factor for a surface with slopes dzdx, dzdy measured in bands per cell.
 * 1 on flat ground; brighter facing the light, darker facing away.
 */
export function hillshadeFactor(dzdx: number, dzdy: number): number {
  const n = Math.hypot(dzdx, dzdy, 1);
  const lit = (-dzdx * _LIGHT[0] - dzdy * _LIGHT[1] + _LIGHT[2]) / n;
  return Math.min(1.35, Math.max(0.45, 1 + 1.2 * (lit - _LIGHT[2])));
}

type Rgb = [number, number, number];
const _sameRange = (a: { min: number; max: number }, b: { min: number; max: number }) => a.min === b.min && a.max === b.max;
const _shade = (c: Rgb, f: number): Rgb => [Math.min(255, c[0] * f), Math.min(255, c[1] * f), Math.min(255, c[2] * f)];

// ---------------------------------------------------------------------------
// Square maps
// ---------------------------------------------------------------------------

interface SquareCache {
  key: string;
  canvas: HTMLCanvasElement;
  image: ImageData;
  ppc: number;
  range: { min: number; max: number };
}

const _squareCache = new WeakMap<HeightPatch, SquareCache>();

/**
 * Recolor raster pixels [x0, x1) x [y0, y1) from the patch, then copy them to the
 * cache canvas. Heights are bilinear between corners; contour edges and hillshade
 * look one pixel beyond the region, so neighbours are computed too.
 */
function _paintSquare(cache: SquareCache, map: TmjMap, patch: HeightPatch, opts: ElevationOverlayOptions,
  x0: number, y0: number, x1: number, y1: number): void {
  const { ppc, image, range } = cache;
  const W = map.width, H = map.height;
  const pw = W * ppc, ph = H * ppc;
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(pw, x1); y1 = Math.min(ph, y1);
  if (x0 >= x1 || y0 >= y1) return;

  // Heights for the region plus a one-pixel border (around the world, on a wrapped map)
  const wrap = wrapsX(map);
  const bx0 = wrap ? x0 - 1 : Math.max(0, x0 - 1), by0 = Math.max(0, y0 - 1);
  const bx1 = wrap ? x1 + 1 : Math.min(pw, x1 + 1), by1 = Math.min(ph, y1 + 1);
  const bw = bx1 - bx0;
  const h = new Float32Array(bw * (by1 - by0));
  for (let py = by0; py < by1; py++) {
    const fy = (py + 0.5) / ppc;
    const r0 = Math.min(Math.floor(fy), H - 1);
    const ty = fy - r0;
    for (let px = bx0; px < bx1; px++) {
      const fx = (mod(px, pw) + 0.5) / ppc;
      const c0 = Math.min(Math.floor(fx), W - 1);
      const tx = fx - c0;
      const i = r0 * patch.cols + c0;
      const top = patch.cm[i] * (1 - tx) + patch.cm[i + 1] * tx;
      const bottom = patch.cm[i + patch.cols] * (1 - tx) + patch.cm[i + patch.cols + 1] * tx;
      h[(py - by0) * bw + (px - bx0)] = top * (1 - ty) + bottom * ty;
    }
  }
  const at = (px: number, py: number) => h[(py - by0) * bw + (px - bx0)];

  const interval = opts.intervalCm;
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const v = at(px, py);
      const band = bandOf(v, interval);
      let color = heightColor((band + 0.5) * interval, range);
      // Contour edge where the band changes towards the right or below
      if (((wrap || px + 1 < pw) && bandOf(at(px + 1, py), interval) !== band)
        || (py + 1 < ph && bandOf(at(px, py + 1), interval) !== band)) {
        color = _shade(color, _CONTOUR_DARKEN);
      }
      if (opts.hillshade) {
        const left = wrap || px > 0, right = wrap || px + 1 < pw;
        const xl = at(left ? px - 1 : px, py), xr = at(right ? px + 1 : px, py);
        const yu = at(px, py > 0 ? py - 1 : py), yd = at(px, py + 1 < ph ? py + 1 : py);
        const spanX = (left ? 1 : 0) + (right ? 1 : 0) || 1;
        const spanY = (py > 0 ? 1 : 0) + (py + 1 < ph ? 1 : 0) || 1;
        // pixels -> cells: multiply by ppc; heights -> bands: divide by interval
        color = _shade(color, hillshadeFactor(((xr - xl) / spanX) * ppc / interval, ((yd - yu) / spanY) * ppc / interval));
      }
      const o = (py * pw + px) * 4;
      image.data[o] = color[0];
      image.data[o + 1] = color[1];
      image.data[o + 2] = color[2];
      image.data[o + 3] = 255;
    }
  }
  cache.canvas.getContext('2d')?.putImageData(image, 0, 0, x0, y0, x1 - x0, y1 - y0);
}

function _squareRaster(map: TmjMap, patch: HeightPatch, opts: ElevationOverlayOptions): HTMLCanvasElement | null {
  const W = map.width, H = map.height;
  if (patch.cols !== W + 1 || patch.rows !== H + 1) return null; // stale patch for this map size
  const key = `${W}x${H}|${opts.hillshade}|${opts.intervalCm}|${wrapsX(map)}`;
  let cache = _squareCache.get(patch);

  if (cache && patch.rangeCheck && !_sameRange(cache.range, patchRange(patch))) patch.fullRefresh = true;
  if (!cache || cache.key !== key || patch.fullRefresh) {
    const ppc = Math.max(1, Math.min(_MAX_PIXELS_PER_CELL, Math.floor(Math.sqrt(_MAX_RASTER_PIXELS / (W * H)))));
    const canvas = cache && cache.key === key ? cache.canvas : document.createElement('canvas');
    canvas.width = W * ppc;
    canvas.height = H * ppc;
    cache = { key, canvas, image: new ImageData(W * ppc, H * ppc), ppc, range: patchRange(patch) };
    _squareCache.set(patch, cache);
    _paintSquare(cache, map, patch, opts, 0, 0, W * ppc, H * ppc);
  } else if (patch.dirtyRect) {
    // A corner sample shapes the four cells around it; contours/shading reach one more
    const { c0, r0, c1, r1 } = patch.dirtyRect;
    const p = cache.ppc;
    _paintSquare(cache, map, patch, opts, (c0 - 2) * p, (r0 - 2) * p, (c1 + 2) * p, (r1 + 2) * p);
    if (wrapsX(map)) {
      // ...and what's across the seam from it
      if (c0 <= 1) _paintSquare(cache, map, patch, opts, (W - 2) * p, (r0 - 2) * p, W * p, (r1 + 2) * p);
      if (c1 >= W - 1) _paintSquare(cache, map, patch, opts, 0, (r0 - 2) * p, 2 * p, (r1 + 2) * p);
    }
  }
  patch.fullRefresh = false;
  patch.rangeCheck = false;
  patch.dirtyRect = null;
  return cache.canvas;
}

// ---------------------------------------------------------------------------
// Hex maps
// ---------------------------------------------------------------------------

interface HexCache {
  key: string;
  colors: string[];
  range: { min: number; max: number };
}

const _hexCache = new WeakMap<HeightPatch, HexCache>();

/** Recompute the colors of hexes in columns [c0, c1] and rows [r0, r1]. */
function _colorHexes(cache: HexCache, map: TmjMap, patch: HeightPatch, opts: ElevationOverlayOptions,
  c0: number, r0: number, c1: number, r1: number): void {
  const layout = hexLayout(map);
  const cellW = layout.tileWidth || 1;
  const interval = opts.intervalCm;
  for (let row = Math.max(0, r0); row <= Math.min(patch.rows - 1, r1); row++) {
    for (let col = Math.max(0, c0); col <= Math.min(patch.cols - 1, c1); col++) {
      const hc = patch.cm[row * patch.cols + col];
      let color = heightColor((bandOf(hc, interval) + 0.5) * interval, cache.range);
      if (opts.hillshade) {
        // Least-squares slope from the neighbouring centres (bands per cell width)
        const c = hexCenter(layout, col, row);
        let sxx = 0, syy = 0, sxz = 0, syz = 0;
        for (const n of hexNeighbours(map, col, row)) {
          const dx = (n.x - c.x) / cellW, dy = (n.y - c.y) / cellW;
          const dz = (patch.cm[n.row * patch.cols + n.col] - hc) / interval;
          sxx += dx * dx; syy += dy * dy; sxz += dx * dz; syz += dy * dz;
        }
        color = _shade(color, hillshadeFactor(sxx ? sxz / sxx : 0, syy ? syz / syy : 0));
      }
      cache.colors[row * patch.cols + col] = `rgb(${Math.round(color[0])},${Math.round(color[1])},${Math.round(color[2])})`;
    }
  }
}

function _hexColors(map: TmjMap, patch: HeightPatch, opts: ElevationOverlayOptions): string[] | null {
  if (patch.cols !== map.width || patch.rows !== map.height) return null;
  const key = `${map.width}x${map.height}|${opts.hillshade}|${opts.intervalCm}|${wrapsX(map)}`;
  let cache = _hexCache.get(patch);
  if (cache && patch.rangeCheck && !_sameRange(cache.range, patchRange(patch))) patch.fullRefresh = true;
  if (!cache || cache.key !== key || patch.fullRefresh) {
    cache = { key, colors: new Array(patch.cols * patch.rows), range: patchRange(patch) };
    _hexCache.set(patch, cache);
    _colorHexes(cache, map, patch, opts, 0, 0, patch.cols - 1, patch.rows - 1);
  } else if (patch.dirtyRect) {
    // A hex's shading depends on its neighbours, so recolor one ring further
    const { c0, r0, c1, r1 } = patch.dirtyRect;
    _colorHexes(cache, map, patch, opts, c0 - 1, r0 - 1, c1 + 1, r1 + 1);
    if (wrapsX(map)) {
      if (c0 <= 1) _colorHexes(cache, map, patch, opts, map.width - 2, r0 - 1, map.width - 1, r1 + 1);
      if (c1 >= map.width - 2) _colorHexes(cache, map, patch, opts, 0, r0 - 1, 1, r1 + 1);
    }
  }
  patch.fullRefresh = false;
  patch.rangeCheck = false;
  patch.dirtyRect = null;
  return cache.colors;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/** Draw the overlay. `ctx` is already translated by the pan; map pixels scale by `zoom`. */
export function renderElevationOverlay(
  ctx: CanvasRenderingContext2D,
  map: TmjMap,
  patch: HeightPatch,
  zoom: number,
  pan: { x: number; y: number },
  opts: ElevationOverlayOptions,
): void {
  ctx.save();
  ctx.globalAlpha = opts.opacity;
  if (map.orientation === 'hexagonal') {
    const colors = _hexColors(map, patch, opts);
    if (colors) {
      const layout = hexLayout(map);
      const polygon = hexPolygon(layout);
      const vis = visibleHexRange(ctx.canvas, pan, zoom, layout, map.width, map.height);
      for (let row = vis.r0; row <= vis.r1; row++) {
        for (let col = vis.c0; col <= vis.c1; col++) {
          const tl = hexTopLeft(layout, col, row);
          const x = tl.x * zoom, y = tl.y * zoom;
          ctx.beginPath();
          ctx.moveTo(x + polygon[0].x * zoom, y + polygon[0].y * zoom);
          for (let i = 1; i < polygon.length; i++) ctx.lineTo(x + polygon[i].x * zoom, y + polygon[i].y * zoom);
          ctx.closePath();
          ctx.fillStyle = colors[row * patch.cols + col];
          ctx.fill();
        }
      }
    }
  } else {
    const raster = _squareRaster(map, patch, opts);
    if (raster) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(raster, 0, 0, map.width * map.tilewidth * zoom, map.height * map.tileheight * zoom);
    }
  }
  ctx.restore();
}
