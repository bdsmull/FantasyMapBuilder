/**
 * Water bodies (#8 phase 4): named lakes and seas with a flat surface height, filled
 * from a point the way real water fills a basin.
 *
 * A water body is a Tiled point object of type "water" with a `height` property (the
 * surface, float meters). The water covers every place connected to the point whose
 * ground is lower than the surface. The editor keeps them in a "Water" object layer.
 *
 * The sea needs no object: ground below 0 m that connects to the map's edge is sea,
 * unless the map's `sea` custom property is false. An inland basin below sea level stays
 * dry unless a water body is placed in it.
 */

import type { TmjMap, TmjObject, TmjProperty } from '../types/tmj';
import { isObjectLayer } from '../types/tmj';
import type { HeightPatch } from './heightGrid';
import { heightAt, hexHeightWeights } from './heightGrid';
import { sampleNeighbours } from './terrainHeights';
import { canonicalSample, mirrorSeam, wrapsX } from './worldWrap';

export const WATER_TYPE = 'water';
export const WATER_LAYER = 'Water';
export const WATER_HEIGHT_PROPERTY = 'height';
/** Map custom property (bool): false turns the automatic sea off. */
export const SEA_PROPERTY = 'sea';
/** Sea level, cm. */
export const SEA_LEVEL_CM = 0;
/** Surface value for a dry sample. */
export const NO_WATER = -2_147_483_648;
/** `WaterMap.body` value for the sea. */
export const SEA_BODY = -1;

export interface WaterBody {
  id: number;
  layerIndex: number;
  name: string;
  x: number;
  y: number;
  /** Surface height, cm. */
  cm: number;
}

function _num(props: TmjProperty[] | undefined, name: string): number | null {
  const v = props?.find((p) => p.name === name)?.value;
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Whether an object is a water body (a point of type "water" with a height). */
export function isWaterBody(o: TmjObject): boolean {
  return o.type === WATER_TYPE && _num(o.properties, WATER_HEIGHT_PROPERTY) !== null && !o.polyline && !o.polygon;
}

/** All water bodies on the map, from every object layer. */
export function readWaterBodies(map: TmjMap): WaterBody[] {
  const out: WaterBody[] = [];
  map.layers.forEach((layer, layerIndex) => {
    if (!isObjectLayer(layer)) return;
    for (const o of layer.objects) {
      if (!isWaterBody(o)) continue;
      out.push({ id: o.id, layerIndex, name: o.name, x: o.x, y: o.y, cm: Math.round(_num(o.properties, WATER_HEIGHT_PROPERTY)! * 100) });
    }
  });
  return out;
}

/** A water body's properties for a surface height (cm), keeping any others. */
export function waterProperties(existing: TmjProperty[] | undefined, cm: number): TmjProperty[] {
  return [...(existing ?? []).filter((p) => p.name !== WATER_HEIGHT_PROPERTY), { name: WATER_HEIGHT_PROPERTY, type: 'float', value: cm / 100 }];
}

/** Whether the map has the automatic sea (on unless its `sea` property is false). */
export function seaEnabled(map: TmjMap): boolean {
  const v = map.properties?.find((p) => p.name === SEA_PROPERTY)?.value;
  return v !== false && v !== 'false';
}

/** The map's properties with the sea switched on (property removed) or off. */
export function withSea(props: TmjProperty[] | undefined, on: boolean): TmjProperty[] {
  const rest = (props ?? []).filter((p) => p.name !== SEA_PROPERTY);
  return on ? rest : [...rest, { name: SEA_PROPERTY, type: 'bool', value: false }];
}

/** The body nearest (x, y) within `radius` map pixels, or null. */
export function waterBodyNear(bodies: WaterBody[], x: number, y: number, radius: number): WaterBody | null {
  let best: WaterBody | null = null, bestD = radius;
  for (const b of bodies) {
    const d = Math.hypot(b.x - x, b.y - y);
    if (d <= bestD) { best = b; bestD = d; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Filling
// ---------------------------------------------------------------------------

export interface BodyFill {
  /** Samples under this body's water. */
  samples: number;
  /** Deepest point, cm. */
  maxDepthCm: number;
  /** The ground at the point is above the surface, so nothing fills. */
  dry: boolean;
  /** The water reaches the map's edge (it would spill beyond this map). */
  reachesEdge: boolean;
}

export interface WaterMap {
  /** Water surface (cm) at each height sample, NO_WATER where dry. */
  surface: Int32Array;
  /** Which water each wet sample belongs to: an index into the bodies, or SEA_BODY. */
  body: Int32Array;
  /** Per water body (same order as the input), what it fills. */
  fills: BodyFill[];
  /** Samples under the sea. */
  seaSamples: number;
}

/** The height samples a map pixel reads its height from (square: the 4 corners; hex: a triangle). */
export function samplesAt(map: TmjMap, patch: Pick<HeightPatch, 'cols' | 'rows'>, x: number, y: number): number[] {
  if (map.orientation === 'hexagonal') return hexHeightWeights(map, x, y).map((s) => s.row * patch.cols + s.col);
  const fx = Math.min(Math.max(x / map.tilewidth, 0), patch.cols - 1), fy = Math.min(Math.max(y / map.tileheight, 0), patch.rows - 1);
  const c0 = Math.floor(fx), r0 = Math.floor(fy);
  const c1 = Math.min(c0 + 1, patch.cols - 1), r1 = Math.min(r0 + 1, patch.rows - 1);
  return [...new Set([r0 * patch.cols + c0, r0 * patch.cols + c1, r1 * patch.cols + c0, r1 * patch.cols + c1])];
}

/** Whether a sample is on the edge of the map; a wrapped map only ends at the top and bottom. */
const _onEdge = (i: number, cols: number, rows: number, wrap: boolean) => {
  const col = i % cols, row = (i - col) / cols;
  return row === 0 || row === rows - 1 || (!wrap && (col === 0 || col === cols - 1));
};

/**
 * Where the water is: each body fills the samples connected to its point that lie
 * below its surface; the sea fills ground below sea level connected to the map's edge.
 * Where waters overlap, the higher surface wins. On a wrapped map water runs across the
 * seam, and only the top and bottom are edges.
 */
export function computeWater(map: TmjMap, patch: Pick<HeightPatch, 'cols' | 'rows' | 'cm'>, bodies: WaterBody[], sea: boolean): WaterMap {
  const { cols, rows, cm } = patch;
  const n = cols * rows;
  const surface = new Int32Array(n).fill(NO_WATER);
  const body = new Int32Array(n).fill(-2);
  const neighbours = sampleNeighbours(map, cols, rows);
  const wrap = wrapsX(map), canonical = canonicalSample(map, cols);
  const seen = new Uint8Array(n);

  /** Flood from the seeds through samples below `level`; returns the samples reached. */
  const flood = (seeds: number[], level: number): number[] => {
    seen.fill(0);
    const out: number[] = [];
    const queue: number[] = [];
    for (const s of seeds) if (!seen[s] && cm[s] < level) { seen[s] = 1; queue.push(s); }
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head];
      out.push(i);
      for (const j of neighbours(i)) if (!seen[j] && cm[j] < level) { seen[j] = 1; queue.push(j); }
    }
    return out;
  };
  const claim = (samples: number[], level: number, id: number) => {
    for (const i of samples) if (level > surface[i]) { surface[i] = level; body[i] = id; }
  };

  let seaSamples = 0;
  if (sea) {
    const edge: number[] = [];
    for (let i = 0; i < n; i++) if (_onEdge(i, cols, rows, wrap)) edge.push(canonical(i));
    const wet = flood(edge, SEA_LEVEL_CM);
    claim(wet, SEA_LEVEL_CM, SEA_BODY);
  }
  const fills = bodies.map((b, k) => {
    // Start from the lowest sample the point reads from, so a point on a slope still fills
    const start = samplesAt(map, patch, b.x, b.y).sort((a, c) => cm[a] - cm[c])[0];
    const wet = flood([canonical(start)], b.cm);
    claim(wet, b.cm, k);
    let maxDepth = 0, edge = false;
    for (const i of wet) {
      maxDepth = Math.max(maxDepth, b.cm - cm[i]);
      if (_onEdge(i, cols, rows, wrap)) edge = true;
    }
    return { samples: wet.length, maxDepthCm: maxDepth, dry: wet.length === 0, reachesEdge: edge };
  });
  if (sea) for (let i = 0; i < n; i++) if (body[i] === SEA_BODY) seaSamples++; // before the twin column is filled in
  mirrorSeam(map, surface, cols);
  mirrorSeam(map, body, cols);
  return { surface, body, fills, seaSamples };
}

/** Area of one height sample, m² (a cell; corner samples on square maps stand for one cell each). */
export function sampleAreaM2(metersPerUnit: number): number {
  return metersPerUnit * metersPerUnit;
}

/**
 * The water at a map pixel, or null where it's dry: which body, its surface and the
 * depth there. Matches the overlay: a point is under water when the ground is below the
 * highest surface among the samples around it.
 */
export function waterAt(
  map: TmjMap, patch: Pick<HeightPatch, 'cols' | 'rows' | 'cm'>, water: WaterMap, bodies: WaterBody[], x: number, y: number,
): { name: string; sea: boolean; surfaceCm: number; depthCm: number } | null {
  let level = NO_WATER, which = -2;
  for (const i of samplesAt(map, patch, x, y)) if (water.surface[i] > level) { level = water.surface[i]; which = water.body[i]; }
  if (level === NO_WATER) return null;
  const ground = heightAt(map, patch as HeightPatch, x, y);
  if (ground >= level) return null;
  const sea = which === SEA_BODY;
  return { name: sea ? 'Sea' : bodies[which]?.name || 'Unnamed water', sea, surfaceCm: level, depthCm: level - ground };
}
