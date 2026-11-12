/**
 * Hexagonal map geometry, matching Tiled's HexagonalRenderer exactly
 * (src/libtiled/hexagonalrenderer.cpp, RenderParams / tileToScreenCoords /
 * tileToScreenPolygon), including its integer arithmetic.
 *
 * Tiled describes a hex grid with:
 *   tilewidth / tileheight – the hex's bounding box
 *   hexsidelength          – length of the flat sides (along the stagger axis)
 *   staggeraxis            – 'x': flat-top, columns staggered; 'y': pointy-top, rows staggered
 *   staggerindex           – 'odd' or 'even': which columns/rows are shifted
 *
 * All values here are in unzoomed map pixels — the same space object x/y use.
 */

import type { TmjMap } from '../types/tmj';

export type HexGeometrySource = Pick<
  TmjMap, 'tilewidth' | 'tileheight' | 'hexsidelength' | 'staggeraxis' | 'staggerindex'
>;

export interface HexLayout {
  staggerX: boolean;
  staggerEven: boolean;
  sideLengthX: number;
  sideLengthY: number;
  sideOffsetX: number;
  sideOffsetY: number;
  columnWidth: number;
  rowHeight: number;
  /** Bounding-box width of one hex as Tiled draws it (may be 1px less than tilewidth). */
  tileWidth: number;
  /** Bounding-box height of one hex as Tiled draws it (may be 1px less than tileheight). */
  tileHeight: number;
}

/** C++ int division (truncates toward zero), as Tiled computes its render params. */
const _half = (n: number): number => Math.trunc(n / 2);

/** Build the layout parameters for a hexagonal map (Tiled's RenderParams). */
export function hexLayout(map: HexGeometrySource): HexLayout {
  const staggerX = (map.staggeraxis ?? 'x') === 'x';
  const side = Math.trunc(map.hexsidelength ?? 0);
  const sideLengthX = staggerX ? side : 0;
  const sideLengthY = staggerX ? 0 : side;
  const sideOffsetX = _half(map.tilewidth - sideLengthX);
  const sideOffsetY = _half(map.tileheight - sideLengthY);
  const columnWidth = sideOffsetX + sideLengthX;
  const rowHeight = sideOffsetY + sideLengthY;
  return {
    staggerX,
    staggerEven: map.staggerindex === 'even',
    sideLengthX, sideLengthY, sideOffsetX, sideOffsetY, columnWidth, rowHeight,
    tileWidth: columnWidth + sideOffsetX,
    tileHeight: rowHeight + sideOffsetY,
  };
}

/** Whether column (flat-top) / row (pointy-top) `i` is the shifted one. */
function _isStaggered(layout: HexLayout, i: number): boolean {
  return ((i & 1) === 1) !== layout.staggerEven;
}

/** Top-left corner of the bounding box of hex (col, row). */
export function hexTopLeft(layout: HexLayout, col: number, row: number): { x: number; y: number } {
  if (layout.staggerX) {
    return {
      x: col * layout.columnWidth,
      y: row * (layout.tileHeight + layout.sideLengthY)
        + (_isStaggered(layout, col) ? layout.rowHeight : 0),
    };
  }
  return {
    x: col * (layout.tileWidth + layout.sideLengthX)
      + (_isStaggered(layout, row) ? layout.columnWidth : 0),
    y: row * layout.rowHeight,
  };
}

/** Centre of hex (col, row). */
export function hexCenter(layout: HexLayout, col: number, row: number): { x: number; y: number } {
  const tl = hexTopLeft(layout, col, row);
  return { x: tl.x + layout.tileWidth / 2, y: tl.y + layout.tileHeight / 2 };
}

/**
 * Corners of a hex relative to its top-left corner (Tiled's tileToScreenPolygon).
 * Eight points: two coincide on each grid orientation, which is harmless for drawing.
 */
export function hexPolygon(layout: HexLayout): { x: number; y: number }[] {
  const { sideOffsetX, sideOffsetY, columnWidth, rowHeight, tileWidth, tileHeight } = layout;
  return [
    { x: 0, y: rowHeight },
    { x: 0, y: sideOffsetY },
    { x: sideOffsetX, y: 0 },
    { x: columnWidth, y: 0 },
    { x: tileWidth, y: sideOffsetY },
    { x: tileWidth, y: rowHeight },
    { x: columnWidth, y: tileHeight },
    { x: sideOffsetX, y: tileHeight },
  ];
}

/** Total pixel size of a hex map with `cols` × `rows` cells. */
export function hexMapPixelSize(layout: HexLayout, cols: number, rows: number): { width: number; height: number } {
  if (layout.staggerX) {
    return {
      width: cols * layout.columnWidth + layout.sideOffsetX,
      height: rows * (layout.tileHeight + layout.sideLengthY) + (cols > 1 ? layout.rowHeight : 0),
    };
  }
  return {
    width: cols * (layout.tileWidth + layout.sideLengthX) + (rows > 1 ? layout.columnWidth : 0),
    height: rows * layout.rowHeight + layout.sideOffsetY,
  };
}

function _pointInPolygon(px: number, py: number, poly: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if ((a.y > py) !== (b.y > py) && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Map pixel (x, y) → the hex cell containing it, clamped to the map.
 * Checks the hex shape exactly; points outside every candidate (off the map)
 * fall back to the nearest cell centre.
 */
export function pixelToHex(
  layout: HexLayout,
  x: number,
  y: number,
  cols: number,
  rows: number,
): { col: number; row: number } {
  const guessCol = layout.staggerX
    ? Math.floor(x / layout.columnWidth)
    : Math.floor(x / (layout.tileWidth + layout.sideLengthX));
  const guessRow = layout.staggerX
    ? Math.floor(y / (layout.tileHeight + layout.sideLengthY))
    : Math.floor(y / layout.rowHeight);
  const polygon = hexPolygon(layout);

  let best = { col: 0, row: 0 };
  let bestDist = Infinity;
  for (let dc = -2; dc <= 2; dc++) {
    for (let dr = -2; dr <= 2; dr++) {
      const col = Math.min(cols - 1, Math.max(0, guessCol + dc));
      const row = Math.min(rows - 1, Math.max(0, guessRow + dr));
      const tl = hexTopLeft(layout, col, row);
      if (_pointInPolygon(x - tl.x, y - tl.y, polygon)) return { col, row };
      const c = hexCenter(layout, col, row);
      const dist = Math.hypot(x - c.x, y - c.y);
      if (dist < bestDist) { bestDist = dist; best = { col, row }; }
    }
  }
  return best;
}

/**
 * Tile size for a regular hex with flat sides of length `side`, rounded to
 * even integers so Tiled's halving loses nothing.
 */
export function regularHexTileSize(side: number, staggerAxis: 'x' | 'y'): { tilewidth: number; tileheight: number } {
  const along = 2 * side;                                  // corner to corner
  const across = 2 * Math.round((Math.sqrt(3) * side) / 2); // flat to flat
  return staggerAxis === 'x'
    ? { tilewidth: along, tileheight: across }
    : { tilewidth: across, tileheight: along };
}
