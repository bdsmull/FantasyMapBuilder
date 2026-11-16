import { describe, it, expect } from 'vitest';
import {
  sampleGrid, createPatch, heightAt, bandIntervalCm, bandOf, heightColor, formatHeight,
  parseHeightToCm, patchRange, hasHeightsProperty, heightsPropertyValue, RELATIVE_COLOR_RANGE_CM,
} from '../utils/heightGrid';
import type { HeightPatch } from '../utils/heightGrid';
import { hexLayout, hexCenter } from '../canvas/hexGeometry';
import { hillshadeFactor } from '../canvas/elevationOverlay';
import type { TmjMap } from '../types/tmj';

const square: TmjMap = {
  orientation: 'orthogonal', width: 2, height: 1, tilewidth: 10, tileheight: 10,
  nextlayerid: 1, nextobjectid: 1, tilesets: [], layers: [],
};
const hex: TmjMap = {
  ...square, orientation: 'hexagonal', width: 3, height: 3, tilewidth: 80, tileheight: 70,
  hexsidelength: 40, staggeraxis: 'x', staggerindex: 'odd',
};

function patch(cols: number, rows: number, values: number[]): HeightPatch {
  return { cols, rows, cm: Int32Array.from(values), mask: new Uint8Array(cols * rows) };
}

describe('sample grid', () => {
  it('square maps sample cell corners, hex maps cell centres', () => {
    expect(sampleGrid(square)).toEqual({ cols: 3, rows: 2 });
    expect(sampleGrid(hex)).toEqual({ cols: 3, rows: 3 });
  });

  it('createPatch fills every sample and clears the mask', () => {
    const p = createPatch(square, 124050);
    expect(Array.from(p.cm)).toEqual([124050, 124050, 124050, 124050, 124050, 124050]);
    expect(Array.from(p.mask)).toEqual([0, 0, 0, 0, 0, 0]);
  });
});

describe('heightAt (square: bilinear between corners)', () => {
  // corners: row 0: 0, 100, 200; row 1: 1000, 1100, 1200
  const p = patch(3, 2, [0, 100, 200, 1000, 1100, 1200]);
  it('equals the sample at a corner', () => {
    expect(heightAt(square, p, 10, 0)).toBe(100);
    expect(heightAt(square, p, 20, 10)).toBe(1200);
  });
  it('interpolates inside a cell', () => {
    expect(heightAt(square, p, 5, 5)).toBe(550); // centre of the first cell
    expect(heightAt(square, p, 15, 0)).toBe(150);
  });
  it('clamps outside the map', () => {
    expect(heightAt(square, p, -50, -50)).toBe(0);
    expect(heightAt(square, p, 999, 999)).toBe(1200);
  });
});

describe('heightAt (hex: triangles of centres)', () => {
  const values = [0, 0, 0, 0, 900, 0, 0, 0, 0]; // a single peak in the middle hex (1,1)
  const p = patch(3, 3, values);
  const layout = hexLayout(hex);
  it('equals the sample at a hex centre', () => {
    const c = hexCenter(layout, 1, 1);
    expect(heightAt(hex, p, c.x, c.y)).toBeCloseTo(900);
  });
  it('falls off linearly towards a neighbour', () => {
    const c = hexCenter(layout, 1, 1);
    const n = hexCenter(layout, 1, 0); // directly above
    expect(heightAt(hex, p, (c.x + n.x) / 2, (c.y + n.y) / 2)).toBeCloseTo(450);
  });
});

describe('bands and colors', () => {
  it('band spacing follows scale and units', () => {
    expect(bandIntervalCm('world', 'metric')).toBe(50000);
    expect(bandIntervalCm('room', 'metric')).toBe(100);
    expect(bandIntervalCm('battle', 'imperial')).toBeCloseTo(5 * 30.48);
    expect(bandIntervalCm(undefined, 'metric')).toBe(1000);
  });

  it('bandOf floors to whole bands, including below zero', () => {
    expect(bandOf(1999, 1000)).toBe(1);
    expect(bandOf(-1, 1000)).toBe(-1);
  });

  it('uses absolute tints for big relief or sea, relative for small maps', () => {
    const world = { min: -400000, max: 600000 };
    expect(heightColor(-300000, world)[2]).toBeGreaterThan(heightColor(-300000, world)[0]); // water is blue
    const dungeon = { min: 124000, max: 125000 };
    expect(RELATIVE_COLOR_RANGE_CM).toBe(50000);
    // relative: the dungeon's lowest and highest points get clearly different colors
    expect(heightColor(124000, dungeon)).not.toEqual(heightColor(125000, dungeon));
  });

  it('patchRange', () => {
    expect(patchRange(patch(2, 1, [-5, 7]))).toEqual({ min: -5, max: 7 });
  });
});

describe('formatting and parsing', () => {
  it('formats in the map units', () => {
    expect(formatHeight(124050, 'metric')).toBe('1,240.5 m');
    expect(formatHeight(150, 'metric')).toBe('1.5 m');
    expect(formatHeight(30.48 * 4068, 'imperial')).toBe('4,068 ft');
  });
  it('parses typed heights to whole centimeters', () => {
    expect(parseHeightToCm('1,240.5', 'metric')).toBe(124050);
    expect(parseHeightToCm('-10994', 'metric')).toBe(-1099400);
    expect(parseHeightToCm('100', 'imperial')).toBe(3048);
    expect(parseHeightToCm('', 'metric')).toBeNull();
    expect(parseHeightToCm('abc', 'metric')).toBeNull();
    expect(parseHeightToCm('99999999', 'metric')).toBeNull(); // beyond int32 centimeters
  });
});

describe('heights property', () => {
  it('links a map to heights/<map>.tif', () => {
    expect(heightsPropertyValue('nauram-town')).toBe('../heights/nauram-town.tif');
    expect(hasHeightsProperty({ ...square, properties: [{ name: 'heights', type: 'file', value: '../heights/x.tif' }] })).toBe(true);
    expect(hasHeightsProperty(square)).toBe(false);
  });
});

describe('hillshadeFactor', () => {
  it('is 1 on flat ground, brighter facing the light (north-west), darker away', () => {
    expect(hillshadeFactor(0, 0)).toBeCloseTo(1);
    expect(hillshadeFactor(1, 1)).toBeGreaterThan(1);   // rising to the south-east faces north-west
    expect(hillshadeFactor(-1, -1)).toBeLessThan(1);
  });
});
