# Phase 8: Bug Fixes — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-03
**Phase:** 08-bug-fixes
**Areas discussed:** BUG-01 (Incompatible scale edge case), BUG-02 (Warning icon trigger), BUG-03 (Hex footprint drawing style)

---

## BUG-01: Incompatible Scale Edge Case

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-correct silently | selectedScaleId defaults to first compatible hex scale; no warning | |
| Auto-correct with hint | Defaults to first compatible scale with note 'Scale adjusted to match map type' | |
| Keep current selection | Show only compatible scales; if current is incompatible, keep it selected with a note | ✓ |

**User's choice:** Keep current selection — show only compatible scales, but if the existing saved scale is incompatible, include it as a disabled option (pre-selected but unclickable) with a visible warning note.

**Follow-up — How should the incompatible option appear in the `<select>`:**

| Option | Description | Selected |
|--------|-------------|----------|
| Include it at the top, visually marked | Labeled 'Room Scale (incompatible ⚠)' — still selectable | |
| Include it but disabled/greyed | Shows as pre-selected value but greyed; can't re-select after deselecting | ✓ |
| You decide | Claude picks cleanest approach | |

**Notes:** Matches warn-but-allow philosophy. User explicitly sees the incompatibility and must make an active change.

---

## BUG-03: Hex Footprint Drawing Style

| Option | Description | Selected |
|--------|-------------|----------|
| Outer perimeter polygon | Single closed outline following outer boundary of footprint cells | |
| Individual hex cell outlines | Each cell gets its own hexagonal outline (honeycomb pattern) | |
| Outer perimeter + fill | Perimeter polygon with same light semi-transparent fill as current style | ✓ |

**User's choice:** Outer perimeter polygon with fill — same visual style as the current rectangular footprint but with correct hex boundary shape.

**Follow-up — Placeholder footprints (no feetPerUnit):**

| Option | Description | Selected |
|--------|-------------|----------|
| Same hex perimeter (1×1 hex cell outline) | Single hex cell outline at anchor | |
| Keep as rectangle | Placeholder stays rectangular; hex shape only for real footprints | ✓ |

**Notes:** Hex perimeter drawing applies only when `precomputed !== undefined`. Placeholder retains current rectangle + `?` label behavior.

---

## BUG-02: Warning Icon Trigger

| Option | Description | Selected |
|--------|-------------|----------|
| After successful disk save (strict) | Clear only when saveMapToServer() resolves; mapStore tracks saved-version counter | ✓ |
| Optimistically on scale change | Clear as soon as setMapScale() updates store | |
| You decide | Claude picks cleanest approach | |

**User's choice:** After successful disk save (strict).

**Follow-up — Save signal mechanism:**

| Option | Description | Selected |
|--------|-------------|----------|
| savedVersion counter on mapStore | Increments on each save; hierarchy panel deps include it | |
| lastSavedMapName on mapStore | Tracks which map was last saved | |
| You decide | Claude picks cleanest given existing store shape | ✓ |

**Notes:** User deferred signal mechanism to Claude. Must not create circular store imports.

---

## Claude's Discretion

- Save-signal mechanism for BUG-02 (savedVersion counter vs lastSavedMapName)
- Whether `hexCorners()` is exported from `hexRenderer.ts` or reimplemented in `footprintOverlay.ts`
- Exact label text for the incompatible-scale warning note

## Deferred Ideas

None — discussion stayed within phase scope.
