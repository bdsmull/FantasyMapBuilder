# Phase 5: Hierarchy Panel — Research

**Researched:** 2026-05-06
**Domain:** React/TypeScript UI component — collapsible tree panel, drag-resize, context menu, dirty-map guard
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01: Left panel layout — stacked with resizable drag handle**
- `WorldHierarchyPanel` sits above `LayerPanel` in the left panel
- Both panels visible simultaneously when a world set is active
- Draggable divider between panels; sizes stored in component state (not persisted to localStorage)
- Drag handle uses pointer event handling; when no world set active, `WorldHierarchyPanel` is hidden entirely, `LayerPanel` takes full height (PANEL-05)

**D-02: World set header — name + dropdown switcher**
- Header shows "WORLD SET" + active world set name
- If multiple world sets exist, name is a `<select>` calling `setActiveWorldSet(name)`
- Single world set: static label (no dropdown)
- Follows `.panel-header` style

**D-03: Tree nodes — expand/collapse behavior**
- All nodes start expanded by default
- Collapse state persisted per world set name in component state (`Record<string, Set<string>>`)
- Leaf nodes show no expand/collapse arrow (but toggle rendered with `visibility: hidden` for alignment)
- Tree scrolls within the hierarchy panel section

**D-04: Active map highlighting**
- Node matching currently loaded map gets `.hierarchy-node.active` (same `#283a50` as `.layer-item.active`)
- No highlight if current map is not in active world set

**D-05: Warning badges — single ⚠ icon with tooltip**
- One `⚠` glyph per node regardless of issue count
- Tooltip on hover lists all issues (one per line)
- Four issue types: missing scale, overlap, scale inversion, missing map
- Warn-but-allow (no interaction blocked)

**D-06: Dirty-map guard — reuse existing dialog pattern**
- Modal dialog: Save / Discard / Cancel
- On Save: `navigateToMap(name, { saveFirst: true })`
- On Discard: `navigateToMap(name, { saveFirst: false })`
- On Cancel: abort navigation

**D-07: Context menu — custom CSS absolute-positioned popup**
- Right-click shows fixed-position popup at cursor
- Three items: "Add child here", "Remove from world set", "Change parent"
- Dismissed by click-outside or Escape
- "Add child here" → open `WorldSetDialog` (configure view, pre-selected parent)
- "Remove from world set" → `removeNode(mapName)` + `saveWorldSet()`, no confirmation
- "Change parent" → Claude's discretion

### Claude's Discretion

- "Change parent" UX approach
- Exact pixel breakpoints for drag handle (minimum heights for each panel section)
- Whether world set switcher is `<select>` or custom dropdown
- CSS class names for new hierarchy panel elements (follow `.layer-*` / `.panel-*` convention)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PANEL-01 | Left panel shows collapsible tree of active world set's map hierarchy | `rootNodes()` + `childrenOf()` already computed in worldSetStore; recursive render with depth-based indent |
| PANEL-02 | Clicking map node navigates to that map with dirty-map guard (Save/Discard/Cancel) | `navigateToMap()` in `utils/navigation.ts` is the single entry point; dirty-guard dialog mirrors `OpenMapDialog` pattern |
| PANEL-03 | Nodes with validation issues show warning badges | `detectOverlaps()` + `computeFootprint()` available in `worldSetUtils.ts`; missing scale check via `feetPerUnit` on TmjMap |
| PANEL-04 | Node context menu: "Add child here", "Remove from world set", "Change parent" | `removeNode()` + `saveWorldSet()` in worldSetStore; `WorldSetDialog` needs new props to open to configure view with pre-filled parent |
| PANEL-05 | Panel hidden when no world set is active | `activeWorldSetName === null` → render null; LayerPanel takes `flex: 1` |
</phase_requirements>

---

## Summary

Phase 5 is a pure frontend UI phase. All data infrastructure (store, API, types, navigation utility) was completed in Phases 1–4. The implementation is a single new React component (`WorldHierarchyPanel.tsx`) plus changes to `App.tsx` (panel stacking + drag handle) and `App.css` (new classes from the UI-SPEC).

The most complex parts are: (1) the resizable drag handle using pointer capture, (2) warning badge validation logic that requires fetching map data for feetPerUnit checks, and (3) wiring `WorldSetDialog` to open at the configure view with a pre-selected parent. The dirty-guard dialog is a local variant of the pattern in `OpenMapDialog`.

**Primary recommendation:** Implement in three waves — CSS additions first (Wave 0), then `WorldHierarchyPanel.tsx` core (tree + navigation + dirty guard), then context menu + `WorldSetDialog` integration. This mirrors the existing component architecture exactly.

---

## Standard Stack

### Core (all already installed — no new packages)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18.3 | Component rendering | Project stack |
| Zustand | 5.0 | State via `useWorldSetStore` + `useMapStore` | Project store pattern |
| TypeScript | 5.6 | Type safety | Project stack |

### Supporting (already available)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `listWorldSets` (api/client.ts) | — | Fetch world set names for switcher header | On component mount |
| `computeFootprint` (worldSetUtils.ts) | — | Compute footprint for overlap validation badge | Per node at render time |
| `detectOverlaps` (worldSetUtils.ts) | — | Overlap detection for validation badge | Per node at render time |
| `navigateToMap` (utils/navigation.ts) | — | Single map navigation entry point | On node click |

**No new npm packages needed.** This phase is entirely hand-rolled CSS + React components consistent with existing code.

---

## Architecture Patterns

### Recommended Project Structure

```
frontend/src/
├── components/
│   └── WorldHierarchyPanel.tsx    # NEW — full hierarchy panel component
├── components/dialogs/
│   └── WorldSetDialog.tsx          # MODIFIED — add initialView + initialParentMapName props
├── App.tsx                         # MODIFIED — add panel stacking + drag handle
└── App.css                         # MODIFIED — add ~14 new CSS classes per UI-SPEC
```

### Pattern 1: Component reads from two stores

`WorldHierarchyPanel` follows the same pattern as `LayerPanel` — a functional component that reads directly from Zustand stores and holds local UI state:

```typescript
// Source: existing LayerPanel.tsx pattern
import { useWorldSetStore } from '../store/worldSetStore';
import { useMapStore } from '../store/mapStore';

export const WorldHierarchyPanel: React.FC = () => {
  const { activeWorldSetName, activeWorldSet, rootNodes, childrenOf,
          removeNode, saveWorldSet, setActiveWorldSet } = useWorldSetStore();
  const { isDirty, mapName: currentMapName } = useMapStore();
  // ...local state for: collapseState, contextMenu, dirtyGuard, worldSetNames
};
```

### Pattern 2: Recursive tree rendering

The tree is rendered recursively. No external tree library — hand-rolled with depth parameter for indent:

```typescript
function renderNode(mapName: string, depth: number): React.ReactNode {
  const children = childrenOf(mapName);
  const isCollapsed = collapseState[activeWorldSetName]?.has(mapName) ?? false;
  return (
    <React.Fragment key={mapName}>
      <li className={`hierarchy-node${currentMapName === mapName ? ' active' : ''}`}
          style={{ paddingLeft: `calc(12px + ${depth} * 16px)` }}
          onClick={() => handleNodeClick(mapName)}
          onContextMenu={(e) => handleContextMenu(e, mapName)}>
        <button className="hierarchy-toggle"
                style={{ visibility: children.length === 0 ? 'hidden' : 'visible' }}
                onClick={(e) => { e.stopPropagation(); toggleCollapse(mapName); }}>
          {isCollapsed ? '▶' : '▾'}
        </button>
        <span className="layer-name">{mapName}</span>
        {hasWarning(mapName) && <WarningBadge mapName={mapName} warnings={getWarnings(mapName)} />}
      </li>
      {!isCollapsed && children.map(child => renderNode(child.mapName, depth + 1))}
    </React.Fragment>
  );
}
```

### Pattern 3: Drag handle with pointer capture

Use `setPointerCapture` on `pointerdown` so the drag continues even if the mouse leaves the element. Sizes are percentages of the left panel height, clamped to minimum values:

```typescript
// Source: UI-SPEC specifics section + standard pointer capture pattern
const handleResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
  e.currentTarget.setPointerCapture(e.pointerId);
  const startY = e.clientY;
  const startHeight = hierarchyHeight; // current pixel height
  const onMove = (moveEvent: PointerEvent) => {
    const delta = moveEvent.clientY - startY;
    const newHeight = Math.max(80, startHeight + delta);
    setHierarchyHeight(newHeight);
  };
  const onUp = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
  };
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
};
```

### Pattern 4: Context menu dismiss via global mousedown listener

```typescript
useEffect(() => {
  if (!contextMenu) return;
  const handler = (e: MouseEvent) => {
    // dismiss if click is outside the menu element
    setContextMenu(null);
  };
  document.addEventListener('mousedown', handler);
  return () => document.removeEventListener('mousedown', handler);
}, [contextMenu]);
```

### Pattern 5: Dirty-guard dialog (local to component)

The hierarchy panel owns its dirty-guard dialog inline (not a separate dialog component). This mirrors how `OpenMapDialog` owns its `dirtyWarn` state internally:

```typescript
// Local state
const [dirtyGuard, setDirtyGuard] = useState<{ targetMap: string } | null>(null);

const handleNodeClick = (mapName: string) => {
  if (isDirty) {
    setDirtyGuard({ targetMap: mapName });
  } else {
    navigateToMap(mapName, { saveFirst: false }).catch(console.error);
  }
};
```

### Pattern 6: WorldSetDialog integration for "Add child here"

`WorldSetDialog` currently uses internal `view` state. To open it from the panel context menu at a specific view with a pre-selected parent, add optional props:

```typescript
// WorldSetDialog.tsx — MODIFIED interface
interface Props {
  onClose: () => void;
  initialView?: 'list' | 'nodes' | 'configure';   // default: 'list'
  initialParentMapName?: string | null;            // pre-selects parent in configure view
}
```

In `WorldSetDialog`, use these in initial `useState` calls:

```typescript
const [view, setView] = useState<View>(props.initialView ?? 'list');
// In configure view, initialize parentMapName from prop on first render:
const [parentMapName, setParentMapName] = useState<string | null>(
  props.initialParentMapName ?? null
);
```

For "Change parent" — open `WorldSetDialog` with `initialView="configure"` and the node's existing data pre-loaded. The simplest clean approach: add `initialMapName?: string` prop alongside `initialParentMapName` so configure view is pre-populated with the node being changed.

### Pattern 7: Warning badge validation at render time

The validation for each node requires: (1) check if the map file exists (compare node.mapName against a list of known maps), (2) check if feetPerUnit is set, (3) check for scale inversion vs parent, (4) check overlap. Items 3 and 4 require per-map TmjMap data. Given that `WorldSetDialog` already does this (fetches map data into a `mapDataCache` record keyed by mapName), `WorldHierarchyPanel` should follow the same pattern: fetch all referenced map data on world set activation and cache it locally.

**Key insight:** Warning validation requires fetched map data. The component must maintain a local `mapDataCache: Record<string, TmjMap>` and populate it after `activeWorldSet` loads. Without this, all nodes default to "missing scale" warning on first render.

### Anti-Patterns to Avoid

- **Fetching map data per-render:** Don't call `getMap()` inside the render function or per-node rendering. Fetch once on `activeWorldSet` change, store in state.
- **Mutating collapse state:** The `Record<string, Set<string>>` shape requires replacing the outer record on each update — don't mutate Sets in place (violates React state immutability).
- **Using `display: none` for leaf node toggles:** The UI-SPEC requires `visibility: hidden` to preserve column alignment.
- **Single `leftPanelRef` for resize without clamping:** Always clamp to minimum heights (80px hierarchy, 60px layers) to prevent collapse to zero.
- **Registering mousedown handler globally before context menu is open:** Only register the dismiss handler when `contextMenu !== null` (use `useEffect` with contextMenu as dependency).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Footprint overlap | Custom AABB logic | `detectOverlaps()` from `worldSetUtils.ts` | Already tested, handles Z grouping |
| Map navigation | Custom fetch+load sequence | `navigateToMap()` from `utils/navigation.ts` | Handles dirty guard contract, error propagation |
| Tree data structure | Custom tree class | `rootNodes()` + `childrenOf()` from worldSetStore | Already computed, reactive to store changes |
| World set CRUD | New API calls | `listWorldSets`, `saveWorldSet` from `api/client.ts` | Already wrapped and typed |

**Key insight:** All data infrastructure is already built. This phase is 100% UI. The only new logic is: (1) validation badge derivation from cached map data + store selectors, and (2) the resize handle drag math.

---

## Common Pitfalls

### Pitfall 1: Stale collapse state when world set switches
**What goes wrong:** User switches world sets; the collapse state `Set` from the previous world set is still applied.
**Why it happens:** `collapseState` is keyed by world set name (`Record<string, Set<string>>`), so switching correctly isolates state — but only if the key is `activeWorldSetName`, not a stale closure value.
**How to avoid:** Always key collapse lookups as `collapseState[activeWorldSetName ?? '']`. Initialize the inner Set lazily (return empty Set if key missing = all nodes expanded by default).
**Warning signs:** Nodes that should be expanded show as collapsed after switching world sets.

### Pitfall 2: Warning badges always show "missing scale" on first render
**What goes wrong:** `mapDataCache` is empty on first render; validation logic sees no feetPerUnit for any map; every node shows a warning badge.
**Why it happens:** Map data must be fetched from the server; it's not in the world set file itself.
**How to avoid:** Don't render warning badges for nodes whose map data hasn't loaded yet. Use `if (!(mapName in mapDataCache)) return []` at the top of `getWarnings()`. Or show a loading indicator until the first cache population completes.
**Warning signs:** All nodes show `⚠` badges immediately on world set activation, then badges disappear.

### Pitfall 3: Context menu rendered inside the panel (clipped by overflow: hidden)
**What goes wrong:** Context menu is clipped by the `.hierarchy-tree` or `.left-panel` overflow.
**Why it happens:** The left panel uses `overflow: hidden` (see App.css line 130).
**How to avoid:** Render the context menu using `position: fixed` (not `absolute`) with `top/left` set to the cursor's `clientX/clientY` (not `pageX/pageY`). As specified in the UI-SPEC: `.hierarchy-ctx-menu { position: fixed; ... }`.
**Warning signs:** Context menu appears clipped at the panel boundary.

### Pitfall 4: Drag resize breaks on fast mouse movement
**What goes wrong:** User drags quickly and `pointermove` events miss the handle element; drag stops.
**Why it happens:** Without pointer capture, events stop arriving once the pointer leaves the element.
**How to avoid:** Call `e.currentTarget.setPointerCapture(e.pointerId)` on `pointerdown` (as specified in UI-SPEC Accessibility section). This is why the pattern uses `setPointerCapture` rather than a `ref`-based approach.
**Warning signs:** Resize drag stops working if mouse moves quickly.

### Pitfall 5: WorldSetDialog initialParentMapName prop ignored on re-render
**What goes wrong:** Opening the dialog a second time (different node) shows the first node's parent pre-selected.
**Why it happens:** `useState(props.initialParentMapName ?? null)` only uses the initial value; subsequent prop changes don't reset state.
**How to avoid:** Pass a `key` prop to `WorldSetDialog` that changes when the dialog is reopened: `<WorldSetDialog key={contextMenu.mapName} ... />`. This unmounts and remounts the dialog, so `useState` initializes fresh.
**Warning signs:** "Add child here" for node B shows node A's name pre-selected as parent.

### Pitfall 6: App.tsx left-panel flex layout breaks with fixed hierarchy height
**What goes wrong:** Setting `height: ${hierarchyHeight}px` directly causes the layer panel to overflow or shrink to zero, breaking the layout.
**Why it happens:** The `.left-panel` is `display: flex; flex-direction: column`. Children need `flex` sizing, not fixed heights, to respect the parent's height.
**How to avoid:** Use `flex: 0 0 ${hierarchyHeight}px` on the hierarchy panel wrapper and `flex: 1; min-height: 60px; overflow: hidden` on the layer panel. The total will respect the left panel's available height via the flexbox constraint.
**Warning signs:** Left panel overflows the editor area or layer panel disappears.

### Pitfall 7: Tooltip positioned absolutely inside node (clipped)
**What goes wrong:** Warning badge tooltip is clipped by `overflow: hidden` on `.hierarchy-tree`.
**Why it happens:** Tooltip is `position: absolute` inside the scrolling list.
**How to avoid:** Use `position: fixed` for the tooltip (same fix as context menu). Store tooltip position in state (set on `onMouseEnter`) and clear on `onMouseLeave`.
**Warning signs:** Tooltip truncated or invisible.

---

## Code Examples

### Collapse state shape
```typescript
// Source: CONTEXT.md specifics section (D-03)
const [collapseState, setCollapseState] = useState<Record<string, Set<string>>>({});

const toggleCollapse = (mapName: string) => {
  if (!activeWorldSetName) return;
  setCollapseState(prev => {
    const wsSet = new Set(prev[activeWorldSetName] ?? []);
    if (wsSet.has(mapName)) { wsSet.delete(mapName); } else { wsSet.add(mapName); }
    return { ...prev, [activeWorldSetName]: wsSet };
  });
};
```

### Warning derivation (per node)
```typescript
// Source: worldSetUtils.ts computeFootprint / detectOverlaps, CONTEXT.md D-05
function getWarnings(node: WorldSetNode, mapDataCache: Record<string, TmjMap>,
                     allNodes: WorldSetNode[]): string[] {
  const warnings: string[] = [];
  const data = mapDataCache[node.mapName];
  if (!data) return [];  // not loaded yet — show no badge

  if (!data.feetPerUnit && !data.scale) {
    warnings.push("Missing scale: no feetPerUnit set on this map");
  }
  if (node.parentMapName) {
    const parentData = mapDataCache[node.parentMapName];
    if (parentData) {
      const childFPU = data.feetPerUnit ?? MAP_SCALE_BY_ID[data.scale ?? '']?.feetPerUnit;
      const parentFPU = parentData.feetPerUnit ?? MAP_SCALE_BY_ID[parentData.scale ?? '']?.feetPerUnit;
      if (childFPU && parentFPU && childFPU >= parentFPU) {
        warnings.push("Scale inversion: this map is the same size or larger than its parent");
      }
    }
  }
  // overlap check: compute footprint + call detectOverlaps for siblings at same z
  // (full implementation follows worldSetDialog.tsx handleAddNode pattern)
  return warnings;
}
```

### Hierarchy panel in App.tsx
```tsx
// Source: CONTEXT.md D-01, UI-SPEC Panel State section
<aside className="left-panel">
  {activeWorldSetName !== null && (
    <>
      <div style={{ flex: `0 0 ${hierarchyHeight}px`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <WorldHierarchyPanel onOpenWorldSetDialog={openWorldSetDialogWithProps} />
      </div>
      <div className="panel-resize-handle" onPointerDown={handleResizePointerDown} />
    </>
  )}
  <LayerPanel />
</aside>
```

### WorldSetDialog prop extension
```typescript
// Source: CONTEXT.md integration points, Pitfall 5 above
interface Props {
  onClose: () => void;
  initialView?: 'list' | 'nodes' | 'configure';
  initialParentMapName?: string | null;
  initialMapName?: string;  // for "Change parent": pre-selects the map being edited
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Pointer events on document for drag | `setPointerCapture` on element | Modern browsers | More reliable drag across fast mouse moves |
| `display: none` for hidden items | `visibility: hidden` for layout-preserving hide | Always correct | Preserves toggle column alignment |

---

## Open Questions

1. **"Change parent" implementation scope**
   - What we know: UI-SPEC specifies opening `WorldSetDialog` in configure view with node's existing data pre-loaded (`initialView="configure"`, `initialMapName` prop)
   - What's unclear: `WorldSetDialog` configure view currently only creates new nodes via `addNode`; "change parent" needs to call `updateNode` instead. The dialog may need a conditional path.
   - Recommendation: Add an `initialMapName` prop to `WorldSetDialog`. When set, configure view operates in "edit" mode: pre-fill all fields from the existing node, and on submit call `updateNode()` instead of `addNode()`. Keep scope minimal — only `parentMapName` and `parentAnchor` can change (not `mapName` itself).

2. **Map data cache population for validation badges**
   - What we know: Validation requires `feetPerUnit` from each map's TmjMap; this requires fetching map files from the server.
   - What's unclear: Whether to fetch all at once on world set activation, or lazily per visible node.
   - Recommendation: Fetch all referenced maps on `activeWorldSet` change (same pattern as `WorldSetDialog` nodes-view `useEffect`). The world set typically has fewer than 20 maps; fetching all upfront is simpler and avoids per-render async complexity.

3. **Left panel total height with drag handle**
   - What we know: Minimum hierarchy height = 80px, minimum layer panel height = 60px. Resize handle = 4px.
   - What's unclear: How to recalculate on window resize without a ResizeObserver import.
   - Recommendation: Use a `window.addEventListener('resize', handler)` that re-reads the left panel's `offsetHeight` via a `ref`. Simple, no extra dependency.

---

## Environment Availability

Step 2.6: SKIPPED — this phase is purely frontend code/CSS changes with no new external dependencies. All tools (Node 24.14.0, npm, Vitest) confirmed available from prior phases.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1 |
| Config file | `frontend/vite.config.ts` (test: { environment: 'node', globals: true }) |
| Quick run command | `cd frontend && npm run test -- --reporter=verbose` |
| Full suite command | `cd frontend && npm run test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PANEL-01 | `rootNodes()` + `childrenOf()` produce correct tree structure for rendering | unit | `cd frontend && npm run test -- worldSetStore` | ✅ `worldSetStore.test.ts` |
| PANEL-01 | Collapse state toggling preserves other world set state | unit | `cd frontend && npm run test -- WorldHierarchyPanel` | ❌ Wave 0 |
| PANEL-02 | `navigateToMap` called with `saveFirst: false` when map is not dirty | unit | `cd frontend && npm run test -- navigation` | ✅ `navigation.test.ts` |
| PANEL-02 | Dirty-guard dialog renders and triggers correct navigation paths | unit | `cd frontend && npm run test -- WorldHierarchyPanel` | ❌ Wave 0 |
| PANEL-03 | Warning derivation: missing scale, scale inversion, overlap flags correct badges | unit | `cd frontend && npm run test -- WorldHierarchyPanel` | ❌ Wave 0 |
| PANEL-04 | `removeNode` + `saveWorldSet` called on "Remove from world set" | unit | `cd frontend && npm run test -- WorldHierarchyPanel` | ❌ Wave 0 |
| PANEL-05 | Panel renders null when `activeWorldSetName === null` | unit | `cd frontend && npm run test -- WorldHierarchyPanel` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd frontend && npm run test`
- **Per wave merge:** `cd frontend && npm run test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `frontend/src/__tests__/WorldHierarchyPanel.test.tsx` — covers PANEL-01 (collapse state), PANEL-02 (dirty guard), PANEL-03 (warning badges), PANEL-04 (context menu actions), PANEL-05 (null render)

Note: Vitest `environment: node` means DOM APIs are not available in tests. Testing the React component requires either switching the environment to `jsdom` for this test file (via a test-level comment `// @vitest-environment jsdom`) or testing the logic functions (validation, collapse state) extracted as pure utilities. The existing `worldSetDialog.test.ts` uses node environment and mocks the component — follow that pattern: test logic in isolation, not the full render.

*(Existing test infrastructure covers all prior requirements. New file needed for PANEL-01–05.)*

---

## Project Constraints (from CLAUDE.md)

| Directive | Impact on This Phase |
|-----------|---------------------|
| No new frameworks — extend existing patterns | No component library; hand-rolled CSS + React only |
| TypeScript strict mode + `noUnusedLocals`, `noUnusedParameters` | All new state variables and props must be used; no dead code |
| `interface` for data shapes, `type` for unions | Props interface for `WorldHierarchyPanel`; `type` for local context-menu/dirty-guard state |
| `camelCase` functions/variables, `PascalCase` components | `handleNodeClick`, `toggleCollapse`, `WorldHierarchyPanel` |
| Pure functions preferred; side effects isolated in store | Validation logic (getWarnings) must be a pure function taking data as args |
| `import type` for type-only imports | Use `import type { WorldSetNode }` etc. |
| Files: `camelCase.ts` / `PascalCase.tsx` | New file: `WorldHierarchyPanel.tsx` |
| No database; file-based storage | Not applicable (no new storage in this phase) |
| Tiled TMJ format compatibility | Not applicable |
| GSD workflow for file changes | Use GSD execute-phase, not direct edits |

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `frontend/src/components/LayerPanel.tsx` — component pattern
- Direct code inspection: `frontend/src/App.tsx` — left panel layout integration point
- Direct code inspection: `frontend/src/store/worldSetStore.ts` — available store actions
- Direct code inspection: `frontend/src/utils/navigation.ts` — navigation contract
- Direct code inspection: `frontend/src/components/dialogs/WorldSetDialog.tsx` — integration target
- Direct code inspection: `frontend/src/components/dialogs/OpenMapDialog.tsx` — dirty guard pattern
- Direct code inspection: `frontend/src/App.css` — existing CSS classes
- Direct code inspection: `frontend/src/utils/worldSetUtils.ts` — validation helpers
- Phase context: `.planning/phases/05-hierarchy-panel/05-CONTEXT.md` — locked decisions
- Phase UI contract: `.planning/phases/05-hierarchy-panel/05-UI-SPEC.md` — visual/interaction spec

### Secondary (MEDIUM confidence)
- MDN Pointer Events API: `setPointerCapture` behavior for drag-across-document — standard browser API
- React `visibility: hidden` vs `display: none` behavioral difference — well-established

### Tertiary (LOW confidence)
None.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all existing, no new dependencies
- Architecture: HIGH — direct inspection of all integration points
- Pitfalls: HIGH — derived from actual code patterns (dirty guard in OpenMapDialog, overflow:hidden in App.css, setPointerCapture for drag)
- Validation: HIGH — existing Vitest infrastructure confirmed, gaps identified

**Research date:** 2026-05-06
**Valid until:** 2026-06-06 (stable stack; no fast-moving libraries)
