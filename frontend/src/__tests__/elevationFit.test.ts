import { describe, it, expect } from 'vitest';
import { edgeFit, isMismatch, rebasedHeights, rebaseShiftRange } from '../utils/elevationFit';
import { placeChild, sampleCell } from '../utils/worldSurface';
import { createPatch } from '../utils/heightGrid';
import type { HeightPatch } from '../utils/heightGrid';
import { useMapStore } from '../store/mapStore';
import { getWarnings } from '../utils/hierarchyPanelLogic';
import { describeFit } from '../components/useEdgeFits';
import type { TmjMap } from '../types/tmj';

const square = (w: number, h: number): TmjMap => ({
  orientation: 'orthogonal', width: w, height: h, tilewidth: 16, tileheight: 16,
  nextlayerid: 1, nextobjectid: 1, tilesets: [], layers: [],
});

// Parent: 10 x 10 cells of 10 m, rising 1 m per parent cell eastwards (cm = 100 * col)
const parent = square(10, 10);
const parentPatch = (() => {
  const p = createPatch(parent, 0);
  for (let i = 0; i < p.cm.length; i++) p.cm[i] = 100 * (i % p.cols);
  return p;
})();
// Child: 20 x 20 cells of 1 m (2 x 2 parent cells) anchored at (5, 5): cells [4, 6] of the parent
const child = square(20, 20);
const place = placeChild(20, 20, 1, 10, { col: 5, row: 5 });
const flatChild = (cm: number): HeightPatch => createPatch(child, cm);

describe('edgeFit', () => {
  it('measures parent minus child over the edge band, with a plane through the slope', () => {
    const fit = edgeFit(child, flatChild(0), place, parent, parentPatch)!;
    // Under the child the parent is 400 + 10 * u cm (u = child cells)
    expect(fit.meanDiffCm).toBeCloseTo(500);
    expect(fit.plane.a).toBeCloseTo(400);
    expect(fit.plane.b).toBeCloseTo(10);
    expect(fit.plane.c).toBeCloseTo(0);
    // Only the edge band: not the interior samples
    expect(fit.samples).toBeLessThan(21 * 21);
    expect(fit.samples).toBeGreaterThan(4 * 20);
  });

  it('is negative when the child sits above the parent', () => {
    expect(edgeFit(child, flatChild(5000), place, parent, parentPatch)!.meanDiffCm).toBeCloseTo(-4500);
  });
});

describe('isMismatch', () => {
  it('flags an average difference beyond one parent contour band', () => {
    const fit = edgeFit(child, flatChild(0), place, parent, parentPatch);
    expect(isMismatch(fit, 1000)).toBe(false);
    expect(isMismatch(fit, 200)).toBe(true);
    expect(isMismatch(null, 1)).toBe(false);
  });
});

describe('re-base', () => {
  it('offset shifts every sample by the average difference, keeping the shape', () => {
    const patch = flatChild(0);
    patch.cm[0] = 77;
    const fit = edgeFit(child, patch, place, parent, parentPatch)!;
    const out = rebasedHeights(child, patch, fit, false);
    const shift = Math.round(fit.meanDiffCm);
    expect(out[0]).toBe(77 + shift);
    expect(out[5]).toBe(shift);
    expect(rebaseShiftRange(child, patch, fit, false)).toEqual({ min: fit.meanDiffCm, max: fit.meanDiffCm });
  });

  it('tilt follows the parent slope, after which the edges fit', () => {
    const patch = flatChild(0);
    const fit = edgeFit(child, patch, place, parent, parentPatch)!;
    const out = rebasedHeights(child, patch, fit, true);
    const { u } = sampleCell(child, 20, 0);
    expect(out[20]).toBe(Math.round(400 + 10 * u));
    const after = edgeFit(child, { ...patch, cm: out }, place, parent, parentPatch)!;
    expect(after.meanAbsDiffCm).toBeLessThan(1);
    const range = rebaseShiftRange(child, patch, fit, true);
    expect(range.min).toBeCloseTo(400);
    expect(range.max).toBeCloseTo(600);
  });
});

describe('replaceHeights (store)', () => {
  it('is one undo step that restores every sample and keeps the marks', () => {
    const s = () => useMapStore.getState();
    s().loadMap(square(2, 2), 'm', 'ws');
    s().setHeights(createPatch(square(2, 2), 100));
    s().heights!.mask[0] = 1;
    s().replaceHeights(new Int32Array(9).fill(250));
    expect(Array.from(s().heights!.cm)).toEqual(new Array(9).fill(250));
    expect(s().heights!.mask[0]).toBe(1);
    expect(s().heightsDirty && s().isDirty).toBe(true);
    expect(s().past).toHaveLength(1);
    s().undo();
    expect(Array.from(s().heights!.cm)).toEqual(new Array(9).fill(100));
    expect(s().heights!.fullRefresh).toBe(true);
    s().redo();
    expect(s().heights!.cm[4]).toBe(250);
  });

  it('ignores a grid of the wrong size', () => {
    const s = () => useMapStore.getState();
    s().loadMap(square(2, 2), 'm', 'ws');
    s().setHeights(createPatch(square(2, 2), 100));
    s().replaceHeights(new Int32Array(4));
    expect(s().past).toHaveLength(0);
  });
});

describe('mismatch wording and warning', () => {
  it('describes the direction when the edges are consistently off', () => {
    const fit = edgeFit(child, flatChild(0), place, parent, parentPatch)!;
    expect(describeFit(fit, 'region', 'metric')).toBe("edges average 5 m below 'region'");
    const above = edgeFit(child, flatChild(5000), place, parent, parentPatch)!;
    expect(describeFit(above, 'region', 'metric')).toBe("edges average 45 m above 'region'");
    const tilted = rebasedHeights(child, flatChild(0), fit, true);
    const matched = edgeFit(child, { ...flatChild(0), cm: tilted }, place, parent, parentPatch)!;
    expect(describeFit(matched, 'region', 'metric')).toBe("edges match 'region'");
  });

  it('shows in the hierarchy panel warnings', () => {
    const node = { mapName: 'valley', parentMapName: null, parentAnchor: null, z: 0 };
    const warnings = getWarnings(node, {
      mapDataCache: { valley: { ...square(2, 2), metersPerUnit: 1 } },
      knownMapNames: new Set(['valley']),
      allNodes: [node],
      elevationMismatch: { valley: "edges average 5 m below 'region'" },
    });
    expect(warnings).toEqual(["Elevation mismatch: edges average 5 m below 'region'"]);
  });
});
