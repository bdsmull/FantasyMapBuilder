/**
 * Contour mode of the Height tool (#8 phase 3d): draw and edit contour lines.
 *
 * Drawing: click to add points; double-click or Enter finishes an open contour; a click
 * on the first point (with three or more points) closes it into a loop. Esc cancels;
 * Backspace removes the last point. New contours get the height and reach set in the panel.
 * Editing: click a contour to select it; drag its points, or drag a segment's midpoint
 * handle to insert a point. Delete removes the selected point (or the contour, if it
 * would get too short, or no point is selected). Each change is one undo step.
 */

import type { MapPoint } from './baseTool';
import type { MapStore } from '../store/mapStore';
import { useViewStore } from '../store/viewStore';
import { pointAt, midpointAt } from '../utils/lines';
import { readContours, contourAt, contourPath, minContourPoints } from '../utils/contours';
import { DEFAULT_REACH_CELLS } from '../utils/spotHeights';

/** Screen pixels around a contour, point or handle that count as clicking it. */
export const CONTOUR_PICK_RADIUS_PX = 8;
const _DOUBLE_CLICK_MS = 400;

interface _Drag { contourId: number; index: number; points: MapPoint[]; inserted: boolean; moved: boolean }

let _drag: _Drag | null = null;
let _lastPress = { time: 0, x: 0, y: 0 };

const _view = () => useViewStore.getState();

/** Height for new contours: its own setting, else the Set target. */
export const newContourCm = (store: MapStore) => store.heightBrush.contourCm ?? store.heightBrush.targetCm;

function _finish(store: MapStore, closed: boolean): void {
  const draft = _view().draftLine;
  _view().setDraftLine(null);
  if (!draft || draft.length < minContourPoints(closed)) return;
  const id = store.addContour(draft, closed, newContourCm(store), store.heightBrush.contourReachCells ?? DEFAULT_REACH_CELLS);
  if (id !== null) _view().selectContour(id);
}

const _selected = (store: MapStore) => {
  const id = _view().selectedContourId;
  return id !== null && store.mapData ? readContours(store.mapData).find((c) => c.id === id) : undefined;
};

export function contourPress(store: MapStore, pos: MapPoint): void {
  if (!store.mapData) return;
  const r = CONTOUR_PICK_RADIUS_PX / store.zoom;
  const now = Date.now();
  const isDouble = now - _lastPress.time < _DOUBLE_CLICK_MS && Math.hypot(pos.x - _lastPress.x, pos.y - _lastPress.y) <= r;
  _lastPress = { time: now, x: pos.x, y: pos.y };

  const draft = _view().draftLine;
  if (draft) {
    if (draft.length >= 3 && Math.hypot(pos.x - draft[0].x, pos.y - draft[0].y) <= r) { _finish(store, true); return; }
    if (isDouble) { _finish(store, false); return; }
    _view().setDraftLine([...draft, pos]);
    return;
  }

  const selected = _selected(store);
  if (selected) {
    const i = pointAt(selected.points, pos.x, pos.y, r);
    if (i >= 0) {
      _view().selectContour(selected.id, i);
      _drag = { contourId: selected.id, index: i, points: selected.points, inserted: false, moved: false };
      return;
    }
    // Midpoint handles, including the closing segment of a loop
    const path = contourPath(selected);
    const m = midpointAt(path, pos.x, pos.y, r);
    if (m >= 0) {
      const mid = { x: (path[m].x + path[m + 1].x) / 2, y: (path[m].y + path[m + 1].y) / 2 };
      const points = [...selected.points.slice(0, m + 1), mid, ...selected.points.slice(m + 1)];
      _view().selectContour(selected.id, m + 1);
      _view().setDragPoints(points);
      _drag = { contourId: selected.id, index: m + 1, points, inserted: true, moved: false };
      return;
    }
  }

  const hit = contourAt(readContours(store.mapData), pos.x, pos.y, r);
  if (hit) { _view().selectContour(hit.id); return; }
  // A click off any contour deselects; the next click starts one
  if (selected) { _view().selectContour(null); return; }
  _view().setDraftLine([pos]);
}

export function contourDrag(pos: MapPoint): void {
  if (!_drag) return;
  _drag.moved = true;
  _drag.points = _drag.points.map((p, k) => (k === _drag!.index ? { x: pos.x, y: pos.y } : p));
  _view().setDragPoints(_drag.points);
}

export function contourCancel(): void {
  _drag = null;
  _view().setDragPoints(null);
}

/** Ends a drag; returns whether one was in progress. */
export function contourRelease(store: MapStore): boolean {
  const drag = _drag;
  _drag = null;
  _view().setDragPoints(null);
  if (drag && (drag.moved || drag.inserted)) store.updateContour(drag.contourId, { points: drag.points });
  return drag !== null;
}

/**
 * Keyboard for Contour mode; returns true when the key was used. Enter finishes,
 * Esc cancels (or deselects), Backspace removes the last drawn point,
 * Delete/Backspace removes the selected point or contour.
 */
export function contourKey(key: string, store: MapStore): boolean {
  const view = _view();
  if (view.draftLine) {
    if (key === 'Enter') { _finish(store, false); return true; }
    if (key === 'Escape') { view.setDraftLine(null); return true; }
    if (key === 'Backspace') {
      const rest = view.draftLine.slice(0, -1);
      view.setDraftLine(rest.length ? rest : null);
      return true;
    }
    return false;
  }
  if (view.selectedContourId === null) return false;
  if (key === 'Escape') { view.selectContour(null); return true; }
  if (key !== 'Delete' && key !== 'Backspace') return false;
  const c = _selected(store);
  if (!c) { view.selectContour(null); return true; }
  if (view.selectedPoint !== null && c.points.length > minContourPoints(c.closed)) {
    store.updateContour(c.id, { points: c.points.filter((_, k) => k !== view.selectedPoint) });
    view.selectContour(c.id, null);
  } else {
    store.deleteContour(c.id);
    view.selectContour(null);
  }
  return true;
}
