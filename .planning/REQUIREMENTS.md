# Requirements: Fantasy RPG Map Editor

**Defined:** 2026-05-30
**Core Value:** A seamless, hierarchical map system where a GM can click from a world map down to a dungeon room and back, with every level of geography connected and browsable.

## v1.1 Requirements

### Bug Fixes

- [ ] **BUG-01**: Map Properties scale picker only shows scales compatible with the map's orientation (tile scales for orthogonal maps, hex scales for hexagonal maps)
- [ ] **BUG-02**: World Set warning icon clears immediately after map scale is corrected and saved via Map Properties — no reload required
- [ ] **BUG-03**: Hex child footprint outline traces actual hex cell boundaries rather than an axis-aligned bounding rectangle

### UI Polish

- [ ] **POL-01**: Hierarchy panel expand/collapse toggle icons (▶/▾) render at the same visual size — collapsed and expanded states are consistent
- [ ] **POL-02**: WorldSetDialog nodes view has a visible Close/Done button
- [ ] **POL-03**: "World Sets" menu item is accessible from a top-level or File menu (not buried in Edit)

### Panel Visibility

- [ ] **VIS-01**: View menu has checkmark toggle items for Toolbar, Tile Palette, Layer Panel, and Status Bar
- [ ] **VIS-02**: Panel visibility state persists across page reloads via localStorage

### Tech Debt

- [ ] **DEBT-01**: object-add redo correctly restores placed objects (was silently a no-op)
- [ ] **DEBT-02**: removeTileset() uses immutable store update (no direct state mutation)

## Future Requirements

*(None identified for v1.2 yet)*

## Out of Scope

| Feature | Reason |
|---------|--------|
| Keyboard shortcuts for panel toggles | Nice-to-have but not required per GitHub #4 |
| Exact hex footprint math (sub-cell precision) | Accepted approximation documented in PROJECT.md |
| Canvas right-click on iOS/iPad | Non-standard pointer event behavior; hierarchy panel context menu is the iPad path |

## Traceability

*(Populated by roadmapper)*

| Requirement | Phase | Status |
|-------------|-------|--------|

**Coverage:**
- v1.1 requirements: 10 total
- Mapped to phases: 0
- Unmapped: 10 ⚠️

---
*Requirements defined: 2026-05-30*
*Last updated: 2026-05-30 — initial v1.1 definition*
