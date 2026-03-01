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
import { saveMap as apiSaveMap } from '../api/client';

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
  | { type: 'object-remove'; layerIndex: number; object: TmjObject };

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export type ToolName = 'paint' | 'erase' | 'fill' | 'point';

export interface MapStore {
  // ---- Map data ----
  mapData: TmjMap | null;
  mapName: string;
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

  // ---- Map lifecycle actions ----
  loadMap: (data: TmjMap, name: string) => void;
  closeMap: () => void;
  saveMapToServer: () => Promise<void>;

  // ---- Editor state actions ----
  setActiveLayer: (index: number) => void;
  setActiveGid: (gid: number) => void;
  setTool: (tool: ToolName) => void;
  setZoom: (zoom: number) => void;
  setPan: (pan: { x: number; y: number }) => void;
  setShowGrid: (show: boolean) => void;
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

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useMapStore = create<MapStore>((set, get) => ({
  mapData: null,
  mapName: '',
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

  // ---- Map lifecycle ----

  loadMap: (data, name) => {
    set({
      mapData: data,
      mapName: name,
      isDirty: false,
      activeLayerIndex: 0,
      activeGid: 1,
      zoom: 1,
      pan: { x: 0, y: 0 },
      past: [],
      future: [],
      pendingTiles: [],
    });
  },

  closeMap: () => {
    set({
      mapData: null,
      mapName: '',
      isDirty: false,
      past: [],
      future: [],
      pendingTiles: [],
    });
  },

  saveMapToServer: async () => {
    const { mapData, mapName } = get();
    if (!mapData || !mapName) throw new Error('No map loaded');
    await apiSaveMap(mapName, mapData);
    set({ isDirty: false });
  },

  // ---- Editor state ----

  setActiveLayer: (index) => set({ activeLayerIndex: index }),
  setActiveGid: (gid) => set({ activeGid: gid }),
  setTool: (tool) => set({ selectedTool: tool }),
  setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(16, zoom)) }),
  setPan: (pan) => set({ pan }),
  setShowGrid: (show) => set({ showGrid: show }),

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
    }

    set({
      mapData: { ...mapData, layers: newLayers },
      isDirty: true,
      past: newPast,
      future: [...future, step],
    });
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
    }

    set({
      mapData: { ...mapData, layers: newLayers },
      isDirty: true,
      past: [...past, step],
      future: newFuture,
    });
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
