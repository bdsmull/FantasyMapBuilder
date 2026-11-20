import { describe, it, expect, beforeEach } from 'vitest';
import {
  readContours, contourTargets, contourAt, isContour, CONTOUR_TYPE, CONTOUR_LAYER,
} from '../utils/contours';
import type { Contour } from '../utils/contours';
import { fitHeights } from '../utils/surfaceFit';
import { spotProperties } from '../utils/spotHeights';
import { createPatch, heightAt } from '../utils/heightGrid';
import { readLines } from '../utils/lines';
import { useMapStore } from '../store/mapStore';
import { useViewStore } from '../store/viewStore';
import { heightTool } from '../tools/heightTool';
import { contourKey } from '../tools/contourMode';
import type { TmjMap, TmjObject } from '../types/tmj';
import { isObjectLayer } from '../types/tmj';

const square = (w = 40, h = 40): TmjMap => ({
  orientation: 'orthogonal', width: w, height: h, tilewidth: 10, tileheight: 10,
  nextlayerid: 2, nextobjectid: 1, tilesets: [],
  layers: [{ type: 'tilelayer', id: 1, name: 'Ground', width: w, height: h, visible: true, opacity: 1, offsetx: 0, offsety: 0, data: new Array(w * h).fill(0) }],
});
const contour = (id: number, points: { x: number; y: number }[], cm: number, reachCells = 10, closed = false): Contour =>
  ({ id, layerIndex: 1, name: '', points, closed, cm, reachCells });
/** A circle of n points (map pixels). */
const ring = (cx: number, cy: number, r: number, n = 24) =>
  Array.from({ length: n }, (_, i) => ({ x: cx + r * Math.cos((2 * Math.PI * i) / n), y: cy + r * Math.sin((2 * Math.PI * i) / n) }));

describe('contour objects', () => {
  it('reads open (polyline) and closed (polygon) contours; roads ignore them', () => {
    const map = square();
    const objects: TmjObject[] = [
      { id: 1, name: 'Rim', type: CONTOUR_TYPE, x: 10, y: 10, width: 0, height: 0, visible: true,
        polyline: [{ x: 0, y: 0 }, { x: 50, y: 0 }], properties: spotProperties([], 12_000, 6) },
      { id: 2, name: '', type: CONTOUR_TYPE, x: 100, y: 100, width: 0, height: 0, visible: true,
        polygon: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 30 }], properties: [{ name: 'height', type: 'float', value: 250 }] },
      { id: 3, name: 'Road', type: 'minor-road', x: 0, y: 0, width: 0, height: 0, visible: true, polyline: [{ x: 0, y: 0 }, { x: 9, y: 9 }] },
    ];
    map.layers.push({ type: 'objectgroup', id: 2, name: 'Marks', visible: true, opacity: 1, offsetx: 0, offsety: 0, color: '#fff', objects });
    expect(readContours(map).map((c) => [c.id, c.closed, c.cm, c.reachCells, c.points.length])).toEqual([
      [1, false, 12_000, 6, 2], [2, true, 25_000, 10, 3],
    ]);
    expect(readContours(map)[0].points).toEqual([{ x: 10, y: 10 }, { x: 60, y: 10 }]);
    expect(readLines(map).map((l) => l.id)).toEqual([3]);
    expect(isContour({ ...objects[0], properties: [] })).toBe(false); // no height
    // The closing segment counts when picking a loop
    expect(contourAt(readContours(map), 115, 115, 3)?.id).toBe(2);
  });

  it('fits along each line every half cell, without repeating a loop\'s first point', () => {
    const map = square();
    const open = contourTargets(map, [contour(1, [{ x: 0, y: 50 }, { x: 40, y: 50 }], 100)]);
    expect(open).toHaveLength(9); // 4 cells: 8 steps plus the end
    expect(open[1]).toMatchObject({ x: 5, y: 50, cm: 100, reachCells: 10 });
    const loop = contourTargets(map, [contour(2, [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], 100, 10, true)]);
    expect(loop).toHaveLength(2 + 2 + 3); // 1 + 1 + 1.41 cells
  });
});

describe('fitting to contours', () => {
  // Contours are met to within a few centimetres (a curve sampled on a grid can't be exact)
  const met = (map: TmjMap, cm: Int32Array, c: Contour, tolCm = 5) => contourTargets(map, [c])
    .every((t) => Math.abs(heightAt(map, { cols: map.width + 1, rows: map.height + 1, cm, mask: new Uint8Array(cm.length) }, t.x, t.y) - c.cm) < tolCm);

  it('follows two contours and rises evenly between them; beyond the reach nothing changes', () => {
    const map = square();
    const low = contour(1, [{ x: 100, y: 0 }, { x: 100, y: 400 }], 10_000);
    const high = contour(2, [{ x: 160, y: 0 }, { x: 160, y: 400 }], 20_000);
    const result = fitHeights(map, createPatch(map, 0), contourTargets(map, [low, high]));
    expect(met(map, result.cm, low)).toBe(true);
    expect(met(map, result.cm, high)).toBe(true);
    const at = (col: number) => result.cm[20 * 41 + col];
    for (let col = 10; col < 16; col++) expect(at(col)).toBeLessThan(at(col + 1)); // rising all the way
    expect(at(13)).toBeGreaterThan(14_000);   // halfway between: well up the slope
    expect(at(13)).toBeLessThan(18_000);
    expect(Math.max(...Array.from({ length: 41 }, (_, c) => at(c)))).toBeLessThanOrEqual(20_000); // no ridge past the top
    expect(at(27)).toBe(0);                   // 11 cells past the high contour: beyond its reach
    expect(result.maxMissCm).toBeLessThan(5);
  });

  it('a closed contour around a hill, with a spot height on top', () => {
    const map = square();
    const rim = contour(1, ring(200, 200, 60), 30_000, 8, true);
    const top = { x: 200, y: 200, cm: 45_000, reachCells: 8 };
    const result = fitHeights(map, createPatch(map, 10_000), [...contourTargets(map, [rim]), top]);
    expect(met(map, result.cm, rim)).toBe(true);
    expect(Math.abs(result.cm[20 * 41 + 20] - 45_000)).toBeLessThan(5);
    expect(result.cm[20 * 41 + 23]).toBeGreaterThan(30_000); // inside the rim: above it
    expect(result.cm[0]).toBe(10_000);
  });

  it('keeps hand-set heights and reports what they hold back', () => {
    const map = square();
    const patch = createPatch(map, 0);
    for (let row = 0; row <= 40; row++) patch.mask[row * 41 + 10] = 1; // a hand-set column under the contour
    const result = fitHeights(map, patch, contourTargets(map, [contour(1, [{ x: 100, y: 0 }, { x: 100, y: 400 }], 5_000)]));
    expect(result.cm[20 * 41 + 10]).toBe(0);
    expect(result.maxMissCm).toBeGreaterThan(4_000);
  });

  it('works on hex maps', () => {
    const map: TmjMap = { ...square(20, 20), orientation: 'hexagonal', tilewidth: 80, tileheight: 70, hexsidelength: 40, staggeraxis: 'x', staggerindex: 'odd' };
    const c = contour(1, [{ x: 300, y: 100 }, { x: 600, y: 900 }], 7_500, 4);
    const patch = createPatch(map, 1_000);
    const result = fitHeights(map, patch, contourTargets(map, [c]));
    for (const t of contourTargets(map, [c])) {
      expect(Math.abs(heightAt(map, { ...patch, cm: result.cm }, t.x, t.y) - 7_500)).toBeLessThan(10);
    }
    expect(result.cm[result.cm.length - 1]).toBe(1_000); // the far corner: out of reach
  });

  it('is quick enough on a large map', () => {
    const map = square(300, 300);
    const contours = Array.from({ length: 12 }, (_, i) => contour(i + 1, ring(1500, 1500, 120 + i * 100, 64), 10_000 * (12 - i), 12, true));
    const t0 = performance.now();
    const result = fitHeights(map, createPatch(map, 0), contourTargets(map, contours));
    const ms = performance.now() - t0;
    expect(result.maxMissCm).toBeLessThan(10);
    expect(ms).toBeLessThan(15_000);
  }, 30_000);
});

describe('contours in the store', () => {
  const s = () => useMapStore.getState();
  beforeEach(() => {
    s().loadMap(square(), 'm', 'ws');
    s().setHeights(createPatch(square(), 0));
  });

  it('adding creates the Contours layer; edits, closing and deleting are undoable', () => {
    const id = s().addContour([{ x: 10, y: 10 }, { x: 50, y: 10 }, { x: 50, y: 50 }], false, 12_300, 7)!;
    const layer = s().mapData!.layers[s().mapData!.layers.length - 1];
    expect(layer.name).toBe(CONTOUR_LAYER);
    expect(readContours(s().mapData!)[0]).toMatchObject({ id, closed: false, cm: 12_300, reachCells: 7 });
    s().updateContour(id, { closed: true, cm: 15_000, name: 'Knoll' });
    const obj = isObjectLayer(layer) ? s().mapData!.layers.filter(isObjectLayer)[0].objects[0] : null;
    expect(obj?.polygon).toHaveLength(3);
    expect(obj?.polyline).toBeUndefined();
    expect(readContours(s().mapData!)[0]).toMatchObject({ closed: true, cm: 15_000, name: 'Knoll' });
    s().updateContour(id, { points: [{ x: 0, y: 0 }, { x: 5, y: 5 }] }); // too few for a loop: ignored
    expect(readContours(s().mapData!)[0].points).toHaveLength(3);
    s().deleteContour(id);
    expect(readContours(s().mapData!)).toHaveLength(0);
    s().undo();
    s().undo();
    expect(readContours(s().mapData!)[0]).toMatchObject({ closed: false, cm: 12_300 });
    expect(readLines(s().mapData!)).toHaveLength(0); // not a road
  });
});

describe('Height tool in Contour mode', () => {
  const s = () => useMapStore.getState();
  const v = () => useViewStore.getState();
  let clock = 0;
  const click = (x: number, y: number) => {
    clock += 1000; // far apart in time: not a double-click
    const now = Date.now;
    Date.now = () => clock;
    heightTool.onPress(0, 0, s(), { x, y });
    heightTool.onRelease(s());
    Date.now = now;
  };
  beforeEach(() => {
    s().loadMap(square(), 'm', 'ws');
    s().setHeights(createPatch(square(), 0));
    s().setZoom(1);
    s().setHeightBrush({ mode: 'contour', contourCm: 20_000, contourReachCells: 5 });
    v().setDraftLine(null);
    v().selectContour(null);
  });

  it('clicking the first point closes a loop; Enter finishes an open line', () => {
    click(10, 10); click(100, 10); click(100, 100);
    click(12, 11); // on the first point
    const [loop] = readContours(s().mapData!);
    expect(loop).toMatchObject({ closed: true, cm: 20_000, reachCells: 5 });
    expect(loop.points).toHaveLength(3);
    expect(v().selectedContourId).toBe(loop.id);
    expect(s().heights!.cm.every((h) => h === 0)).toBe(true); // drawing doesn't paint

    v().selectContour(null);
    click(200, 200); click(300, 200);
    contourKey('Enter', s());
    expect(readContours(s().mapData!)[1]).toMatchObject({ closed: false });
  });

  it('drag a point, insert at a midpoint (the closing one too), delete a point, then the contour', () => {
    const id = s().addContour([{ x: 10, y: 10 }, { x: 100, y: 10 }, { x: 100, y: 100 }], true, 5_000, 5)!;
    v().selectContour(id);
    heightTool.onPress(0, 0, s(), { x: 100, y: 100 });
    heightTool.onDrag(0, 0, s(), { x: 120, y: 120 });
    heightTool.onRelease(s());
    expect(readContours(s().mapData!)[0].points[2]).toEqual({ x: 120, y: 120 });
    // The closing segment runs from (120, 120) back to (10, 10): its midpoint is (65, 65)
    heightTool.onPress(0, 0, s(), { x: 65, y: 65 });
    heightTool.onRelease(s());
    expect(readContours(s().mapData!)[0].points).toHaveLength(4);
    expect(v().selectedPoint).toBe(3);
    contourKey('Delete', s());
    expect(readContours(s().mapData!)[0].points).toHaveLength(3);
    contourKey('Delete', s()); // no point selected: the whole contour
    expect(readContours(s().mapData!)).toHaveLength(0);
  });

  it('right-click picks the height for new contours', () => {
    s().heights!.cm[2 * 41 + 2] = 777;
    heightTool.onRightPress!(2, 2, s(), { x: 20, y: 20 });
    expect(s().heightBrush).toMatchObject({ mode: 'contour', contourCm: 777 });
  });
});
