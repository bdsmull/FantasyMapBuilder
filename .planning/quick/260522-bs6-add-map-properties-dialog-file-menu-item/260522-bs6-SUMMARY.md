---
phase: quick
plan: 260522-bs6
subsystem: frontend/dialogs
tags: [map-properties, dialog, scale, file-menu, store]
dependency_graph:
  requires: []
  provides: [MapPropertiesDialog, setMapScale]
  affects: [frontend/src/store/mapStore.ts, frontend/src/components/MenuBar.tsx, frontend/src/App.tsx]
tech_stack:
  added: []
  patterns: [Zustand store action, dialog component, controlled select]
key_files:
  created:
    - frontend/src/components/dialogs/MapPropertiesDialog.tsx
  modified:
    - frontend/src/store/mapStore.ts
    - frontend/src/components/MenuBar.tsx
    - frontend/src/App.tsx
decisions:
  - Map Properties dialog gated on mapData — menu item disabled when no map loaded, dialog only renders when mapData is truthy
  - setMapScale uses MAP_SCALE_BY_ID lookup so feetPerUnit stays authoritative and consistent with scale id
  - Dialog initializes selectedScaleId from mapData?.scale ?? 'building' — graceful default for maps without a prior scale
metrics:
  duration: 10 min
  completed: 2026-05-22
  tasks_completed: 2
  files_changed: 4
---

# Quick Task 260522-bs6: Add Map Properties Dialog — File Menu Item

**One-liner:** File > Map Properties… dialog with scale picker that patches mapData.scale + feetPerUnit and saves to server.

## What Was Built

- `setMapScale(scaleId: string)` store action in `mapStore.ts` — patches `mapData.scale` and `mapData.feetPerUnit` from `MAP_SCALE_BY_ID` lookup, sets `isDirty: true`
- `MapPropertiesDialog` component — modal with a `<select>` populated from `MAP_SCALES`, Cancel and Save buttons; Save calls `setMapScale` then `saveMapToServer()`
- "Map Properties…" File menu item in `MenuBar` — placed between "Export as PNG" and "Close Map", disabled when no map is open
- `activeDialog === 'mapProperties'` branch in `App.tsx` — renders `MapPropertiesDialog` gated on `mapData`

## Tasks

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Add setMapScale store action and MapPropertiesDialog | 1736490 | mapStore.ts, MapPropertiesDialog.tsx |
| 2 | Wire MapPropertiesDialog into MenuBar and App | 6630504 | MenuBar.tsx, App.tsx |

## Verification

- `npm run build` — exits 0, no TypeScript errors (61 modules)
- `npx tsc --noEmit` — clean (no output)
- `npm run test` — 126/126 tests pass across 10 test files

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — the dialog is fully wired: scale picker reads MAP_SCALES, Save patches store and persists to server.

## Self-Check: PASSED

- `frontend/src/components/dialogs/MapPropertiesDialog.tsx` — FOUND
- `frontend/src/store/mapStore.ts` contains `setMapScale` — FOUND
- Commit `1736490` — FOUND
- Commit `6630504` — FOUND
