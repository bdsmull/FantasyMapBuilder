import { describe, it, expect, beforeEach } from 'vitest';
import {
  childToParent, apply, relatedMaps, ghostLines, refinedByIndex, hiddenAreas, clipPolyline, adoptPieces,
  mapExtent, lineKey, refinesOf, REFINES_PROPERTY,
} from '../utils/crossScaleLines';
import type { MapSource, RelatedMap } from '../utils/crossScaleLines';
import { linePoints, readLines } from '../utils/lines';
import { useMapStore } from '../store/mapStore';
import { useViewStore } from '../store/viewStore';
import { useCrossScaleStore } from '../store/crossScaleStore';
import { ghostAt } from '../tools/lineTool';
import type { TmjMap, TmjObject } from '../types/tmj';
import type { WorldSetNode } from '../types/worldSet';

const square = (name: string, mpu: number, lines: TmjObject[] = []): MapSource & { name: string } => ({
  name,
  mpu,
  map: {
    orientation: 'orthogonal', width: 20, height: 20, tilewidth: 10, tileheight: 10, nextlayerid: 3, nextobjectid: 50,
    tilesets: [], metersPerUnit: mpu,
    layers: [
      { type: 'tilelayer', id: 1, name: 'Ground', width: 20, height: 20, visible: true, opacity: 1, offsetx: 0, offsety: 0, data: new Array(400).fill(0) },
      { type: 'objectgroup', id: 2, name: 'Roads', visible: true, opacity: 1, offsetx: 0, offsety: 0, color: '#fff', objects: lines },
    ],
  },
});
const line = (id: number, points: { x: number; y: number }[], extra: Partial<TmjObject> = {}): TmjObject => ({
  id, name: `L${id}`, type: 'major-road', width: 0, height: 0, visible: true,
  x: points[0].x, y: points[0].y, polyline: points.map((p) => ({ x: p.x - points[0].x, y: p.y - points[0].y })), ...extra,
});
/** Points/rects equal up to floating-point noise. */
const near = (a: object, b: object) => {
  const x = a as Record<string, number>, y = b as Record<string, number>;
  for (const k of Object.keys(y)) expect(x[k]).toBeCloseTo(y[k], 6);
};
const node = (mapName: string, parentMapName: string | null, col = 0, row = 0, z = 0): WorldSetNode => ({
  mapName, parentMapName, parentAnchor: parentMapName ? { col, row } : null, z,
});

// World (1 km cells) > region (100 m cells, 2 x 2 world cells at (5, 5): world px 40..60)
//   > town (10 m cells, 2 x 2 region cells at (5, 5): region px 40..60)
const world = square('world', 1000, [line(1, [{ x: 0, y: 50 }, { x: 200, y: 50 }])]);
const region = square('region', 100, [line(2, [{ x: 0, y: 100 }, { x: 200, y: 100 }]), line(3, [{ x: 0, y: 50 }, { x: 200, y: 50 }])]);
const town = square('town', 10);
const cave = square('cave', 10);
const nodes = [node('world', null), node('region', 'world', 5, 5), node('town', 'region', 5, 5), node('cave', 'region', 2, 2, -1)];
const sources: Record<string, MapSource> = { world, region, town, cave };
const lookup = (n: string) => sources[n];

describe('placement transforms', () => {
  it('a child pixel maps to where the child sits on its parent', () => {
    const a = childToParent(region.map, 100, world.map, 1000, { col: 5, row: 5 });
    near(apply(a, { x: 0, y: 0 }), { x: 40, y: 40 });
    near(apply(a, { x: 200, y: 100 }), { x: 60, y: 50 });
  });

  it('related maps: ancestors up to the root, Z = 0 descendants, placed in the open map', () => {
    const rel = relatedMaps('region', nodes, lookup);
    expect(rel.map((m) => [m.name, m.depth])).toEqual([['world', -1], ['town', 1]]);
    const w = rel.find((m) => m.name === 'world')!;
    near(apply(w.toOpen, { x: 40, y: 40 }), { x: 0, y: 0 });     // the region's corner
    near(rel.find((m) => m.name === 'town')!.rect, { x0: 40, y0: 40, x1: 60, y1: 60 });
    // From the town, the world is two levels up
    const fromTown = relatedMaps('town', nodes, lookup);
    expect(fromTown.map((m) => [m.name, m.depth])).toEqual([['region', -1], ['world', -2]]);
    const pt = apply(fromTown.find((m) => m.name === 'world')!.toOpen, { x: 44, y: 44 });
    expect(pt.x).toBeCloseTo(0);  // world px 44 = region px 40 = town px 0
    expect(pt.y).toBeCloseTo(0);
  });

  it('a filter can leave out small descendants', () => {
    expect(relatedMaps('region', nodes, lookup, () => false).map((m) => m.name)).toEqual(['world']);
  });
});

describe('ghost lines', () => {
  it('an ancestor line is placed on the child and clipped to it; a descendant line sits in its footprint', () => {
    const fromRegion = relatedMaps('region', nodes, lookup);
    const ghosts = ghostLines(fromRegion, mapExtent(region.map));
    const w = ghosts.find((g) => g.key === 'world#1')!;
    // World line y = 50 is region y = (50 - 40) * 10 = 100
    near(linePoints(w.placed)[0], { x: -400, y: 100 });
    expect(w.clipTo).toEqual({ x0: 0, y0: 0, x1: 200, y1: 200 });
    const townWithLine = square('town', 10, [line(7, [{ x: 0, y: 0 }, { x: 200, y: 200 }])]);
    const rel = relatedMaps('region', nodes, (n) => (n === 'town' ? townWithLine : sources[n]));
    const t = ghostLines(rel, mapExtent(region.map)).find((g) => g.key === 'town#7')!;
    near(linePoints(t.placed)[0], { x: 40, y: 40 });
    near(linePoints(t.placed)[1], { x: 60, y: 60 });
    expect(t.clipTo).toBeNull();
  });
});

describe('refinement', () => {
  const townRefining = square('town', 10, [line(8, [{ x: 0, y: 100 }, { x: 200, y: 100 }], {
    properties: [{ name: REFINES_PROPERTY, type: 'string', value: 'region#2' }],
  })]);
  const look = (n: string) => (n === 'town' ? townRefining : sources[n]);

  it('reads links and indexes which maps refine each line', () => {
    expect(refinesOf(townRefining.map.layers[1].type === 'objectgroup' ? townRefining.map.layers[1].objects[0] : ({} as TmjObject)))
      .toEqual({ map: 'region', id: 2 });
    const rel = relatedMaps('region', nodes, look);
    const index = refinedByIndex('region', region.map, rel);
    expect(index.get('region#2')).toEqual(['town']);
  });

  it("on the parent, its own line is hidden inside the refining child's area", () => {
    const rel = relatedMaps('region', nodes, look);
    const index = refinedByIndex('region', region.map, rel);
    const hidden = hiddenAreas(lineKey('region', 2), index, 'region', mapExtent(region.map), rel);
    expect(hidden).toHaveLength(1);
    near(hidden[0], { x0: 40, y0: 40, x1: 60, y1: 60 });
    expect(hiddenAreas(lineKey('region', 99), index, 'region', mapExtent(region.map), rel)).toEqual([]);
  });

  it("on the child, the ancestor's line it refines is hidden entirely", () => {
    const rel: RelatedMap[] = relatedMaps('town', nodes, look);
    const index = refinedByIndex('town', townRefining.map, rel);
    expect(index.get('region#2')).toContain('town');
    expect(hiddenAreas('region#2', index, 'town', mapExtent(town.map), rel)).toEqual([mapExtent(town.map)]);
  });
});

describe('copy to this map', () => {
  it('clips a line to an area: pieces, kept widths, blank widths at the edges', () => {
    const pts = [{ x: -10, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 30 }, { x: 8, y: 5 }, { x: 30, y: 5 }];
    const pieces = clipPolyline(pts, [1, 2, 3, 4, 5], { x0: 0, y0: 0, x1: 10, y1: 10 });
    expect(pieces).toHaveLength(2); // leaves at the bottom and comes back
    expect(pieces[0].points[0]).toEqual({ x: 0, y: 5 });
    expect(pieces[0].widths).toEqual([null, 2, null]);
    expect(pieces[1].points[pieces[1].points.length - 1]).toEqual({ x: 10, y: 5 });
    expect(pieces[1].widths).toEqual([null, 4, null]);
    expect(clipPolyline([{ x: 50, y: 50 }, { x: 60, y: 60 }], [null, null], { x0: 0, y0: 0, x1: 10, y1: 10 })).toEqual([]);
  });

  it("copies the part of a parent's line inside the child, linked back to it", () => {
    const rel = relatedMaps('town', nodes, lookup);
    // Region line 3 (y = 50) crosses the town at town y = (50 - 40) * 10 = 100
    const g = ghostLines(rel, mapExtent(town.map)).find((x) => x.key === 'region#3')!;
    const pieces = adoptPieces(g, mapExtent(town.map));
    expect(pieces).toHaveLength(1);
    near(pieces[0].points[0], { x: 0, y: 100 });
    near(pieces[0].points[1], { x: 200, y: 100 });
    // Region line 2 (y = 100) is town y = 600: it doesn't cross the town
    const g2 = ghostLines(rel, mapExtent(town.map)).find((x) => x.key === 'region#2')!;
    expect(adoptPieces(g2, mapExtent(town.map))).toEqual([]);
    s().loadMap(town.map, 'town', 'ws');
    s().addLine(pieces[0].points, g.object.type, { name: g.object.name, widths: pieces[0].widths, properties: [{ name: REFINES_PROPERTY, type: 'string', value: g.key }] });
    const copy = readLines(s().mapData!)[0].object;
    expect(refinesOf(copy)).toEqual({ map: 'region', id: 3 });
    expect(copy.name).toBe('L3');
  });
});

const s = () => useMapStore.getState();

describe('selecting a line from another map', () => {
  beforeEach(() => {
    s().loadMap(region.map, 'region', 'ws');
    s().setZoom(1);
    useViewStore.getState().setShowLines(true);
    const rel = relatedMaps('region', nodes, lookup);
    useCrossScaleStore.getState().setRelated('ws/region', rel, ghostLines(rel, mapExtent(region.map)), mapExtent(region.map));
  });

  it('finds a visible ghost under the pointer, not one that is switched off or elsewhere', () => {
    expect(ghostAt(s(), { x: 100, y: 101 }, 4)).toBe('world#1');
    expect(ghostAt(s(), { x: 100, y: 150 }, 4)).toBeNull();
    useViewStore.getState().setShowLines(false);
    expect(ghostAt(s(), { x: 100, y: 101 }, 4)).toBeNull();
  });

  it("a ghost the open map has refined can't be picked", () => {
    s().addLine([{ x: 0, y: 100 }, { x: 200, y: 100 }], 'major-road', { properties: [{ name: REFINES_PROPERTY, type: 'string', value: 'world#1' }] });
    expect(ghostAt(s(), { x: 100, y: 101 }, 4)).toBeNull();
  });
});

// Keep TmjMap referenced for type checking of the helpers above
export type _Unused = TmjMap;

describe('the Roads & rivers toggle governs lines, not their layers', () => {
  const hiddenLayerMap = (): TmjMap => {
    const m = square('h', 100, [line(1, [{ x: 0, y: 10 }, { x: 100, y: 10 }]), line(2, [{ x: 0, y: 30 }, { x: 100, y: 30 }], { visible: false })]).map;
    m.layers[1].visible = false;
    return m;
  };

  it('lines on a hidden layer are still read; a line hidden by itself is left out when asked', () => {
    const m = hiddenLayerMap();
    expect(readLines(m).map((l) => l.id)).toEqual([1, 2]);
    expect(readLines(m, true).map((l) => l.id)).toEqual([1]);
  });

  it("other maps' lines on hidden layers still show as ghosts", () => {
    const hiddenRegion = { ...region, map: (() => { const m = structuredClone(region.map); m.layers[1].visible = false; return m; })() };
    const rel = relatedMaps('town', nodes, (n) => (n === 'region' ? hiddenRegion : sources[n]));
    expect(ghostLines(rel, mapExtent(town.map)).map((g) => g.key)).toContain('region#3');
  });

  it("the Line tool can't pick lines while they're hidden", async () => {
    const { lineTool } = await import('../tools/lineTool');
    s().loadMap(hiddenLayerMap(), 'h', 'ws');
    s().setZoom(1);
    useViewStore.getState().selectLine(null);
    useViewStore.getState().setDraftLine(null);
    useViewStore.getState().setShowLines(false);
    lineTool.onPress(0, 0, s(), { x: 50, y: 10 });
    lineTool.onRelease(s());
    expect(useViewStore.getState().selectedLineId).toBeNull();
    useViewStore.getState().setDraftLine(null);
    useViewStore.getState().setShowLines(true);
    lineTool.onPress(0, 0, s(), { x: 50, y: 10 });
    lineTool.onRelease(s());
    expect(useViewStore.getState().selectedLineId).toBe(1); // on a hidden layer, but shown
  });
});
