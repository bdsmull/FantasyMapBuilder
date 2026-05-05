# Phase 5: Hierarchy Panel — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-05
**Phase:** 05-hierarchy-panel
**Areas discussed:** Left panel layout, Context menu actions, Warning badge presentation, World set header/switcher, Dirty-map guard UX, Tree collapse/expand behavior, Context menu implementation, Active map highlighting

---

## Left Panel Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Stacked | Both panels visible simultaneously, with divider | ✓ |
| Tabbed | Toggle between Hierarchy and Layers views | |
| Conditional replace | Hierarchy replaces LayerPanel when world set active | |

**Fixed split or resizable?**

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed split | Claude decides reasonable split | |
| Fixed, hierarchy fills available space | Hierarchy scrolls if tall | |
| Resizable drag handle | User drags divider to resize | ✓ |

---

## Context Menu — "Add Child Here"

| Option | Description | Selected |
|--------|-------------|----------|
| Open WorldSetDialog configure view | Reuse Phase 4 UI, pre-select parent | ✓ |
| Defer to Phase 7 | Skip from Phase 5 panel context menu | |
| Inline popover | Small floating form | |

**User note:** Asked why WorldSetDialog was recommended when Phase 7 plans "Add child here". Clarified that Phase 7 is canvas-specific (pre-fills anchor from clicked cell), while Phase 5 context menu is on tree nodes (no canvas cell involved). These are different surfaces.

## Context Menu — "Change Parent"

| Option | Description | Selected |
|--------|-------------|----------|
| Open WorldSetDialog nodes view | Remove + re-add with new parent | |
| Inline parent picker | Dropdown in tree node row | |
| Claude's discretion | Leave to Claude | ✓ |

---

## Warning Badge Presentation

| Option | Description | Selected |
|--------|-------------|----------|
| ⚠ icon with tooltip | Single icon, hover shows issue details | ✓ |
| Colored dot per severity | Red/yellow circle, no tooltip | |
| Short label badge | Pill with abbreviated text | |

---

## World Set Header / Switcher

| Option | Description | Selected |
|--------|-------------|----------|
| Name + dropdown switcher | Shows name, dropdown if multiple exist | ✓ |
| Name only, no switcher | Static label | |
| No header | Tree starts immediately | |

---

## Dirty-Map Guard UX

| Option | Description | Selected |
|--------|-------------|----------|
| Inline in panel | Save/Discard/Cancel strip in panel | |
| Reuse existing dialog pattern | Modal consistent with OpenMapDialog | ✓ |

---

## Tree Collapse/Expand

| Option | Description | Selected |
|--------|-------------|----------|
| All expanded, no persistence | Resets on hide/show | |
| All expanded, persist per world set | State keyed by world set name, session-only | ✓ |
| Claude's discretion | | |

**Leaf nodes:**

| Option | Description | Selected |
|--------|-------------|----------|
| No arrow on leaf nodes | Only show toggle when node has children | ✓ |
| Greyed-out arrow | Faded arrow on leaves | |

---

## Context Menu Implementation

| Option | Description | Selected |
|--------|-------------|----------|
| Custom CSS absolute-positioned popup | Div at cursor, dismissed by click-outside or Escape | ✓ |
| Browser native contextmenu | Uses browser <menu> element | |

---

## Active Map Highlighting

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, highlight current map | Visual highlight matching LayerPanel active style | ✓ |
| No highlight | No special treatment | |

**Map not in world set:**

| Option | Description | Selected |
|--------|-------------|----------|
| No highlight, tree shows normally | No special treatment | ✓ |
| Notice in panel header | Small "not in this world set" note | |

---

## Claude's Discretion

- "Change parent" UX
- Exact pixel breakpoints for drag handle minimum heights
- World set switcher element type (select vs custom dropdown)
- CSS class names for new hierarchy panel elements

## Deferred Ideas

None — discussion stayed within phase scope.
