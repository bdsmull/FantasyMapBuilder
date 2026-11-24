/**
 * Map scale presets.
 *
 * Each level has a metric and an imperial cell size. Which one applies to a map
 * is decided by its unit system: the map's own `units` field if set, otherwise
 * the active world set's `units`, otherwise DEFAULT_UNIT_SYSTEM (metric).
 *
 * The table itself is mapScales.json, which the server reads too (server/map_scales.py).
 * To add, remove, or rename a scale level, edit that file, then restart the server. The
 * world-coordinate libraries in clients/ carry their own copies, for use outside this
 * repository: their tests fail until those match. Each entry needs:
 *   id           – stable key stored in the .tmj file (never change once maps exist)
 *   label        – display name shown in the UI
 *   metric       – cell size in meters + display string
 *   imperial     – cell size in feet + display string
 *   defaultShape – suggested map type for new maps; any level may use either shape
 */

import type { TmjMap } from '../types/tmj';
import scales from './mapScales.json';

export type UnitSystem = 'metric' | 'imperial';

/** Unit system used when neither the map nor the world set specifies one. */
export const DEFAULT_UNIT_SYSTEM: UnitSystem = 'metric';

/** Exact by definition (international foot). Meters are the internal unit for size math. */
const _METERS_PER_FOOT = 0.3048;

export interface MapScale {
  id: string;
  label: string;
  metric: { metersPerUnit: number; unit: string };
  imperial: { feetPerUnit: number; unit: string };
  defaultShape: 'tile' | 'hex';
}

export const MAP_SCALES = scales as MapScale[];

export const MAP_SCALE_BY_ID: Record<string, MapScale> = Object.fromEntries(MAP_SCALES.map((s) => [s.id, s]));

/** Default scale id for a new or unscaled map of the given shape. */
export function defaultScaleForShape(shape: 'tile' | 'hex'): string {
  return shape === 'hex' ? 'town' : 'battle';
}

/** Cell size of a preset in meters, for the given unit system. */
export function scaleMetersPerUnit(scale: MapScale, units: UnitSystem): number {
  return units === 'imperial'
    ? scale.imperial.feetPerUnit * _METERS_PER_FOOT
    : scale.metric.metersPerUnit;
}

/** Returns the full display string, e.g. "Dungeon Scale (5 m)" */
export function scaleLabel(id: string, units: UnitSystem = DEFAULT_UNIT_SYSTEM): string {
  const s = MAP_SCALE_BY_ID[id];
  return s ? `${s.label} (${s[units].unit})` : id;
}

/** The unit system that applies to a map: its own override, else the given default. */
export function resolveUnits(
  data: TmjMap | undefined,
  defaultUnits: UnitSystem = DEFAULT_UNIT_SYSTEM,
): UnitSystem {
  return data?.units ?? defaultUnits;
}

/**
 * Resolve a map's cell size in meters (the common unit for footprint math).
 * A recognised scale preset wins, sized by the map's unit system; otherwise a
 * custom `metersPerUnit` on the map is used. Returns undefined when neither is set.
 */
export function resolveMetersPerUnit(
  data: TmjMap | undefined,
  defaultUnits: UnitSystem = DEFAULT_UNIT_SYSTEM,
): number | undefined {
  if (!data) return undefined;
  const preset = data.scale ? MAP_SCALE_BY_ID[data.scale] : undefined;
  if (preset) return scaleMetersPerUnit(preset, resolveUnits(data, defaultUnits));
  return data.metersPerUnit ?? undefined;
}
