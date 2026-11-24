/**
 * Ceiling mode of the Height tool (#45): draw and edit ceiling objects, closed shapes
 * with their own headroom (a low passage, a tall hall, an overhang).
 *
 * Drawing: click to add corners; click the first corner, double-click or Enter closes
 * the shape (three corners or more). Esc cancels; Backspace removes the last corner. New
 * shapes get the headroom set in the panel.
 * Editing: click a shape's outline to select it; drag its corners, or drag
 * a side's midpoint handle to insert one. Delete removes the selected corner (or the
 * shape, if it would get too small, or no corner is selected). Each change is one undo step.
 */

import type { MapPoint } from './baseTool';
import type { MapStore } from '../store/mapStore';
import { useViewStore } from '../store/viewStore';
import { pointAt, midpointAt } from '../utils/lines';
import { readCeilings, ceilingAreaAt, ceilingPath, DEFAULT_CEILING_HEADROOM_CM } from '../utils/ceilings';

/** Screen pixels around an outline, corner or handle that count as clicking it. */
export const CEILING_PICK_RADIUS_PX = 8;
const _DOUBLE_CLICK_MS = 400;

interface _Drag { id: number; index: number; points: MapPoint[]; inserted: boolean; moved: boolean }

let _drag: _Drag | null = null;
let _lastPress = { time: 0, x: 0, y: 0 };

const _view = () => useViewStore.getState();

/** Headroom for new ceiling objects. */
export const newCeilingHeadroomCm = (store: MapStore) => store.heightBrush.ceilingHeadroomCm ?? DEFAULT_CEILING_HEADROOM_CM;

function _finish(store: MapStore): void {
  const draft = _view().draftLine;
  _view().setDraftLine(null);
  if (!draft || draft.length < 3) return;
  const id = store.addCeiling(draft, newCeilingHeadroomCm(store));
  if (id !== null) _view().selectCeiling(id);
}

const _selected = (store: MapStore) => {
  const id = _view().selectedCeilingId;
  return id !== null && store.mapData ? readCeilings(store.mapData).find((c) => c.id === id) : undefined;
};

export function ceilingPress(store: MapStore, pos: MapPoint): void {
  if (!store.mapData) return;
  const r = CEILING_PICK_RADIUS_PX / store.zoom;
  const now = Date.now();
  const isDouble = now - _lastPress.time < _DOUBLE_CLICK_MS && Math.hypot(pos.x - _lastPress.x, pos.y - _lastPress.y) <= r;
  _lastPress = { time: now, x: pos.x, y: pos.y };

  const draft = _view().draftLine;
  if (draft) {
    if (draft.length >= 3 && (isDouble || Math.hypot(pos.x - draft[0].x, pos.y - draft[0].y) <= r)) { _finish(store); return; }
    if (isDouble) return; // the second click of a double-click on a draft too small to close
    _view().setDraftLine([...draft, pos]);
    return;
  }

  const selected = _selected(store);
  if (selected) {
    const i = pointAt(selected.points, pos.x, pos.y, r);
    if (i >= 0) {
      _view().selectCeiling(selected.id, i);
      _drag = { id: selected.id, index: i, points: selected.points, inserted: false, moved: false };
      return;
    }
    const path = ceilingPath(selected);
    const m = midpointAt(path, pos.x, pos.y, r);
    if (m >= 0) {
      const mid = { x: (path[m].x + path[m + 1].x) / 2, y: (path[m].y + path[m + 1].y) / 2 };
      const points = [...selected.points.slice(0, m + 1), mid, ...selected.points.slice(m + 1)];
      _view().selectCeiling(selected.id, m + 1);
      _view().setDragPoints(points);
      _drag = { id: selected.id, index: m + 1, points, inserted: true, moved: false };
      return;
    }
  }

  const hit = ceilingAreaAt(readCeilings(store.mapData), pos.x, pos.y, r);
  if (hit) { _view().selectCeiling(hit.id); return; }
  // A click off any shape deselects; the next click starts one
  if (selected) { _view().selectCeiling(null); return; }
  _view().setDraftLine([pos]);
}

export function ceilingDrag(pos: MapPoint): void {
  if (!_drag) return;
  _drag.moved = true;
  _drag.points = _drag.points.map((p, k) => (k === _drag!.index ? { x: pos.x, y: pos.y } : p));
  _view().setDragPoints(_drag.points);
}

export function ceilingCancel(): void {
  _drag = null;
  _view().setDragPoints(null);
}

/** Ends a drag; returns whether one was in progress. */
export function ceilingRelease(store: MapStore): boolean {
  const drag = _drag;
  _drag = null;
  _view().setDragPoints(null);
  if (drag && (drag.moved || drag.inserted)) store.updateCeiling(drag.id, { points: drag.points });
  return drag !== null;
}

/**
 * Keyboard for Ceiling mode; returns true when the key was used. Enter closes the shape,
 * Esc cancels (or deselects), Backspace removes the last drawn corner,
 * Delete/Backspace removes the selected corner or shape.
 */
export function ceilingKey(key: string, store: MapStore): boolean {
  const view = _view();
  if (view.draftLine) {
    if (key === 'Enter') { _finish(store); return true; }
    if (key === 'Escape') { view.setDraftLine(null); return true; }
    if (key === 'Backspace') {
      const rest = view.draftLine.slice(0, -1);
      view.setDraftLine(rest.length ? rest : null);
      return true;
    }
    return false;
  }
  if (view.selectedCeilingId === null) return false;
  if (key === 'Escape') { view.selectCeiling(null); return true; }
  if (key !== 'Delete' && key !== 'Backspace') return false;
  const c = _selected(store);
  if (!c) { view.selectCeiling(null); return true; }
  if (view.selectedPoint !== null && c.points.length > 3) {
    store.updateCeiling(c.id, { points: c.points.filter((_, k) => k !== view.selectedPoint) });
    view.selectCeiling(c.id, null);
  } else {
    store.deleteCeiling(c.id);
    view.selectCeiling(null);
  }
  return true;
}
