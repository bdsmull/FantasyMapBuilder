---
phase: quick
plan: 260510-kcx
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/store/worldSetStore.ts
  - frontend/src/App.tsx
  - frontend/src/components/WorldHierarchyPanel.tsx
autonomous: true
requirements: [SMOKE-01, SMOKE-02, SMOKE-03]

must_haves:
  truths:
    - "Active world set name persists across page reload (LAN devices see the same state on next visit)"
    - "Resize handle cannot drag the hierarchy panel off the bottom of the left-panel aside"
    - "User can deactivate an active world set from the WorldHierarchyPanel header"
  artifacts:
    - path: "frontend/src/store/worldSetStore.ts"
      provides: "localStorage persistence of activeWorldSetName"
    - path: "frontend/src/App.tsx"
      provides: "Upper-clamped resize handler using containerRef"
    - path: "frontend/src/components/WorldHierarchyPanel.tsx"
      provides: "Deactivate (×) button in hierarchy header"
  key_links:
    - from: "worldSetStore.ts setActiveWorldSet"
      to: "localStorage key 'activeWorldSetName'"
      via: "write on every call to setActiveWorldSet"
    - from: "worldSetStore.ts initializer"
      to: "localStorage key 'activeWorldSetName'"
      via: "read once at store creation via zustand middleware or init effect"
    - from: "App.tsx handleResizePointerDown onMove"
      to: "containerRef.current.clientHeight"
      via: "Math.min clamp before setHierarchyHeight"
---

<objective>
Fix three bugs found during Phase 5 smoke testing:
1. Active world set name is lost on page reload — breaks LAN access continuity.
2. Resize handle can drag hierarchy panel to zero height — unrecoverable without refresh.
3. No affordance to deactivate an active world set — user is stuck once one is selected.

Purpose: Make the hierarchy panel robust and usable across devices and sessions.
Output: Three targeted file edits; no new files, no new dependencies.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@frontend/src/store/worldSetStore.ts
@frontend/src/App.tsx
@frontend/src/components/WorldHierarchyPanel.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Persist activeWorldSetName to localStorage in worldSetStore</name>
  <files>frontend/src/store/worldSetStore.ts</files>
  <action>
Add localStorage persistence for `activeWorldSetName` directly inside the store — no new middleware, no new imports needed.

Two changes to `worldSetStore.ts`:

**A. On store creation — seed initial state from localStorage:**

Change the store initial values from:
```typescript
activeWorldSetName: null,
activeWorldSet: null,
```
to:
```typescript
activeWorldSetName: null,   // will be hydrated in setActiveWorldSet bootstrapper
activeWorldSet: null,
```

Then, immediately after the `create<WorldSetStore>(...)` call (after the closing `));`), add a self-bootstrapping block:

```typescript
// Restore active world set from previous session (LAN persistence fix — SMOKE-01)
const _storedName = localStorage.getItem('activeWorldSetName');
if (_storedName) {
  useWorldSetStore.getState().setActiveWorldSet(_storedName).catch(() => {
    // If the stored name no longer exists on disk, silently clear it
    localStorage.removeItem('activeWorldSetName');
  });
}
```

**B. In `setActiveWorldSet` — write to localStorage on every call:**

After the existing `if (name === null)` branch, add:
```typescript
if (name === null) {
  localStorage.removeItem('activeWorldSetName');
  set({ activeWorldSetName: null, activeWorldSet: null });
  return;
}
```

And after the successful `set({ activeWorldSetName: name, activeWorldSet: data })` call:
```typescript
localStorage.setItem('activeWorldSetName', name);
```

Full updated `setActiveWorldSet`:
```typescript
setActiveWorldSet: async (name) => {
  if (name === null) {
    localStorage.removeItem('activeWorldSetName');
    set({ activeWorldSetName: null, activeWorldSet: null });
    return;
  }
  const data = await apiGetWorldSet(name);
  set({ activeWorldSetName: name, activeWorldSet: data });
  localStorage.setItem('activeWorldSetName', name);
},
```

The bootstrapper runs once at module load time. `setActiveWorldSet` is already async so failure is caught and clears the stale key.
  </action>
  <verify>
    <automated>cd frontend && npm run build 2>&1 | tail -5</automated>
  </verify>
  <done>TypeScript build passes. On page reload, if a world set was previously active the panel reappears without manual reselection.</done>
</task>

<task type="auto">
  <name>Task 2: Clamp resize handle upper bound + add deactivate button</name>
  <files>frontend/src/App.tsx, frontend/src/components/WorldHierarchyPanel.tsx</files>
  <action>
Two independent edits in this task — both are small and touch stable, well-understood code.

**A. App.tsx — clamp hierarchy resize to available container height**

Add a `useRef` on the `.left-panel` aside element:

```typescript
const leftPanelRef = React.useRef<HTMLASTElement>(null);
```

Wait — use `HTMLElement` as the generic since `aside` maps to that:
```typescript
const leftPanelRef = useRef<HTMLElement>(null);
```

Attach to the aside:
```tsx
<aside className="left-panel" ref={leftPanelRef}>
```

Update `handleResizePointerDown` — replace the single `Math.max` clamp with a two-sided clamp:
```typescript
const onMove = (moveEvent: PointerEvent) => {
  const delta = moveEvent.clientY - startY;
  const maxHeight = leftPanelRef.current
    ? leftPanelRef.current.clientHeight - 60   // 60px minimum for LayerPanel
    : 9999;
  const newHeight = Math.min(maxHeight, Math.max(80, startHeight + delta));
  setHierarchyHeight(newHeight);
};
```

`useRef` is already imported via `React` but must be added to the named import. The existing import line is:
```typescript
import React, { useState, useEffect, useCallback } from 'react';
```
Change to:
```typescript
import React, { useState, useEffect, useCallback, useRef } from 'react';
```

**B. WorldHierarchyPanel.tsx — add Deactivate (×) button in header**

The `setActiveWorldSet` is already destructured from `useWorldSetStore` in the component. Add a deactivate button to the `.hierarchy-header` div alongside the existing switcher.

Current header:
```tsx
<div className="hierarchy-header">
  <span>WORLD SET</span>
  {worldSetNames.length > 1 ? (
    <select ...>...</select>
  ) : (
    <span className="hierarchy-switcher">{activeWorldSetName}</span>
  )}
</div>
```

Replace with:
```tsx
<div className="hierarchy-header">
  <span>WORLD SET</span>
  {worldSetNames.length > 1 ? (
    <select
      className="hierarchy-switcher"
      value={activeWorldSetName}
      onChange={(e) => setActiveWorldSet(e.target.value).catch(console.error)}
    >
      {worldSetNames.map((n) => (
        <option key={n} value={n}>{n}</option>
      ))}
    </select>
  ) : (
    <span className="hierarchy-switcher">{activeWorldSetName}</span>
  )}
  <button
    type="button"
    className="hierarchy-deactivate"
    title="Deactivate world set"
    onClick={() => setActiveWorldSet(null).catch(console.error)}
    aria-label="Deactivate world set"
  >
    ×
  </button>
</div>
```

Add CSS for `.hierarchy-deactivate` to `frontend/src/App.css` (append near other `.hierarchy-*` rules):
```css
.hierarchy-deactivate {
  background: none;
  border: none;
  color: var(--text-muted, #888);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0 4px;
  margin-left: 4px;
  flex-shrink: 0;
}
.hierarchy-deactivate:hover {
  color: var(--text, #ccc);
}
```

Note: `frontend/src/App.css` must be added to `files_modified` — the CSS edit is small (6 lines) and integral to this task, not a separate concern.
  </action>
  <verify>
    <automated>cd frontend && npm run build 2>&1 | tail -5</automated>
  </verify>
  <done>TypeScript build passes. Resize handle cannot be dragged below the LayerPanel's minimum height. A × button appears in the hierarchy panel header and clicking it hides the panel and clears localStorage.</done>
</task>

</tasks>

<verification>
After both tasks complete:
- `cd frontend && npm run build` exits 0 with no TypeScript errors
- `cd frontend && npm run test` passes (no store or component tests broken)
- Manual smoke: open app, activate a world set, reload — panel reappears
- Manual smoke: drag resize handle to bottom — stops before LayerPanel disappears
- Manual smoke: click × in hierarchy header — panel closes and does not reappear on next reload
</verification>

<success_criteria>
- Zero TypeScript compiler errors
- All three bug scenarios behave correctly in the browser
- No regressions in existing Vitest test suite
</success_criteria>

<output>
After completion, create `.planning/quick/260510-kcx-fix-phase-5-smoke-test-bugs-resize-clamp/260510-kcx-SUMMARY.md`
</output>
