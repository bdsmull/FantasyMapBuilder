---
status: complete
phase: 05-hierarchy-panel
source: [05-01-SUMMARY.md, 05-02-SUMMARY.md, 05-03-SUMMARY.md, 05-04-SUMMARY.md]
started: 2026-05-30T18:39:31Z
updated: 2026-05-30T18:50:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Panel absent when no world set is active
expected: Open the editor with no world set active (or deactivate any active world set). The left panel area should show only the Layer Panel — no hierarchy tree, no panel header with a world set name. The hierarchy section is entirely absent.
result: pass

### 2. Collapsible tree visible when world set is active
expected: With a world set active that has at least 2–3 maps in a hierarchy, the left panel shows a tree. Root-level maps appear at the top. Child maps are indented under their parent. Each node has a ▶ toggle icon when it has children. Clicking ▶ expands to show children; clicking ▾ collapses them.
result: pass

### 3. Click a map node to navigate
expected: With a world set active and a clean (unsaved) map open, click a different map node in the hierarchy panel. The editor loads that map immediately — canvas updates, the map name in the status bar changes. No prompt appears.
result: pass

### 4. Dirty-map guard on navigation
expected: Make any edit to the current map (paint one tile) so it becomes dirty. Then click a different map node in the hierarchy panel. A dialog appears with three buttons: Save, Discard, Cancel. Clicking Cancel returns you to the current map with no changes. Clicking Discard navigates without saving. Clicking Save saves first, then navigates.
result: pass
note: Buttons labeled "Keep Editing" (Cancel), "Discard Changes" (Discard), "Save Map" (Save) — all work as expected.

### 5. Warning badges on problem nodes
expected: Add a node to the world set for a map that has no scale set (feetPerUnit missing). That node in the hierarchy panel should show a visible warning badge (colored icon or indicator) next to the map name. Clean, valid nodes should not show a badge.
result: pass

### 6. Warning badge tooltip not clipped
expected: Hover over a warning badge in the hierarchy panel. A tooltip appears explaining the warning (e.g. "No scale set"). The tooltip is fully visible — not cut off by the panel edge or scrolled out of view.
result: pass

### 7. Node context menu appears on right-click
expected: Right-click a map node in the hierarchy panel. A context menu appears near the cursor with at least three options: "Add child here", "Change parent", and "Remove from world set". The menu closes when you click elsewhere or press Escape.
result: pass

### 8. Context menu "Add child here" opens WorldSetDialog with parent pre-filled
expected: Right-click a map node and select "Add child here". The WorldSetDialog opens in configure view. The Parent field is pre-set to the node you right-clicked. The Map and Anchor fields are empty/default.
result: pass

### 9. Context menu "Remove from world set" removes the node
expected: Right-click a map node (that is NOT the root) and select "Remove from world set". The node disappears from the hierarchy tree immediately. The world set is saved (refreshing the page should not bring it back).
result: pass

### 10. Hierarchy panel header — active world set name and deactivate button
expected: When a world set is active, the hierarchy panel header shows the name of the active world set. There is a × (close/deactivate) button. Clicking × deactivates the world set — the hierarchy panel disappears and the editor returns to a state with no active world set.
result: pass

### 11. Resize handle
expected: There is a draggable resize handle between the hierarchy panel and the layer panel. Dragging it up shrinks the hierarchy panel; dragging it down grows it. The panel respects minimum (≈80px) and maximum (container height minus ~60px) bounds — it cannot be dragged past either limit.
result: pass

### 12. Active world set persists across reload
expected: With a world set active, reload the page (F5). The same world set is still active after reload — the hierarchy panel shows the same tree without you having to re-select it from the dialog.
result: pass

## Summary

total: 12
passed: 12
issues: 0
skipped: 0
pending: 0

## Gaps

[none yet]
