import { describe, it, expect, beforeEach } from 'vitest';
import { pointTool, pointKey, isPlainPoint } from '../tools/pointTool';
import { useMapStore } from '../store/mapStore';
import { useViewStore } from '../store/viewStore';
import type { TmjMap, TmjObject, TmjObjectLayer } from '../types/tmj';

const obj = (o: Partial<TmjObject>): TmjObject => ({ id: 1, name: '', type: '', x: 0, y: 0, width: 0, height: 0, visible: true, point: true, ...o });
const map = (): TmjMap => ({
  orientation: 'orthogonal', width: 10, height: 10, tilewidth: 10, tileheight: 10,
  nextlayerid: 3, nextobjectid: 42, tilesets: [],
  layers: [
    { type: 'tilelayer', id: 1, name: 'Ground', width: 10, height: 10, visible: true, opacity: 1, offsetx: 0, offsety: 0, data: new Array(100).fill(1) },
    { type: 'objectgroup', id: 2, name: 'Places', visible: true, opacity: 1, offsetx: 0, offsety: 0, color: '#fff', objects: [obj({ id: 7, name: 'Inn', x: 25, y: 25 })] },
  ],
});
const s = () => useMapStore.getState();
const v = () => useViewStore.getState();
const objects = () => (s().mapData!.layers[1] as TmjObjectLayer).objects;
const ids = () => objects().map((o) => o.id);

describe('Points tool (#38)', () => {
  beforeEach(() => {
    s().loadMap(map(), 'm', 'ws');
    s().setActiveLayer(1);
    s().setZoom(1);
    v().setSelectedObjectId(null);
  });

  it("takes new IDs from the map's nextobjectid, and keeps it ahead", () => {
    pointTool.onPress(8, 8, s(), { x: 85, y: 85 });
    expect(ids()).toEqual([7, 42]);
    expect(objects()[1]).toMatchObject({ name: 'Point 42', x: 85, y: 85, point: true });
    expect(s().mapData!.nextobjectid).toBe(43);
    expect(v().selectedObjectId).toBe(42);
  });

  it('a click on a point selects it instead of adding one', () => {
    pointTool.onPress(2, 2, s(), { x: 27, y: 24 });
    expect(ids()).toEqual([7]);
    expect(v().selectedObjectId).toBe(7);
  });

  it('Delete removes the selected point; Esc deselects', () => {
    pointTool.onPress(2, 2, s(), { x: 25, y: 25 });
    expect(pointKey('Escape', s())).toBe(true);
    expect(v().selectedObjectId).toBeNull();
    expect(pointKey('Delete', s())).toBe(false); // nothing selected
    pointTool.onPress(2, 2, s(), { x: 25, y: 25 });
    expect(pointKey('Delete', s())).toBe(true);
    expect(ids()).toEqual([]);
    expect(v().selectedObjectId).toBeNull();
  });

  it('right-click removes the nearest point', () => {
    pointTool.onRightPress!(2, 2, s(), { x: 30, y: 30 });
    expect(ids()).toEqual([]);
  });

  it('adding a point can be undone and redone', () => {
    pointTool.onPress(8, 8, s(), { x: 85, y: 85 });
    s().undo();
    expect(ids()).toEqual([7]);
    s().redo();
    expect(ids()).toEqual([7, 42]);
    expect(objects()[1].name).toBe('Point 42');
  });

  it('spot heights and water bodies are not plain points', () => {
    expect(isPlainPoint(obj({}))).toBe(true);
    expect(isPlainPoint(obj({ type: 'spot height' }))).toBe(false);
    expect(isPlainPoint(obj({ type: 'water' }))).toBe(false);
    expect(isPlainPoint(obj({ point: undefined, polyline: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }))).toBe(false);
  });
});
