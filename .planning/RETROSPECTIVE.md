# Retrospective: Fantasy RPG Map Editor

---

## Milestone: v1.0 — World Sets

**Shipped:** 2026-05-30
**Phases:** 7 | **Plans:** 20 | **Timeline:** 54 days (2026-04-06 → 2026-05-30)

### What Was Built

- Pure TypeScript data layer: `WorldSetNode`/`WorldSet` types, `computeFootprint`, `detectOverlaps` (Phase 1)
- FastAPI CRUD router for `.worldset.json` files with 11 pytest-asyncio tests (Phase 2)
- Zustand `worldSetStore` with invariant enforcement (cycle/duplicate detection), BFS descendant removal, shared `navigateToMap()` utility (Phase 3)
- Full management dialog: create/delete world sets, add/remove map nodes, inline scale picker, overlap warnings (Phase 4)
- Hierarchy panel: collapsible tree, warning badges, dirty-guard navigation, node context menu (Phase 5)
- Canvas footprint overlay: dashed child outlines, hover tooltip, click-to-navigate, amber placeholder, status bar breadcrumb (Phase 6)
- Canvas right-click context menu with anchor pre-fill and "Create new map" chain (Phase 7)
- 152 Vitest tests + 178 Python tests

### What Worked

- **Bottom-up phase structure** paid off cleanly. Each phase built on a stable previous layer. No phase 5 or 6 needed to reach back and fix Phase 2 or 3.
- **Single `navigateToMap()` utility** (Phase 3 decision) eliminated duplicated dirty-guard logic across hierarchy panel, canvas footprint click, and status bar breadcrumb — three consumers, one implementation.
- **Warn-but-allow for scale inversion and overlap** was the right call. GMs needed flexibility; hard-blocking would have frustrated testing.
- **Smoke test checkpoints** in phases 04-03, 05-04, 06-04 caught real bugs (resize handle upper-bound, localStorage persistence, left-panel toggle) that automated tests couldn't catch.
- **Audit → UAT → VERIFICATION flow** worked well for Phase 5 which had skipped formal verification during execution — the milestone audit identified the gap, UAT confirmed the feature in 12 tests.

### What Was Inefficient

- **ROADMAP.md progress table** drifted badly — phases 4-7 stayed "In Progress" throughout their full execution. Updates should happen during execute-phase, not just at milestone close.
- **SUMMARY frontmatter `requirements-completed`** was absent from many plans (03-01, 03-03, 04-01..03, 05-01, 05-02, 05-04, 06-04, 07-01..03), making 3-source traceability incomplete. The executor should always populate this field.
- **Phase 5 skipped gsd-verifier** — the UAT and smoke test were there but the VERIFICATION.md wasn't produced, blocking the milestone audit until caught. `verify-work` should run immediately after each phase's last plan completes.
- **API-06 traceability row** stayed "Pending" in REQUIREMENTS.md after Plan 02-02 completed — stale documentation that created false ambiguity at audit time.

### Patterns Established

- **Mirror pattern**: Python algorithms implemented first, then ported to TypeScript with `@mirrors` comments — used in `hexRenderer.ts`, `footprintOverlay.ts`
- **Null-guard pattern**: components return `null` when their feature gate (e.g., `activeWorldSetName === null`) is not met — clean and predictable
- **setTimeout(0) deferred listener**: prevents context menus from self-closing by deferring global mousedown/keydown registration past the triggering event
- **Force-remount via `key` prop**: `worldSetDialogKey` incremented on each dialog open to reset all `useState` initializers — avoids stale state between consecutive open/close cycles
- **mapDataCache useEffect**: fetches map data per node only when not already cached — prevents spurious validation badges before data loads

### Key Lessons

- Run `gsd:verify-work` immediately after each phase completes — don't defer to milestone audit time
- Populate `requirements-completed` frontmatter in every SUMMARY.md at plan completion time
- Update ROADMAP.md progress table as part of `execute-phase` completion, not at milestone close
- Canvas features that require touch testing (context menu, two-tap navigation) should call out iOS/Android limits explicitly in phase scope
- The hierarchy panel's `position: fixed` context menu approach (no portal) is a clean pattern for constrained-overflow containers — reuse in future panel components

### Cost Observations

- Model mix: primarily Sonnet 4.x with Opus for complex planning phases
- 54-day wall-clock timeline included normal development pace gaps
- No major rework required on any phase — bottom-up design held

---

## Cross-Milestone Trends

*(Populated as milestones accumulate)*

| Milestone | Phases | Plans | Tests | Duration |
|-----------|--------|-------|-------|----------|
| v1.0 World Sets | 7 | 20 | 330 (152 TS + 178 Py) | 54 days |
