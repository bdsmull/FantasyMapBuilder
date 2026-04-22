# Phase 3: World Set Store — Context

**Gathered:** 2026-04-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 3 delivers application state for the active world set and a shared navigation utility. Specifically:

1. `frontend/src/store/worldSetStore.ts` — Zustand store with `activeWorldSetName`, `activeWorldSet`, and all store actions
2. `frontend/src/utils/navigation.ts` — standalone `navigateToMap()` utility (not inside the store)
3. Computed helpers: `childrenOf()`, `parentOf()`, `rootNodes()` exported from the store file
4. Frontend tests in `frontend/src/__tests__/worldSetStore.test.ts` covering store actions, navigation utility, and computed helpers

No UI components, no dialog, no canvas work in scope for this phase.

</domain>

<decisions>
## Implementation Decisions

### D-01: `navigateToMap()` location — standalone utility module

- Lives in `frontend/src/utils/navigation.ts` (or equivalent standalone module), NOT inside `worldSetStore.ts`
- Accesses both stores via `useMapStore.getState()` and `useWorldSetStore.getState()` — idiomatic Zustand for cross-store utilities
- Keeps store definitions independent of each other (no circular imports, no `worldSetStore` importing `mapStore`)
- All future navigation triggers (hierarchy panel, canvas footprint, status bar breadcrumb) import and call this one utility

### D-02: Dirty-map guard — `saveFirst` boolean encodes caller's decision

- Signature: `navigateToMap(name: string, options: { saveFirst: boolean }): Promise<void>`
- `saveFirst: true` → save current map to server, then load the new map
- `saveFirst: false` → discard unsaved changes, load the new map directly
- The utility does NOT prompt — the caller is responsible for getting the user's decision before calling
- Phase 4+ UI components will show the "Save / Discard / Cancel" dialog, then call `navigateToMap` with the result
- If `mapStore.isDirty` is false, the `saveFirst` value is ignored — navigate immediately

### D-03: `saveWorldSet()` — explicit only, mirrors mapStore pattern

- `addNode()`, `removeNode()`, `updateNode()` update in-memory state only
- Callers explicitly call `saveWorldSet()` after mutations when persistence is needed
- `navigateToMap()` calls `saveWorldSet()` internally when `saveFirst: true`
- Mirrors `mapStore.saveMapToServer()` — always explicit, never auto-triggered by mutations

### D-04: Test scope — comprehensive

New test file: `frontend/src/__tests__/worldSetStore.test.ts`

Coverage:
- **Store actions**: `setActiveWorldSet()` loads/clears, `addNode()` blocks duplicates and cycles, `removeNode()` cascades to descendants, `updateNode()` patches cleanly, `saveWorldSet()` calls the API
- **Navigation utility**: `navigateToMap()` — saves-then-navigates when `saveFirst: true`, discards-then-navigates when `saveFirst: false`, skips save when map is not dirty
- **Computed helpers**: `childrenOf()`, `parentOf()`, `rootNodes()` with multi-level tree fixtures

Note: `computeFootprint` and `detectOverlaps` tests already exist in `worldSetUtils.test.ts` from Phase 1 — do not duplicate them.

### Carried Forward (from prior phases)

- Scale inversion + overlap = warn-but-allow: `addNode()` warns (console or returned warning) but does not throw
- No cycles, no duplicate mapNames = hard block: `addNode()` throws or returns an error for these
- `WorldSetNode.parentAnchor` is set iff `parentMapName` is set — enforce in `addNode()` / `updateNode()`

### Claude's Discretion

- Whether `navigateToMap()` lives in `navigation.ts` specifically or is co-located with `worldSetUtils.ts` — keep utilities colocated if sensible
- Warning mechanism for scale inversion / overlap — console.warn, returned metadata, or a warnings array on the store
- Whether computed helpers are exported as plain functions or Zustand selectors

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design Spec
- `docs/world-sets-design.md` — Full design spec; navigation, dirty-map guard, and invariants sections are directly relevant

### Existing Store (pattern to mirror)
- `frontend/src/store/mapStore.ts` — Zustand store pattern: interface definition, `create()` call, action implementations; `saveMapToServer()` is the explicit-save pattern to follow

### Existing Tests (style reference)
- `frontend/src/__tests__/mapStore.test.ts` — Zustand store test style: `useStore.setState()` for reset, `getState()` for assertions
- `frontend/src/__tests__/worldSetUtils.test.ts` — Existing utility tests (already passing from Phase 1 — do not re-test `computeFootprint`/`detectOverlaps`)

### Existing Utilities (Phase 1 output)
- `frontend/src/utils/worldSetUtils.ts` — `computeFootprint`, `detectOverlaps`, `FootprintedNode` — import from here, do not re-implement
- `frontend/src/types/worldSet.ts` — `WorldSet`, `WorldSetNode`, `WORLD_SET_VERSION` types

### API Client (Phase 2 output)
- `frontend/src/api/client.ts` — `getWorldSet`, `saveWorldSet`, `listWorldSets`, `deleteWorldSet` — the store uses these directly

### Requirements
- `.planning/REQUIREMENTS.md` — STORE-01 through STORE-09 (Store section)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useMapStore` from `mapStore.ts` — access via `useMapStore.getState()` in `navigateToMap()`; `loadMap(data, name)` and `saveMapToServer()` are the two actions needed
- `getWorldSet(name)` and `saveWorldSet(name, data)` from `client.ts` — used in `setActiveWorldSet()` and `saveWorldSet()` store action
- `computeFootprint` / `detectOverlaps` from `worldSetUtils.ts` — needed by `addNode()` for overlap detection

### Established Patterns
- **Zustand store**: `create<StoreInterface>()((set, get) => ({ ... }))` — follow `mapStore.ts` exactly
- **Explicit save**: mutations update state only; a separate `save*` action persists to server — same as `mapStore`
- **Store test reset**: `useStore.setState({ ... })` in `beforeEach` — see `mapStore.test.ts`
- **Async store actions**: `saveMapToServer` in `mapStore.ts` is `async` — `setActiveWorldSet` and `saveWorldSet` follow the same pattern

### Integration Points
- `navigateToMap()` utility is the single entry point for all navigation — Phase 4–7 components call this instead of calling store actions directly
- `frontend/src/store/` — new `worldSetStore.ts` goes here
- `frontend/src/utils/` — new `navigation.ts` (or alongside `worldSetUtils.ts`) goes here

</code_context>

<specifics>
## Specific Ideas

- `navigateToMap()` guard logic: check `useMapStore.getState().isDirty` — if false, skip save regardless of `saveFirst`
- `addNode()` should return or throw a discriminated result so callers can distinguish hard errors (duplicate/cycle) from soft warnings (overlap/scale inversion)
- The `removeNode()` cascade: given a flat `nodes` array with `parentMapName` references, BFS/DFS from the removed node to collect all descendants, then filter them all out in one operation

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 03-world-set-store*
*Context gathered: 2026-04-22*
