/**
 * Roads and rivers across map scales (#6, 6b).
 *
 * Each line is stored once, on the map where it was drawn. The open map also shows
 * its ancestors' and descendants' lines as faded, read-only "ghost" lines, placed with
 * the same parent/child placement as elevation (worldSurface.placeChild):
 *   - descendants' lines appear inside their footprints;
 *   - ancestors' lines appear clipped to the open map's area.
 *
 * "Copy to this map" adopts the part of an ancestor's line inside the open map, tagged
 * `refines = <map>#<object id>`. The most detailed version wins inside its own map's
 * area: wherever a map holds a line that refines line L, L is hidden inside that map's
 * area (on every map that shows L), and the refining line is shown there instead.
 *
 * All the transforms involved are affine (pixels <-> cell space <-> placement), so a
 * related map's pixels map to the open map's pixels with one scale and offset per axis.
 *
 * Where the root map wraps (#36), an ancestor's line may reach the open map a turn (or more)
 * to either side of where it's placed, and maps that refine a line hide it there as well.
 */

import type { TmjMap, TmjObject } from '../types/tmj';
import type { WorldSetNode } from '../types/worldSet';
import { pixelToCell, placeChild } from './worldSurface';
import { hexLayout, hexMapPixelSize } from '../canvas/hexGeometry';
import { readLines, linePoints, readWidths } from './lines';
import type { Pt } from './lines';
import { shiftsOnto, turnPx, xSpan } from './worldWrap';

export const REFINES_PROPERTY = 'refines';

// ---------------------------------------------------------------------------
// Affine transforms (x' = x * sx + ox, y' = y * sy + oy)
// ---------------------------------------------------------------------------

export interface Affine { sx: number; sy: number; ox: number; oy: number }

export const IDENTITY: Affine = { sx: 1, sy: 1, ox: 0, oy: 0 };

export const apply = (a: Affine, p: Pt): Pt => ({ x: p.x * a.sx + a.ox, y: p.y * a.sy + a.oy });

/** First `a`, then `b`. */
export const compose = (a: Affine, b: Affine): Affine => ({ sx: a.sx * b.sx, sy: a.sy * b.sy, ox: a.ox * b.sx + b.ox, oy: a.oy * b.sy + b.oy });

export const invert = (a: Affine): Affine => ({ sx: 1 / a.sx, sy: 1 / a.sy, ox: -a.ox / a.sx, oy: -a.oy / a.sy });

/** Map pixels -> cell space, as an affine. */
function _pixelToCell(map: TmjMap): Affine {
  const o = pixelToCell(map, 0, 0), x = pixelToCell(map, 1, 0), y = pixelToCell(map, 0, 1);
  return { sx: x.u - o.u, sy: y.v - o.v, ox: o.u, oy: o.v };
}

/** A child's pixels -> its parent's pixels, given where the child sits. */
export function childToParent(
  child: TmjMap, childMPU: number, parent: TmjMap, parentMPU: number,
  anchor: { col: number; row: number }, offset?: { x: number; y: number } | null,
): Affine {
  const place = placeChild(child.width, child.height, childMPU, parentMPU, anchor, offset);
  const cellToParentCell: Affine = { sx: 1 / place.scale, sy: 1 / place.scale, ox: place.left, oy: place.top };
  return compose(compose(_pixelToCell(child), cellToParentCell), invert(_pixelToCell(parent)));
}

/** A map's area in its own pixels. */
export function mapExtent(map: TmjMap): Rect {
  if (map.orientation === 'hexagonal') {
    const s = hexMapPixelSize(hexLayout(map), map.width, map.height);
    return { x0: 0, y0: 0, x1: s.width, y1: s.height };
  }
  return { x0: 0, y0: 0, x1: map.width * map.tilewidth, y1: map.height * map.tileheight };
}

export interface Rect { x0: number; y0: number; x1: number; y1: number }

export const applyRect = (a: Affine, r: Rect): Rect => {
  const p = apply(a, { x: r.x0, y: r.y0 }), q = apply(a, { x: r.x1, y: r.y1 });
  return { x0: Math.min(p.x, q.x), y0: Math.min(p.y, q.y), x1: Math.max(p.x, q.x), y1: Math.max(p.y, q.y) };
};

// ---------------------------------------------------------------------------
// Related maps
// ---------------------------------------------------------------------------

/** A map on the open map's line of descent, with how its pixels map onto the open map's. */
export interface RelatedMap {
  name: string;
  map: TmjMap;
  /** < 0 for ancestors (−1 = parent), > 0 for descendants (1 = child). */
  depth: number;
  /** This map's pixels -> the open map's pixels. */
  toOpen: Affine;
  /** This map's area, in the open map's pixels. */
  rect: Rect;
}

export interface MapSource { map: TmjMap; mpu: number }

/**
 * The open map's ancestors (through Z = 0 links, up to the root) and Z = 0 descendants,
 * each placed in the open map's pixels. `include` can skip a descendant (e.g. too small).
 */
export function relatedMaps(
  open: string, nodes: WorldSetNode[], lookup: (name: string) => MapSource | undefined,
  include: (src: MapSource, rect: Rect) => boolean = () => true,
): RelatedMap[] {
  const out: RelatedMap[] = [];
  const self = lookup(open);
  if (!self) return out;
  const seen = new Set([open]);

  // Ancestors: a parent's pixels -> the open map's are the inverse of child -> parent, chained
  let child = open, childSrc = self, toOpen = IDENTITY, depth = 0;
  for (;;) {
    const node = nodes.find((n) => n.mapName === child);
    if (!node?.parentMapName || !node.parentAnchor || node.z !== 0 || seen.has(node.parentMapName)) break;
    const parentSrc = lookup(node.parentMapName);
    if (!parentSrc) break;
    const parentToChild = invert(childToParent(childSrc.map, childSrc.mpu, parentSrc.map, parentSrc.mpu, node.parentAnchor, node.parentOffset));
    toOpen = compose(parentToChild, toOpen);
    depth -= 1;
    seen.add(node.parentMapName);
    out.push({ name: node.parentMapName, map: parentSrc.map, depth, toOpen, rect: applyRect(toOpen, mapExtent(parentSrc.map)) });
    child = node.parentMapName;
    childSrc = parentSrc;
  }

  // Descendants, breadth first
  const walk = (name: string, src: MapSource, toOpenFromHere: Affine, d: number) => {
    for (const n of nodes) {
      if (n.parentMapName !== name || !n.parentAnchor || n.z !== 0 || seen.has(n.mapName)) continue;
      const kid = lookup(n.mapName);
      if (!kid) continue;
      const kidToOpen = compose(childToParent(kid.map, kid.mpu, src.map, src.mpu, n.parentAnchor, n.parentOffset), toOpenFromHere);
      const rect = applyRect(kidToOpen, mapExtent(kid.map));
      if (!include(kid, rect)) continue;
      seen.add(n.mapName);
      out.push({ name: n.mapName, map: kid.map, depth: d + 1, toOpen: kidToOpen, rect });
      walk(n.mapName, kid, kidToOpen, d + 1);
    }
  };
  walk(open, self, IDENTITY, 0);
  return out;
}

/** One turn of the world in the open map's pixels; 0 unless its top map wraps. */
export function worldTurn(openMap: TmjMap, related: RelatedMap[]): number {
  let top: RelatedMap | null = null;
  for (const m of related) if (m.depth < 0 && (!top || m.depth < top.depth)) top = m;
  return top ? turnPx(top.map) * top.toOpen.sx : turnPx(openMap);
}

/** Points moved east by `dx` pixels. */
export const shifted = (points: Pt[], dx: number): Pt[] => (dx ? points.map((p) => ({ x: p.x + dx, y: p.y })) : points);

// ---------------------------------------------------------------------------
// Refinement links
// ---------------------------------------------------------------------------

export const lineKey = (mapName: string, id: number) => `${mapName}#${id}`;

/** The `refines` link of a line, if any: the source map and object ID. */
export function refinesOf(o: TmjObject): { map: string; id: number } | null {
  const v = o.properties?.find((p) => p.name === REFINES_PROPERTY)?.value;
  if (typeof v !== 'string') return null;
  const i = v.lastIndexOf('#');
  const id = Number(v.slice(i + 1));
  return i > 0 && Number.isInteger(id) ? { map: v.slice(0, i), id } : null;
}

/**
 * Which maps refine each line: "<map>#<id>" -> names of the maps holding a line that
 * refines it. Built from the related maps and the open map's own (live) lines.
 */
export function refinedByIndex(openName: string, openMap: TmjMap, related: RelatedMap[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  const add = (mapName: string, map: TmjMap) => {
    for (const { object } of readLines(map)) {
      const r = refinesOf(object);
      if (!r) continue;
      const key = lineKey(r.map, r.id);
      const list = index.get(key) ?? [];
      if (!list.includes(mapName)) list.push(mapName);
      index.set(key, list);
    }
  };
  add(openName, openMap);
  for (const m of related) add(m.name, m.map);
  return index;
}

/**
 * Areas (open-map pixels) where line `key` is hidden because a more detailed map
 * refines it there. The open map's own refinement hides it across the whole open map.
 * For the open map's own line in a world that wraps (`turn`, see worldTurn), on every turn
 * its `points` reach. (Other maps' lines come with the areas in step.)
 */
export function hiddenAreas(
  key: string, index: Map<string, string[]>, openName: string, openRect: Rect, related: RelatedMap[], turn = 0, points: Pt[] = [],
): Rect[] {
  const areas = (index.get(key) ?? []).map((name) => (name === openName ? openRect : related.find((m) => m.name === name)?.rect))
    .filter((r): r is Rect => !!r);
  if (!turn || !areas.length) return areas;
  const { x0, x1 } = xSpan(points);
  return areas.flatMap((r) => shiftsOnto(turn, r.x0, r.x1, x0, x1).map((s) => ({ ...r, x0: r.x0 + s, x1: r.x1 + s })));
}

// ---------------------------------------------------------------------------
// Ghost lines
// ---------------------------------------------------------------------------

/** A line from another map, placed in the open map's pixels. */
export interface GhostLine {
  /** "<source map>#<id>". */
  key: string;
  source: RelatedMap;
  object: TmjObject;
  /** The line as an object positioned in the open map's pixels (widths kept). */
  placed: TmjObject;
  /**
   * The same, for every turn of a wrapped world on which an ancestor's line reaches the open
   * map (more than one when the line runs right round). Otherwise just `placed`.
   */
  copies: TmjObject[];
  /** Ancestors' lines are only shown inside the open map's area. */
  clipTo: Rect | null;
}

/**
 * Ghost lines from every related map, whatever their layer's visibility (lines hidden by
 * themselves are skipped). `turn`: one turn of the world (see worldTurn).
 */
export function ghostLines(related: RelatedMap[], openRect: Rect, turn = 0): GhostLine[] {
  const out: GhostLine[] = [];
  for (const m of related) {
    for (const { object } of readLines(m.map, true)) {
      const pts = linePoints(object).map((p) => apply(m.toOpen, p));
      const { x0, x1 } = xSpan(pts);
      const shifts = m.depth < 0 ? shiftsOnto(turn, x0, x1, openRect.x0, openRect.x1) : [0];
      const copies = (shifts.length ? shifts : [0]).map((s): TmjObject => ({ ...object, x: 0, y: 0, polyline: shifted(pts, s) }));
      out.push({
        key: lineKey(m.name, object.id),
        source: m,
        object,
        placed: copies[0],
        copies,
        clipTo: m.depth < 0 ? openRect : null,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Copy to this map
// ---------------------------------------------------------------------------

/** Liang–Barsky: the part of segment a-b inside `r`, as parameters [t0, t1], or null. */
function _clipSegment(a: Pt, b: Pt, r: Rect): [number, number] | null {
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x - r.x0], [dx, r.x1 - a.x], [-dy, a.y - r.y0], [dy, r.y1 - a.y]] as const) {
    if (p === 0) { if (q < 0) return null; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; }
  }
  return [t0, t1];
}

/**
 * The parts of a polyline inside `r` (each with 2+ points), keeping the widths of the
 * points that are kept; points added at the edge get a blank width (the class width).
 */
export function clipPolyline(points: Pt[], widths: (number | null)[], r: Rect): { points: Pt[]; widths: (number | null)[] }[] {
  const pieces: { points: Pt[]; widths: (number | null)[] }[] = [];
  let cur: { points: Pt[]; widths: (number | null)[] } | null = null;
  const at = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i], b = points[i + 1];
    const c = _clipSegment(a, b, r);
    if (!c) { if (cur) { pieces.push(cur); cur = null; } continue; }
    const [t0, t1] = c;
    if (!cur) cur = t0 === 0 ? { points: [a], widths: [widths[i] ?? null] } : { points: [at(a, b, t0)], widths: [null] };
    if (t1 === 1) {
      cur.points.push(b);
      cur.widths.push(widths[i + 1] ?? null);
    } else {
      cur.points.push(at(a, b, t1));
      cur.widths.push(null);
      pieces.push(cur);
      cur = null;
    }
  }
  if (cur) pieces.push(cur);
  return pieces.filter((p) => p.points.length >= 2);
}

/** The pieces of a ghost line inside the open map, ready to add as lines. */
export function adoptPieces(ghost: GhostLine, openRect: Rect): { points: Pt[]; widths: (number | null)[] }[] {
  return ghost.copies.flatMap((c) => clipPolyline(c.polyline ?? [], readWidths(ghost.object), openRect));
}
