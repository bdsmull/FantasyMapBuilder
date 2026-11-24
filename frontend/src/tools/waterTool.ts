/**
 * Water tool (#38): lakes and the sea (Lakes mode, see waterMode.ts; needs elevation),
 * and drawn rivers, streams, brooks and canals (Rivers mode, see lineTool.ts). Convert
 * to River works in either mode (MapCanvas handles its click).
 */

import type { Tool } from './baseTool';
import { useViewStore } from '../store/viewStore';
import { heightAt } from '../utils/heightGrid';
import { riversTool } from './lineTool';
import { waterPress, waterDrag, waterRelease, waterCancel, waterPicks } from './waterMode';

const _rivers = () => useViewStore.getState().waterMode === 'rivers';

export const waterTool: Tool = {
  name: 'water',
  cursor: 'crosshair',

  picks(store, pos) {
    return _rivers() ? !!riversTool.picks?.(store, pos) : waterPicks(store, pos);
  },

  onPress(col, row, store, pos) {
    if (_rivers()) { riversTool.onPress(col, row, store, pos); return; }
    if (!pos || !store.heights || !store.mapData) return;
    waterPress(store, pos);
  },

  onDrag(col, row, store, pos) {
    if (_rivers()) { riversTool.onDrag(col, row, store, pos); return; }
    if (pos) waterDrag(pos);
  },

  onRelease(store) {
    if (_rivers()) { riversTool.onRelease(store); return; }
    waterRelease(store);
  },

  onCancel(store) {
    riversTool.onCancel?.(store);
    waterCancel();
  },

  /** Lakes mode: right-click picks the height under the pointer for new water. */
  onRightPress(_col, _row, store, pos) {
    if (_rivers() || !pos || !store.mapData || !store.heights) return;
    store.setHeightBrush({ waterCm: Math.round(heightAt(store.mapData, store.heights, pos.x, pos.y)) });
  },
};
