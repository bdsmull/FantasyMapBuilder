/**
 * Line drawing (#6): draw and edit roads and rivers (Tiled polylines). Two tools share it
 * (#38): Roads works on road lines, the Water tool's Rivers mode on waterways; each only
 * picks and draws lines of its own kind (by the line's class).
 *
 * Drawing: click to add points; double-click or Enter finishes (2+ points);
 * Esc cancels; Backspace removes the last point.
 * Editing: click a line to select it. Drag its points to move them; drag a segment's
 * midpoint handle to insert a point there. Delete removes the selected point (or the
 * line, if it would get shorter than two points, or no point is selected).
 * A drag is committed on release as one undo step.
 * Lines from other maps (ghosts) can be selected, read-only, to copy or open them.
 */

import type { Tool, MapPoint } from './baseTool';
import type { MapStore } from '../store/mapStore';
import { useViewStore } from '../store/viewStore';
import { useWorldSetStore } from '../store/worldSetStore';
import {
  readLines, shownLines, lineAt, linePoints, pointAt, midpointAt, readWidths, insertPoint, removePoint, nearestOnLine,
} from '../utils/lines';
import type { LineRef } from '../utils/lines';
import { resolveLineClasses, classForType } from '../data/lineClasses';
import type { LineClass, LineKind } from '../data/lineClasses';
import { useCrossScaleStore } from '../store/crossScaleStore';
import { surfaceKey } from '../store/worldSurfaceStore';
import { refinedByIndex, hiddenAreas, mapExtent } from '../utils/crossScaleLines';
import type { Rect } from '../utils/crossScaleLines';

const _inRect = (p: MapPoint, r: Rect) => p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1;

/** The line classes for the open map: its world set's, when that's the active one. */
export function mapLineClasses(store: Pick<MapStore, 'mapWorldSet'>): LineClass[] {
  const ws = useWorldSetStore.getState();
  return resolveLineClasses(store.mapWorldSet === ws.activeWorldSetName ? ws.activeWorldSet?.lineClasses : undefined);
}

/** Whether a line (by its type) is of `kind`, or any kind when that's undefined. */
const _isKind = (type: string, kind: LineKind | undefined, classes: LineClass[]) =>
  kind === undefined || classForType(type, classes).cls.kind === kind;

/** The open map's lines of `kind` (all kinds when undefined); with `shownOnly`, only those drawn (see `shownLines`). */
export function linesOfKind(store: MapStore, kind: LineKind | undefined, shownOnly = false): LineRef[] {
  if (!store.mapData) return [];
  const classes = mapLineClasses(store);
  return (shownOnly ? shownLines(store.mapData) : readLines(store.mapData)).filter((l) => _isKind(l.object.type, kind, classes));
}

/** The visible line from another map under (x, y), or null: "<map>#<id>". Only lines of `kind`, when given. */
export function ghostAt(store: MapStore, p: MapPoint, radius: number, kind?: LineKind): string | null {
  const cs = useCrossScaleStore.getState();
  if (!store.mapData || !_view().showLines || cs.key !== surfaceKey(store.mapWorldSet, store.mapName)) return null;
  const index = refinedByIndex(store.mapName, store.mapData, cs.related);
  const openRect = mapExtent(store.mapData);
  const classes = mapLineClasses(store);
  for (let i = cs.ghosts.length - 1; i >= 0; i--) {
    const g = cs.ghosts[i];
    if (!_isKind(g.object.type, kind, classes)) continue;
    if (index.get(g.key)?.includes(store.mapName)) continue; // refined here: hidden
    if (g.clipTo && !_inRect(p, g.clipTo)) continue;
    if (hiddenAreas(g.key, index, store.mapName, openRect, cs.related).some((r) => _inRect(p, r))) continue;
    if (nearestOnLine(g.placed.polyline ?? [], p.x, p.y).d <= radius) return g.key;
  }
  return null;
}

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

function _finishDraft(store: MapStore, kind: LineKind): void {
  const draft = _view().draftLine;
  _view().setDraftLine(null);
  if (!draft || draft.length < 2) return;
  const id = store.addLine(draft, _view().newLineClass[kind]);
  if (id !== null) _view().selectLine(id);
}

/** A tool that draws and edits lines of one kind. */
function _lineTool(name: string, kind: LineKind): Tool {
  return {
  name,
  cursor: 'crosshair',

  onPress(_col, _row, store, pos) {
    if (!pos || !store.mapData) return;
    const r = LINE_PICK_RADIUS_PX / store.zoom;
    const now = Date.now();
    const isDouble = now - _lastPress.time < _DOUBLE_CLICK_MS && Math.hypot(pos.x - _lastPress.x, pos.y - _lastPress.y) <= r;
    _lastPress = { time: now, x: pos.x, y: pos.y };

    const draft = _view().draftLine;
    if (draft) {
      if (isDouble) { _finishDraft(store, kind); return; }
      _view().setDraftLine([...draft, pos]);
      return;
    }

    const selectedId = _view().selectedLineId;
    const selected = selectedId !== null ? linesOfKind(store, kind).find((l) => l.id === selectedId) : undefined;
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

    const hit = _view().showLines ? lineAt(linesOfKind(store, kind, true), pos.x, pos.y, r) : null;
    if (hit) { _view().setSelectedGhost(null); _view().selectLine(hit.id); return; }
    const ghost = ghostAt(store, pos, r, kind);
    if (ghost) { _view().selectLine(null); _view().setSelectedGhost(ghost); return; }
    // A click off any line deselects; the next click starts a line
    if (selectedId !== null || _view().selectedGhost !== null) { _view().selectLine(null); _view().setSelectedGhost(null); return; }
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
}

/** Roads: draw and edit road lines. */
export const roadsTool: Tool = _lineTool('roads', 'road');
/** The Water tool's Rivers mode: draw and edit rivers, streams, brooks and canals. */
export const riversTool: Tool = _lineTool('rivers', 'water');

/**
 * Keyboard for line drawing (Roads, or the Water tool's Rivers mode: `kind`); returns
 * true when the key was used.
 * Enter finishes a line, Esc cancels it (or deselects), Backspace removes the last
 * drawn point, Delete/Backspace removes the selected point or line.
 */
export function lineToolKey(key: string, store: MapStore, kind: LineKind = 'road'): boolean {
  const view = _view();
  if (view.draftLine) {
    if (key === 'Enter') { _finishDraft(store, kind); return true; }
    if (key === 'Escape') { view.setDraftLine(null); return true; }
    if (key === 'Backspace') {
      const rest = view.draftLine.slice(0, -1);
      view.setDraftLine(rest.length ? rest : null);
      return true;
    }
    return false;
  }
  if (view.selectedGhost !== null && key === 'Escape') { view.setSelectedGhost(null); return true; }
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
