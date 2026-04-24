# Phase 4: Management Dialog — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-24
**Phase:** 04-management-dialog
**Areas discussed:** Dialog structure, Add-node form, Scale picker UX, World set activation

---

## Dialog Structure

| Option | Description | Selected |
|--------|-------------|----------|
| A — Two-panel | Left column: world set list. Right column: node management. Everything visible at once. | |
| B — Sequential views | List view → node management view → configure-node view. Back button returns one level. | ✓ |
| C — Single scrollable | World set selector at top, node list below in same view. Compact. | |
| D — Slide-over drawer | List stays visible; detail panel slides in from right over the list. | |

**User's choice:** Option B — Sequential views  
**Notes:** Option A rejected due to split-panel width constraints and form cramping. Option B fits the existing dialog width and mirrors natural create→manage workflow.

---

## Add-Node Form

| Option | Description | Selected |
|--------|-------------|----------|
| A — Inline expanding | "Add" button reveals form below node list in the same view | |
| B — Third view (wizard step) | "Add" transitions to a dedicated configure-node view with Back/Add buttons | ✓ |
| C — Modal-within-dialog | Second smaller dialog appears over node management view | |

**User's choice:** Option B — Third view  
**Notes:** Extends the sequential pattern from the outer level. Keeps node list uncluttered.

---

## Scale Picker UX

### Question 1 — How does the picker appear?

| Option | Description | Selected |
|--------|-------------|----------|
| A — Inline replacement | "No scale" link in map list row; click reveals dropdown in-row | |
| B — Expansion row | Extra `.dialog-row` appears below map selector when scaleless map chosen | ✓ |

**User's choice:** Option B — Expansion row  
**Notes:** More visible; follows existing `.dialog-row` pattern throughout dialogs.

### Question 2 — When does scale write back to the map file?

| Option | Description | Selected |
|--------|-------------|----------|
| A — On "Add" confirm | Scale held in local state; written only when user clicks Add | ✓ |
| B — Immediately on selection | Scale saved to map as soon as dropdown changes | |

**User's choice:** Option A — On confirm  
**Notes:** Safer — no partial writes if user cancels. Aligns with explicit-save pattern from Phase 3 (D-03).

---

## World Set Activation

| Option | Description | Selected |
|--------|-------------|----------|
| A — Implicit on selection | Clicking world set in list calls `setActiveWorldSet(name)` as part of navigation | ✓ |
| B — Explicit "Set active" button | Separate button distinct from "manage nodes" action | |
| C — "Use this world set" button | Dedicated button inside the node management view | |

**User's choice:** Option A — Implicit activation  
**Notes:** Single-GM local tool; primary use is set up then use. Extra click in B/C adds friction without benefit.

---

## Claude's Discretion

- Exact label wording for the scale expansion row
- Real-time vs on-submit validation in configure-node view
- Deletion confirmation UX (confirm button vs type-to-confirm)
- Dialog width if node form fields need more space

## Deferred Ideas

None.
