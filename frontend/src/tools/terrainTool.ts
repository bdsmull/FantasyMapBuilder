/**
 * Terrain tool (#38): paint, flood-fill or erase tiles on the active tile layer, by the
 * mode chosen in its panel (Paint, Fill, Erase). Shortcuts on desktop: Shift+click fills
 * whatever the mode, and dragging with the right button erases (a right-click that
 * doesn't move opens the world set's map menu, where there is one; see MapCanvas).
 */

import type { Tool } from './baseTool';
import { paintTool } from './paintTool';
import { fillTool } from './fillTool';
import { eraseTool } from './eraseTool';
import { useViewStore } from '../store/viewStore';
import type { TerrainMode } from '../store/viewStore';

const _BY_MODE: Record<TerrainMode, Tool> = { paint: paintTool, fill: fillTool, erase: eraseTool };

/** The tool handling the current press-drag-release. */
let _active: Tool | null = null;

export const terrainTool: Tool = {
  name: 'terrain',
  cursor: 'crosshair',

  onPress(col, row, store, pos, mods) {
    _active = mods?.shift ? fillTool : _BY_MODE[useViewStore.getState().terrainMode];
    _active.onPress(col, row, store, pos);
  },

  onDrag(col, row, store, pos) {
    _active?.onDrag(col, row, store, pos);
  },

  onRelease(store) {
    _active?.onRelease(store);
    _active = null;
  },

  onCancel(store) {
    if (_active?.onCancel) _active.onCancel(store); else _active?.onRelease(store);
    _active = null;
  },

  /** Right button: erase, and keep erasing while it's dragged. */
  onRightPress(col, row, store, pos) {
    _active = eraseTool;
    eraseTool.onPress(col, row, store, pos);
    return true;
  },
};
