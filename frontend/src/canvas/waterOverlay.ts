/**
 * Water overlay (#8 phase 4): lakes and the sea shaded by depth, hollows where water
 * would pool, and streams where rain would run. Drawn over the tiles and the elevation
 * overlay, under roads, rivers and objects. Called inside the renderer's pan transform.
 *
 * Square maps: a raster where a pixel is water when the ground under it (bilinear
 * between corners) is below the water surface of the corners around it, so shorelines
 * follow the ground. Hex maps: one flat fill per hex.
 */

import type { TmjMap } from '../types/tmj';
import type { HeightPatch } from '../utils/heightGrid';
import type { WaterMap } from '../utils/water';
import { NO_WATER } from '../utils/water';
import type { FlowMap } from '../utils/flow';
import { MIN_HOLLOW_CM, samplePixels } from '../utils/flow';
import { hexLayout, hexTopLeft, hexPolygon } from './hexGeometry';
import { visibleHexRange } from './hexRenderer';

export interface WaterOverlayOptions {
  /** Show lakes and the sea. */
  water: boolean;
  /** Show streams and hollows (needs `flow`). */
  flow: boolean;
  /** A stream shows where at least this many samples drain through. */
  streamSamples: number;
  /** Overall opacity, 0–1 (default 1): lowered while painting terrain so tiles show through. */
  opacity?: number;
}

const _MAX_RASTER_PIXELS = 4_000_000;
const _MAX_PIXELS_PER_CELL = 8;
type Rgba = [number, number, number, number];
const _SHALLOW: Rgba = [150, 205, 240, 225];
const _DEEP: Rgba = [12, 58, 120, 235];
const _HOLLOW: Rgba = [120, 190, 225, 110];
const _STREAM = 'rgba(40, 115, 220, 0.85)';

/** Water color for a depth (cm): light when shallow, dark when deep (log scale up to 2 km). */
export function waterColor(depthCm: number): Rgba {
  const t = Math.min(1, Math.log10(1 + Math.max(0, depthCm) / 100) / Math.log10(2001));
  return [0, 1, 2, 3].map((k) => Math.round(_SHALLOW[k] + (_DEEP[k] - _SHALLOW[k]) * t)) as Rgba;
}

interface _Raster { key: string; flow: FlowMap | null; canvas: HTMLCanvasElement }
const _rasters = new WeakMap<WaterMap, _Raster>();

function _squareRaster(map: TmjMap, patch: HeightPatch, water: WaterMap, flow: FlowMap | null, opts: WaterOverlayOptions): HTMLCanvasElement | null {
  const W = map.width, H = map.height;
  if (patch.cols !== W + 1 || patch.rows !== H + 1 || water.surface.length !== patch.cm.length) return null;
  const key = `${opts.water}|${opts.flow && !!flow}`;
  const cached = _rasters.get(water);
  if (cached && cached.key === key && cached.flow === flow) return cached.canvas;

  const ppc = Math.max(1, Math.min(_MAX_PIXELS_PER_CELL, Math.floor(Math.sqrt(_MAX_RASTER_PIXELS / (W * H)))));
  const pw = W * ppc, ph = H * ppc;
  const canvas = document.createElement('canvas');
  canvas.width = pw;
  canvas.height = ph;
  const image = new ImageData(pw, ph);
  const cols = patch.cols, cm = patch.cm, surf = water.surface;
  const hollow = opts.flow && flow ? flow.hollowCm : null;
  for (let row = 0; row < H; row++) {
    for (let col = 0; col < W; col++) {
      const i = row * cols + col;
      const corners = [i, i + 1, i + cols, i + cols + 1];
      let level = NO_WATER;
      if (opts.water) for (const k of corners) if (surf[k] > level) level = surf[k];
      const anyHollow = hollow ? corners.some((k) => hollow[k] > 0) : false;
      if (level === NO_WATER && !anyHollow) continue;
      for (let sy = 0; sy < ppc; sy++) {
        const ty = (sy + 0.5) / ppc;
        for (let sx = 0; sx < ppc; sx++) {
          const tx = (sx + 0.5) / ppc;
          const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
          const ground = cm[i] * w00 + cm[i + 1] * w10 + cm[i + cols] * w01 + cm[i + cols + 1] * w11;
          let color: Rgba | null = null;
          if (level !== NO_WATER && ground < level) color = waterColor(level - ground);
          else if (hollow) {
            const h = hollow[i] * w00 + hollow[i + 1] * w10 + hollow[i + cols] * w01 + hollow[i + cols + 1] * w11;
            if (h >= MIN_HOLLOW_CM) color = _HOLLOW;
          }
          if (!color) continue;
          const o = ((row * ppc + sy) * pw + col * ppc + sx) * 4;
          image.data[o] = color[0]; image.data[o + 1] = color[1]; image.data[o + 2] = color[2]; image.data[o + 3] = color[3];
        }
      }
    }
  }
  canvas.getContext('2d')?.putImageData(image, 0, 0);
  _rasters.set(water, { key, flow, canvas });
  return canvas;
}

function _hexFills(ctx: CanvasRenderingContext2D, map: TmjMap, patch: HeightPatch, water: WaterMap, flow: FlowMap | null,
  opts: WaterOverlayOptions, zoom: number, pan: { x: number; y: number }): void {
  if (patch.cols !== map.width || patch.rows !== map.height) return;
  const layout = hexLayout(map);
  const polygon = hexPolygon(layout);
  const vis = visibleHexRange(ctx.canvas, pan, zoom, layout, map.width, map.height);
  for (let row = vis.r0; row <= vis.r1; row++) {
    for (let col = vis.c0; col <= vis.c1; col++) {
      const i = row * patch.cols + col;
      let color: Rgba | null = null;
      if (opts.water && water.surface[i] !== NO_WATER) color = waterColor(water.surface[i] - patch.cm[i]);
      else if (opts.flow && flow && flow.hollowCm[i] >= MIN_HOLLOW_CM) color = _HOLLOW;
      if (!color) continue;
      const tl = hexTopLeft(layout, col, row);
      const x = tl.x * zoom, y = tl.y * zoom;
      ctx.beginPath();
      ctx.moveTo(x + polygon[0].x * zoom, y + polygon[0].y * zoom);
      for (let k = 1; k < polygon.length; k++) ctx.lineTo(x + polygon[k].x * zoom, y + polygon[k].y * zoom);
      ctx.closePath();
      ctx.fillStyle = `rgba(${color[0]},${color[1]},${color[2]},${color[3] / 255})`;
      ctx.fill();
    }
  }
}

const _pixels = new WeakMap<FlowMap, { x: Float64Array; y: Float64Array }>();

/** Streams: from each sample draining enough ground to where it drains, on dry land in view. */
function _streams(ctx: CanvasRenderingContext2D, map: TmjMap, patch: HeightPatch, water: WaterMap, flow: FlowMap,
  opts: WaterOverlayOptions, zoom: number, pan: { x: number; y: number }): void {
  let pos = _pixels.get(flow);
  if (!pos) { pos = samplePixels(map, patch.cols, patch.rows); _pixels.set(flow, pos); }
  const { width, height } = ctx.canvas;
  const margin = 20;
  const vx0 = (-pan.x - margin) / zoom, vy0 = (-pan.y - margin) / zoom;
  const vx1 = (width - pan.x + margin) / zoom, vy1 = (height - pan.y + margin) / zoom;
  const T = Math.max(2, opts.streamSamples);
  ctx.strokeStyle = _STREAM;
  ctx.lineCap = 'round';
  // Group by width so each width is one path
  const byWidth = new Map<number, number[]>();
  for (let i = 0; i < flow.receiver.length; i++) {
    const j = flow.receiver[i];
    if (j < 0 || flow.accumulation[i] < T || water.surface[i] !== NO_WATER) continue;
    const x = pos.x[i], y = pos.y[i];
    if ((x < vx0 && pos.x[j] < vx0) || (x > vx1 && pos.x[j] > vx1) || (y < vy0 && pos.y[j] < vy0) || (y > vy1 && pos.y[j] > vy1)) continue;
    const w = Math.min(5, Math.round((1 + Math.log2(flow.accumulation[i] / T)) * 2) / 2);
    let list = byWidth.get(w);
    if (!list) byWidth.set(w, (list = []));
    list.push(i);
  }
  for (const [w, list] of byWidth) {
    ctx.lineWidth = w;
    ctx.beginPath();
    for (const i of list) {
      const j = flow.receiver[i];
      ctx.moveTo(pos.x[i] * zoom, pos.y[i] * zoom);
      ctx.lineTo(pos.x[j] * zoom, pos.y[j] * zoom);
    }
    ctx.stroke();
  }
}

/** Draw the overlay. `ctx` is already translated by the pan; map pixels scale by `zoom`. */
export function renderWaterOverlay(
  ctx: CanvasRenderingContext2D,
  map: TmjMap,
  patch: HeightPatch,
  water: WaterMap,
  flow: FlowMap | null,
  zoom: number,
  pan: { x: number; y: number },
  opts: WaterOverlayOptions,
): void {
  ctx.save();
  ctx.globalAlpha *= opts.opacity ?? 1;
  if (map.orientation === 'hexagonal') _hexFills(ctx, map, patch, water, flow, opts, zoom, pan);
  else {
    const raster = _squareRaster(map, patch, water, flow, opts);
    if (raster) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(raster, 0, 0, map.width * map.tilewidth * zoom, map.height * map.tileheight * zoom);
    }
  }
  if (opts.flow && flow) _streams(ctx, map, patch, water, flow, opts, zoom, pan);
  ctx.restore();
}
