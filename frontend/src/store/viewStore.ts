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
  /** Object ID of the spot height being edited in the Height tool's Spot mode. */
  selectedSpotId: number | null;
  setSelectedSpotId: (id: number | null) => void;
  /** Line tool: the selected line and point (index), the line being drawn, and the class for new lines. */
  selectedLineId: number | null;
  selectedPoint: number | null;
  selectLine: (id: number | null, point?: number | null) => void;
  draftLine: MapPoint[] | null;
  setDraftLine: (points: MapPoint[] | null) => void;
  /** While a point is dragged: the line's points as they'd be, before the change is committed. */
  dragPoints: MapPoint[] | null;
  setDragPoints: (points: MapPoint[] | null) => void;
  newLineClass: string;
  setNewLineClass: (id: string) => void;
  /** The road and river classes dialog is open. */
  lineClassesOpen: boolean;
  setLineClassesOpen: (open: boolean) => void;
}

export const useViewStore = create<ViewStore>((set) => ({
  showPalette: _storedPalette(),
  setShowPalette: (show) => {
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(_PALETTE_KEY, String(show)); } catch { /* not stored */ }
    set({ showPalette: show });
  },
  inspected: null,
  setInspected: (pos) => set({ inspected: pos }),
  selectedSpotId: null,
  setSelectedSpotId: (id) => set({ selectedSpotId: id }),
  selectedLineId: null,
  selectedPoint: null,
  selectLine: (id, point = null) => set({ selectedLineId: id, selectedPoint: id === null ? null : point }),
  draftLine: null,
  setDraftLine: (points) => set({ draftLine: points }),
  dragPoints: null,
  setDragPoints: (points) => set({ dragPoints: points }),
  newLineClass: 'minor-road',
  setNewLineClass: (id) => set({ newLineClass: id }),
  lineClassesOpen: false,
  setLineClassesOpen: (open) => set({ lineClassesOpen: open }),
}));
