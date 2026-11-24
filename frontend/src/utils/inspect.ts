/**
 * What is at a point on the map, for the Inspect tool. Pure: reads map data only.
 */

import type { TmjMap, TmjObject, TmjProperty, TmjTileEntry } from '../types/tmj';
import { isTileLayer, isObjectLayer } from '../types/tmj';
import { hexLayout, pixelToHex, hexMapPixelSize } from '../canvas/hexGeometry';
import { tileTerrainHeight } from './terrainHeights';
import { nearestOnLine } from './lines';
import { mod, unrolledHex, wrapPeriodPx, wrapPixelX, wrapsX } from './worldWrap';
import type { TerrainHeight } from './terrainHeights';

const _GID_MASK = 0x0fffffff;

export interface InspectedTile {
  layer: string;
  layerVisible: boolean;
  gid: number;
  /** Tile type name ("Tile 7" style when the tile has none). */
  type: string;
  tileset: string;
  /** Swatch color for color-only tiles. */
  color?: string;
  terrain: TerrainHeight | null;
}

export interface InspectedObject {
  layer: string;
  id: number;
  name: string;
  type: string;
  kind: 'point' | 'rectangle' | 'ellipse' | 'polygon' | 'line' | 'tile';
  properties: TmjProperty[];
}

export interface Inspection {
  col: number;
  row: number;
  /** Map pixel position that was inspected. */
  x: number;
  y: number;
  /** Tiles at the cell, top layer first (empty cells left out). */
  tiles: InspectedTile[];
  /** Objects under the point, top layer first. */
  objects: InspectedObject[];
}

/** The cell under a map pixel, or null off the map. Columns continue round a wrapped map. */
export function cellAt(map: TmjMap, x: number, y: number): { col: number; row: number } | null {
  const wrap = wrapsX(map);
  if (map.orientation === 'hexagonal') {
    const layout = hexLayout(map);
    const size = hexMapPixelSize(layout, map.width, map.height);
    if (y < 0 || y > size.height || (!wrap && (x < 0 || x > size.width))) return null;
    if (wrap) {
      const at = unrolledHex(map, x, y);
      return { col: mod(at.col, map.width), row: at.row };
    }
    return pixelToHex(layout, x, y, map.width, map.height);
  }
  const col = Math.floor(wrapPixelX(map, x) / map.tilewidth), row = Math.floor(y / map.tileheight);
  return col >= 0 && row >= 0 && col < map.width && row < map.height ? { col, row } : null;
}

function _num(props: TmjProperty[], name: string): number | null {
  const v = props.find((p) => p.name === name)?.value;
  return typeof v === 'number' ? v : null;
}

function _tileInfo(map: TmjMap, gid: number): { entry?: TmjTileEntry; tileset: string; localId: number } {
  const g = gid & _GID_MASK;
  let found = map.tilesets[0];
  for (const ts of map.tilesets) if (ts.firstgid <= g) found = ts; // tilesets are in firstgid order
  if (!found) return { tileset: '?', localId: g };
  const localId = g - found.firstgid;
  return { entry: found.tiles.find((t) => t.id === localId), tileset: found.name, localId };
}

function _kind(o: TmjObject): InspectedObject['kind'] {
  if (o.gid) return 'tile';
  if (o.polyline) return 'line';
  if (o.point || (o.width === 0 && o.height === 0 && !o.polygon)) return 'point';
  if (o.ellipse) return 'ellipse';
  if (o.polygon && o.polygon.length > 0) return 'polygon';
  return 'rectangle';
}

function _inPolygon(px: number, py: number, pts: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > py) !== (b.y > py) && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Whether the object covers (x, y); points count within `pickRadius` map pixels. */
function _hits(o: TmjObject, x: number, y: number, pickRadius: number): boolean {
  switch (_kind(o)) {
    case 'point':
      return Math.hypot(x - o.x, y - o.y) <= pickRadius;
    case 'ellipse': {
      const rx = o.width / 2, ry = o.height / 2;
      if (rx <= 0 || ry <= 0) return false;
      const dx = (x - (o.x + rx)) / rx, dy = (y - (o.y + ry)) / ry;
      return dx * dx + dy * dy <= 1;
    }
    case 'polygon':
      return _inPolygon(x - o.x, y - o.y, o.polygon!);
    case 'line':
      return nearestOnLine(o.polyline!.map((p) => ({ x: o.x + p.x, y: o.y + p.y })), x, y).d <= pickRadius;
    case 'tile': // Tiled anchors tile objects at their bottom-left
      return x >= o.x && x <= o.x + o.width && y >= o.y - o.height && y <= o.y;
    default:
      return x >= o.x && x <= o.x + o.width && y >= o.y && y <= o.y + o.height;
  }
}

/** Inspect the map at pixel (x, y). Null when the point is off the map. */
export function inspectAt(map: TmjMap, x: number, y: number, pickRadius: number): Inspection | null {
  const cell = cellAt(map, x, y);
  if (!cell) return null;
  x = wrapPixelX(map, x);
  // On a wrapped map an object by one edge (or reaching past it) shows by the other, too
  const turn = wrapsX(map) ? wrapPeriodPx(map) : 0;
  const hits = (o: TmjObject) => (turn ? [0, -turn, turn] : [0]).some((s) => _hits(o, x + s, y, pickRadius));
  const i = cell.row * map.width + cell.col;
  const tiles: InspectedTile[] = [];
  const objects: InspectedObject[] = [];
  for (let l = map.layers.length - 1; l >= 0; l--) {
    const layer = map.layers[l];
    if (isTileLayer(layer)) {
      const gid = layer.data[i] ?? 0;
      if (!gid) continue;
      const { entry, tileset, localId } = _tileInfo(map, gid);
      const props = entry?.properties ?? [];
      const r = _num(props, 'color_r'), g = _num(props, 'color_g'), b = _num(props, 'color_b');
      tiles.push({
        layer: layer.name, layerVisible: layer.visible, gid, tileset,
        type: entry?.type || `Tile ${localId + 1}`,
        color: r !== null && g !== null && b !== null ? `rgb(${r},${g},${b})` : undefined,
        terrain: tileTerrainHeight(entry),
      });
    } else if (isObjectLayer(layer)) {
      for (let k = layer.objects.length - 1; k >= 0; k--) {
        const o = layer.objects[k];
        if (!hits(o)) continue;
        objects.push({ layer: layer.name, id: o.id, name: o.name, type: o.type, kind: _kind(o), properties: o.properties ?? [] });
      }
    }
  }
  return { col: cell.col, row: cell.row, x, y, tiles, objects };
}
