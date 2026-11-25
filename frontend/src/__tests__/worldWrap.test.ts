import { describe, it, expect, beforeEach } from 'vitest';
import {
  blendSeam, canonicalSample, hasSeamTwin, joinSeam, mirrorSeam, mod, seamStepCm, withWrap, wrapPeriodPx, wrapProblem, wrapsX,
} from '../utils/worldWrap';
import type { HeightPatch } from '../utils/heightGrid';
import { hexNeighbours, sampleGrid } from '../utils/heightGrid';
import { sampleNeighbours, smoothSamples, terrainSamples } from '../utils/terrainHeights';
import { applyDab, DEFAULT_HEIGHT_BRUSH } from '../utils/heightBrush';
import type { HeightBrush } from '../utils/heightBrush';
import { computeWater, NO_WATER, SEA_BODY } from '../utils/water';
import type { WaterBody } from '../utils/water';
import { computeFlow } from '../utils/flow';
import { streamPicker } from '../utils/streamTrace';
import { fitHeights } from '../utils/surfaceFit';
import { generateHeights, worldNoise } from '../utils/heightGeneration';
import { BUILTIN_LINE_CLASSES } from '../data/lineClasses';
import { hexCenter, hexLayout } from '../canvas/hexGeometry';
import { useMapStore } from '../store/mapStore';
import type { TmjMap } from '../types/tmj';

const base = { nextlayerid: 2, nextobjectid: 1, tilesets: [], properties: [{ name: 'wrapX', type: 'bool' as const, value: true }] };
const square = { ...base, orientation: 'orthogonal', width: 16, height: 9, tilewidth: 20, tileheight: 20, layers: [] } as TmjMap;
const hexFlat = {
  ...base, orientation: 'hexagonal', width: 16, height: 9, tilewidth: 40, tileheight: 34, hexsidelength: 20,
  staggeraxis: 'x', staggerindex: 'odd', layers: [],
} as TmjMap;
const hexPointy = { ...hexFlat, width: 13, tilewidth: 34, tileheight: 40, staggeraxis: 'y', staggerindex: 'even' } as TmjMap;
const MAPS: [string, TmjMap][] = [['square', square], ['flat-topped hex', hexFlat], ['pointy-topped hex', hexPointy]];

/** Repeatable pseudo-random numbers in [0, 1). */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Bumpy random heights that respect the wrap. */
function ground(map: TmjMap, seed = 1, amp = 5_000): HeightPatch {
  const { cols, rows } = sampleGrid(map);
  const r = rng(seed);
  const cm = Int32Array.from({ length: cols * rows }, () => Math.round((r() - 0.4) * amp));
  mirrorSeam(map, cm, cols);
  return { cols, rows, cm, mask: new Uint8Array(cols * rows) };
}

/** Turn per-sample values `k` columns round the world (column c moves to c + k). */
function turn<T extends { [i: number]: number; length: number; slice(): T }>(map: TmjMap, values: T, cols: number, k: number): T {
  const out = values.slice();
  const W = map.width;
  for (let i = 0; i < values.length; i++) {
    const col = i % cols;
    out[i] = values[i - col + mod(col - k, W)];
  }
  return out;
}
const turnPatch = (map: TmjMap, p: HeightPatch, k: number): HeightPatch =>
  ({ ...p, cm: turn(map, p.cm, p.cols, k), mask: turn(map, p.mask, p.cols, k) });
/** Turn a pixel x, kept on the map. */
const turnX = (map: TmjMap, x: number, k: number) => mod(x + (k * wrapPeriodPx(map)) / map.width, wrapPeriodPx(map));
/** Half-way round, by an even number of columns (flat-topped hexes shift every other one). */
const K = 6;

describe('which maps wrap', () => {
  it('needs the property, and a map that can', () => {
    expect(wrapsX(square)).toBe(true);
    expect(wrapsX({ ...square, properties: withWrap(square.properties, false) })).toBe(false);
    expect(wrapsX({ ...square, properties: undefined })).toBe(false);
    expect(wrapsX({ ...square, width: 2 })).toBe(false);
    expect(wrapProblem({ ...hexFlat, width: 15 })).toMatch(/even number/);
    expect(wrapsX({ ...hexFlat, width: 15 })).toBe(false);
    expect(wrapsX(hexPointy)).toBe(true); // pointy-topped: any number of columns
    expect(withWrap([{ name: 'sea', type: 'bool', value: false }], true)).toHaveLength(2);
  });

  it('only square maps have a twin column, and one turn is a whole number of columns', () => {
    expect(MAPS.map(([, m]) => hasSeamTwin(m))).toEqual([true, false, false]);
    expect(wrapPeriodPx(square)).toBe(320);
    for (const m of [hexFlat, hexPointy]) {
      const l = hexLayout(m);
      const a = hexCenter(l, 0, 3), b = hexCenter(l, m.width, 3);
      expect(b.x - a.x).toBe(wrapPeriodPx(m));
      expect(b.y).toBe(a.y);
    }
    expect(canonicalSample(square, 17)(16)).toBe(0);
    expect(canonicalSample(square, 17)(17 + 16)).toBe(17);
    expect(canonicalSample(hexFlat, 16)(15)).toBe(15);
  });
});

describe('joining the seam', () => {
  const patch = (values: number[][], mask?: number[][]): HeightPatch => ({
    cols: values[0].length, rows: values.length, cm: Int32Array.from(values.flat()),
    mask: Uint8Array.from((mask ?? values.map((r) => r.map(() => 0))).flat()),
  });

  it('meets at the average and eases out over four cells', () => {
    const p = patch([[0, 0, 0, 0, 0, 0, 0, 1000, 1000, 1000, 1000, 1000]]);
    expect(seamStepCm(p.cm, p.cols)).toBe(1000);
    const out = blendSeam(p);
    expect(out.cm[0]).toBe(500);
    expect(out.cm[11]).toBe(500);
    expect([...out.cm.slice(1, 4)]).toEqual([422, 250, 78]); // smoothstep of 3/4, 1/2, 1/4 of the way
    expect(out.cm[4]).toBe(0);
    expect([...out.cm.slice(8, 11)]).toEqual([922, 750, 578]);
    expect(p.cm[0]).toBe(0); // the input is left alone
  });

  it('keeps hand-set heights: the seam moves to a hand-set side', () => {
    const out = blendSeam(patch([[100, 100, 100, 100, 100, 100, 900, 900, 900, 900]], [[1, 0, 1, 0, 0, 0, 0, 0, 0, 0]]));
    expect(out.cm[0]).toBe(100);
    expect(out.cm[9]).toBe(100);
    expect(out.cm[2]).toBe(100);
    expect(out.mask[9]).toBe(1);
  });

  it('joinSeam averages what an import left different', () => {
    const cm = Int32Array.from({ length: 17 * 2 }, (_, i) => (i === 16 ? 100 : 0));
    const mask = new Uint8Array(34);
    mask[17 + 16] = 1;
    joinSeam(square, cm, mask, 17);
    expect([cm[0], cm[16]]).toEqual([50, 50]);
    expect([mask[17], mask[33]]).toEqual([1, 1]);
  });
});

describe.each(MAPS)('on a wrapped %s map no column is special', (_name, map) => {
  const { cols, rows } = sampleGrid(map);

  it('every sample has its full set of neighbours across the seam', () => {
    const near = sampleNeighbours(map, cols, rows);
    const mid = 4 * cols;
    const full = near(mid + 6).length;
    for (let c = 0; c < cols; c++) {
      const ns = near(mid + c);
      expect(ns).toHaveLength(full);
      for (const j of ns) {
        expect(j % cols).toBeLessThan(map.width); // canonical
        expect(near(j)).toContain(mid + mod(c, map.width)); // and mutual
      }
    }
    if (map.orientation === 'hexagonal') {
      for (const n of hexNeighbours(map, 0, 4)) expect(near(mid)).toContain(n.row * cols + n.col);
    }
  });

  it('smoothing', () => {
    const p = ground(map), free = new Uint8Array(p.cm.length).fill(1);
    const a = p.cm.slice(), b = turn(map, p.cm, cols, K);
    smoothSamples(map, cols, rows, a, free);
    smoothSamples(map, cols, rows, b, free);
    expect(turn(map, b, cols, -K)).toEqual(a);
  });

  it('terrain', () => {
    const r = rng(3);
    const data = Array.from({ length: map.width * map.height }, () => (r() < 0.3 ? 0 : r() < 0.5 ? 1 : 2));
    const tiles = [5, 40].map((base, id) => ({ id, properties: [{ name: 'heightBase', type: 'float' as const, value: base }] }));
    const make = (d: number[]): TmjMap => ({
      ...map,
      tilesets: [{ firstgid: 1, name: 't', tilewidth: 20, tileheight: 20, tilecount: 2, columns: 2, image: '', imagewidth: 40, imageheight: 20, margin: 0, spacing: 0, tiles }] as unknown as TmjMap['tilesets'],
      layers: [{ type: 'tilelayer', id: 1, name: 'g', visible: true, opacity: 1, offsetx: 0, offsety: 0, width: map.width, height: map.height, data: d }] as unknown as TmjMap['layers'],
    });
    const turned = data.map((_, i) => data[i - (i % map.width) + mod((i % map.width) - K, map.width)]);
    const a = terrainSamples(make(data), cols, rows, (t) => t.baseCm);
    const b = terrainSamples(make(turned), cols, rows, (t) => t.baseCm);
    expect(turn(map, b.has, cols, -K)).toEqual(a.has);
    expect(turn(map, b.values, cols, -K)).toEqual(a.values);
    expect(a.has.some((h) => h === 1)).toBe(true);
  });

  it.each(['raise', 'smooth', 'set', 'release'] as const)('the %s brush, right on the seam', (mode) => {
    const brush: HeightBrush = { ...DEFAULT_HEIGHT_BRUSH, mode, radius: 3, strengthCm: 700, targetCm: 1234 };
    for (const x of [3, wrapPeriodPx(map) - 3]) {
      const y = 5 * map.tileheight * (map.orientation === 'hexagonal' ? 0.8 : 1);
      const a = ground(map, 5), b = turnPatch(map, a, K);
      a.mask.fill(1); b.mask.fill(1);
      const undo = new Set<number>();
      applyDab(map, a, x, y, brush, (i) => undo.add(i));
      applyDab(map, b, turnX(map, x, K), y, brush, () => undefined);
      const back = turnPatch(map, b, -K);
      expect(back.cm).toEqual(a.cm);
      expect(back.mask).toEqual(a.mask);
      // Undo has both sides of the seam, the twin column included
      if (mode === 'raise') {
        const before = ground(map, 5);
        for (let i = 0; i < a.cm.length; i++) expect(undo.has(i)).toBe(a.cm[i] !== before.cm[i]);
      }
    }
  });

  it('the sea and lakes', () => {
    const p = ground(map, 7);
    const row = 4, x0 = map.orientation === 'hexagonal' ? hexCenter(hexLayout(map), 0, row).x : 0;
    const y = map.orientation === 'hexagonal' ? hexCenter(hexLayout(map), 0, row).y : row * map.tileheight;
    for (let c = 0; c < map.width; c++) p.cm[row * cols + c] = Math.abs(mod(c + 3, map.width) - 3) < 3 ? -900 : 900; // a basin over the seam
    mirrorSeam(map, p.cm, cols);
    const lake = (x: number): WaterBody[] => [{ id: 1, name: 'L', x, y, cm: -100 } as WaterBody];
    const a = computeWater(map, p, lake(x0), true);
    const t = turnPatch(map, p, K);
    const b = computeWater(map, t, lake(turnX(map, x0, K)), true);
    expect(turn(map, b.surface, cols, -K)).toEqual(a.surface);
    expect(turn(map, b.body, cols, -K)).toEqual(a.body);
    expect(b.fills).toEqual(a.fills);
    expect(b.seaSamples).toBe(a.seaSamples);
    expect(a.surface[row * cols + map.width - 1]).not.toBe(NO_WATER); // the water crossed the seam
  });

  it('flow', () => {
    const p = ground(map, 11), t = turnPatch(map, p, K);
    const a = computeFlow(map, cols, rows, p.cm, null), b = computeFlow(map, cols, rows, t.cm, null);
    expect(turn(map, b.accumulation, cols, -K)).toEqual(a.accumulation);
    expect(turn(map, b.hollowCm, cols, -K)).toEqual(a.hollowCm);
    const back = turn(map, b.receiver, cols, -K);
    for (let i = 0; i < back.length; i++) {
      const j = back[i];
      expect(j < 0 ? -1 : j - (j % cols) + mod((j % cols) - K, map.width)).toBe(a.receiver[i]);
    }
    // All the land drains out at the top and bottom
    let out = 0;
    for (let i = 0; i < a.receiver.length; i++) if (a.receiver[i] < 0 && i % cols < map.width) out += a.accumulation[i];
    expect(out).toBe(map.width * rows);
    expect(a.receiver.some((j, i) => j >= 0 && Math.abs((j % cols) - (i % cols)) > map.width / 2)).toBe(true);
  });

  it('fitting to spots and contours near the seam', () => {
    const period = wrapPeriodPx(map), y = (rows / 2) * map.tileheight * 0.8;
    const known = [
      { x: 2, y, cm: 4_000, reachCells: 4 },
      { x: period - 30, y: y + 25, cm: -1_500, reachCells: 3 },
      { x: period / 2, y, cm: 2_500, reachCells: 3 },
    ];
    const p = { ...ground(map, 13, 400) };
    p.mask[4 * cols + 1] = 1;
    const a = fitHeights(map, p, known);
    const b = fitHeights(map, turnPatch(map, p, K), known.map((k) => ({ ...k, x: turnX(map, k.x, K) })));
    expect(a.maxMissCm).toBeLessThan(3);
    expect(b.maxMissCm).toBeLessThan(3);
    const back = turn(map, b.cm, cols, -K);
    for (let i = 0; i < back.length; i++) expect(Math.abs(back[i] - a.cm[i])).toBeLessThanOrEqual(5);
    expect(a.cm[4 * cols + 1]).toBe(p.cm[4 * cols + 1]); // hand-set
    if (hasSeamTwin(map)) expect(seamStepCm(a.cm, cols)).toBe(0);
    // It pulled the ground on the far side of the seam too
    expect(a.cm.some((v, i) => i % cols === map.width - 1 && v !== p.cm[i])).toBe(true);
  });
});

describe('generated detail', () => {
  const settings = { seed: 42, featureSizeM: 30_000, roughness: 0.6 };
  const C = 400_000;

  it('repeats once per turn, whether or not the wavelength divides it', () => {
    for (const circumference of [C, 480_000]) {
      for (let k = 0; k < 40; k++) {
        const x = k * 9_973.7, y = k * 4_211.3;
        expect(worldNoise(x + circumference, y, settings, 500, circumference)).toBeCloseTo(worldNoise(x, y, settings, 500, circumference), 6);
      }
      // and is continuous there
      const before = worldNoise(circumference - 0.01, 777, settings, 500, circumference);
      expect(worldNoise(0.01, 777, settings, 500, circumference)).toBeCloseTo(before, 3);
    }
  });

  it('without a wrap nothing changes; with one that divides evenly, only the last waves do', () => {
    const even = { ...settings, featureSizeM: 20_000 };
    // Each octave starts part-way through a wave, so its last two can differ
    for (let x = 0; x < C - even.featureSizeM * 2.01; x += 7_919) {
      expect(worldNoise(x, 1_000, even, 500, C)).toBeCloseTo(worldNoise(x, 1_000, even, 500), 9);
    }
  });

  it('meets itself on the map', () => {
    const relief = { settings, mpu: 25_000, origin: { x: 0, y: 0 }, strength: 1, fallbackReliefCm: 10_000, circumferenceM: 16 * 25_000 };
    const flat = (m: TmjMap) => ({ ...ground(m), cm: new Int32Array(ground(m).cm.length) });
    const out = generateHeights(square, flat(square), { ...relief, settings: { ...settings, featureSizeM: 90_000 } }).cm;
    expect(seamStepCm(out, 17)).toBe(0);
    expect(new Set(out).size).toBeGreaterThan(20);
  });
});

describe('a traced stream', () => {
  it('runs on across the seam', () => {
    // A valley running west over the seam, down to a pit just past it that drains south
    const { cols, rows } = sampleGrid(square);
    const cm = new Int32Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const col = mod(c, 16);
        const along = mod(col - 13, 16); // 0 at column 13, rising to the east over the seam
        cm[r * cols + c] = along <= 8 ? 1_000 + along * 100 + Math.abs(r - 4) * 400 : 9_000;
      }
    }
    for (let r = 4; r < rows; r++) cm[r * cols + 13] = 900 - r * 50;
    const flow = computeFlow(square, cols, rows, cm, null);
    const r = streamPicker(square, cols, rows, flow, null, 4, [], BUILTIN_LINE_CLASSES, null).at(2 * 20, 4 * 20, 5)!;
    expect(r.end).toBe('edge');
    // From its source on the map, west over the seam and down the valley past it, with no jump
    expect(r.points[0].x).toBeGreaterThan(0);
    expect(r.points[0].x).toBeLessThan(160);
    expect(r.points[r.points.length - 1]).toEqual({ x: 13 * 20 - 320, y: 9 * 20 });
    for (let i = 1; i < r.points.length; i++) expect(r.points[i].x).toBeLessThanOrEqual(r.points[i - 1].x);
    // The same stream picked on the far side, or at the seam's twin column
    for (const x of [15 * 20, 16 * 20, 16 * 20 + 2]) {
      expect(streamPicker(square, cols, rows, flow, null, 4, [], BUILTIN_LINE_CLASSES, null).at(x, 4 * 20, 5)).toEqual(r);
    }
  });
});

describe('the setting', () => {
  const s = () => useMapStore.getState();
  beforeEach(() => {
    const p = ground({ ...square, properties: [] });
    p.cm.fill(1_000);
    for (let r = 0; r < p.rows; r++) p.cm[r * p.cols + 16] = 3_000;
    useMapStore.setState({ mapData: { ...square, properties: [{ name: 'sea', type: 'bool', value: false }] }, heights: p, past: [], future: [], isDirty: false, heightsDirty: false });
  });

  it('turning it on joins the heights; undo and redo do both together', () => {
    expect(s().setWrapX(true)).toBe(true);
    expect(wrapsX(s().mapData!)).toBe(true);
    expect(seamStepCm(s().heights!.cm, 17)).toBe(0);
    expect(s().heights!.cm[0]).toBe(2_000);
    expect(s().past).toHaveLength(1);
    expect(s().heightsDirty).toBe(true);
    s().undo();
    expect(wrapsX(s().mapData!)).toBe(false);
    expect([s().heights!.cm[0], s().heights!.cm[16]]).toEqual([1_000, 3_000]);
    s().redo();
    expect(wrapsX(s().mapData!)).toBe(true);
    expect(s().heights!.cm[16]).toBe(2_000);
    expect(s().mapData!.properties).toContainEqual({ name: 'sea', type: 'bool', value: false });
  });

  it('turning it off leaves the heights; a map that cannot wrap is refused', () => {
    s().setWrapX(true);
    const cm = s().heights!.cm.slice();
    expect(s().setWrapX(false)).toBe(true);
    expect(s().heights!.cm).toEqual(cm);
    useMapStore.setState({ mapData: { ...hexFlat, width: 15, properties: [] }, heights: null });
    expect(s().setWrapX(true)).toBe(false);
  });

  it('without elevation it changes only the property, and undo does not mark heights to save', () => {
    useMapStore.setState({ heights: null, heightsDirty: false });
    s().setWrapX(true);
    s().undo();
    expect(wrapsX(s().mapData!)).toBe(false);
    expect(s().heightsDirty).toBe(false);
  });

  it('replacing heights on a wrapped map keeps the twin column equal', () => {
    s().setWrapX(true);
    const cm = s().heights!.cm.slice();
    cm[16] = 5_000;
    s().replaceHeights(cm);
    expect(s().heights!.cm[0]).toBe(3_500);
    expect(s().heights!.cm[16]).toBe(3_500);
  });
});

it('SEA_BODY marks the sea on both sides of the seam', () => {
  const { cols, rows } = sampleGrid(square);
  const cm = new Int32Array(cols * rows).fill(-100);
  const w = computeWater(square, { cols, rows, cm }, [], true);
  expect(w.body.every((b) => b === SEA_BODY)).toBe(true);
  expect(w.seaSamples).toBe(16 * rows); // each place once
});
