/**
 * Canvas overlay renderer for World Set child-map footprints.
 *
 * Mirrors the tileRenderer / hexRenderer module pattern:
 * pure functions, no React, no store imports.
 *
 * Exports:
 *   renderFootprintOverlay — draws dashed outlines + labels on the canvas
 *   footprintAtPoint       — hit-tests a canvas-space point against rendered footprints
 *   RenderedFootprint      — type for the result of renderFootprintOverlay
 */

import type { TmjMap } from '../types/tmj';
import type { WorldSetNode } from '../types/worldSet';
import type { ViewState } from './canvasUtils';
import { tileToScreen } from './canvasUtils';
import { computeFootprint } from '../utils/worldSetUtils';
import type { Footprint, ChildRect } from '../utils/worldSetUtils';
import { cellToPixel } from '../utils/worldSurface';

/** Smallest a footprint is drawn (screen px): tiny maps get a marker so they stay visible and clickable. */
const _MIN_SCREEN_PX = 12;
const _CELL_BOX_STROKE = 'rgba(160, 190, 220, 0.45)';

/** Screen rectangle of a child's real area (parent cell space -> parent pixels -> screen). */
function _rectToScreen(rect: ChildRect, map: TmjMap, view: ViewState): { x: number; y: number; w: number; h: number } {
  const a = cellToPixel(map, rect.left, rect.top);
  const b = cellToPixel(map, rect.left + rect.width, rect.top + rect.height);
  return { x: view.pan.x + a.x * view.zoom, y: view.pan.y + a.y * view.zoom, w: (b.x - a.x) * view.zoom, h: (b.y - a.y) * view.zoom };
}
import { hexLayout, hexTopLeft } from './hexGeometry';

// ---------------------------------------------------------------------------
// Color constants (Phase 6 UI-SPEC values — do not change without updating UI-SPEC)
// ---------------------------------------------------------------------------

const _NORMAL_FILL         = 'rgba(58, 110, 165, 0.08)';
const _NORMAL_FILL_HOVER   = 'rgba(58, 110, 165, 0.18)';
const _NORMAL_STROKE       = 'rgba(90, 142, 197, 0.7)';
const _NORMAL_STROKE_HOVER = 'rgba(90, 142, 197, 1.0)';
const _WARN_FILL           = 'rgba(251, 191, 36, 0.08)';
const _WARN_FILL_HOVER     = 'rgba(251, 191, 36, 0.18)';
const _WARN_STROKE         = 'rgba(160, 112, 0, 0.8)';
const _WARN_STROKE_HOVER   = 'rgba(251, 191, 36, 1.0)';
const _NORMAL_DASH: number[] = [6, 4];
const _WARN_DASH: number[]   = [4, 4];
const _LABEL_COLOR_NORMAL  = 'rgba(200, 220, 245, 0.9)';
const _LABEL_COLOR_WARN    = '#fbbf24';
const _STROKE_WIDTH        = 1.5; // pixel-space, not world-space
const _LABEL_FONT          = "600 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const _LABEL_H_PAD         = 4;   // px padding each side for truncation check

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Screen-space record of a rendered footprint, returned for hit-testing. */
export interface RenderedFootprint {
  mapName: string;
  /** Screen-space bounding rect (canvas-element coordinates, not translated) */
  screenX: number;
  screenY: number;
  screenW: number;
  screenH: number;
  isPlaceholder: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Compute the screen-space rectangle for a tile-space footprint.
 * For rectangular tile maps, uses tileToScreen (already incorporates pan).
 * For hexagonal maps, uses hexGeometry to correctly position the
 * bounding box over the actual hex cells — tileToScreen gives incorrect
 * positions for hex grids because hex cell spacing differs from tilewidth.
 *
 * Result is in canvas-element coordinates matching pointer event coordinates.
 */
function _computeScreenRect(
  fp: Footprint,
  map: TmjMap,
  view: ViewState,
): { x: number; y: number; w: number; h: number } {
  if (map.orientation === 'hexagonal') {
    return _computeHexScreenRect(fp, map, view);
  }
  const { x, y } = tileToScreen(fp.colMin, fp.rowMin, view, map.tilewidth, map.tileheight);
  const w = (fp.colMax - fp.colMin + 1) * map.tilewidth * view.zoom;
  const h = (fp.rowMax - fp.rowMin + 1) * map.tileheight * view.zoom;
  return { x, y, w, h };
}

/**
 * Compute the screen-space bounding rectangle for a hex footprint.
 *
 * Hex cells are not laid out on a rectangular grid, so the box spans the
 * bounding boxes of the footprint's 4 corner hexes. All four are needed
 * because the stagger offset makes y vary by column (flat-top) or x by
 * row (pointy-top).
 *
 * The result is in canvas-element coordinates (pan already incorporated).
 */
function _computeHexScreenRect(
  fp: Footprint,
  map: TmjMap,
  view: ViewState,
): { x: number; y: number; w: number; h: number } {
  const { zoom, pan } = view;
  const layout = hexLayout(map);
  const corners: { col: number; row: number }[] = [
    { col: fp.colMin, row: fp.rowMin },
    { col: fp.colMax, row: fp.rowMin },
    { col: fp.colMin, row: fp.rowMax },
    { col: fp.colMax, row: fp.rowMax },
  ];

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (const { col, row } of corners) {
    const tl = hexTopLeft(layout, col, row);
    minX = Math.min(minX, tl.x);
    minY = Math.min(minY, tl.y);
    maxX = Math.max(maxX, tl.x + layout.tileWidth);
    maxY = Math.max(maxY, tl.y + layout.tileHeight);
  }

  return {
    x: pan.x + minX * zoom,
    y: pan.y + minY * zoom,
    w: (maxX - minX) * zoom,
    h: (maxY - minY) * zoom,
  };
}

/**
 * Truncate a label to fit within `maxWidth` pixels, appending '…' if needed.
 * Uses canvas measureText for accurate pixel widths.
 */
function _truncateLabel(ctx: CanvasRenderingContext2D, label: string, maxWidth: number): string {
  if (ctx.measureText(label).width <= maxWidth) return label;
  // Binary-style trim: remove chars from end until it fits
  let truncated = label;
  while (truncated.length > 0 && ctx.measureText(truncated + '…').width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated.length > 0 ? truncated + '…' : '…';
}

// ---------------------------------------------------------------------------
// Main exports
// ---------------------------------------------------------------------------

/**
 * Render child-map footprint outlines and labels on the canvas.
 *
 * Must be called AFTER renderTileMap / renderHexMap as a final overlay pass.
 * Returns an array of RenderedFootprint objects for use by footprintAtPoint().
 *
 * Coordinate note: tileToScreen() already incorporates pan, so all screen
 * coordinates returned are in canvas-element space matching pointer events.
 * No ctx.translate() is applied — drawing coordinates match hit-test coordinates.
 *
 * @param ctx             Canvas 2D rendering context
 * @param children        Direct child WorldSetNodes of the currently displayed map
 * @param parentMap       The currently displayed TmjMap (provides tilewidth, tileheight)
 * @param view            Current zoom/pan state
 * @param hoveredMapName  mapName of the child currently under the pointer, or null
 * @param footprintMap    Optional real areas (parent cell space) keyed by mapName. A child
 *                        not in the map (no data or no scale) gets a 1×1 placeholder at its
 *                        parentAnchor. Children without a parentAnchor are skipped.
 *
 * A footprint is the child's true area. One smaller than a few pixels is drawn as a
 * marker with its name beside it; hovering shows the whole parent cells it touches.
 */
export function renderFootprintOverlay(
  ctx: CanvasRenderingContext2D,
  children: WorldSetNode[],
  parentMap: TmjMap,
  view: ViewState,
  hoveredMapName: string | null,
  footprintMap?: Map<string, ChildRect>,
): RenderedFootprint[] {
  if (children.length === 0) return [];

  const rendered: RenderedFootprint[] = [];

  ctx.save();

  // Drawn in screen pixels (positions already include the zoom), so no scaling
  ctx.lineWidth = _STROKE_WIDTH;

  for (const child of children) {
    // Cannot place a footprint without an anchor
    if (child.parentAnchor === null) continue;

    // The real area when known; else a 1×1 placeholder at the anchor (no data or no scale)
    const real = footprintMap?.get(child.mapName);
    const isPlaceholder = !real;
    const isHovered = child.mapName === hoveredMapName;
    const area = real
      ? _rectToScreen(real, parentMap, view)
      : _computeScreenRect({
        colMin: child.parentAnchor.col, colMax: child.parentAnchor.col,
        rowMin: child.parentAnchor.row, rowMax: child.parentAnchor.row,
      }, parentMap, view);
    // Too small to see or click: a marker of the minimum size, centred on it
    const tiny = !isPlaceholder && (area.w < _MIN_SCREEN_PX || area.h < _MIN_SCREEN_PX);
    const { x, y, w, h } = tiny
      ? { x: area.x + area.w / 2 - _MIN_SCREEN_PX / 2, y: area.y + area.h / 2 - _MIN_SCREEN_PX / 2, w: _MIN_SCREEN_PX, h: _MIN_SCREEN_PX }
      : area;

    // Hover: the whole parent cells the child touches (what the old rounded footprint showed)
    if (real && isHovered) {
      const cells: ChildRect = {
        left: Math.floor(real.left), top: Math.floor(real.top),
        width: Math.ceil(real.left + real.width) - Math.floor(real.left),
        height: Math.ceil(real.top + real.height) - Math.floor(real.top),
      };
      const c = _rectToScreen(cells, parentMap, view);
      ctx.setLineDash([2, 4]);
      ctx.strokeStyle = _CELL_BOX_STROKE;
      ctx.strokeRect(c.x, c.y, c.w, c.h);
    }

    // Choose colors
    const fill   = isPlaceholder
      ? (isHovered ? _WARN_FILL_HOVER   : _WARN_FILL)
      : (isHovered ? _NORMAL_FILL_HOVER : _NORMAL_FILL);
    const stroke = isPlaceholder
      ? (isHovered ? _WARN_STROKE_HOVER : _WARN_STROKE)
      : (isHovered ? _NORMAL_STROKE_HOVER : _NORMAL_STROKE);
    const dash   = isPlaceholder ? _WARN_DASH : _NORMAL_DASH;

    // Draw filled rect (a tiny map's marker is solid, so it stands out)
    ctx.setLineDash(tiny ? [] : dash);
    ctx.fillStyle = tiny ? stroke : fill;
    ctx.fillRect(x, y, w, h);

    // Draw stroked rect
    ctx.strokeStyle = tiny ? '#fff' : stroke;
    ctx.strokeRect(x, y, w, h);

    // Draw label centered in rect
    ctx.font      = _LABEL_FONT;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    let label: string;
    if (isPlaceholder) {
      label = '?';
    } else if (tiny) {
      label = child.mapName; // drawn beside the marker
    } else {
      const maxLabelWidth = w - _LABEL_H_PAD * 2;
      label = maxLabelWidth > 0
        ? _truncateLabel(ctx, child.mapName, maxLabelWidth)
        : '?';
    }

    // Text shadow for readability on varied tile backgrounds
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur  = 3;
    ctx.fillStyle   = isPlaceholder ? _LABEL_COLOR_WARN : _LABEL_COLOR_NORMAL;
    if (tiny) {
      ctx.textAlign = 'left';
      ctx.fillText(label, x + w + 4, y + h / 2);
    } else {
      ctx.fillText(label, x + w / 2, y + h / 2);
    }

    // Reset shadow
    ctx.shadowBlur  = 0;
    ctx.shadowColor = 'transparent';

    rendered.push({
      mapName: child.mapName,
      screenX: x,
      screenY: y,
      screenW: w,
      screenH: h,
      isPlaceholder,
    });
  }

  ctx.restore();

  return rendered;
}

/**
 * Hit-test a canvas-space point against a list of rendered footprints.
 *
 * @param screenX   Pointer X in canvas-element coordinates
 * @param screenY   Pointer Y in canvas-element coordinates
 * @param rendered  Array returned by the most recent renderFootprintOverlay() call
 * @returns         Array of mapNames whose footprint contains (screenX, screenY),
 *                  sorted alphabetically. Empty array if no hit.
 */
export function footprintAtPoint(
  screenX: number,
  screenY: number,
  rendered: RenderedFootprint[],
): string[] {
  const names = rendered
    .filter(
      (r) =>
        screenX >= r.screenX &&
        screenX <= r.screenX + r.screenW &&
        screenY >= r.screenY &&
        screenY <= r.screenY + r.screenH,
    )
    .map((r) => r.mapName);
  return [...new Set(names)].sort(); // a wrapped map draws each once per turn
}

// Re-exported for callers that work with whole-cell footprints
export { computeFootprint };
