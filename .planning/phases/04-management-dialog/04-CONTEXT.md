# Phase 4: Management Dialog — Context

**Gathered:** 2026-04-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 4 delivers the world set management dialog — a menu-triggered UI for the full lifecycle of world sets: creating, deleting, and populating them with map nodes. Includes inline scale assignment for maps without `feetPerUnit`. No canvas work, no hierarchy panel, no context menu (those are Phases 5–7).

Deliverables:
1. `frontend/src/components/dialogs/WorldSetDialog.tsx` — three-view sequential dialog
2. `frontend/src/components/MenuBar.tsx` — "World Sets…" item added
3. `frontend/src/App.tsx` — dialog wired into the `Dialog` type union and rendered

</domain>

<decisions>
## Implementation Decisions

### D-01: Dialog structure — sequential views (list → detail → configure)

- The dialog has three internal views navigated sequentially:
  1. **List view** — shows all world sets; Create and Delete actions
  2. **Node management view** — shows nodes for the selected world set; Add and Remove actions
  3. **Configure-node view** — form for a new node: parent map, anchor (col/row), Z, Z label, optional scale
- Navigation: selecting a world set enters the node management view; "Add map node" button enters the configure-node view; "Back" returns one level
- Each view is full-width of the dialog — no split-panel layout
- Follows the same sequential pattern used by existing dialogs; no sub-dialogs

### D-02: Add-node form — third view (wizard step), not inline

- Clicking "Add map node" in the node management view transitions to a dedicated configure-node view
- Configure-node view has its own Back and Add buttons
- The node list in the node management view stays uncluttered — no inline form expansion

### D-03: Scale picker — expansion row; write-back on confirm only

- In the configure-node view, if the selected map has no `feetPerUnit`:
  - An extra `.dialog-row` appears below the map selector: "This map has no scale. Set it:" + `<select>` with scale presets
  - The row disappears if the user switches to a map that already has a scale
- The scale value is held in local dialog state — not written to the map until the user clicks "Add"
- On confirm: (1) write `feetPerUnit` to the map file via `saveMapToServer()`, (2) add node to world set via `addNode()`, (3) persist via `saveWorldSet()`
- Aligns with the explicit-save pattern (D-03 from Phase 3)

### D-04: World set activation — implicit on selection

- Clicking a world set in the list view calls `setActiveWorldSet(name)` as part of entering the node management view
- No separate "Set active" button — whatever world set you last entered in the dialog is active in the editor
- If the active world set is deleted, the store clears `activeWorldSet` (existing store behavior)

### Carried Forward (from prior phases)

- Scale inversion + overlap = warn-but-allow: show `.dialog-warn` inline in the configure-node view; do not block "Add"
- Hard errors (duplicate mapName, cycle): show `.dialog-error` and block "Add"
- `saveWorldSet()` is explicit — called after node mutations, not triggered automatically
- `navigateToMap()` is not needed in this dialog (no map navigation from here)

### Claude's Discretion

- Exact wording of the "No scale set — click to set" label and the expansion row prompt
- Whether the configure-node view validates in real-time (on field change) or on submit attempt
- Whether deletion of a world set requires typing the name or just a confirm button click
- CSS sizing — dialog width can exceed existing dialogs if needed for the node form

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design Spec
- `docs/world-sets-design.md` — Full design spec; Phase 2 section (World Set Management Dialog) is directly relevant

### Existing Dialogs (pattern to mirror)
- `frontend/src/components/dialogs/OpenMapDialog.tsx` — dialog layout pattern, dirty-map guard, `.dialog-row` usage, list selection style
- `frontend/src/components/dialogs/TilesetDialog.tsx` — inline form within dialog pattern; `.dialog-warn` usage
- `frontend/src/components/dialogs/NewMapDialog.tsx` — form validation pattern

### Existing Shell (integration points)
- `frontend/src/App.tsx` — `type Dialog` union, `activeDialog` state, MenuBar props wiring, dialog render block
- `frontend/src/components/MenuBar.tsx` — prop-driven menu items; add `onWorldSets` prop

### Store (actions used by this dialog)
- `frontend/src/store/worldSetStore.ts` — `setActiveWorldSet()`, `addNode()`, `removeNode()`, `saveWorldSet()`; also `listWorldSets` from client

### Scale Data
- `frontend/src/data/mapScales.ts` — `MAP_SCALES` array and `MAP_SCALE_BY_ID` map; used to populate scale picker `<select>`

### CSS
- `frontend/src/App.css` — `.dialog-backdrop`, `.dialog`, `.dialog-title`, `.dialog-row`, `.dialog-error`, `.dialog-warn`, `.dialog-buttons`, `.dialog-section-label`, `.map-list-item`, `.btn-primary`, `.btn-secondary`, `.btn-danger` — all available; no new CSS classes needed for the basic layout

### API Client
- `frontend/src/api/client.ts` — `listWorldSets`, `getWorldSet`, `saveWorldSet`, `deleteWorldSet`, `saveMap` (for writing `feetPerUnit` back)

### Requirements
- `.planning/REQUIREMENTS.md` — DIALOG-01 through DIALOG-07

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `.dialog-backdrop` / `.dialog` CSS classes — existing modal overlay pattern; no new CSS needed for structure
- `.map-list-item` / `.map-list-item.selected` — reusable for the world set list and node list
- `.dialog-warn` / `.dialog-error` — inline warning/error display already styled
- `MAP_SCALES` from `mapScales.ts` — populates scale picker `<select>` (same data used in `NewMapDialog`)
- `useWorldSetStore` — provides all store actions; `setActiveWorldSet`, `addNode`, `removeNode`, `saveWorldSet`
- `listWorldSets` / `deleteWorldSet` from `client.ts` — server-side list and delete

### Established Patterns
- **Dialog open/close**: `onClose` prop passed from `App.tsx`; dialog renders a `.dialog-backdrop` with click-to-dismiss
- **Dirty-map guard in dialogs**: `OpenMapDialog` shows a local warning state + Save/Discard/Cancel buttons — no `navigateToMap()` in this phase's dialog (no map navigation triggered)
- **Async form actions**: `async/await` with local `loading`/`error` state; `try/catch` sets error string; pattern is consistent across all three existing dialogs
- **View state**: use a local `useState` for `view: 'list' | 'nodes' | 'configure'` — same component file, conditional render per view

### Integration Points
- `App.tsx`: add `'worldSets'` to `type Dialog`; add `onWorldSets` prop to `<MenuBar>`; add render condition `{activeDialog === 'worldSets' && <WorldSetDialog onClose=... />}`
- `MenuBar.tsx`: add `onWorldSets: () => void` to `MenuBarProps`; add "World Sets…" menu item under File or as a top-level menu

</code_context>

<specifics>
## Specific Ideas

- Three-view navigation state: `const [view, setView] = useState<'list' | 'nodes' | 'configure'>('list')`
- Scale write-back sequence on "Add" confirm: `await saveMap(mapName, { ...mapData, feetPerUnit: chosenScale })` → `addNode(node)` → `await saveWorldSet()`
- The configure-node view expansion row for missing scale mirrors the `scalePrompt` flow already in `OpenMapDialog` — same UX pattern, different location

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 04-management-dialog*
*Context gathered: 2026-04-24*
