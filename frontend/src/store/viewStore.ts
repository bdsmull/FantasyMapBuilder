/**
 * Editor view settings that aren't part of the map: whether the tool panel is shown,
 * the tools' modes, selections, and the point the Inspect tool last picked.
 */

import { create } from 'zustand';
import type { MapPoint } from '../tools/baseTool';
import type { LineKind } from '../data/lineClasses';

/** What the Terrain tool does with a press: paint the selected tile, flood-fill, or erase. */
export type TerrainMode = 'paint' | 'fill' | 'erase';
/** What the Water tool works on: lakes and the sea, or drawn rivers. */
export type WaterToolMode = 'lakes' | 'rivers';

const _PALETTE_KEY = 'showTilePalette';

const _LINES_KEY = 'showRoadsRivers';

/** A remembered on/off setting (on unless stored as off). */
function _stored(key: string): boolean {
  try {
    return typeof localStorage === 'undefined' || localStorage.getItem(key) !== 'false';
  } catch {
    return true;
  }
}

function _storedPalette(): boolean {
  return _stored(_PALETTE_KEY);
}

export interface ViewStore {
  /** The tool panel (right) visible (remembered in this browser). */
  showPalette: boolean;
  setShowPalette: (show: boolean) => void;
  terrainMode: TerrainMode;
  setTerrainMode: (mode: TerrainMode) => void;
  waterMode: WaterToolMode;
  setWaterMode: (mode: WaterToolMode) => void;
  /** Map-pixel point shown in the inspector, or null when it's closed. */
  inspected: MapPoint | null;
  setInspected: (pos: MapPoint | null) => void;
  /** Object ID of the water body being edited in the Water tool's Lakes mode. */
  selectedWaterId: number | null;
  setSelectedWaterId: (id: number | null) => void;
  /** Water tool, Rivers mode, "Convert to River": the next click on a Flow stream makes it a drawn river. */
  convertingStream: boolean;
  setConvertingStream: (on: boolean) => void;
  /** What the last Convert to River click did (shown in the Water panel), '' for nothing. */
  streamNote: string;
  setStreamNote: (note: string) => void;
  /** Object ID of the spot height being edited in the Height tool's Spot mode. */
  selectedSpotId: number | null;
  setSelectedSpotId: (id: number | null) => void;
  /** Object ID of the point selected with the Points tool. */
  selectedObjectId: number | null;
  setSelectedObjectId: (id: number | null) => void;
  /**
   * Height tool, Contour mode: the selected contour (its point is `selectedPoint`). The
   * contour being drawn and a point being dragged use `draftLine` and `dragPoints`.
   */
  selectedContourId: number | null;
  selectContour: (id: number | null, point?: number | null) => void;
  /** Line drawing (Roads, Water → Rivers): the selected line and point (index), the line being drawn, and the class for new lines. */
  selectedLineId: number | null;
  selectedPoint: number | null;
  selectLine: (id: number | null, point?: number | null) => void;
  draftLine: MapPoint[] | null;
  setDraftLine: (points: MapPoint[] | null) => void;
  /** While a point is dragged: the line's points as they'd be, before the change is committed. */
  dragPoints: MapPoint[] | null;
  setDragPoints: (points: MapPoint[] | null) => void;
  /** The class for new lines, per kind: roads (Roads tool) and waterways (Water tool). */
  newLineClass: Record<LineKind, string>;
  setNewLineClass: (kind: LineKind, id: string) => void;
  /** A ghost line (from another map) selected while drawing lines: "<map>#<id>". */
  selectedGhost: string | null;
  setSelectedGhost: (key: string | null) => void;
  /**
   * The "Roads & rivers" toggle: show this map's lines (those on shown layers) and those
   * of its ancestor and descendant maps. Remembered in this browser.
   */
  showLines: boolean;
  setShowLines: (show: boolean) => void;
  /** A map to open, asked for by a panel (the canvas handles unsaved changes first). */
  openMapRequest: string | null;
  requestOpenMap: (name: string | null) => void;
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
  terrainMode: 'paint',
  setTerrainMode: (mode) => set({ terrainMode: mode }),
  waterMode: 'lakes',
  setWaterMode: (mode) => set({ waterMode: mode }),
  inspected: null,
  setInspected: (pos) => set({ inspected: pos }),
  selectedWaterId: null,
  setSelectedWaterId: (id) => set({ selectedWaterId: id }),
  convertingStream: false,
  setConvertingStream: (on) => set({ convertingStream: on }),
  streamNote: '',
  setStreamNote: (note) => set({ streamNote: note }),
  selectedSpotId: null,
  setSelectedSpotId: (id) => set({ selectedSpotId: id }),
  selectedObjectId: null,
  setSelectedObjectId: (id) => set({ selectedObjectId: id }),
  selectedContourId: null,
  selectContour: (id, point = null) => set({ selectedContourId: id, selectedPoint: id === null ? null : point }),
  selectedLineId: null,
  selectedPoint: null,
  selectLine: (id, point = null) => set({ selectedLineId: id, selectedPoint: id === null ? null : point }),
  draftLine: null,
  setDraftLine: (points) => set({ draftLine: points }),
  dragPoints: null,
  setDragPoints: (points) => set({ dragPoints: points }),
  newLineClass: { road: 'minor-road', water: 'river' },
  setNewLineClass: (kind, id) => set((s) => ({ newLineClass: { ...s.newLineClass, [kind]: id } })),
  selectedGhost: null,
  setSelectedGhost: (key) => set({ selectedGhost: key }),
  showLines: _stored(_LINES_KEY),
  setShowLines: (show) => {
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(_LINES_KEY, String(show)); } catch { /* not stored */ }
    set({ showLines: show });
  },
  openMapRequest: null,
  requestOpenMap: (name) => set({ openMapRequest: name }),
  lineClassesOpen: false,
  setLineClassesOpen: (open) => set({ lineClassesOpen: open }),
}));
