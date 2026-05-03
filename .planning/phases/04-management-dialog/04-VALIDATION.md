---
phase: 4
slug: management-dialog
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-03
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 2.1 |
| **Config file** | `frontend/vite.config.ts` |
| **Quick run command** | `cd frontend && npm run test -- --reporter=verbose --run` |
| **Full suite command** | `cd frontend && npm run test -- --run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npm run test -- --reporter=verbose --run`
- **After every plan wave:** Run `cd frontend && npm run test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 1 | DIALOG-01 | unit | `cd frontend && npm run test -- --run` | ❌ W0 | ⬜ pending |
| 4-01-02 | 01 | 1 | DIALOG-02 | unit | `cd frontend && npm run test -- --run` | ❌ W0 | ⬜ pending |
| 4-01-03 | 01 | 1 | DIALOG-03 | unit | `cd frontend && npm run test -- --run` | ❌ W0 | ⬜ pending |
| 4-02-01 | 02 | 2 | DIALOG-04 | unit | `cd frontend && npm run test -- --run` | ❌ W0 | ⬜ pending |
| 4-02-02 | 02 | 2 | DIALOG-05 | unit | `cd frontend && npm run test -- --run` | ❌ W0 | ⬜ pending |
| 4-02-03 | 02 | 2 | DIALOG-06 | unit | `cd frontend && npm run test -- --run` | ❌ W0 | ⬜ pending |
| 4-02-04 | 02 | 2 | DIALOG-07 | unit | `cd frontend && npm run test -- --run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `frontend/src/components/__tests__/WorldSetDialog.test.tsx` — stubs for DIALOG-01 through DIALOG-07
- [ ] Existing `frontend/src/store/__tests__/worldSetStore.test.ts` — already covers store actions

*Existing test infrastructure (vitest, node environment, api mock pattern) covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Scale picker inline UI renders correctly | DIALOG-05 | No DOM renderer in vitest (node env) | Open dialog, select a map without feetPerUnit, verify "No scale set — click to set" link appears and inline picker renders |
| Footprint overlap warning renders | DIALOG-07 | No DOM renderer in vitest (node env) | Add overlapping nodes, verify warning text appears in dialog UI |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
