/**
 * Elevation overlay: colored contour bands with optional hillshading, drawn over
 * the tile layers (below objects).
 *
 * Square maps: a smooth raster. Heights are bilinear between cell corners, so bands
 * and contour edges follow the interpolated surface. Hex maps: one flat fill per hex
 * (its centre height), shaded from the slope to its neighbours.
 *
 * Results are cached per height patch object and settings; a new patch object (or
 * different settings) rebuilds them. Called inside the renderer's pan transform.
 */

import type { TmjMap } from '../types/tmj';
import type { HeightPatch } from '../utils/heightGrid';
import { bandOf, heightColor, hexNeighbours, patchRange } from '../utils/heightGrid';
import { hexLayout, hexTopLeft, hexPolygon, hexCenter } from './hexGeometry';
import { visibleHexRange } from './hexRenderer';

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
const _shade = (c: Rgb, f: number): Rgb => [Math.min(255, c[0] * f), Math.min(255, c[1] * f), Math.min(255, c[2] * f)];

// ---------------------------------------------------------------------------
// Square maps
// ---------------------------------------------------------------------------

const _squareCache = new WeakMap<HeightPatch, { key: string; canvas: HTMLCanvasElement }>();

function _squareRaster(map: TmjMap, patch: HeightPatch, opts: ElevationOverlayOptions): HTMLCanvasElement | null {
  const key = `${map.width}x${map.height}|${opts.hillshade}|${opts.intervalCm}`;
  const cached = _squareCache.get(patch);
  if (cached && cached.key === key) return cached.canvas;

  const W = map.width, H = map.height;
  if (patch.cols !== W + 1 || patch.rows !== H + 1) return null; // stale patch for this map size
  const ppc = Math.max(1, Math.min(_MAX_PIXELS_PER_CELL, Math.floor(Math.sqrt(_MAX_RASTER_PIXELS / (W * H)))));
  const pw = W * ppc, ph = H * ppc;

  // Height at each raster pixel centre, bilinear between corners
  const h = new Float32Array(pw * ph);
  for (let py = 0; py < ph; py++) {
    const fy = (py + 0.5) / ppc;
    const r0 = Math.min(Math.floor(fy), H - 1);
    const ty = fy - r0;
    for (let px = 0; px < pw; px++) {
      const fx = (px + 0.5) / ppc;
      const c0 = Math.min(Math.floor(fx), W - 1);
      const tx = fx - c0;
      const i = r0 * patch.cols + c0;
      const top = patch.cm[i] * (1 - tx) + patch.cm[i + 1] * tx;
      const bottom = patch.cm[i + patch.cols] * (1 - tx) + patch.cm[i + patch.cols + 1] * tx;
      h[py * pw + px] = top * (1 - ty) + bottom * ty;
    }
  }

  const range = patchRange(patch);
  const interval = opts.intervalCm;
  const image = new ImageData(pw, ph);
  for (let py = 0; py < ph; py++) {
    for (let px = 0; px < pw; px++) {
      const i = py * pw + px;
      const band = bandOf(h[i], interval);
      let color = heightColor((band + 0.5) * interval, range);
      // Contour edge where the band changes towards the right or below
      if ((px + 1 < pw && bandOf(h[i + 1], interval) !== band) || (py + 1 < ph && bandOf(h[i + pw], interval) !== band)) {
        color = _shade(color, _CONTOUR_DARKEN);
      }
      if (opts.hillshade) {
        const xl = h[px > 0 ? i - 1 : i], xr = h[px + 1 < pw ? i + 1 : i];
        const yu = h[py > 0 ? i - pw : i], yd = h[py + 1 < ph ? i + pw : i];
        const spanX = (px > 0 ? 1 : 0) + (px + 1 < pw ? 1 : 0) || 1;
        const spanY = (py > 0 ? 1 : 0) + (py + 1 < ph ? 1 : 0) || 1;
        // pixels -> cells: multiply by ppc; heights -> bands: divide by interval
        color = _shade(color, hillshadeFactor(((xr - xl) / spanX) * ppc / interval, ((yd - yu) / spanY) * ppc / interval));
      }
      const o = i * 4;
      image.data[o] = color[0];
      image.data[o + 1] = color[1];
      image.data[o + 2] = color[2];
      image.data[o + 3] = 255;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = pw;
  canvas.height = ph;
  canvas.getContext('2d')?.putImageData(image, 0, 0);
  _squareCache.set(patch, { key, canvas });
  return canvas;
}

// ---------------------------------------------------------------------------
// Hex maps
// ---------------------------------------------------------------------------

const _hexCache = new WeakMap<HeightPatch, { key: string; colors: string[] }>();

function _hexColors(map: TmjMap, patch: HeightPatch, opts: ElevationOverlayOptions): string[] | null {
  const key = `${map.width}x${map.height}|${opts.hillshade}|${opts.intervalCm}`;
  const cached = _hexCache.get(patch);
  if (cached && cached.key === key) return cached.colors;
  if (patch.cols !== map.width || patch.rows !== map.height) return null;

  const layout = hexLayout(map);
  const cellW = layout.tileWidth || 1;
  const range = patchRange(patch);
  const interval = opts.intervalCm;
  const colors: string[] = new Array(patch.cols * patch.rows);
  for (let row = 0; row < patch.rows; row++) {
    for (let col = 0; col < patch.cols; col++) {
      const hc = patch.cm[row * patch.cols + col];
      let color = heightColor((bandOf(hc, interval) + 0.5) * interval, range);
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
      colors[row * patch.cols + col] = `rgb(${Math.round(color[0])},${Math.round(color[1])},${Math.round(color[2])})`;
    }
  }
  _hexCache.set(patch, { key, colors });
  return colors;
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
