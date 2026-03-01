/**
 * Unit tests for pixelToHex — the inverse hex hit-testing function.
 *
 * hexCenter geometry (flat-top, staggeraxis='x'):
 *   hexSize = outer radius (pre-scaled by zoom)
 *   h = sqrt(3) * hexSize
 *   center(col, row).x = col * hexSize * 1.5 + hexSize
 *   center(col, row).y = row * h + (col%2===0 ? h/2 : h)
 */

import { describe, it, expect } from 'vitest';
import { pixelToHex } from '../canvas/hexRenderer';

// Use the same hexSize calculation as renderHexMap:
// hexSize = (hexsidelength + tilewidth / 2) * zoom
// Default hex map: hexsidelength=40, tilewidth=80, zoom=1 → hexSize=80
const HS = 80;
const H = Math.sqrt(3) * HS; // ≈ 138.56

/** Compute expected center of hex (col, row) for flat-top layout. */
function flatCenter(col: number, row: number) {
  return {
    x: col * HS * 1.5 + HS,
    y: row * H + (col % 2 === 0 ? H / 2 : H),
  };
}

const MAP_W = 10;
const MAP_H = 10;

describe('pixelToHex — flat-top (staggeraxis="x")', () => {
  it('identifies hex (0,0) from its exact center', () => {
    const { x, y } = flatCenter(0, 0);
    expect(pixelToHex(x, y, HS, 'x', MAP_W, MAP_H)).toEqual({ col: 0, row: 0 });
  });

  it('identifies hex (1,0) from its exact center', () => {
    const { x, y } = flatCenter(1, 0);
    expect(pixelToHex(x, y, HS, 'x', MAP_W, MAP_H)).toEqual({ col: 1, row: 0 });
  });

  it('identifies hex (0,1) from its exact center', () => {
    const { x, y } = flatCenter(0, 1);
    expect(pixelToHex(x, y, HS, 'x', MAP_W, MAP_H)).toEqual({ col: 0, row: 1 });
  });

  it('identifies hex (2,3) from its exact center', () => {
    const { x, y } = flatCenter(2, 3);
    expect(pixelToHex(x, y, HS, 'x', MAP_W, MAP_H)).toEqual({ col: 2, row: 3 });
  });

  it('identifies an odd column hex (1,1) from its exact center', () => {
    // Odd columns are offset down by H/2 compared to even columns
    const { x, y } = flatCenter(1, 1);
    expect(pixelToHex(x, y, HS, 'x', MAP_W, MAP_H)).toEqual({ col: 1, row: 1 });
  });

  it('round-trips all cells in a 4×4 grid', () => {
    for (let col = 0; col < 4; col++) {
      for (let row = 0; row < 4; row++) {
        const { x, y } = flatCenter(col, row);
        expect(pixelToHex(x, y, HS, 'x', MAP_W, MAP_H)).toEqual({ col, row });
      }
    }
  });

  it('handles click slightly off-center (within hex body)', () => {
    const { x, y } = flatCenter(2, 2);
    // Nudge a few pixels in various directions — should still resolve to same hex
    expect(pixelToHex(x + 5, y, HS, 'x', MAP_W, MAP_H)).toEqual({ col: 2, row: 2 });
    expect(pixelToHex(x - 5, y, HS, 'x', MAP_W, MAP_H)).toEqual({ col: 2, row: 2 });
    expect(pixelToHex(x, y + 5, HS, 'x', MAP_W, MAP_H)).toEqual({ col: 2, row: 2 });
    expect(pixelToHex(x, y - 5, HS, 'x', MAP_W, MAP_H)).toEqual({ col: 2, row: 2 });
  });

  it('works at 2× zoom', () => {
    const zoom = 2;
    const hs2 = HS * zoom;
    const h2 = Math.sqrt(3) * hs2;
    const col = 1, row = 2;
    const cx = col * hs2 * 1.5 + hs2;
    const cy = row * h2 + h2; // odd column: +h2
    expect(pixelToHex(cx, cy, hs2, 'x', MAP_W, MAP_H)).toEqual({ col, row });
  });

  it('clamps to the map boundary for out-of-range clicks', () => {
    // Click well outside the left edge — should return col 0 (nearest valid)
    const result = pixelToHex(-500, flatCenter(0, 0).y, HS, 'x', MAP_W, MAP_H);
    expect(result.col).toBe(0);
    // Click well above the top edge
    const result2 = pixelToHex(flatCenter(0, 0).x, -500, HS, 'x', MAP_W, MAP_H);
    expect(result2.row).toBe(0);
  });
});
