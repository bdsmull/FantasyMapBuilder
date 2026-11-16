import { describe, it, expect } from 'vitest';
import {
  placeChild, blendWeight, pixelToCell, cellToPixel, placedChildren, computeOverrides, surfaceAt, displayPatch,
} from '../utils/worldSurface';
import type { SurfaceSource } from '../utils/worldSurface';
import { createPatch } from '../utils/heightGrid';
import { hexLayout, hexCenter } from '../canvas/hexGeometry';
import type { TmjMap } from '../types/tmj';
import type { WorldSetNode } from '../types/worldSet';

const square = (w: number, h: number, extra: Partial<TmjMap> = {}): TmjMap => ({
  orientation: 'orthogonal', width: w, height: h, tilewidth: 16, tileheight: 16,
  nextlayerid: 1, nextobjectid: 1, tilesets: [], layers: [], ...extra,
});
const hex = (w: number, h: number): TmjMap => ({
  ...square(w, h), orientation: 'hexagonal', tilewidth: 80, tileheight: 70,
  hexsidelength: 40, staggeraxis: 'x', staggerindex: 'odd',
});
const node = (mapName: string, parentMapName: string | null, col = 0, row = 0, z = 0): WorldSetNode => ({
  mapName, parentMapName, parentAnchor: parentMapName ? { col, row } : null, z,
});

/** Parent 10x10 cells of 10 m; child 20x20 cells of 1 m (2 x 2 parent cells) anchored at (5, 5). */
function scene(childCm = 1000, extraNodes: WorldSetNode[] = [], extraSources: Record<string, SurfaceSource> = {}) {
  const parent = square(10, 10);
  const child = square(20, 20);
  const sources: Record<string, SurfaceSource> = {
    child: { map: child, mpu: 1, patch: createPatch(child, childCm) },
    ...extraSources,
  };
  const nodes = [node('parent', null), node('child', 'parent', 5, 5), ...extraNodes];
  const children = placedChildren('parent', 10, nodes, (n) => sources[n]);
  return { parent, own: createPatch(parent, 0), children, nodes, sources };
}

describe('placeChild', () => {
  it('centres the real rectangle inside the footprint and caps the band', () => {
    // 10 cells of 1 m on 4 m cells: 2.5 parent cells, footprint cols 4..6
    const p = placeChild(10, 10, 1, 4, { col: 5, row: 5 });
    expect(p.width).toBe(2.5);
    expect(p.left).toBe(4.25);
    expect(p.scale).toBe(4);
    expect(p.band).toBe(0.625); // a quarter of 2.5, below the one-cell cap
    expect(placeChild(40, 40, 1, 4, { col: 5, row: 5 }).band).toBe(1);
  });
});

describe('blendWeight', () => {
  const p = { left: 0, top: 0, width: 4, height: 4, scale: 1, band: 1 };
  it('is 0 outside, eases in across the band, 1 beyond it', () => {
    expect(blendWeight(p, -0.1, 2)).toBe(0);
    expect(blendWeight(p, 0.5, 2)).toBeCloseTo(0.5);
    expect(blendWeight(p, 2, 2)).toBe(1);
  });
});

describe('cell space', () => {
  it('square cells are tile-sized; hex centres sit at half-cells', () => {
    expect(pixelToCell(square(4, 4), 24, 8)).toEqual({ u: 1.5, v: 0.5 });
    const h = hex(5, 5);
    const c = hexCenter(hexLayout(h), 2, 2);
    const cell = pixelToCell(h, c.x, c.y);
    expect(cell.u).toBeCloseTo(2.5);
    expect(cell.v).toBeCloseTo(2.5);
    const back = cellToPixel(h, cell.u, cell.v);
    expect(back.x).toBeCloseTo(c.x);
    expect(back.y).toBeCloseTo(c.y);
  });
});

describe('computeOverrides (square parent)', () => {
  it('replaces samples inside the child, mixes partly covered ones, leaves the rest', () => {
    const { parent, own, children } = scene();
    const ov = computeOverrides(parent, own.cols, own.rows, children);
    const at = (col: number, row: number) => {
      const k = Array.from(ov.index).indexOf(row * own.cols + col);
      return k < 0 ? null : { keep: ov.keep[k], add: ov.add[k] };
    };
    // Child covers cells 4..5 (corners 4..6). The centre corner (5, 5) is all child
    expect(at(5, 5)!.keep).toBeCloseTo(0);
    expect(at(5, 5)!.add).toBeCloseTo(1000);
    // A corner of the child: a quarter of its window, and that part is in the band
    const corner = at(4, 4)!;
    expect(corner.keep).toBeGreaterThan(0.75);
    expect(corner.add).toBeGreaterThan(0);
    expect(corner.add).toBeLessThan(250);
    expect(at(2, 2)).toBeNull();
  });

  it('ignores children off the ground level or without heights', () => {
    const { children } = scene(1000, [node('cave', 'parent', 2, 2, -1), node('bare', 'parent', 8, 8)], {
      cave: { map: square(20, 20), mpu: 1, patch: createPatch(square(20, 20), 99) },
      bare: { map: square(20, 20), mpu: 1, patch: null },
    });
    expect(children.map((c) => c.node.name)).toEqual(['child']);
  });
});

describe('surfaceAt', () => {
  it('reads the child inside it, the parent outside, and names the source', () => {
    const { parent, own, children } = scene(1000);
    expect(surfaceAt(parent, own, children, 80, 80, 'parent')).toEqual({ cm: 1000, source: 'child' });
    expect(surfaceAt(parent, own, children, 16, 16, 'parent')).toEqual({ cm: 0, source: 'parent' });
    // Half-way into the band: an even mix
    const edge = surfaceAt(parent, own, children, 4 * 16 + 4, 80, 'parent');
    expect(edge.cm).toBeCloseTo(500);
  });

  it('includes grandchildren', () => {
    // A 2 x 2 grandchild of 5 m cells (10 x 10 child cells) in the middle of the child
    const grand = square(2, 2);
    const { parent, own, children } = scene(1000, [node('grand', 'child', 10, 10)], {
      grand: { map: grand, mpu: 5, patch: createPatch(grand, 3000) },
    });
    expect(children[0].node.children).toHaveLength(1);
    expect(surfaceAt(parent, own, children, 80, 80, 'parent')).toEqual({ cm: 3000, source: 'grand' });
    // ...and the child's averaged surface (what the parent displays) includes it
    const ov = computeOverrides(parent, own.cols, own.rows, children);
    const k = Array.from(ov.index).indexOf(5 * own.cols + 5);
    expect(ov.add[k]).toBeGreaterThan(1000);
  });
});

describe('computeOverrides (hex parent)', () => {
  it('a hex well inside the child shows the child; staggered columns sit half a row lower', () => {
    const parent = hex(10, 10);
    const child = square(40, 40); // 4 x 4 parent cells: [3, 7] in cell space
    const nodes = [node('parent', null), node('child', 'parent', 5, 5)];
    const children = placedChildren('parent', 10, nodes, () => ({ map: child, mpu: 1, patch: createPatch(child, 700) }));
    const own = createPatch(parent, 0);
    const ov = computeOverrides(parent, own.cols, own.rows, children);
    const shown = displayPatch(own, ov);
    expect(shown.cm[4 * own.cols + 4]).toBe(700);
    expect(shown.cm[4 * own.cols + 5]).toBe(700);
    // Odd column 5, row 6: centre at v = 7, half outside the child
    const k = Array.from(ov.index).indexOf(6 * own.cols + 5);
    expect(ov.keep[k]).toBeGreaterThan(0.4);
    expect(shown.cm[0]).toBe(0);
  });
});

describe('displayPatch', () => {
  it('follows in-place edits of the own patch and hands on the redraw flags', () => {
    const { parent, own, children } = scene(1000);
    const ov = computeOverrides(parent, own.cols, own.rows, children);
    const shown = displayPatch(own, ov);
    expect(shown).not.toBe(own);
    expect(shown.cm[5 * own.cols + 5]).toBe(1000);
    expect(displayPatch(own, ov)).toBe(shown); // reused while nothing changes

    // Paint the parent: outside the child it shows; under the child the child still wins
    own.cm[1 * own.cols + 1] = 400;
    own.cm[5 * own.cols + 5] = 400;
    own.dirtyRect = { c0: 1, r0: 1, c1: 5, r1: 5 };
    own.rangeCheck = true;
    displayPatch(own, ov);
    expect(shown.cm[1 * own.cols + 1]).toBe(400);
    expect(shown.cm[5 * own.cols + 5]).toBe(1000);
    expect(shown.dirtyRect).toEqual({ c0: 1, r0: 1, c1: 5, r1: 5 });
    expect(shown.rangeCheck).toBe(true);
    expect(own.dirtyRect).toBeNull();
    expect(own.rangeCheck).toBe(false);
  });

  it('is the own patch when nothing overrides it', () => {
    const own = createPatch(square(2, 2), 0);
    expect(displayPatch(own, null)).toBe(own);
  });
});
