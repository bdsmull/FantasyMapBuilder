/**
 * Zustand store — the single source of truth for the editor state.
 *
 * Map data: full TMJ JSON in memory.  Edits update it locally.
 * Save = POST to /api/maps/{name}.
 *
 * Undo/redo: patch-based.
 *   - Tile changes: array of TileChange records.
 *   - Object changes: add/remove records.
 * Each complete tool stroke or single action is one undo step.
 */

import { create } from 'zustand';
import type { TmjMap, TmjLayer, TmjTileLayer, TmjObjectLayer, TmjObject } from '../types/tmj';
import { isTileLayer, isObjectLayer } from '../types/tmj';
import { saveMap as apiSaveMap, applyTilesetRefs, putHeights, deleteHeights } from '../api/client';
import type { HeightPatch, CellRect } from '../utils/heightGrid';
import { HEIGHTS_PROPERTY, createPatch, heightsPropertyValue, unionRect } from '../utils/heightGrid';
import type { HeightBrush } from '../utils/heightBrush';
import { DEFAULT_HEIGHT_BRUSH, applyDab } from '../utils/heightBrush';

/** One changed height sample, for undo/redo. */
export interface HeightChange {
  index: number;
  oldCm: number;
  newCm: number;
  oldMask: number;
  newMask: number;
}

/** How the elevation overlay is shown (editor preference, not saved with the map). */
export interface ElevationView {
  visible: boolean;
  opacity: number;
  hillshade: boolean;
}
import { MAP_SCALE_BY_ID } from '../data/mapScales';

// ---------------------------------------------------------------------------
// Undo step types
// ---------------------------------------------------------------------------

export interface TileChange {
  layerIndex: number;
  col: number;
  row: number;
  oldGid: number;
  newGid: number;
}

type UndoStep =
  | { type: 'tiles'; changes: TileChange[] }
  | { type: 'object-add'; layerIndex: number; objectId: number }
  | { type: 'object-remove'; layerIndex: number; object: TmjObject }
  | { type: 'heights'; changes: HeightChange[] };

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export type ToolName = 'paint' | 'erase' | 'fill' | 'point' | 'height';

export interface MapStore {
  // ---- Map data ----
  mapData: TmjMap | null;
  mapName: string;
  /** World set the open map belongs to (its file lives in that world set's folder). */
  mapWorldSet: string;
  isDirty: boolean;

  // ---- Editor state ----
  activeLayerIndex: number;
  activeGid: number;
  selectedTool: ToolName;
  zoom: number;
  pan: { x: number; y: number };
  showGrid: boolean;

  // ---- Undo/redo ----
  past: UndoStep[];
  future: UndoStep[];
  /** Tile changes accumulating during the current drag stroke. */
  pendingTiles: TileChange[];

  // ---- Elevation ----
  /** The open map's height patch, or null if it has no elevation (or it hasn't loaded yet). */
  heights: HeightPatch | null;
  /** Heights were added, changed or removed since the last save. */
  heightsDirty: boolean;
  elevationView: ElevationView;
  heightBrush: HeightBrush;
  /** Bumped whenever height samples change (painting edits the patch in place). */
  heightsRev: number;
  /** Original values of samples changed by the current stroke, by sample index. */
  pendingHeights: Map<number, { cm: number; mask: number }>;

  // ---- Map lifecycle actions ----
  loadMap: (data: TmjMap, name: string, worldSet: string) => void;
  closeMap: () => void;
  saveMapToServer: () => Promise<void>;

  // ---- Elevation actions ----
  /** Install a height patch loaded from the server (not a change). */
  setHeights: (patch: HeightPatch | null) => void;
  /** Give the map elevation, every sample at `cm`. Saved with the map. */
  addElevation: (cm: number) => void;
  /** Remove the map's elevation. Saved with the map. */
  removeElevation: () => void;
  setElevationView: (changes: Partial<ElevationView>) => void;
  setHeightBrush: (changes: Partial<HeightBrush>) => void;
  /** Apply one brush dab at a map-pixel position (part of the current stroke). */
  applyHeightDab: (x: number, y: number) => void;
  /** End the current stroke: one undo step, and a full overlay refresh. */
  commitHeightStroke: () => void;

  // ---- Editor state actions ----
  setActiveLayer: (index: number) => void;
  setActiveGid: (gid: number) => void;
  setTool: (tool: ToolName) => void;
  setZoom: (zoom: number) => void;
  setPan: (pan: { x: number; y: number }) => void;
  setShowGrid: (show: boolean) => void;
  /** Set the map's scale preset and unit override (undefined = inherit from the world set). */
  setMapScale: (scaleId: string, units?: 'metric' | 'imperial') => void;
  setLayerVisible: (layerIndex: number, visible: boolean) => void;

  // ---- Tile editing ----
  /** Apply a single tile change during a drag stroke (no undo step yet). */
  applyTile: (layerIndex: number, col: number, row: number, newGid: number) => void;
  /** Commit the pending tile batch as one undo step (called on pointer-up). */
  commitPendingTiles: () => void;
  /** Apply a flood-fill result as one atomic undo step (single data copy). */
  applyFill: (layerIndex: number, cells: [number, number][], newGid: number) => void;

  // ---- Object editing ----
  addObject: (layerIndex: number, obj: TmjObject) => void;
  removeObject: (layerIndex: number, objectId: number) => void;

  // ---- Undo/redo ----
  undo: () => void;
  redo: () => void;

  // ---- Tileset management ----
  addTileset: (tileset: TmjMap['tilesets'][0]) => void;
  removeTileset: (firstgid: number) => void;
}

// ---------------------------------------------------------------------------
// Helpers for immutable layer updates
// ---------------------------------------------------------------------------

function updateTileLayer(
  layers: TmjLayer[],
  layerIndex: number,
  fn: (data: number[], layer: TmjTileLayer) => number[],
): TmjLayer[] {
  return layers.map((l, i) => {
    if (i !== layerIndex || !isTileLayer(l)) return l;
    return { ...l, data: fn([...l.data], l) };
  });
}

function updateObjectLayer(
  layers: TmjLayer[],
  layerIndex: number,
  fn: (objects: TmjObject[], layer: TmjObjectLayer) => TmjObject[],
): TmjLayer[] {
  return layers.map((l, i) => {
    if (i !== layerIndex || !isObjectLayer(l)) return l;
    return { ...l, objects: fn([...l.objects], l) };
  });
}

/** Height undo steps refer to sample indices of one patch: drop them when it's replaced. */
function _withoutHeightSteps(state: { past: UndoStep[]; future: UndoStep[] }) {
  return {
    past: state.past.filter((s) => s.type !== 'heights'),
    future: state.future.filter((s) => s.type !== 'heights'),
    pendingHeights: new Map<number, { cm: number; mask: number }>(),
  };
}

/** Write a height step's old or new values back into the patch (in place). */
function _applyHeightChanges(patch: HeightPatch | null, changes: HeightChange[], which: 'old' | 'new'): void {
  if (!patch) return;
  let rect: CellRect | null = null;
  for (const c of changes) {
    patch.cm[c.index] = which === 'old' ? c.oldCm : c.newCm;
    patch.mask[c.index] = which === 'old' ? c.oldMask : c.newMask;
    const col = c.index % patch.cols, row = Math.floor(c.index / patch.cols);
    rect = unionRect(rect, { c0: col, r0: row, c1: col, r1: row });
  }
  patch.dirtyRect = unionRect(patch.dirtyRect, rect);
  patch.rangeCheck = true;
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useMapStore = create<MapStore>((set, get) => ({
  mapData: null,
  mapName: '',
  mapWorldSet: '',
  isDirty: false,
  activeLayerIndex: 0,
  activeGid: 1,
  selectedTool: 'paint',
  zoom: 1,
  pan: { x: 0, y: 0 },
  showGrid: true,
  past: [],
  future: [],
  pendingTiles: [],
  heights: null,
  heightsDirty: false,
  elevationView: { visible: true, opacity: 0.6, hillshade: true },
  heightBrush: DEFAULT_HEIGHT_BRUSH,
  heightsRev: 0,
  pendingHeights: new Map(),

  // ---- Map lifecycle ----

  loadMap: (data, name, worldSet) => {
    set({
      mapData: data,
      mapName: name,
      mapWorldSet: worldSet,
      isDirty: false,
      activeLayerIndex: 0,
      activeGid: 1,
      zoom: 1,
      pan: { x: 0, y: 0 },
      past: [],
      future: [],
      pendingTiles: [],
      heights: null, // loaded separately (see useHeightsLoader)
      heightsDirty: false,
      pendingHeights: new Map(),
    });
  },

  closeMap: () => {
    set({
      mapData: null,
      mapName: '',
      mapWorldSet: '',
      isDirty: false,
      past: [],
      future: [],
      pendingTiles: [],
      heights: null,
      heightsDirty: false,
    });
  },

  saveMapToServer: async () => {
    const { mapData, mapName, mapWorldSet, heights, heightsDirty } = get();
    if (!mapData || !mapName || !mapWorldSet) throw new Error('No map loaded');
    if (heightsDirty) {
      // Heights first: the map's "heights" property must not point at a missing file
      if (heights) await putHeights(mapWorldSet, mapName, heights);
      else await deleteHeights(mapWorldSet, mapName);
    }
    const refs = await apiSaveMap(mapWorldSet, mapName, mapData);
    // Record where each tileset was stored. Edits made while saving are kept:
    // only source/name of tilesets in the current map data are updated.
    set((state) => ({
      isDirty: false,
      heightsDirty: state.heights === heights ? false : state.heightsDirty,
      mapData: state.mapData ? applyTilesetRefs(state.mapData, refs) : state.mapData,
    }));
  },

  // ---- Elevation ----

  setHeights: (patch) => set((state) => ({
    heights: patch,
    heightsDirty: false,
    heightsRev: state.heightsRev + 1,
    ..._withoutHeightSteps(state),
  })),

  addElevation: (cm) => {
    const { mapData, mapName } = get();
    if (!mapData || !mapName) return;
    const others = (mapData.properties ?? []).filter((p) => p.name !== HEIGHTS_PROPERTY);
    set((state) => ({
      heights: createPatch(mapData, cm),
      heightsDirty: true,
      isDirty: true,
      heightsRev: state.heightsRev + 1,
      ..._withoutHeightSteps(state),
      mapData: {
        ...mapData,
        properties: [...others, { name: HEIGHTS_PROPERTY, type: 'file', value: heightsPropertyValue(mapName) }],
      },
      elevationView: { ...state.elevationView, visible: true },
    }));
  },

  removeElevation: () => {
    const { mapData } = get();
    if (!mapData) return;
    const others = (mapData.properties ?? []).filter((p) => p.name !== HEIGHTS_PROPERTY);
    const { properties: _props, ...rest } = mapData;
    set((state) => ({
      heights: null,
      heightsDirty: true,
      isDirty: true,
      heightsRev: state.heightsRev + 1,
      ..._withoutHeightSteps(state),
      mapData: others.length > 0 ? { ...rest, properties: others } : rest,
    }));
  },

  setElevationView: (changes) => set((state) => ({ elevationView: { ...state.elevationView, ...changes } })),

  setHeightBrush: (changes) => set((state) => ({ heightBrush: { ...state.heightBrush, ...changes } })),

  applyHeightDab: (x, y) => {
    const { mapData, heights, heightBrush, pendingHeights } = get();
    if (!mapData || !heights) return;
    const rect = applyDab(mapData, heights, x, y, heightBrush, (index) => {
      if (!pendingHeights.has(index)) pendingHeights.set(index, { cm: heights.cm[index], mask: heights.mask[index] });
    });
    if (!rect) return;
    heights.dirtyRect = unionRect(heights.dirtyRect, rect);
    set((state) => ({ heightsRev: state.heightsRev + 1, heightsDirty: true, isDirty: true }));
  },

  commitHeightStroke: () => {
    const { heights, pendingHeights, past } = get();
    if (!heights || pendingHeights.size === 0) return;
    const changes: HeightChange[] = [];
    for (const [index, old] of pendingHeights) {
      const newCm = heights.cm[index], newMask = heights.mask[index];
      if (newCm !== old.cm || newMask !== old.mask) {
        changes.push({ index, oldCm: old.cm, newCm, oldMask: old.mask, newMask });
      }
    }
    heights.rangeCheck = true; // colors are scaled to the height range, which may have moved
    set((state) => ({
      pendingHeights: new Map(),
      heightsRev: state.heightsRev + 1,
      ...(changes.length > 0 ? { past: [...past, { type: 'heights' as const, changes }], future: [] } : {}),
    }));
  },

  // ---- Editor state ----

  setActiveLayer: (index) => set({ activeLayerIndex: index }),
  setActiveGid: (gid) => set({ activeGid: gid }),
  setTool: (tool) => set({ selectedTool: tool }),
  setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(16, zoom)) }),
  setPan: (pan) => set({ pan }),
  setShowGrid: (show) => set({ showGrid: show }),

  setMapScale: (scaleId, units) => {
    const { mapData } = get();
    if (!mapData) return;
    if (!MAP_SCALE_BY_ID[scaleId]) return;
    // Preset maps derive their size from scale + units, so drop any custom metersPerUnit.
    // units === undefined means "inherit from the world set".
    const { metersPerUnit: _mpu, units: _units, ...rest } = mapData;
    set({
      mapData: { ...rest, scale: scaleId, ...(units ? { units } : {}) },
      isDirty: true,
    });
  },

  setLayerVisible: (layerIndex, visible) => {
    const { mapData } = get();
    if (!mapData) return;
    const newLayers = mapData.layers.map((l, i) =>
      i === layerIndex ? { ...l, visible } : l,
    );
    set({ mapData: { ...mapData, layers: newLayers }, isDirty: true });
  },

  // ---- Tile editing ----

  applyTile: (layerIndex, col, row, newGid) => {
    const { mapData, pendingTiles } = get();
    if (!mapData) return;
    const layer = mapData.layers[layerIndex];
    if (!layer || !isTileLayer(layer)) return;
    const idx = row * layer.width + col;
    if (idx < 0 || idx >= layer.data.length) return;
    const oldGid = layer.data[idx];
    if (oldGid === newGid) return; // nothing to do

    // Check if we already recorded this cell in the pending batch
    const alreadyPending = pendingTiles.some(
      (c) => c.layerIndex === layerIndex && c.col === col && c.row === row,
    );

    const newLayers = updateTileLayer(mapData.layers, layerIndex, (data) => {
      data[idx] = newGid;
      return data;
    });

    set({
      mapData: { ...mapData, layers: newLayers },
      isDirty: true,
      pendingTiles: alreadyPending
        ? pendingTiles
        : [...pendingTiles, { layerIndex, col, row, oldGid, newGid }],
    });
  },

  commitPendingTiles: () => {
    const { pendingTiles, past } = get();
    if (pendingTiles.length === 0) return;
    set({
      past: [...past, { type: 'tiles', changes: pendingTiles }],
      future: [],
      pendingTiles: [],
    });
  },

  applyFill: (layerIndex, cells, newGid) => {
    const { mapData, past } = get();
    if (!mapData) return;
    const layer = mapData.layers[layerIndex];
    if (!layer || !isTileLayer(layer)) return;

    // One data copy for the entire fill
    const data = [...layer.data];
    const changes: TileChange[] = [];
    for (const [col, row] of cells) {
      const idx = row * layer.width + col;
      const oldGid = data[idx];
      if (oldGid === newGid) continue;
      changes.push({ layerIndex, col, row, oldGid, newGid });
      data[idx] = newGid;
    }
    if (changes.length === 0) return;

    const newLayers = mapData.layers.map((l, i) =>
      i === layerIndex && isTileLayer(l) ? { ...l, data } : l,
    );
    set({
      mapData: { ...mapData, layers: newLayers },
      isDirty: true,
      past: [...past, { type: 'tiles', changes }],
      future: [],
    });
  },

  // ---- Object editing ----

  addObject: (layerIndex, obj) => {
    const { mapData, past } = get();
    if (!mapData) return;
    const newLayers = updateObjectLayer(mapData.layers, layerIndex, (objects) => [
      ...objects,
      obj,
    ]);
    set({
      mapData: { ...mapData, layers: newLayers },
      isDirty: true,
      past: [...past, { type: 'object-add', layerIndex, objectId: obj.id }],
      future: [],
    });
  },

  removeObject: (layerIndex, objectId) => {
    const { mapData, past } = get();
    if (!mapData) return;
    const layer = mapData.layers[layerIndex];
    if (!layer || !isObjectLayer(layer)) return;
    const obj = layer.objects.find((o) => o.id === objectId);
    if (!obj) return;
    const newLayers = updateObjectLayer(mapData.layers, layerIndex, (objects) =>
      objects.filter((o) => o.id !== objectId),
    );
    set({
      mapData: { ...mapData, layers: newLayers },
      isDirty: true,
      past: [...past, { type: 'object-remove', layerIndex, object: obj }],
      future: [],
    });
  },

  // ---- Undo/redo ----

  undo: () => {
    const { mapData, past, future } = get();
    if (!mapData || past.length === 0) return;
    const step = past[past.length - 1];
    const newPast = past.slice(0, -1);
    let newLayers = mapData.layers;

    if (step.type === 'tiles') {
      // Revert each tile change in reverse order
      for (const c of [...step.changes].reverse()) {
        newLayers = updateTileLayer(newLayers, c.layerIndex, (data, layer) => {
          data[c.row * layer.width + c.col] = c.oldGid;
          return data;
        });
      }
    } else if (step.type === 'object-add') {
      newLayers = updateObjectLayer(newLayers, step.layerIndex, (objects) =>
        objects.filter((o) => o.id !== step.objectId),
      );
    } else if (step.type === 'object-remove') {
      newLayers = updateObjectLayer(newLayers, step.layerIndex, (objects) => [
        ...objects,
        step.object,
      ]);
    } else if (step.type === 'heights') {
      _applyHeightChanges(get().heights, step.changes, 'old');
    }

    set((state) => ({
      mapData: { ...mapData, layers: newLayers },
      isDirty: true,
      past: newPast,
      future: [...future, step],
      ...(step.type === 'heights' ? { heightsDirty: true, heightsRev: state.heightsRev + 1 } : {}),
    }));
  },

  redo: () => {
    const { mapData, past, future } = get();
    if (!mapData || future.length === 0) return;
    const step = future[future.length - 1];
    const newFuture = future.slice(0, -1);
    let newLayers = mapData.layers;

    if (step.type === 'tiles') {
      for (const c of step.changes) {
        newLayers = updateTileLayer(newLayers, c.layerIndex, (data, layer) => {
          data[c.row * layer.width + c.col] = c.newGid;
          return data;
        });
      }
    } else if (step.type === 'object-add') {
      // We can't fully redo object-add without storing the object — skip for now
    } else if (step.type === 'object-remove') {
      newLayers = updateObjectLayer(newLayers, step.layerIndex, (objects) =>
        objects.filter((o) => o.id !== step.object.id),
      );
    } else if (step.type === 'heights') {
      _applyHeightChanges(get().heights, step.changes, 'new');
    }

    set((state) => ({
      mapData: { ...mapData, layers: newLayers },
      isDirty: true,
      past: [...past, step],
      future: newFuture,
      ...(step.type === 'heights' ? { heightsDirty: true, heightsRev: state.heightsRev + 1 } : {}),
    }));
  },

  // ---- Tileset management ----

  addTileset: (tileset) => {
    const { mapData } = get();
    if (!mapData) return;
    set({
      mapData: { ...mapData, tilesets: [...mapData.tilesets, tileset] },
      isDirty: true,
    });
  },

  removeTileset: (firstgid) => {
    const { mapData } = get();
    if (!mapData) return;
    const newTilesets = mapData.tilesets.filter((ts) => ts.firstgid !== firstgid);
    // Recompute firstgid offsets
    let nextGid = 1;
    for (const ts of newTilesets) {
      ts.firstgid = nextGid;
      nextGid += ts.tilecount;
    }
    set({
      mapData: { ...mapData, tilesets: newTilesets },
      isDirty: true,
    });
  },
}));
