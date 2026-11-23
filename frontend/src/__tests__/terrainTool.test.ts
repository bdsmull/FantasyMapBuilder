import { describe, it, expect, beforeEach } from 'vitest';
import { terrainTool } from '../tools/terrainTool';
import { useMapStore } from '../store/mapStore';
import { useViewStore } from '../store/viewStore';
import type { TmjMap, TmjTileLayer } from '../types/tmj';

const square = (w = 6, h = 4): TmjMap => ({
  orientation: 'orthogonal', width: w, height: h, tilewidth: 10, tileheight: 10,
  nextlayerid: 2, nextobjectid: 1, tilesets: [],
  layers: [{ type: 'tilelayer', id: 1, name: 'Ground', width: w, height: h, visible: true, opacity: 1, offsetx: 0, offsety: 0, data: new Array(w * h).fill(1) }],
});
const s = () => useMapStore.getState();
const v = () => useViewStore.getState();
const data = () => (s().mapData!.layers[0] as TmjTileLayer).data;
const at = (c: number, r: number) => data()[r * 6 + c];

describe('Terrain tool', () => {
  beforeEach(() => {
    s().loadMap(square(), 'm', 'ws');
    s().setActiveGid(3);
    v().setTerrainMode('paint');
  });

  it('paints, fills or erases by its mode', () => {
    terrainTool.onPress(0, 0, s());
    terrainTool.onDrag(1, 0, s());
    terrainTool.onRelease(s());
    expect([at(0, 0), at(1, 0), at(2, 0)]).toEqual([3, 3, 1]);

    v().setTerrainMode('erase');
    terrainTool.onPress(0, 0, s());
    terrainTool.onRelease(s());
    expect(at(0, 0)).toBe(0);

    v().setTerrainMode('fill');
    s().setActiveGid(5);
    terrainTool.onPress(4, 3, s());
    terrainTool.onRelease(s());
    expect(at(4, 3)).toBe(5);
    expect(at(5, 0)).toBe(5);  // the connected 1s
    expect(at(1, 0)).toBe(3);  // painted cells aren't part of it
  });

  it('Shift+click fills in any mode', () => {
    terrainTool.onPress(2, 2, s(), undefined, { shift: true });
    terrainTool.onRelease(s());
    expect(data().every((g) => g === 3)).toBe(true);
    expect(v().terrainMode).toBe('paint');
  });

  it('the right button erases, and keeps erasing while dragged (one undo step)', () => {
    const steps = s().past.length;
    expect(terrainTool.onRightPress!(0, 1, s())).toBe(true);
    terrainTool.onDrag(1, 1, s());
    terrainTool.onDrag(2, 1, s());
    terrainTool.onRelease(s());
    expect([at(0, 1), at(1, 1), at(2, 1), at(3, 1)]).toEqual([0, 0, 0, 1]);
    expect(s().past.length).toBe(steps + 1);
    // The next left press paints again
    terrainTool.onPress(0, 1, s());
    terrainTool.onRelease(s());
    expect(at(0, 1)).toBe(3);
  });
});
