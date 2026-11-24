/**
 * Points tool — places, selects and removes named point objects on object layers.
 * Left-click/tap on a point: select it (the panel's Delete button, or Delete / Backspace,
 * removes it). Left-click elsewhere: add a point at the cell's centre on the active object
 * layer, selected. Right-click removes the nearest point (on maps outside a world set;
 * inside one, right-click opens the map menu). On a world set's root map, dragging the
 * world origin marker (#9) moves it.
 */

import type { Tool } from './baseTool';
import type { MapStore } from '../store/mapStore';
import { isObjectLayer } from '../types/tmj';
import type { TmjMap, TmjObject } from '../types/tmj';
import { cellCenter } from '../canvas/canvasUtils';
import { useViewStore } from '../store/viewStore';
import { SPOT_TYPE } from '../utils/spotHeights';
import { WATER_TYPE } from '../utils/water';
import { WORLD_ORIGIN_TYPE, defaultOriginPixel, findWorldOrigin } from '../utils/worldCoords';
import { useWorldSetStore } from '../store/worldSetStore';
import { wrapPixelX } from '../utils/worldWrap';

/** Screen pixels around a point's marker that count as clicking it. */
export const POINT_PICK_RADIUS_PX = 10;

/** A plain point object: not a line, area, spot height, water body or the world origin (those have their own handling). */
export function isPlainPoint(o: TmjObject): boolean {
  const point = o.point || (o.width === 0 && o.height === 0 && !o.polyline && !o.polygon);
  return !!point && o.type !== SPOT_TYPE && o.type !== WATER_TYPE && o.type !== WORLD_ORIGIN_TYPE;
}

/** Whether the open map is a root of its (active) world set: the one that holds the world origin. */
export function openMapIsRoot(store: Pick<MapStore, 'mapName' | 'mapWorldSet'>): boolean {
  const ws = useWorldSetStore.getState();
  return !!store.mapWorldSet && store.mapWorldSet === ws.activeWorldSetName
    && !!ws.activeWorldSet?.nodes.some((n) => n.mapName === store.mapName && n.parentMapName === null);
}

/** Where the world origin marker is on the open map (#9), or null when it shows none: roots, and maps with an origin object. */
export function worldOriginMarker(store: Pick<MapStore, 'mapData' | 'mapName' | 'mapWorldSet'>): { x: number; y: number; stored: boolean } | null {
  const map = store.mapData;
  if (!map) return null;
  const found = findWorldOrigin(map);
  if (found) return { x: found.object.x, y: found.object.y, stored: true };
  return openMapIsRoot(store) ? { ...defaultOriginPixel(map), stored: false } : null;
}

/** Dragging the world origin with the Points tool. */
let _draggingOrigin = false;

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

  picks(store, pos) {
    if (!store.mapData) return false;
    const r = _radius(store, store.mapData), origin = worldOriginMarker(store);
    return (!!origin && Math.hypot(origin.x - pos.x, origin.y - pos.y) <= r) || pointNear(store.mapData, pos.x, pos.y, r) !== null;
  },

  onPress(col, row, store, pos) {
    const { mapData, activeLayerIndex } = store;
    if (!mapData) return;
    const at = pos ?? cellCenter(mapData, col, row);
    const origin = worldOriginMarker(store);
    if (origin && Math.hypot(origin.x - at.x, origin.y - at.y) <= _radius(store, mapData)) {
      _draggingOrigin = true;
      _view().setSelectedObjectId(null);
      _view().setOriginDrag({ x: origin.x, y: origin.y });
      return;
    }
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

  onDrag(_col, _row, _store, pos) {
    if (_draggingOrigin && pos) _view().setOriginDrag({ x: Math.round(pos.x), y: Math.round(pos.y) });
  },
  onRelease(store) {
    if (!_draggingOrigin) return;
    _draggingOrigin = false;
    const drag = _view().originDrag;
    const to = drag && store.mapData ? { x: wrapPixelX(store.mapData, drag.x), y: drag.y } : drag;
    _view().setOriginDrag(null);
    const from = worldOriginMarker(store);
    if (to && (!from?.stored || from.x !== to.x || from.y !== to.y)) store.setWorldOrigin(to.x, to.y);
  },
  onCancel() {
    _draggingOrigin = false;
    _view().setOriginDrag(null);
  },

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
