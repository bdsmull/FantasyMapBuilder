import { describe, it, expect, beforeEach } from 'vitest';
import {
  ceilingAt, ceilingAtPixel, headroomGrid, headroomDifference, readCeilings, slabCm, mapHeadroomCm,
  ceilingShape, ceilingProperties, withLengthProperty, NO_CEILING_CONTEXT, OPEN_SKY, DEFAULT_SLAB_CM, CEILING_TYPE,
} from '../utils/ceilings';
import type { CeilingContext, CeilingArea } from '../utils/ceilings';
import { placeChild } from '../utils/worldSurface';
import { createPatch } from '../utils/heightGrid';
import { useMapStore } from '../store/mapStore';
import { useViewStore } from '../store/viewStore';
import { heightTool } from '../tools/heightTool';
import { ceilingKey } from '../tools/ceilingMode';
import type { TmjMap, TmjObjectLayer } from '../types/tmj';

const square = (w = 10, h = 10, extra: Partial<TmjMap> = {}): TmjMap => ({
  orientation: 'orthogonal', width: w, height: h, tilewidth: 16, tileheight: 16,
  nextlayerid: 1, nextobjectid: 1, tilesets: [], layers: [], ...extra,
});
const withProps = (map: TmjMap, headroomM?: number, slabM?: number): TmjMap => ({
  ...map,
  properties: [
    ...(headroomM !== undefined ? [{ name: 'headroom', type: 'float' as const, value: headroomM }] : []),
    ...(slabM !== undefined ? [{ name: 'slab', type: 'float' as const, value: slabM }] : []),
  ],
});
/** A ceiling shape covering cells (c0, r0) to (c1, r1) of a 16 px map. */
const area = (c0: number, r0: number, c1: number, r1: number, headroomCm: number, name = ''): CeilingArea => ({
  id: 1, layerIndex: 0, name, headroomCm,
  points: [{ x: c0 * 16, y: r0 * 16 }, { x: c1 * 16, y: r0 * 16 }, { x: c1 * 16, y: r1 * 16 }, { x: c0 * 16, y: r1 * 16 }],
});

/**
 * A ground floor (Z 0) and an upper floor (Z +1), both 10x10 cells of 1 m, on the same
 * anchor of a parent with 10 m cells. The upper floor's own floor is at `upperCm`.
 */
function building(upperCm: number, upperSlabCm = DEFAULT_SLAB_CM, upperWidth = 10) {
  const ground = square();
  const upper = square(upperWidth, 10);
  const ctx: CeilingContext = {
    z: 0,
    place: placeChild(10, 10, 1, 10, { col: 5, row: 5 }),
    above: [{
      name: 'upper', z: 1, map: upper, patch: createPatch(upper, upperCm), slabCm: upperSlabCm,
      place: placeChild(upperWidth, 10, 1, 10, { col: 5, row: 5 }),
    }],
    ground: null,
  };
  return { ground, ctx };
}

describe('map settings', () => {
  it('reads headroom and slab, with the world set and built-in defaults', () => {
    expect(mapHeadroomCm(square())).toBeNull();
    expect(mapHeadroomCm(withProps(square(), 2.5))).toBe(250);
    expect(slabCm(square())).toBe(DEFAULT_SLAB_CM);
    expect(slabCm(square(), 0.5)).toBe(50);
    expect(slabCm(withProps(square(), undefined, 0), 0.5)).toBe(0); // the map's own wins, even 0
  });

  it('length properties are set in meters and removed with null', () => {
    const props = withLengthProperty([{ name: 'sea', type: 'bool', value: false }], 'headroom', 320);
    expect(props).toEqual([{ name: 'sea', type: 'bool', value: false }, { name: 'headroom', type: 'float', value: 3.2 }]);
    expect(withLengthProperty(props, 'headroom', null)).toEqual([{ name: 'sea', type: 'bool', value: false }]);
  });

  it('reads ceiling objects from object layers, ignoring shapes without a headroom', () => {
    const layer: TmjObjectLayer = {
      type: 'objectgroup', id: 1, name: 'Ceilings', visible: true, opacity: 1, offsetx: 0, offsety: 0, draworder: 'topdown', color: '#9b6bd1',
      objects: [
        { id: 4, name: 'Hall', type: CEILING_TYPE, width: 0, height: 0, visible: true,
          ...ceilingShape([{ x: 0, y: 0 }, { x: 32, y: 0 }, { x: 32, y: 32 }]), properties: ceilingProperties([], 600) },
        { id: 5, name: '', type: CEILING_TYPE, width: 0, height: 0, visible: true,
          ...ceilingShape([{ x: 0, y: 0 }, { x: 32, y: 0 }, { x: 32, y: 32 }]) },
      ],
    };
    const [hall, ...rest] = readCeilings(square(10, 10, { layers: [layer] }));
    expect(rest).toHaveLength(0);
    expect(hall).toMatchObject({ id: 4, name: 'Hall', headroomCm: 600 });
    expect(hall.points[1]).toEqual({ x: 32, y: 0 });
  });
});

describe('ceilingAt', () => {
  it('open sky with nothing above, no headroom and no shapes', () => {
    expect(ceilingAt(square(), 0, NO_CEILING_CONTEXT, [], null, 80, 80)).toBeNull();
  });

  it('the floor above, less its slab', () => {
    const { ground, ctx } = building(400);
    expect(ceilingAt(ground, 100, ctx, [], null, 80, 80)).toEqual({ cm: 370, headroomCm: 270, source: 'level', name: 'upper' });
    expect(ceilingAt(ground, 100, { ...ctx, above: [{ ...ctx.above[0], slabCm: 0 }] }, [], null, 80, 80)!.cm).toBe(400);
  });

  it('only where the level above covers the spot', () => {
    const { ground, ctx } = building(400, DEFAULT_SLAB_CM, 4); // the upper floor covers the middle 4 m
    expect(ceilingAt(ground, 100, ctx, [], null, 80, 80)?.source).toBe('level');
    expect(ceilingAt(ground, 100, ctx, [], null, 8, 80)).toBeNull();
  });

  it('the map\'s headroom applies under a higher floor above, but not over a lower one', () => {
    const { ground, ctx } = building(400);
    expect(ceilingAt(ground, 100, ctx, [], 200, 80, 80)).toMatchObject({ headroomCm: 200, source: 'map' });
    expect(ceilingAt(ground, 100, ctx, [], 500, 80, 80)).toMatchObject({ headroomCm: 270, source: 'level' });
  });

  it('inside a shape its headroom replaces the map\'s, higher or lower, but stays under the floor above', () => {
    const map = square();
    const hall = area(2, 2, 6, 6, 600, 'Hall'), passage = area(7, 2, 9, 6, 120);
    expect(ceilingAt(map, 0, NO_CEILING_CONTEXT, [hall, passage], 300, 64, 64)).toMatchObject({ headroomCm: 600, source: 'object', name: 'Hall' });
    expect(ceilingAt(map, 0, NO_CEILING_CONTEXT, [hall, passage], 300, 128, 64)).toMatchObject({ headroomCm: 120, source: 'object' });
    expect(ceilingAt(map, 0, NO_CEILING_CONTEXT, [hall, passage], 300, 8, 8)).toMatchObject({ headroomCm: 300, source: 'map' });
    const { ground, ctx } = building(400);
    expect(ceilingAt(ground, 0, ctx, [hall], 300, 64, 64)).toMatchObject({ cm: 370, source: 'level' });
  });

  it('below ground: the next level up, else the parent\'s ground', () => {
    const parent = square();
    const cave = square();
    const ctx: CeilingContext = {
      z: -1, place: placeChild(10, 10, 1, 10, { col: 5, row: 5 }), above: [],
      ground: { name: 'region', map: parent, patch: createPatch(parent, 5_000) },
    };
    expect(ceilingAt(cave, 1_000, ctx, [], null, 80, 80)).toEqual({ cm: 5_000, headroomCm: 4_000, source: 'ground', name: 'region' });
    expect(ceilingAt(cave, 1_000, ctx, [], 400, 80, 80)).toMatchObject({ headroomCm: 400, source: 'map' });
    // On the ground (Z 0) the parent's heights are not a ceiling
    expect(ceilingAt(cave, 1_000, { ...ctx, z: 0 }, [], null, 80, 80)).toBeNull();
  });

  it('takes the floor of the nearest level above, not one further up', () => {
    const { ground, ctx } = building(400);
    const top = square();
    const higher = { ...ctx.above[0], name: 'roof', z: 2, map: top, patch: createPatch(top, 200) };
    expect(ceilingAt(ground, 100, { ...ctx, above: [...ctx.above, higher] }, [], null, 80, 80)?.name).toBe('upper');
  });
});

describe('headroom grid and differences', () => {
  it('per cell, with the floor from the map\'s heights', () => {
    const map = withProps(square(), 3);
    const patch = createPatch(map, 0);
    const grid = headroomGrid(map, patch, NO_CEILING_CONTEXT, [area(0, 0, 2, 2, 150)]);
    expect(grid[0]).toBe(150);
    expect(grid[5 * 10 + 5]).toBe(300);
    expect(ceilingAtPixel(map, patch, NO_CEILING_CONTEXT, [], 80, 80)?.headroomCm).toBe(300);
    expect(headroomGrid(square(), patch, NO_CEILING_CONTEXT, [])[0]).toBe(OPEN_SKY);
  });

  it('compares with the map\'s own headroom, or open sky when it has none', () => {
    expect(headroomDifference(300, 300)).toBe(0);
    expect(headroomDifference(300.5, 300)).toBe(0);
    expect(headroomDifference(120, 300)).toBe(-1);
    expect(headroomDifference(600, 300)).toBe(1);
    expect(headroomDifference(OPEN_SKY, null)).toBe(0);
    expect(headroomDifference(250, null)).toBe(-1);
  });
});

describe('Ceiling mode', () => {
  const s = () => useMapStore.getState();
  const v = () => useViewStore.getState();
  let clock = 0;
  const click = (x: number, y: number) => {
    clock += 1000; // far apart in time: not a double-click
    const now = Date.now;
    Date.now = () => clock;
    heightTool.onPress(0, 0, s(), { x, y });
    heightTool.onRelease(s());
    Date.now = now;
  };
  beforeEach(() => {
    s().loadMap(square(), 'm', 'ws');
    s().setHeights(createPatch(square(), 0));
    s().setZoom(1);
    s().setHeightBrush({ mode: 'ceiling', ceilingHeadroomCm: 180 });
    v().setDraftLine(null);
    v().selectCeiling(null);
  });

  it('draws a closed shape with the panel\'s headroom (one undo step), and Enter closes one too', () => {
    click(10, 10); click(100, 10); click(100, 100);
    click(12, 11); // on the first corner
    const [shape] = readCeilings(s().mapData!);
    expect(shape).toMatchObject({ headroomCm: 180 });
    expect(shape.points).toHaveLength(3);
    expect(v().selectedCeilingId).toBe(shape.id);
    expect(s().mapData!.layers.find((l) => l.name === 'Ceilings')).toBeTruthy();
    s().undo();
    expect(readCeilings(s().mapData!)).toHaveLength(0);

    v().selectCeiling(null);
    click(20, 20); click(60, 20); click(60, 60);
    ceilingKey('Enter', s());
    expect(readCeilings(s().mapData!)).toHaveLength(1);
  });

  it('a click inside a shape starts a new one; its outline selects it', () => {
    const id = s().addCeiling([{ x: 0, y: 0 }, { x: 160, y: 0 }, { x: 160, y: 160 }, { x: 0, y: 160 }], 300)!;
    click(80, 80);
    expect(v().draftLine).toHaveLength(1);
    ceilingKey('Escape', s());
    click(80, 2);
    expect(v().selectedCeilingId).toBe(id);
  });

  it('drag a corner, delete a corner, then the shape; edit the headroom', () => {
    const id = s().addCeiling([{ x: 10, y: 10 }, { x: 100, y: 10 }, { x: 100, y: 100 }, { x: 10, y: 100 }], 300)!;
    v().selectCeiling(id);
    heightTool.onPress(0, 0, s(), { x: 100, y: 100 });
    heightTool.onDrag(0, 0, s(), { x: 120, y: 120 });
    heightTool.onRelease(s());
    expect(readCeilings(s().mapData!)[0].points[2]).toEqual({ x: 120, y: 120 });
    s().updateCeiling(id, { headroomCm: 450, name: 'Hall' });
    expect(readCeilings(s().mapData!)[0]).toMatchObject({ headroomCm: 450, name: 'Hall' });
    v().selectCeiling(id, 0);
    ceilingKey('Delete', s());
    expect(readCeilings(s().mapData!)[0].points).toHaveLength(3);
    ceilingKey('Delete', s()); // no corner selected: the whole shape
    expect(readCeilings(s().mapData!)).toHaveLength(0);
  });

  it('the map\'s headroom and slab are map properties', () => {
    s().setMapLength('headroom', 320);
    s().setMapLength('slab', 0);
    expect(mapHeadroomCm(s().mapData!)).toBe(320);
    expect(slabCm(s().mapData!, 0.5)).toBe(0);
    s().setMapLength('headroom', null);
    expect(mapHeadroomCm(s().mapData!)).toBeNull();
    expect(s().isDirty).toBe(true);
  });
});
