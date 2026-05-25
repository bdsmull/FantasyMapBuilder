# Phase 7: Context Menu — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-25
**Phase:** 07-context-menu
**Areas discussed:** Context menu content, "Create new map" flow, Mini-dialog approach, Current map as parent assumption

---

## Context Menu Content

### Q1: Right-click on existing footprint

| Option | Description | Selected |
|--------|-------------|----------|
| Same menu — 'Add child here' | Footprint is visual only; right-click always offers 'Add child here' | |
| Different menu for footprints | Footprint-specific options: Add child here + Edit + Remove | ✓ |
| Footprints block right-click | Right-clicking inside a footprint shows nothing | |

**User's choice:** Different menu for footprints
**Notes:** Footprint right-click shows three items: "Add child map here", "Edit [MapName]…", "Remove [MapName] from world set" — mirrors hierarchy panel context menu items.

### Q2: Footprint context menu items

| Option | Description | Selected |
|--------|-------------|----------|
| Add child here + Edit + Remove | Three items matching hierarchy panel behavior | ✓ |
| Navigate + Edit + Remove | 'Go to [MapName]' instead of 'Add child here' | |
| Just Add child here | Simple, consistent, no footprint-specific handling | |

**User's choice:** Add child here + Edit + Remove

### Q3: Menu visibility when current map not in world set

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — always show when world set is active | Menu appears regardless of whether current map is a node | |
| Only when current map is a node in the world set | Gate the menu on current map membership | ✓ |

**User's choice:** Only when current map is a node in the world set
**Notes:** If current map is not in the active world set, right-click falls through to tool.onRightPress?() as before.

---

## "Create New Map" Flow

### Q1: Create new map mechanic

| Option | Description | Selected |
|--------|-------------|----------|
| Type a new name inline | Text input option in picker; creates map before adding node | |
| Chain into NewMapDialog | Button opens NewMapDialog; returns with new map pre-selected | ✓ |
| Out of scope for this phase | Only pick existing maps in Phase 7 | |

**User's choice:** Chain into NewMapDialog

### Q2: After NewMapDialog closes

| Option | Description | Selected |
|--------|-------------|----------|
| Return to mini-dialog, new map pre-selected | Dialog stays open with new map selected; user configures Z/label/scale | ✓ |
| Mini-dialog pre-fills and submits automatically | Auto-adds with defaults after creation | |
| Just navigate to the new map | Navigate to new map; add to world set separately | |

**User's choice:** Return to mini-dialog, new map pre-selected

---

## Mini-Dialog Approach

### Q1: Extend WorldSetDialog vs new dialog

| Option | Description | Selected |
|--------|-------------|----------|
| Extend WorldSetDialog with initialAnchor | Add initialAnchor + hideParent props; reuse all existing logic | ✓ |
| New lightweight AddChildDialog | Separate simpler dialog; focused UX but duplicates logic | |

**User's choice:** Extend WorldSetDialog with initialAnchor

### Q2: Parent field visibility in mini-dialog

| Option | Description | Selected |
|--------|-------------|----------|
| Hide parent selection when opened from context menu | hideParent prop; parent locked to current map | ✓ |
| Show parent selection but pre-fill it | Full form, parent pre-filled but editable | |

**User's choice:** Hide parent selection when opened from context menu
**Notes:** Adds `hideParent?: boolean` prop alongside `initialAnchor`.

---

## Current Map as Parent Assumption

### Q1: Is current map always the parent on empty canvas right-click?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — current map is always the parent | Right-click implies 'add child to this map at this cell' | ✓ |
| Let user pick parent in the dialog | Show full parent selection even for empty canvas | |

**User's choice:** Yes — current map is always the parent

### Q2: Anchor behavior when editing from footprint context menu

| Option | Description | Selected |
|--------|-------------|----------|
| Anchor is editable, pre-filled with current anchor | Standard edit; user can change anchor if desired | ✓ |
| Anchor locked to right-clicked position | Move anchor to right-clicked cell | |

**User's choice:** Anchor is editable, pre-filled with current anchor (existing behavior)

---

## Claude's Discretion

- Exact CSS class names for canvas context menu
- Whether "Create new map…" is a `<select>` option or a separate button
- Context menu popup positioning within MapCanvas container
- Whether to add a visual separator between Add and Edit/Remove items

## Deferred Ideas

None.
