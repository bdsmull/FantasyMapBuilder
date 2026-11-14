/**
 * Hex geometry must match Tiled's HexagonalRenderer exactly, so maps look the
 * same in both apps and object pixel coordinates mean the same cell.
 */

import { describe, it, expect } from 'vitest';
import {
  hexLayout, hexTopLeft, hexCenter, hexPolygon, hexMapPixelSize, pixelToHex, regularHexTileSize,
} from '../canvas/hexGeometry';
import type { HexGeometrySource } from '../canvas/hexGeometry';
import { cellCenter } from '../canvas/canvasUtils';
import type { TmjMap } from '../types/tmj';

const FLAT: HexGeometrySource = { tilewidth: 80, tileheight: 70, hexsidelength: 40, staggeraxis: 'x', staggerindex: 'odd' };
const POINTY: HexGeometrySource = { tilewidth: 70, tileheight: 80, hexsidelength: 40, staggeraxis: 'y', staggerindex: 'odd' };

describe('hexLayout (Tiled RenderParams)', () => {
  it('flat-top: columns step by (width + side) / 2', () => {
    expect(hexLayout(FLAT)).toMatchObject({
      staggerX: true, sideOffsetX: 20, sideOffsetY: 35,
      columnWidth: 60, rowHeight: 35, tileWidth: 80, tileHeight: 70,
    });
  });

  it('pointy-top: rows step by (height + side) / 2', () => {
    expect(hexLayout(POINTY)).toMatchObject({
      staggerX: false, sideOffsetX: 35, sideOffsetY: 20,
      columnWidth: 35, rowHeight: 60, tileWidth: 70, tileHeight: 80,
    });
  });

  it('uses integer halving like Tiled: an odd tile height loses a pixel', () => {
    expect(hexLayout({ ...FLAT, tileheight: 69 }).tileHeight).toBe(68);
  });
});

describe('hexTopLeft / hexCenter', () => {
  it('flat-top, stagger odd: odd columns shift down half a hex', () => {
    const l = hexLayout(FLAT);
    expect(hexTopLeft(l, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(hexTopLeft(l, 1, 0)).toEqual({ x: 60, y: 35 });
    expect(hexTopLeft(l, 2, 1)).toEqual({ x: 120, y: 70 });
    expect(hexCenter(l, 1, 0)).toEqual({ x: 100, y: 70 });
  });

  it('flat-top, stagger even: even columns shift instead', () => {
    const l = hexLayout({ ...FLAT, staggerindex: 'even' });
    expect(hexTopLeft(l, 0, 0)).toEqual({ x: 0, y: 35 });
    expect(hexTopLeft(l, 1, 0)).toEqual({ x: 60, y: 0 });
  });

  it('pointy-top, stagger odd: odd rows shift right half a hex', () => {
    const l = hexLayout(POINTY);
    expect(hexTopLeft(l, 0, 1)).toEqual({ x: 35, y: 60 });
    expect(hexTopLeft(l, 1, 0)).toEqual({ x: 70, y: 0 });
  });
});

describe('hexPolygon', () => {
  it('flat-top hex has its flat sides along the top and bottom', () => {
    const pts = hexPolygon(hexLayout(FLAT));
    expect(pts).toContainEqual({ x: 20, y: 0 });
    expect(pts).toContainEqual({ x: 60, y: 0 });
    expect(pts).toContainEqual({ x: 80, y: 35 });
    expect(pts).toContainEqual({ x: 60, y: 70 });
    expect(pts).toContainEqual({ x: 0, y: 35 });
  });
});

describe('hexMapPixelSize', () => {
  it('flat-top: last column plus the stagger overhang', () => {
    expect(hexMapPixelSize(hexLayout(FLAT), 10, 5)).toEqual({ width: 620, height: 385 });
  });
});

describe('pixelToHex', () => {
  const cases: [string, HexGeometrySource][] = [
    ['flat odd', FLAT],
    ['flat even', { ...FLAT, staggerindex: 'even' }],
    ['pointy odd', POINTY],
    ['pointy even', { ...POINTY, staggerindex: 'even' }],
  ];

  for (const [label, src] of cases) {
    it(`${label}: every cell centre maps back to its cell`, () => {
      const l = hexLayout(src);
      for (let col = 0; col < 6; col++) {
        for (let row = 0; row < 6; row++) {
          const c = hexCenter(l, col, row);
          expect(pixelToHex(l, c.x, c.y, 6, 6)).toEqual({ col, row });
        }
      }
    });
  }

  it('resolves points near a shared edge to the hex that contains them', () => {
    const l = hexLayout(FLAT);
    // Edge between hex (0,0) and hex (1,0) runs from (80,35) to (60,70); at y=45 it is at x≈74.3
    expect(pixelToHex(l, 70, 45, 6, 6)).toEqual({ col: 0, row: 0 });
    expect(pixelToHex(l, 78, 45, 6, 6)).toEqual({ col: 1, row: 0 });
  });

  it('clamps clicks outside the map to the nearest edge cell', () => {
    const l = hexLayout(FLAT);
    expect(pixelToHex(l, -500, 35, 6, 6).col).toBe(0);
    expect(pixelToHex(l, 40, -500, 6, 6).row).toBe(0);
    expect(pixelToHex(l, 99999, 99999, 6, 6)).toEqual({ col: 5, row: 5 });
  });
});

describe('regularHexTileSize', () => {
  it('derives an even-sized bounding box from the side length', () => {
    expect(regularHexTileSize(40, 'x')).toEqual({ tilewidth: 80, tileheight: 70 });
    expect(regularHexTileSize(40, 'y')).toEqual({ tilewidth: 70, tileheight: 80 });
  });
});

describe('cellCenter', () => {
  const base = { width: 6, height: 6, nextlayerid: 1, nextobjectid: 1, tilesets: [], layers: [] };
  it('square maps: centre of the tile', () => {
    const map: TmjMap = { ...base, orientation: 'orthogonal', tilewidth: 32, tileheight: 32 };
    expect(cellCenter(map, 2, 1)).toEqual({ x: 80, y: 48 });
  });
  it('hex maps: centre of the hex, as Tiled places it', () => {
    const map: TmjMap = { ...base, orientation: 'hexagonal', ...FLAT };
    expect(cellCenter(map, 1, 0)).toEqual({ x: 100, y: 70 });
  });
});
