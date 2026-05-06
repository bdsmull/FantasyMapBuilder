---
phase: 5
slug: hierarchy-panel
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-06
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1 |
| **Config file** | `frontend/vite.config.ts` (test: { environment: 'node', globals: true }) |
| **Quick run command** | `cd frontend && npm run test -- --reporter=verbose` |
| **Full suite command** | `cd frontend && npm run test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npm run test`
- **After every plan wave:** Run `cd frontend && npm run test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 5-01 | 01 | 1 | PANEL-01 | unit | `cd frontend && npm run test -- worldSetStore` | ✅ | ⬜ pending |
| 5-02 | 01 | 1 | PANEL-01 | unit | `cd frontend && npm run test -- WorldHierarchyPanel` | ❌ W0 | ⬜ pending |
| 5-03 | 01 | 1 | PANEL-02 | unit | `cd frontend && npm run test -- navigation` | ✅ | ⬜ pending |
| 5-04 | 01 | 1 | PANEL-02 | unit | `cd frontend && npm run test -- WorldHierarchyPanel` | ❌ W0 | ⬜ pending |
| 5-05 | 01 | 1 | PANEL-03 | unit | `cd frontend && npm run test -- WorldHierarchyPanel` | ❌ W0 | ⬜ pending |
| 5-06 | 01 | 1 | PANEL-04 | unit | `cd frontend && npm run test -- WorldHierarchyPanel` | ❌ W0 | ⬜ pending |
| 5-07 | 01 | 1 | PANEL-05 | unit | `cd frontend && npm run test -- WorldHierarchyPanel` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `frontend/src/__tests__/WorldHierarchyPanel.test.tsx` — stubs for PANEL-01 (collapse state), PANEL-02 (dirty guard), PANEL-03 (warning badges), PANEL-04 (context menu actions), PANEL-05 (null render)

**Note:** Vitest `environment: node` means DOM APIs are not available. Test logic functions (validation, collapse state) as pure utilities extracted from the component. Follow pattern of existing `worldSetDialog.test.ts` — test logic in isolation, not full render. Use `// @vitest-environment jsdom` header only if render testing is strictly required.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Context menu appears on right-click, positioned correctly (fixed, not clipped) | PANEL-04 | DOM positioning with `position: fixed` can't be verified in node env | Right-click a node; confirm menu appears and is not clipped by panel boundary |
| Drag handle resizes panel without stutter on fast drags | PANEL-01 | Pointer capture + mousemove behavior requires browser | Drag resize handle quickly; confirm smooth tracking |
| Warning badge tooltips not clipped by overflow:hidden on left-panel | PANEL-03 | CSS overflow behavior requires browser | Hover a warning badge; confirm tooltip is fully visible |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
