import { describe, it, expect, beforeEach } from 'vitest';
import {
  HEIGHTMAP_STEPS, gridRange, guessRawSide, heightmapFrame, heightmapInfo, heightmapLayout, heightmapSize,
  importHeightmap, pow2Side, quantize, rawBytes, rawSource, sampleHeightmap, samplesToFractions,
} from '../utils/heightmap';
import type { HeightPatch } from '../utils/heightGrid';
import { useMapStore } from '../store/mapStore';
import type { TmjMap } from '../types/tmj';

const square: TmjMap = {
  orientation: 'orthogonal', width: 4, height: 2, tilewidth: 32, tileheight: 32,
  nextlayerid: 1, nextobjectid: 1, tilesets: [], layers: [],
};
const hex: TmjMap = {
  ...square, orientation: 'hexagonal', width: 5, height: 4, tilewidth: 80, tileheight: 70,
  hexsidelength: 40, staggeraxis: 'x', staggerindex: 'odd',
};

function patch(cols: number, rows: number, fn: (c: number, r: number) => number): HeightPatch {
  const cm = new Int32Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cm[r * cols + c] = fn(c, r);
  return { cols, rows, cm, mask: new Uint8Array(cols * rows) };
}

describe('heightmap size', () => {
  it('square maps export their corner samples; hex maps one sample per hex', () => {
    expect(heightmapSize(square, 'native')).toEqual({ cols: 5, rows: 3 });
    expect(heightmapSize(hex, 'native')).toEqual({ cols: 5, rows: 4 });
  });

  it('2ⁿ + 1 is the smallest that fits, within 33 … 4097', () => {
    expect(pow2Side(5)).toBe(33);
    expect(pow2Side(33)).toBe(33);
    expect(pow2Side(34)).toBe(65);
    expect(pow2Side(501)).toBe(513);
    expect(pow2Side(10_000)).toBe(4097);
    expect(heightmapSize(square, 'pow2')).toEqual({ cols: 33, rows: 33 });
  });

  it('spacing comes from the cell size: one cell between neighbours natively', () => {
    const native = heightmapLayout(square, 'native', 2);
    expect(native).toMatchObject({ widthM: 8, heightM: 4, spacingXM: 2, spacingYM: 2 });
    const pow2 = heightmapLayout(square, 'pow2', 2);
    expect(pow2.spacingXM).toBeCloseTo(8 / 32);
    expect(pow2.spacingYM).toBeCloseTo(4 / 32);
    const h = heightmapLayout(hex, 'native', 10);
    expect(h).toMatchObject({ widthM: 40, heightM: 30, spacingXM: 10, spacingYM: 10 });
  });
});

describe('sampling and quantizing', () => {
  const p = patch(5, 3, (c, r) => 10_000 + c * 100 + r * 10);

  it('square maps export their samples exactly', () => {
    const grid = sampleHeightmap(square, p, 'native', 1);
    expect(Array.from(grid.cm)).toEqual(Array.from(p.cm));
  });

  it('a 2ⁿ + 1 resample keeps the corners and stays within the range', () => {
    const grid = sampleHeightmap(square, p, 'pow2', 1);
    expect(grid.cols).toBe(33);
    expect(grid.cm[0]).toBeCloseTo(10_000);
    expect(grid.cm[32]).toBeCloseTo(10_400);
    expect(grid.cm[33 * 33 - 1]).toBeCloseTo(10_420);
    expect(gridRange(grid)).toEqual({ minCm: 10_000, maxCm: 10_420 });
  });

  it('hex maps resample to a square grid at the hex centres', () => {
    const hp = patch(5, 4, () => 5_000);
    const grid = sampleHeightmap(hex, hp, 'native', 1);
    expect(grid.cols * grid.rows).toBe(20);
    expect(grid.cm.every((v) => Math.abs(v - 5_000) < 1e-6)).toBe(true);
  });

  it('steps span the range: lowest 0, highest 65535', () => {
    const q = quantize({ cm: [100, 150, 200] }, { minCm: 100, maxCm: 200 });
    expect(Array.from(q.steps)).toEqual([0, 32768, HEIGHTMAP_STEPS]);
    expect(q.metersPerStep).toBeCloseTo(1 / HEIGHTMAP_STEPS);
    expect(q.clipped).toBe(0);
  });

  it('a fixed range clamps heights outside it and counts them', () => {
    const q = quantize({ cm: [0, 150, 500] }, { minCm: 100, maxCm: 200 });
    expect(Array.from(q.steps)).toEqual([0, 32768, HEIGHTMAP_STEPS]);
    expect(q.clipped).toBe(2);
  });

  it('a flat range writes zeros', () => {
    const q = quantize({ cm: [700, 700] }, { minCm: 700, maxCm: 700 });
    expect(Array.from(q.steps)).toEqual([0, 0]);
    expect(q.metersPerStep).toBe(0);
  });

  it('RAW is little-endian 16-bit', () => {
    expect(Array.from(rawBytes(Uint16Array.from([1, 0x1234, 65535])))).toEqual([1, 0, 0x34, 0x12, 255, 255]);
  });

  it('the info carries what an engine needs', () => {
    const grid = sampleHeightmap(square, p, 'native', 2);
    const q = quantize(grid, gridRange(grid));
    const info = heightmapInfo('inn', 'raw', grid, q, false);
    expect(info).toMatchObject({
      map: 'inn', format: 'raw', width: 5, height: 3, minM: 100, maxM: 104.2,
      spacingXM: 2, spacingYM: 2, widthM: 8, heightM: 4, rowOrder: 'top-first', byteOrder: 'little-endian',
    });
    expect(info.assembled).toBeUndefined();
  });
});

describe('import', () => {
  it('reads unpacked samples and RAW files as fractions', () => {
    expect(Array.from(samplesToFractions(Uint8Array.from([0, 255]).buffer, 'u8'))).toEqual([0, 1]);
    const u16 = rawBytes(Uint16Array.from([0, HEIGHTMAP_STEPS]));
    expect(Array.from(samplesToFractions(u16.buffer, 'u16'))).toEqual([0, 1]);
    expect(guessRawSide(33 * 33 * 2)).toBe(33);
    expect(guessRawSide(10)).toBeNull();
    expect(rawSource(u16.buffer, 2, 1)?.fractions[1]).toBe(1);
    expect(rawSource(u16.buffer, 3, 1)).toBeNull();
  });

  it('an export imports back to the same heights', () => {
    const p = patch(5, 3, (c, r) => 9_600 + c * 137 + r * 51);
    for (const size of ['native', 'pow2'] as const) {
      const grid = sampleHeightmap(square, p, size, 1);
      const range = gridRange(grid);
      const q = quantize(grid, range);
      const src = { width: grid.cols, height: grid.rows, fractions: Float32Array.from(q.steps, (s) => s / HEIGHTMAP_STEPS) };
      const target = patch(5, 3, () => 0);
      const result = importHeightmap(square, target, src, range, true);
      expect(Array.from(result.cm)).toEqual(Array.from(p.cm));
      expect(result.changed).toBe(15);
    }
  });

  it('hex maps import back too', () => {
    const p = patch(5, 4, (c, r) => 1_000 + c * 200 + r * 30);
    const grid = sampleHeightmap(hex, p, 'native', 1);
    const range = gridRange(grid);
    const q = quantize(grid, range);
    const src = { width: grid.cols, height: grid.rows, fractions: Float32Array.from(q.steps, (s) => s / HEIGHTMAP_STEPS) };
    const result = importHeightmap(hex, patch(5, 4, () => 0), src, range, true);
    for (let i = 0; i < p.cm.length; i++) expect(Math.abs(result.cm[i] - p.cm[i])).toBeLessThanOrEqual(20);
    expect(heightmapFrame(hex)).toEqual({ u0: 0.5, v0: 0.5, u1: 4.5, v1: 3.5 });
  });

  it('keeps hand-set heights unless told to overwrite them', () => {
    const target = patch(5, 3, () => 0);
    target.mask[0] = 1;
    target.cm[0] = 4_242;
    const src = { width: 2, height: 2, fractions: Float32Array.from([1, 1, 1, 1]) };
    const kept = importHeightmap(square, target, src, { minCm: 0, maxCm: 1_000 }, true);
    expect(kept.cm[0]).toBe(4_242);
    expect(kept.mask[0]).toBe(1);
    expect(kept.kept).toBe(1);
    expect(kept.changed).toBe(14);
    const over = importHeightmap(square, target, src, { minCm: 0, maxCm: 1_000 }, false);
    expect(over.cm[0]).toBe(1_000);
    expect(over.mask[0]).toBe(0);
    expect(over.changed).toBe(15);
    expect(target.cm[0]).toBe(4_242); // the patch itself is untouched
  });
});

describe('replaceHeights with marks', () => {
  beforeEach(() => {
    const p = patch(5, 3, () => 100);
    p.mask[2] = 1;
    useMapStore.setState({ mapData: square, heights: p, past: [], future: [] });
  });

  it('new marks are part of the one undo step', () => {
    const cm = new Int32Array(15).fill(300);
    useMapStore.getState().replaceHeights(cm, new Uint8Array(15));
    let h = useMapStore.getState().heights!;
    expect(h.cm[2]).toBe(300);
    expect(h.mask[2]).toBe(0);
    expect(useMapStore.getState().past).toHaveLength(1);

    useMapStore.getState().undo();
    h = useMapStore.getState().heights!;
    expect(h.cm[2]).toBe(100);
    expect(h.mask[2]).toBe(1);

    useMapStore.getState().redo();
    expect(useMapStore.getState().heights!.mask[2]).toBe(0);
  });

  it('without marks, hand-set marks stay', () => {
    useMapStore.getState().replaceHeights(new Int32Array(15).fill(300));
    useMapStore.getState().undo();
    useMapStore.getState().redo();
    expect(useMapStore.getState().heights!.mask[2]).toBe(1);
  });
});
