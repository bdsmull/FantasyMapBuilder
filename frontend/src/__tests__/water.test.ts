import { describe, it, expect, beforeEach } from 'vitest';
import {
  readWaterBodies, isWaterBody, waterProperties, seaEnabled, withSea, computeWater, waterAt,
  NO_WATER, SEA_BODY, WATER_LAYER, WATER_TYPE,
} from '../utils/water';
import type { WaterBody } from '../utils/water';
import { computeFlow } from '../utils/flow';
import { carveRivers, riverDepthM, waterLines } from '../utils/carve';
import { createPatch } from '../utils/heightGrid';
import type { HeightPatch } from '../utils/heightGrid';
import { readLines } from '../utils/lines';
import { BUILTIN_LINE_CLASSES } from '../data/lineClasses';
import { useMapStore } from '../store/mapStore';
import { useViewStore } from '../store/viewStore';
import { waterTool } from '../tools/waterTool';
import { waterKey } from '../tools/waterMode';
import type { TmjMap, TmjObject } from '../types/tmj';

const square = (w = 20, h = 20): TmjMap => ({
  orientation: 'orthogonal', width: w, height: h, tilewidth: 10, tileheight: 10,
  nextlayerid: 2, nextobjectid: 1, tilesets: [],
  layers: [{ type: 'tilelayer', id: 1, name: 'Ground', width: w, height: h, visible: true, opacity: 1, offsetx: 0, offsety: 0, data: new Array(w * h).fill(0) }],
});
/** A patch from a height function of the sample's (col, row). */
const patchOf = (map: TmjMap, f: (c: number, r: number) => number): HeightPatch => {
  const p = createPatch(map, 0);
  for (let r = 0; r < p.rows; r++) for (let c = 0; c < p.cols; c++) p.cm[r * p.cols + c] = Math.round(f(c, r));
  return p;
};
const body = (id: number, x: number, y: number, cm: number, name = ''): WaterBody => ({ id, layerIndex: 1, name, x, y, cm });
const at = (p: HeightPatch, c: number, r: number) => r * p.cols + c;

describe('water bodies', () => {
  it('reads water points; the sea is on unless the map says otherwise', () => {
    const map = square();
    const objects: TmjObject[] = [
      { id: 1, name: 'Varra', type: WATER_TYPE, x: 50, y: 60, width: 0, height: 0, visible: true, point: true, properties: waterProperties([], 41_200) },
      { id: 2, name: 'No height', type: WATER_TYPE, x: 5, y: 5, width: 0, height: 0, visible: true, point: true },
    ];
    map.layers.push({ type: 'objectgroup', id: 2, name: 'Water', visible: true, opacity: 1, offsetx: 0, offsety: 0, color: '#fff', objects });
    expect(readWaterBodies(map)).toEqual([{ id: 1, layerIndex: 1, name: 'Varra', x: 50, y: 60, cm: 41_200 }]);
    expect(isWaterBody(objects[1])).toBe(false);
    expect(seaEnabled(map)).toBe(true);
    expect(seaEnabled({ ...map, properties: withSea(map.properties, false) })).toBe(false);
    expect(withSea(withSea([], false), true)).toEqual([]);
  });

  it('a lake fills the connected ground below its surface, not the basin next door', () => {
    const map = square();
    // Two bowls, x 0-9 and x 10-20, separated by a ridge at column 10
    const p = patchOf(map, (c, r) => (c === 10 ? 1000 : 100 * (Math.abs(c - (c < 10 ? 5 : 15)) + Math.abs(r - 10))));
    const w = computeWater(map, p, [body(1, 50, 100, 350, 'Left')], true);
    expect(w.surface[at(p, 5, 10)]).toBe(350);
    expect(w.surface[at(p, 7, 10)]).toBe(350);            // 200 below 350
    expect(w.surface[at(p, 9, 10)]).toBe(NO_WATER);       // 400: above the surface
    expect(w.surface[at(p, 15, 10)]).toBe(NO_WATER);      // the other bowl
    expect(w.fills[0]).toMatchObject({ dry: false, maxDepthCm: 350, reachesEdge: false });
    expect(waterAt(map, p, w, [body(1, 50, 100, 350, 'Left')], 50, 100)).toMatchObject({ name: 'Left', depthCm: 350 });
    expect(waterAt(map, p, w, [], 150, 100)).toBeNull();
  });

  it('a lake above its ground fills nothing; one reaching the edge is flagged', () => {
    const map = square();
    const p = patchOf(map, (c) => c * 100);
    const w = computeWater(map, p, [body(1, 150, 100, 500), body(2, 0, 100, 250)], false);
    expect(w.fills[0].dry).toBe(true);
    expect(w.fills[1]).toMatchObject({ dry: false, reachesEdge: true });
  });

  it('the sea: below 0 m and reaching the edge; an inland hollow below 0 m stays dry', () => {
    const map = square();
    const p = patchOf(map, (c, r) => {
      if (c <= 3) return -500;                              // a coast along the west edge
      if (Math.abs(c - 12) <= 1 && Math.abs(r - 10) <= 1) return -300; // inland, ringed by land
      return 1000;
    });
    const w = computeWater(map, p, [], true);
    expect(w.body[at(p, 0, 5)]).toBe(SEA_BODY);
    expect(w.surface[at(p, 3, 5)]).toBe(0);
    expect(w.surface[at(p, 12, 10)]).toBe(NO_WATER);
    expect(w.seaSamples).toBe(4 * 21);
    expect(computeWater(map, p, [], false).seaSamples).toBe(0);
    // A lake placed in the inland hollow at sea level fills it
    expect(computeWater(map, p, [body(1, 120, 100, 0)], true).surface[at(p, 12, 10)]).toBe(0);
  });
});

describe('flow', () => {
  it('runs downhill to the edge, adding up downstream; a pit is a hollow', () => {
    const map = square();
    // A slope falling to the east, with a pit at (5, 10)
    const p = patchOf(map, (c, r) => (c === 5 && r === 10 ? 1000 : 3000 - c * 100));
    const f = computeFlow(map, p.cols, p.rows, p.cm, null);
    const i = at(p, 8, 10);
    expect(f.receiver[i] % p.cols).toBe(9);              // drains east
    expect(f.accumulation[at(p, 19, 10)]).toBeGreaterThan(f.accumulation[at(p, 10, 10)]);
    expect(f.hollowCm[at(p, 5, 10)]).toBeGreaterThan(1000);
    expect(f.hollowCm[at(p, 8, 10)]).toBe(0);
  });

  it('lakes are outlets', () => {
    const map = square();
    const p = patchOf(map, (c, r) => 100 * (Math.abs(c - 10) + Math.abs(r - 10)));
    const w = computeWater(map, p, [body(1, 100, 100, 250)], false);
    const f = computeFlow(map, p.cols, p.rows, p.cm, w);
    expect(f.receiver[at(p, 10, 10)]).toBe(-1);
    expect(f.hollowCm[at(p, 10, 10)]).toBe(0);
  });
});

describe('carving rivers', () => {
  const river = (pts: { x: number; y: number }[], type = 'river'): TmjObject => ({
    id: 5, name: 'Varra', type, width: 0, height: 0, visible: true,
    x: pts[0].x, y: pts[0].y, polyline: pts.map((q) => ({ x: q.x - pts[0].x, y: q.y - pts[0].y })),
  });
  const mapWith = (o: TmjObject) => {
    const map = square();
    map.layers.push({ type: 'objectgroup', id: 2, name: 'Rivers', visible: true, opacity: 1, offsetx: 0, offsety: 0, color: '#fff', objects: [o] });
    return map;
  };

  it('depth from width', () => {
    expect(riverDepthM(20)).toBe(2);
    expect(riverDepthM(1)).toBe(0.3);
    expect(riverDepthM(200)).toBe(5);
  });

  it('cuts a bed that never rises downstream, lowering only; roads are ignored', () => {
    const map = mapWith(river([{ x: 0, y: 100 }, { x: 200, y: 100 }]));
    // Falling to the east with a 5 m bump in the middle
    const p = patchOf(map, (c) => 3000 - c * 100 + (c === 10 ? 500 : 0));
    const lines = waterLines(readLines(map), BUILTIN_LINE_CLASSES);
    expect(lines).toHaveLength(1);
    const { cm, changed } = carveRivers(map, p, lines, BUILTIN_LINE_CLASSES, 10);
    expect(changed).toBeGreaterThan(0);
    const bed = Array.from({ length: 21 }, (_, c) => cm[at(p, c, 10)]);
    for (let c = 1; c <= 20; c++) expect(bed[c]).toBeLessThanOrEqual(bed[c - 1]);
    expect(bed[3]).toBe(3000 - 300 - 200);                // 2 m below the ground for a 20 m river
    expect(bed[10]).toBeLessThan(3000 - 1000);            // through the bump
    for (let k = 0; k < cm.length; k++) expect(cm[k]).toBeLessThanOrEqual(p.cm[k]);
    expect(cm[at(p, 3, 3)]).toBe(p.cm[at(p, 3, 3)]);      // away from the river
    expect(waterLines(readLines(mapWith(river([{ x: 0, y: 0 }, { x: 9, y: 9 }], 'minor-road'))), BUILTIN_LINE_CLASSES)).toHaveLength(0);
  });

  it('keeps hand-set heights', () => {
    const map = mapWith(river([{ x: 0, y: 100 }, { x: 200, y: 100 }]));
    const p = patchOf(map, () => 1000);
    p.mask[at(p, 4, 10)] = 1;
    const { cm } = carveRivers(map, p, readLines(map), BUILTIN_LINE_CLASSES, 10);
    expect(cm[at(p, 4, 10)]).toBe(1000);
    expect(cm[at(p, 5, 10)]).toBe(800);
  });
});

describe('water in the store and the Water tool', () => {
  const s = () => useMapStore.getState();
  const v = () => useViewStore.getState();
  beforeEach(() => {
    s().loadMap(square(), 'm', 'ws');
    s().setHeights(createPatch(square(), 0));
    s().setZoom(1);
    s().setHeightBrush({ waterCm: 12_000 });
    v().setWaterMode('lakes');
    v().setSelectedWaterId(null);
  });

  it('a click adds a lake in a Water layer; click and drag moves it; Delete removes it (undoable)', () => {
    waterTool.onPress(0, 0, s(), { x: 50, y: 50 });
    waterTool.onRelease(s());
    const [b] = readWaterBodies(s().mapData!);
    expect(b).toMatchObject({ x: 50, y: 50, cm: 12_000 });
    expect(s().mapData!.layers[s().mapData!.layers.length - 1].name).toBe(WATER_LAYER);
    expect(v().selectedWaterId).toBe(b.id);

    waterTool.onPress(0, 0, s(), { x: 53, y: 50 });  // on the marker
    waterTool.onDrag(0, 0, s(), { x: 120, y: 90 });
    waterTool.onRelease(s());
    expect(readWaterBodies(s().mapData!)).toEqual([expect.objectContaining({ id: b.id, x: 120, y: 90 })]);

    s().updateWaterBody(b.id, { name: 'Varra', cm: 9_000 });
    expect(readWaterBodies(s().mapData!)[0]).toMatchObject({ name: 'Varra', cm: 9_000 });
    expect(waterKey('Delete', s())).toBe(true);
    expect(readWaterBodies(s().mapData!)).toHaveLength(0);
    s().undo();
    expect(readWaterBodies(s().mapData!)).toHaveLength(1);
    expect(s().heights!.cm.every((h) => h === 0)).toBe(true); // placing water doesn't paint
  });

  it('the sea switch is a map property', () => {
    s().setSea(false);
    expect(seaEnabled(s().mapData!)).toBe(false);
    expect(s().isDirty).toBe(true);
    s().setSea(true);
    expect(s().mapData!.properties ?? []).toEqual([]);
  });

  it('right-click picks the surface for new water', () => {
    s().heights!.cm[at(s().heights!, 2, 2)] = 777;
    const before = s().heightBrush.mode;
    waterTool.onRightPress!(2, 2, s(), { x: 20, y: 20 });
    expect(s().heightBrush).toMatchObject({ mode: before, waterCm: 777 });
  });
});
