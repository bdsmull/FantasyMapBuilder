/**
 * Conversion between .tmj files and the in-memory TmjMap.
 *
 * The editor keeps `scale`, `units` and `metersPerUnit` as plain fields on
 * TmjMap. The Tiled JSON map format has no such fields, and Tiled drops
 * unknown top-level fields when it saves a map, so on disk they are stored
 * as Tiled custom properties in the map's `properties` array.
 *
 * Reading accepts both forms (custom properties win over the legacy
 * top-level fields); writing produces only custom properties.
 */

import type { TmjMap, TmjProperty } from '../types/tmj';

/** Custom property names the editor manages itself. */
const _EDITOR_PROPERTY_NAMES = new Set(['scale', 'units', 'metersPerUnit']);

/** Convert a map as stored in a .tmj file to the in-memory form. */
export function mapFromFile(raw: TmjMap): TmjMap {
  const props = raw.properties ?? [];
  const prop = (name: string) => props.find((p) => p.name === name)?.value;

  const scale = prop('scale') ?? raw.scale;
  const units = prop('units') ?? raw.units;
  const metersPerUnit = prop('metersPerUnit') ?? raw.metersPerUnit;
  const otherProps = props.filter((p) => !_EDITOR_PROPERTY_NAMES.has(p.name));

  const {
    scale: _scale, units: _units, metersPerUnit: _mpu, properties: _props, ...rest
  } = raw;
  return {
    ...rest,
    ...(otherProps.length > 0 ? { properties: otherProps } : {}),
    ...(typeof scale === 'string' && scale ? { scale } : {}),
    ...(units === 'metric' || units === 'imperial' ? { units } : {}),
    ...(typeof metersPerUnit === 'number' && Number.isFinite(metersPerUnit) ? { metersPerUnit } : {}),
  };
}

/** Convert an in-memory map to the form written to a .tmj file. */
export function mapToFile(map: TmjMap): TmjMap {
  const { scale, units, metersPerUnit, properties, ...rest } = map;
  const editorProps: TmjProperty[] = [];
  if (scale) editorProps.push({ name: 'scale', type: 'string', value: scale });
  if (units) editorProps.push({ name: 'units', type: 'string', value: units });
  if (metersPerUnit != null) editorProps.push({ name: 'metersPerUnit', type: 'float', value: metersPerUnit });

  const allProps = [
    ...(properties ?? []).filter((p) => !_EDITOR_PROPERTY_NAMES.has(p.name)),
    ...editorProps,
  ];
  return { ...rest, ...(allProps.length > 0 ? { properties: allProps } : {}) };
}
