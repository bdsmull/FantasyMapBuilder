/**
 * Spot heights (#8 phase 3c): known heights at points, e.g. a summit or a ford.
 *
 * Stored as Tiled point objects of type "spot height" with custom properties
 * `height` (float, meters) and `reach` (float, cells), in an object layer (the
 * editor creates "Spot heights" on first use). Tiled and game exports can read them.
 *
 * Fitting (with contour lines, see contours.ts and surfaceFit.ts) bends the current
 * surface so it passes through each spot, keeping its shape (terrain, generated
 * detail, painting): the difference at each spot is spread smoothly over the spot's
 * reach and fades to nothing at its edge. Hand-set heights are kept.
 */

import type { TmjMap, TmjObject, TmjProperty } from '../types/tmj';
import { isObjectLayer } from '../types/tmj';
import type { HeightPatch } from './heightGrid';
import { fitHeights } from './surfaceFit';
import type { FitResult, KnownHeight } from './surfaceFit';

export type { FitResult };

export const SPOT_TYPE = 'spot height';
export const SPOT_LAYER = 'Spot heights';
export const SPOT_HEIGHT_PROPERTY = 'height';
export const SPOT_REACH_PROPERTY = 'reach';
export const DEFAULT_REACH_CELLS = 10;
export const MIN_REACH_CELLS = 0.5;

export interface Spot {
  id: number;
  layerIndex: number;
  name: string;
  x: number;
  y: number;
  cm: number;
  reachCells: number;
}

function _num(props: TmjProperty[] | undefined, name: string): number | null {
  const v = props?.find((p) => p.name === name)?.value;
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Whether an object is a spot height (a point of type "spot height" with a height). */
export function isSpot(o: TmjObject): boolean {
  return o.type === SPOT_TYPE && _num(o.properties, SPOT_HEIGHT_PROPERTY) !== null;
}

/** All spot heights on the map, from every object layer. */
export function readSpots(map: TmjMap): Spot[] {
  const spots: Spot[] = [];
  map.layers.forEach((layer, layerIndex) => {
    if (!isObjectLayer(layer)) return;
    for (const o of layer.objects) {
      if (!isSpot(o)) continue;
      spots.push({
        id: o.id, layerIndex, name: o.name, x: o.x, y: o.y,
        cm: Math.round(_num(o.properties, SPOT_HEIGHT_PROPERTY)! * 100),
        reachCells: Math.max(MIN_REACH_CELLS, _num(o.properties, SPOT_REACH_PROPERTY) ?? DEFAULT_REACH_CELLS),
      });
    }
  });
  return spots;
}

/** A spot height object's properties for a height (cm) and reach (cells), keeping any others. */
export function spotProperties(existing: TmjProperty[] | undefined, cm: number, reachCells: number): TmjProperty[] {
  const rest = (existing ?? []).filter((p) => p.name !== SPOT_HEIGHT_PROPERTY && p.name !== SPOT_REACH_PROPERTY);
  return [
    ...rest,
    { name: SPOT_HEIGHT_PROPERTY, type: 'float', value: cm / 100 },
    { name: SPOT_REACH_PROPERTY, type: 'float', value: Math.max(MIN_REACH_CELLS, reachCells) },
  ];
}

/** The spot nearest (x, y) within `radius` map pixels, or null. */
export function spotNear(spots: Spot[], x: number, y: number, radius: number): Spot | null {
  let best: Spot | null = null, bestD = radius;
  for (const s of spots) {
    const d = Math.hypot(s.x - x, s.y - y);
    if (d <= bestD) { best = s; bestD = d; }
  }
  return best;
}

/** The spots as known heights for fitting (see surfaceFit.ts). */
export function spotTargets(spots: Spot[]): KnownHeight[] {
  return spots.map((s) => ({ x: s.x, y: s.y, cm: s.cm, reachCells: s.reachCells }));
}

/** Bend the surface so it passes through every spot. */
export function fitToSpots(map: TmjMap, patch: HeightPatch, spots: Spot[]): FitResult {
  return fitHeights(map, patch, spotTargets(spots));
}
