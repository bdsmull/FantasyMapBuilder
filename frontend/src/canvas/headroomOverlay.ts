/**
 * Headroom overlay (#45): shades the cells whose headroom differs from the map's own
 * (its `headroom` setting, or open sky when it has none): warm where it's lower (under
 * a floor above, a low passage), cool where it's higher (a tall hall, open sky).
 */

import type { TmjMap } from '../types/tmj';
import { hexLayout, hexTopLeft, hexPolygon } from './hexGeometry';
import { headroomDifference } from '../utils/ceilings';

export const HEADROOM_LOWER_COLOR = 'rgba(235, 120, 40, 0.38)';
export const HEADROOM_HIGHER_COLOR = 'rgba(70, 150, 235, 0.38)';

/** Shade the cells of `grid` (headroomGrid) whose headroom differs from `own` (cm, or null). */
export function renderHeadroomOverlay(
  ctx: CanvasRenderingContext2D, map: TmjMap, grid: Float64Array, own: number | null,
  zoom: number, pan: { x: number; y: number },
): void {
  ctx.save();
  ctx.translate(pan.x, pan.y);
  const hex = map.orientation === 'hexagonal';
  const layout = hex ? hexLayout(map) : null;
  const polygon = layout ? hexPolygon(layout) : null;
  for (const [sign, color] of [[-1, HEADROOM_LOWER_COLOR], [1, HEADROOM_HIGHER_COLOR]] as const) {
    ctx.beginPath();
    for (let row = 0; row < map.height; row++) {
      for (let col = 0; col < map.width; col++) {
        if (headroomDifference(grid[row * map.width + col], own) !== sign) continue;
        if (layout && polygon) {
          const tl = hexTopLeft(layout, col, row);
          polygon.forEach((p, i) => {
            const x = (tl.x + p.x) * zoom, y = (tl.y + p.y) * zoom;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          });
          ctx.closePath();
        } else {
          ctx.rect(col * map.tilewidth * zoom, row * map.tileheight * zoom, map.tilewidth * zoom, map.tileheight * zoom);
        }
      }
    }
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.restore();
}
