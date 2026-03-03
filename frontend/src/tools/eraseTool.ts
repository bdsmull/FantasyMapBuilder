/**
 * EraseTool — sets tiles to GID 0 (empty) while dragging.
 * The entire drag stroke is one undo step (committed on release).
 */

import type { Tool } from './baseTool';
import { isTileLayer } from '../types/tmj';

let lastCell: { col: number; row: number } | null = null;

export const eraseTool: Tool = {
  name: 'erase',
  cursor: 'cell',

  onPress(col, row, store) {
    const { mapData, activeLayerIndex } = store;
    if (!mapData) return;
    const layer = mapData.layers[activeLayerIndex];
    if (!layer || !isTileLayer(layer)) return;
    if (col < 0 || row < 0 || col >= layer.width || row >= layer.height) return;
    store.applyTile(activeLayerIndex, col, row, 0);
    lastCell = { col, row };
  },

  onDrag(col, row, store) {
    const { mapData, activeLayerIndex } = store;
    if (!mapData) return;
    const layer = mapData.layers[activeLayerIndex];
    if (!layer || !isTileLayer(layer)) return;
    if (col < 0 || row < 0 || col >= layer.width || row >= layer.height) return;
    if (lastCell && lastCell.col === col && lastCell.row === row) return;
    store.applyTile(activeLayerIndex, col, row, 0);
    lastCell = { col, row };
  },

  onRelease(store) {
    store.commitPendingTiles();
    lastCell = null;
  },
};
