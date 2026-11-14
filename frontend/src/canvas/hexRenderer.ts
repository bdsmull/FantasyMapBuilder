/**
 * HTML5 Canvas renderer for hexagonal maps.
 *
 * Geometry comes from hexGeometry.ts, which matches Tiled's own hex renderer,
 * so a map looks the same here and in Tiled (and object pixel coordinates mean
 * the same thing in both).
 */

import type { TmjMap, TmjTileLayer, TmjObjectLayer } from '../types/tmj';
import { isTileLayer, isObjectLayer } from '../types/tmj';
import type { ViewState } from './canvasUtils';
import { getTileInfo, objectColor } from './canvasUtils';
import { drawLabel } from './tileRenderer';
import type { HexLayout } from './hexGeometry';
import { hexLayout, hexTopLeft, hexPolygon } from './hexGeometry';

const BACKGROUND = '#141414';
const GRID_COLOR = 'rgba(0,0,0,0.4)';

// ---------------------------------------------------------------------------
// Hex tile cache — pre-clips each unique tile to a hex shape once so that
// per-frame rendering is a plain drawImage() instead of save/clip/restore.
// ---------------------------------------------------------------------------

const _hexTileCache = new Map<string, HTMLCanvasElement>();

/** Clear the hex tile cache. Call whenever a tileset image finishes loading. */
export function clearHexTileCache(): void {
  _hexTileCache.clear();
}

export interface HexRenderOptions {
  view: ViewState;
  showGrid: boolean;
  onImageLoad: () => void;
}

/** Trace a hex outline at (x, y) (screen top-left) into the current path. */
function _traceHex(
  ctx: CanvasRenderingContext2D,
  polygon: { x: number; y: number }[],
  x: number,
  y: number,
  zoom: number,
): void {
  ctx.moveTo(x + polygon[0].x * zoom, y + polygon[0].y * zoom);
  for (let i = 1; i < polygon.length; i++) {
    ctx.lineTo(x + polygon[i].x * zoom, y + polygon[i].y * zoom);
  }
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// Viewport culling
// ---------------------------------------------------------------------------

/**
 * Range of hex columns and rows that intersect the visible canvas.
 * After ctx.translate(pan.x, pan.y), the visible screen area in map pixels is
 * x ∈ [-pan.x, canvas.width - pan.x] / zoom (likewise for y).
 */
function visibleHexRange(
  canvas: HTMLCanvasElement,
  pan: { x: number; y: number },
  zoom: number,
  layout: HexLayout,
  maxCols: number,
  maxRows: number,
): { c0: number; c1: number; r0: number; r1: number } {
  const xMin = -pan.x / zoom;
  const xMax = (canvas.width - pan.x) / zoom;
  const yMin = -pan.y / zoom;
  const yMax = (canvas.height - pan.y) / zoom;
  const colStep = layout.staggerX ? layout.columnWidth : layout.tileWidth + layout.sideLengthX;
  const rowStep = layout.staggerX ? layout.tileHeight + layout.sideLengthY : layout.rowHeight;
  return {
    c0: Math.max(0, Math.floor(xMin / colStep) - 2),
    c1: Math.min(maxCols - 1, Math.ceil(xMax / colStep) + 1),
    r0: Math.max(0, Math.floor(yMin / rowStep) - 2),
    r1: Math.min(maxRows - 1, Math.ceil(yMax / rowStep) + 1),
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function renderHexMap(
  ctx: CanvasRenderingContext2D,
  map: TmjMap,
  options: HexRenderOptions,
): void {
  const { view, showGrid, onImageLoad } = options;
  const { zoom, pan } = view;
  const layout = hexLayout(map);

  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  const vis = visibleHexRange(ctx.canvas, pan, zoom, layout, map.width, map.height);

  ctx.save();
  ctx.translate(pan.x, pan.y);

  for (const layer of map.layers) {
    if (!layer.visible) continue;
    ctx.globalAlpha = layer.opacity;

    if (isTileLayer(layer)) {
      drawHexTileLayer(ctx, map, layer, layout, zoom, onImageLoad, vis);
    } else if (isObjectLayer(layer)) {
      drawHexObjectLayer(ctx, layer, zoom);
    }
  }

  ctx.globalAlpha = 1;

  if (showGrid) {
    drawHexGrid(ctx, map, layout, zoom, vis);
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Hex tile layer
// ---------------------------------------------------------------------------

/**
 * Build (or retrieve from cache) an offscreen canvas holding the tile image
 * scaled to the hex's bounding box and clipped to the hex shape, at native
 * (zoom = 1) size. Returns null when the tileset image is not yet loaded.
 */
function getCachedHexTile(
  gid: number,
  info: ReturnType<typeof getTileInfo>,
  layout: HexLayout,
): HTMLCanvasElement | null {
  if (!info?.image) return null;

  const key = `${gid}_${layout.tileWidth}x${layout.tileHeight}`;
  const cached = _hexTileCache.get(key);
  if (cached) return cached;

  const offscreen = document.createElement('canvas');
  offscreen.width = Math.max(1, layout.tileWidth);
  offscreen.height = Math.max(1, layout.tileHeight);
  const octx = offscreen.getContext('2d');
  if (!octx) return null;

  octx.beginPath();
  _traceHex(octx, hexPolygon(layout), 0, 0, 1);
  octx.clip();
  octx.drawImage(
    info.image,
    info.srcX, info.srcY,
    info.tileset.tilewidth, info.tileset.tileheight,
    0, 0,
    layout.tileWidth, layout.tileHeight,
  );

  _hexTileCache.set(key, offscreen);
  return offscreen;
}

function drawHexTileLayer(
  ctx: CanvasRenderingContext2D,
  map: TmjMap,
  layer: TmjTileLayer,
  layout: HexLayout,
  zoom: number,
  onImageLoad: () => void,
  vis: { c0: number; c1: number; r0: number; r1: number },
): void {
  const polygon = hexPolygon(layout);
  const c0 = Math.max(0, vis.c0); const c1 = Math.min(layer.width - 1, vis.c1);
  const r0 = Math.max(0, vis.r0); const r1 = Math.min(layer.height - 1, vis.r1);

  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      const gid = layer.data[row * layer.width + col];
      if (gid === 0) continue;

      const info = getTileInfo(map, gid, onImageLoad);
      if (!info) continue;

      const tl = hexTopLeft(layout, col, row);
      const x = tl.x * zoom;
      const y = tl.y * zoom;
      const cached = getCachedHexTile(gid, info, layout);

      if (cached) {
        // Pre-clipped tile: plain drawImage, no save/clip/restore
        ctx.drawImage(cached, x, y, layout.tileWidth * zoom, layout.tileHeight * zoom);
      } else {
        // No image (color-only tileset) or not yet loaded: fill with flat color
        ctx.beginPath();
        _traceHex(ctx, polygon, x, y, zoom);
        ctx.fillStyle = `rgb(${info.color[0]},${info.color[1]},${info.color[2]})`;
        ctx.fill();
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Hex object layer (objects use map pixel coordinates, same as Tiled)
// ---------------------------------------------------------------------------

function drawHexObjectLayer(
  ctx: CanvasRenderingContext2D,
  layer: TmjObjectLayer,
  zoom: number,
): void {
  for (const obj of layer.objects) {
    if (!obj.visible) continue;
    if (obj.point || (obj.width === 0 && obj.height === 0)) {
      const color = objectColor(obj.type);
      const r = 6 * zoom;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(obj.x * zoom, obj.y * zoom, r, 0, Math.PI * 2);
      ctx.fill();
      drawLabel(ctx, obj.name.charAt(0), obj.x * zoom, obj.y * zoom);
    }
  }
}

// ---------------------------------------------------------------------------
// Hex grid
// ---------------------------------------------------------------------------

function drawHexGrid(
  ctx: CanvasRenderingContext2D,
  map: TmjMap,
  layout: HexLayout,
  zoom: number,
  vis: { c0: number; c1: number; r0: number; r1: number },
): void {
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 1;

  const polygon = hexPolygon(layout);
  const c0 = Math.max(0, vis.c0); const c1 = Math.min(map.width - 1, vis.c1);
  const r0 = Math.max(0, vis.r0); const r1 = Math.min(map.height - 1, vis.r1);

  // Build one path for all visible hexes, then stroke once
  ctx.beginPath();
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      const tl = hexTopLeft(layout, col, row);
      _traceHex(ctx, polygon, tl.x * zoom, tl.y * zoom, zoom);
    }
  }
  ctx.stroke();
}

// Re-export drawLabel for hexRenderer internal use
export { drawLabel };
