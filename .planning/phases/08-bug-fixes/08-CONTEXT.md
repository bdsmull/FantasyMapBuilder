# Phase 8: Bug Fixes — Context

**Gathered:** 2026-06-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 8 fixes three specific known bugs in the map editor:

1. **BUG-01** — `MapPropertiesDialog` scale picker shows all scales regardless of map type; should filter to compatible scales only (tile scales for orthogonal maps, hex scales for hex maps)
2. **BUG-02** — World Set warning badge for a "missing scale" node does not clear after correcting that map's scale via Map Properties; requires a page reload
3. **BUG-03** — Hex child map footprint overlay is drawn as a bounding rectangle; should trace actual hex cell perimeter geometry

No new features. All three fixes are isolated to existing components.

</domain>

<decisions>
## Implementation Decisions

### BUG-01: Scale Picker Filtering

- **D-01:** Filter `MAP_SCALES` by `defaultShape`: show only `'tile'` scales for orthogonal maps, only `'hex'` scales for hexagonal maps. Use `mapData.orientation === 'hexagonal'` as the discriminant.
- **D-02:** If the map's currently-saved scale is **incompatible** with its orientation (e.g., a hex map with `scale: 'room'`):
  - Include the incompatible scale as a **disabled `<option>`** (rendered in the list, greyed/unclickable, but pre-selected as the initial value so it shows in the `<select>` display)
  - Show a visible warning note in the dialog body explaining the incompatibility (e.g., "This scale is not compatible with hex maps. Select a valid hex scale to correct it.")
  - User must explicitly change to a compatible scale; no silent auto-correction

### BUG-02: Warning Badge Reactivity

- **D-03:** The warning badge must clear only after **successful disk save** — not optimistically when scale changes in the store. Matches "after correcting scale… and saving" in BUG-02.
- **D-04 (Claude's Discretion):** How `mapStore` signals the save to `WorldHierarchyPanel` is left to the planner. Clean options: a `savedVersion: number` counter on `mapStore` that the hierarchy panel subscribes to; when the counter changes, bust `mapDataCache[currentMapName]` and re-fetch. Alternative: `lastSavedMapName: string | null`. Whichever approach is chosen must not create circular store imports (stores don't import each other — use a shared signal or existing pub/sub pattern).

### BUG-03: Hex Footprint Outline Geometry

- **D-05:** For hex child maps with real footprint data (non-placeholder), draw an **outer perimeter polygon** — a single closed path following the boundary edges of the hex cells in the footprint. Fill with the same semi-transparent color as the current rectangular footprint. Same dash pattern and stroke style as the existing rectangular footprint.
- **D-06:** For **placeholder footprints** (child has no `feetPerUnit`), keep the existing 1×1 rectangle — hex perimeter drawing only applies when real footprint data is available (`precomputed !== undefined`).
- **D-07 (Claude's Discretion):** Algorithm for the perimeter polygon: for each hex cell in the footprint, compute its 6 edges; boundary edges are edges not shared with another footprint cell. Trace boundary edges into a closed path. `hexCorners()` in `hexRenderer.ts` is not currently exported — planner should either export it or inline the corner math in `footprintOverlay.ts`.

### Claude's Discretion

- Save-signal mechanism for BUG-02 (savedVersion counter vs lastSavedMapName vs another approach)
- Whether `hexCorners()` is exported from `hexRenderer.ts` or reimplemented locally in `footprintOverlay.ts`
- Exact wording of the incompatible-scale warning note in the Map Properties dialog
- Whether the disabled incompatible `<option>` gets a text label suffix like " (incompatible)" or a Unicode symbol

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### BUG-01: Scale Picker
- `frontend/src/components/dialogs/MapPropertiesDialog.tsx` — target file; currently lists all MAP_SCALES with no filtering
- `frontend/src/data/mapScales.ts` — MAP_SCALES array with `defaultShape: 'tile' | 'hex'` field; filter key for BUG-01

### BUG-02: Warning Badge Reactivity
- `frontend/src/components/WorldHierarchyPanel.tsx` — `mapDataCache` state; the useEffect that populates it (lines 63–85); this is where cache busting must be wired
- `frontend/src/store/mapStore.ts` — `setMapScale()` and `saveMapToServer()` (lines ~74, ~170, ~186); save signal must originate here

### BUG-03: Hex Footprint Geometry
- `frontend/src/canvas/footprintOverlay.ts` — target file; `_computeHexScreenRect()` correctly positions the bounding box using hex geometry, but `renderFootprintOverlay()` draws `fillRect`/`strokeRect` (a rectangle) instead of a hex perimeter polygon
- `frontend/src/canvas/hexRenderer.ts` — `hexCorners()` (line 52, not exported), `hexCenter()` (exported), `hexOrientation()` (exported); geometry primitives needed for BUG-03

### Requirements
- `.planning/REQUIREMENTS.md` — BUG-01, BUG-02, BUG-03 specs with acceptance criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `MAP_SCALES` in `mapScales.ts` — already has `defaultShape: 'tile' | 'hex'`; filtering is a one-line `.filter()` call
- `hexCenter()` and `hexOrientation()` — already imported in `footprintOverlay.ts`; corner math can be derived or `hexCorners()` can be exported
- `mapData.orientation` — available in `mapStore` as part of `TmjMap`; already read in `MapPropertiesDialog` via `useMapStore()`

### Established Patterns
- **`mapDataCache` pattern** (hierarchy panel lines 63–85): fetches TMJ data for all world set nodes; only runs when `activeWorldSet` changes; BUG-02 needs an additional trigger for when the *currently open map* is saved
- **Disabled `<option>` in `<select>`**: React's `value` prop on `<select>` still displays a disabled option as the selected value when pre-selected; user cannot re-select it after switching away
- **`footprintOverlay.ts` render flow** (`renderFootprintOverlay`): for each child, computes screen rect, then calls `fillRect`/`strokeRect`; BUG-03 replaces these calls with a path-based polygon draw for non-placeholder hex footprints

### Integration Points
- `MapPropertiesDialog.tsx`: add filter and incompatible-scale logic (D-01, D-02) — no other file needs changes for BUG-01
- `mapStore.ts`: add save-signal state for BUG-02 — minimal addition
- `WorldHierarchyPanel.tsx`: subscribe to save signal and bust cache for BUG-02
- `footprintOverlay.ts`: replace `fillRect`/`strokeRect` with hex perimeter path for non-placeholder hex children for BUG-03; `hexRenderer.ts` may need `hexCorners` export

</code_context>

<specifics>
## Specific Ideas

- BUG-01 incompatible scale note: position it as a `dialog-warn` banner between the `<select>` and the error area — consistent with how `WorldSetDialog` shows validation warnings
- BUG-03 perimeter polygon: `ctx.beginPath()` → loop boundary edges with `ctx.moveTo(edge.start)` / `ctx.lineTo(edge.end)` → `ctx.closePath()` → `ctx.fill()` then `ctx.stroke()`; no `fillRect`/`strokeRect`
- BUG-02 savedVersion: `savedVersion: 0` initial state; `saveMapToServer` increments it after `apiSaveMap` resolves; hierarchy panel `useEffect([activeWorldSet, savedVersion, currentMapName])` deletes `mapDataCache[currentMapName]` when `savedVersion` increments

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 08-bug-fixes*
*Context gathered: 2026-06-03*
