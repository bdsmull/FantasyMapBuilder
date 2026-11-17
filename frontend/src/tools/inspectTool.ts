/**
 * Inspect tool: look at the map without changing it.
 *
 * A click (or tap) shows what is at that point in the inspector. Dragging pans the
 * map instead, so it doubles as a hand tool for exploring on a tablet.
 */

import type { Tool, MapPoint } from './baseTool';
import type { MapStore } from '../store/mapStore';
import { useViewStore } from '../store/viewStore';

/** Screen pixels the pointer may move before a press becomes a pan. */
const _DRAG_THRESHOLD_PX = 4;

interface _Press {
  /** Map point pressed. */
  map: MapPoint;
  /** Where that was on screen, and the pan at the time. */
  screen: MapPoint;
  pan: MapPoint;
}

let _press: _Press | null = null;
let _panning = false;

/** Screen position of a map point, using the view the point was measured in. */
const _toScreen = (p: MapPoint, store: MapStore): MapPoint => ({ x: p.x * store.zoom + store.pan.x, y: p.y * store.zoom + store.pan.y });

export const inspectTool: Tool = {
  name: 'inspect',
  cursor: 'help',

  onPress(_col: number, _row: number, store: MapStore, pos?: MapPoint): void {
    _press = pos ? { map: pos, screen: _toScreen(pos, store), pan: { ...store.pan } } : null;
    _panning = false;
  },

  onDrag(_col: number, _row: number, store: MapStore, pos?: MapPoint): void {
    if (!_press || !pos) return;
    const now = _toScreen(pos, store);
    const dx = now.x - _press.screen.x, dy = now.y - _press.screen.y;
    if (!_panning && Math.hypot(dx, dy) < _DRAG_THRESHOLD_PX) return;
    _panning = true;
    // Absolute: the pan at the press, moved by how far the pointer has travelled
    store.setPan({ x: _press.pan.x + dx, y: _press.pan.y + dy });
  },

  onCancel(): void {
    _press = null;
    _panning = false;
  },

  onRelease(): void {
    if (_press && !_panning) useViewStore.getState().setInspected(_press.map);
    _press = null;
    _panning = false;
  },
};
