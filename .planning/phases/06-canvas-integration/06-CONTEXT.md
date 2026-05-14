# Phase 6: Canvas Integration — Context

**Gathered:** 2026-05-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 6 delivers canvas-level world set visualization and navigation: child footprint outlines drawn directly on the tile/hex map, hover/touch tooltips, click-to-navigate (with dirty-map guard), overlap picker, and a parent breadcrumb in the status bar. No new store actions, no new dialogs (reuses `navigateToMap` and existing dirty-map guard modal).

Deliverables:
1. `frontend/src/canvas/footprintOverlay.ts` — new canvas module: draws footprint outlines, labels, hover highlight
2. `frontend/src/components/MapCanvas.tsx` — wired to call footprintOverlay after normal render; pointer event logic extended for footprint hit-testing, hover tracking, overlap picker
3. `frontend/src/components/StatusBar.tsx` — parent breadcrumb added (reads from `worldSetStore`)
4. CSS additions to `frontend/src/App.css` — overlap picker popup, tooltip styles, breadcrumb styles

</domain>

<decisions>
## Implementation Decisions

### D-01: Footprint click — navigate always, footprints intercept all clicks

- Clicking any footprint **always** navigates to that child map, regardless of the active tool (paint/erase/fill/point)
- Footprint regions intercept pointer events before the tool chain — if a click lands inside a footprint, the tool is never invoked
- Painting tiles that are visually under a footprint is impossible without first removing the child node from the world set
- The dirty-map guard (Save / Discard / Cancel modal) applies to footprint-click navigation — reuses the same modal as hierarchy panel navigation

### D-02: Overlapping footprints — picker popup

- When a click lands inside multiple overlapping footprints, a small picker popup appears listing the overlapping children by name
- The user taps/clicks a name in the picker to navigate to that child
- On touch (iPad): first tap opens the picker; tapping a name in the picker navigates (consistent with the two-tap model)
- Picker is dismissed by clicking/tapping outside it or pressing Escape

### D-03: Hover highlight on desktop, two-tap model on touch

- **Desktop (mouse):** Hovering a footprint changes its fill/border color to a highlight state (canvas re-render on hover); cursor changes to `pointer`; tooltip shows child name + scale
- **Touch (iPad):** First tap on a footprint shows the tooltip (no highlight on touch — hover state not applicable); second tap on the same footprint navigates; tapping anywhere else on the canvas dismisses the tooltip
- For overlapping footprints on touch: first tap opens the picker popup (same as desktop click); tapping a picker item navigates
- Tooltip dismissal: tapping outside the footprint (or another footprint) clears the tooltip/hover state

### D-04: Footprint visual style

- **Normal footprint:** dashed/dotted colored border + very light semi-transparent fill (5–10% opacity) in theme accent color
- **Placeholder footprint (no `feetPerUnit`, CANVAS-03):** warning color (amber/yellow), same dashed border + light fill, labeled with `?`
- **Hovered footprint:** fill opacity and/or border brightness increases to indicate interactivity
- **Labels:** child map name centered within the footprint bounds; clipped/truncated with ellipsis if the footprint is too small; exact font size Claude's discretion (must be readable at normal zoom)
- **Visibility:** always shown when a world set is active — no zoom-threshold hiding

### D-05: Overlay module structure

- New `frontend/src/canvas/footprintOverlay.ts` module — mirrors the `tileRenderer`/`hexRenderer` pattern
- `MapCanvas.tsx` calls it as a final pass after the normal render (tile or hex)
- Module exports: `renderFootprintOverlay(ctx, children, currentMapData, view, hoverState)`
- Hit-testing logic (`footprintAtPoint()`) lives in `footprintOverlay.ts` and is called from `MapCanvas.tsx` pointer event handlers

### D-06: Status bar breadcrumb

- When the current map has a parent in the active world set, the breadcrumb appears **left side of the status bar, before the map name**: `↑ [Parent Name] > [CurrentMap]`
- Single parent only (not a full ancestor chain)
- Clicking the breadcrumb navigates to the parent (calls `navigateToMap` with dirty-map guard modal)
- On narrow viewports (iPad ≤1024px): parent name truncates with ellipsis — breadcrumb stays on one line, always visible
- Dirty-map guard: same Save / Discard / Cancel modal as hierarchy panel and footprint navigation

### Claude's Discretion

- Exact footprint outline colors, dash pattern, fill opacity — match existing UI color palette (check `App.css` for accent/warning colors)
- Font size and weight for footprint labels
- Picker popup appearance — can reuse `.context-menu` / `.dialog` patterns or a new lightweight `.footprint-picker` class; keep consistent with existing popups
- Exact `pointer` cursor behavior when hovering footprint label vs. outline vs. fill area
- Whether `renderFootprintOverlay` receives pre-computed footprint rects or computes them internally from nodes + `computeFootprint()`

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Canvas Renderers (integration targets)
- `frontend/src/components/MapCanvas.tsx` — pointer event handlers, render loop, tool dispatch; overlay must plug in here
- `frontend/src/canvas/tileRenderer.ts` — module pattern to mirror for `footprintOverlay.ts`
- `frontend/src/canvas/hexRenderer.ts` — hex-specific rendering; overlay must handle hex coord → screen pixel conversion

### Canvas Utilities
- `frontend/src/canvas/canvasUtils.ts` — `screenToTile()`, `ViewState` type; `footprintOverlay.ts` needs the inverse (tile → screen)

### World Set Utilities (footprint math)
- `frontend/src/utils/worldSetUtils.ts` — `computeFootprint(childWidth, childHeight, childFPU, parentFPU, anchor)` → `{colMin, colMax, rowMin, rowMax}`

### Store
- `frontend/src/store/worldSetStore.ts` — `activeWorldSet`, `childrenOf(mapName)`, `parentOf(mapName)` — data sources for overlay and breadcrumb
- `frontend/src/store/mapStore.ts` — `mapData`, `mapName`, `isDirty`, `zoom`, `pan` — current map state

### Navigation
- `frontend/src/utils/navigation.ts` — `navigateToMap(name, { saveFirst })` — used by footprint clicks and breadcrumb click

### Status Bar (extension target)
- `frontend/src/components/StatusBar.tsx` — current implementation; breadcrumb added here

### CSS
- `frontend/src/App.css` — existing accent/warning colors, `.status-bar` layout, `.context-menu` (if it exists from Phase 5 context menu work), tooltip/dialog patterns

### Requirements
- `.planning/REQUIREMENTS.md` — CANVAS-01 through CANVAS-06

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `computeFootprint()` in `worldSetUtils.ts` — already computes `{colMin, colMax, rowMin, rowMax}` from node data; no new math needed
- `childrenOf(mapName)` / `parentOf(mapName)` in `worldSetStore` — computed helpers, ready to use
- `navigateToMap()` in `navigation.ts` — handles dirty-map guard + fetch + `mapStore.loadMap()`; all navigation triggers call this
- Dirty-map guard modal — already exists from hierarchy panel (Phase 5); footprint navigation reuses it
- `.panel-empty`, `.dialog-warn`, `.dialog-error`, `.map-list-item` CSS classes — may be usable for picker popup styling

### Established Patterns
- **Canvas module pattern**: `renderTileMap(ctx, map, options)` / `renderHexMap(ctx, map, options)` — `footprintOverlay.ts` should export a similar `renderFootprintOverlay(ctx, ...)` function
- **Render loop**: `render()` callback in `MapCanvas.tsx` uses `useCallback` with store deps; footprint overlay state (hover, tooltip) must be included as deps to trigger re-render on hover
- **Pointer event handling**: tools dispatched via `TOOLS[store.selectedTool]`; footprint hit-test must run before tool dispatch in `onPointerDown`
- **Context menu / picker**: Phase 5 may have introduced `.context-menu` popup styles — check `App.css` before creating new ones

### Integration Points
- `MapCanvas.tsx` `render()`: add `renderFootprintOverlay(ctx, ...)` call after `renderTileMap`/`renderHexMap` call
- `MapCanvas.tsx` `onPointerDown`: before tool dispatch, run `footprintAtPoint(pt, ...)` — if hit, navigate (or show picker for overlaps); if miss, fall through to tool
- `MapCanvas.tsx` `onPointerMove`: track hover over footprints; if footprint changes, trigger `requestAnimationFrame(render)` to update highlight
- `StatusBar.tsx`: add `useWorldSetStore()` subscription; render breadcrumb when `parentOf(currentMapName)` is non-null

</code_context>

<specifics>
## Specific Ideas

- Tile → screen coordinate: inverse of `screenToTile` — `(col * tileWidth + pan.x) * zoom` for square tiles; hex equivalent using `hexToPixel` logic already in `hexRenderer.ts`
- Hover state structure: `const [hoveredFootprint, setHoveredFootprint] = useState<string | null>(null)` (mapName of hovered child) — passed to `renderFootprintOverlay` to draw highlight; triggers re-render via dependency
- Touch two-tap state: `const [touchedFootprint, setTouchedFootprint] = useState<string | null>(null)` — first tap sets it (shows tooltip), second tap navigates
- Overlap picker: `const [pickerPos, setPickerPos] = useState<{x:number,y:number}|null>(null)` + `const [pickerCandidates, setPickerCandidates] = useState<string[]>([])` — rendered as absolute-positioned popup over the canvas

</specifics>

<deferred>
## Deferred Ideas

### Terrain Inheritance (Future Phase)
When a child map covers a parent tile, that parent tile should reflect the dominant terrain type of the child (e.g. if 80% of child tiles are forest, the parent tile is set to forest). Likewise, when a new child map is first created, it could be auto-populated from the parent tiles it overlays. This is a significant new capability — own phase.

</deferred>

---

*Phase: 06-canvas-integration*
*Context gathered: 2026-05-14*
