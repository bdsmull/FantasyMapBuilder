/**
 * Tool strategy interface — mirrors map_editor/tools/base_tool.py.
 */

import type { MapStore } from '../store/mapStore';

/** Pointer position in map pixels (object coordinate space). */
export interface MapPoint {
  x: number;
  y: number;
}

/** Modifier keys held at a press. */
export interface PressModifiers {
  shift: boolean;
}

export interface Tool {
  readonly name: string;
  /** CSS cursor value for this tool. */
  readonly cursor: string;
  /** `pos` is the exact pointer position, for tools that work below cell precision. */
  onPress(col: number, row: number, store: MapStore, pos?: MapPoint, mods?: PressModifiers): void;
  onDrag(col: number, row: number, store: MapStore, pos?: MapPoint): void;
  /**
   * Whether a press at `pos` would take hold of something there (a point, a line, a handle).
   * On a wrapped map a press is tried on the turns either side, too: what's by one edge, or
   * reaches past it, can be picked up where it shows by the other. A drag then carries on
   * from that turn, so positions may lie past the map's edges.
   */
  picks?(store: MapStore, pos: MapPoint): boolean;
  onRelease(store: MapStore): void;
  /** The gesture was abandoned (e.g. a second finger started a pinch). Defaults to onRelease. */
  onCancel?(store: MapStore): void;
  /**
   * Called for right-click / two-finger tap (optional). Returning true starts a drag:
   * onDrag and onRelease follow, as for a left press.
   */
  onRightPress?(col: number, row: number, store: MapStore, pos?: MapPoint): boolean | void;
}
