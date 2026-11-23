/**
 * Points tool — places, selects and removes named point objects on object layers.
 * Left-click/tap on a point: select it (the panel's Delete button, or Delete / Backspace,
 * removes it). Left-click elsewhere: add a point at the cell's centre on the active object
 * layer, selected. Right-click removes the nearest point (on maps outside a world set;
 * inside one, right-click opens the map menu).
 */

import type { Tool } from './baseTool';
import type { MapStore } from '../store/mapStore';
import { isObjectLayer } from '../types/tmj';
import type { TmjMap, TmjObject } from '../types/tmj';
import { cellCenter } from '../canvas/canvasUtils';
import { useViewStore } from '../store/viewStore';
import { SPOT_TYPE } from '../utils/spotHeights';
import { WATER_TYPE } from '../utils/water';

/** Screen pixels around a point's marker that count as clicking it. */
export const POINT_PICK_RADIUS_PX = 10;

/** A plain point object: not a line, area, spot height or water body (those have their own tools). */
export function isPlainPoint(o: TmjObject): boolean {
  const point = o.point || (o.width === 0 && o.height === 0 && !o.polyline && !o.polygon);
  return !!point && o.type !== SPOT_TYPE && o.type !== WATER_TYPE;
}

/** The nearest plain point within `radius` map pixels of (x, y) on a shown object layer, or null. */
export function pointNear(map: TmjMap, x: number, y: number, radius: number): { layerIndex: number; object: TmjObject } | null {
  let best: { layerIndex: number; object: TmjObject } | null = null;
  let bestD = radius;
  map.layers.forEach((layer, layerIndex) => {
    if (!isObjectLayer(layer) || !layer.visible) return;
    for (const o of layer.objects) {
      if (!o.visible || !isPlainPoint(o)) continue;
      const d = Math.hypot(o.x - x, o.y - y);
      if (d <= bestD) { bestD = d; best = { layerIndex, object: o }; }
    }
  });
  return best;
}

/** Remove a point by ID, wherever it is. Returns whether one was removed. */
export function deletePoint(store: MapStore, id: number): boolean {
  const layerIndex = store.mapData?.layers.findIndex((l) => isObjectLayer(l) && l.objects.some((o) => o.id === id)) ?? -1;
  if (layerIndex < 0) return false;
  store.removeObject(layerIndex, id);
  return true;
}

const _view = () => useViewStore.getState();

/** Pick radius in map pixels: the marker's size on screen, but at least half a cell. */
const _radius = (store: MapStore, map: TmjMap) =>
  Math.max(POINT_PICK_RADIUS_PX / store.zoom, Math.min(map.tilewidth, map.tileheight) / 2);

export const pointTool: Tool = {
  name: 'point',
  cursor: 'pointer',

  onPress(col, row, store, pos) {
    const { mapData, activeLayerIndex } = store;
    if (!mapData) return;
    const at = pos ?? cellCenter(mapData, col, row);
    const hit = pointNear(mapData, at.x, at.y, _radius(store, mapData));
    if (hit) {
      _view().setSelectedObjectId(hit.object.id);
      return;
    }

    const layer = mapData.layers[activeLayerIndex];
    if (!layer || !isObjectLayer(layer)) { _view().setSelectedObjectId(null); return; }
    const { x, y } = cellCenter(mapData, col, row);
    const id = mapData.nextobjectid;
    store.addObject(activeLayerIndex, {
      id, name: `Point ${id}`, type: '', x, y, width: 0, height: 0, visible: true, point: true,
    });
    _view().setSelectedObjectId(id);
  },

  onDrag() { /* no-op */ },
  onRelease() { /* no-op */ },

  onRightPress(col, row, store, pos) {
    const { mapData } = store;
    if (!mapData) return;
    const at = pos ?? cellCenter(mapData, col, row);
    const hit = pointNear(mapData, at.x, at.y, Math.max(mapData.tilewidth, mapData.tileheight));
    if (!hit) return;
    store.removeObject(hit.layerIndex, hit.object.id);
    if (_view().selectedObjectId === hit.object.id) _view().setSelectedObjectId(null);
  },
};

/** Keyboard for the Points tool: Esc deselects, Delete / Backspace removes the selected point. Returns true when used. */
export function pointKey(key: string, store: MapStore): boolean {
  const view = _view();
  if (view.selectedObjectId === null) return false;
  if (key === 'Escape') { view.setSelectedObjectId(null); return true; }
  if (key !== 'Delete' && key !== 'Backspace') return false;
  deletePoint(store, view.selectedObjectId);
  view.setSelectedObjectId(null);
  return true;
}
