# Phase 5: Hierarchy Panel — Context

**Gathered:** 2026-05-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 5 delivers a collapsible hierarchy tree in the left panel that shows the active world set's map hierarchy, with navigation-on-click (dirty-map guard), validation warning badges, a right-click context menu, and a world set switcher in the panel header. Hidden when no world set is active.

Deliverables:
1. `frontend/src/components/WorldHierarchyPanel.tsx` — collapsible tree with badges, context menu, dirty-map guard prompt, world set header/switcher
2. `frontend/src/App.tsx` — left panel updated to stack WorldHierarchyPanel above LayerPanel with a resizable drag handle
3. CSS additions to `frontend/src/App.css` — hierarchy panel styles, context menu popup, drag handle, resize logic

</domain>

<decisions>
## Implementation Decisions

### D-01: Left panel layout — stacked with resizable drag handle

- `WorldHierarchyPanel` sits **above** `LayerPanel` in the left panel
- Both panels are visible simultaneously when a world set is active
- A draggable divider between the two panels lets the user resize the split
- The drag handle uses pointer event handling on the divider element; sizes stored in component state (not persisted to localStorage)
- When no world set is active, `WorldHierarchyPanel` is hidden entirely and `LayerPanel` takes the full left panel height (PANEL-05)

### D-02: World set header — name + dropdown switcher

- The top of the hierarchy panel shows a header ("WORLD SET") + the active world set name
- If multiple world sets exist, the name is a clickable `<select>` or dropdown that calls `setActiveWorldSet(name)` to switch
- When only one world set exists, it can be a static label (no dropdown needed)
- The header follows the same `.panel-header` style as LayerPanel

### D-03: Tree nodes — expand/collapse behavior

- All nodes start **expanded by default**
- Collapse state is **persisted per world set name** in component state (keyed by world set name, survives map navigation within the session, resets on page reload)
- Leaf nodes (no children) show **no expand/collapse arrow** — only nodes with children show the ▶/▾ toggle
- Tree scrolls within the hierarchy panel section (not the whole left panel)

### D-04: Active map highlighting

- The tree node matching the currently loaded map name gets a visual highlight using the same `.active` style as `LayerPanel`'s active layer
- If the currently open map is NOT in the active world set, no highlight is shown — the tree displays normally

### D-05: Warning badges — ⚠ icon with tooltip

- Each node with validation issues shows a single `⚠` glyph at the right edge of the node row
- Hovering the `⚠` shows a tooltip listing the specific issue(s) — one or more of: missing scale, overlap, scale inversion, missing map
- One icon regardless of how many issues a node has — tooltip details all of them
- Follows the warn-but-allow pattern established in Phase 3

### D-06: Dirty-map guard — reuse existing dialog pattern

- When clicking a tree node and the current map is dirty, a modal dialog appears (consistent with the dirty-guard pattern in `OpenMapDialog`)
- Dialog shows Save / Discard / Cancel options
- On Save → `navigateToMap(name, { saveFirst: true })`
- On Discard → `navigateToMap(name, { saveFirst: false })`
- On Cancel → navigation is aborted, current map stays loaded

### D-07: Context menu — custom CSS absolute-positioned popup

- Right-clicking a tree node shows a custom CSS popup at the cursor position
- Three items: "Add child here", "Remove from world set", "Change parent"
- Dismissed by clicking outside the popup or pressing Escape
- "Add child here" → opens `WorldSetDialog` with configure-node view, pre-selecting the right-clicked node as the parent
- "Remove from world set" → calls `removeNode(mapName)` + `saveWorldSet()`, no confirmation needed (warn-but-allow, node can be re-added)
- "Change parent" → Claude's discretion (implementation approach left to planner/executor)

### Claude's Discretion

- "Change parent" UX — could open `WorldSetDialog` nodes view, an inline parent picker, or another approach; Claude decides based on what's cleanest given the existing components
- Exact pixel breakpoints for the resizable drag handle (minimum heights for each panel section)
- Whether the world set switcher is a `<select>` element or a custom dropdown
- CSS class names for new hierarchy panel elements (follow `.layer-*` / `.panel-*` naming convention)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design Spec
- `docs/world-sets-design.md` — Full design spec; Hierarchy Panel section is directly relevant

### Existing Panels (patterns to mirror)
- `frontend/src/components/LayerPanel.tsx` — Left panel component pattern: `.panel-header`, `.layer-list`, `.layer-item`, `.layer-item.active`, `.panel-empty` styles; stacking target for new panel
- `frontend/src/App.tsx` — `left-panel` aside layout; integration point for `WorldHierarchyPanel` and drag handle

### Store (actions used by this panel)
- `frontend/src/store/worldSetStore.ts` — `activeWorldSetName`, `activeWorldSet`, `setActiveWorldSet()`, `removeNode()`, `saveWorldSet()`, `childrenOf()`, `parentOf()`, `rootNodes()`
- `frontend/src/store/mapStore.ts` — `isDirty`, `currentMapName` (for active map highlight)

### Navigation Utility
- `frontend/src/utils/navigation.ts` — `navigateToMap(name, { saveFirst })` — the single entry point for map navigation; handles dirty-map guard by honoring the caller's decision

### Existing Dialogs (reuse for dirty-map guard + "Add child here")
- `frontend/src/components/dialogs/WorldSetDialog.tsx` — target for "Add child here" context menu action; needs a way to open directly to configure-node view with a pre-selected parent
- `frontend/src/components/dialogs/OpenMapDialog.tsx` — reference for dirty-map guard dialog pattern

### CSS
- `frontend/src/App.css` — `.panel-header`, `.layer-item`, `.layer-item.active`, `.panel-empty`; left panel layout; existing dialog/warning styles — extend for hierarchy panel and context menu popup

### Requirements
- `.planning/REQUIREMENTS.md` — PANEL-01 through PANEL-05

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `.panel-header` / `.layer-item` / `.layer-item.active` CSS classes — hierarchy tree nodes should mirror the LayerPanel's visual style for consistency
- `useWorldSetStore` — `rootNodes()`, `childrenOf(mapName)` compute the tree structure needed for rendering; no new store selectors required
- `navigateToMap()` from `frontend/src/utils/navigation.ts` — already handles save-before-navigate; panel just needs to wire in the dirty-map guard decision
- `WorldSetDialog.tsx` — already fully built from Phase 4; panel context menu can open it directly (needs a prop or state mechanism to open to configure-node view with parent pre-filled)

### Established Patterns
- **Left panel component**: `LayerPanel` is a simple functional component that reads from `useMapStore`; `WorldHierarchyPanel` should follow the same pattern reading from `useWorldSetStore` and `useMapStore`
- **Panel stacking**: currently `<aside className="left-panel"><LayerPanel /></aside>`; add `WorldHierarchyPanel` above `LayerPanel` with a resize divider between them
- **Dirty-map guard dialog**: `OpenMapDialog` shows a modal with Save/Discard/Cancel when `isDirty` — same pattern applies here
- **Warn-but-allow**: established in Phase 3 for overlap/scale issues; warning badges follow this (show ⚠, don't block interaction)

### Integration Points
- `App.tsx` left-panel aside: add `WorldHierarchyPanel` above `LayerPanel`, add resize divider, conditionally hide `WorldHierarchyPanel` when `activeWorldSetName === null`
- `WorldSetDialog.tsx`: may need an optional prop like `initialView` and `initialParentMapName` so the panel's "Add child here" can open it directly to the configure-node view

</code_context>

<specifics>
## Specific Ideas

- Resize drag handle: pointer events on a thin `<div className="panel-resize-handle">` between the two panel sections; `onPointerDown` initiates drag, `onPointerMove` on document updates split size, `onPointerUp` cleans up
- Tree node structure: recursively render from `rootNodes()`, then for each node call `childrenOf(node.mapName)` to render children
- Collapse state: `const [collapsed, setCollapsed] = useState<Record<string, Set<string>>>({})` keyed by world set name, inner set contains collapsed map names

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 05-hierarchy-panel*
*Context gathered: 2026-05-05*
