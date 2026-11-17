import { describe, it, expect, beforeEach } from 'vitest';
import { inspectAt, cellAt } from '../utils/inspect';
import { inspectTool } from '../tools/inspectTool';
import { useViewStore } from '../store/viewStore';
import { useMapStore } from '../store/mapStore';
import type { TmjMap, TmjObject } from '../types/tmj';

const obj = (o: Partial<TmjObject>): TmjObject => ({ id: 1, name: '', type: '', x: 0, y: 0, width: 0, height: 0, visible: true, ...o });

const map: TmjMap = {
  orientation: 'orthogonal', width: 4, height: 3, tilewidth: 10, tileheight: 10, nextlayerid: 4, nextobjectid: 9,
  tilesets: [{
    firstgid: 1, name: 'Terrain', tilewidth: 10, tileheight: 10, tilecount: 2, columns: 2, image: '',
    tiles: [
      { id: 0, type: 'Hills', properties: [
        { name: 'color_r', type: 'int', value: 10 }, { name: 'color_g', type: 'int', value: 20 }, { name: 'color_b', type: 'int', value: 30 },
        { name: 'heightBase', type: 'float', value: 400 },
      ] },
      { id: 1, type: 'Road', properties: [] },
    ],
  }],
  layers: [
    { type: 'tilelayer', id: 1, name: 'Ground', width: 4, height: 3, visible: true, opacity: 1, offsetx: 0, offsety: 0, data: new Array(12).fill(1) },
    { type: 'tilelayer', id: 2, name: 'Roads', width: 4, height: 3, visible: false, opacity: 1, offsetx: 0, offsety: 0, data: [0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { type: 'objectgroup', id: 3, name: 'Places', visible: true, opacity: 1, offsetx: 0, offsety: 0, color: '#fff', objects: [
      obj({ id: 1, name: 'Well', type: 'landmark', x: 15, y: 5, point: true, properties: [{ name: 'depth', type: 'int', value: 12 }] }),
      obj({ id: 2, name: 'Keep', x: 10, y: 0, width: 20, height: 10 }),
      obj({ id: 3, name: 'Pond', x: 30, y: 10, width: 10, height: 10, ellipse: true }),
      obj({ id: 4, name: 'Field', x: 0, y: 20, polygon: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }] }),
    ] },
  ],
};

describe('inspectAt', () => {
  it('lists the tiles at the cell, top layer first, with names, swatches and terrain heights', () => {
    const info = inspectAt(map, 15, 5, 2)!;
    expect([info.col, info.row]).toEqual([1, 0]);
    expect(info.tiles.map((t) => [t.layer, t.type, t.layerVisible])).toEqual([['Roads', 'Road', false], ['Ground', 'Hills', true]]);
    expect(info.tiles[1].color).toBe('rgb(10,20,30)');
    expect(info.tiles[1].terrain?.baseCm).toBe(40000);
  });

  it('finds point objects within the pick radius, and shapes containing the point', () => {
    expect(inspectAt(map, 16, 5, 2)!.objects.map((o) => o.name)).toEqual(['Keep', 'Well']);
    expect(inspectAt(map, 19, 5, 2)!.objects.map((o) => o.name)).toEqual(['Keep']);
    expect(inspectAt(map, 35, 15, 2)!.objects.map((o) => [o.name, o.kind])).toEqual([['Pond', 'ellipse']]);
    expect(inspectAt(map, 31, 11, 2)!.objects).toEqual([]); // inside the box, outside the ellipse
    expect(inspectAt(map, 2, 22, 2)!.objects.map((o) => o.name)).toEqual(['Field']);
    expect(inspectAt(map, 8, 28, 2)!.objects).toEqual([]);
    expect(inspectAt(map, 15, 5, 2)!.objects.find((o) => o.name === 'Well')!.properties).toEqual([{ name: 'depth', type: 'int', value: 12 }]);
  });

  it('is null off the map', () => {
    expect(inspectAt(map, -1, 5, 2)).toBeNull();
    expect(inspectAt(map, 41, 5, 2)).toBeNull();
    expect(cellAt({ ...map, orientation: 'hexagonal', tilewidth: 80, tileheight: 70, hexsidelength: 40, staggeraxis: 'x', staggerindex: 'odd' }, 5000, 10)).toBeNull();
  });
});

describe('inspectTool', () => {
  beforeEach(() => {
    useMapStore.getState().loadMap(map, 'm', 'ws');
    useMapStore.getState().setZoom(2);
    useMapStore.getState().setPan({ x: 0, y: 0 });
    useViewStore.getState().setInspected(null);
  });
  const s = () => useMapStore.getState();

  it('a click inspects the point and changes nothing', () => {
    const before = s().mapData;
    inspectTool.onPress(1, 0, s(), { x: 15, y: 5 });
    inspectTool.onRelease(s());
    expect(useViewStore.getState().inspected).toEqual({ x: 15, y: 5 });
    expect(s().mapData).toBe(before);
    expect(s().isDirty).toBe(false);
    expect(s().past).toHaveLength(0);
  });

  it('a drag pans the map instead, keeping the grabbed point under the pointer', () => {
    inspectTool.onPress(1, 0, s(), { x: 15, y: 5 });
    inspectTool.onDrag(1, 0, s(), { x: 20, y: 5 }); // 5 map px = 10 screen px at zoom 2
    expect(s().pan).toEqual({ x: 10, y: 0 });
    // Measured with the new pan, the pointer is now at screen x 17 * 2 + 10 = 44;
    // the grabbed point (map x 15) must land there: 15 * 2 + pan = 44
    inspectTool.onDrag(1, 0, s(), { x: 17, y: 5 });
    expect(s().pan).toEqual({ x: 14, y: 0 });
    inspectTool.onRelease(s());
    expect(useViewStore.getState().inspected).toBeNull();
  });

  it('a tiny wobble is still a click; a cancelled gesture does nothing', () => {
    inspectTool.onPress(1, 0, s(), { x: 15, y: 5 });
    inspectTool.onDrag(1, 0, s(), { x: 15.5, y: 5 }); // 1 screen px
    inspectTool.onRelease(s());
    expect(useViewStore.getState().inspected).toEqual({ x: 15, y: 5 });
    useViewStore.getState().setInspected(null);
    inspectTool.onPress(1, 0, s(), { x: 15, y: 5 });
    inspectTool.onCancel!(s());
    inspectTool.onRelease(s());
    expect(useViewStore.getState().inspected).toBeNull();
  });
});

describe('palette visibility', () => {
  it('can be hidden and shown', () => {
    useViewStore.getState().setShowPalette(false);
    expect(useViewStore.getState().showPalette).toBe(false);
    useViewStore.getState().setShowPalette(true);
    expect(useViewStore.getState().showPalette).toBe(true);
  });
});
