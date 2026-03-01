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
const SQRT3 = Math.sqrt(3);

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
    const h = SQRT3 * hexSize;
    const x = col * (hexSize * 1.5) + hexSize;
    const y = row * h + (col % 2 === 0 ? h / 2 : h);
    return { x, y };
  } else {
    const w = SQRT3 * hexSize;
    const x = col * w + (row % 2 === 0 ? w / 2 : w);
    const y = row * (hexSize * 1.5) + hexSize;
    return { x, y };
  }
}

// ---------------------------------------------------------------------------
// Viewport culling
// ---------------------------------------------------------------------------

/**
 * Compute the range of hex columns and rows that intersect the visible canvas.
 * After ctx.translate(pan.x, pan.y), world-space coords visible are:
 *   x ∈ [-pan.x, canvas.width - pan.x],  y ∈ [-pan.y, canvas.height - pan.y]
 */
function visibleHexRange(
  canvas: HTMLCanvasElement,
  pan: { x: number; y: number },
  hexSize: number,
  orientation: HexOrientation,
  maxCols: number,
  maxRows: number,
): { c0: number; c1: number; r0: number; r1: number } {
  const margin = hexSize * 2;
  const xMin = -pan.x - margin;
  const xMax = canvas.width - pan.x + margin;
  const yMin = -pan.y - margin;
  const yMax = canvas.height - pan.y + margin;

  if (orientation === 'flat') {
    const h = SQRT3 * hexSize;
    return {
      c0: Math.max(0, Math.floor((xMin - hexSize) / (hexSize * 1.5))),
      c1: Math.min(maxCols - 1, Math.ceil((xMax - hexSize) / (hexSize * 1.5))),
      r0: Math.max(0, Math.floor(yMin / h) - 1),
      r1: Math.min(maxRows - 1, Math.ceil(yMax / h) + 1),
    };
  } else {
    const w = SQRT3 * hexSize;
    return {
      c0: Math.max(0, Math.floor(xMin / w) - 1),
      c1: Math.min(maxCols - 1, Math.ceil(xMax / w) + 1),
      r0: Math.max(0, Math.floor((yMin - hexSize) / (hexSize * 1.5))),
      r1: Math.min(maxRows - 1, Math.ceil((yMax - hexSize) / (hexSize * 1.5))),
    };
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

  const vis = visibleHexRange(ctx.canvas, pan, hexSize, orientation, map.width, map.height);

  ctx.save();
  ctx.translate(pan.x, pan.y);

  for (const layer of map.layers) {
    if (!layer.visible) continue;
    ctx.globalAlpha = layer.opacity;

    if (isTileLayer(layer)) {
      drawHexTileLayer(ctx, map, layer, hexSize, orientation, zoom, onImageLoad, vis);
    } else if (isObjectLayer(layer)) {
      drawHexObjectLayer(ctx, layer, zoom);
    }
  }

  ctx.globalAlpha = 1;

  if (showGrid) {
    drawHexGrid(ctx, map, hexSize, orientation, vis);
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Hex tile layer
// ---------------------------------------------------------------------------

/**
 * Build (or retrieve from cache) an offscreen canvas with the tile image
 * pre-clipped to a hex shape at native (zoom=1) size.
 * Returns null when the tileset image is not yet loaded.
 */
function getCachedHexTile(
  gid: number,
  info: ReturnType<typeof getTileInfo>,
  nativeHexSize: number,
  orientation: HexOrientation,
  tilewidth: number,
  tileheight: number,
): HTMLCanvasElement | null {
  if (!info?.image) return null;

  const key = `${gid}_${Math.round(nativeHexSize)}`;
  const cached = _hexTileCache.get(key);
  if (cached) return cached;

  const diameter = Math.ceil(nativeHexSize * 2);
  const offscreen = document.createElement('canvas');
  offscreen.width = diameter;
  offscreen.height = diameter;
  const octx = offscreen.getContext('2d');
  if (!octx) return null;

  const corners = hexCorners(nativeHexSize, nativeHexSize, nativeHexSize, orientation);
  octx.beginPath();
  octx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < 6; i++) octx.lineTo(corners[i].x, corners[i].y);
  octx.closePath();
  octx.clip();

  octx.drawImage(
    info.image,
    info.srcX, info.srcY,
    info.tileset.tilewidth, info.tileset.tileheight,
    nativeHexSize - tilewidth / 2, nativeHexSize - tileheight / 2,
    tilewidth, tileheight,
  );

  _hexTileCache.set(key, offscreen);
  return offscreen;
}

function drawHexTileLayer(
  ctx: CanvasRenderingContext2D,
  map: TmjMap,
  layer: TmjTileLayer,
  hexSize: number,
  orientation: HexOrientation,
  zoom: number,
  onImageLoad: () => void,
  vis: { c0: number; c1: number; r0: number; r1: number },
): void {
  const nativeHexSize = hexSize / zoom;
  // Pre-compute unit corner offsets — 6 trig calls once instead of per hex
  const unitOffsets = hexCorners(0, 0, 1, orientation);
  const c0 = Math.max(0, vis.c0); const c1 = Math.min(layer.width - 1, vis.c1);
  const r0 = Math.max(0, vis.r0); const r1 = Math.min(layer.height - 1, vis.r1);

  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      const gid = layer.data[row * layer.width + col];
      if (gid === 0) continue;

      const info = getTileInfo(map, gid, onImageLoad);
      if (!info) continue;

      const { x: cx, y: cy } = hexCenter(col, row, hexSize, orientation);
      const cached = getCachedHexTile(gid, info, nativeHexSize, orientation, map.tilewidth, map.tileheight);

      if (cached) {
        // Pre-clipped tile: plain drawImage, no save/clip/restore
        ctx.drawImage(cached, cx - hexSize, cy - hexSize, hexSize * 2, hexSize * 2);
      } else {
        // Image not yet loaded: fill with flat color
        ctx.beginPath();
        ctx.moveTo(cx + unitOffsets[0].x * hexSize, cy + unitOffsets[0].y * hexSize);
        for (let i = 1; i < 6; i++) {
          ctx.lineTo(cx + unitOffsets[i].x * hexSize, cy + unitOffsets[i].y * hexSize);
        }
        ctx.closePath();
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
  vis: { c0: number; c1: number; r0: number; r1: number },
): void {
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 1;

  // Pre-compute unit corner offsets once — avoids 6 trig calls per hex
  const offsets = hexCorners(0, 0, 1, orientation);
  const c0 = Math.max(0, vis.c0); const c1 = Math.min(map.width - 1, vis.c1);
  const r0 = Math.max(0, vis.r0); const r1 = Math.min(map.height - 1, vis.r1);

  // Build one path for all visible hexes, then stroke once
  ctx.beginPath();
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      const { x: cx, y: cy } = hexCenter(col, row, hexSize, orientation);
      ctx.moveTo(cx + offsets[0].x * hexSize, cy + offsets[0].y * hexSize);
      for (let i = 1; i < 6; i++) {
        ctx.lineTo(cx + offsets[i].x * hexSize, cy + offsets[i].y * hexSize);
      }
      ctx.closePath();
    }
  }
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Inverse mapping: pixel → hex cell
// ---------------------------------------------------------------------------

/**
 * Convert a world-space pixel coordinate (screen minus pan) to the
 * nearest hex (col, row). Mirrors the inverse of hexCenter().
 *
 * @param wx        World-space x (screenX - pan.x)
 * @param wy        World-space y (screenY - pan.y)
 * @param hexSize   Outer radius of the hex, already scaled by zoom.
 *                  Matches what renderHexMap computes:
 *                  ((hexsidelength ?? 40) + tilewidth / 2) * zoom
 * @param staggeraxis  map.staggeraxis: 'x' = flat-top, 'y' = pointy-top
 */
export function pixelToHex(
  wx: number,
  wy: number,
  hexSize: number,
  staggeraxis: string,
  mapWidth: number,
  mapHeight: number,
): { col: number; row: number } {
  const orientation: HexOrientation = staggeraxis === 'x' ? 'flat' : 'pointy';

  // Strategy: find the candidate hex center(s) nearest the click and pick
  // the closest one. Checking a 3×3 neighbourhood around the estimated cell
  // guarantees the right answer near hex boundaries.

  let bestDist = Infinity;
  let bestCol = 0;
  let bestRow = 0;

  if (orientation === 'flat') {
    const h = Math.sqrt(3) * hexSize;
    const colGuess = Math.round((wx - hexSize) / (hexSize * 1.5));

    for (let dc = -1; dc <= 1; dc++) {
      const col = colGuess + dc;
      if (col < 0 || col >= mapWidth) continue;
      const offset = col % 2 === 0 ? h / 2 : h;
      const rowGuess = Math.round((wy - offset) / h);

      for (let dr = -1; dr <= 1; dr++) {
        const row = rowGuess + dr;
        if (row < 0 || row >= mapHeight) continue;
        const c = hexCenter(col, row, hexSize, 'flat');
        const dist = Math.hypot(wx - c.x, wy - c.y);
        if (dist < bestDist) { bestDist = dist; bestCol = col; bestRow = row; }
      }
    }
  } else {
    const w = Math.sqrt(3) * hexSize;
    const rowGuess = Math.round((wy - hexSize) / (hexSize * 1.5));

    for (let dr = -1; dr <= 1; dr++) {
      const row = rowGuess + dr;
      if (row < 0 || row >= mapHeight) continue;
      const offset = row % 2 === 0 ? w / 2 : w;
      const colGuess = Math.round((wx - offset) / w);

      for (let dc = -1; dc <= 1; dc++) {
        const col = colGuess + dc;
        if (col < 0 || col >= mapWidth) continue;
        const c = hexCenter(col, row, hexSize, 'pointy');
        const dist = Math.hypot(wx - c.x, wy - c.y);
        if (dist < bestDist) { bestDist = dist; bestCol = col; bestRow = row; }
      }
    }
  }

  return { col: bestCol, row: bestRow };
}

// Re-export drawLabel for hexRenderer internal use
export { drawLabel };
