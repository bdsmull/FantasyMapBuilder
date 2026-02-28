/**
 * Unit tests for the BFS flood-fill algorithm.
 * Tests the pure logic function, no DOM or React required.
 */

import { describe, it, expect } from 'vitest';
import { bfsFloodFill } from '../tools/fillTool';

describe('bfsFloodFill', () => {
  it('fills a single cell in a 1×1 grid', () => {
    const data = [0];
    const changed = bfsFloodFill(data, 1, 1, 0, 0, 0, 7);
    expect(changed).toEqual([[0, 0]]);
  });

  it('returns empty when target === fill GID', () => {
    const data = [5, 5];
    const changed = bfsFloodFill(data, 2, 1, 0, 0, 5, 5);
    expect(changed).toHaveLength(0);
  });

  it('fills all connected same-GID cells', () => {
    // 3×1 row all with GID 1 → all three should be changed
    const data = [1, 1, 1];
    const changed = bfsFloodFill(data, 3, 1, 0, 0, 1, 9);
    expect(changed).toHaveLength(3);
  });

  it('stops at different GID border', () => {
    // 3×1: [1, 2, 1] — fill from col 0 should not cross col 1 (GID 2)
    const data = [1, 2, 1];
    const changed = bfsFloodFill(data, 3, 1, 0, 0, 1, 9);
    expect(changed).toHaveLength(1);
    expect(changed[0]).toEqual([0, 0]);
  });

  it('fills a 2D region correctly', () => {
    // 3×3 grid filled with 1, start at centre — all 9 cells changed
    const data = Array(9).fill(1);
    const changed = bfsFloodFill(data, 3, 3, 1, 1, 1, 5);
    expect(changed).toHaveLength(9);
  });

  it('does not fill diagonally — only 4-connected neighbours', () => {
    // Checkerboard 2×2: [1, 0, 0, 1] — fill from (0,0) should only change top-left
    const data = [1, 0, 0, 1];
    const changed = bfsFloodFill(data, 2, 2, 0, 0, 1, 9);
    expect(changed).toHaveLength(1);
    expect(changed[0]).toEqual([0, 0]);
  });
});
