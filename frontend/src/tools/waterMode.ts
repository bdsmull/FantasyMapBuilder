/**
 * The Water tool's Lakes mode (#8 phase 4, #38): place lakes and seas. A click on a water
 * body selects it (drag to move it, so it fills another basin); a click elsewhere adds
 * one there with the surface height set in the panel. Each change is one undo step.
 */

import type { MapPoint } from './baseTool';
import type { MapStore } from '../store/mapStore';
import { useViewStore } from '../store/viewStore';
import { readWaterBodies, waterBodyNear } from '../utils/water';
import { wrapPixelX } from '../utils/worldWrap';

/** Screen pixels around a water body's marker that count as clicking it. */
export const WATER_PICK_RADIUS_PX = 10;

let _drag: { id: number; at: MapPoint; moved: boolean } | null = null;

const _view = () => useViewStore.getState();

/** Surface height for new water bodies: its own setting, else the Set target. */
export const newWaterCm = (store: MapStore) => store.heightBrush.waterCm ?? store.heightBrush.targetCm;

/** Whether a water body's marker is at `pos`. */
export function waterPicks(store: MapStore, pos: MapPoint): boolean {
  return !!store.mapData && waterBodyNear(readWaterBodies(store.mapData), pos.x, pos.y, WATER_PICK_RADIUS_PX / store.zoom) !== null;
}

export function waterPress(store: MapStore, pos: MapPoint): void {
  if (!store.mapData) return;
  const hit = waterBodyNear(readWaterBodies(store.mapData), pos.x, pos.y, WATER_PICK_RADIUS_PX / store.zoom);
  if (hit) {
    _view().setSelectedWaterId(hit.id);
    _drag = { id: hit.id, at: { x: hit.x, y: hit.y }, moved: false };
    return;
  }
  const id = store.addWaterBody(pos.x, pos.y, newWaterCm(store));
  _view().setSelectedWaterId(id);
}

export function waterDrag(pos: MapPoint): void {
  if (!_drag) return;
  _drag.moved = true;
  _drag.at = pos;
  _view().setDragPoints([pos]);
}

export function waterCancel(): void {
  _drag = null;
  _view().setDragPoints(null);
}

/** Ends a drag; returns whether one was in progress. */
export function waterRelease(store: MapStore): boolean {
  const drag = _drag;
  _drag = null;
  _view().setDragPoints(null);
  if (drag?.moved) {
    const x = store.mapData ? wrapPixelX(store.mapData, drag.at.x) : drag.at.x;
    store.updateWaterBody(drag.id, { x, y: drag.at.y });
  }
  return drag !== null;
}

/** Keyboard for the Water tool's Lakes mode: Esc stops Convert to River or deselects, Delete removes the selected body. Returns true when used. */
export function waterKey(key: string, store: MapStore): boolean {
  const view = _view();
  if (view.convertingStream && key === 'Escape') { view.setConvertingStream(false); return true; }
  if (view.selectedWaterId === null) return false;
  if (key === 'Escape') { view.setSelectedWaterId(null); return true; }
  if (key !== 'Delete' && key !== 'Backspace') return false;
  store.deleteWaterBody(view.selectedWaterId);
  view.setSelectedWaterId(null);
  return true;
}
