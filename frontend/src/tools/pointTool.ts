/**
 * PointObjectTool — places named point objects on ObjectLayers.
 * Left-click/tap: add a point object at the clicked pixel.
 * Right-click/long-press: remove the nearest point object within one tile.
 */

import type { Tool } from './baseTool';
import { isObjectLayer } from '../types/tmj';
import type { TmjObject } from '../types/tmj';

/** Monotonically increasing ID counter for new objects. */
let _nextId = 1000;

export const pointTool: Tool = {
  name: 'point',
  cursor: 'pointer',

  onPress(col, row, store) {
    const { mapData, activeLayerIndex } = store;
    if (!mapData) return;
    const layer = mapData.layers[activeLayerIndex];
    if (!layer || !isObjectLayer(layer)) return;

    // Convert tile to pixel centre
    const px = (col + 0.5) * mapData.tilewidth;
    const py = (row + 0.5) * mapData.tileheight;

    const obj: TmjObject = {
      id: _nextId++,
      name: `Object ${_nextId}`,
      type: '',
      x: px,
      y: py,
      width: 0,
      height: 0,
      visible: true,
      point: true,
    };
    store.addObject(activeLayerIndex, obj);
  },

  onDrag() { /* no-op */ },
  onRelease() { /* no-op */ },

  onRightPress(col, row, store) {
    const { mapData, activeLayerIndex } = store;
    if (!mapData) return;
    const layer = mapData.layers[activeLayerIndex];
    if (!layer || !isObjectLayer(layer)) return;

    // Target pixel = centre of clicked tile
    const px = (col + 0.5) * mapData.tilewidth;
    const py = (row + 0.5) * mapData.tileheight;
    const threshold = Math.max(mapData.tilewidth, mapData.tileheight);

    // Find the nearest object within threshold distance
    let nearest: TmjObject | null = null;
    let minDist = Infinity;
    for (const obj of layer.objects) {
      const dx = obj.x - px;
      const dy = obj.y - py;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < threshold && dist < minDist) {
        minDist = dist;
        nearest = obj;
      }
    }

    if (nearest) {
      store.removeObject(activeLayerIndex, nearest.id);
    }
  },
};
