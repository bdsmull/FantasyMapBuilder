/**
 * Ceilings for Z levels (#45): how much headroom there is over a spot.
 *
 * Each map's heights are its floor. The ceiling over a spot is the lower of:
 * - outside the map: the **level above** (the floor of the next level up covering the
 *   spot: a sibling, sharing the parent, at a higher Z), less that level's floor
 *   thickness ("slab"); or, for maps below ground (Z < 0) with no level above, the
 *   **ground** (the parent's heights);
 * - the map's own: inside **ceiling objects** (closed shapes of type "ceiling" with a
 *   `headroom` property, meters above the floor) the lowest of theirs, elsewhere the
 *   map's **headroom** setting (a `headroom` map property, meters above the floor).
 * With none of these there is no ceiling (open sky).
 *
 * Slab thickness: the upper map's `slab` property (meters), else the world set's
 * `floorSlabM`, else DEFAULT_SLAB_CM. Lengths are stored as float meters, like other
 * heights in the map file; everything here works in whole centimeters.
 */

import type { TmjMap, TmjObject, TmjProperty } from '../types/tmj';
import { isObjectLayer } from '../types/tmj';
import type { HeightPatch } from './heightGrid';
import { heightAt } from './heightGrid';
import type { Pt } from './lines';
import { nearestOnLine } from './lines';
import type { ChildPlacement } from './worldSurface';
import { reachShifts } from './worldWrap';
import { pixelToCell, cellToPixel } from './worldSurface';
import { hexLayout, hexCenter } from '../canvas/hexGeometry';

export const CEILING_TYPE = 'ceiling';
export const CEILING_LAYER = 'Ceilings';
/** Ceiling objects and maps: headroom above the floor (float, meters). */
export const HEADROOM_PROPERTY = 'headroom';
/** Maps: thickness of the floor slab under this map's floor (float, meters). */
export const SLAB_PROPERTY = 'slab';
/** Floor thickness when neither the map nor the world set sets one. */
export const DEFAULT_SLAB_CM = 30;
/** Headroom given to new ceiling objects until another is chosen. */
export const DEFAULT_CEILING_HEADROOM_CM = 200;
/** Headrooms closer than this to the map's own count as the same (rounding). */
export const HEADROOM_TOLERANCE_CM = 1;

function _num(props: TmjProperty[] | undefined, name: string): number | null {
  const v = props?.find((p) => p.name === name)?.value;
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Map settings
// ---------------------------------------------------------------------------

/** The map's own headroom (cm above the floor), or null when it sets none. */
export function mapHeadroomCm(map: TmjMap): number | null {
  const m = _num(map.properties, HEADROOM_PROPERTY);
  return m !== null && m > 0 ? Math.round(m * 100) : null;
}

/** The map's own floor thickness (cm), or null to use the world set's. */
export function mapSlabCm(map: TmjMap): number | null {
  const m = _num(map.properties, SLAB_PROPERTY);
  return m !== null && m >= 0 ? Math.round(m * 100) : null;
}

/** Floor thickness under a map's floor: its own, else the world set's, else the default. */
export function slabCm(map: TmjMap, worldSetSlabM?: number): number {
  const own = mapSlabCm(map);
  if (own !== null) return own;
  return worldSetSlabM !== undefined && Number.isFinite(worldSetSlabM) && worldSetSlabM >= 0
    ? Math.round(worldSetSlabM * 100) : DEFAULT_SLAB_CM;
}

/** Map properties with a length property set (cm) or removed (null), keeping the others. */
export function withLengthProperty(props: TmjProperty[] | undefined, name: string, cm: number | null): TmjProperty[] {
  const rest = (props ?? []).filter((p) => p.name !== name);
  return cm === null ? rest : [...rest, { name, type: 'float', value: cm / 100 }];
}

// ---------------------------------------------------------------------------
// Ceiling objects
// ---------------------------------------------------------------------------

export interface CeilingArea {
  id: number;
  layerIndex: number;
  name: string;
  /** Corners in map pixels (a closed shape). */
  points: Pt[];
  /** Headroom above the floor, cm. */
  headroomCm: number;
}

/** Whether an object is a ceiling object (a polygon of type "ceiling" with a headroom). */
export function isCeiling(o: TmjObject): boolean {
  return o.type === CEILING_TYPE && (o.polygon?.length ?? 0) >= 3 && (_num(o.properties, HEADROOM_PROPERTY) ?? 0) > 0;
}

/** All ceiling objects on the map, from every object layer. */
export function readCeilings(map: TmjMap): CeilingArea[] {
  const out: CeilingArea[] = [];
  map.layers.forEach((layer, layerIndex) => {
    if (!isObjectLayer(layer)) return;
    for (const o of layer.objects) {
      if (!isCeiling(o)) continue;
      out.push({
        id: o.id, layerIndex, name: o.name,
        points: o.polygon!.map((p) => ({ x: o.x + p.x, y: o.y + p.y })),
        headroomCm: Math.round(_num(o.properties, HEADROOM_PROPERTY)! * 100),
      });
    }
  });
  return out;
}

/** A ceiling object's properties for a headroom (cm), keeping any others. */
export function ceilingProperties(existing: TmjProperty[] | undefined, headroomCm: number): TmjProperty[] {
  return withLengthProperty(existing, HEADROOM_PROPERTY, headroomCm);
}

/** Object geometry for a closed shape (anchored at its first point). */
export function ceilingShape(points: Pt[]): Pick<TmjObject, 'x' | 'y' | 'polygon'> {
  const o = points[0] ?? { x: 0, y: 0 };
  return { x: o.x, y: o.y, polygon: points.map((p) => ({ x: p.x - o.x, y: p.y - o.y })) };
}

/** Whether (x, y) is inside the closed shape. */
export function insideShape(points: Pt[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** The outline as drawn (back to the first point). */
export function ceilingPath(area: Pick<CeilingArea, 'points'>): Pt[] {
  return area.points.length > 2 ? [...area.points, area.points[0]] : area.points;
}

/**
 * The topmost ceiling object whose outline is within `radius` of (x, y), or null. Only
 * the outline counts, so a new shape can be started inside another.
 */
export function ceilingAreaAt(areas: CeilingArea[], x: number, y: number, radius: number): CeilingArea | null {
  for (let i = areas.length - 1; i >= 0; i--) {
    if (nearestOnLine(ceilingPath(areas[i]), x, y).d <= radius) return areas[i];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Levels above, and the ceiling at a point
// ---------------------------------------------------------------------------

/** Another map whose floor can be this map's ceiling, placed on the shared parent. */
export interface LevelAbove {
  name: string;
  z: number;
  map: TmjMap;
  patch: HeightPatch;
  /** Where it sits on the parent (parent cell space). */
  place: ChildPlacement;
  /** Its floor thickness, cm. */
  slabCm: number;
}

/** What the open map's ceilings depend on besides its own data. */
export interface CeilingContext {
  /** The open map's level. */
  z: number;
  /** Where the open map sits on its parent; null when it isn't placed. */
  place: ChildPlacement | null;
  /** Sibling levels above, lowest Z first. */
  above: LevelAbove[];
  /** For maps below ground: the parent, whose heights are the ground above. */
  ground: { name: string; map: TmjMap; patch: HeightPatch } | null;
}

export type CeilingSource = 'level' | 'ground' | 'map' | 'object';

export interface Ceiling {
  /** Ceiling height, cm (absolute). */
  cm: number;
  /** Ceiling above the floor, cm. */
  headroomCm: number;
  source: CeilingSource;
  /** The level, parent or ceiling object it comes from ('' for the map's own headroom or an unnamed object). */
  name: string;
}

/** A context with nothing outside the map (a map not in a world set, or a root). */
export const NO_CEILING_CONTEXT: CeilingContext = { z: 0, place: null, above: [], ground: null };

/** Parent cell-space point under open-map pixel (x, y). */
function _onParent(map: TmjMap, place: ChildPlacement, x: number, y: number): { u: number; v: number } {
  const { u, v } = pixelToCell(map, x, y);
  return { u: place.left + u / place.scale, v: place.top + v / place.scale };
}

/** The level-above or ground ceiling at open-map pixel (x, y), or null. */
function _outsideCeiling(map: TmjMap, ctx: CeilingContext, x: number, y: number): Omit<Ceiling, 'headroomCm'> | null {
  if (!ctx.place) return null;
  const p = _onParent(map, ctx.place, x, y);
  let z: number | null = null;
  let best: Omit<Ceiling, 'headroomCm'> | null = null;
  for (const lvl of ctx.above) {
    if (z !== null && lvl.z !== z) break; // only the next level up that covers the spot
    const lu = (p.u - lvl.place.left) * lvl.place.scale, lv = (p.v - lvl.place.top) * lvl.place.scale;
    if (lu < 0 || lv < 0 || lu > lvl.map.width || lv > lvl.map.height) continue;
    const at = cellToPixel(lvl.map, lu, lv);
    const cm = heightAt(lvl.map, lvl.patch, at.x, at.y) - lvl.slabCm;
    z = lvl.z;
    if (!best || cm < best.cm) best = { cm, source: 'level', name: lvl.name };
  }
  if (best) return best;
  if (ctx.ground && ctx.z < 0) {
    const at = cellToPixel(ctx.ground.map, p.u, p.v);
    return { cm: heightAt(ctx.ground.map, ctx.ground.patch, at.x, at.y), source: 'ground', name: ctx.ground.name };
  }
  return null;
}

/**
 * The ceiling over open-map pixel (x, y) with floor `floorCm`, or null for open sky.
 * `headroomCm` is the map's own headroom (mapHeadroomCm).
 */
export function ceilingAt(
  map: TmjMap, floorCm: number, ctx: CeilingContext, areas: CeilingArea[], headroomCm: number | null, x: number, y: number,
): Ceiling | null {
  let best = _outsideCeiling(map, ctx, x, y);
  const shifts = areas.length ? reachShifts(map) : [];
  // Inside ceiling objects the lowest of theirs replaces the map's own headroom
  let own: { cm: number; source: CeilingSource; name: string } | null = null;
  for (const a of areas) {
    if (shifts.some((s) => insideShape(a.points, x + s, y)) && (!own || floorCm + a.headroomCm < own.cm)) own = { cm: floorCm + a.headroomCm, source: 'object', name: a.name };
  }
  if (!own && headroomCm !== null) own = { cm: floorCm + headroomCm, source: 'map', name: '' };
  if (own && (!best || own.cm < best.cm)) best = own;
  if (!best) return null;
  const b: Omit<Ceiling, 'headroomCm'> = best;
  return { ...b, cm: Math.round(b.cm), headroomCm: Math.round(b.cm - floorCm) };
}

/** What sets a ceiling, for readouts: "floor of 'Inn upper'", "ceiling shape 'Low passage'", … */
export function describeCeiling(c: Pick<Ceiling, 'source' | 'name'>): string {
  switch (c.source) {
    case 'level': return `floor of '${c.name}'`;
    case 'ground': return `ground of '${c.name}'`;
    case 'map': return "this map's headroom";
    default: return c.name ? `ceiling shape '${c.name}'` : 'ceiling shape';
  }
}

/** The ceiling at a map pixel, with the floor from the map's heights. */
export function ceilingAtPixel(
  map: TmjMap, patch: HeightPatch, ctx: CeilingContext, areas: CeilingArea[], x: number, y: number,
): Ceiling | null {
  return ceilingAt(map, heightAt(map, patch, x, y), ctx, areas, mapHeadroomCm(map), x, y);
}

/** Centre of cell (col, row) in map pixels. */
export function cellCentre(map: TmjMap, col: number, row: number): Pt {
  if (map.orientation === 'hexagonal') return hexCenter(hexLayout(map), col, row);
  return { x: (col + 0.5) * map.tilewidth, y: (row + 0.5) * map.tileheight };
}

/** Headroom value for a cell with no ceiling. */
export const OPEN_SKY = Number.POSITIVE_INFINITY;

/**
 * Headroom (cm) at each cell's centre (row-major, width x height), OPEN_SKY where there
 * is no ceiling: what the headroom overlay shades.
 */
export function headroomGrid(map: TmjMap, patch: HeightPatch, ctx: CeilingContext, areas: CeilingArea[]): Float64Array {
  const out = new Float64Array(map.width * map.height);
  const own = mapHeadroomCm(map);
  for (let row = 0; row < map.height; row++) {
    for (let col = 0; col < map.width; col++) {
      const c = cellCentre(map, col, row);
      const ceiling = ceilingAt(map, heightAt(map, patch, c.x, c.y), ctx, areas, own, c.x, c.y);
      out[row * map.width + col] = ceiling ? ceiling.headroomCm : OPEN_SKY;
    }
  }
  return out;
}

/**
 * How a cell's headroom compares with the map's own: 0 the same, -1 lower, +1 higher
 * (or open sky where the map has a headroom). Maps without one compare with open sky.
 */
export function headroomDifference(headroom: number, own: number | null): -1 | 0 | 1 {
  const base = own ?? OPEN_SKY;
  if (headroom === base) return 0;
  if (headroom === OPEN_SKY) return 1;
  if (base === OPEN_SKY) return -1;
  if (Math.abs(headroom - base) <= HEADROOM_TOLERANCE_CM) return 0;
  return headroom < base ? -1 : 1;
}
