# Phase 6: Canvas Integration — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-14
**Phase:** 06-canvas-integration
**Areas discussed:** Footprint click vs. tool, Touch/iPad tooltip, Overlay rendering structure, Status bar breadcrumb

---

## Footprint Click vs. Tool

| Option | Description | Selected |
|--------|-------------|----------|
| Navigate always | Clicking a footprint always navigates regardless of active tool | ✓ |
| Tool wins, explicit nav only | Active tool always wins; navigate only with pointer tool | |
| Context-dependent | Right-click/long-press navigates; left-click paints/erases | |

**User's choice:** Navigate always

**Notes:** User also raised terrain inheritance — when a child map covers a parent tile, the parent tile should reflect the dominant terrain of the child (80% forest → parent tile = forest). New child maps should be auto-populated from parent tiles. Noted as deferred idea (own phase).

---

### Footprint click — overlap handling

| Option | Description | Selected |
|--------|-------------|----------|
| Top-most / last-drawn wins | Rendering order determines click priority | |
| Smallest footprint wins | More specific child gets priority | |
| Show a picker | Popup lets user choose which overlapping child to navigate | ✓ |

**User's choice:** Show a picker

---

### Footprint click — hover visual feedback

| Option | Description | Selected |
|--------|-------------|----------|
| Footprint highlights | Hovered footprint changes color/opacity on canvas | ✓ |
| Cursor changes only | CSS cursor switches to pointer | |

**User's choice:** Footprint highlights (canvas highlight + cursor change)

---

### Footprint click — painting under footprints

| Option | Description | Selected |
|--------|-------------|----------|
| Footprints always intercept | Click inside footprint always navigates; painting under footprints blocked | ✓ |
| No change to painting | Tool wins for painting | |

**User's choice:** Footprints always intercept

---

## Touch/iPad Tooltip

| Option | Description | Selected |
|--------|-------------|----------|
| Tap once for tooltip, tap again to navigate | Two-tap model: first tap shows info, second navigates | ✓ |
| Single tap navigates immediately | No tooltip on touch; tap always navigates | |
| Long-press for tooltip, tap to navigate | Hold for info, tap to navigate | |

**User's choice:** Tap once to see tooltip, tap again to navigate

---

### Touch tooltip — dismissal

| Option | Description | Selected |
|--------|-------------|----------|
| Tap anywhere else on canvas | Tapping outside footprint dismisses tooltip | ✓ |
| Tap same footprint or tap elsewhere | Same behavior | |

**User's choice:** Tap anywhere else on canvas

---

### Touch tooltip — overlap picker on touch

| Option | Description | Selected |
|--------|-------------|----------|
| First tap opens picker, picker tap navigates | Consistent two-tap model for overlaps | ✓ |
| Overlapping touch always opens picker immediately | Skip tooltip step for overlaps | |

**User's choice:** First tap opens picker, picker tap navigates (consistent two-tap model)

---

## Overlay Rendering Structure

| Option | Description | Selected |
|--------|-------------|----------|
| New canvas/footprintOverlay.ts module | Separate module mirrors tileRenderer/hexRenderer pattern | ✓ |
| Integrated into tileRenderer / hexRenderer | Added as final pass inside existing renderers | |
| Drawn by MapCanvas itself | MapCanvas.tsx handles overlay directly | |

**User's choice:** New canvas/footprintOverlay.ts module

---

### Overlay visual style

| Option | Description | Selected |
|--------|-------------|----------|
| Dashed/dotted colored border, semi-transparent fill | Accent color outline + 5-10% opacity fill; warning color for placeholders | ✓ |
| Solid colored border, no fill | Outline only | |
| Claude's discretion | Claude chooses exact style | |

**User's choice:** Dashed/dotted colored border, semi-transparent fill

---

### Overlay label position

| Option | Description | Selected |
|--------|-------------|----------|
| Centered, clipped to footprint bounds | Label at center, truncate with ellipsis if small | ✓ |
| Top-left corner of footprint | Fixed anchor position | |
| Claude's discretion | Claude picks best position | |

**User's choice:** Centered, clipped to footprint bounds

---

### Overlay zoom visibility

| Option | Description | Selected |
|--------|-------------|----------|
| Always visible | Footprints shown at all zoom levels | ✓ |
| Hidden below a zoom threshold | Disappear at low zoom | |
| Claude's discretion | Claude picks threshold | |

**User's choice:** Always visible

---

## Status Bar Breadcrumb

### Breadcrumb content

| Option | Description | Selected |
|--------|-------------|----------|
| Single parent only, clickable | ↑ [Parent Name] — navigates up one level | ✓ |
| Full ancestor chain | World > Region > Dungeon full path | |
| Parent + world set name | [WorldSetName] / [ParentMapName] | |

**User's choice:** Single parent only, clickable

---

### Breadcrumb position

| Option | Description | Selected |
|--------|-------------|----------|
| Left side, before map name | Breadcrumb appears first in status bar | ✓ |
| Right side, after zoom | Appended at far right | |
| Claude's discretion | Claude places it | |

**User's choice:** Left side, before map name

---

### Breadcrumb on narrow viewports

| Option | Description | Selected |
|--------|-------------|----------|
| Truncate parent name with ellipsis | Always visible, never wraps | ✓ |
| Hide breadcrumb on narrow viewport | Omit on ≤1024px | |
| Icon only on narrow viewport | Up-arrow ↑ only, parent name in tooltip | |

**User's choice:** Truncate parent name with ellipsis

---

### Breadcrumb dirty-map guard

| Option | Description | Selected |
|--------|-------------|----------|
| Same modal as hierarchy panel | Save / Discard / Cancel modal | ✓ |
| Inline status bar prompt | Brief inline prompt inside status bar | |

**User's choice:** Same modal as hierarchy panel

---

## Claude's Discretion

- Exact footprint outline colors, dash pattern, fill opacity
- Font size/weight for footprint labels
- Picker popup appearance (may reuse `.context-menu` or new `.footprint-picker`)
- Cursor behavior when hovering footprint label vs. outline vs. fill
- Whether `renderFootprintOverlay` pre-computes footprint rects or calls `computeFootprint()` internally

## Deferred Ideas

- **Terrain inheritance** — parent tile should reflect dominant terrain of child map; new child maps auto-populated from parent tiles; own future phase
