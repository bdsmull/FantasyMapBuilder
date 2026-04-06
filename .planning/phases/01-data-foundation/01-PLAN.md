# Phase 1: Data Foundation — Plan

**Phase goal:** The pure data layer for World Sets exists — types are defined, scale values are correct, and computation utilities produce verifiable results with no UI or server needed.
**Requirements:** DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06

---

## Plans

### Plan 1: Scale Values and Map Types
**Goal:** `MapScale` has `feetPerUnit` on all 8 presets, `TmjMap` accepts `feetPerUnit?: number`, and `WorldSetNode`/`WorldSet` types exist.
**Requirements:** DATA-01, DATA-02, DATA-03, DATA-04

**Files:**
- `frontend/src/data/mapScales.ts` — Add `feetPerUnit: number` to `MapScale` interface; add the value to all 8 preset entries
- `frontend/src/types/tmj.ts` — Add `feetPerUnit?: number` to `TmjMap` interface (after the existing `scale?: string` at line 94)
- `frontend/src/types/worldSet.ts` — New file with `WorldSetNode` and `WorldSet` interfaces

**Tasks:**

1. **Add `feetPerUnit` to `MapScale` interface and all 8 presets** (DATA-01)

   In `frontend/src/data/mapScales.ts`:
   - Add `feetPerUnit: number` to the `MapScale` interface (after the `unit` field, before `defaultShape`)
   - Add the `feetPerUnit` value to every entry in `MAP_SCALES`:

   | id | feetPerUnit |
   |---|---|
   | `room` | `1` |
   | `building` | `5` |
   | `dungeon` | `10` |
   | `town` | `30` |
   | `local` | `5280` |
   | `kingdom` | `26400` |
   | `region` | `264000` |
   | `world` | `2640000` |

   The resulting interface:
   ```typescript
   export interface MapScale {
     id: string;
     label: string;
     unit: string;
     feetPerUnit: number;
     defaultShape: 'tile' | 'hex';
   }
   ```

2. **Add `feetPerUnit` to `TmjMap`** (DATA-02)

   In `frontend/src/types/tmj.ts`, add immediately after the `scale?: string` field (line 94):
   ```typescript
   /** Authoritative feet-per-tile/hex value. Optional for backward compat with older maps. */
   feetPerUnit?: number;
   ```

3. **Create `WorldSetNode` and `WorldSet` types** (DATA-03, DATA-04)

   Create new file `frontend/src/types/worldSet.ts`:
   ```typescript
   /** A single map's placement within a world set. */
   export interface WorldSetNode {
     mapName: string;
     parentMapName: string | null;
     parentAnchor: { col: number; row: number } | null;
     z: number;
     zLabel?: string | null;
   }

   /** A named collection of map nodes forming a hierarchical world. */
   export interface WorldSet {
     name: string;
     version: string;    // "1.0"
     nodes: WorldSetNode[];
   }

   /** Current world set file format version. */
   export const WORLD_SET_VERSION = '1.0';
   ```

**Verification:**
- `cd frontend && npx tsc --noEmit` passes with zero errors
- `MAP_SCALES[0].feetPerUnit` is `1`, `MAP_SCALES[7].feetPerUnit` is `2640000`
- All existing tests still pass: `cd frontend && npx vitest run`

---

### Plan 2: Computation Utilities
**Goal:** `computeFootprint()` and `detectOverlaps()` are implemented as pure functions and exported from a new utility file.
**Requirements:** DATA-05, DATA-06

**Files:**
- `frontend/src/utils/worldSetUtils.ts` — New file with `computeFootprint` and `detectOverlaps`

**Tasks:**

1. **Implement `computeFootprint()`** (DATA-05)

   Create `frontend/src/utils/worldSetUtils.ts` and export:

   ```typescript
   export interface Footprint {
     colMin: number;
     colMax: number;
     rowMin: number;
     rowMax: number;
   }

   /**
    * Compute the footprint of a child map on a parent map's grid.
    *
    * Uses floor-center anchoring: the child is centered on `anchor`,
    * with even-dimension asymmetry going bottom-right.
    */
   export function computeFootprint(
     childWidth: number,
     childHeight: number,
     childFPU: number,
     parentFPU: number,
     anchor: { col: number; row: number },
   ): Footprint {
     const fpCols = Math.ceil((childWidth * childFPU) / parentFPU);
     const fpRows = Math.ceil((childHeight * childFPU) / parentFPU);

     const colMin = anchor.col - Math.floor(fpCols / 2);
     const colMax = anchor.col + Math.floor((fpCols - 1) / 2);
     const rowMin = anchor.row - Math.floor(fpRows / 2);
     const rowMax = anchor.row + Math.floor((fpRows - 1) / 2);

     return { colMin, colMax, rowMin, rowMax };
   }
   ```

   Key behaviors:
   - Odd dimension (e.g. fpCols=3): symmetric around anchor. `floor(3/2)=1` left, `floor(2/2)=1` right.
   - Even dimension (e.g. fpCols=4): asymmetric bottom-right. `floor(4/2)=2` left, `floor(3/2)=1` right. Wait — that gives 2 left, 1 right = 4 cells total. Anchor is at index 2 from left. Correct per spec.
   - 1x1 footprint: colMin=colMax=anchor.col, rowMin=rowMax=anchor.row.

2. **Implement `detectOverlaps()`** (DATA-06)

   In the same file, add:

   ```typescript
   export interface FootprintedNode {
     mapName: string;
     z: number;
     footprint: Footprint;
   }

   /**
    * Find all pairs of nodes at the same Z level whose footprints overlap.
    * Accepts pre-computed footprints to avoid redundant calculation.
    * Returns array of [mapNameA, mapNameB] pairs (alphabetically ordered).
    */
   export function detectOverlaps(
     nodes: FootprintedNode[],
   ): [string, string][] {
     const overlaps: [string, string][] = [];

     for (let i = 0; i < nodes.length; i++) {
       for (let j = i + 1; j < nodes.length; j++) {
         const a = nodes[i];
         const b = nodes[j];

         // Only check nodes at the same Z level
         if (a.z !== b.z) continue;

         // AABB intersection test
         const intersects =
           a.footprint.colMin <= b.footprint.colMax &&
           a.footprint.colMax >= b.footprint.colMin &&
           a.footprint.rowMin <= b.footprint.rowMax &&
           a.footprint.rowMax >= b.footprint.rowMin;

         if (intersects) {
           // Alphabetical ordering for consistent output
           const pair: [string, string] =
             a.mapName < b.mapName
               ? [a.mapName, b.mapName]
               : [b.mapName, a.mapName];
           overlaps.push(pair);
         }
       }
     }

     return overlaps;
   }
   ```

**Verification:**
- `cd frontend && npx tsc --noEmit` passes with zero errors
- All existing tests still pass: `cd frontend && npx vitest run`

---

### Plan 3: Vitest Tests for Utilities
**Goal:** Comprehensive test coverage for `computeFootprint` and `detectOverlaps` proving correctness of the math and edge cases.
**Requirements:** DATA-05, DATA-06 (verification)

**Files:**
- `frontend/src/__tests__/worldSetUtils.test.ts` — New test file

**Tasks:**

1. **Write tests for `computeFootprint`**

   Create `frontend/src/__tests__/worldSetUtils.test.ts` following the project's Vitest style (see `fillTool.test.ts`). Test cases:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { computeFootprint, detectOverlaps, FootprintedNode } from '../utils/worldSetUtils';

   describe('computeFootprint', () => {
     it('odd x odd footprint is symmetric around anchor', () => {
       // 3x3 child at 10 fpu, parent at 10 fpu => fp 3x3
       // anchor (5,5) => col 4..6, row 4..6
       const fp = computeFootprint(3, 3, 10, 10, { col: 5, row: 5 });
       expect(fp).toEqual({ colMin: 4, colMax: 6, rowMin: 4, rowMax: 6 });
     });

     it('even x even footprint has bottom-right asymmetry', () => {
       // 4x4 child at 10 fpu, parent at 10 fpu => fp 4x4
       // anchor (5,5): colMin=5-2=3, colMax=5+1=6, rowMin=3, rowMax=6
       const fp = computeFootprint(4, 4, 10, 10, { col: 5, row: 5 });
       expect(fp).toEqual({ colMin: 3, colMax: 6, rowMin: 3, rowMax: 6 });
     });

     it('odd x even footprint (mixed dimensions)', () => {
       // 3 wide x 4 tall, fpu 10/10 => fp 3x4
       // col: 5-1=4..5+1=6  row: 5-2=3..5+1=6
       const fp = computeFootprint(3, 4, 10, 10, { col: 5, row: 5 });
       expect(fp).toEqual({ colMin: 4, colMax: 6, rowMin: 3, rowMax: 6 });
     });

     it('1x1 footprint collapses to the anchor cell', () => {
       // 1x1 child at same scale => fp 1x1
       const fp = computeFootprint(1, 1, 10, 10, { col: 3, row: 7 });
       expect(fp).toEqual({ colMin: 3, colMax: 3, rowMin: 7, rowMax: 7 });
     });

     it('scale ratio causes ceiling to round up', () => {
       // 10x10 child at 5 fpu on parent at 30 fpu
       // fpCols = ceil(10*5/30) = ceil(1.667) = 2
       // anchor (5,5): colMin=5-1=4, colMax=5+0=5
       const fp = computeFootprint(10, 10, 5, 30, { col: 5, row: 5 });
       expect(fp).toEqual({ colMin: 4, colMax: 5, rowMin: 4, rowMax: 5 });
     });

     it('large child on small parent produces large footprint', () => {
       // 100x100 child at 5280 fpu on parent at 30 fpu
       // fpCols = ceil(100*5280/30) = ceil(17600) = 17600
       // colMin = 0 - floor(17600/2) = -8800
       // colMax = 0 + floor(17599/2) = 8799
       const fp = computeFootprint(100, 100, 5280, 30, { col: 0, row: 0 });
       expect(fp.colMin).toBe(-8800);
       expect(fp.colMax).toBe(8799);
       expect(fp.colMax - fp.colMin + 1).toBe(17600);
     });

     it('anchor at origin (0,0) works correctly', () => {
       // 3x3 fp at origin => col -1..1, row -1..1
       const fp = computeFootprint(3, 3, 10, 10, { col: 0, row: 0 });
       expect(fp).toEqual({ colMin: -1, colMax: 1, rowMin: -1, rowMax: 1 });
     });
   });
   ```

2. **Write tests for `detectOverlaps`**

   In the same file, add:

   ```typescript
   describe('detectOverlaps', () => {
     it('returns empty for non-overlapping nodes at same Z', () => {
       const nodes: FootprintedNode[] = [
         { mapName: 'a', z: 0, footprint: { colMin: 0, colMax: 2, rowMin: 0, rowMax: 2 } },
         { mapName: 'b', z: 0, footprint: { colMin: 5, colMax: 7, rowMin: 5, rowMax: 7 } },
       ];
       expect(detectOverlaps(nodes)).toEqual([]);
     });

     it('detects overlapping nodes at same Z', () => {
       const nodes: FootprintedNode[] = [
         { mapName: 'a', z: 0, footprint: { colMin: 0, colMax: 3, rowMin: 0, rowMax: 3 } },
         { mapName: 'b', z: 0, footprint: { colMin: 2, colMax: 5, rowMin: 2, rowMax: 5 } },
       ];
       expect(detectOverlaps(nodes)).toEqual([['a', 'b']]);
     });

     it('does NOT detect overlap for nodes at different Z levels', () => {
       const nodes: FootprintedNode[] = [
         { mapName: 'a', z: 0, footprint: { colMin: 0, colMax: 3, rowMin: 0, rowMax: 3 } },
         { mapName: 'b', z: 1, footprint: { colMin: 0, colMax: 3, rowMin: 0, rowMax: 3 } },
       ];
       expect(detectOverlaps(nodes)).toEqual([]);
     });

     it('detects overlap when nodes share the same anchor', () => {
       const nodes: FootprintedNode[] = [
         { mapName: 'a', z: 0, footprint: { colMin: 4, colMax: 6, rowMin: 4, rowMax: 6 } },
         { mapName: 'b', z: 0, footprint: { colMin: 4, colMax: 6, rowMin: 4, rowMax: 6 } },
       ];
       expect(detectOverlaps(nodes)).toEqual([['a', 'b']]);
     });

     it('detects edge-touching as overlap (shared boundary)', () => {
       const nodes: FootprintedNode[] = [
         { mapName: 'a', z: 0, footprint: { colMin: 0, colMax: 2, rowMin: 0, rowMax: 2 } },
         { mapName: 'b', z: 0, footprint: { colMin: 2, colMax: 4, rowMin: 2, rowMax: 4 } },
       ];
       // They share cell (2,2), so they overlap
       expect(detectOverlaps(nodes)).toEqual([['a', 'b']]);
     });

     it('returns pairs in alphabetical order', () => {
       const nodes: FootprintedNode[] = [
         { mapName: 'z-map', z: 0, footprint: { colMin: 0, colMax: 3, rowMin: 0, rowMax: 3 } },
         { mapName: 'a-map', z: 0, footprint: { colMin: 0, colMax: 3, rowMin: 0, rowMax: 3 } },
       ];
       expect(detectOverlaps(nodes)).toEqual([['a-map', 'z-map']]);
     });

     it('handles multiple overlapping pairs', () => {
       const nodes: FootprintedNode[] = [
         { mapName: 'a', z: 0, footprint: { colMin: 0, colMax: 5, rowMin: 0, rowMax: 5 } },
         { mapName: 'b', z: 0, footprint: { colMin: 3, colMax: 8, rowMin: 3, rowMax: 8 } },
         { mapName: 'c', z: 0, footprint: { colMin: 4, colMax: 6, rowMin: 4, rowMax: 6 } },
       ];
       const result = detectOverlaps(nodes);
       expect(result).toHaveLength(3); // a-b, a-c, b-c
       expect(result).toContainEqual(['a', 'b']);
       expect(result).toContainEqual(['a', 'c']);
       expect(result).toContainEqual(['b', 'c']);
     });

     it('returns empty for empty input', () => {
       expect(detectOverlaps([])).toEqual([]);
     });

     it('returns empty for single node', () => {
       const nodes: FootprintedNode[] = [
         { mapName: 'a', z: 0, footprint: { colMin: 0, colMax: 3, rowMin: 0, rowMax: 3 } },
       ];
       expect(detectOverlaps(nodes)).toEqual([]);
     });
   });
   ```

**Verification:**
- `cd frontend && npx vitest run src/__tests__/worldSetUtils.test.ts` — all tests pass
- `cd frontend && npx vitest run` — all existing tests still pass (no regressions)
- `cd frontend && npx tsc --noEmit` — no type errors
