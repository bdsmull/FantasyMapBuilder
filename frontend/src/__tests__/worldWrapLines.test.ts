import { describe, it, expect, beforeEach } from 'vitest';
import { goesRound, mod, onOwnTurn, reachShifts, shiftsOnto, turnReach, wrapPeriodPx, wrapView } from '../utils/worldWrap';
import type { HeightPatch } from '../utils/heightGrid';
import { heightAt, sampleGrid } from '../utils/heightGrid';
import { carveRivers } from '../utils/carve';
import { computeFlow } from '../utils/flow';
import { streamPicker } from '../utils/streamTrace';
import { contourTargets, readContours } from '../utils/contours';
import { fitHeights } from '../utils/surfaceFit';
import { linePoints, readLines } from '../utils/lines';
import type { Pt } from '../utils/lines';
import { ceilingAt, NO_CEILING_CONTEXT, readCeilings } from '../utils/ceilings';
import { inspectAt } from '../utils/inspect';
import {
  adoptPieces, ghostLines, hiddenAreas, lineKey, mapExtent, refinedByIndex, relatedMaps, worldTurn, REFINES_PROPERTY,
} from '../utils/crossScaleLines';
import type { MapSource } from '../utils/crossScaleLines';
import { checkRefinements } from '../utils/lineFit';
import { drawLine } from '../canvas/lineRenderer';
import { ghostAt, lineToolKey, roadsTool } from '../tools/lineTool';
import { contourDrag, contourPicks, contourPress, contourRelease } from '../tools/contourMode';
import { BUILTIN_LINE_CLASSES } from '../data/lineClasses';
import { DEFAULT_HEIGHT_BRUSH } from '../utils/heightBrush';
import { useMapStore } from '../store/mapStore';
import { useViewStore } from '../store/viewStore';
import { useCrossScaleStore } from '../store/crossScaleStore';
import type { TmjMap, TmjObject } from '../types/tmj';
import type { WorldSetNode } from '../types/worldSet';

const wrapX = { name: 'wrapX', type: 'bool' as const, value: true };
const base = { nextlayerid: 2, nextobjectid: 100, tilesets: [], properties: [wrapX] };
const square = { ...base, orientation: 'orthogonal', width: 16, height: 9, tilewidth: 20, tileheight: 20, layers: [] } as TmjMap;
const hexFlat = {
  ...base, orientation: 'hexagonal', width: 16, height: 9, tilewidth: 40, tileheight: 34, hexsidelength: 20,
  staggeraxis: 'x', staggerindex: 'odd', layers: [],
} as TmjMap;
const hexPointy = { ...hexFlat, width: 13, tilewidth: 34, tileheight: 40, staggeraxis: 'y', staggerindex: 'even' } as TmjMap;
const MAPS: [string, TmjMap][] = [['square', square], ['flat-topped hex', hexFlat], ['pointy-topped hex', hexPointy]];
const flat = (map: TmjMap): TmjMap => ({ ...map, properties: [] });
/** Columns to turn by: even, so flat-topped hexes keep their stagger. */
const K = 6;

function ground(map: TmjMap, seed = 1, amp = 5_000): HeightPatch {
  const { cols, rows } = sampleGrid(map);
  let s = seed;
  const cm = Int32Array.from({ length: cols * rows }, () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return Math.round((s / 4294967296) * amp);
  });
  if (map.orientation !== 'hexagonal') for (let i = cols - 1; i < cm.length; i += cols) cm[i] = cm[i - cols + 1];
  return { cols, rows, cm, mask: new Uint8Array(cols * rows) };
}
const turned = (map: TmjMap, cm: Int32Array, cols: number, k: number): Int32Array =>
  cm.map((_, i) => cm[i - (i % cols) + mod((i % cols) - k, map.width)]);
/** Points turned `k` columns round the world, then kept on the map as stored. */
const turnedPts = (map: TmjMap, pts: Pt[], k: number): Pt[] =>
  onOwnTurn(map, pts.map((p) => ({ x: p.x + (k * wrapPeriodPx(map)) / map.width, y: p.y })));

const object = (o: Partial<TmjObject> & { id: number }): TmjObject => ({ name: '', type: '', x: 0, y: 0, width: 0, height: 0, visible: true, ...o });
const line = (id: number, pts: Pt[], o: Partial<TmjObject> = {}): TmjObject =>
  object({ id, type: 'river', x: pts[0].x, y: pts[0].y, polyline: pts.map((p) => ({ x: p.x - pts[0].x, y: p.y - pts[0].y })), ...o });
const withObjects = (map: TmjMap, objects: TmjObject[]): TmjMap => ({
  ...map,
  layers: [{ type: 'objectgroup', id: 1, name: 'o', visible: true, opacity: 1, offsetx: 0, offsety: 0, color: '#fff', objects }],
});
const height = (m: number, reach = 3) => [{ name: 'height', type: 'float' as const, value: m }, { name: 'reach', type: 'float' as const, value: reach }];

describe('turns', () => {
  it('shifts bring a span over another, however many turns away', () => {
    expect(shiftsOnto(100, 90, 120, 0, 100)).toEqual([-100, 0]);
    expect(shiftsOnto(100, 310, 320, 0, 100)).toEqual([-300]);
    expect(shiftsOnto(100, 0, 100, 40, 60)).toEqual([0]);
    expect(shiftsOnto(100, 10, 20, 30, 40)).toEqual([]);
    expect(shiftsOnto(0, 10, 20, 30, 40)).toEqual([0]); // no wrap
  });

  it('lines start on the map and carry on from there', () => {
    expect(onOwnTurn(square, [{ x: 330, y: 1 }, { x: 310, y: 2 }])).toEqual([{ x: 10, y: 1 }, { x: -10, y: 2 }]);
    expect(onOwnTurn(square, [{ x: -10, y: 1 }, { x: 10, y: 2 }])).toEqual([{ x: 310, y: 1 }, { x: 330, y: 2 }]);
    const outside = [{ x: 330, y: 1 }, { x: 310, y: 2 }];
    expect(onOwnTurn(flat(square), outside)).toEqual(outside);
  });

  it('a line that runs on round the world is looked for, and drawn, as far as it goes', () => {
    expect(turnReach(flat(square))).toBe(0);
    expect(turnReach(square)).toBe(1);
    expect(reachShifts(flat(square))).toEqual([0]);
    expect(reachShifts(square)).toEqual([0, -320, 320]);
    const long = withObjects(square, [line(1, [{ x: 300, y: 40 }, { x: 900, y: 40 }, { x: 1000, y: 90 }])]);
    expect(turnReach(long)).toBe(3);
    expect(turnReach(square, [{ x: -700, y: 0 }])).toBe(3);
    const v = wrapView(long, 1, 0, 320, turnReach(long))!;
    expect(v.marks).toEqual([-3, -2, -1, 0, 1, 2, 3]);
    // Inspect finds its far end
    expect(inspectAt(long, 1000 - 3 * 320, 90, 4)!.objects.map((o) => o.id)).toEqual([1]);
  });
});

describe.each(MAPS)('lines over the seam of a %s map', (_name, map) => {
  const P = wrapPeriodPx(map), { cols, rows } = sampleGrid(map);
  const midY = (rows / 2) * map.tileheight * 0.8;
  const river = [{ x: P - 70, y: midY - 20 }, { x: P - 10, y: midY }, { x: P + 60, y: midY + 18 }];
  const carve = (p: HeightPatch, pts: Pt[], mask = true) => {
    const m = withObjects(map, [line(1, pts)]);
    return carveRivers(m, p, readLines(m), BUILTIN_LINE_CLASSES, 100, { keepHandSet: mask });
  };

  it('a river is carved the same there as anywhere', () => {
    const p = ground(map, 5);
    const a = carve(p, river);
    const b = carve({ ...p, cm: turned(map, p.cm, cols, K) }, turnedPts(map, river, K));
    expect(a.changed).toBeGreaterThan(4);
    expect([...turned(map, b.cm, cols, -K)]).toEqual([...a.cm]);
    // Both sides of the seam were lowered
    const lowered = new Set<number>();
    a.cm.forEach((v, i) => { if (v < p.cm[i]) lowered.add(i % cols); });
    expect([...lowered].some((c) => c === 0 || c === 1)).toBe(true);
    expect([...lowered].some((c) => c === map.width - 2 || c === map.width - 1)).toBe(true);
    // Wherever the file says it starts (Tiled could move it a turn)
    for (const t of [-2, -1, 1, 2]) expect([...carve(p, river.map((q) => ({ ...q, x: q.x + t * P }))).cm]).toEqual([...a.cm]);
  });

  it('a river beside the seam lowers the samples just past it', () => {
    const p = ground(map, 8);
    const beside = [{ x: 2, y: midY - 40 }, { x: 2, y: midY + 40 }];
    const a = carve(p, beside);
    const b = carve({ ...p, cm: turned(map, p.cm, cols, K) }, turnedPts(map, beside, K));
    expect([...turned(map, b.cm, cols, -K)]).toEqual([...a.cm]);
  });

  it('heights are fitted to a contour across it', () => {
    const contour = object({ id: 1, type: 'contour', x: P - 60, y: midY, polyline: [{ x: 0, y: 0 }, { x: 60, y: 14 }, { x: 115, y: -6 }], properties: height(40) });
    const p = ground(map, 3, 300);
    const fit = (cm: Int32Array, o: TmjObject) => {
      const m = withObjects(map, [o]);
      return fitHeights(m, { ...p, cm }, contourTargets(m, readContours(m)));
    };
    const a = fit(p.cm, contour);
    expect(a.maxMissCm).toBeLessThan(15);
    for (const x of [P - 50, P + 2, 45]) {
      const t = x < 100 ? x + P : x, y = t < P ? midY + ((t - (P - 60)) / 60) * 14 : midY + 14 - ((t - P) / 55) * 20;
      expect(Math.abs(heightAt(map, { ...p, cm: a.cm }, x, y) - 4_000)).toBeLessThan(40);
    }
    // The same stored two turns away
    const far = fit(p.cm, { ...contour, x: contour.x - 2 * P });
    for (let i = 0; i < far.cm.length; i++) expect(Math.abs(far.cm[i] - a.cm[i])).toBeLessThanOrEqual(1);
  });

  it('a stream is converted to the same river wherever the seam is, and joins one drawn from the other side', () => {
    // A valley along the middle row, falling west from 5 columns past the seam to 5 before it
    const mid = Math.floor(rows / 2), valley = new Int32Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const along = mod((c % map.width) + 5, map.width); // 0 at column W - 5
        valley[r * cols + c] = along <= 10 ? 1_000 + along * 200 + Math.abs(r - mid) * 900 : 30_000;
      }
    }
    for (let r = mid; r < rows; r++) valley[r * cols + map.width - 5] = 900 - r * 50;
    const xOf = (c: number) => (map.orientation === 'hexagonal' ? (c + 0.5) * (P / map.width) : c * map.tilewidth);
    const yOf = map.orientation === 'hexagonal' ? (map.staggeraxis === 'x' ? (mid + 0.5) * 34 + 8 : mid * 30 + 20) : mid * 20;
    const pick = (cm: Int32Array, x: number, rivers: TmjObject[] = []) => {
      const m = withObjects(map, rivers);
      return streamPicker(m, cols, rows, computeFlow(m, cols, rows, cm, null), null, 4, readLines(m), BUILTIN_LINE_CLASSES, null).at(mod(x, P), yOf, map.tilewidth);
    };
    const a = pick(valley, xOf(1))!, b = pick(turned(map, valley, cols, K), xOf(1 + K))!;
    expect(a.end).toBe('edge');
    expect(a.points[0].x).toBeGreaterThan(0);
    expect(a.points[a.points.length - 1].x).toBeLessThan(0); // it ran on past the west edge
    for (let i = 1; i < a.points.length; i++) expect(a.points[i].x - a.points[i - 1].x).toBeLessThan(map.tilewidth); // always west
    const back = turnedPts(map, b.points, -K);
    expect(back).toHaveLength(a.points.length);
    back.forEach((p, i) => { expect(p.x).toBeCloseTo(a.points[i].x, 6); expect(p.y).toBeCloseTo(a.points[i].y, 6); });

    // A drawn river crosses it before the seam (stored a turn to the west of there): the stream ends on it
    const cross = line(7, [{ x: xOf(map.width - 3) - 2 * P, y: 0 }, { x: xOf(map.width - 3) - 2 * P, y: 400 }]);
    const joined = pick(valley, xOf(1), [cross])!;
    expect(joined.end).toBe('river');
    expect(joined.points[joined.points.length - 1].x).toBeCloseTo(xOf(map.width - 3) - P, 6);
  });
});

describe('drawing over the seam', () => {
  const s = () => useMapStore.getState();
  const v = () => useViewStore.getState();
  const P = 320;
  const drawn = () => readLines(s().mapData!).map((l) => linePoints(l.object));
  /** Clicks far apart in time, so none counts as a double-click. */
  const click = (press: (pos: Pt) => void, pts: Pt[]) => pts.forEach((p) => press(p));
  beforeEach(() => {
    useMapStore.setState({
      mapData: withObjects(square, []), mapName: 'w', mapWorldSet: 'ws', activeLayerIndex: 0, zoom: 1, past: [], future: [],
      heightBrush: { ...DEFAULT_HEIGHT_BRUSH, mode: 'contour', contourCm: 5_000 },
    });
    v().selectLine(null); v().selectContour(null); v().setDraftLine(null); v().setDragPoints(null); v().setSelectedGhost(null);
    useCrossScaleStore.getState().setRelated(null, [], [], null);
  });

  it('a road is one line, stored from its first point on', () => {
    click((p) => roadsTool.onPress(0, 0, s(), p), [{ x: 290, y: 40 }, { x: 315, y: 60 }, { x: 345, y: 50 }]);
    expect(lineToolKey('Enter', s())).toBe(true);
    expect(drawn()).toEqual([[{ x: 290, y: 40 }, { x: 315, y: 60 }, { x: 345, y: 50 }]]);
    expect(s().past).toHaveLength(1);
  });

  it('a point is picked and dragged from either side; the line stays on the map', () => {
    const id = s().addLine([{ x: 290, y: 40 }, { x: 345, y: 50 }], 'major-road')!;
    v().selectLine(id);
    expect(roadsTool.picks!(s(), { x: 25, y: 50 })).toBe(false);
    expect(roadsTool.picks!(s(), { x: 25 + P, y: 50 })).toBe(true);
    // The first point goes east over the seam: the whole line moves to start on the map
    roadsTool.onPress(0, 0, s(), { x: 290, y: 40 });
    roadsTool.onDrag(0, 0, s(), { x: 330, y: 44 });
    expect(v().dragPoints![0]).toEqual({ x: 330, y: 44 }); // previewed where the pointer is
    roadsTool.onRelease(s());
    expect(drawn()).toEqual([[{ x: 10, y: 44 }, { x: 25, y: 50 }]]);
    // So does one added from elsewhere
    s().addLine([{ x: -5, y: 10 }, { x: 5, y: 10 }], 'major-road');
    expect(drawn()[1]).toEqual([{ x: 315, y: 10 }, { x: 325, y: 10 }]);
  });

  it('a contour closes over the seam; one right round the world ends where it began', () => {
    const start = { x: 310, y: 40 };
    click((p) => contourPress(s(), p), [start, { x: 340, y: 50 }, { x: 330, y: 90 }, { x: 312, y: 41 }]);
    let [c] = readContours(s().mapData!);
    expect([c.closed, c.points]).toEqual([true, [start, { x: 340, y: 50 }, { x: 330, y: 90 }]]);
    expect(contourPicks(s(), { x: 20, y: 50 })).toBe(false);
    expect(contourPicks(s(), { x: 20 + P, y: 50 })).toBe(true);
    contourPress(s(), { x: 310, y: 40 });
    contourDrag({ x: 325, y: 40 });
    contourRelease(s());
    expect(readContours(s().mapData!)[0].points).toEqual([{ x: 5, y: 40 }, { x: 20, y: 50 }, { x: 10, y: 90 }]);

    s().deleteContour(c.id);
    v().selectContour(null);
    click((p) => contourPress(s(), p), [{ x: 10, y: 120 }, { x: 110, y: 130 }, { x: 220, y: 110 }, { x: 333, y: 122 }]);
    [c] = readContours(s().mapData!);
    expect(goesRound(square, c.points)).toBe(true); // so it can't be made a closed loop
    expect(goesRound(flat(square), c.points)).toBe(false);
    expect(goesRound(square, [{ x: 310, y: 40 }, { x: 340, y: 50 }])).toBe(false);
    expect([c.closed, c.points]).toEqual([false, [{ x: 10, y: 120 }, { x: 110, y: 130 }, { x: 220, y: 110 }, { x: 10 + P, y: 120 }]]);
  });

  it('on a map that does not wrap, points stay where they are', () => {
    useMapStore.setState({ mapData: withObjects(flat(square), []) });
    s().addLine([{ x: 330, y: 40 }, { x: 345, y: 50 }], 'major-road');
    expect(drawn()).toEqual([[{ x: 330, y: 40 }, { x: 345, y: 50 }]]);
    click((p) => contourPress(s(), p), [{ x: 10, y: 120 }, { x: 110, y: 130 }, { x: 220, y: 110 }, { x: 330, y: 120 }]);
    expect(v().draftLine).toHaveLength(4); // still drawing
  });

  it('a ceiling shape across it covers both sides', () => {
    const m = withObjects(square, [object({
      id: 1, type: 'ceiling', x: 300, y: 20, polygon: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }],
      properties: [{ name: 'headroom', type: 'float', value: 3 }],
    })]);
    const at = (x: number) => ceilingAt(m, 0, NO_CEILING_CONTEXT, readCeilings(m), null, x, 40)?.headroomCm ?? null;
    expect([at(310), at(10), at(30), at(290)]).toEqual([300, 300, null, null]);
  });
});

describe('lines between maps across the seam', () => {
  const grid = (mpu: number, lines: TmjObject[], properties: TmjMap['properties'] = []): MapSource => ({
    mpu,
    map: {
      ...withObjects({ ...square, width: 20, height: 20, tilewidth: 10, tileheight: 10, properties, layers: [] }, lines),
      metersPerUnit: mpu,
    },
  });
  // The region sits over the seam: world px -10 … 10, so region x = (world x + 10) * 10
  const nodes: WorldSetNode[] = [
    { mapName: 'world', parentMapName: null, parentAnchor: null, z: 0 },
    { mapName: 'region', parentMapName: 'world', parentAnchor: { col: 0, row: 5 }, z: 0 },
  ];
  const road = (id: number, pts: Pt[], o: Partial<TmjObject> = {}) => line(id, pts, { type: 'major-road', ...o });
  const worldLines = [
    road(1, [{ x: 185, y: 50 }, { x: 215, y: 50 }]), // over the seam, starting west of it
    road(2, [{ x: 5, y: 45 }, { x: 60, y: 45 }]), // from inside the region, east
    road(3, [{ x: 3, y: 55 }, { x: 203, y: 55 }]), // right round the world
    road(4, [{ x: 100, y: 50 }, { x: 120, y: 50 }]), // nowhere near
  ];
  const world = (wrap = true, lines = worldLines) => grid(1000, lines, wrap ? [wrapX] : []);
  const open = (name: string, sources: Record<string, MapSource>) => {
    const map = sources[name].map, rel = relatedMaps(name, nodes, (n) => sources[n]), turn = worldTurn(map, rel);
    return { map, rel, turn, ghosts: ghostLines(rel, mapExtent(map), turn) };
  };
  const xs = (o: TmjObject) => o.polyline!.map((p) => Math.round(p.x));

  it("the world's lines show on a child map from whichever side they come", () => {
    const { ghosts, turn, map } = open('region', { world: world(), region: grid(100, []) });
    expect(turn).toBeCloseTo(2000);
    const g = (id: number) => ghosts.find((x) => x.key === `world#${id}`)!;
    expect(g(1).copies.map(xs)).toEqual([[-50, 250]]);
    expect(g(2).copies.map(xs)).toEqual([[150, 700]]);
    expect(g(3).copies.map(xs)).toEqual([[-1870, 130], [130, 2130]]);
    expect(g(4).copies).toHaveLength(1);
    expect(g(1).placed).toBe(g(1).copies[0]);
    // Copying one takes every part of it inside the map
    const rect = mapExtent(map);
    expect(adoptPieces(g(1), rect).map((p) => p.points.map((q) => Math.round(q.x)))).toEqual([[0, 200]]);
    expect(adoptPieces(g(3), rect).map((p) => p.points.map((q) => Math.round(q.x)))).toEqual([[0, 130], [130, 200]]);
    expect(adoptPieces(g(4), rect)).toEqual([]);
    // Without the wrap, only where they are drawn
    const plain = open('region', { world: world(false), region: grid(100, []) });
    expect(plain.turn).toBe(0);
    expect(plain.ghosts.map((x) => x.copies.length)).toEqual([1, 1, 1, 1]);
    expect(xs(plain.ghosts[0].placed)).toEqual([1950, 2250]);
  });

  it('a ghost is picked on any of its turns', () => {
    const { rel, ghosts, map } = open('region', { world: world(), region: grid(100, []) });
    useMapStore.setState({ mapData: map, mapName: 'region', mapWorldSet: 'ws' });
    useViewStore.getState().setShowLines(true);
    useCrossScaleStore.getState().setRelated('ws/region', rel, ghosts, mapExtent(map));
    const at = (x: number, y: number) => ghostAt(useMapStore.getState(), { x, y }, 4);
    expect([at(100, 100), at(160, 50), at(60, 150), at(180, 150), at(100, 20)]).toEqual(['world#1', 'world#2', 'world#3', 'world#3', null]);
  });

  it("a child's copy hides the original inside the child on both sides of the seam, and fits it", () => {
    const refines = (id: number) => ({ properties: [{ name: REFINES_PROPERTY, type: 'string' as const, value: `world#${id}` }] });
    const region = grid(100, [
      road(8, [{ x: 0, y: 100 }, { x: 90, y: 120 }, { x: 200, y: 100 }], refines(1)),
      road(9, [{ x: 0, y: 150 }, { x: 200, y: 150 }], refines(3)),
    ]);
    const { map, rel, turn } = open('world', { world: world(), region });
    expect(turn).toBe(200);
    const index = refinedByIndex('world', map, rel);
    const hidden = (id: number, pts: Pt[]) => hiddenAreas(lineKey('world', id), index, 'world', mapExtent(map), rel, turn, pts)
      .map((r) => [Math.round(r.x0), Math.round(r.x1)]);
    expect(hidden(1, linePoints(worldLines[0]))).toEqual([[190, 210]]);
    expect(hidden(3, linePoints(worldLines[2]))).toEqual([[-10, 10], [190, 210]]);

    const status = (name: string, sources: Record<string, MapSource>) => {
      const o = open(name, sources);
      return checkRefinements(name, o.map, o.rel).map((c) => [c.original, c.result.status]);
    };
    const fits = [['world#1', 'ok'], ['world#3', 'ok']];
    expect(status('world', { world: world(), region })).toEqual(fits);
    expect(status('region', { world: world(), region })).toEqual(fits);
    // The original moves: noticed from both maps, though it's stored on the far side
    const moved = world(true, [road(1, [{ x: 185, y: 56 }, { x: 215, y: 56 }]), ...worldLines.slice(1)]);
    expect(status('world', { world: moved, region })[0]).toEqual(['world#1', 'moved']);
    expect(status('region', { world: moved, region })[0]).toEqual(['world#1', 'moved']);
  });

  it('areas that hide a line may overlap: each is cut out on its own', () => {
    const clips: number[][] = [];
    let rects: number[] = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (t, k) => {
        if (k === 'beginPath') return () => { rects = []; };
        if (k === 'rect') return (x: number) => { rects.push(x); };
        if (k === 'clip') return () => { clips.push(rects); };
        return t[k as string] ?? (() => undefined);
      },
      set: (t, k, val) => { t[k as string] = val; return true; },
    }) as unknown as CanvasRenderingContext2D;
    drawLine(ctx, worldLines[0], 1, BUILTIN_LINE_CLASSES[0], null, {
      exclude: [{ x0: 10, y0: 0, x1: 50, y1: 50 }, { x0: 20, y0: 0, x1: 40, y1: 50 }],
    });
    expect(clips.map((c) => c[1])).toEqual([10, 20]);
  });
});
