# Phase 7: Context Menu — Research

**Researched:** 2026-05-25
**Domain:** React context-menu overlay, WorldSetDialog prop extension, canvas right-click integration
**Confidence:** HIGH — all findings come directly from reading the live codebase; no external sources needed for this phase

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01: Context menu visibility gate**
- Appears ONLY when: (a) world set is active AND (b) current map is a node in that world set
- If either condition is false, `button === 2` falls through to `tool.onRightPress?.()` as before

**D-02: Two menu variants**
- Empty canvas: one item — "Add child map here"
- Footprint hit: three items — "Add child map here", "Edit [MapName]…", "Remove [MapName] from world set"

**D-03: "Add child map here" opens WorldSetDialog**
- Props: `initialView='configure'`, `initialParentMapName=currentMapName`, `initialAnchor={col, row}`, `hideParent=true`
- New props to add: `initialAnchor?: { col: number; row: number }` and `hideParent?: boolean`

**D-04: "Edit [MapName]…" opens WorldSetDialog**
- Props: `initialMapName=footprintMapName`, `initialView='configure'`
- `hideParent` NOT set; full edit form with existing anchor pre-filled

**D-05: "Remove [MapName]" from footprint context menu**
- Calls `removeNode(footprintMapName)` + `saveWorldSet()` immediately, no confirmation

**D-06: "Create new map" chaining**
- Map picker in configure view gets a "Create new map…" option or button
- Opens `NewMapDialog`; when it closes, reopens/stays open with new map pre-selected

**D-07: Canvas context menu CSS**
- New class `.canvas-ctx-menu`; reuse/mirror `.hierarchy-ctx-menu` styles
- Dismissed by outside click or Escape — same pattern as `WorldHierarchyPanel`

### Claude's Discretion
- Exact CSS class names (`.canvas-ctx-menu` is a suggestion)
- Whether "Create new map…" is a `<option>` or a separate button below the `<select>`
- Positioning of the context menu popup (absolute within `MapCanvas` container)
- Whether to add a separator line between "Add child here" and "Edit/Remove" items

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CTX-01 | Right-clicking the canvas when a world set is active shows a context menu | D-01 gate logic + MapCanvas `onPointerDown` at `e.button === 2` (line 320) |
| CTX-02 | "Add child map here" option pre-fills anchor from the clicked cell | `pointerToTile()` returns `{col, row}`; `initialAnchor` prop seeds `anchorCol`/`anchorRow` state in configure view |
| CTX-03 | Mini-dialog lets user pick an existing map (or create new) and set Z + optional label | WorldSetDialog configure view already has this; "Create new map" chain adds NewMapDialog interop |
| CTX-04 | If selected map has no `feetPerUnit`, dialog includes scale picker that writes it back | `needsScale` logic + `handleAddNode` Step 1 already do this; no new backend work needed |
</phase_requirements>

---

## Summary

Phase 7 is predominantly a UI wiring task on existing infrastructure. All the hard work — footprint hit-testing, store mutations, dialog state management, CSS popup patterns — already exists and is verified working from Phases 5 and 6. The phase delivers three coordinated changes:

1. **`WorldSetDialog.tsx`** gains two new props (`initialAnchor`, `hideParent`) that seed configure-view state and conditionally hide the parent selector field. The dialog already handles `initialParentMapName`, `initialMapName`, and `initialView`; these two props are purely additive.

2. **`MapCanvas.tsx`** gets a right-click handler that guards on world-set membership, calls `footprintAtPoint()` (already imported), sets context-menu state, and renders a `<ul>` overlay using the existing sibling-div overlay pattern. The handler must run BEFORE `tool.onRightPress?.()` — it short-circuits that call when the gate passes.

3. **`App.css`** gets `.canvas-ctx-menu` styles mirroring `.hierarchy-ctx-menu` (copied verbatim with a class rename).

The "Create new map" chain in D-06 is the most novel piece: `WorldSetDialog` needs a way to open `NewMapDialog` and receive the new map name back. Since `WorldSetDialog` is rendered by `App.tsx` (not inside `MapCanvas`), this chain must be brokered through props — either a new `onRequestNewMap` callback or by lifting dialog state into `App.tsx`. The existing `handleOpenWorldSetDialog` pattern in `App.tsx` is the reference for how cross-dialog coordination works.

**Primary recommendation:** Implement in three sequential plans — (1) `WorldSetDialog` prop extension + "Create new map" chain, (2) `MapCanvas` right-click handler + context menu overlay + CSS, (3) test coverage. The "Create new map" chain is the highest-risk piece and should be designed first.

---

## Standard Stack

### Core (all already in the project — no new installs)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React 18.3 | 18.3.x | Component rendering, state hooks | Project stack |
| Zustand 5.0 | 5.0.x | `worldSetStore` mutations | Project stack |
| TypeScript 5.6 | 5.6.x | Type-safety for new props | Project stack |

No new npm packages required for this phase.

### Key Internal APIs Already Available

| API | Source | What it provides |
|-----|--------|-----------------|
| `footprintAtPoint(x, y, rendered)` | `footprintOverlay.ts` | Returns `string[]` of mapNames at canvas point |
| `renderedFootprintsRef.current` | `MapCanvas.tsx` | Hit-test data from last render pass |
| `pointerToTile(e)` | `MapCanvas.tsx` (local fn) | Converts pointer event → `{col, row}` tile coords |
| `removeNode(mapName)` | `worldSetStore.ts` | Removes node + all descendants |
| `saveWorldSet()` | `worldSetStore.ts` | Persists to server |
| `handleOpenWorldSetDialog(args)` | `App.tsx` → `WorldHierarchyPanel` | Opens WorldSetDialog with arbitrary args |

---

## Architecture Patterns

### Recommended Project Structure

No new files or directories. All changes are in:
```
frontend/src/
├── components/
│   ├── MapCanvas.tsx              # right-click handler, canvas-ctx-menu overlay
│   └── dialogs/
│       └── WorldSetDialog.tsx     # initialAnchor + hideParent props, create-new chain
└── App.css                        # .canvas-ctx-menu styles
```

One test file added:
```
frontend/src/
└── __tests__/
    └── canvasContextMenu.test.ts  # CTX-01 through CTX-04 contract tests
```

### Pattern 1: Canvas Overlay (Sibling Div)

Existing overlays in `MapCanvas.tsx` (`footprint-tooltip`, `footprint-picker`) are `<div>`/`<ul>` siblings of the `<canvas>` element inside the React fragment. The context menu follows the same pattern.

```typescript
// Source: MapCanvas.tsx lines 460-485 (footprint-picker as reference)
{pickerPos !== null && pickerCandidates.length > 0 && (
  <ul
    ref={pickerRef}
    className="footprint-picker"
    style={{ left: pickerPos.x, top: pickerPos.y }}
  >
    {pickerCandidates.map(name => (
      <li key={name} onPointerDown={(e) => { ... }}>
        {name}
      </li>
    ))}
  </ul>
)}
```

The canvas context menu mirrors this shape using `className="canvas-ctx-menu"` and a similar inline `style={{ left, top }}`.

### Pattern 2: Dismiss on Outside Click + Escape

Exact pattern from `WorldHierarchyPanel.tsx` lines 86–100:

```typescript
// Source: WorldHierarchyPanel.tsx
useEffect(() => {
  if (!contextMenu) return;
  const onMouseDown = () => setContextMenu(null);
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setContextMenu(null); };
  // Register on next tick to avoid catching the opening click
  const t = setTimeout(() => {
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
  }, 0);
  return () => {
    clearTimeout(t);
    document.removeEventListener('mousedown', onMouseDown);
    document.removeEventListener('keydown', onKey);
  };
}, [contextMenu]);
```

**Critical:** The `setTimeout(..., 0)` delay is mandatory. Without it the `mousedown` that opened the menu is still propagating and immediately dismisses the menu.

The canvas context menu `useEffect` should follow this verbatim, using `mousedown` (not `pointerdown`, which `MapCanvas` may intercept).

### Pattern 3: WorldSetDialog Prop Extension

The dialog's `Props` interface is extended additively:

```typescript
// Source: WorldSetDialog.tsx Props interface (extend, not replace)
interface Props {
  onClose: () => void;
  initialView?: 'list' | 'nodes' | 'configure';
  initialParentMapName?: string | null;
  initialMapName?: string;
  // NEW in Phase 7:
  initialAnchor?: { col: number; row: number };
  hideParent?: boolean;
}
```

`initialAnchor` seeds `anchorCol`/`anchorRow` via `useState` initial values. Because `anchorCol`/`anchorRow` are already plain `useState(0)`, the prop just changes the initial argument:

```typescript
const [anchorCol, setAnchorCol] = useState(initialAnchor?.col ?? 0);
const [anchorRow, setAnchorRow] = useState(initialAnchor?.row ?? 0);
```

`hideParent` conditionally renders the Parent `<select>` field. When `true`, the parent field is hidden entirely (not disabled — hidden), so the layout does not show a locked/greyed control:

```typescript
{!hideParent && (
  <div className="dialog-row">
    <label>Parent</label>
    <select ...>...</select>
  </div>
)}
```

When `hideParent=true`, `parentMapName` stays at whatever was set by `initialParentMapName` on mount, which is already handled by:
```typescript
const [parentMapName, setParentMapName] = useState<string | null>(
  initialParentMapName ?? null,
);
```

### Pattern 4: World-Set Gate Check

The gate at the top of the right-click handler:

```typescript
// In MapCanvas.tsx onPointerDown, at e.button === 2 block:
const { activeWorldSetName, activeWorldSet } = worldSetStore;
const isCurrentMapInWorldSet = !!activeWorldSetName &&
  !!activeWorldSet?.nodes.find(n => n.mapName === mapName);

if (isCurrentMapInWorldSet && store.mapData) {
  // Show context menu — set canvasCtxMenu state and return
  const canvasPt = getCanvasPoint(e.nativeEvent);
  const hits = footprintAtPoint(canvasPt.x, canvasPt.y, renderedFootprintsRef.current);
  setCanvasCtxMenu({
    x: e.clientX,
    y: e.clientY,
    col: tile.col,
    row: tile.row,
    footprintMapName: hits.length > 0 ? hits[0] : undefined,
  });
  return; // do NOT fall through to tool.onRightPress?.()
}

// Gate failed — fall through to existing behavior
const tool = TOOLS[store.selectedTool];
tool.onRightPress?.(tile.col, tile.row, store);
```

Note: `tile` from `pointerToTile()` must be computed BEFORE the gate, since the gate also uses it to populate `col`/`row` in the context menu state.

### Pattern 5: "Create New Map" Chain

`WorldSetDialog` cannot directly mount `NewMapDialog` (violates single-responsibility, creates z-index conflicts). Two viable approaches:

**Approach A (recommended): Callback prop** — Add `onRequestNewMap?: (onCreated: (name: string) => void) => void` to `WorldSetDialog.Props`. `App.tsx` provides an implementation that opens `NewMapDialog` with an `onCreated` callback. When `NewMapDialog` closes successfully, the callback fires with the new map name, which `WorldSetDialog` uses to call `handleMapSelect(name)` pre-selecting it.

**Approach B: Inline NewMapDialog in WorldSetDialog** — Conditionally render `NewMapDialog` directly inside `WorldSetDialog`. Avoids cross-component coordination but puts dialog-within-dialog (nested backdrops). The existing code already has `dialog-backdrop > dialog` structure, so a nested backdrop would visually stack correctly, but the pattern is new to the codebase.

The CONTEXT.md does not prescribe either approach. Approach A is recommended because it matches the existing `onOpenWorldSetDialog` callback pattern used between `WorldHierarchyPanel` and `App.tsx`, and keeps `WorldSetDialog` free of direct `NewMapDialog` imports.

**App.tsx changes for Approach A:** Pass `onRequestNewMap` to `WorldSetDialog`:

```typescript
// App.tsx: add handler
const handleRequestNewMap = useCallback((onCreated: (name: string) => void) => {
  setPendingNewMapCreated(() => onCreated);   // store callback in ref or state
  setActiveDialog('new');                     // open NewMapDialog
}, []);

// NewMapDialog needs an onCreated prop or App detects successful creation
```

**Complication:** `NewMapDialog` currently only has `onClose: () => void`. It does not have an `onCreated(name: string)` callback. To support the chain, `NewMapDialog` needs an optional `onCreated?: (name: string) => void` prop that is called after `apiSaveMap` + `loadMap` succeed, before `onClose()`.

### Anti-Patterns to Avoid

- **Registering dismiss listeners without setTimeout delay:** The right-click `mousedown` event is still on the event queue; without the 0ms delay the menu opens and immediately closes.
- **Using `pointerdown` for the dismiss listener on the canvas context menu:** `MapCanvas` already uses `onPointerDown` on the canvas; using `pointerdown` for dismiss may conflict. Use `mousedown` as `WorldHierarchyPanel` does.
- **Mutating `anchorCol`/`anchorRow` useState initial values via useEffect after mount:** The `initialAnchor` prop should set initial `useState` values (not be applied in a `useEffect`), since the dialog is remounted (via `key` increment) each time it's opened from the context menu.
- **Calling `tool.onRightPress?.()` when the context menu gate passes:** The `return` statement after setting context menu state must be present to prevent the tool from also handling the event.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Footprint hit-testing | Custom rect-overlap code | `footprintAtPoint()` from `footprintOverlay.ts` | Already implemented and tested; returns sorted `string[]` |
| Context menu dismiss on outside click | Custom event system | `setTimeout + document.addEventListener('mousedown', ...)` | Exact pattern already in `WorldHierarchyPanel.tsx` |
| World set save after remove | Custom fetch call | `removeNode()` + `saveWorldSet()` | Already implemented in `WorldHierarchyPanel.handleRemove` |
| Opening WorldSetDialog with args | Direct state mutation | `handleOpenWorldSetDialog(args)` via `App.tsx` callback prop | Already wired; the `key` increment forces remount which re-seeds useState |
| Scale assignment for maps without feetPerUnit | New UI | `needsScale` conditional + `handleAddNode` Step 1 | Already in WorldSetDialog configure view |

---

## Common Pitfalls

### Pitfall 1: Missing `return` After Setting Context Menu State
**What goes wrong:** Right-click shows context menu AND dispatches `tool.onRightPress?.()` simultaneously — erasing tiles while the menu is visible.
**Why it happens:** The `e.button === 2` block currently calls `tool.onRightPress?.()` then returns. The new code must set context menu state and return early when the gate passes, before the existing `tool.onRightPress?.()` call.
**How to avoid:** Gate check → `setCanvasCtxMenu(...)` → `return`. Place the gate FIRST inside the `e.button === 2` block, wrapping the existing `tool.onRightPress?.()` in an `else` branch or simply returning early.
**Warning signs:** Tiles getting erased or placed when right-clicking (pointTool eraser fired).

### Pitfall 2: Context Menu Opens Then Immediately Dismisses
**What goes wrong:** Right-click opens the menu for a single frame then it vanishes.
**Why it happens:** The `mousedown` listener registered for dismiss catches the same right-click event that opened the menu.
**How to avoid:** Wrap the `document.addEventListener('mousedown', ...)` call in `setTimeout(() => { ... }, 0)` — identical to the `WorldHierarchyPanel` pattern.
**Warning signs:** Context menu never appears to the user; it flickers and disappears instantly.

### Pitfall 3: `initialAnchor` Applied via useEffect Instead of useState Initial Value
**What goes wrong:** Anchor fields reset to 0 after the first render instead of staying at the right-clicked cell's coordinates.
**Why it happens:** If `initialAnchor` is applied via a `useEffect`, it runs after mount and may be overridden by other effects or not run at all if the dependency array is wrong.
**How to avoid:** Use `useState(initialAnchor?.col ?? 0)` as the initial value directly — no useEffect. The dialog is remounted via `key` increment each time it opens, so the initial value is always fresh.
**Warning signs:** Anchor col/row always shows 0 in the dialog even after right-clicking on cell (5, 3).

### Pitfall 4: `hideParent` Disables Instead of Hides the Parent Field
**What goes wrong:** User sees a greyed-out parent selector locked to the current map; this is confusing when the context menu already implies the parent is the current map.
**Why it happens:** Temptation to use `disabled={hideParent}` instead of conditional rendering.
**How to avoid:** Use `{!hideParent && (<div className="dialog-row">...</div>)}` to hide the field entirely.
**Warning signs:** Parent field visible but greyed out when opening from canvas right-click.

### Pitfall 5: WorldSetDialog `key` Increment Not Triggered for Canvas Context Menu Path
**What goes wrong:** Opening from the canvas context menu uses a stale dialog state (previous anchor values, previous selectedMap).
**Why it happens:** The `handleOpenWorldSetDialog` in `App.tsx` increments `worldSetDialogKey` to force remount — but only if the canvas context menu calls through that same handler. If `MapCanvas` bypasses `handleOpenWorldSetDialog` and sets `activeDialog` via a different path, the key won't increment.
**How to avoid:** Route ALL WorldSetDialog opens through `handleOpenWorldSetDialog` (even from `MapCanvas`). Pass `handleOpenWorldSetDialog` down to `MapCanvas` as a prop or use a store action — the cleanest path is a prop since `App.tsx` already passes props to `WorldHierarchyPanel`.
**Warning signs:** Right-clicking, adding a child, then right-clicking again at a different cell shows the old anchor values.

### Pitfall 6: `tile` Is Null When Setting Context Menu State
**What goes wrong:** `canvasCtxMenu.col` and `.row` are undefined or incorrect.
**Why it happens:** `pointerToTile()` returns `null` when `store.mapData` is null. The context menu gate checks `store.mapData` but `tile` is computed before the gate.
**How to avoid:** Guard: `if (!tile) return;` before the `e.button === 2` block — this already exists in the current code at line ~262.

### Pitfall 7: "Create New Map" Chain — NewMapDialog Navigates Away
**What goes wrong:** The user opens "Create new map" from the WorldSetDialog configure view. `NewMapDialog.doCreate()` calls `loadMap(mapData, name)` which navigates the editor to the newly created map. When the user returns to the world set dialog (which reopens), the current map has changed.
**Why it happens:** `NewMapDialog` always calls `loadMap` after creating. This is correct for the standalone "File → New Map" flow but disruptive in the chaining context.
**How to avoid:** The `onCreated` callback path in the chain should NOT have `NewMapDialog` call `loadMap`. Option: add an `onCreated?: (name: string) => void` prop to `NewMapDialog`; when set, skip `loadMap` (only save to server), call `onCreated(name)`, then call `onClose`. The chain caller then calls `handleMapSelect(name)` to pre-select the map in the picker without navigating.

---

## Code Examples

### Context Menu State Type
```typescript
// In MapCanvas.tsx — add alongside existing picker/tooltip state
type CanvasCtxMenuState = {
  x: number;        // clientX for position
  y: number;        // clientY for position
  col: number;      // tile column of right-clicked cell
  row: number;      // tile row of right-clicked cell
  footprintMapName?: string;  // set only when a footprint was hit
} | null;

const [canvasCtxMenu, setCanvasCtxMenu] = useState<CanvasCtxMenuState>(null);
const ctxMenuRef = useRef<HTMLUListElement>(null);
```

### Right-Click Gate in `onPointerDown`
```typescript
// Source pattern: MapCanvas.tsx line 320 (existing e.button === 2 block)
if (e.button === 2 || (e.pointerType === 'touch' && e.buttons === 2)) {
  // Phase 7: world-set context menu gate
  const isCurrentMapInWorldSet =
    !!worldSetStore.activeWorldSetName &&
    !!worldSetStore.activeWorldSet?.nodes.find(n => n.mapName === mapName);

  if (isCurrentMapInWorldSet && store.mapData && tile) {
    const canvasPt = getCanvasPoint(e.nativeEvent);
    const hits = footprintAtPoint(canvasPt.x, canvasPt.y, renderedFootprintsRef.current);
    setCanvasCtxMenu({
      x: e.clientX,
      y: e.clientY,
      col: tile.col,
      row: tile.row,
      footprintMapName: hits.length > 0 ? hits[0] : undefined,
    });
    return; // gate passed — do NOT dispatch to tool
  }

  // Gate failed — existing behavior
  const tool = TOOLS[store.selectedTool];
  tool.onRightPress?.(tile.col, tile.row, store);
  return;
}
```

### Dismiss Effect for Canvas Context Menu
```typescript
// Source pattern: WorldHierarchyPanel.tsx lines 86-100
useEffect(() => {
  if (!canvasCtxMenu) return;
  const onMouseDown = () => setCanvasCtxMenu(null);
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCanvasCtxMenu(null); };
  const t = setTimeout(() => {
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
  }, 0);
  return () => {
    clearTimeout(t);
    document.removeEventListener('mousedown', onMouseDown);
    document.removeEventListener('keydown', onKey);
  };
}, [canvasCtxMenu]);
```

### Context Menu JSX Rendering
```typescript
// In MapCanvas.tsx return, alongside existing overlay divs
{canvasCtxMenu !== null && (
  <ul
    ref={ctxMenuRef}
    className="canvas-ctx-menu"
    role="menu"
    style={{ left: canvasCtxMenu.x, top: canvasCtxMenu.y }}
    onMouseDown={(e) => e.stopPropagation()}
    onClick={(e) => e.stopPropagation()}
  >
    <li
      role="menuitem"
      onClick={() => {
        setCanvasCtxMenu(null);
        props.onOpenWorldSetDialog({
          initialView: 'configure',
          initialParentMapName: mapName,
          initialAnchor: { col: canvasCtxMenu.col, row: canvasCtxMenu.row },
          hideParent: true,
        });
      }}
    >
      Add child map here
    </li>
    {canvasCtxMenu.footprintMapName && (
      <>
        <li role="menuitem" onClick={() => {
          const fp = canvasCtxMenu.footprintMapName!;
          setCanvasCtxMenu(null);
          props.onOpenWorldSetDialog({ initialView: 'configure', initialMapName: fp });
        }}>
          Edit {canvasCtxMenu.footprintMapName}…
        </li>
        <li role="menuitem" className="danger" onClick={async () => {
          const fp = canvasCtxMenu.footprintMapName!;
          setCanvasCtxMenu(null);
          worldSetStore.removeNode(fp);
          await worldSetStore.saveWorldSet();
        }}>
          Remove {canvasCtxMenu.footprintMapName} from world set
        </li>
      </>
    )}
  </ul>
)}
```

### CSS for `.canvas-ctx-menu`
```css
/* App.css — mirrors .hierarchy-ctx-menu exactly */
.canvas-ctx-menu {
  position: fixed;
  background: #2d2d2d;
  border: 1px solid #444;
  border-radius: 4px;
  list-style: none;
  min-width: 200px;
  z-index: 1500;
  box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  margin: 0;
  padding: 0;
}
.canvas-ctx-menu li {
  padding: 8px 16px;
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
}
.canvas-ctx-menu li:hover { background: #3d3d3d; }
.canvas-ctx-menu li.danger { color: #fcc; }
.canvas-ctx-menu li.danger:hover { background: #3a2222; }
```

### WorldSetDialog: initialAnchor and hideParent Props
```typescript
// Props interface extension
interface Props {
  onClose: () => void;
  initialView?: 'list' | 'nodes' | 'configure';
  initialParentMapName?: string | null;
  initialMapName?: string;
  initialAnchor?: { col: number; row: number };   // NEW
  hideParent?: boolean;                            // NEW
  onRequestNewMap?: (onCreated: (name: string) => void) => void;  // NEW (chain)
}

// State initialization
const [anchorCol, setAnchorCol] = useState(initialAnchor?.col ?? 0);
const [anchorRow, setAnchorRow] = useState(initialAnchor?.row ?? 0);

// Conditional render of parent field
{!hideParent && (
  <div className="dialog-row">
    <label>Parent</label>
    <select value={parentMapName ?? ''} onChange={...} disabled={loading}>
      <option value="">None (root)</option>
      ...
    </select>
  </div>
)}
```

### OpenWorldSetDialogArgs Extension (App.tsx / WorldHierarchyPanel interface)
```typescript
// WorldHierarchyPanel.tsx — extend existing interface
export interface OpenWorldSetDialogArgs {
  initialView?: 'list' | 'nodes' | 'configure';
  initialParentMapName?: string | null;
  initialMapName?: string;
  initialAnchor?: { col: number; row: number };   // NEW
  hideParent?: boolean;                            // NEW
}
```

`App.tsx` must pass `initialAnchor` and `hideParent` from `worldSetDialogArgs` through to `WorldSetDialog`.

### MapCanvas Props Extension
`MapCanvas` currently takes no props. To pass `handleOpenWorldSetDialog` from `App.tsx`, add a props interface:

```typescript
interface MapCanvasProps {
  onOpenWorldSetDialog: (args: OpenWorldSetDialogArgs) => void;
}
export const MapCanvas: React.FC<MapCanvasProps> = ({ onOpenWorldSetDialog }) => { ... };
```

Then in `App.tsx`:
```typescript
<MapCanvas onOpenWorldSetDialog={handleOpenWorldSetDialog} />
```

---

## Integration Map

| Change | File | Where exactly |
|--------|------|--------------|
| Add `CanvasCtxMenuState` type + `canvasCtxMenu` state + `ctxMenuRef` | `MapCanvas.tsx` | After `pickerRef` declaration (~line 61) |
| Add dismiss `useEffect` for `canvasCtxMenu` | `MapCanvas.tsx` | After existing picker dismiss effects (~line 199) |
| Add world-set gate in `onPointerDown` at `e.button === 2` | `MapCanvas.tsx` | Inside `e.button === 2` block (~line 320), BEFORE existing `tool.onRightPress?.()` |
| Render `<ul className="canvas-ctx-menu">` | `MapCanvas.tsx` | In JSX return, after `footprint-picker` `<ul>` (~line 485) |
| Add `MapCanvasProps` interface + wire `onOpenWorldSetDialog` prop | `MapCanvas.tsx` | Top of file |
| Extend `OpenWorldSetDialogArgs` with `initialAnchor`, `hideParent` | `WorldHierarchyPanel.tsx` | `OpenWorldSetDialogArgs` interface (~line 16) |
| Extend `WorldSetDialog` `Props` with `initialAnchor`, `hideParent`, `onRequestNewMap` | `WorldSetDialog.tsx` | `Props` interface (~line 18) |
| Change `useState(0)` → `useState(initialAnchor?.col ?? 0)` for `anchorCol`/`anchorRow` | `WorldSetDialog.tsx` | State declarations (~line 53-54) |
| Conditionally hide parent `<select>` using `hideParent` | `WorldSetDialog.tsx` | Configure view JSX (~line 530-544) |
| Add "Create new map…" entry/button in map picker | `WorldSetDialog.tsx` | Configure view `<select>` or below it (~line 499-507) |
| Handle `onCreated` callback from NewMapDialog chain | `WorldSetDialog.tsx` | `handleMapSelect` or new handler |
| Add optional `onCreated?: (name: string) => void` prop + call it | `NewMapDialog.tsx` | `doCreate()` success path (~line 82) |
| Pass `onOpenWorldSetDialog` prop to `<MapCanvas>` | `App.tsx` | `<MapCanvas>` in JSX (~line 134) |
| Pass `initialAnchor`, `hideParent` from `worldSetDialogArgs` to `<WorldSetDialog>` | `App.tsx` | `<WorldSetDialog>` in JSX (~line 155) |
| Add `.canvas-ctx-menu` CSS block | `App.css` | After `.hierarchy-ctx-menu li.danger:hover` block (~line 503) |

---

## Validation Architecture

`workflow.nyquist_validation` is `true` in `.planning/config.json`, so this section is required.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1 |
| Config file | `frontend/vite.config.ts` (`environment: node`, `globals: true`) |
| Quick run command | `cd frontend && npm run test -- --run` |
| Full suite command | `cd frontend && npm run test -- --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CTX-01 | Gate: context menu shown only when world set active AND current map is a node | unit (logic) | `npm run test -- --run canvasContextMenu` | ❌ Wave 0 |
| CTX-02 | "Add child map here" pre-fills anchor from clicked cell → `initialAnchor` passed correctly | unit (logic) | `npm run test -- --run canvasContextMenu` | ❌ Wave 0 |
| CTX-03 | WorldSetDialog configure view opens with `hideParent=true` and correct parent | unit (logic) | `npm run test -- --run worldSetDialog` | Partial (existing file, needs new cases) |
| CTX-04 | `needsScale` + `handleAddNode` Step 1 writes `feetPerUnit` before adding node — no change needed | unit (existing) | `npm run test -- --run worldSetDialog` | ✅ Existing tests cover this path |

**Testing strategy for no-DOM environment:** All existing test files (`worldSetDialog.test.ts`, `worldHierarchyPanel.test.ts`) run in `node` environment without DOM. CTX-01 and CTX-02 tests verify the gate logic and prop values as pure functions — no canvas rendering needed.

### Sampling Rate
- **Per task commit:** `cd frontend && npm run test -- --run`
- **Per wave merge:** `cd frontend && npm run test -- --run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `frontend/src/__tests__/canvasContextMenu.test.ts` — covers CTX-01 (gate logic) and CTX-02 (anchor pre-fill)
- [ ] Add cases to `frontend/src/__tests__/worldSetDialog.test.ts` — covers `initialAnchor` prop seeding, `hideParent` conditional rendering behavior (as logic contracts)

---

## Open Questions

1. **"Create new map" chain — does `NewMapDialog` skip `loadMap` when `onCreated` is provided?**
   - What we know: `doCreate()` always calls `loadMap(mapData, name)` which navigates the editor to the new map.
   - What's unclear: Is navigation acceptable during the chain, or should the world set dialog keep the user on the current map (parent) so they can verify the relationship visually?
   - Recommendation: Skip `loadMap` when `onCreated` prop is provided. The user is in "world set management" mode; they did not ask to navigate. Only save to server and fire `onCreated(name)`.

2. **MapCanvas as a no-props component — breaking change?**
   - What we know: `MapCanvas` currently takes no props; `App.tsx` renders `<MapCanvas />` with no attributes.
   - What's unclear: Adding `onOpenWorldSetDialog` as a required prop changes the component signature. If anything else renders `MapCanvas` (no other callers found in the codebase), this is safe.
   - Recommendation: Make `onOpenWorldSetDialog` required in the props interface. Only one caller exists (`App.tsx`). TypeScript will catch missing prop at build time.

3. **Context menu z-index vs. other overlays**
   - What we know: `.hierarchy-ctx-menu`, `.footprint-picker`, and `.footprint-tooltip` all use `z-index: 1500`. `.dialog-backdrop` uses `z-index: 3000`.
   - What's unclear: If the picker and context menu are both open simultaneously (edge case: right-click while picker is visible).
   - Recommendation: Set context menu state also dismisses picker (`setPickerPos(null)`) when showing context menu. The context menu handler runs inside `onPointerDown` at `e.button === 2` after the picker would already be open; add `setPickerPos(null); setPickerCandidates([]);` before `setCanvasCtxMenu(...)`.

---

## Environment Availability

Step 2.6: SKIPPED — this phase is purely frontend TypeScript/React changes with no external dependencies beyond the existing npm packages.

---

## Sources

### Primary (HIGH confidence)
- `frontend/src/components/MapCanvas.tsx` — live code for all pointer handling, overlay patterns, footprint integration
- `frontend/src/components/dialogs/WorldSetDialog.tsx` — live code for Props interface, configure view state, needsScale + handleAddNode
- `frontend/src/components/WorldHierarchyPanel.tsx` — live code for context menu dismiss pattern, removeNode + saveWorldSet usage, OpenWorldSetDialogArgs interface
- `frontend/src/canvas/footprintOverlay.ts` — `footprintAtPoint()` signature and return type
- `frontend/src/store/worldSetStore.ts` — `removeNode`, `saveWorldSet`, `activeWorldSet`, `activeWorldSetName` API
- `frontend/src/components/dialogs/NewMapDialog.tsx` — `onClose` only interface, `doCreate()` calls `loadMap()`
- `frontend/src/App.tsx` — `handleOpenWorldSetDialog`, `worldSetDialogKey` increment, `MapCanvas` render with no props
- `frontend/src/App.css` lines 483–556 — `.hierarchy-ctx-menu`, `.footprint-picker`, `.footprint-tooltip` CSS

### Secondary (MEDIUM confidence)
- None required — all findings verified from live codebase.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already present; no new dependencies
- Architecture patterns: HIGH — all patterns verified in live code files
- Pitfalls: HIGH — derived from reading the actual dismiss logic, useState initial value handling, and existing onPointerDown flow
- Integration map: HIGH — line numbers verified by reading source files

**Research date:** 2026-05-25
**Valid until:** 2026-06-25 (stable codebase; only invalidated by changes to MapCanvas, WorldSetDialog, or WorldHierarchyPanel)
