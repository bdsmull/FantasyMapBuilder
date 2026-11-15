import { describe, it, expect } from 'vitest';
import { applyTilesetRefs, tilesetImageUrl } from '../api/client';
import type { TmjMap, TmjTileset } from '../types/tmj';

function ts(firstgid: number, name: string, source?: string): TmjTileset {
  return {
    firstgid, name, tilewidth: 16, tileheight: 16, tilecount: 2, columns: 8, tiles: [],
    ...(source ? { source } : {}),
  };
}

function map(...tilesets: TmjTileset[]): TmjMap {
  return {
    orientation: 'orthogonal', width: 1, height: 1, tilewidth: 16, tileheight: 16,
    nextlayerid: 1, nextobjectid: 1, layers: [], tilesets,
  };
}

describe('applyTilesetRefs', () => {
  it('records where each tileset was stored, matched by firstgid', () => {
    const result = applyTilesetRefs(map(ts(1, 'Terrain'), ts(3, 'Town')), [
      { firstgid: 1, source: '../tilesets/Terrain.tsj', name: 'Terrain' },
      { firstgid: 3, source: '../tilesets/Town (2).tsj', name: 'Town (2)' },
    ]);
    expect(result.tilesets.map((t) => [t.source, t.name])).toEqual([
      ['../tilesets/Terrain.tsj', 'Terrain'],
      ['../tilesets/Town (2).tsj', 'Town (2)'],
    ]);
  });

  it('returns the same object when nothing changes', () => {
    const m = map(ts(1, 'Terrain', '../tilesets/Terrain.tsj'));
    expect(applyTilesetRefs(m, [{ firstgid: 1, source: '../tilesets/Terrain.tsj', name: 'Terrain' }]).tilesets[0])
      .toBe(m.tilesets[0]);
    expect(applyTilesetRefs(m, [])).toBe(m);
  });

  it('leaves tilesets without a matching ref untouched', () => {
    const m = map(ts(1, 'Terrain'), ts(9, 'Added while saving'));
    const result = applyTilesetRefs(m, [{ firstgid: 1, source: '../tilesets/Terrain.tsj', name: 'Terrain' }]);
    expect(result.tilesets[1]).toBe(m.tilesets[1]);
  });
});

describe('tilesetImageUrl', () => {
  it('uses world set image URLs as they are', () => {
    expect(tilesetImageUrl('/api/world_sets/Brakka/tilesets/sheet.png')).toBe('/api/world_sets/Brakka/tilesets/sheet.png');
  });
  it('routes legacy absolute paths through the legacy endpoint', () => {
    expect(tilesetImageUrl('C:/art/sheet.png')).toBe('/api/tilesets/C%3A%2Fart%2Fsheet.png');
  });
});
