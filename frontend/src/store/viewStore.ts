/**
 * Editor view settings that aren't part of the map: whether the tile palette is
 * shown, and the point the Inspect tool last picked.
 */

import { create } from 'zustand';
import type { MapPoint } from '../tools/baseTool';

const _PALETTE_KEY = 'showTilePalette';

function _storedPalette(): boolean {
  try {
    return typeof localStorage === 'undefined' || localStorage.getItem(_PALETTE_KEY) !== 'false';
  } catch {
    return true;
  }
}

export interface ViewStore {
  /** Tile palette visible (remembered in this browser). */
  showPalette: boolean;
  setShowPalette: (show: boolean) => void;
  /** Map-pixel point shown in the inspector, or null when it's closed. */
  inspected: MapPoint | null;
  setInspected: (pos: MapPoint | null) => void;
}

export const useViewStore = create<ViewStore>((set) => ({
  showPalette: _storedPalette(),
  setShowPalette: (show) => {
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(_PALETTE_KEY, String(show)); } catch { /* not stored */ }
    set({ showPalette: show });
  },
  inspected: null,
  setInspected: (pos) => set({ inspected: pos }),
}));
