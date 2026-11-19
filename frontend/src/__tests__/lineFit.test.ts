import { describe, it, expect } from 'vitest';
import { edgeCrossings, fitRefinedLine, checkRefinements, describeRefinement } from '../utils/lineFit';
import { relatedMaps } from '../utils/crossScaleLines';
import type { MapSource } from '../utils/crossScaleLines';
import { getWarnings } from '../utils/hierarchyPanelLogic';
import type { TmjMap, TmjObject } from '../types/tmj';
import type { WorldSetNode } from '../types/worldSet';

const area = { x0: 0, y0: 0, x1: 100, y1: 100 };

describe('edgeCrossings', () => {
  it('finds where a line enters and leaves an area, not where it ends inside', () => {
    expect(edgeCrossings([{ x: -50, y: 50 }, { x: 150, y: 50 }], area)).toEqual([{ x: 0, y: 50 }, { x: 100, y: 50 }]);
    expect(edgeCrossings([{ x: -50, y: 50 }, { x: 40, y: 50 }], area)).toEqual([{ x: 0, y: 50 }]);
    expect(edgeCrossings([{ x: 200, y: 50 }, { x: 300, y: 50 }], area)).toEqual([]);
  });
});

describe('fitRefinedLine', () => {
  const original = [{ x: -50, y: 50 }, { x: 150, y: 50 }];

  it('ok when the copy meets the crossings (its inside can wander)', () => {
    const copy = { id: 7, points: [{ x: 0, y: 51 }, { x: 50, y: 20 }, { x: 100, y: 49 }] };
    expect(fitRefinedLine([copy], original, area, 4).status).toBe('ok');
  });

  it('moved when the original has moved: the ends that are off, and snaps for them', () => {
    const copy = { id: 7, points: [{ x: 0, y: 30 }, { x: 100, y: 50 }] };
    const r = fitRefinedLine([copy], original, area, 4);
    expect(r.status).toBe('moved');
    expect(r.offPx).toBeCloseTo(20);
    expect(r.badEnds).toEqual([{ copyId: 7, index: 0, at: { x: 0, y: 30 } }]);
    expect(r.fixes).toEqual([{ copyId: 7, index: 0, to: { x: 0, y: 50 } }]);
    expect(r.unmatchedCrossings).toEqual([{ x: 0, y: 50 }]);
  });

  it('moved when the original now crosses where no copy end is', () => {
    const copy = { id: 7, points: [{ x: 0, y: 50 }, { x: 60, y: 50 }] }; // ends inside, short of the far edge
    const r = fitRefinedLine([copy], original, area, 4);
    expect(r.status).toBe('moved');
    expect(r.badEnds).toEqual([]);
    expect(r.unmatchedCrossings).toEqual([{ x: 100, y: 50 }]);
  });

  it('left when the original no longer crosses; missing when it is gone', () => {
    const copy = { id: 7, points: [{ x: 0, y: 50 }, { x: 100, y: 50 }] };
    expect(fitRefinedLine([copy], [{ x: 200, y: 50 }, { x: 300, y: 50 }], area, 4).status).toBe('left');
    expect(fitRefinedLine([copy], null, area, 4).status).toBe('missing');
  });

  it('several pieces of one original are checked together', () => {
    const wiggle = [{ x: -10, y: 20 }, { x: 50, y: 20 }, { x: 50, y: -10 }, { x: 80, y: -10 }, { x: 80, y: 50 }, { x: 150, y: 50 }];
    const pieces = [
      { id: 1, points: [{ x: 0, y: 20 }, { x: 50, y: 20 }, { x: 50, y: 0 }] },
      { id: 2, points: [{ x: 80, y: 0 }, { x: 80, y: 50 }, { x: 100, y: 50 }] },
    ];
    expect(fitRefinedLine(pieces, wiggle, area, 4).status).toBe('ok');
  });
});

// Region (10 m cells, 16 px) with a town (1 m cells, 16 px; 20 x 20 m = 2 x 2 region cells at (5, 5))
const sq = (w: number, h: number, mpu: number, objects: TmjObject[] = []): MapSource => ({
  mpu,
  map: {
    orientation: 'orthogonal', width: w, height: h, tilewidth: 16, tileheight: 16, nextlayerid: 3, nextobjectid: 20,
    tilesets: [], metersPerUnit: mpu,
    layers: [{ type: 'objectgroup', id: 2, name: 'Roads', visible: true, opacity: 1, offsetx: 0, offsety: 0, color: '#fff', objects }],
  },
});
const line = (id: number, pts: { x: number; y: number }[], refines?: string): TmjObject => ({
  id, name: `Road ${id}`, type: 'minor-road', width: 0, height: 0, visible: true,
  x: pts[0].x, y: pts[0].y, polyline: pts.map((p) => ({ x: p.x - pts[0].x, y: p.y - pts[0].y })),
  ...(refines ? { properties: [{ name: 'refines', type: 'string' as const, value: refines }] } : {}),
});
const nodes: WorldSetNode[] = [
  { mapName: 'region', parentMapName: null, parentAnchor: null, z: 0 },
  { mapName: 'town', parentMapName: 'region', parentAnchor: { col: 5, row: 5 }, z: 0 },
];
// The town covers region px 64..96. Region road along y = 80 crosses it at x = 64 and 96,
// which is town y = (80 - 64) * 10 = 160, x = 0 and 320.

describe('checkRefinements', () => {
  const region = (roadY: number) => sq(20, 20, 10, [line(4, [{ x: 0, y: roadY }, { x: 320, y: roadY }])]);
  const town = sq(20, 20, 1, [line(9, [{ x: 0, y: 160 }, { x: 100, y: 120 }, { x: 320, y: 160 }], 'region#4')]);

  it("on the child: its copy fits until the parent's road moves", () => {
    const fits = (roadY: number) => {
      const src: Record<string, MapSource> = { region: region(roadY), town };
      return checkRefinements('town', town.map, relatedMaps('town', nodes, (n) => src[n]));
    };
    expect(fits(80).map((c) => [c.refiningMap, c.original, c.result.status])).toEqual([['town', 'region#4', 'ok']]);
    const moved = fits(85); // 5 region px = 50 town px: well past two town cells
    expect(moved[0].result.status).toBe('moved');
    expect(moved[0].result.fixes.map((f) => [f.index, f.to.y])).toEqual([[0, 210], [2, 210]]);
  });

  it("on the parent: a child's copy of its own line is checked in the parent's pixels", () => {
    const moved = region(85);
    const src: Record<string, MapSource> = { region: moved, town };
    const checks = checkRefinements('region', moved.map, relatedMaps('region', nodes, (n) => src[n]));
    expect(checks.map((c) => [c.refiningMap, c.original, c.result.status])).toEqual([['town', 'region#4', 'moved']]);
    expect(describeRefinement(checks[0], 10 / 16, (m) => `${m.toFixed(0)} m`)).toBe('doesn\'t meet "Road 4" at the map\'s edge any more (up to 3 m off)');
  });

  it('describes an original that left the map or is gone, to follow "This copy"', () => {
    const text = (roadY: number | null) => {
      const reg = roadY === null ? sq(20, 20, 10) : region(roadY);
      const src: Record<string, MapSource> = { region: reg, town };
      const [c] = checkRefinements('town', town.map, relatedMaps('town', nodes, (n) => src[n]));
      return describeRefinement(c, 1 / 16, (m) => `${m} m`);
    };
    expect(text(200)).toBe('doesn\'t meet "Road 4" any more: the original no longer crosses town');
    expect(text(null)).toBe('has lost its original: that line no longer exists');
  });

  it('shows as a hierarchy warning', () => {
    const map = (mpu: number): TmjMap => ({ ...sq(20, 20, mpu).map });
    const w = getWarnings(nodes[1], {
      mapDataCache: { region: map(10), town: map(1) },
      knownMapNames: new Set(['region', 'town']),
      allNodes: nodes,
      lineMismatch: { town: 'a refined line no longer meets "Road 4"' },
    });
    expect(w).toContain('Line mismatch: a refined line no longer meets "Road 4"');
  });
});
