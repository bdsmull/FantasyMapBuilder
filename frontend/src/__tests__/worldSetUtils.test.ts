import { describe, it, expect } from 'vitest';
import { computeFootprint, detectOverlaps, FootprintedNode } from '../utils/worldSetUtils';

describe('computeFootprint', () => {
  it('odd x odd footprint is symmetric around anchor', () => {
    // 3x3 child at 10 fpu, parent at 10 fpu => fp 3x3
    // anchor (5,5) => col 4..6, row 4..6
    const fp = computeFootprint(3, 3, 10, 10, { col: 5, row: 5 });
    expect(fp).toEqual({ colMin: 4, colMax: 6, rowMin: 4, rowMax: 6 });
  });

  it('even x even footprint has bottom-right asymmetry', () => {
    // 4x4 child at 10 fpu, parent at 10 fpu => fp 4x4
    // anchor (5,5): colMin=5-2=3, colMax=5+1=6, rowMin=3, rowMax=6
    const fp = computeFootprint(4, 4, 10, 10, { col: 5, row: 5 });
    expect(fp).toEqual({ colMin: 3, colMax: 6, rowMin: 3, rowMax: 6 });
  });

  it('odd x even footprint (mixed dimensions)', () => {
    // 3 wide x 4 tall, fpu 10/10 => fp 3x4
    // col: 5-1=4..5+1=6  row: 5-2=3..5+1=6
    const fp = computeFootprint(3, 4, 10, 10, { col: 5, row: 5 });
    expect(fp).toEqual({ colMin: 4, colMax: 6, rowMin: 3, rowMax: 6 });
  });

  it('1x1 footprint collapses to the anchor cell', () => {
    // 1x1 child at same scale => fp 1x1
    const fp = computeFootprint(1, 1, 10, 10, { col: 3, row: 7 });
    expect(fp).toEqual({ colMin: 3, colMax: 3, rowMin: 7, rowMax: 7 });
  });

  it('scale ratio causes ceiling to round up', () => {
    // 10x10 child at 5 fpu on parent at 30 fpu
    // fpCols = ceil(10*5/30) = ceil(1.667) = 2
    // anchor (5,5): colMin=5-1=4, colMax=5+0=5
    const fp = computeFootprint(10, 10, 5, 30, { col: 5, row: 5 });
    expect(fp).toEqual({ colMin: 4, colMax: 5, rowMin: 4, rowMax: 5 });
  });

  it('large child on small parent produces large footprint', () => {
    // 100x100 child at 5280 fpu on parent at 30 fpu
    // fpCols = ceil(100*5280/30) = ceil(17600) = 17600
    // colMin = 0 - floor(17600/2) = -8800
    // colMax = 0 + floor(17599/2) = 8799
    const fp = computeFootprint(100, 100, 5280, 30, { col: 0, row: 0 });
    expect(fp.colMin).toBe(-8800);
    expect(fp.colMax).toBe(8799);
    expect(fp.colMax - fp.colMin + 1).toBe(17600);
  });

  it('anchor at origin (0,0) works correctly', () => {
    // 3x3 fp at origin => col -1..1, row -1..1
    const fp = computeFootprint(3, 3, 10, 10, { col: 0, row: 0 });
    expect(fp).toEqual({ colMin: -1, colMax: 1, rowMin: -1, rowMax: 1 });
  });
});

describe('detectOverlaps', () => {
  it('returns empty for non-overlapping nodes at same Z', () => {
    const nodes: FootprintedNode[] = [
      { mapName: 'a', z: 0, footprint: { colMin: 0, colMax: 2, rowMin: 0, rowMax: 2 } },
      { mapName: 'b', z: 0, footprint: { colMin: 5, colMax: 7, rowMin: 5, rowMax: 7 } },
    ];
    expect(detectOverlaps(nodes)).toEqual([]);
  });

  it('detects overlapping nodes at same Z', () => {
    const nodes: FootprintedNode[] = [
      { mapName: 'a', z: 0, footprint: { colMin: 0, colMax: 3, rowMin: 0, rowMax: 3 } },
      { mapName: 'b', z: 0, footprint: { colMin: 2, colMax: 5, rowMin: 2, rowMax: 5 } },
    ];
    expect(detectOverlaps(nodes)).toEqual([['a', 'b']]);
  });

  it('does NOT detect overlap for nodes at different Z levels', () => {
    const nodes: FootprintedNode[] = [
      { mapName: 'a', z: 0, footprint: { colMin: 0, colMax: 3, rowMin: 0, rowMax: 3 } },
      { mapName: 'b', z: 1, footprint: { colMin: 0, colMax: 3, rowMin: 0, rowMax: 3 } },
    ];
    expect(detectOverlaps(nodes)).toEqual([]);
  });

  it('detects overlap when nodes share the same anchor', () => {
    const nodes: FootprintedNode[] = [
      { mapName: 'a', z: 0, footprint: { colMin: 4, colMax: 6, rowMin: 4, rowMax: 6 } },
      { mapName: 'b', z: 0, footprint: { colMin: 4, colMax: 6, rowMin: 4, rowMax: 6 } },
    ];
    expect(detectOverlaps(nodes)).toEqual([['a', 'b']]);
  });

  it('detects edge-touching as overlap (shared boundary)', () => {
    const nodes: FootprintedNode[] = [
      { mapName: 'a', z: 0, footprint: { colMin: 0, colMax: 2, rowMin: 0, rowMax: 2 } },
      { mapName: 'b', z: 0, footprint: { colMin: 2, colMax: 4, rowMin: 2, rowMax: 4 } },
    ];
    // They share cell (2,2), so they overlap
    expect(detectOverlaps(nodes)).toEqual([['a', 'b']]);
  });

  it('returns pairs in alphabetical order', () => {
    const nodes: FootprintedNode[] = [
      { mapName: 'z-map', z: 0, footprint: { colMin: 0, colMax: 3, rowMin: 0, rowMax: 3 } },
      { mapName: 'a-map', z: 0, footprint: { colMin: 0, colMax: 3, rowMin: 0, rowMax: 3 } },
    ];
    expect(detectOverlaps(nodes)).toEqual([['a-map', 'z-map']]);
  });

  it('handles multiple overlapping pairs', () => {
    const nodes: FootprintedNode[] = [
      { mapName: 'a', z: 0, footprint: { colMin: 0, colMax: 5, rowMin: 0, rowMax: 5 } },
      { mapName: 'b', z: 0, footprint: { colMin: 3, colMax: 8, rowMin: 3, rowMax: 8 } },
      { mapName: 'c', z: 0, footprint: { colMin: 4, colMax: 6, rowMin: 4, rowMax: 6 } },
    ];
    const result = detectOverlaps(nodes);
    expect(result).toHaveLength(3); // a-b, a-c, b-c
    expect(result).toContainEqual(['a', 'b']);
    expect(result).toContainEqual(['a', 'c']);
    expect(result).toContainEqual(['b', 'c']);
  });

  it('returns empty for empty input', () => {
    expect(detectOverlaps([])).toEqual([]);
  });

  it('returns empty for single node', () => {
    const nodes: FootprintedNode[] = [
      { mapName: 'a', z: 0, footprint: { colMin: 0, colMax: 3, rowMin: 0, rowMax: 3 } },
    ];
    expect(detectOverlaps(nodes)).toEqual([]);
  });
});
