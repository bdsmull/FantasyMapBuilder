import { describe, it, expect, beforeEach } from 'vitest';
import { childRect, placementAt, detectRectOverlaps } from '../utils/worldSetUtils';
import { placeChild } from '../utils/worldSurface';
import { relatedMaps, ghostLines, mapExtent } from '../utils/crossScaleLines';
import { mapOriginMeters } from '../utils/heightGeneration';
import { getWarnings } from '../utils/hierarchyPanelLogic';
import { useWorldSetStore } from '../store/worldSetStore';
import type { TmjMap, TmjObject } from '../types/tmj';
import type { WorldSetNode } from '../types/worldSet';

const near = (a: object, b: object) => {
  const x = a as Record<string, number>, y = b as Record<string, number>;
  for (const k of Object.keys(y)) expect(x[k]).toBeCloseTo(y[k], 9);
};

// The Brakka case: a 360 x 220 m town (5 m cells) on a region of 25 km cells
const TOWN = { w: 72, h: 44, mpu: 5 };
const REGION_MPU = 25_000;

describe('childRect and placementAt', () => {
  it('a small child sits at its cell centre by default, its real size', () => {
    const r = childRect(TOWN.w, TOWN.h, TOWN.mpu, REGION_MPU, { col: 13, row: 16 });
    near(r, { left: 13.5 - 0.0072, top: 16.5 - 0.0044, width: 0.0144, height: 0.0088 });
  });

  it('an offset moves it; placementAt finds the anchor and offset for an exact point', () => {
    // The "Nauram" marker at region cell (13.54, 16.02): the top of cell (13, 16)
    const { anchor, offset } = placementAt(TOWN.w, TOWN.h, TOWN.mpu, REGION_MPU, 13.54, 16.02);
    expect(anchor).toEqual({ col: 13, row: 16 });
    near(offset!, { x: 0.04, y: -0.48 });
    const r = childRect(TOWN.w, TOWN.h, TOWN.mpu, REGION_MPU, anchor, offset);
    near({ cu: r.left + r.width / 2, cv: r.top + r.height / 2 }, { cu: 13.54, cv: 16.02 });
    // placeChild (elevation, lines, generation) agrees
    const p = placeChild(TOWN.w, TOWN.h, TOWN.mpu, REGION_MPU, anchor, offset);
    near({ left: p.left, top: p.top }, { left: r.left, top: r.top });
  });

  it('the default spot needs no offset; large children keep their whole-cell centring', () => {
    expect(placementAt(TOWN.w, TOWN.h, TOWN.mpu, REGION_MPU, 13.5, 16.5).offset).toBeNull();
    // 10 cells of 1 m on 4 m cells: footprint cols 4..6 around anchor 5, centred at 5.5
    near(childRect(10, 10, 1, 4, { col: 5, row: 5 }), { left: 4.25, top: 4.25, width: 2.5, height: 2.5 });
  });
});

describe('overlaps use real areas', () => {
  it('two small maps in the same big cell only overlap if their areas do', () => {
    const a = childRect(TOWN.w, TOWN.h, TOWN.mpu, REGION_MPU, { col: 13, row: 16 }, { x: -0.3, y: 0 });
    const b = childRect(TOWN.w, TOWN.h, TOWN.mpu, REGION_MPU, { col: 13, row: 16 }, { x: 0.3, y: 0 });
    const c = childRect(TOWN.w, TOWN.h, TOWN.mpu, REGION_MPU, { col: 13, row: 16 }, { x: 0.305, y: 0 });
    expect(detectRectOverlaps([{ mapName: 'a', z: 0, rect: a }, { mapName: 'b', z: 0, rect: b }])).toEqual([]);
    expect(detectRectOverlaps([{ mapName: 'c', z: 0, rect: c }, { mapName: 'b', z: 0, rect: b }])).toEqual([['b', 'c']]);
    expect(detectRectOverlaps([{ mapName: 'c', z: 1, rect: c }, { mapName: 'b', z: 0, rect: b }])).toEqual([]);
  });

  it('the hierarchy panel warns only for real overlaps', () => {
    const map = (mpu: number, w = TOWN.w, h = TOWN.h): TmjMap => ({
      orientation: 'orthogonal', width: w, height: h, tilewidth: 16, tileheight: 16, nextlayerid: 1, nextobjectid: 1,
      tilesets: [], layers: [], metersPerUnit: mpu,
    });
    const nodes: WorldSetNode[] = [
      { mapName: 'region', parentMapName: null, parentAnchor: null, z: 0 },
      { mapName: 'east', parentMapName: 'region', parentAnchor: { col: 13, row: 16 }, parentOffset: { x: 0.3, y: 0 }, z: 0 },
      { mapName: 'west', parentMapName: 'region', parentAnchor: { col: 13, row: 16 }, parentOffset: { x: -0.3, y: 0 }, z: 0 },
    ];
    const ctx = {
      mapDataCache: { region: map(REGION_MPU, 30, 30), east: map(TOWN.mpu), west: map(TOWN.mpu) },
      knownMapNames: new Set(['region', 'east', 'west']),
      allNodes: nodes,
    };
    expect(getWarnings(nodes[1], ctx).filter((w) => w.startsWith('Footprint overlap'))).toEqual([]);
  });
});

describe('everything placed follows the offset', () => {
  const sq = (w: number, h: number, mpu: number, objects: TmjObject[] = []): { map: TmjMap; mpu: number } => ({
    mpu,
    map: {
      orientation: 'orthogonal', width: w, height: h, tilewidth: 32, tileheight: 32, nextlayerid: 3, nextobjectid: 9,
      tilesets: [], metersPerUnit: mpu,
      layers: [{ type: 'objectgroup', id: 2, name: 'Roads', visible: true, opacity: 1, offsetx: 0, offsety: 0, color: '#fff', objects }],
    },
  });
  // A road on the region starting at the Nauram marker (region cell 13.54, 16.02 = px 433.3, 512.6)
  const road: TmjObject = { id: 4, name: 'Road east', type: 'road', x: 433.3, y: 512.6, width: 0, height: 0, visible: true, polyline: [{ x: 0, y: 0 }, { x: 80, y: 0 }] };
  const region = sq(30, 30, REGION_MPU, [road]);
  const town = sq(TOWN.w, TOWN.h, TOWN.mpu);
  const placed = placementAt(TOWN.w, TOWN.h, TOWN.mpu, REGION_MPU, 433.3 / 32, 512.6 / 32);
  const nodes = (offset: { x: number; y: number } | null): WorldSetNode[] => [
    { mapName: 'region', parentMapName: null, parentAnchor: null, z: 0 },
    { mapName: 'town', parentMapName: 'region', parentAnchor: placed.anchor, parentOffset: offset, z: 0 },
  ];
  const lookup = (n: string) => (n === 'region' ? region : town);

  it("with the town on the marker, the region's road starts inside the town; without, it misses it", () => {
    const onMarker = ghostLines(relatedMaps('town', nodes(placed.offset), lookup), mapExtent(town.map))[0];
    const start = onMarker.placed.polyline![0];
    const ext = mapExtent(town.map);
    near(start, { x: (ext.x1 - ext.x0) / 2, y: (ext.y1 - ext.y0) / 2 }); // the town's centre
    const centred = ghostLines(relatedMaps('town', nodes(null), lookup), mapExtent(town.map))[0];
    expect(centred.placed.polyline![0].y).toBeLessThan(-1000); // ~12 km north, far off the town
  });

  it('generation origins follow too', () => {
    const o = mapOriginMeters('town', nodes(placed.offset), (n) => lookup(n));
    near(o, { x: (433.3 / 32) * REGION_MPU - 180, y: (512.6 / 32) * REGION_MPU - 110 }); // centre minus half the town
  });
});

describe('updateNode and the fine position', () => {
  beforeEach(() => {
    useWorldSetStore.setState({
      activeWorldSetName: 'ws',
      activeWorldSet: {
        name: 'ws', version: '1.0', nodes: [
          { mapName: 'region', parentMapName: null, parentAnchor: null, z: 0 },
          { mapName: 'town', parentMapName: 'region', parentAnchor: { col: 13, row: 16 }, parentOffset: { x: 0.04, y: -0.48 }, z: 0 },
        ],
      },
    });
  });
  const town = () => useWorldSetStore.getState().activeWorldSet!.nodes[1];

  it('the same anchor (e.g. saving the dialog with a new Z label) keeps it', () => {
    useWorldSetStore.getState().updateNode('town', { parentAnchor: { col: 13, row: 16 }, zLabel: 'Ground' });
    expect(town().parentOffset).toEqual({ x: 0.04, y: -0.48 });
  });

  it('a different anchor drops it; an explicit offset sets or clears it', () => {
    useWorldSetStore.getState().updateNode('town', { parentAnchor: { col: 2, row: 2 } });
    expect(town().parentOffset).toBeUndefined();
    useWorldSetStore.getState().updateNode('town', { parentOffset: { x: 0.1, y: 0.1 } });
    expect(town().parentOffset).toEqual({ x: 0.1, y: 0.1 });
    useWorldSetStore.getState().updateNode('town', { parentOffset: null });
    expect(town().parentOffset).toBeUndefined();
  });
});
