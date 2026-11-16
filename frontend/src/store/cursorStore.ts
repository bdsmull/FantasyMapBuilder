/**
 * Pointer position over the map, in map pixels (object coordinate space).
 *
 * Kept out of mapStore on purpose: it changes on every pointer move, and only the
 * status bar's readouts need it — components using the whole map store would
 * otherwise re-render constantly.
 */

import { create } from 'zustand';

export interface CursorStore {
  /** Map-pixel position under the pointer, or null when it's off the map canvas. */
  mapPos: { x: number; y: number } | null;
  setMapPos: (pos: { x: number; y: number } | null) => void;
}

export const useCursorStore = create<CursorStore>((set) => ({
  mapPos: null,
  setMapPos: (pos) => set({ mapPos: pos }),
}));
