# Phase 7: Context Menu — Context

**Gathered:** 2026-05-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 7 delivers a right-click context menu on `MapCanvas.tsx` that, when a world set is active and the current map is a node in that world set, offers contextual actions at the clicked cell:

- On **empty canvas**: "Add child map here" (anchor pre-filled from clicked cell)
- On **existing footprint**: "Add child map here" + "Edit [MapName]…" + "Remove [MapName] from world set"

The "Add child map here" flow opens `WorldSetDialog` in configure-node view with the current map as parent and the anchor pre-filled. Includes inline scale assignment (CTX-04). "Create new map" chains into `NewMapDialog` and returns with the new map pre-selected.

Deliverables:
1. `WorldSetDialog.tsx` — extended with `initialAnchor?: { col: number; row: number }` and `hideParent?: boolean` props
2. `MapCanvas.tsx` — right-click handling updated: detect world-set-active + current-map-is-node → show context menu; hit-test footprints for contextual items
3. CSS in `App.css` — canvas context menu popup (can reuse/mirror `.hierarchy-ctx-menu` styles)

</domain>

<decisions>
## Implementation Decisions

### D-01: Context menu visibility gate

- The context menu appears **only when** (a) a world set is active AND (b) the current map is a node in that world set
- If no world set is active, or if the current map is not in the world set, `button === 2` falls through to `tool.onRightPress?.()` as before (no regression for tools that use it, e.g., pointTool eraser)
- The "World Sets menu item not gated on mapData" precedent (Phase 4) does NOT apply here — right-click context is more disruptive to ignore

### D-02: Context menu content — two variants

**Empty canvas right-click (no footprint hit):**
- One item: "Add child map here"

**Footprint right-click (footprint hit via `footprintAtPoint()`):**
- Three items: "Add child map here", "Edit [MapName]…", "Remove [MapName] from world set"
- The footprint's `mapName` drives the label and the action targets

### D-03: "Add child map here" dialog — extend WorldSetDialog

- Add `initialAnchor?: { col: number; row: number }` prop — pre-fills anchor col/row fields when set
- Add `hideParent?: boolean` prop — when `true`, hides the parent selection field in configure view; parent is locked to whatever `initialParentMapName` is set to
- Open with: `initialView='configure'`, `initialParentMapName=currentMapName`, `initialAnchor={col, row}`, `hideParent=true`
- Current map is always the parent when opened from the canvas context menu — no way to pick a different parent in this flow

### D-04: "Edit [MapName]…" from footprint context menu

- Opens `WorldSetDialog` in edit mode: `initialMapName=footprintMapName`, `initialView='configure'`
- Anchor field is editable and pre-filled with the **existing** anchor (not the right-clicked cell) — standard edit behavior
- `hideParent` is NOT set here — full edit form

### D-05: "Remove [MapName]" from footprint context menu

- Calls `removeNode(footprintMapName)` + `saveWorldSet()` immediately, no confirmation
- Matches the hierarchy panel's "Remove from world set" behavior (Phase 5, D-07)

### D-06: "Create new map" flow

- The map picker in `WorldSetDialog` configure view gets a "Create new map…" option (or button)
- Clicking it opens `NewMapDialog`
- When `NewMapDialog` closes (after successful creation), the mini-dialog reopens (or stays open) with the new map name pre-selected in the picker
- User then finishes configuring Z, label, scale as normal

### D-07: Context menu CSS

- Reuse or mirror `.hierarchy-ctx-menu` styles — same visual treatment (absolute-positioned popup, li hover states, `.danger` variant for remove)
- New class: `.canvas-ctx-menu` (separate from `.hierarchy-ctx-menu` for specificity, but same visual rules)
- Dismissed by outside click or Escape — same pattern as `.hierarchy-ctx-menu` in `WorldHierarchyPanel.tsx`

### Claude's Discretion

- Exact CSS class names for canvas context menu (`.canvas-ctx-menu` is a suggestion)
- Whether "Create new map…" in the map picker is an `<option>` element or a separate button below the `<select>`
- Positioning of the context menu popup (absolute within the `MapCanvas` container, same as picker/tooltip overlays)
- Whether to add a separator line between "Add child here" and "Edit/Remove" items in the footprint menu

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Dialog being extended
- `frontend/src/components/dialogs/WorldSetDialog.tsx` — target for initialAnchor + hideParent props; configure-node view is the mini-dialog

### Canvas integration target
- `frontend/src/components/MapCanvas.tsx` — right-click handling at line ~320 (`e.button === 2`); `footprintAtPoint()` already importable from `footprintOverlay.ts`; existing overlay pattern (tooltip, picker) shows how to render popups as sibling divs

### Footprint hit-testing
- `frontend/src/canvas/footprintOverlay.ts` — `footprintAtPoint(x, y, footprints)` returns array of mapNames at that point; `renderedFootprintsRef.current` in `MapCanvas.tsx` is the hit-test data

### Context menu visual pattern (mirror this)
- `frontend/src/components/WorldHierarchyPanel.tsx` — `.hierarchy-ctx-menu` usage pattern: state, outside-click dismiss, Escape dismiss, stopPropagation on the menu itself

### CSS
- `frontend/src/App.css` — `.hierarchy-ctx-menu` styles (lines ~483–503); `.footprint-picker` styles (overlap picker, referenced as same visual style); accent/warning colors

### Store
- `frontend/src/store/worldSetStore.ts` — `activeWorldSet`, `activeWorldSetName`, `childrenOf()`, `removeNode()`, `saveWorldSet()`
- `frontend/src/store/mapStore.ts` — `mapName` (current map name, used as parent)

### Existing dialogs (chaining)
- `frontend/src/components/dialogs/NewMapDialog.tsx` — target for "Create new map" chain; understand its onClose/onCreated callback pattern

### Requirements
- `.planning/REQUIREMENTS.md` — CTX-01 through CTX-04

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `.hierarchy-ctx-menu` CSS + dismiss pattern in `WorldHierarchyPanel.tsx` — canvas context menu can follow this verbatim (state, setTimeout outside-click registration, Escape handler)
- `footprintAtPoint(x, y, renderedFootprintsRef.current)` — already called in `MapCanvas.tsx` pointer handlers; right-click handler can call it to determine which menu variant to show
- `WorldSetDialog` `initialView='configure'` + `initialParentMapName` — already wired; just needs `initialAnchor` + `hideParent` props added
- `navigateToMap()` — not needed for Phase 7 (no navigation in context menu), but available if "Go to map" is ever added
- `removeNode()` + `saveWorldSet()` — already used in `WorldHierarchyPanel.tsx` handleRemove; same pattern here

### Established Patterns
- **Canvas overlay rendering**: tooltip and picker are sibling `<div>`/`<ul>` inside `MapCanvas`'s wrapper div, absolutely positioned via inline `style={{ left, top }}`; context menu follows same approach
- **Right-click interception**: currently `e.button === 2` at line ~320 in `MapCanvas.tsx`; needs to run world-set guard check BEFORE calling `tool.onRightPress?.()`
- **`WorldSetDialog` prop pattern**: `initialView`, `initialParentMapName`, `initialMapName` follow the "open dialog to a specific state" pattern; `initialAnchor` and `hideParent` are additive

### Integration Points
- `MapCanvas.tsx` `onPointerDown` at `e.button === 2` block (line ~320): add world-set guard → call `footprintAtPoint()` → set context menu state (position + variant) → return (prevent tool dispatch)
- `WorldSetDialog.tsx` configure view: read `initialAnchor` prop to set `anchorCol`/`anchorRow` initial state; read `hideParent` to conditionally render parent field
- `App.tsx`: no changes needed — `WorldSetDialog` is already mounted and managed in App; MapCanvas context menu opens it via prop/callback (same wiring as Phase 5 hierarchy panel "Add child here")

</code_context>

<specifics>
## Specific Ideas

- Context menu state: `const [canvasCtxMenu, setCanvasCtxMenu] = useState<{ x: number; y: number; col: number; row: number; footprintMapName?: string } | null>(null)` — position + cell coords + optional footprint hit
- Check world set gate: `const wsActive = !!activeWorldSetName && !!activeWorldSet?.nodes.find(n => n.mapName === currentMapName)` — only show menu if current map is in the world set
- Dismiss: same setTimeout pattern as `.hierarchy-ctx-menu` — register `mousedown` + `keydown` listeners after 0ms tick to avoid catching the opening click

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 07-context-menu*
*Context gathered: 2026-05-25*
