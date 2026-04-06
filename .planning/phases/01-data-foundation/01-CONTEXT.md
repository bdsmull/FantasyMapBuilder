# Phase 1: Data Foundation — Context

**Gathered:** 2026-04-06
**Status:** Ready for planning
**Source:** Design session (docs/world-sets-design.md + 6-issue review)

<domain>
## Phase Boundary

Phase 1 delivers the pure data layer for World Sets — no UI, no server, no React components. Specifically:

1. Add `feetPerUnit: number` to the `MapScale` interface and populate all 8 presets with correct values
2. Add `feetPerUnit?: number` to `TmjMap` — the canonical scale value stored per map
3. Define `WorldSetNode` and `WorldSet` TypeScript types in a new `frontend/src/types/worldSet.ts`
4. Implement `computeFootprint()` utility function
5. Implement `detectOverlaps()` utility function

Nothing that touches the server, the Zustand store, or any component is in scope for this phase.

</domain>

<decisions>
## Implementation Decisions

### `feetPerUnit` on `TmjMap` (not `scaleId` on `WorldSetNode`)

- `TmjMap` gets `feetPerUnit?: number` — the canonical feet-per-tile/hex value for this map
- **Rationale:** Map is self-describing; custom values are possible; no lookup needed at render time
- When a `MapScale` preset is selected in the UI (future phase), `map.feetPerUnit` is set to `scale.feetPerUnit`
- `TmjMap.scale?: string` (already exists) is kept for display purposes; `feetPerUnit` is the authoritative value for math
- Older maps without `feetPerUnit` must load without error — field is optional

### `MapScale.feetPerUnit` values (all 8 presets)

| Scale ID | feetPerUnit | Notes |
|---|---|---|
| `room` | 1 | 1' square |
| `building` | 5 | 5' square |
| `dungeon` | 10 | 10' square |
| `town` | 30 | 30' hex |
| `local` | 5280 | 1 mile hex |
| `kingdom` | 26400 | 5 mile hex |
| `region` | 264000 | 50 mile hex |
| `world` | 2640000 | 500 mile hex |

### `WorldSetNode` type — no `scaleId`

The node stores the relationship between maps (parent, anchor, Z). Scale is on the map itself.

```typescript
export interface WorldSetNode {
  mapName: string;
  parentMapName: string | null;
  parentAnchor: { col: number; row: number } | null;
  z: number;
  zLabel?: string | null;
}
```

Invariants (enforced by store in Phase 3, not by these types):
- `parentAnchor` is set iff `parentMapName` is set
- No cycles (forest of directed trees)
- Each `mapName` appears at most once per world set

### `WorldSet` type

```typescript
export interface WorldSet {
  name: string;
  version: string;   // "1.0"
  nodes: WorldSetNode[];
}
```

### `computeFootprint()` — floor-center anchoring

```
fp_cols = ceil(childWidth  * childFPU / parentFPU)
fp_rows = ceil(childHeight * childFPU / parentFPU)

col_min = anchor.col - floor(fp_cols / 2)
col_max = anchor.col + floor((fp_cols - 1) / 2)
row_min = anchor.row - floor(fp_rows / 2)
row_max = anchor.row + floor((fp_rows - 1) / 2)
```

- Even-dimension asymmetry goes bottom-right (matches design spec)
- Hex parents use the same formula treating hex coords as rectangular (accepted approximation)
- Function signature: `computeFootprint(childWidth: number, childHeight: number, childFPU: number, parentFPU: number, anchor: {col: number, row: number}): {colMin: number, colMax: number, rowMin: number, rowMax: number}`

### `detectOverlaps()` — same-Z intersection check

- Compares all pairs of nodes at the same Z level
- Two footprints overlap if their rectangles intersect (standard AABB intersection)
- Returns array of overlapping pairs: `[mapNameA, mapNameB][]`
- Requires loaded map data to compute footprints (childWidth, childHeight, childFPU)
- Function should accept pre-computed footprints to avoid redundant computation

### File locations

- `frontend/src/types/worldSet.ts` — new file (WorldSetNode, WorldSet types)
- `frontend/src/data/mapScales.ts` — modify MapScale interface + all 8 preset entries + add computeFootprint + detectOverlaps
- `frontend/src/types/tmj.ts` — add `feetPerUnit?: number` to TmjMap interface

### Claude's Discretion

- Where to put `computeFootprint` and `detectOverlaps`: the design doc puts them in `mapScales.ts` (task 1). This is reasonable since they depend on `feetPerUnit`. Alternatively they could go in a new `frontend/src/utils/worldSetUtils.ts`. Either is acceptable — keep them colocated with the types they operate on.
- Export structure for the new types file
- Whether to export a `WORLD_SET_VERSION = "1.0"` constant

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design Spec
- `docs/world-sets-design.md` — Full design spec including data model, file format, footprint math, validation rules, and original task list

### Existing Files to Modify
- `frontend/src/data/mapScales.ts` — Current MapScale interface (no feetPerUnit yet); 8 presets; scaleLabel helper
- `frontend/src/types/tmj.ts` — TmjMap interface (has `scale?: string` at line 94; needs `feetPerUnit?: number` added)

### Existing Tests (for test style reference)
- `frontend/src/__tests__/mapStore.test.ts` — Vitest test style reference
- `frontend/src/__tests__/fillTool.test.ts` — Pure function test style reference

### Requirements
- `.planning/REQUIREMENTS.md` — DATA-01 through DATA-06 (lines covering Data Model section)

</canonical_refs>

<specifics>
## Specific Ideas

- The `computeFootprint` formula comes directly from `docs/world-sets-design.md` (Footprint Calculation section) — implement exactly as specified
- `feetPerUnit` values in the table above come from the design doc's "Updated MapScale" table
- The `WorldSet.version` field should be `"1.0"` — literal string matching the spec's example JSON
- Tests for `computeFootprint` must cover: odd×odd dimensions, even×even, odd×even, and fp=1×1 edge case
- Tests for `detectOverlaps` must cover: non-overlapping, overlapping, same-anchor, different Z (should not overlap)

</specifics>

<deferred>
## Deferred Ideas

- Writing `feetPerUnit` back to map when a scale preset is selected — this is UI work (Phase 4+)
- Cycle detection algorithm — implemented in the store (Phase 3)
- Validation warnings (scale inversion, overlap) — store-level concern (Phase 3)
- `detectOverlaps` being called reactively — Phase 3 store concern

</deferred>

---
*Phase: 01-data-foundation*
*Context gathered: 2026-04-06 from design session*
