# Roadmap: Fantasy RPG Map Editor

## Milestones

- ✅ **v1.0 World Sets** — Phases 1–7 (shipped 2026-05-30)
- 🔄 **v1.1 Polish & Fixes** — Phases 8–11 (in progress)

## Phases

<details>
<summary>✅ v1.0 World Sets (Phases 1–7) — SHIPPED 2026-05-30</summary>

- [x] Phase 1: Data Foundation (1/1 plan) — completed 2026-04-06
- [x] Phase 2: Server API (2/2 plans) — completed 2026-04-20
- [x] Phase 3: World Set Store (3/3 plans) — completed 2026-04-24
- [x] Phase 4: Management Dialog (3/3 plans) — completed 2026-05-05
- [x] Phase 5: Hierarchy Panel (4/4 plans) — completed 2026-05-10
- [x] Phase 6: Canvas Integration (4/4 plans) — completed 2026-05-22
- [x] Phase 7: Context Menu (3/3 plans) — completed 2026-05-28

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

### v1.1 Polish & Fixes

- [ ] **Phase 8: Bug Fixes** — Correct scale picker filtering, warning icon reactivity, and hex footprint geometry
- [ ] **Phase 9: UI Polish** — Fix toggle icon size, add WorldSetDialog close button, relocate World Sets menu item
- [ ] **Phase 10: View Panel Toggles** — Add View menu checkmarks for all 4 panels with localStorage persistence
- [ ] **Phase 11: Tech Debt** — Fix object-add redo and removeTileset() state mutation

## Phase Details

### Phase 8: Bug Fixes
**Goal**: Users experience correct behavior in the three known bug areas — scale picker, warning icon, and hex footprint
**Depends on**: Nothing (first v1.1 phase)
**Requirements**: BUG-01, BUG-02, BUG-03
**Success Criteria** (what must be TRUE):
  1. Opening Map Properties on an orthogonal map shows only tile scales; opening it on a hex map shows only hex scales
  2. After correcting a map's scale in Map Properties and saving, the warning badge on that map disappears in the Hierarchy panel immediately — no page reload needed
  3. When a hex map is a child in a World Set, its canvas footprint outline traces the hex cell boundaries rather than a rectangle
**Plans**: TBD
**UI hint**: yes

### Phase 9: UI Polish
**Goal**: Three cosmetic issues in the World Sets UI are resolved — consistent toggle icons, accessible close button, and a logical menu placement
**Depends on**: Nothing (independent of Phase 8)
**Requirements**: POL-01, POL-02, POL-03
**Success Criteria** (what must be TRUE):
  1. Hierarchy panel expand (▶) and collapse (▾) icons render at the same visual size
  2. The WorldSetDialog nodes view has a visible Close or Done button that dismisses the dialog
  3. A "World Sets" menu item is reachable from the top-level menu bar without opening Edit
**Plans**: TBD
**UI hint**: yes

### Phase 10: View Panel Toggles
**Goal**: Users can show and hide each of the four main panels from the View menu, and their choices persist across reloads
**Depends on**: Nothing (independent frontend feature)
**Requirements**: VIS-01, VIS-02
**Success Criteria** (what must be TRUE):
  1. The View menu contains checkmark items for Toolbar, Tile Palette, Layer Panel, and Status Bar; clicking each toggles the panel on or off
  2. A panel hidden before a page reload remains hidden after reload; a visible panel remains visible
**Plans**: TBD
**UI hint**: yes

### Phase 11: Tech Debt
**Goal**: Two known correctness bugs in the Zustand store are fixed — redo for object placement and immutable tileset removal
**Depends on**: Nothing (store-level fixes)
**Requirements**: DEBT-01, DEBT-02
**Success Criteria** (what must be TRUE):
  1. After placing a map object and undoing, redoing the action restores the placed object correctly
  2. Removing a tileset does not mutate store state in place — the operation produces a new state reference
**Plans**: TBD

## Backlog

Items parked for future milestone consideration:

*(Backlog items 999.1, 999.2, 999.3 promoted into v1.1 as POL-01, POL-02, POL-03)*

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Data Foundation | v1.0 | 1/1 | Complete | 2026-04-06 |
| 2. Server API | v1.0 | 2/2 | Complete | 2026-04-20 |
| 3. World Set Store | v1.0 | 3/3 | Complete | 2026-04-24 |
| 4. Management Dialog | v1.0 | 3/3 | Complete | 2026-05-05 |
| 5. Hierarchy Panel | v1.0 | 4/4 | Complete | 2026-05-10 |
| 6. Canvas Integration | v1.0 | 4/4 | Complete | 2026-05-22 |
| 7. Context Menu | v1.0 | 3/3 | Complete | 2026-05-28 |
| 8. Bug Fixes | v1.1 | 0/? | Not started | - |
| 9. UI Polish | v1.1 | 0/? | Not started | - |
| 10. View Panel Toggles | v1.1 | 0/? | Not started | - |
| 11. Tech Debt | v1.1 | 0/? | Not started | - |

---
*Last updated: 2026-05-30 — v1.1 roadmap created*
