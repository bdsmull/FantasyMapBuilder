/**
 * HTML5 Canvas renderer for hexagonal HexMaps.
 * Mirrors map_editor/rendering/hex_renderer.py.
 *
 * Flat-top: staggeraxis="x" (hex columns offset vertically)
 * Pointy-top: staggeraxis="y" (hex rows offset horizontally)
 */

import type { TmjMap, TmjTileLayer, TmjObjectLayer } from '../types/tmj';
import { isTileLayer, isObjectLayer } from '../types/tmj';
import type { ViewState } from './canvasUtils';
import { getTileInfo, objectColor } from './canvasUtils';
import { drawLabel } from './tileRenderer';

const BACKGROUND = '#141414';
const GRID_COLOR = 'rgba(0,0,0,0.4)';

export interface HexRenderOptions {
  view: ViewState;
  showGrid: boolean;
  onImageLoad: () => void;
}

// ---------------------------------------------------------------------------
// Hex geometry
// ---------------------------------------------------------------------------

type HexOrientation = 'flat' | 'pointy';

function hexOrientation(map: TmjMap): HexOrientation {
  return map.staggeraxis === 'x' ? 'flat' : 'pointy';
}

/**
 * Compute the 6 corner points of a hexagon centred at (cx, cy) with outer
 * radius `size`. Mirrors hex_map.py hex_corners().
 */
function hexCorners(
  cx: number,
  cy: number,
  size: number,
  orientation: HexOrientation,
): { x: number; y: number }[] {
  const corners: { x: number; y: number }[] = [];
  const startAngle = orientation === 'flat' ? 0 : Math.PI / 6;
  for (let i = 0; i < 6; i++) {
    const angle = startAngle + (i * Math.PI) / 3;
    corners.push({ x: cx + size * Math.cos(angle), y: cy + size * Math.sin(angle) });
  }
  return corners;
}

/**
 * Pixel centre of hex cell (col, row).
 * Mirrors HexMap.hex_center() / HexMap.hex_to_pixel() in hex_map.py.
 */
function hexCenter(
  col: number,
  row: number,
  hexSize: number,
  orientation: HexOrientation,
): { x: number; y: number } {
  if (orientation === 'flat') {
    // Flat-top: columns advance horizontally, even columns are offset up
    const w = hexSize * 2;
    const h = Math.sqrt(3) * hexSize;
    const x = col * (w * 0.75) + hexSize;
    const y = row * h + (col % 2 === 0 ? hexSize * Math.sqrt(3) / 2 : hexSize * Math.sqrt(3));
    return { x, y };
  } else {
    // Pointy-top: rows advance vertically, even rows are offset left
    const h = hexSize * 2;
    const w = Math.sqrt(3) * hexSize;
    const x = col * w + (row % 2 === 0 ? w / 2 : w);
    const y = row * (h * 0.75) + hexSize;
    return { x, y };
  }
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
  const hexSize = ((map.hexsidelength ?? 40) + (map.tilewidth / 2)) * zoom;
  const orientation = hexOrientation(map);

  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  ctx.save();
  ctx.translate(pan.x, pan.y);

  for (const layer of map.layers) {
    if (!layer.visible) continue;
    ctx.globalAlpha = layer.opacity;

    if (isTileLayer(layer)) {
      drawHexTileLayer(ctx, map, layer, hexSize, orientation, zoom, onImageLoad);
    } else if (isObjectLayer(layer)) {
      drawHexObjectLayer(ctx, layer, zoom);
    }
  }

  ctx.globalAlpha = 1;

  if (showGrid) {
    drawHexGrid(ctx, map, hexSize, orientation, zoom);
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Hex tile layer
// ---------------------------------------------------------------------------

function drawHexTileLayer(
  ctx: CanvasRenderingContext2D,
  map: TmjMap,
  layer: TmjTileLayer,
  hexSize: number,
  orientation: HexOrientation,
  zoom: number,
  onImageLoad: () => void,
): void {
  for (let row = 0; row < layer.height; row++) {
    for (let col = 0; col < layer.width; col++) {
      const gid = layer.data[row * layer.width + col];
      if (gid === 0) continue;

      const info = getTileInfo(map, gid, onImageLoad);
      if (!info) continue;

      const center = hexCenter(col, row, hexSize, orientation);
      const corners = hexCorners(center.x, center.y, hexSize, orientation);

      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      for (let i = 1; i < 6; i++) ctx.lineTo(corners[i].x, corners[i].y);
      ctx.closePath();

      if (info.image) {
        // Clip to hex shape then draw image
        ctx.save();
        ctx.clip();
        const tw = map.tilewidth * zoom;
        const th = map.tileheight * zoom;
        ctx.drawImage(
          info.image,
          info.srcX,
          info.srcY,
          info.tileset.tilewidth,
          info.tileset.tileheight,
          center.x - tw / 2,
          center.y - th / 2,
          tw,
          th,
        );
        ctx.restore();
      } else {
        ctx.fillStyle = `rgb(${info.color[0]},${info.color[1]},${info.color[2]})`;
        ctx.fill();
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Hex object layer (reuse tile object drawing — objects use pixel coords)
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
  hexSize: number,
  orientation: HexOrientation,
  zoom: number,
): void {
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 1;

  for (let row = 0; row < map.height; row++) {
    for (let col = 0; col < map.width; col++) {
      const center = hexCenter(col, row, hexSize, orientation);
      const corners = hexCorners(center.x, center.y, hexSize, orientation);
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      for (let i = 1; i < 6; i++) ctx.lineTo(corners[i].x, corners[i].y);
      ctx.closePath();
      ctx.stroke();
    }
  }
}

// Re-export drawLabel for hexRenderer internal use
export { drawLabel };
