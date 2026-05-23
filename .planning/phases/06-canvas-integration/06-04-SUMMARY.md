---
plan: 06-04
phase: 06-canvas-integration
type: checkpoint
completed: 2026-05-22
status: approved
---

# Plan 06-04: Manual Smoke Test — Summary

## Outcome

Human smoke test approved on both desktop and tablet (iPad).

## Automated checks (Task 1)

- `npx tsc --noEmit` — passed (0 errors)
- `npm run test` — passed (126/126 Vitest tests)

## Human verification (Task 2)

All 7 smoke test scenarios confirmed:

| Test | Requirement | Result |
|------|-------------|--------|
| 1 | CANVAS-01/02 | Blue outlines with child map name labels — PASS |
| 2 | CANVAS-03 | Amber ? placeholder for unscaled maps — PASS |
| 3 | CANVAS-04 | Hover brightens footprint, tooltip, pointer cursor — PASS (desktop) |
| 4 | CANVAS-05 | Click navigates; dirty-map guard (Save/Discard/Cancel) — PASS |
| 5 | CANVAS-05 | Overlap picker appears, dismisses, navigates on selection — PASS |
| 6 | CANVAS-06 | Status bar breadcrumb, click navigates to parent — PASS |
| 7 | Regression | No overlays or breadcrumb without active world set — PASS |

## Bugs found and fixed during smoke test

- `feetPerUnit` missing from maps created via NewMapDialog — fixed, both fields now written
- `footprintMap` not passed to `renderFootprintOverlay` — fixed, child maps fetched and footprints pre-computed
- Scale-only maps (no `feetPerUnit`) treated as placeholders — fixed, `MAP_SCALE_BY_ID` fallback added
- Picker dismiss fired before navigation on item click — fixed via `pickerRef` contains check
- Mobile viewport: status bar hidden by tile palette overflow — fixed with `100dvh` + safe-area insets

## GitHub issues filed

- [#1](https://github.com/bdsmull/FantasyMapBuilder/issues/1) Map Properties allows incompatible scale for map type
- [#2](https://github.com/bdsmull/FantasyMapBuilder/issues/2) World Set warning icon not cleared after scale fix without reload
- [#3](https://github.com/bdsmull/FantasyMapBuilder/issues/3) Footprint outline rectangular even for hex child maps
- [#4](https://github.com/bdsmull/FantasyMapBuilder/issues/4) View menu panel toggles

## Self-Check: PASSED
