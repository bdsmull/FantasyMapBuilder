import { describe, it, expect } from 'vitest';
import { streamPicker, simplifyPath, riverClassFor } from '../utils/streamTrace';
import { computeFlow, samplePixels } from '../utils/flow';
import { computeWater, NO_WATER } from '../utils/water';
import { createPatch } from '../utils/heightGrid';
import type { HeightPatch } from '../utils/heightGrid';
import { toPolyline } from '../utils/lines';
import type { LineRef } from '../utils/lines';
import { BUILTIN_LINE_CLASSES } from '../data/lineClasses';
import type { LineClass } from '../data/lineClasses';
import { useMapStore } from '../store/mapStore';
import { useViewStore } from '../store/viewStore';
import { waterKey } from '../tools/waterMode';
import type { TmjMap } from '../types/tmj';

const square = (w = 20, h = 20): TmjMap => ({
  orientation: 'orthogonal', width: w, height: h, tilewidth: 10, tileheight: 10,
  nextlayerid: 2, nextobjectid: 1, tilesets: [],
  layers: [{ type: 'tilelayer', id: 1, name: 'Ground', width: w, height: h, visible: true, opacity: 1, offsetx: 0, offsety: 0, data: new Array(w * h).fill(0) }],
});
const patchOf = (map: TmjMap, f: (c: number, r: number) => number): HeightPatch => {
  const p = createPatch(map, 0);
  for (let r = 0; r < p.rows; r++) for (let c = 0; c < p.cols; c++) p.cm[r * p.cols + c] = Math.round(f(c, r));
  return p;
};
/** A valley down column 10, falling towards the bottom edge. */
const valley = (c: number, r: number) => 2000 + 100 * Math.abs(c - 10) + 50 * (20 - r);
const river = (id: number, points: { x: number; y: number }[]): LineRef => ({
  id, layerIndex: 1, object: { id, name: '', type: 'river', width: 0, height: 0, visible: true, ...toPolyline(points) },
});
const T = 5;

describe('Convert to River', () => {
  it('follows a stream from where it begins to the map edge, as a simplified line', () => {
    const map = square();
    const p = patchOf(map, valley);
    const flow = computeFlow(map, p.cols, p.rows, p.cm, null);
    const r = streamPicker(map, p.cols, p.rows, flow, null, T, [], BUILTIN_LINE_CLASSES, null).at(101, 102, 5)!;
    expect(r).not.toBeNull();
    expect(r.end).toBe('edge');
    // Down the valley floor: straight, so just its two ends
    expect(r.points).toHaveLength(2);
    expect(r.points[0].x).toBe(100);
    expect(r.points[1]).toEqual({ x: 100, y: 200 });
    // It begins where the Flow view's stream does
    const top = r.samples[0];
    expect(flow.accumulation[top]).toBeGreaterThanOrEqual(T);
    expect(r.points[0].y).toBeLessThan(100);
    expect(r.classId).toBe('stream'); // no scale: a stream
    expect(r.catchmentM2).toBeNull();
  });

  it('works on hex maps, through hex centres', () => {
    const map: TmjMap = {
      ...square(), orientation: 'hexagonal', tilewidth: 32, tileheight: 28, hexsidelength: 16,
      staggeraxis: 'x', staggerindex: 'odd',
    };
    const p = patchOf(map, valley);
    const flow = computeFlow(map, p.cols, p.rows, p.cm, null);
    const xs = samplePixels(map, p.cols, p.rows);
    const mid = 10 * p.cols + 10;
    const r = streamPicker(map, p.cols, p.rows, flow, null, T, [], BUILTIN_LINE_CLASSES, null).at(xs.x[mid], xs.y[mid], 5)!;
    expect(r).not.toBeNull();
    expect(r.end).toBe('edge');
    expect(r.samples).toContain(mid);
    // It runs downhill, off the bottom edge
    const last = r.samples[r.samples.length - 1];
    expect(Math.floor(last / p.cols)).toBe(p.rows - 1);
    expect(r.points[0]).toEqual({ x: xs.x[r.samples[0]], y: xs.y[r.samples[0]] });
  });

  it('nothing to pick away from the streams', () => {
    const map = square();
    const p = patchOf(map, valley);
    const flow = computeFlow(map, p.cols, p.rows, p.cm, null);
    // With a higher threshold only the valley floor is a stream
    const picker = streamPicker(map, p.cols, p.rows, flow, null, 30, [], BUILTIN_LINE_CLASSES, null);
    expect(picker.at(150, 100, 5)).toBeNull();
    expect(picker.at(100, 150, 5)).not.toBeNull();
  });

  it('the land draining in picks brook, stream or river', () => {
    const map = square();
    const p = patchOf(map, valley);
    const flow = computeFlow(map, p.cols, p.rows, p.cm, null);
    const pick = (mpu: number) => streamPicker(map, p.cols, p.rows, flow, null, T, [], BUILTIN_LINE_CLASSES, mpu).at(100, 100, 5)!;
    const small = pick(10), big = pick(2000);
    expect(small.catchmentM2).toBe(small.catchmentSamples * 100);
    expect(small.classId).toBe('brook');
    expect(big.classId).toBe('river');
  });

  it('ends where it runs into the sea', () => {
    const map = square();
    // The bottom rows are below sea level
    const p = patchOf(map, (c, r) => (r >= 16 ? -500 : valley(c, r)));
    const water = computeWater(map, p, [], true);
    const flow = computeFlow(map, p.cols, p.rows, p.cm, water);
    const r = streamPicker(map, p.cols, p.rows, flow, water, T, [], BUILTIN_LINE_CLASSES, null).at(100, 100, 5)!;
    expect(r.end).toBe('water');
    const last = r.samples[r.samples.length - 1];
    expect(water.surface[last]).not.toBe(NO_WATER);
    expect(r.samples.slice(0, -1).every((i) => water.surface[i] === NO_WATER)).toBe(true);
  });

  it('ends exactly on a drawn river it joins; one already drawn is not offered again', () => {
    const map = square();
    const p = patchOf(map, valley);
    const flow = computeFlow(map, p.cols, p.rows, p.cm, null);
    const across = river(7, [{ x: 0, y: 153 }, { x: 200, y: 153 }]);
    const picker = streamPicker(map, p.cols, p.rows, flow, null, T, [across], BUILTIN_LINE_CLASSES, null);
    const r = picker.at(100, 100, 5)!;
    expect(r.end).toBe('river');
    expect(r.points[r.points.length - 1]).toEqual({ x: 100, y: 153 });
    // The stream under the drawn river is already a river
    expect(picker.at(100, 150, 2)).toBeNull();
  });

  it('simplifies within the tolerance, keeping the ends', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 1 }, { x: 20, y: 0 }, { x: 30, y: 10 }];
    expect(simplifyPath(pts, 2)).toEqual([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 10 }]);
    expect(simplifyPath(pts.slice(0, 2), 5)).toEqual(pts.slice(0, 2));
  });

  it("a world set's own waterways: narrowest for brooks, widest for rivers", () => {
    const own: LineClass[] = [
      { id: 'creek', name: 'Creek', kind: 'water', widthM: 2, color: '#00f' },
      { id: 'big', name: 'Big river', kind: 'water', widthM: 50, color: '#00f' },
      { id: 'road', name: 'Road', kind: 'road', widthM: 5, color: '#aaa' },
    ];
    expect(riverClassFor(1e6, own)).toBe('creek');
    expect(riverClassFor(1e9, own)).toBe('big');
    expect(riverClassFor(1e6, BUILTIN_LINE_CLASSES)).toBe('brook');
    expect(riverClassFor(50e6, BUILTIN_LINE_CLASSES)).toBe('stream');
  });

  it('Esc stops converting', () => {
    useViewStore.getState().setConvertingStream(true);
    expect(waterKey('Escape', useMapStore.getState())).toBe(true);
    expect(useViewStore.getState().convertingStream).toBe(false);
  });
});
