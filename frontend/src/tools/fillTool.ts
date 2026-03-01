/**
 * FillTool — BFS flood fill on press.
 * Port of TileLayer.flood_fill() from map_editor/models/layer.py.
 * Single click = one undo step.
 */

import type { Tool } from './baseTool';
import type { MapStore } from '../store/mapStore';
import { isTileLayer } from '../types/tmj';

export const fillTool: Tool = {
  name: 'fill',
  cursor: 'copy',

  onPress(col, row, store) {
    const { mapData, activeLayerIndex, activeGid } = store;
    if (!mapData) return;
    const layer = mapData.layers[activeLayerIndex];
    if (!layer || !isTileLayer(layer)) return;
    if (col < 0 || row < 0 || col >= layer.width || row >= layer.height) return;

    const targetGid = layer.data[row * layer.width + col];
    if (targetGid === activeGid) return; // already the desired tile

    const changed = bfsFloodFill(layer.data, layer.width, layer.height, col, row, targetGid, activeGid);
    if (changed.length === 0) return;

    store.applyFill(activeLayerIndex, changed, activeGid);
  },

  onDrag() { /* intentional no-op */ },
  onRelease() { /* intentional no-op */ },
};

/**
 * BFS flood-fill implementation.
 * Returns list of [col, row] pairs that were changed.
 */
export function bfsFloodFill(
  data: number[],
  width: number,
  height: number,
  startCol: number,
  startRow: number,
  targetGid: number,
  fillGid: number,
): [number, number][] {
  if (targetGid === fillGid) return [];

  const changed: [number, number][] = [];
  const visited = new Uint8Array(width * height);
  // Flat interleaved [col, row, col, row, ...] with a head pointer — O(1) dequeue
  const queue: number[] = [startCol, startRow];
  let head = 0;
  visited[startRow * width + startCol] = 1;

  while (head < queue.length) {
    const c = queue[head++];
    const r = queue[head++];
    if (data[r * width + c] !== targetGid) continue;
    changed.push([c, r]);

    for (const [nc, nr] of [[c - 1, r], [c + 1, r], [c, r - 1], [c, r + 1]] as [number, number][]) {
      if (nc < 0 || nr < 0 || nc >= width || nr >= height) continue;
      const ni = nr * width + nc;
      if (visited[ni]) continue;
      visited[ni] = 1;
      if (data[ni] === targetGid) { queue.push(nc, nr); }
    }
  }
  return changed;
}
