# Phase 4: Management Dialog — Research

**Researched:** 2026-05-03
**Domain:** React/TypeScript dialog component, Zustand store integration, world set lifecycle UI
**Confidence:** HIGH

## Summary

Phase 4 is a pure frontend task: create `WorldSetDialog.tsx` (three-view sequential component), add "World Sets…" to `MenuBar.tsx`, and wire the dialog into `App.tsx`. All store actions (`addNode`, `removeNode`, `setActiveWorldSet`, `saveWorldSet`), API client functions (`listWorldSets`, `deleteWorldSet`, `saveMap`), CSS classes, and data utilities (`computeFootprint`, `detectOverlaps`, `MAP_SCALES`) are fully built and tested from Phases 1–3. No new server work is needed.

The dialog follows the exact sequential-view pattern already established in `OpenMapDialog.tsx` and `NewMapDialog.tsx`. The only genuinely new UI pattern is the three-view navigation (`list → nodes → configure`) managed by a single `useState` discriminant. The configure-node view has one conditional expansion row (the scale picker for maps missing `feetPerUnit`) that mirrors the `scalePrompt` flow in `OpenMapDialog`.

**Primary recommendation:** Build `WorldSetDialog.tsx` as a single file with three conditional render branches keyed on `view` state. Reuse existing CSS classes throughout — no new CSS is needed for the basic layout.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01: Dialog structure — sequential views (list → detail → configure)**
- Three internal views navigated sequentially:
  1. List view — shows all world sets; Create and Delete actions
  2. Node management view — shows nodes for the selected world set; Add and Remove actions
  3. Configure-node view — form for a new node: parent map, anchor (col/row), Z, Z label, optional scale
- Navigation: selecting a world set enters node management view; "Add map node" button enters configure-node view; "Back" returns one level
- Each view is full-width — no split-panel layout
- Follows same sequential pattern used by existing dialogs; no sub-dialogs

**D-02: Add-node form — third view (wizard step), not inline**
- "Add map node" in node management view transitions to a dedicated configure-node view
- Configure-node view has its own Back and Add buttons
- The node list in node management view stays uncluttered

**D-03: Scale picker — expansion row; write-back on confirm only**
- If the selected map has no `feetPerUnit`, an extra `.dialog-row` appears below the map selector
- The row disappears if user switches to a map that already has a scale
- Scale value held in local dialog state — NOT written to the map until the user clicks "Add"
- On confirm: (1) write `feetPerUnit` to map file via `saveMap()`, (2) `addNode()`, (3) `saveWorldSet()`

**D-04: World set activation — implicit on selection**
- Clicking a world set in the list view calls `setActiveWorldSet(name)` as part of entering node management view
- No separate "Set active" button

**Carried Forward:**
- Scale inversion + overlap = warn-but-allow: show `.dialog-warn` inline in configure-node view; do not block "Add"
- Hard errors (duplicate mapName, cycle): show `.dialog-error` and block "Add"
- `saveWorldSet()` is explicit — called after node mutations, not automatic
- `navigateToMap()` is NOT needed in this dialog

### Claude's Discretion

- Exact wording of the "No scale set" label and expansion row prompt
- Whether configure-node view validates in real-time or on submit attempt
- Whether world set deletion requires typing the name or just a confirm button click
- CSS sizing — dialog width can exceed existing dialogs if needed for the node form

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DIALOG-01 | User can open a "World Sets" dialog from the menu bar | MenuBar.tsx prop pattern verified; App.tsx Dialog union extension pattern clear |
| DIALOG-02 | Dialog lists all world sets; user can create a new world set with a name | `listWorldSets()` + `saveWorldSet()` API functions exist; creation pattern mirrors NewMapDialog |
| DIALOG-03 | User can delete a world set with confirmation | `deleteWorldSet()` API function exists; confirm UI is Claude's discretion |
| DIALOG-04 | User can add a map to the active world set, selecting parent + anchor + Z + zLabel | `addNode()` store action fully implemented; `listMaps()` + `getMap()` available for map picker |
| DIALOG-05 | Map picker shows scale label; maps without `feetPerUnit` show inline scale picker | `MAP_SCALES`, `MAP_SCALE_BY_ID`, `scaleLabel()` available; `saveMap()` for write-back |
| DIALOG-06 | Dialog shows inline validation warnings (scale inversion, overlap) when adding/editing | `computeFootprint()` + `detectOverlaps()` from `worldSetUtils.ts`; AddNodeResult from store |
| DIALOG-07 | User can remove a map node from the active world set via the dialog | `removeNode()` store action available; cascades descendants automatically |
</phase_requirements>

---

## Standard Stack

### Core (all already installed — no new packages needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18.3 | Component rendering | Project standard |
| TypeScript | 5.6 | Type safety | Project standard |
| Zustand | 5.0 | State management | `useWorldSetStore` already exists |
| Vitest | 2.1 | Frontend testing | Project standard |

No new npm packages are required for this phase.

### Existing Utilities (consumed, not created)

| Module | Location | What it Provides |
|--------|----------|-----------------|
| `useWorldSetStore` | `store/worldSetStore.ts` | `setActiveWorldSet`, `addNode`, `removeNode`, `saveWorldSet`, `AddNodeResult` |
| `listWorldSets`, `getWorldSet`, `saveWorldSet`, `deleteWorldSet` | `api/client.ts` | World set CRUD |
| `listMaps`, `getMap`, `saveMap` | `api/client.ts` | Map list + fetch + feetPerUnit write-back |
| `MAP_SCALES`, `MAP_SCALE_BY_ID`, `scaleLabel` | `data/mapScales.ts` | Scale picker options, display strings |
| `computeFootprint`, `detectOverlaps` | `utils/worldSetUtils.ts` | Footprint overlap validation in configure view |

---

## Architecture Patterns

### Recommended Project Structure

New file only:

```
frontend/src/components/dialogs/
├── NewMapDialog.tsx      (existing)
├── OpenMapDialog.tsx     (existing)
├── TilesetDialog.tsx     (existing)
└── WorldSetDialog.tsx    (NEW — Phase 4)
```

Modified files:
- `frontend/src/components/MenuBar.tsx` — add `onWorldSets` prop + "World Sets…" menu item
- `frontend/src/App.tsx` — extend `type Dialog` union, add `onWorldSets` prop, render `WorldSetDialog`

### Pattern 1: Three-View Sequential Navigation

**What:** A single component file with a `view` discriminant driving conditional renders. No sub-dialogs, no split panels.

**When to use:** Any multi-step wizard within a single modal.

**State shape:**
```typescript
// Source: 04-CONTEXT.md D-01 specifics
type View = 'list' | 'nodes' | 'configure';
const [view, setView] = useState<View>('list');
const [selectedWorldSet, setSelectedWorldSet] = useState<string | null>(null);
```

**Navigation flow:**
```
list view
  → click world set → setActiveWorldSet(name) → setView('nodes')
  ← Back button → setView('list')

nodes view
  → "Add map node" button → setView('configure')
  ← Back button → setView('nodes')
```

### Pattern 2: Dialog Open/Close (mirrors existing dialogs)

```typescript
// Source: OpenMapDialog.tsx, App.tsx
export const WorldSetDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        {/* ... */}
      </div>
    </div>
  );
};
```

### Pattern 3: Async Action with Loading/Error State

```typescript
// Source: OpenMapDialog.tsx lines 60-84
const [loading, setLoading] = useState(false);
const [error, setError] = useState('');

const handleAction = async () => {
  setLoading(true);
  try {
    await someAsyncAction();
  } catch (e) {
    setError(String(e));
  } finally {
    setLoading(false);
  }
};
```

### Pattern 4: MenuBar Prop Extension

```typescript
// Source: MenuBar.tsx interface MenuBarProps
// Current props:
interface MenuBarProps {
  onNew: () => void;
  onOpen: () => void;
  onManageTilesets: () => void;
}
// Add:
  onWorldSets: () => void;
```

Menu item placement: under the File menu (after "Open…" separator group), or as a top-level "World Sets" menu — Claude's discretion.

### Pattern 5: App.tsx Dialog Union Extension

```typescript
// Source: App.tsx line 14
// Current:
type Dialog = 'new' | 'open' | 'tilesets' | null;
// Becomes:
type Dialog = 'new' | 'open' | 'tilesets' | 'worldSets' | null;

// MenuBar call (App.tsx ~line 49):
<MenuBar
  onNew={() => setActiveDialog('new')}
  onOpen={() => setActiveDialog('open')}
  onManageTilesets={() => setActiveDialog('tilesets')}
  onWorldSets={() => setActiveDialog('worldSets')}
/>

// Render block (App.tsx ~line 77):
{activeDialog === 'worldSets' && <WorldSetDialog onClose={() => setActiveDialog(null)} />}
```

### Pattern 6: Conditional Expansion Row (Scale Picker)

From `OpenMapDialog.tsx` `scalePrompt` flow — the exact same UX adapted for the configure-node view:

```typescript
// Source: OpenMapDialog.tsx lines 150-174 (scalePrompt block)
// In configure-node view, when selected map has no feetPerUnit:
{needsScale && (
  <div className="dialog-row">
    <label>Scale</label>
    <select value={chosenScale} onChange={(e) => setChosenScale(e.target.value)}>
      {MAP_SCALES.map((s) => (
        <option key={s.id} value={s.id}>{s.label} ({s.unit})</option>
      ))}
    </select>
  </div>
)}
```

The check for "needs scale":
```typescript
// feetPerUnit is not on TmjMap directly in the type — check: mapData.feetPerUnit
// NOTE: feetPerUnit comes from MAP_SCALE_BY_ID[mapData.scale]?.feetPerUnit
// See DATA-02: TmjMap has feetPerUnit?: number
const needsScale = !selectedMapData?.feetPerUnit;
```

### Pattern 7: AddNodeResult Handling

```typescript
// Source: worldSetStore.ts lines 114-177
const result = addNode(node);
if (!result.ok) {
  setError(result.error);   // blocks Add button until resolved
} else {
  if (result.warnings.length > 0) {
    setWarnings(result.warnings);  // show .dialog-warn but do NOT block
  }
  await saveWorldSet();
  setView('nodes');
}
```

### Pattern 8: Scale Inversion Warning (Dialog Level)

The store's `addNode` handles anchor-cell overlap warnings. The dialog adds a richer footprint-based check using `computeFootprint` + `detectOverlaps` before calling `addNode`:

```typescript
// Source: 04-CONTEXT.md "Carried Forward", worldSetUtils.ts
// Scale inversion check (warn, not block):
const parentNode = parentOf(parentMapName);
const parentMapData = await getMap(parentMapName);
const parentFPU = MAP_SCALE_BY_ID[parentMapData.scale]?.feetPerUnit;
const childFPU = MAP_SCALE_BY_ID[selectedMapData.scale]?.feetPerUnit ?? chosenScaleFPU;
if (childFPU >= parentFPU) {
  setWarnings(prev => [...prev, `Scale inversion: child is same or larger than parent`]);
}
```

### Anti-Patterns to Avoid

- **Inline create-node form in the nodes view:** D-02 explicitly prohibits this. Always navigate to the configure view.
- **Auto-saving on every mutation:** `saveWorldSet()` is explicit-save only (D-03). Only call it after user confirms "Add" or "Delete".
- **Blocking "Add" on warnings:** Scale inversion and overlap are warn-but-allow. Only duplicate mapName and cycle detection block.
- **Importing worldSetStore from mapStore (or vice versa):** Stores are deliberately decoupled. Cross-store behavior lives in `utils/navigation.ts`.
- **Using `scale` (string ID) instead of `feetPerUnit` (number) for scale ordering:** The comparison is always on `feetPerUnit` numeric values.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| World set CRUD | Custom fetch wrappers | `listWorldSets`, `saveWorldSet`, `deleteWorldSet` from `api/client.ts` | Already typed, error-handled |
| Node invariant checks | Custom duplicate/cycle logic | `addNode()` from `useWorldSetStore` — returns `AddNodeResult` | Tested, handles all hard blocks |
| Footprint math | Custom rectangle math | `computeFootprint()` from `worldSetUtils.ts` | Tests cover all edge cases incl. floor-center asymmetry |
| Overlap detection | Custom AABB check | `detectOverlaps()` from `worldSetUtils.ts` | Edge-touching and multi-pair cases handled |
| Scale data | Hard-coded scale values in component | `MAP_SCALES`, `MAP_SCALE_BY_ID`, `scaleLabel()` from `data/mapScales.ts` | Single source of truth |
| Modal overlay | Custom backdrop/positioning | `.dialog-backdrop` + `.dialog` CSS classes | Already styled, accessible click-to-dismiss |
| Warning/error display | Custom inline alert | `.dialog-warn` / `.dialog-error` CSS classes | Dark theme, already styled |
| Cascade removal | Walking descendants manually | `removeNode(mapName)` from store — BFS cascade built in | Handles full subtree removal |

**Key insight:** Every algorithmic and API piece for this dialog was built in Phases 1–3. Phase 4 is assembly work — wiring existing pieces into a UI.

---

## Common Pitfalls

### Pitfall 1: feetPerUnit Source Confusion

**What goes wrong:** `TmjMap.feetPerUnit` is the canonical value (DATA-02). `TmjMap.scale` is a string ID (e.g., `'dungeon'`). The map may have `scale` set but `feetPerUnit` absent (older maps). The configure-node view must check `mapData.feetPerUnit` directly (not `MAP_SCALE_BY_ID[mapData.scale]?.feetPerUnit`) to match what `addNode` and `computeFootprint` use.

**Why it happens:** `MapScale.feetPerUnit` and `TmjMap.feetPerUnit` look redundant but serve different purposes — one is a preset table, the other is the value stored in the file.

**How to avoid:** Use `mapData.feetPerUnit ?? MAP_SCALE_BY_ID[mapData.scale]?.feetPerUnit` to cover maps with a `scale` ID but no explicit `feetPerUnit`. Show the scale picker whenever `!mapData.feetPerUnit`.

**Warning signs:** Scale inversion warnings never triggering, or footprint appearing as 1×1 unexpectedly.

### Pitfall 2: Forgetting `e.stopPropagation()` on the Inner Dialog Div

**What goes wrong:** Clicking anywhere inside the dialog closes it because the backdrop click handler fires.

**Why it happens:** Event bubbling from inner elements reaches the `.dialog-backdrop` click handler.

**How to avoid:** `<div className="dialog" onClick={(e) => e.stopPropagation()}>` — verified in all three existing dialogs.

### Pitfall 3: Creating a World Set Without `setActiveWorldSet`

**What goes wrong:** World set is saved to server via `saveWorldSet(name, {...})` directly but the store's `activeWorldSet` is never updated, so the node management view has no data to show.

**Why it happens:** The direct API call bypasses the store.

**How to avoid:** After creating a world set via `saveWorldSet` API call, call `setActiveWorldSet(newName)` to load it from server into the store. Then navigate to the nodes view.

**Create sequence:**
```
1. POST to /api/world_sets/{name} with empty WorldSet (via saveWorldSet API)
2. await store.setActiveWorldSet(newName)  // loads from server, sets activeWorldSet
3. setView('nodes')
```

### Pitfall 4: Scale Write-Back Sequence Order

**What goes wrong:** Node is added to world set before `feetPerUnit` is written to the map file. The store now references a map with no scale — overlap/inversion checks give wrong results.

**Why it happens:** Calling `addNode` before `await saveMap(...)`.

**How to avoid:** Strictly follow D-03 sequence on "Add" confirm:
```
1. if needsScale: await saveMap(mapName, { ...mapData, feetPerUnit: selectedFPU })
2. result = addNode(node)
3. if result.ok: await saveWorldSet()
```

### Pitfall 5: noUnusedLocals / noUnusedParameters TypeScript Errors

**What goes wrong:** TypeScript strict mode flags unused imports or parameters, causing build failure.

**Why it happens:** `tsconfig.json` has `noUnusedLocals: true` and `noUnusedParameters: true`.

**How to avoid:** Import only what the component actively uses. If a variable is consumed conditionally, ensure all code paths use it or prefix with `_`.

### Pitfall 6: Not Clearing Error/Warning State on View Transition

**What goes wrong:** An error from the configure view persists when the user navigates Back and returns to configure.

**Why it happens:** Component state is not reset on view transitions.

**How to avoid:** On `setView('configure')` entry, reset `error` and `warnings` to empty. On Back, reset configure-specific form fields.

---

## Code Examples

### WorldSetDialog Local State Shape

```typescript
// Source: 04-CONTEXT.md D-01 specifics
type View = 'list' | 'nodes' | 'configure';

// List view state
const [worldSets, setWorldSets] = useState<string[]>([]);
const [view, setView] = useState<View>('list');
const [loading, setLoading] = useState(false);
const [error, setError] = useState('');

// Configure-node view state
const [parentMapName, setParentMapName] = useState<string | null>(null);
const [anchorCol, setAnchorCol] = useState(0);
const [anchorRow, setAnchorRow] = useState(0);
const [z, setZ] = useState(0);
const [zLabel, setZLabel] = useState('');
const [selectedMap, setSelectedMap] = useState('');
const [selectedMapData, setSelectedMapData] = useState<TmjMap | null>(null);
const [needsScale, setNeedsScale] = useState(false);
const [chosenScale, setChosenScale] = useState('building');
const [warnings, setWarnings] = useState<string[]>([]);
```

### World Set Creation

```typescript
// Source: client.ts saveWorldSet + worldSetStore.ts setActiveWorldSet
const handleCreate = async () => {
  const name = newName.trim();
  if (!name) { setError('Name is required'); return; }
  setLoading(true);
  try {
    const ws: WorldSet = { name, version: WORLD_SET_VERSION, nodes: [] };
    await saveWorldSetApi(name, ws);      // API: POST /api/world_sets/{name}
    await setActiveWorldSet(name);         // store: load from server
    setView('nodes');
  } catch (e) {
    setError(String(e));
  } finally {
    setLoading(false);
  }
};
```

### World Set Deletion

```typescript
// Source: client.ts deleteWorldSet
const handleDelete = async (name: string) => {
  setLoading(true);
  try {
    await deleteWorldSet(name);
    // Refresh list
    const updated = await listWorldSets();
    setWorldSets(updated);
    // If deleting the active world set, store auto-clears (existing behavior per D-04)
  } catch (e) {
    setError(String(e));
  } finally {
    setLoading(false);
  }
};
```

### Map Selection with Lazy Fetch in Configure View

```typescript
// Source: OpenMapDialog.tsx doOpen pattern (lines 72-83)
const handleMapSelect = async (mapName: string) => {
  setSelectedMap(mapName);
  setError('');
  try {
    const data = await getMap(mapName);
    setSelectedMapData(data);
    setNeedsScale(!data.feetPerUnit);
    if (!data.feetPerUnit) {
      const isHex = data.orientation === 'hexagonal';
      setChosenScale(isHex ? 'town' : 'building');
    }
  } catch (e) {
    setError(String(e));
  }
};
```

### Add Node Confirm Sequence

```typescript
// Source: 04-CONTEXT.md D-03 sequence
const handleAddNode = async () => {
  if (!selectedMap || !selectedMapData) return;
  setLoading(true);
  setError('');
  setWarnings([]);
  try {
    let finalMapData = selectedMapData;
    if (needsScale) {
      const fpu = MAP_SCALE_BY_ID[chosenScale]?.feetPerUnit;
      finalMapData = { ...selectedMapData, feetPerUnit: fpu };
      await saveMap(selectedMap, finalMapData);   // write-back to server first
    }
    const node: WorldSetNode = {
      mapName: selectedMap,
      parentMapName: parentMapName ?? null,
      parentAnchor: parentMapName ? { col: anchorCol, row: anchorRow } : null,
      z,
      zLabel: zLabel.trim() || null,
    };
    const result = addNode(node);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (result.warnings.length > 0) setWarnings(result.warnings);
    await saveWorldSet();
    setView('nodes');
  } catch (e) {
    setError(String(e));
  } finally {
    setLoading(false);
  }
};
```

---

## Environment Availability

Step 2.6: SKIPPED — Phase 4 is pure frontend component work. All dependencies (React, Zustand, Vitest, existing store/API modules) are already installed from prior phases. No external tools, services, or CLIs are introduced.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 2.1 |
| Config file | `frontend/vite.config.ts` (`test.environment: 'node'`, `globals: true`) |
| Quick run command | `cd frontend && npm run test -- --reporter=verbose --run` |
| Full suite command | `cd frontend && npm run test -- --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DIALOG-01 | "World Sets…" in menu opens dialog | manual smoke | n/a — no DOM in vitest | n/a |
| DIALOG-02 | Create world set with name | unit | `cd frontend && npm run test -- --run --reporter=verbose src/__tests__/worldSetDialog.test.ts` | ❌ Wave 0 |
| DIALOG-03 | Delete world set with confirmation | unit | same file | ❌ Wave 0 |
| DIALOG-04 | Add map node with parent/anchor/Z | unit | same file | ❌ Wave 0 |
| DIALOG-05 | Scale picker shown for unscaled maps; write-back on confirm | unit | same file | ❌ Wave 0 |
| DIALOG-06 | Validation warnings rendered (scale inversion, overlap) | unit | same file | ❌ Wave 0 |
| DIALOG-07 | Remove map node from world set | unit | same file | ❌ Wave 0 |

**Note on testing approach:** The existing Vitest config uses `environment: 'node'`, which means no DOM — the test style in `worldSetStore.test.ts` mocks the API client and exercises store logic directly. `WorldSetDialog` tests should follow the same pattern: test the async action handlers and state transitions rather than rendering the JSX. This is consistent with all existing frontend tests in the project (`__tests__/worldSetStore.test.ts`, `mapStore.test.ts`, etc.).

### Sampling Rate
- **Per task commit:** `cd frontend && npm run test -- --run`
- **Per wave merge:** `cd frontend && npm run test -- --run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `frontend/src/__tests__/worldSetDialog.test.ts` — covers DIALOG-02 through DIALOG-07 (action handlers, not JSX rendering)

*(No framework install needed — Vitest already configured.)*

---

## Open Questions

1. **`saveMap` vs `saveMapToServer` for feetPerUnit write-back**
   - What we know: `api/client.ts` exports `saveMap(name, data)` (direct API call). `mapStore` has `saveMapToServer()` which calls `saveMap` internally with the currently loaded map.
   - What's unclear: If the map being written is NOT the currently loaded map in `mapStore`, the dialog must call `saveMap()` directly (not `saveMapToServer()`), since `saveMapToServer()` saves whatever is in the store's `mapData`.
   - Recommendation: Always use `saveMap(mapName, updatedData)` directly from `api/client.ts` in the dialog — do not use `mapStore.saveMapToServer()`. This is consistent with D-03 and keeps the dialog independent of what's currently loaded.

2. **Parent map picker scope — root maps only, or any node in the world set?**
   - What we know: DIALOG-04 says "selecting parent + anchor + Z + zLabel". The world set can have multiple root nodes (null parentMapName).
   - What's unclear: Should the parent picker show ALL maps currently in the world set (as potential parents), or only the current map's direct context?
   - Recommendation: Show all maps currently in the world set (from `activeWorldSet.nodes`) as parent options, plus a "None (root node)" option. The store's cycle detection will block invalid choices.

3. **Anchor input UI — free number inputs vs. constrained range**
   - What we know: Parent anchor is `{ col: number, row: number }` in parent grid coordinates. No validation of "in bounds" is enforced at the store level.
   - What's unclear: Should the dialog constrain col/row to parent map dimensions?
   - Recommendation: Free `<input type="number">` without clamping — fetching parent map dimensions would require an extra network call per parent selection. Out-of-bounds anchors are a warn-but-allow case (not explicitly listed in validation rules but consistent with the overall warn-not-block philosophy for placement issues).

---

## Sources

### Primary (HIGH confidence)
- `frontend/src/components/dialogs/OpenMapDialog.tsx` — dialog layout, scalePrompt pattern, async action pattern, list selection pattern
- `frontend/src/components/dialogs/NewMapDialog.tsx` — form validation pattern, dirty-map guard
- `frontend/src/components/dialogs/TilesetDialog.tsx` — error display, table-in-dialog pattern
- `frontend/src/store/worldSetStore.ts` — AddNodeResult, all store actions and their signatures
- `frontend/src/api/client.ts` — all API function signatures
- `frontend/src/data/mapScales.ts` — MAP_SCALES, MAP_SCALE_BY_ID, scaleLabel
- `frontend/src/utils/worldSetUtils.ts` — computeFootprint, detectOverlaps, Footprint, FootprintedNode
- `frontend/src/App.tsx` — Dialog type union, MenuBar prop wiring, dialog render block
- `frontend/src/components/MenuBar.tsx` — MenuBarProps interface, menu item pattern
- `frontend/src/App.css` — all CSS classes confirmed present and styled
- `.planning/phases/04-management-dialog/04-CONTEXT.md` — all locked decisions

### Secondary (MEDIUM confidence)
- `frontend/src/__tests__/worldSetStore.test.ts` — confirms store contract and AddNodeResult shape
- `frontend/src/__tests__/worldSetUtils.test.ts` — confirms computeFootprint/detectOverlaps API
- `frontend/vite.config.ts` — confirms Vitest environment: node, globals: true

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all source files read directly
- Architecture patterns: HIGH — sourced from existing dialog implementations in the same codebase
- Pitfalls: HIGH — derived from reading actual source code, TypeScript config, and locked decisions
- Test approach: HIGH — vitest config and existing test style confirmed

**Research date:** 2026-05-03
**Valid until:** Not time-sensitive — this is pure internal codebase knowledge, not external library documentation
