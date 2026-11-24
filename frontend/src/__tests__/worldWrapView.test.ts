import { describe, it, expect, beforeEach } from 'vitest';
import { mod, seamDelta, wrapPeriodPx, wrapPixelX, wrapView } from '../utils/worldWrap';
import type { HeightPatch } from '../utils/heightGrid';
import { heightAt, sampleGrid } from '../utils/heightGrid';
import { buildSurface, displayPatch, computeOverrides, placeChild, surfaceAt } from '../utils/worldSurface';
import type { SurfaceSource } from '../utils/worldSurface';
import { edgeFit } from '../utils/elevationFit';
import { detectRectOverlaps } from '../utils/worldSetUtils';
import { getWarnings } from '../utils/hierarchyPanelLogic';
import { cellAt, inspectAt } from '../utils/inspect';
import { bfsFloodFill, fillTool } from '../tools/fillTool';
import { roadsTool } from '../tools/lineTool';
import { pointTool } from '../tools/pointTool';
import { heightTool } from '../tools/heightTool';
import { waterTool } from '../tools/waterTool';
import { footprintAtPoint } from '../canvas/footprintOverlay';
import { renderTileMap } from '../canvas/tileRenderer';
import { renderHexMap } from '../canvas/hexRenderer';
import { hexCenter, hexLayout, hexMapPixelSize } from '../canvas/hexGeometry';
import { useMapStore } from '../store/mapStore';
import { useViewStore } from '../store/viewStore';
import { findWorldOrigin } from '../utils/worldCoords';
import { DEFAULT_HEIGHT_BRUSH } from '../utils/heightBrush';
import type { TmjMap, TmjObject } from '../types/tmj';
import type { WorldSetNode } from '../types/worldSet';

const base = { nextlayerid: 2, nextobjectid: 100, tilesets: [], properties: [{ name: 'wrapX', type: 'bool' as const, value: true }] };
const square = { ...base, orientation: 'orthogonal', width: 16, height: 9, tilewidth: 20, tileheight: 20, layers: [] } as TmjMap;
const hexFlat = {
  ...base, orientation: 'hexagonal', width: 16, height: 9, tilewidth: 40, tileheight: 34, hexsidelength: 20,
  staggeraxis: 'x', staggerindex: 'odd', layers: [],
} as TmjMap;
const hexPointy = { ...hexFlat, width: 13, tilewidth: 34, tileheight: 40, staggeraxis: 'y', staggerindex: 'even' } as TmjMap;
const MAPS: [string, TmjMap][] = [['square', square], ['flat-topped hex', hexFlat], ['pointy-topped hex', hexPointy]];
const flat = (map: TmjMap): TmjMap => ({ ...map, properties: [] });

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function ground(map: TmjMap, seed = 1): HeightPatch {
  const { cols, rows } = sampleGrid(map);
  const r = rng(seed);
  const cm = Int32Array.from({ length: cols * rows }, () => Math.round(r() * 5_000));
  if (map.orientation !== 'hexagonal') for (let i = cols - 1; i < cm.length; i += cols) cm[i] = cm[i - cols + 1];
  return { cols, rows, cm, mask: new Uint8Array(cols * rows) };
}

/** The same ground turned `k` columns round the world. */
function turned(map: TmjMap, p: HeightPatch, k: number): HeightPatch {
  return { ...p, cm: p.cm.map((_, i) => p.cm[i - (i % p.cols) + mod((i % p.cols) - k, map.width)]) };
}

const object = (o: Partial<TmjObject> & { id: number }): TmjObject => ({ name: '', type: '', x: 0, y: 0, width: 0, height: 0, visible: true, ...o });
const withObjects = (map: TmjMap, objects: TmjObject[]): TmjMap => ({
  ...map,
  layers: [{ type: 'objectgroup', id: 1, name: 'o', visible: true, opacity: 1, offsetx: 0, offsety: 0, color: '#fff', objects }],
});

describe.each(MAPS)('the view of a wrapped %s map', (_name, map) => {
  it('shows one turn, centred, with every place once', () => {
    const r = rng(9);
    const full = map.orientation === 'hexagonal' ? hexMapPixelSize(hexLayout(map), map.width, map.height).width : map.width * map.tilewidth;
    for (let n = 0; n < 300; n++) {
      const zoom = 0.1 + r() * 5, pan = (r() - 0.5) * 20_000, canvas = 200 + Math.floor(r() * 1_500);
      const v = wrapView(map, zoom, pan, canvas)!;
      expect(v.period).toBeCloseTo(wrapPeriodPx(map) * zoom);
      expect(v.x1 - v.x0).toBeCloseTo(Math.min(canvas, v.period));
      expect((v.x0 + v.x1) / 2).toBeCloseTo(canvas / 2);
      // Every shown x is on the ground of exactly one turn (its own width of one period)
      for (let k = 0; k < 20; k++) {
        const x = v.x0 + ((k + 0.5) / 20) * (v.x1 - v.x0);
        expect(v.ground.filter((t) => x >= pan + t * v.period && x < pan + (t + 1) * v.period)).toHaveLength(1);
      }
      // Every turn drawn shows, and marks reach one further each side
      for (const t of v.ground) {
        expect(pan + t * v.period).toBeLessThan(v.x1);
        expect(pan + t * v.period + full * zoom).toBeGreaterThan(v.x0);
      }
      expect(v.marks).toEqual([v.ground[0] - 1, ...v.ground, v.ground[v.ground.length - 1] + 1]);
      expect(v.ground.length).toBeLessThanOrEqual(Math.ceil((v.x1 - v.x0) / v.period) + 2);
    }
  });

  it('positions come back to the map, and distances go the short way', () => {
    const P = wrapPeriodPx(map);
    expect(wrapPixelX(map, -5)).toBe(P - 5);
    expect(wrapPixelX(map, 3 * P + 7)).toBeCloseTo(7);
    expect(seamDelta(map, P - 4, 6)).toBe(10);
    expect(seamDelta(map, 6, P - 4)).toBe(-10);
    expect(wrapPixelX(flat(map), -5)).toBe(-5);
    expect(seamDelta(flat(map), P - 4, 6)).toBe(10 - P);
    expect(wrapView(flat(map), 1, 0, 500)).toBeNull();
  });

  it('cells and heights carry on round the world', () => {
    const P = wrapPeriodPx(map), p = ground(map), l = hexLayout(map);
    for (const [col, row] of [[0, 4], [map.width - 1, 3], [5, 5]]) {
      const c = map.orientation === 'hexagonal' ? hexCenter(l, col, row) : { x: (col + 0.5) * map.tilewidth, y: (row + 0.5) * map.tileheight };
      for (const t of [-2, -1, 0, 1, 3]) {
        expect(cellAt(map, c.x + t * P, c.y)).toEqual({ col, row });
        expect(heightAt(map, p, c.x + t * P + 3, c.y)).toBeCloseTo(heightAt(map, p, wrapPixelX(map, c.x + 3), c.y), 6);
      }
    }
    expect(cellAt(flat(map), -P + 10, 50)).toBeNull();
  });

  it('the ground is continuous over the seam', () => {
    const P = wrapPeriodPx(map), p = ground(map);
    const bottom = map.orientation === 'hexagonal' ? hexMapPixelSize(hexLayout(map), map.width, map.height).height : map.height * map.tileheight;
    const r = rng(2);
    for (let n = 0; n < 60; n++) {
      const y = bottom * (0.15 + 0.7 * r());
      for (const x of [P, 0.4 * map.tilewidth, P - 0.4 * map.tilewidth]) {
        expect(Math.abs(heightAt(map, p, x - 0.005, y) - heightAt(map, p, x + 0.005, y))).toBeLessThan(20);
      }
    }
  });
});

describe('child maps across the seam', () => {
  const child = { ...base, properties: [], orientation: 'orthogonal', width: 20, height: 16, tilewidth: 32, tileheight: 32, layers: [] } as TmjMap;
  const childPatch = ground(child, 5);
  /** A 4 x 3.2 cell child, its anchor at `col`. */
  const nodes = (col: number): WorldSetNode[] => [
    { mapName: 'w', parentMapName: null, parentAnchor: null, z: 0 },
    { mapName: 'c', parentMapName: 'w', parentAnchor: { col, row: 4 }, parentOffset: { x: 0.3, y: 0.1 }, z: 0 },
  ];
  const surface = (map: TmjMap, patch: HeightPatch, col: number) => buildSurface('w', { map, patch, mpu: 100 }, nodes(col),
    (n): SurfaceSource | undefined => (n === 'c' ? { map: child, patch: childPatch, mpu: 20 } : undefined));
  const K = 6;

  it.each(MAPS)('shape the assembled ground on both sides of it (%s)', (_n, map) => {
    const p = ground(map);
    // On the seam, and the same world turned so the child is well inside
    const a = surface(map, p, map.width - 1), b = surface(map, turned(map, p, K), K - 1);
    const back = turned(map, b.effective, -K);
    for (let i = 0; i < back.cm.length; i++) expect(Math.abs(back.cm[i] - a.effective.cm[i])).toBeLessThanOrEqual(1);
    const touched = new Set<number>();
    for (let i = 0; i < p.cm.length; i++) if (a.effective.cm[i] !== p.cm[i]) touched.add(i % p.cols);
    expect(touched.has(0) && touched.has(map.width - 1)).toBe(true);

    const r = rng(4), P = wrapPeriodPx(map);
    const size = map.orientation === 'hexagonal' ? hexMapPixelSize(hexLayout(map), map.width, map.height).height : 180;
    let inChild = 0;
    for (let n = 0; n < 200; n++) {
      const x = r() * P, y = r() * size;
      const here = surfaceAt(map, p, a.children, x, y, 'w');
      const there = surfaceAt(map, turned(map, p, K), b.children, mod(x + (K * P) / map.width, P), y, 'w');
      expect(here.source).toBe(there.source);
      expect(here.cm).toBeCloseTo(there.cm, 3);
      if (here.source === 'c') inChild++;
    }
    expect(inChild).toBeGreaterThan(0);

    // How its edges fit its parent
    const place = (col: number) => placeChild(child.width, child.height, 20, 100, { col, row: 4 }, { x: 0.3, y: 0.1 });
    const f = edgeFit(child, childPatch, place(map.width - 1), map, p)!;
    const g = edgeFit(child, childPatch, place(K - 1), map, turned(map, p, K))!;
    expect(f.meanDiffCm).toBeCloseTo(g.meanDiffCm, 3);
    expect(f.meanAbsDiffCm).toBeCloseTo(g.meanAbsDiffCm, 3);
  });

  it('without a wrap, only the side on the map', () => {
    const p = ground(square);
    const shown = displayPatch(p, computeOverrides(flat(square), p.cols, p.rows, surface(flat(square), p, 15).children));
    for (let i = 0; i < p.cm.length; i++) if (i % p.cols < 5) expect(shown.cm[i]).toBe(p.cm[i]);
  });

  it('overlap siblings on the other side', () => {
    const rect = (left: number) => ({ left, top: 2, width: 3, height: 2 });
    const pair = [{ mapName: 'a', z: 0, rect: rect(14.5) }, { mapName: 'b', z: 0, rect: rect(0) }];
    expect(detectRectOverlaps(pair)).toEqual([]);
    expect(detectRectOverlaps(pair, 16)).toEqual([['a', 'b']]);
    expect(detectRectOverlaps([pair[0], { mapName: 'b', z: 0, rect: rect(5) }], 16)).toEqual([]);

    const warnings = (world: TmjMap) => getWarnings(nodes(15)[1], {
      knownMapNames: new Set(['w', 'c', 'd']), allNodes: [...nodes(15), { ...nodes(1)[1], mapName: 'd' }], defaultUnits: 'metric',
      mapDataCache: { w: { ...world, metersPerUnit: 100 }, c: { ...child, metersPerUnit: 20 }, d: { ...child, metersPerUnit: 20 } },
    } as unknown as Parameters<typeof getWarnings>[1]).join();
    expect(warnings(square)).toMatch(/overlap/i);
    expect(warnings(flat(square))).not.toMatch(/overlap/i);
  });
});

describe('tools by the seam', () => {
  const s = () => useMapStore.getState();
  const P = 320;
  beforeEach(() => {
    useViewStore.setState({
      draftLine: null, dragPoints: null, selectedLineId: null, selectedWaterId: null, selectedSpotId: null,
      selectedObjectId: null, originDrag: null, waterMode: 'lakes', showLines: true,
    });
    useMapStore.setState({
      zoom: 1, pan: { x: 0, y: 0 }, past: [], future: [], heights: ground(square), heightBrush: { ...DEFAULT_HEIGHT_BRUSH },
      activeLayerIndex: 0, mapName: 'w', mapWorldSet: '', pendingHeights: new Map(),
    });
  });
  const obj = (id: number) => s().mapData!.layers.flatMap((l) => (l.type === 'objectgroup' ? l.objects : [])).find((o) => o.id === id)!;
  const height = [{ name: 'height', type: 'float' as const, value: 5 }];

  it('fill runs across it', () => {
    const data = [1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 1]; // one row
    const cols = (wrap?: boolean) => bfsFloodFill(data, 12, 1, 0, 0, 1, 9, wrap).map(([c]) => c).sort((a, b) => a - b);
    expect(cols()).toEqual([0, 1]);
    expect(cols(true)).toEqual([0, 1, 9, 10, 11]);

    const tiles = {
      type: 'tilelayer', id: 1, name: 'g', visible: true, opacity: 1, offsetx: 0, offsety: 0, width: 16, height: 9,
      data: Array.from({ length: 144 }, (_, i) => (i % 16 === 5 || i % 16 === 10 ? 3 : 1)),
    };
    useMapStore.setState({ mapData: { ...square, layers: [tiles] } as unknown as TmjMap, activeGid: 7 });
    fillTool.onPress(1, 4, s());
    const row = (s().mapData!.layers[0] as unknown as typeof tiles).data.slice(0, 16);
    expect(row).toEqual([7, 7, 7, 7, 7, 3, 1, 1, 1, 1, 3, 7, 7, 7, 7, 7]);
  });

  it('Inspect finds what is by the other edge', () => {
    const map = withObjects(square, [
      object({ id: 1, name: 'cape', x: 2, y: 100, point: true }),
      object({ id: 2, name: 'isle', x: 310, y: 60, width: 30, height: 20 }),
    ]);
    expect(inspectAt(map, P - 3, 100, 8)!.objects.map((o) => o.name)).toEqual(['cape']);
    expect(inspectAt(map, P - 3, 100, 8)!.col).toBe(15);
    expect(inspectAt(map, 5, 70, 8)!.objects.map((o) => o.name)).toEqual(['isle']);
    expect(inspectAt(map, P + 2, 100, 8)).toMatchObject({ col: 0, x: 2 });
    expect(inspectAt(flat(map), P - 3, 100, 8)!.objects).toEqual([]);
  });

  it('each tool says when a press would take hold of something', () => {
    useMapStore.setState({
      mapData: withObjects(square, [
        object({ id: 1, name: 'cape', x: 2, y: 100, point: true }),
        object({ id: 2, type: 'major-road', x: 300, y: 40, polyline: [{ x: 0, y: 0 }, { x: 60, y: 0 }] }), // runs past the east edge
        object({ id: 3, type: 'spot height', x: 3, y: 140, point: true, properties: height }),
        object({ id: 4, type: 'water', x: 318, y: 20, point: true, properties: height }),
      ]),
    });
    expect(pointTool.picks!(s(), { x: P - 4, y: 100 })).toBe(false);
    expect(pointTool.picks!(s(), { x: -4, y: 100 })).toBe(true); // one turn to the west
    expect(roadsTool.picks!(s(), { x: 30, y: 40 })).toBe(false);
    expect(roadsTool.picks!(s(), { x: 30 + P, y: 40 })).toBe(true); // where it shows past the seam
    expect(waterTool.picks!(s(), { x: 2, y: 20 })).toBe(false);
    expect(waterTool.picks!(s(), { x: 2 + P, y: 20 })).toBe(true);
    useMapStore.setState({ heightBrush: { ...DEFAULT_HEIGHT_BRUSH, mode: 'spot' } });
    expect(heightTool.picks!(s(), { x: P - 2, y: 140 })).toBe(false);
    expect(heightTool.picks!(s(), { x: -2, y: 140 })).toBe(true);
    useMapStore.setState({ heightBrush: { ...DEFAULT_HEIGHT_BRUSH, mode: 'raise' } });
    expect(heightTool.picks!(s(), { x: -2, y: 140 })).toBe(false); // painting takes hold of nothing
  });

  it('a lake or the world origin dragged over it ends up on the map', () => {
    useMapStore.setState({
      mapData: withObjects(square, [
        object({ id: 4, type: 'water', x: 318, y: 20, point: true, properties: height }),
        object({ id: 5, type: 'world-origin', x: 4, y: 90, point: true }),
      ]),
    });
    waterTool.onPress(0, 0, s(), { x: 318, y: 20 });
    waterTool.onDrag(0, 0, s(), { x: 335, y: 44 });
    expect(useViewStore.getState().dragPoints).toEqual([{ x: 335, y: 44 }]); // previewed where the pointer is
    waterTool.onRelease(s());
    expect([obj(4).x, obj(4).y]).toEqual([15, 44]);

    pointTool.onPress(0, 0, s(), { x: 4, y: 90 });
    pointTool.onDrag(0, 0, s(), { x: -10, y: 80 });
    pointTool.onRelease(s());
    expect(findWorldOrigin(s().mapData!)!.object).toMatchObject({ x: P - 10, y: 80 });
  });

  it('a brush stroke over it touches only the ground beside it', () => {
    useMapStore.setState({ mapData: square, heightBrush: { ...DEFAULT_HEIGHT_BRUSH, mode: 'raise', radius: 1.5, strengthCm: 900 } });
    const before = s().heights!.cm.slice();
    heightTool.onPress(0, 0, s(), { x: P - 25, y: 90 });
    for (let x = P - 20; x <= P + 25; x += 5) heightTool.onDrag(0, 0, s(), { x, y: 90 });
    heightTool.onRelease(s());
    const cols = new Set<number>();
    s().heights!.cm.forEach((v, i) => { if (v !== before[i]) cols.add(i % 17); });
    expect([...cols].sort((a, b) => a - b)).toEqual([0, 1, 2, 14, 15, 16]);
    expect(s().past).toHaveLength(1);
    s().undo();
    expect(s().heights!.cm).toEqual(before);
  });

  it('a footprint drawn on two turns is one hit', () => {
    const r = { mapName: 'c', screenX: 0, screenY: 0, screenW: 50, screenH: 50, isPlaceholder: false };
    expect(footprintAtPoint(10, 10, [r, { ...r, screenX: -20 }])).toEqual(['c']);
  });
});

describe('drawing part of a map', () => {
  /** A canvas context that records what is called. */
  const recorder = () => {
    const calls: string[] = [];
    const ctx = new Proxy({ canvas: { width: 400, height: 300 } } as Record<string, unknown>, {
      get: (t, k: string) => {
        if (k in t) return t[k];
        if (k === 'measureText') return () => ({ width: 5 });
        return (...a: unknown[]) => { calls.push(k + (k === 'fillRect' ? a.join() : '')); };
      },
      set: (t, k: string, v) => { t[k] = v; return true; },
    });
    return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
  };
  const layered = (map: TmjMap): TmjMap => ({
    ...map,
    tilesets: [{
      firstgid: 1, name: 't', tilewidth: 20, tileheight: 20, tilecount: 1, columns: 1, image: '', imagewidth: 20, imageheight: 20, margin: 0, spacing: 0, tiles: [],
    }] as unknown as TmjMap['tilesets'],
    layers: [
      {
        type: 'tilelayer', id: 1, name: 'g', visible: true, opacity: 1, offsetx: 0, offsety: 0,
        width: map.width, height: map.height, data: new Array(map.width * map.height).fill(1),
      },
      { type: 'objectgroup', id: 2, name: 'o', visible: true, opacity: 1, offsetx: 0, offsety: 0, color: '#fff', objects: [object({ id: 1, x: 30, y: 30, point: true, name: 'p' })] },
    ] as unknown as TmjMap['layers'],
  });

  it.each([['square', square, renderTileMap], ['hex', hexFlat, renderHexMap]] as const)('ground and objects make up the whole, %s', (_n, map, render) => {
    const draw = (part?: 'ground' | 'objects', pan = { x: 0, y: 0 }) => {
      const r = recorder();
      let hooks = 0;
      render(r.ctx, layered(map), { view: { zoom: 1, pan }, showGrid: true, onImageLoad: () => undefined, afterTileLayers: () => { hooks++; }, part });
      return {
        calls: r.calls, hooks,
        points: r.calls.filter((c) => c === 'arc').length,
        clears: r.calls.filter((c) => c === 'fillRect0,0,400,300').length,
      };
    };
    const whole = draw(), under = draw('ground'), over = draw('objects');
    expect([whole.hooks, under.hooks, over.hooks]).toEqual([1, 1, 1]);
    expect([whole.points, under.points, over.points]).toEqual([1, 0, 1]);
    expect([whole.clears, under.clears, over.clears]).toEqual([1, 0, 0]);
    // Off to one side, no tiles are drawn
    expect(draw('ground', { x: 5_000, y: 0 }).calls.filter((c) => c === 'fill' || c.startsWith('fillRect'))).toEqual([]);
  });

  it('draws every tile in view', () => {
    const r = recorder();
    renderTileMap(r.ctx, layered(square), { view: { zoom: 2, pan: { x: -110, y: -50 } }, showGrid: false, onImageLoad: () => undefined, part: 'ground' });
    const tiles = r.calls.filter((c) => c.startsWith('fillRect'));
    // 400 x 300 px at 40 px a tile, panned 2.75 columns and 1.25 rows: columns 2-12, rows 1-8
    expect(tiles).toHaveLength(11 * 8);
    expect(tiles[0]).toBe('fillRect80,40,40,40');
  });
});
