# Phase 3: World Set Store — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-22
**Phase:** 03-world-set-store
**Areas discussed:** navigateToMap location, dirty-map prompt mechanism, test scope, saveWorldSet behavior

---

## `navigateToMap()` Location and Cross-Store Access

| Option | Description | Selected |
|--------|-------------|----------|
| A) Standalone utility module | `navigation.ts` uses `useMapStore.getState()` and `useWorldSetStore.getState()` directly — stores stay independent | ✓ |
| B) Inside worldSetStore as action | `worldSetStore` imports `useMapStore` — violates "stores don't import each other" principle | |
| C) Callback-based | Callers inject the map load function — extra boilerplate at every call site | |

**User's choice:** Option A — standalone utility module
**Notes:** Idiomatic Zustand pattern; keeps store definitions independent; aligns with PROJECT.md principle

---

## Dirty-Map Prompt Mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| A) `saveFirst` boolean | Caller encodes the user's decision; utility just executes the chosen path; no UI in Phase 3 | ✓ |
| B) `window.confirm()` stopgap | Browser native prompt — works immediately, ugly, throwaway code | |
| C) Callback/promise parameter | `promptFn?: () => Promise<'save' \| 'discard' \| 'cancel'>` — clean separation but more complex | |

**User's choice:** Option A — `saveFirst` boolean
**Notes:** Phase 4+ UI components get user decision, then call `navigateToMap` with the result

---

## Test Scope

| Option | Description | Selected |
|--------|-------------|----------|
| A) Store actions only | addNode invariants, removeNode cascade, updateNode, setActiveWorldSet | |
| B) Store actions + navigation | Same as A plus navigateToMap with fetch mocking | |
| C) Comprehensive | Store + navigation + computed helpers (childrenOf, parentOf, rootNodes) | ✓ |

**User's choice:** Option C — comprehensive
**Notes:** computeFootprint/detectOverlaps already tested in worldSetUtils.test.ts — not duplicated

---

## `saveWorldSet()` Auto-Save Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| A) Explicit only | Mutations are in-memory; callers call saveWorldSet() when needed; mirrors mapStore | ✓ |
| B) Auto-save on every mutation | addNode/removeNode/updateNode each persist to server | |
| C) Auto-save only in navigateToMap | Explicit everywhere except when navigating away | |

**User's choice:** Option A — explicit only
**Notes:** Mirrors mapStore.saveMapToServer() pattern exactly

---

## Claude's Discretion

- Whether `navigateToMap()` lives in `navigation.ts` or alongside `worldSetUtils.ts`
- Warning mechanism for scale inversion / overlap (console.warn, returned metadata, or warnings array)
- Whether computed helpers are exported as plain functions or Zustand selectors

## Deferred Ideas

None — discussion stayed within phase scope.
