/**
 * HTML5 Canvas renderer for square-grid TileMaps.
 * Mirrors the functionality of map_editor/rendering/tile_renderer.py.
 */

import type { TmjMap, TmjTileLayer, TmjObjectLayer } from '../types/tmj';
import { isTileLayer, isObjectLayer } from '../types/tmj';
import type { ViewState } from './canvasUtils';
import { getTileInfo, objectColor } from './canvasUtils';

const BACKGROUND = '#141414';
const GRID_COLOR = 'rgba(0,0,0,0.27)';

export interface RenderOptions {
  view: ViewState;
  showGrid: boolean;
  /** Called when a sprite-sheet image finishes loading (to trigger a re-render). */
  onImageLoad: () => void;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function renderTileMap(
  ctx: CanvasRenderingContext2D,
  map: TmjMap,
  options: RenderOptions,
): void {
  const { view, showGrid, onImageLoad } = options;
  const { zoom, pan } = view;

  // Background
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  ctx.save();
  ctx.translate(pan.x, pan.y);

  for (const layer of map.layers) {
    if (!layer.visible) continue;
    ctx.globalAlpha = layer.opacity;

    if (isTileLayer(layer)) {
      drawTileLayer(ctx, map, layer, zoom, onImageLoad);
    } else if (isObjectLayer(layer)) {
      drawObjectLayer(ctx, layer, map.tilewidth, zoom);
    }
  }

  ctx.globalAlpha = 1;

  if (showGrid) {
    drawGrid(ctx, map, zoom);
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Tile layer
// ---------------------------------------------------------------------------

function drawTileLayer(
  ctx: CanvasRenderingContext2D,
  map: TmjMap,
  layer: TmjTileLayer,
  zoom: number,
  onImageLoad: () => void,
): void {
  const tw = map.tilewidth;
  const th = map.tileheight;

  for (let row = 0; row < layer.height; row++) {
    for (let col = 0; col < layer.width; col++) {
      const gid = layer.data[row * layer.width + col];
      if (gid === 0) continue;

      const info = getTileInfo(map, gid, onImageLoad);
      if (!info) continue;

      const dx = col * tw * zoom;
      const dy = row * th * zoom;

      if (info.image) {
        ctx.drawImage(
          info.image,
          info.srcX,
          info.srcY,
          info.tileset.tilewidth,
          info.tileset.tileheight,
          dx,
          dy,
          tw * zoom,
          th * zoom,
        );
      } else {
        // Placeholder: solid color rectangle
        ctx.fillStyle = `rgb(${info.color[0]},${info.color[1]},${info.color[2]})`;
        ctx.fillRect(dx, dy, tw * zoom, th * zoom);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Object layer
// ---------------------------------------------------------------------------

function drawObjectLayer(
  ctx: CanvasRenderingContext2D,
  layer: TmjObjectLayer,
  tileW: number,
  zoom: number,
): void {
  for (const obj of layer.objects) {
    if (!obj.visible) continue;
    drawObjectMarker(ctx, obj, tileW, zoom);
  }
}

function drawObjectMarker(
  ctx: CanvasRenderingContext2D,
  obj: TmjObjectLayer['objects'][0],
  tileW: number,
  zoom: number,
): void {
  const color = objectColor(obj.type);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;

  if (obj.point || (obj.width === 0 && obj.height === 0)) {
    // Filled circle
    const r = Math.max(4, tileW / 4) * zoom;
    const cx = obj.x * zoom;
    const cy = obj.y * zoom;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    drawLabel(ctx, obj.name.charAt(0), cx, cy);
  } else if (obj.ellipse) {
    const x = obj.x * zoom;
    const y = obj.y * zoom;
    const w = obj.width * zoom;
    const h = obj.height * zoom;
    ctx.fillStyle = hexToRgba(color, 0.24);
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (obj.polygon && obj.polygon.length > 0) {
    ctx.fillStyle = hexToRgba(color, 0.24);
    ctx.beginPath();
    ctx.moveTo((obj.x + obj.polygon[0].x) * zoom, (obj.y + obj.polygon[0].y) * zoom);
    for (const pt of obj.polygon.slice(1)) {
      ctx.lineTo((obj.x + pt.x) * zoom, (obj.y + pt.y) * zoom);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (obj.gid !== undefined) {
    // Tile object — small filled square
    const s = Math.max(6, tileW / 3) * zoom;
    ctx.fillStyle = color;
    ctx.fillRect(obj.x * zoom, obj.y * zoom, s, s);
    drawLabel(ctx, obj.name.charAt(0), (obj.x + s / 2) * zoom, (obj.y + s / 2) * zoom);
  } else {
    // Rectangle
    const x = obj.x * zoom;
    const y = obj.y * zoom;
    const w = obj.width * zoom;
    const h = obj.height * zoom;
    ctx.fillStyle = hexToRgba(color, 0.24);
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    drawLabel(ctx, obj.name.charAt(0), x + w / 2, y + h / 2);
  }
}

// ---------------------------------------------------------------------------
// Grid
// ---------------------------------------------------------------------------

function drawGrid(
  ctx: CanvasRenderingContext2D,
  map: TmjMap,
  zoom: number,
): void {
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 1;
  const tw = map.tilewidth * zoom;
  const th = map.tileheight * zoom;
  const mapW = map.width * tw;
  const mapH = map.height * th;

  ctx.beginPath();
  for (let col = 0; col <= map.width; col++) {
    const x = col * tw;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, mapH);
  }
  for (let row = 0; row <= map.height; row++) {
    const y = row * th;
    ctx.moveTo(0, y);
    ctx.lineTo(mapW, y);
  }
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function drawLabel(ctx: CanvasRenderingContext2D, char: string, cx: number, cy: number): void {
  ctx.font = 'bold 10px sans-serif';
  const w = ctx.measureText(char).width;
  const x = cx - w / 2;
  const y = cy + 4;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillText(char, x + 1, y + 1);
  ctx.fillStyle = 'rgba(255,255,255,0.86)';
  ctx.fillText(char, x, y);
}

/** Parse a CSS rgb() string like 'rgb(255,80,80)' and add alpha. */
function hexToRgba(color: string, alpha: number): string {
  const m = color.match(/rgb\((\d+),(\d+),(\d+)\)/);
  if (m) return `rgba(${m[1]},${m[2]},${m[3]},${alpha})`;
  return color;
}
