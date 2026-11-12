import { describe, it, expect } from 'vitest';
import { mapFromFile, mapToFile } from '../api/tmjFile';
import type { TmjMap } from '../types/tmj';

function mkMap(overrides: Partial<TmjMap> = {}): TmjMap {
  return {
    orientation: 'orthogonal', width: 2, height: 2, tilewidth: 32, tileheight: 32,
    nextlayerid: 1, nextobjectid: 1, tilesets: [], layers: [],
    ...overrides,
  };
}

describe('mapToFile', () => {
  it('moves scale, units and metersPerUnit into custom properties', () => {
    const file = mapToFile(mkMap({ scale: 'town', units: 'imperial', metersPerUnit: 7.5 }));
    expect(file).not.toHaveProperty('scale');
    expect(file).not.toHaveProperty('units');
    expect(file).not.toHaveProperty('metersPerUnit');
    expect(file.properties).toEqual([
      { name: 'scale', type: 'string', value: 'town' },
      { name: 'units', type: 'string', value: 'imperial' },
      { name: 'metersPerUnit', type: 'float', value: 7.5 },
    ]);
  });

  it('keeps unrelated custom properties and omits an empty properties array', () => {
    const other = { name: 'author', type: 'string' as const, value: 'Brad' };
    expect(mapToFile(mkMap({ scale: 'city', properties: [other] })).properties)
      .toEqual([other, { name: 'scale', type: 'string', value: 'city' }]);
    expect(mapToFile(mkMap())).not.toHaveProperty('properties');
  });

  it('replaces stale editor properties instead of duplicating them', () => {
    const stale = { name: 'scale', type: 'string' as const, value: 'world' };
    expect(mapToFile(mkMap({ scale: 'town', properties: [stale] })).properties)
      .toEqual([{ name: 'scale', type: 'string', value: 'town' }]);
  });
});

describe('mapFromFile', () => {
  it('reads the editor fields from custom properties', () => {
    const map = mapFromFile(mkMap({
      properties: [
        { name: 'scale', type: 'string', value: 'province' },
        { name: 'units', type: 'string', value: 'metric' },
        { name: 'metersPerUnit', type: 'float', value: 12 },
      ],
    }));
    expect(map.scale).toBe('province');
    expect(map.units).toBe('metric');
    expect(map.metersPerUnit).toBe(12);
    expect(map).not.toHaveProperty('properties');
  });

  it('still reads legacy top-level fields', () => {
    const map = mapFromFile(mkMap({ scale: 'site', units: 'imperial' }));
    expect(map.scale).toBe('site');
    expect(map.units).toBe('imperial');
  });

  it('prefers custom properties over legacy top-level fields', () => {
    const map = mapFromFile(mkMap({
      scale: 'world',
      properties: [{ name: 'scale', type: 'string', value: 'town' }],
    }));
    expect(map.scale).toBe('town');
  });

  it('ignores invalid units and keeps unrelated properties', () => {
    const other = { name: 'author', type: 'string' as const, value: 'Brad' };
    const map = mapFromFile(mkMap({
      properties: [{ name: 'units', type: 'string', value: 'cubits' }, other],
    }));
    expect(map).not.toHaveProperty('units');
    expect(map.properties).toEqual([other]);
  });

  it('round-trips through mapToFile', () => {
    const original = mkMap({ scale: 'battle', units: 'imperial', metersPerUnit: 3 });
    expect(mapFromFile(mapToFile(original))).toEqual(original);
  });
});
