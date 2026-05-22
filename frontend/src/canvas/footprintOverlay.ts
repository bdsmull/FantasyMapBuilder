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
import type { Footprint } from '../utils/worldSetUtils';

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
 * Uses tileToScreen which already incorporates pan, so the result is in
 * canvas-element coordinates matching pointer event coordinates.
 */
function _computeScreenRect(
  fp: Footprint,
  map: TmjMap,
  view: ViewState,
): { x: number; y: number; w: number; h: number } {
  const { x, y } = tileToScreen(fp.colMin, fp.rowMin, view, map.tilewidth, map.tileheight);
  const w = (fp.colMax - fp.colMin + 1) * map.tilewidth * view.zoom;
  const h = (fp.rowMax - fp.rowMin + 1) * map.tileheight * view.zoom;
  return { x, y, w, h };
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
 * @param parentMap       The currently displayed TmjMap (provides tilewidth, tileheight, feetPerUnit)
 * @param view            Current zoom/pan state
 * @param hoveredMapName  mapName of the child currently under the pointer, or null
 * @param footprintMap    Optional pre-computed footprints keyed by mapName. If not provided
 *                        (or for a child not in the map), a 1×1 placeholder footprint is used
 *                        at the child's parentAnchor. Children without a parentAnchor are skipped.
 */
export function renderFootprintOverlay(
  ctx: CanvasRenderingContext2D,
  children: WorldSetNode[],
  parentMap: TmjMap,
  view: ViewState,
  hoveredMapName: string | null,
  footprintMap?: Map<string, Footprint>,
): RenderedFootprint[] {
  if (children.length === 0) return [];

  const rendered: RenderedFootprint[] = [];

  ctx.save();

  // Keep stroke width in pixel-space regardless of zoom
  ctx.lineWidth = _STROKE_WIDTH / view.zoom;

  for (const child of children) {
    // Cannot place a footprint without an anchor
    if (child.parentAnchor === null) continue;

    // Determine footprint: use pre-computed if available, else 1×1 placeholder
    const precomputed = footprintMap?.get(child.mapName);
    const fp: Footprint = precomputed ?? {
      colMin: child.parentAnchor.col,
      colMax: child.parentAnchor.col,
      rowMin: child.parentAnchor.row,
      rowMax: child.parentAnchor.row,
    };

    // A footprint is a placeholder when no pre-computed data is available
    // OR when the parent map has no feetPerUnit (so scale-based sizing is impossible)
    const isPlaceholder = !precomputed || !parentMap.feetPerUnit;

    const { x, y, w, h } = _computeScreenRect(fp, parentMap, view);
    const isHovered = child.mapName === hoveredMapName;

    // Choose colors
    const fill   = isPlaceholder
      ? (isHovered ? _WARN_FILL_HOVER   : _WARN_FILL)
      : (isHovered ? _NORMAL_FILL_HOVER : _NORMAL_FILL);
    const stroke = isPlaceholder
      ? (isHovered ? _WARN_STROKE_HOVER : _WARN_STROKE)
      : (isHovered ? _NORMAL_STROKE_HOVER : _NORMAL_STROKE);
    const dash   = isPlaceholder ? _WARN_DASH : _NORMAL_DASH;

    // Draw filled rect
    ctx.setLineDash(dash);
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);

    // Draw stroked rect
    ctx.strokeStyle = stroke;
    ctx.strokeRect(x, y, w, h);

    // Draw label centered in rect
    ctx.font      = _LABEL_FONT;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    let label: string;
    if (isPlaceholder) {
      label = '?';
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
    ctx.fillText(label, x + w / 2, y + h / 2);

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
  return rendered
    .filter(
      (r) =>
        screenX >= r.screenX &&
        screenX <= r.screenX + r.screenW &&
        screenY >= r.screenY &&
        screenY <= r.screenY + r.screenH,
    )
    .map((r) => r.mapName)
    .sort();
}

// Re-export computeFootprint as a convenience for callers that build footprintMap
// (e.g. MapCanvas, which fetches child map data and pre-computes footprints).
export { computeFootprint };
