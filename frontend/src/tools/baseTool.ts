/**
 * Tool strategy interface — mirrors map_editor/tools/base_tool.py.
 */

import type { MapStore } from '../store/mapStore';

export interface Tool {
  readonly name: string;
  /** CSS cursor value for this tool. */
  readonly cursor: string;
  onPress(col: number, row: number, store: MapStore): void;
  onDrag(col: number, row: number, store: MapStore): void;
  onRelease(store: MapStore): void;
  /** Called for right-click / two-finger tap (optional). */
  onRightPress?(col: number, row: number, store: MapStore): void;
}
