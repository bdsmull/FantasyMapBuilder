import { describe, it, expect, beforeEach } from 'vitest';
import {
  readSpots, fitToSpots, spotNear, spotProperties, isSpot, SPOT_LAYER, SPOT_TYPE,
} from '../utils/spotHeights';
import type { Spot } from '../utils/spotHeights';
import { createPatch, heightAt } from '../utils/heightGrid';
import { hexLayout, hexCenter } from '../canvas/hexGeometry';
import { useMapStore } from '../store/mapStore';
import { useViewStore } from '../store/viewStore';
import { heightTool } from '../tools/heightTool';
import type { TmjMap } from '../types/tmj';
import { isObjectLayer } from '../types/tmj';

const square = (w = 20, h = 20): TmjMap => ({
  orientation: 'orthogonal', width: w, height: h, tilewidth: 10, tileheight: 10,
  nextlayerid: 2, nextobjectid: 1, tilesets: [],
  layers: [{ type: 'tilelayer', id: 1, name: 'Ground', width: w, height: h, visible: true, opacity: 1, offsetx: 0, offsety: 0, data: new Array(w * h).fill(0) }],
});
const spot = (id: number, x: number, y: number, cm: number, reachCells = 5): Spot => ({ id, layerIndex: 1, name: '', x, y, cm, reachCells });

describe('spot objects', () => {
  it('reads spot heights from object layers; other objects are ignored', () => {
    const map = square();
    map.layers.push({ type: 'objectgroup', id: 2, name: 'Marks', visible: true, opacity: 1, offsetx: 0, offsety: 0, color: '#fff', objects: [
      { id: 1, name: 'Varra', type: SPOT_TYPE, x: 50, y: 60, width: 0, height: 0, visible: true, point: true, properties: spotProperties([], 234_500, 8) },
      { id: 2, name: 'Old', type: SPOT_TYPE, x: 1, y: 1, width: 0, height: 0, visible: true, point: true, properties: [{ name: 'height', type: 'string', value: '12.5' }] },
      { id: 3, name: 'Well', type: 'landmark', x: 5, y: 5, width: 0, height: 0, visible: true, point: true },
    ] });
    const spots = readSpots(map);
    expect(spots.map((s) => [s.name, s.cm, s.reachCells])).toEqual([['Varra', 234_500, 8], ['Old', 1250, 10]]);
    expect(isSpot(map.layers[1].type === 'objectgroup' ? map.layers[1].objects[2] : ({} as never))).toBe(false);
    expect(spotNear(spots, 53, 60, 4)?.name).toBe('Varra');
    expect(spotNear(spots, 60, 60, 4)).toBeNull();
  });
});

describe('fitToSpots', () => {
  it('passes through a spot, fades out to nothing at its reach', () => {
    const map = square();
    const patch = createPatch(map, 0);
    const result = fitToSpots(map, patch, [spot(1, 100, 100, 1000, 5)]);
    const fitted = { ...patch, cm: result.cm };
    expect(Math.abs(heightAt(map, fitted, 100, 100) - 1000)).toBeLessThan(1);
    expect(result.maxMissCm).toBeLessThan(1);
    expect(result.cm[10 * 21 + 16]).toBe(0);           // 6 cells away: beyond the reach
    const mid = result.cm[10 * 21 + 12];                // 2 cells away
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1000);
    expect(patch.cm[10 * 21 + 10]).toBe(0);            // the input is not modified
  });

  it('keeps the existing shape: it only adds a smooth bend', () => {
    const map = square();
    const patch = createPatch(map, 0);
    for (let i = 0; i < patch.cm.length; i++) patch.cm[i] = (i % 21) * 100; // a slope
    const result = fitToSpots(map, patch, [spot(1, 100, 100, 5000, 4)]);
    expect(Math.abs(heightAt(map, { ...patch, cm: result.cm }, 100, 100) - 5000)).toBeLessThan(1);
    expect(result.cm[0]).toBe(0);
    expect(result.cm[20]).toBe(2000);
  });

  it('several spots with overlapping reach are all met', () => {
    const map = square();
    const spots = [spot(1, 80, 100, 3000, 6), spot(2, 120, 100, -500, 6), spot(3, 100, 70, 1200, 3)];
    const result = fitToSpots(map, createPatch(map, 0), spots);
    for (const s of spots) expect(Math.abs(heightAt(map, { ...createPatch(map, 0), cm: result.cm }, s.x, s.y) - s.cm)).toBeLessThan(1);
  });

  it('hand-set heights are kept, and the miss is reported', () => {
    const map = square();
    const patch = createPatch(map, 0);
    patch.mask[10 * 21 + 10] = 1; // the sample right under the spot
    const result = fitToSpots(map, patch, [spot(1, 100, 100, 1000, 5)]);
    expect(result.cm[10 * 21 + 10]).toBe(0);
    expect(result.maxMissCm).toBeGreaterThan(500);
  });

  it('works on hex maps', () => {
    const map: TmjMap = { ...square(9, 9), orientation: 'hexagonal', tilewidth: 80, tileheight: 70, hexsidelength: 40, staggeraxis: 'x', staggerindex: 'odd' };
    const c = hexCenter(hexLayout(map), 4, 4);
    const patch = createPatch(map, 100);
    const result = fitToSpots(map, patch, [spot(1, c.x + 7, c.y - 5, 2500, 3)]);
    expect(Math.abs(heightAt(map, { ...patch, cm: result.cm }, c.x + 7, c.y - 5) - 2500)).toBeLessThan(1);
    expect(result.cm[0]).toBe(100);
  });

  it('no spots changes nothing', () => {
    const map = square();
    expect(fitToSpots(map, createPatch(map, 7), []).changed).toBe(0);
  });
});

describe('spot editing in the store', () => {
  const s = () => useMapStore.getState();
  beforeEach(() => {
    s().loadMap(square(), 'm', 'ws');
    s().setHeights(createPatch(square(), 0));
    useViewStore.getState().setSelectedSpotId(null);
  });

  it('adding creates the Spot heights layer on top; undo removes both', () => {
    const id = s().addSpotHeight(50, 60, 1234, 7)!;
    const layer = s().mapData!.layers[s().mapData!.layers.length - 1];
    expect(layer.name).toBe(SPOT_LAYER);
    expect(readSpots(s().mapData!)).toEqual([{ id, layerIndex: 1, name: '', x: 50, y: 60, cm: 1234, reachCells: 7 }]);
    expect(s().mapData!.nextobjectid).toBe(id + 1);
    expect(s().isDirty).toBe(true);
    s().undo();
    expect(s().mapData!.layers.some((l) => l.name === SPOT_LAYER)).toBe(false);
    s().redo();
    expect(readSpots(s().mapData!)).toHaveLength(1);
  });

  it('a second spot goes into the same layer; edits and deletes are undoable', () => {
    const a = s().addSpotHeight(10, 10, 100, 5)!;
    const b = s().addSpotHeight(30, 30, 200, 5)!;
    expect(s().mapData!.layers.filter(isObjectLayer)).toHaveLength(1);
    s().updateSpotHeight(a, { name: 'Ford', cm: 112_00, reachCells: 3 });
    expect(readSpots(s().mapData!).find((p) => p.id === a)).toMatchObject({ name: 'Ford', cm: 11200, reachCells: 3 });
    s().deleteSpotHeight(b);
    expect(readSpots(s().mapData!).map((p) => p.id)).toEqual([a]);
    s().undo();
    expect(readSpots(s().mapData!)).toHaveLength(2);
    s().undo();
    expect(readSpots(s().mapData!).find((p) => p.id === a)?.cm).toBe(100);
  });
});

describe('Height tool in Spot mode', () => {
  const s = () => useMapStore.getState();
  beforeEach(() => {
    s().loadMap(square(), 'm', 'ws');
    s().setHeights(createPatch(square(), 0));
    s().setZoom(1);
    s().setHeightBrush({ mode: 'spot', targetCm: 4200, spotReachCells: 6 });
  });

  it('a click adds a spot at the target height and selects it; clicking it again selects it', () => {
    heightTool.onPress(5, 5, s(), { x: 55, y: 55 });
    heightTool.onRelease(s());
    const [p] = readSpots(s().mapData!);
    expect(p).toMatchObject({ x: 55, y: 55, cm: 4200, reachCells: 6 });
    expect(useViewStore.getState().selectedSpotId).toBe(p.id);
    useViewStore.getState().setSelectedSpotId(null);
    heightTool.onPress(5, 5, s(), { x: 58, y: 55 });   // within the pick radius
    expect(readSpots(s().mapData!)).toHaveLength(1);
    expect(useViewStore.getState().selectedSpotId).toBe(p.id);
    expect(s().heights!.cm.every((v) => v === 0)).toBe(true); // spots don't paint
  });

  it('right-click picks the target height but stays in Spot mode', () => {
    s().heights!.cm[2 * 21 + 2] = 777;
    heightTool.onRightPress!(2, 2, s(), { x: 20, y: 20 });
    expect(s().heightBrush.mode).toBe('spot');
    expect(s().heightBrush.targetCm).toBe(777);
  });
});
