# Milestones

## v1.0 World Sets (Shipped: 2026-05-30)

**Phases completed:** 10 phases, 20 plans, 29 tasks

**Key accomplishments:**

- `MapScale` with `feetPerUnit` on all 8 presets, `TmjMap.feetPerUnit` for backward-compat storage, `WorldSetNode`/`WorldSet` types, and pure `computeFootprint`/`detectOverlaps` utilities with 16 passing Vitest tests
- FastAPI CRUD router for .worldset.json files with 11 pytest-asyncio tests covering all endpoints, error paths, and the _bare_name double-extension regression guard
- Four typed fetch wrappers (listWorldSets, getWorldSet, saveWorldSet, deleteWorldSet) added to client.ts using handleResponse and encodeURIComponent, satisfying API-06
- Zustand store for active world set with full CRUD actions, cycle/duplicate/parent-link invariants, BFS descendant removal, and anchor-cell overlap warnings
- Standalone `navigateToMap(name, { saveFirst })` utility with dirty-map guard using `useMapStore.getState()` — single entry point for all future hierarchy/canvas/statusbar navigation triggers
- Configure-view state added:
- Approved
- File:
- Full WorldHierarchyPanel React component with collapsible tree, dirty-guard dialog, warning badges, context menu, and world-set switcher header — returns null when no world set is active
- Task 1 — App.tsx integration (commit 64eacbd):
- Canvas overlay module `footprintOverlay.ts` with dashed footprint rendering, hover-aware colors, and hit-testing; Phase 6 CSS classes (tooltip, picker, breadcrumb) added to App.css
- MapCanvas.tsx extended with footprint overlay rendering, desktop hover+tooltip, click-to-navigate with dirty-map guard, touch two-tap model, and overlap picker popup
- Parent breadcrumb in StatusBar.tsx using worldSetStore.parentOf() with dirty-map guard modal (Save / Discard / Cancel)
- 1. [Rule 1 - Bug] TypeScript `never` inference in test CTX-05
- Task 1 changes (lines 28-29, 41-45, 71-79, 217-231):
- Automated test coverage for all 4 CTX requirements: 18 new tests across 2 files verify gate logic, anchor pre-fill, hideParent state contract, and onCreated skip-loadMap behavior.

---
