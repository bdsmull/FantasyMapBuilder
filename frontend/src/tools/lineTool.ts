/**
 * Line tool (#6): draw and edit roads and rivers (Tiled polylines).
 *
 * Drawing: click to add points; double-click or Enter finishes (2+ points);
 * Esc cancels; Backspace removes the last point.
 * Editing: click a line to select it. Drag its points to move them; drag a segment's
 * midpoint handle to insert a point there. Delete removes the selected point (or the
 * line, if it would get shorter than two points, or no point is selected).
 * A drag is committed on release as one undo step.
 */

import type { Tool, MapPoint } from './baseTool';
import type { MapStore } from '../store/mapStore';
import { useViewStore } from '../store/viewStore';
import {
  readLines, lineAt, linePoints, pointAt, midpointAt, readWidths, insertPoint, removePoint,
} from '../utils/lines';

/** Screen pixels around a line, point or handle that count as clicking it. */
export const LINE_PICK_RADIUS_PX = 8;
const _DOUBLE_CLICK_MS = 400;

interface _Drag {
  lineId: number;
  index: number;
  points: MapPoint[];
  widths: (number | null)[];
  /** True when the drag inserted the point (so a click without moving still adds it). */
  inserted: boolean;
  moved: boolean;
}

let _drag: _Drag | null = null;
let _lastPress = { time: 0, x: 0, y: 0 };

const _view = () => useViewStore.getState();

function _finishDraft(store: MapStore): void {
  const draft = _view().draftLine;
  _view().setDraftLine(null);
  if (!draft || draft.length < 2) return;
  const id = store.addLine(draft, _view().newLineClass);
  if (id !== null) _view().selectLine(id);
}

export const lineTool: Tool = {
  name: 'line',
  cursor: 'crosshair',

  onPress(_col, _row, store, pos) {
    if (!pos || !store.mapData) return;
    const r = LINE_PICK_RADIUS_PX / store.zoom;
    const now = Date.now();
    const isDouble = now - _lastPress.time < _DOUBLE_CLICK_MS && Math.hypot(pos.x - _lastPress.x, pos.y - _lastPress.y) <= r;
    _lastPress = { time: now, x: pos.x, y: pos.y };

    const draft = _view().draftLine;
    if (draft) {
      if (isDouble) { _finishDraft(store); return; }
      _view().setDraftLine([...draft, pos]);
      return;
    }

    const selectedId = _view().selectedLineId;
    const selected = selectedId !== null ? readLines(store.mapData).find((l) => l.id === selectedId) : undefined;
    if (selected) {
      const points = linePoints(selected.object);
      const widths = readWidths(selected.object);
      const i = pointAt(points, pos.x, pos.y, r);
      if (i >= 0) {
        _view().selectLine(selected.id, i);
        _drag = { lineId: selected.id, index: i, points, widths, inserted: false, moved: false };
        return;
      }
      const m = midpointAt(points, pos.x, pos.y, r);
      if (m >= 0) {
        const mid = { x: (points[m].x + points[m + 1].x) / 2, y: (points[m].y + points[m + 1].y) / 2 };
        const next = insertPoint(points, widths, m, mid);
        _view().selectLine(selected.id, m + 1);
        _view().setDragPoints(next.points);
        _drag = { lineId: selected.id, index: m + 1, points: next.points, widths: next.widths, inserted: true, moved: false };
        return;
      }
    }

    const hit = lineAt(readLines(store.mapData, true), pos.x, pos.y, r);
    if (hit) { _view().selectLine(hit.id); return; }
    if (selectedId !== null) { _view().selectLine(null); return; } // a click off the line deselects
    _view().setDraftLine([pos]);
  },

  onDrag(_col, _row, _store, pos) {
    if (!_drag || !pos) return;
    _drag.moved = true;
    _drag.points = _drag.points.map((p, k) => (k === _drag!.index ? { x: pos.x, y: pos.y } : p));
    _view().setDragPoints(_drag.points);
  },

  onCancel() {
    _drag = null;
    _view().setDragPoints(null);
  },

  onRelease(store) {
    const drag = _drag;
    _drag = null;
    _view().setDragPoints(null);
    if (drag && (drag.moved || drag.inserted)) {
      store.updateLine(drag.lineId, { points: drag.points, widths: drag.widths });
    }
  },
};

/**
 * Keyboard for the Line tool; returns true when the key was used.
 * Enter finishes a line, Esc cancels it (or deselects), Backspace removes the last
 * drawn point, Delete/Backspace removes the selected point or line.
 */
export function lineToolKey(key: string, store: MapStore): boolean {
  const view = _view();
  if (view.draftLine) {
    if (key === 'Enter') { _finishDraft(store); return true; }
    if (key === 'Escape') { view.setDraftLine(null); return true; }
    if (key === 'Backspace') {
      const rest = view.draftLine.slice(0, -1);
      view.setDraftLine(rest.length ? rest : null);
      return true;
    }
    return false;
  }
  if (view.selectedLineId === null || !store.mapData) return false;
  if (key === 'Escape') { view.selectLine(null); return true; }
  if (key !== 'Delete' && key !== 'Backspace') return false;
  const line = readLines(store.mapData).find((l) => l.id === view.selectedLineId);
  if (!line) { view.selectLine(null); return true; }
  const points = linePoints(line.object);
  if (view.selectedPoint !== null && points.length > 2) {
    const next = removePoint(points, readWidths(line.object), view.selectedPoint);
    store.updateLine(line.id, next);
    view.selectLine(line.id, null);
  } else {
    store.deleteLine(line.id);
    view.selectLine(null);
  }
  return true;
}
