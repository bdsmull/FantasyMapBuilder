/**
 * HeightTool — paints the map's elevation with the brush set in the Layers panel
 * (raise, lower, set, smooth, release). A press-drag-release is one stroke and one
 * undo step. Right-click picks the height under the pointer as the "set" target.
 */

import type { Tool, MapPoint } from './baseTool';
import { cellDistance } from '../utils/heightBrush';
import { heightAt } from '../utils/heightGrid';

/** Last position a dab was applied in the current stroke. */
let _lastDab: MapPoint | null = null;

export const heightTool: Tool = {
  name: 'height',
  cursor: 'crosshair',

  onPress(_col, _row, store, pos) {
    if (!pos || !store.heights) return;
    _lastDab = pos;
    store.applyHeightDab(pos.x, pos.y);
  },

  onDrag(_col, _row, store, pos) {
    if (!pos || !_lastDab || !store.mapData) return;
    // Space dabs by a fraction of the radius so stroke strength doesn't depend
    // on how many pointer events the browser sends
    const spacing = Math.max(0.25, store.heightBrush.radius / 3);
    if (cellDistance(store.mapData, _lastDab, pos) < spacing) return;
    _lastDab = pos;
    store.applyHeightDab(pos.x, pos.y);
  },

  onRelease(store) {
    _lastDab = null;
    store.commitHeightStroke();
  },

  onRightPress(_col, _row, store, pos) {
    if (!pos || !store.mapData || !store.heights) return;
    store.setHeightBrush({ mode: 'set', targetCm: Math.round(heightAt(store.mapData, store.heights, pos.x, pos.y)) });
  },
};
