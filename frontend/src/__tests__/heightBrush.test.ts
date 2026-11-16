import { describe, it, expect, beforeEach } from 'vitest';
import { applyDab, falloff, cellDistance } from '../utils/heightBrush';
import type { HeightBrush } from '../utils/heightBrush';
import { createPatch } from '../utils/heightGrid';
import type { HeightPatch } from '../utils/heightGrid';
import { hexLayout, hexCenter } from '../canvas/hexGeometry';
import { useMapStore } from '../store/mapStore';
import { heightTool } from '../tools/heightTool';
import type { TmjMap } from '../types/tmj';

const square: TmjMap = {
  orientation: 'orthogonal', width: 4, height: 4, tilewidth: 10, tileheight: 10,
  nextlayerid: 1, nextobjectid: 1, tilesets: [], layers: [],
};
const hex: TmjMap = {
  ...square, orientation: 'hexagonal', width: 5, height: 5, tilewidth: 80, tileheight: 70,
  hexsidelength: 40, staggeraxis: 'x', staggerindex: 'odd',
};
const brush = (b: Partial<HeightBrush>): HeightBrush => ({ mode: 'raise', radius: 1, strengthCm: 100, targetCm: 0, ...b });
const at = (p: HeightPatch, col: number, row: number) => p.cm[row * p.cols + col];

describe('falloff', () => {
  it('is 1 at the centre, 0 at and beyond the radius', () => {
    expect(falloff(0, 2)).toBe(1);
    expect(falloff(1, 2)).toBeCloseTo(0.5625);
    expect(falloff(2, 2)).toBe(0);
    expect(falloff(3, 2)).toBe(0);
  });
});

describe('applyDab on a square map (corner samples)', () => {
  let p: HeightPatch;
  beforeEach(() => { p = createPatch(square, 1000); });

  it('raises the centre fully and neighbours by the falloff', () => {
    applyDab(square, p, 20, 20, brush({ radius: 2 }), () => {});
    expect(at(p, 2, 2)).toBe(1100);
    expect(at(p, 3, 2)).toBe(1056);  // d = 1: 100 * 0.5625, rounded
    expect(at(p, 0, 2)).toBe(1000);  // d = 2: outside
  });

  it('lowers', () => {
    applyDab(square, p, 20, 20, brush({ mode: 'lower' }), () => {});
    expect(at(p, 2, 2)).toBe(900);
  });

  it('sets every sample inside the radius to the target (hard edge)', () => {
    applyDab(square, p, 20, 20, brush({ mode: 'set', radius: 1.5, targetCm: -50 }), () => {});
    expect(at(p, 2, 2)).toBe(-50);
    expect(at(p, 3, 3)).toBe(-50);   // d = 1.41
    expect(at(p, 4, 2)).toBe(1000);  // d = 2
  });

  it('smooths a spike towards its neighbours', () => {
    p.cm[2 * p.cols + 2] = 5000;
    applyDab(square, p, 20, 20, brush({ mode: 'smooth', radius: 0.5 }), () => {});
    expect(at(p, 2, 2)).toBe(3000);  // halfway from 5000 to the neighbour average 1000
  });

  it('marks changed samples hand-set; release clears the mark without changing heights', () => {
    applyDab(square, p, 20, 20, brush({}), () => {});
    expect(p.mask[2 * p.cols + 2]).toBe(1);
    applyDab(square, p, 20, 20, brush({ mode: 'release' }), () => {});
    expect(p.mask[2 * p.cols + 2]).toBe(0);
    expect(at(p, 2, 2)).toBe(1100);
  });

  it('raise protects only samples it actually changes; set protects all it covers', () => {
    applyDab(square, p, 20, 20, brush({ radius: 2, strengthCm: 1 }), () => {});
    // falloff rounds the 1 cm raise to 0 away from the centre: those stay unprotected
    expect(Array.from(p.mask).filter(Boolean)).toHaveLength(Array.from(p.cm).filter((v) => v !== 1000).length);
    const q = createPatch(square, 1000);
    applyDab(square, q, 20, 20, brush({ mode: 'set', radius: 1.5, targetCm: 1000 }), () => {});
    expect(Array.from(q.mask).filter(Boolean)).toHaveLength(9);
  });

  it('reports each changed sample once and returns the changed rectangle', () => {
    const seen: number[] = [];
    const rect = applyDab(square, p, 20, 20, brush({ radius: 2 }), (i) => seen.push(i));
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toContain(2 * p.cols + 2);
    expect(rect).toEqual({ c0: 1, r0: 1, c1: 3, r1: 3 });
  });

  it('returns null when nothing changes and clamps to int32', () => {
    // Setting a sample to its own height still marks it hand-set the first time...
    expect(applyDab(square, p, 20, 20, brush({ mode: 'set', targetCm: 1000 }), () => {})).not.toBeNull();
    // ...after which the same dab changes nothing
    expect(applyDab(square, p, 20, 20, brush({ mode: 'set', targetCm: 1000 }), () => {})).toBeNull();
    p.cm[2 * p.cols + 2] = 2_147_483_600;
    applyDab(square, p, 20, 20, brush({ strengthCm: 1000 }), () => {});
    expect(at(p, 2, 2)).toBe(2_147_483_647);
  });
});

describe('applyDab on a hex map (centre samples)', () => {
  it('a radius of 1 reaches only the hex itself; 1.5 reaches its six neighbours', () => {
    const layout = hexLayout(hex);
    const c = hexCenter(layout, 2, 2);
    const p1 = createPatch(hex, 0);
    applyDab(hex, p1, c.x, c.y, brush({ mode: 'set', radius: 1, targetCm: 7 }), () => {});
    expect(Array.from(p1.cm).filter((v) => v === 7)).toHaveLength(1);
    const p2 = createPatch(hex, 0);
    applyDab(hex, p2, c.x, c.y, brush({ mode: 'set', radius: 1.5, targetCm: 7 }), () => {});
    expect(Array.from(p2.cm).filter((v) => v === 7)).toHaveLength(7);
  });
});

describe('cellDistance', () => {
  it('measures in cells', () => {
    expect(cellDistance(square, { x: 0, y: 0 }, { x: 30, y: 40 })).toBe(5);
  });
});

describe('strokes and undo', () => {
  beforeEach(() => {
    const s = useMapStore.getState();
    s.loadMap(square, 'm', 'ws');
    s.setHeights(createPatch(square, 1000));
    s.setHeightBrush({ mode: 'raise', radius: 1, strengthCm: 100 });
  });

  it('a press-drag-release stroke is one undo step; undo and redo restore heights and mask', () => {
    const store = () => useMapStore.getState();
    heightTool.onPress(0, 0, store(), { x: 10, y: 10 });
    heightTool.onDrag(0, 0, store(), { x: 30, y: 10 });   // 2 cells away: a second dab
    heightTool.onRelease(store());
    const p = store().heights!;
    expect(at(p, 1, 1)).toBe(1100);
    expect(at(p, 3, 1)).toBe(1100);
    expect(store().past.filter((st) => st.type === 'heights')).toHaveLength(1);
    expect(store().heightsDirty && store().isDirty).toBe(true);
    expect(p.rangeCheck).toBe(true); // overlay rebuilds only if the min/max moved

    store().undo();
    expect(p.dirtyRect).toEqual({ c0: 1, r0: 1, c1: 3, r1: 1 }); // only the stroke's area is redrawn
    expect(at(p, 1, 1)).toBe(1000);
    expect(p.mask[1 * p.cols + 1]).toBe(0);
    store().redo();
    expect(at(p, 3, 1)).toBe(1100);
    expect(p.mask[1 * p.cols + 3]).toBe(1);
  });

  it('dabs closer than the spacing are skipped', () => {
    const store = () => useMapStore.getState();
    heightTool.onPress(0, 0, store(), { x: 10, y: 10 });
    heightTool.onDrag(0, 0, store(), { x: 11, y: 10 });   // 0.1 cell: below the spacing
    heightTool.onRelease(store());
    expect(at(store().heights!, 1, 1)).toBe(1100);
  });

  it('painting records the changed area for the overlay', () => {
    useMapStore.getState().applyHeightDab(20, 20);
    expect(useMapStore.getState().heights!.dirtyRect).toEqual({ c0: 2, r0: 2, c1: 2, r1: 2 });
  });

  it('replacing the patch drops height undo steps', () => {
    const store = () => useMapStore.getState();
    heightTool.onPress(0, 0, store(), { x: 10, y: 10 });
    heightTool.onRelease(store());
    store().addElevation(0);
    expect(store().past.filter((st) => st.type === 'heights')).toHaveLength(0);
  });

  it('right-click picks the height under the pointer as the Set target', () => {
    const store = () => useMapStore.getState();
    store().heights!.cm[2 * 5 + 2] = 4321;
    heightTool.onRightPress?.(0, 0, store(), { x: 20, y: 20 });
    expect(store().heightBrush.mode).toBe('set');
    expect(store().heightBrush.targetCm).toBe(4321);
  });
});
