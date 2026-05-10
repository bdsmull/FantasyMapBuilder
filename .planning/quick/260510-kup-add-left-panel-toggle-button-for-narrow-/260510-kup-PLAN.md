---
phase: quick
plan: 260510-kup
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/App.tsx
  - frontend/src/App.css
autonomous: true
requirements: [KUP-left-panel-toggle]

must_haves:
  truths:
    - "On narrow viewports (≤1024px) the left panel starts hidden"
    - "A toggle button (☰) appears in the Toolbar only on narrow viewports"
    - "Clicking the toggle button opens/closes the left panel"
    - "The open panel overlays the canvas without causing layout reflow"
    - "Clicking outside the open panel on narrow viewports closes it"
    - "On wide viewports (>1024px) the left panel is always visible and the toggle is hidden"
  artifacts:
    - path: "frontend/src/App.tsx"
      provides: "leftPanelOpen state, toggle handler, outside-click dismiss, toggle button in Toolbar area"
    - path: "frontend/src/App.css"
      provides: "Overlay positioning for narrow left panel, toggle button visibility rules"
  key_links:
    - from: "App.tsx leftPanelOpen state"
      to: ".left-panel CSS class"
      via: "conditional className or inline style"
    - from: "overlay backdrop div"
      to: "leftPanelOpen setter"
      via: "onClick={() => setLeftPanelOpen(false)}"
---

<objective>
Add a left-panel toggle button for narrow viewports (iPad, ≤1024px).

Purpose: Currently the left panel is permanently hidden via `display: none` on narrow screens. Users need a way to access layers and the hierarchy panel on iPad without switching to desktop mode.

Output: Toggle button in toolbar row (visible only on narrow viewports), left panel slides in as a fixed overlay, clicking outside dismisses it.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

Key shapes already in the codebase:

From frontend/src/App.tsx:
- `leftPanelRef` (ref on `<aside className="left-panel">`) already exists
- `<aside className="left-panel" ref={leftPanelRef}>` is the panel element
- `<div className="editor-body">` wraps left-panel, canvas-area, right-panel
- `<Toolbar />` is rendered as a standalone row (no props currently)

From frontend/src/App.css:
- `.left-panel` uses `display: flex; flex-direction: column` at desktop
- Narrow media query at `@media (max-width: 1024px)` sets `.left-panel { display: none }`
- `.editor-body` at narrow: `grid-template-columns: 1fr` (left panel removed from flow)
- `.toolbar` is a flex row with existing `.tool-btn` and `.tool-separator` classes
- Dialog z-index: 2000; hierarchy tooltip z-index: 1500 — panel overlay should use z-index: 900, backdrop z-index: 850
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add leftPanelOpen state and toggle wiring in App.tsx</name>
  <files>frontend/src/App.tsx</files>
  <action>
Add `leftPanelOpen` boolean state initialized to `false` (closed on narrow; wide viewports ignore it via CSS).

Add a `toggleLeftPanel` callback (useCallback, no deps — just flips state).

Thread `leftPanelOpen` and `toggleLeftPanel` down to `Toolbar` via new props:
- Add `onToggleLeftPanel: () => void` and `showPanelToggle?: boolean` to Toolbar's props. Pass `onToggleLeftPanel={toggleLeftPanel}` and `showPanelToggle={true}` from App. The CSS `display: none` on wide viewports will hide the button — no JS media query needed.

Add an outside-click dismiss for when the panel is open on narrow viewports. Inside the existing `useEffect` for keyboard shortcuts (or a new effect) attach a `pointerdown` listener on `document` that calls `setLeftPanelOpen(false)` when the event target is NOT inside `leftPanelRef.current`. Only fires when `leftPanelOpen` is true. Dependency array: `[leftPanelOpen]`.

Apply open/closed state to the panel element:
```tsx
<aside
  className={`left-panel${leftPanelOpen ? ' left-panel--open' : ''}`}
  ref={leftPanelRef}
>
```

Add a semi-transparent backdrop div rendered just before `<aside className="left-panel">` inside `.editor-body`, visible only when `leftPanelOpen`:
```tsx
{leftPanelOpen && (
  <div className="left-panel-backdrop" onClick={() => setLeftPanelOpen(false)} />
)}
```

The backdrop handles touch/click outside; the pointerdown listener on document handles keyboard+pointer edge cases.
  </action>
  <verify>TypeScript compiles: `cd frontend && npx tsc --noEmit`</verify>
  <done>App.tsx compiles with no errors; leftPanelOpen state wired to panel className and backdrop</done>
</task>

<task type="auto">
  <name>Task 2: Add toggle button to Toolbar and CSS overlay styles</name>
  <files>frontend/src/components/Toolbar.tsx, frontend/src/App.css</files>
  <action>
**Toolbar.tsx:**
Add props interface:
```typescript
interface ToolbarProps {
  onToggleLeftPanel?: () => void;
  showPanelToggle?: boolean;
}
```
Update `export const Toolbar: React.FC<ToolbarProps>` to accept and destructure these props.

At the start of the toolbar JSX (before the first `tool-group` div), add:
```tsx
{showPanelToggle && (
  <>
    <button
      className="tool-btn panel-toggle-btn"
      onClick={onToggleLeftPanel}
      title="Toggle layers panel"
      aria-label="Toggle layers panel"
    >
      ☰
    </button>
    <div className="tool-separator" />
  </>
)}
```

**App.css:**
In the narrow media query block (`@media (max-width: 1024px)`), replace:
```css
.left-panel {
  display: none;
}
```
with:
```css
.left-panel {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: 220px;
  z-index: 900;
  overflow-y: auto;
  box-shadow: 4px 0 16px rgba(0,0,0,0.6);
}
.left-panel--open {
  display: flex;
}
```

Add the backdrop rule (outside any media query, so it only renders when the element exists via React):
```css
.left-panel-backdrop {
  position: fixed;
  inset: 0;
  z-index: 850;
  background: rgba(0,0,0,0.4);
}
```

Add `.panel-toggle-btn` visibility rule — hidden on wide, visible on narrow. Put this outside the media query block so it sets the default (hidden on wide):
```css
.panel-toggle-btn { display: none; }
```
Inside the `@media (max-width: 1024px)` block add:
```css
.panel-toggle-btn { display: flex; }
```

On wide viewports `editor-body` already uses `grid-template-columns: 180px 1fr 200px` which reserves the left column. The panel's `position: fixed` override only applies on narrow, so no layout change occurs on wide.
  </action>
  <verify>`cd frontend && npx tsc --noEmit && npm run build` exits 0</verify>
  <done>
Build passes with no TypeScript errors. On narrow viewport: toggle button (☰) visible in toolbar, clicking opens left panel as overlay, clicking outside or backdrop closes it. On wide viewport: toggle button hidden, left panel always visible in grid column.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
Left panel toggle for narrow viewports. Toggle button (☰) in toolbar, left panel opens as fixed overlay (z-index 900), semi-transparent backdrop closes on click, outside-click also dismisses.
  </what-built>
  <how-to-verify>
1. Open the app in a browser window and resize to ≤1024px wide (or use DevTools device emulation for iPad: 1024x768).
2. Verify: ☰ button appears at the left of the toolbar; left panel is NOT visible.
3. Click ☰ — left panel should slide in from the left as an overlay over the canvas; canvas behind it should show darkened backdrop.
4. Click outside the panel (on the backdrop/canvas) — panel should close.
5. Click ☰ again to open, then click ☰ again — panel should close.
6. Resize window to >1024px wide — left panel always visible in grid column, ☰ button hidden.
7. Verify no layout jump on wide viewport when toggling (it should be a no-op).
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues found</resume-signal>
</task>

</tasks>

<verification>
- `cd frontend && npx tsc --noEmit` — no TypeScript errors
- `cd frontend && npm run build` — production build succeeds
- Visual verification via checkpoint task
</verification>

<success_criteria>
- Toggle button (☰) visible only on narrow (≤1024px) viewports
- Left panel hidden by default on narrow; opens as fixed overlay when toggled
- Clicking outside or clicking backdrop closes panel on narrow
- Wide viewports: panel always visible, toggle button hidden, no layout change
- No TypeScript strict-mode violations
</success_criteria>

<output>
After completion, create `.planning/quick/260510-kup-add-left-panel-toggle-button-for-narrow-/260510-kup-SUMMARY.md` using the summary template.
</output>
