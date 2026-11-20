import { describe, it, expect } from 'vitest';
import {
  tileTerrainHeight, terrainLookup, cellTerrain, heightsFromTerrain, hasTerrainHeights,
  suggestTerrainHeight, withTerrainHeight, sampleNeighbours, terrainGaps, describeTerrainGaps,
} from '../utils/terrainHeights';
import { builtinTilesetFor, COARSE_DETAIL_TILESET, FINE_DETAIL_TILESET } from '../data/defaultTilesets';
import { hexNeighbours } from '../utils/heightGrid';
import { createPatch } from '../utils/heightGrid';
import { useMapStore } from '../store/mapStore';
import type { TmjMap, TmjTileLayer, TmjTileEntry } from '../types/tmj';

const tile = (id: number, type: string, base?: number | string, relief?: number): TmjTileEntry => ({
  id, type, properties: [
    { name: 'color_r', type: 'int', value: 1 },
    ...(base !== undefined ? [{ name: 'heightBase', type: 'float' as const, value: base }] : []),
    ...(relief !== undefined ? [{ name: 'heightRelief', type: 'float' as const, value: relief }] : []),
  ],
});
const layer = (id: number, w: number, h: number, data: number[]): TmjTileLayer => ({
  type: 'tilelayer', id, name: `L${id}`, width: w, height: h, visible: true, opacity: 1, offsetx: 0, offsety: 0, data,
});
// GIDs: 1 Plains 100 m, 2 Hills 400 m, 3 Road (no settings), 4 Mountains 2000 m
const tileset = {
  firstgid: 1, name: 'Terrain', tilewidth: 16, tileheight: 16, tilecount: 4, columns: 4, image: '',
  tiles: [tile(0, 'Plains', 100, 20), tile(1, 'Hills', 400, 150), tile(2, 'Road'), tile(3, 'Mountains', '2000')],
};
const square = (w: number, h: number, layers: TmjTileLayer[]): TmjMap => ({
  orientation: 'orthogonal', width: w, height: h, tilewidth: 16, tileheight: 16,
  nextlayerid: 9, nextobjectid: 1, tilesets: [tileset], layers,
});

describe('tile settings', () => {
  it('reads base and relief in cm; a string base is accepted; relief is never negative', () => {
    expect(tileTerrainHeight(tile(0, 'x', 100, 20))).toEqual({ baseCm: 10000, reliefCm: 2000 });
    expect(tileTerrainHeight(tile(0, 'x', '12.5'))).toEqual({ baseCm: 1250, reliefCm: 0 });
    expect(tileTerrainHeight(tile(0, 'x', 0, -5))).toEqual({ baseCm: 0, reliefCm: 0 });
    expect(tileTerrainHeight(tile(0, 'x'))).toBeNull();
  });

  it('looks tiles up by GID, ignoring flip flags', () => {
    const lookup = terrainLookup(square(1, 1, []));
    expect(lookup(2)?.baseCm).toBe(40000);
    expect(lookup((0x80000000 | 2) >>> 0)?.baseCm).toBe(40000);
    expect(lookup(3)).toBeNull();
    expect(lookup(0)).toBeNull();
    expect(hasTerrainHeights(square(1, 1, []))).toBe(true);
  });

  it('a cell takes the topmost layer with settings: a road over hills is hills', () => {
    const map = square(2, 1, [layer(1, 2, 1, [2, 1]), layer(2, 2, 1, [3, 4])]);
    expect(cellTerrain(map).map((t) => t?.baseCm)).toEqual([40000, 200000]);
  });
});

describe('heightsFromTerrain', () => {
  it('ramps between types instead of a cliff, keeps hand-set and unpainted samples', () => {
    // Row of 6 cells: Plains x3, Hills x3; one row
    const map = square(6, 1, [layer(1, 6, 1, [1, 1, 1, 2, 2, 2])]);
    const patch = createPatch(map, -999);
    const { cm, changed } = heightsFromTerrain(map, patch);
    expect(changed).toBe(14);
    const row = Array.from(cm.slice(0, 7));
    for (let i = 1; i < row.length; i++) expect(row[i]).toBeGreaterThanOrEqual(row[i - 1]);
    expect(row[0]).toBeCloseTo(10000, -2);
    expect(row[6]).toBeCloseTo(40000, -2);
    expect(row[3]).toBe(25000); // the boundary corner: halfway

    patch.mask[3] = 1;
    expect(heightsFromTerrain(map, patch).cm[3]).toBe(-999);

    const bare = square(2, 1, [layer(1, 2, 1, [3, 0])]);
    const r = heightsFromTerrain(bare, createPatch(bare, 55));
    expect(r.changed).toBe(0);
    expect(Array.from(r.cm)).toEqual(new Array(6).fill(55));
  });

  it('a hex map of one type is that type everywhere', () => {
    const map: TmjMap = {
      ...square(5, 5, [layer(1, 5, 5, new Array(25).fill(4))]),
      orientation: 'hexagonal', tilewidth: 80, tileheight: 70, hexsidelength: 40, staggeraxis: 'x', staggerindex: 'odd',
    };
    const { cm, changed } = heightsFromTerrain(map, createPatch(map, 0));
    expect(changed).toBe(25);
    expect(new Set(cm)).toEqual(new Set([200000]));
  });
});

describe('sampleNeighbours (hex)', () => {
  it('matches hexNeighbours for every hex, for each stagger', () => {
    for (const [staggeraxis, staggerindex] of [['x', 'odd'], ['x', 'even'], ['y', 'odd'], ['y', 'even']] as const) {
      const map: TmjMap = {
        ...square(7, 6, []), orientation: 'hexagonal', tilewidth: 80, tileheight: 70, hexsidelength: 40, staggeraxis, staggerindex,
      };
      const ns = sampleNeighbours(map, 7, 6);
      for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 7; col++) {
          const expected = hexNeighbours(map, col, row).map((n) => n.row * 7 + n.col).sort((a, b) => a - b);
          expect(ns(row * 7 + col).sort((a, b) => a - b)).toEqual(expected);
        }
      }
    }
  });
});

describe('suggestions', () => {
  it('recognises common names, most specific first', () => {
    expect(suggestTerrainHeight('Flood Plain')?.baseM).toBe(10);
    expect(suggestTerrainHeight('Plains')?.baseM).toBe(100);
    expect(suggestTerrainHeight('Mountains')).toEqual({ baseM: 2000, reliefM: 800 });
    expect(suggestTerrainHeight('Deep Ocean')?.baseM).toBe(-3000);
    expect(suggestTerrainHeight('Low Ice')?.baseM).toBe(200);
    expect(suggestTerrainHeight('Canyon')).toBeNull();
  });

  it('replaces only the height properties', () => {
    const props = withTerrainHeight(tile(0, 'x', 1, 1).properties, 5, null);
    expect(props).toEqual([{ name: 'color_r', type: 'int', value: 1 }, { name: 'heightBase', type: 'float', value: 5 }]);
  });
});

describe('setTileProperties (store)', () => {
  it('changes the tiles in one tileset and marks the map changed', () => {
    const s = () => useMapStore.getState();
    s().loadMap(square(1, 1, [layer(1, 1, 1, [1])]), 'm', 'ws');
    s().setTileProperties(1, { 2: withTerrainHeight([], 3, 1) });
    const t = s().mapData!.tilesets[0].tiles[2];
    expect(tileTerrainHeight(t)).toEqual({ baseCm: 300, reliefCm: 100 });
    expect(s().isDirty).toBe(true);
    expect(s().mapData!.tilesets[0].tiles[0]).toBe(tileset.tiles[0]);
  });
});

describe('terrain without base heights', () => {
  // A second tileset (GIDs 5-6) with no height settings at all
  const plain = {
    firstgid: 5, name: 'Default Hex', tilewidth: 16, tileheight: 16, tilecount: 2, columns: 2, image: '',
    tiles: [tile(0, 'Plains'), tile(1, 'Forest')],
  };
  const map = (data: number[], top?: number[]): TmjMap => ({
    ...square(3, 2, [layer(1, 3, 2, data), ...(top ? [layer(2, 3, 2, top)] : [])]),
    tilesets: [tileset, plain],
  });

  it('lists the painted types that left cells without a height, most cells first, and empty cells', () => {
    const { gaps, emptyCells } = terrainGaps(map([5, 6, 6, 1, 3, 0]));
    expect(gaps).toEqual([
      { tileset: 'Default Hex', type: 'Forest', cells: 2 },
      { tileset: 'Default Hex', type: 'Plains', cells: 1 },
      { tileset: 'Terrain', type: 'Road', cells: 1 },
    ]);
    expect(emptyCells).toBe(1);
    expect(describeTerrainGaps(gaps, emptyCells)).toBe(
      'No base height for Forest, Plains (Default Hex); Road (Terrain): 4 cells kept their current height. '
      + '1 unpainted cell kept its current height.',
    );
  });

  it('a road over terrain with a height is not a gap; nothing missing says nothing', () => {
    expect(terrainGaps(map([1, 2, 4, 1, 2, 4], [3, 3, 0, 0, 0, 0])).gaps).toEqual([]);
    expect(describeTerrainGaps([], 0)).toBe('');
  });
});

describe('built-in tilesets', () => {
  it('Coarse Detail for Town scale and larger, Fine Detail for Site and smaller, else by shape', () => {
    expect(COARSE_DETAIL_TILESET.name).toBe('Coarse Detail');
    expect(FINE_DETAIL_TILESET.name).toBe('Fine Detail');
    expect(builtinTilesetFor('town', 'orthogonal')).toBe(COARSE_DETAIL_TILESET);
    expect(builtinTilesetFor('world', 'orthogonal')).toBe(COARSE_DETAIL_TILESET);
    expect(builtinTilesetFor('site', 'hexagonal')).toBe(FINE_DETAIL_TILESET);
    expect(builtinTilesetFor(undefined, 'hexagonal')).toBe(COARSE_DETAIL_TILESET);
    expect(builtinTilesetFor('custom', 'orthogonal')).toBe(FINE_DETAIL_TILESET);
  });
});
