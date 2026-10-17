/**
 * Map scale presets.
 *
 * Each level has a metric and an imperial cell size. Which one applies to a map
 * is decided by its unit system: the map's own `units` field if set, otherwise
 * the active world set's `units`, otherwise DEFAULT_UNIT_SYSTEM (metric).
 *
 * To add, remove, or rename a scale level, edit the MAP_SCALES array below.
 * Each entry needs:
 *   id           – stable key stored in the .tmj file (never change once maps exist)
 *   label        – display name shown in the UI
 *   metric       – cell size in meters + display string
 *   imperial     – cell size in feet + display string
 *   defaultShape – suggested map type for new maps; any level may use either shape
 */

import type { TmjMap } from '../types/tmj';

export type UnitSystem = 'metric' | 'imperial';

/** Unit system used when neither the map nor the world set specifies one. */
export const DEFAULT_UNIT_SYSTEM: UnitSystem = 'metric';

/** Exact by definition (international foot). Meters are the internal unit for size math. */
const _METERS_PER_FOOT = 0.3048;
const _FEET_PER_MILE = 5280;

export interface MapScale {
  id: string;
  label: string;
  metric: { metersPerUnit: number; unit: string };
  imperial: { feetPerUnit: number; unit: string };
  defaultShape: 'tile' | 'hex';
}

export const MAP_SCALES: MapScale[] = [
  { id: 'room',      label: 'Room Scale',      metric: { metersPerUnit: 1,      unit: '1 m' },    imperial: { feetPerUnit: 2,                    unit: '2 ft' },   defaultShape: 'tile' },
  { id: 'battle',    label: 'Battle Scale',    metric: { metersPerUnit: 2,      unit: '2 m' },    imperial: { feetPerUnit: 5,                    unit: '5 ft' },   defaultShape: 'tile' },
  { id: 'dungeon',   label: 'Dungeon Scale',   metric: { metersPerUnit: 5,      unit: '5 m' },    imperial: { feetPerUnit: 10,                   unit: '10 ft' },  defaultShape: 'tile' },
  { id: 'site',      label: 'Site Scale',      metric: { metersPerUnit: 10,     unit: '10 m' },   imperial: { feetPerUnit: 30,                   unit: '30 ft' },  defaultShape: 'tile' },
  { id: 'town',      label: 'Town Scale',      metric: { metersPerUnit: 50,     unit: '50 m' },   imperial: { feetPerUnit: 150,                  unit: '150 ft' }, defaultShape: 'hex'  },
  { id: 'city',      label: 'City Scale',      metric: { metersPerUnit: 250,    unit: '250 m' },  imperial: { feetPerUnit: _FEET_PER_MILE / 8,   unit: '⅛ mi' },   defaultShape: 'hex'  },
  { id: 'local',     label: 'Local Scale',     metric: { metersPerUnit: 1e3,    unit: '1 km' },   imperial: { feetPerUnit: _FEET_PER_MILE,       unit: '1 mi' },   defaultShape: 'hex'  },
  { id: 'province',  label: 'Province Scale',  metric: { metersPerUnit: 5e3,    unit: '5 km' },   imperial: { feetPerUnit: _FEET_PER_MILE * 6,   unit: '6 mi' },   defaultShape: 'hex'  },
  { id: 'kingdom',   label: 'Kingdom Scale',   metric: { metersPerUnit: 25e3,   unit: '25 km' },  imperial: { feetPerUnit: _FEET_PER_MILE * 30,  unit: '30 mi' },  defaultShape: 'hex'  },
  { id: 'continent', label: 'Continent Scale', metric: { metersPerUnit: 100e3,  unit: '100 km' }, imperial: { feetPerUnit: _FEET_PER_MILE * 100, unit: '100 mi' }, defaultShape: 'hex'  },
  { id: 'world',     label: 'World Scale',     metric: { metersPerUnit: 500e3,  unit: '500 km' }, imperial: { feetPerUnit: _FEET_PER_MILE * 500, unit: '500 mi' }, defaultShape: 'hex'  },
];

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
