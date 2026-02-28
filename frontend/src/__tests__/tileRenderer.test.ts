/**
 * Unit tests for canvas coordinate utilities.
 */

import { describe, it, expect } from 'vitest';
import { screenToTile, tileToScreen } from '../canvas/canvasUtils';

const VIEW_1X = { zoom: 1, pan: { x: 0, y: 0 } };
const VIEW_2X = { zoom: 2, pan: { x: 0, y: 0 } };
const VIEW_PAN = { zoom: 1, pan: { x: 64, y: 32 } };

describe('screenToTile', () => {
  it('maps pixel origin to tile (0,0) at 1× zoom', () => {
    const result = screenToTile(0, 0, VIEW_1X, 32, 32);
    expect(result).toEqual({ col: 0, row: 0 });
  });

  it('maps centre of tile (1,0) correctly', () => {
    const result = screenToTile(48, 16, VIEW_1X, 32, 32);
    expect(result).toEqual({ col: 1, row: 0 });
  });

  it('accounts for zoom factor', () => {
    // At 2× zoom, tile (0,0) spans px 0-63. Pixel 32 is still tile 0.
    const result = screenToTile(32, 16, VIEW_2X, 32, 32);
    expect(result).toEqual({ col: 0, row: 0 });
  });

  it('accounts for pan offset', () => {
    // Pan (64, 32) means tile (0,0) starts at screen pixel (64, 32)
    const result = screenToTile(64, 32, VIEW_PAN, 32, 32);
    expect(result).toEqual({ col: 0, row: 0 });
  });

  it('returns negative col for pixels left of map origin', () => {
    const result = screenToTile(-10, 0, VIEW_1X, 32, 32);
    expect(result.col).toBeLessThan(0);
  });
});

describe('tileToScreen', () => {
  it('maps tile (0,0) to pixel origin at 1× zoom', () => {
    const result = tileToScreen(0, 0, VIEW_1X, 32, 32);
    expect(result).toEqual({ x: 0, y: 0 });
  });

  it('maps tile (1,0) to pixel (32,0) at 1× zoom', () => {
    const result = tileToScreen(1, 0, VIEW_1X, 32, 32);
    expect(result).toEqual({ x: 32, y: 0 });
  });

  it('accounts for zoom factor', () => {
    const result = tileToScreen(1, 1, VIEW_2X, 32, 32);
    expect(result).toEqual({ x: 64, y: 64 });
  });

  it('accounts for pan offset', () => {
    const result = tileToScreen(0, 0, VIEW_PAN, 32, 32);
    expect(result).toEqual({ x: 64, y: 32 });
  });

  it('is inverse of screenToTile for whole-tile centres', () => {
    const view = { zoom: 1.5, pan: { x: 10, y: 20 } };
    const col = 3, row = 2;
    const screen = tileToScreen(col, row, view, 32, 32);
    // The top-left of the tile in screen space should map back to (col, row)
    const tile = screenToTile(screen.x, screen.y, view, 32, 32);
    expect(tile).toEqual({ col, row });
  });
});
