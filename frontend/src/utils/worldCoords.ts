/**
 * World coordinates (#9): where any point of any placed map is in the world, in
 * meters, x east and y north of the world origin.
 *
 * The algorithm is specified in docs/coordinates.md and implemented three times: here
 * (the reference, which also writes the shared test suite's expected answers), in
 * Python (clients/python/worldset_coords) and in GDScript (clients/godot/addons/
 * worldset_coords). Keep them in step; clients/conformance checks all three.
 *
 * Steps:
 *   1. Each map has a cell space: one unit per cell along both axes (pixelToCell).
 *   2. A child's cell space sits on its parent's where placeChild puts it, so each map
 *      has a "branch" position in meters: its cell-space origin measured in its root
 *      map's cell space times the cell sizes.
 *   3. The root map's `world-origin` point object (or its centre) is world (0, 0); y flips
 *      so north is positive.
 */

import type { TmjMap, TmjObject } from '../types/tmj';
import { isObjectLayer } from '../types/tmj';
import type { WorldSetNode } from '../types/worldSet';
import { cellToPixel, pixelToCell, placeChild } from './worldSurface';
import { hexCenter, hexLayout, hexMapPixelSize } from '../canvas/hexGeometry';
import { MAP_SCALE_BY_ID, scaleMetersPerUnit } from '../data/mapScales';

/** Tiled class (type) of the root map's world origin point. */
export const WORLD_ORIGIN_TYPE = 'world-origin';
/** Object layer the editor puts the world origin on. */
export const WORLD_ORIGIN_LAYER = 'World';
export const WORLD_ORIGIN_NAME = 'World origin';

/** A map and its cell size in meters, as a world coordinate source. */
export interface WorldMapSource {
  map: TmjMap;
  mpu: number;
}

/**
 * A map's cell size in meters as readers outside the editor take it (docs/coordinates.md):
 * its `metersPerUnit` (which the server writes on every save), else its scale preset
 * sized by its units, else the world set's, else metric. The editor itself uses
 * resolveMetersPerUnit (preset first); the two agree on any map the editor has saved.
 */
export function cellSizeMeters(map: TmjMap, worldSetUnits?: 'metric' | 'imperial'): number | undefined {
  if (typeof map.metersPerUnit === 'number' && Number.isFinite(map.metersPerUnit) && map.metersPerUnit > 0) return map.metersPerUnit;
  const preset = map.scale ? MAP_SCALE_BY_ID[map.scale] : undefined;
  return preset ? scaleMetersPerUnit(preset, map.units ?? worldSetUnits ?? 'metric') : undefined;
}

/** The world origin point object of a map, if it has one (the first, scanning layers top-down in file order). */
export function findWorldOrigin(map: TmjMap): { layerIndex: number; object: TmjObject } | null {
  for (let i = 0; i < map.layers.length; i++) {
    const layer = map.layers[i];
    if (!isObjectLayer(layer)) continue;
    const object = layer.objects.find((o) => o.type === WORLD_ORIGIN_TYPE);
    if (object) return { layerIndex: i, object };
  }
  return null;
}

/** Where a root map without an origin object has it: its cell-space centre, in map pixels. */
export function defaultOriginPixel(map: TmjMap): { x: number; y: number } {
  return cellToPixel(map, map.width / 2, map.height / 2);
}

/** The world origin of a root map, in its pixels. */
export function originPixel(map: TmjMap): { x: number; y: number } {
  const found = findWorldOrigin(map);
  return found ? { x: found.object.x, y: found.object.y } : defaultOriginPixel(map);
}

/** Where a map sits in its world: enough to convert any of its points. */
export interface MapFrame {
  /** The map, and the root of its branch. */
  name: string;
  root: string;
  /** The map's cell size, meters. */
  mpu: number;
  /** Its cell-space (0, 0), in meters east and south of the root's cell-space (0, 0). */
  bx: number;
  by: number;
  /** The world origin, the same way. */
  ox: number;
  oy: number;
}

/**
 * The frame of a placed map: walk its parents up to the root. Null when the map isn't in
 * the world set, a map on the way has no cell size or can't be found, or the chain loops.
 */
export function mapFrame(
  name: string, nodes: WorldSetNode[], lookup: (name: string) => WorldMapSource | undefined,
): MapFrame | null {
  const self = lookup(name);
  let node = nodes.find((n) => n.mapName === name);
  if (!self || !node) return null;
  let bx = 0, by = 0;
  let child = self;
  const seen = new Set([name]);
  while (node.parentMapName !== null) {
    const parentName: string = node.parentMapName;
    const parent = lookup(parentName);
    const parentNode = nodes.find((n) => n.mapName === parentName);
    if (!node.parentAnchor || !parent || !parentNode || seen.has(parentName)) return null;
    seen.add(parentName);
    const place = placeChild(child.map.width, child.map.height, child.mpu, parent.mpu, node.parentAnchor, node.parentOffset);
    bx += place.left * parent.mpu;
    by += place.top * parent.mpu;
    child = parent;
    node = parentNode;
  }
  const o = originPixel(child.map);
  const oc = pixelToCell(child.map, o.x, o.y);
  return { name, root: node.mapName, mpu: self.mpu, bx, by, ox: oc.u * child.mpu, oy: oc.v * child.mpu };
}

/** Map pixel -> world meters (x east, y north). */
export function pixelToWorld(frame: MapFrame, map: TmjMap, x: number, y: number): { x: number; y: number } {
  const { u, v } = pixelToCell(map, x, y);
  return { x: frame.bx + u * frame.mpu - frame.ox, y: frame.oy - (frame.by + v * frame.mpu) };
}

/** World meters -> map pixel (may lie off the map). */
export function worldToPixel(frame: MapFrame, map: TmjMap, wx: number, wy: number): { x: number; y: number } {
  const u = (wx + frame.ox - frame.bx) / frame.mpu;
  const v = (frame.oy - wy - frame.by) / frame.mpu;
  return cellToPixel(map, u, v);
}

/** Centre of cell (col, row), in map pixels. */
export function cellCentrePixel(map: TmjMap, col: number, row: number): { x: number; y: number } {
  return map.orientation === 'hexagonal' ? hexCenter(hexLayout(map), col, row) : cellToPixel(map, col + 0.5, row + 0.5);
}

/**
 * The cell holding a map pixel: on square maps the cell it falls in, on hex maps the one
 * with the nearest centre. Null when it's off the map.
 */
export function pixelToCellIndex(map: TmjMap, x: number, y: number): { col: number; row: number } | null {
  const { u, v } = pixelToCell(map, x, y);
  if (map.orientation !== 'hexagonal') {
    const col = Math.floor(u), row = Math.floor(v);
    return col >= 0 && row >= 0 && col < map.width && row < map.height ? { col, row } : null;
  }
  const layout = hexLayout(map);
  let best: { col: number; row: number } | null = null;
  let bestD = Infinity;
  for (let col = Math.floor(u) - 1; col <= Math.floor(u) + 1; col++) {
    for (let row = Math.floor(v) - 1; row <= Math.floor(v) + 1; row++) {
      if (col < 0 || row < 0 || col >= map.width || row >= map.height) continue;
      const c = hexCenter(layout, col, row);
      const d = (c.x - x) ** 2 + (c.y - y) ** 2;
      if (d < bestD - 1e-9) { bestD = d; best = { col, row }; }
    }
  }
  if (!best) return null;
  // Off the map: farther from the nearest centre than a hex reaches
  return Math.sqrt(bestD) <= Math.max(layout.tileWidth, layout.tileHeight) / 2 ? best : null;
}

/** The map's pixel size (its extent: from (0, 0) to this). */
export function mapPixelSize(map: TmjMap): { width: number; height: number } {
  return map.orientation === 'hexagonal'
    ? hexMapPixelSize(hexLayout(map), map.width, map.height)
    : { width: map.width * map.tilewidth, height: map.height * map.tileheight };
}

/** A map's extent in world meters: west and east x, south and north y. */
export function worldRect(frame: MapFrame, map: TmjMap): { west: number; east: number; south: number; north: number } {
  const size = mapPixelSize(map);
  const a = pixelToWorld(frame, map, 0, 0);
  const b = pixelToWorld(frame, map, size.width, size.height);
  return { west: Math.min(a.x, b.x), east: Math.max(a.x, b.x), south: Math.min(a.y, b.y), north: Math.max(a.y, b.y) };
}

/** A map covering a world point. */
export interface MapAtPoint {
  name: string;
  z: number;
  mpu: number;
  pixel: { x: number; y: number };
}

/**
 * Maps of `root`'s branch whose extent holds world point (wx, wy): most detailed (smallest
 * cells) first; among equals, ground level (Z = 0) before other levels, then by name.
 */
export function mapsAt(
  root: string, wx: number, wy: number, nodes: WorldSetNode[], lookup: (name: string) => WorldMapSource | undefined,
): MapAtPoint[] {
  const found: MapAtPoint[] = [];
  for (const n of nodes) {
    const src = lookup(n.mapName);
    const frame = src ? mapFrame(n.mapName, nodes, lookup) : null;
    if (!src || !frame || frame.root !== root) continue;
    const r = worldRect(frame, src.map);
    if (wx < r.west || wx > r.east || wy < r.south || wy > r.north) continue;
    found.push({ name: n.mapName, z: n.z, mpu: frame.mpu, pixel: worldToPixel(frame, src.map, wx, wy) });
  }
  return found.sort((a, b) => a.mpu - b.mpu || Number(a.z !== 0) - Number(b.z !== 0) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/**
 * A world coordinate (meters) for display, as finely as a map with `cellM`-meter cells can
 * use: km or mi on maps with cells of 1 km or more, else m or ft (with a decimal when
 * cells are 10 m or less). The distance itself doesn't matter: a room far from the
 * origin still needs meters.
 */
export function formatDistance(meters: number, units: 'metric' | 'imperial', cellM: number): string {
  const big = cellM >= 1000;
  const perUnit = units === 'imperial' ? (big ? 1609.344 : 0.3048) : (big ? 1000 : 1);
  const unit = units === 'imperial' ? (big ? 'mi' : 'ft') : (big ? 'km' : 'm');
  const decimals = big ? 2 : cellM <= 10 ? 1 : 0;
  const text = Math.abs(meters / perUnit).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const isZero = /^[0.,]*$/.test(text); // no "−0.00"
  return `${meters < 0 && !isZero ? '−' : ''}${text} ${unit}`;
}

/** World position as text, for a map with `cellM`-meter cells: "x 12.50 km, y −3.20 km". */
export function formatWorld(p: { x: number; y: number }, units: 'metric' | 'imperial', cellM: number): string {
  return `x ${formatDistance(p.x, units, cellM)}, y ${formatDistance(p.y, units, cellM)}`;
}
