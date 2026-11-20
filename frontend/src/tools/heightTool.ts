/**
 * HeightTool — paints the map's elevation with the brush set in the Layers panel
 * (raise, lower, set, smooth, release). A press-drag-release is one stroke and one
 * undo step. Right-click picks the height under the pointer as the "set" target.
 *
 * In Spot mode it places spot heights instead: a click on an existing spot selects
 * it for editing, a click elsewhere adds one at the target height (and selects it).
 * In Contour mode it draws and edits contour lines (see contourMode.ts); in Water mode
 * it places lakes and seas (see waterMode.ts).
 */

import type { Tool, MapPoint } from './baseTool';
import { cellDistance } from '../utils/heightBrush';
import { heightAt } from '../utils/heightGrid';
import { readSpots, spotNear, DEFAULT_REACH_CELLS } from '../utils/spotHeights';
import { useViewStore } from '../store/viewStore';
import { contourPress, contourDrag, contourRelease, contourCancel } from './contourMode';
import { waterPress, waterDrag, waterRelease, waterCancel } from './waterMode';

/** Last position a dab was applied in the current stroke. */
let _lastDab: MapPoint | null = null;

/** Screen pixels around a spot marker that count as clicking it. */
export const SPOT_PICK_RADIUS_PX = 10;

export const heightTool: Tool = {
  name: 'height',
  cursor: 'crosshair',

  onPress(_col, _row, store, pos) {
    if (!pos || !store.heights || !store.mapData) return;
    if (store.heightBrush.mode === 'contour') { contourPress(store, pos); return; }
    if (store.heightBrush.mode === 'water') { waterPress(store, pos); return; }
    if (store.heightBrush.mode === 'spot') {
      const hit = spotNear(readSpots(store.mapData), pos.x, pos.y, SPOT_PICK_RADIUS_PX / store.zoom);
      const id = hit ? hit.id
        : store.addSpotHeight(pos.x, pos.y, store.heightBrush.targetCm, store.heightBrush.spotReachCells ?? DEFAULT_REACH_CELLS);
      useViewStore.getState().setSelectedSpotId(id);
      return;
    }
    _lastDab = pos;
    store.applyHeightDab(pos.x, pos.y);
  },

  onDrag(_col, _row, store, pos) {
    if (pos && store.heightBrush.mode === 'contour') { contourDrag(pos); return; }
    if (pos && store.heightBrush.mode === 'water') { waterDrag(pos); return; }
    if (!pos || !_lastDab || !store.mapData) return;
    // Space dabs by a fraction of the radius so stroke strength doesn't depend
    // on how many pointer events the browser sends
    const spacing = Math.max(0.25, store.heightBrush.radius / 3);
    if (cellDistance(store.mapData, _lastDab, pos) < spacing) return;
    _lastDab = pos;
    store.applyHeightDab(pos.x, pos.y);
  },

  onCancel(store) {
    contourCancel();
    waterCancel();
    if (_lastDab) { _lastDab = null; store.commitHeightStroke(); }
  },

  onRelease(store) {
    if (contourRelease(store) || waterRelease(store)) return;
    if (!_lastDab) return;
    _lastDab = null;
    store.commitHeightStroke();
  },

  onRightPress(_col, _row, store, pos) {
    if (!pos || !store.mapData || !store.heights) return;
    const targetCm = Math.round(heightAt(store.mapData, store.heights, pos.x, pos.y));
    // Spot and Contour modes take the height for new marks; painting modes switch to Set with it
    const mode = store.heightBrush.mode;
    store.setHeightBrush(mode === 'spot' ? { targetCm } : mode === 'contour' ? { contourCm: targetCm }
      : mode === 'water' ? { waterCm: targetCm } : { mode: 'set', targetCm });
  },
};
