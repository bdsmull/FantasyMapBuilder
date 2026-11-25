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
import type { TmjMap, TmjLayer, TmjTileLayer, TmjObjectLayer, TmjObject, TmjProperty } from '../types/tmj';
import { isTileLayer, isObjectLayer } from '../types/tmj';
import { saveMap as apiSaveMap, applyTilesetRefs, putHeights, deleteHeights } from '../api/client';
import type { HeightPatch, CellRect } from '../utils/heightGrid';
import { HEIGHTS_PROPERTY, createPatch, heightsPropertyValue, unionRect } from '../utils/heightGrid';
import type { HeightBrush } from '../utils/heightBrush';
import { DEFAULT_HEIGHT_BRUSH, applyDab } from '../utils/heightBrush';
import { SPOT_LAYER, SPOT_TYPE, isSpot, spotProperties } from '../utils/spotHeights';
import { isLine, toPolyline, writeWidths } from '../utils/lines';
import { WATER_LAYER, WATER_TYPE, isWaterBody, waterProperties, withSea } from '../utils/water';
import { CONTOUR_LAYER, CONTOUR_TYPE, isContour, contourPoints, contourShape, minContourPoints } from '../utils/contours';
import type { Pt } from '../utils/lines';
import { CEILING_LAYER, CEILING_TYPE, isCeiling, ceilingProperties, ceilingShape, withLengthProperty } from '../utils/ceilings';
import { WORLD_ORIGIN_LAYER, WORLD_ORIGIN_NAME, WORLD_ORIGIN_TYPE, defaultOriginPixel, findWorldOrigin } from '../utils/worldCoords';
import { useWorldSetStore } from './worldSetStore';
import { blendSeam, joinSeam, onOwnTurn, withWrap, wrapProblem, wrapsX } from '../utils/worldWrap';

/** Object layer new lines go into when the active layer isn't an object layer. */
export const LINE_LAYER = 'Roads and rivers';

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
  /** Show child maps' heights inside their footprints (the assembled surface). */
  showChildren: boolean;
  /** Show lakes and the sea. */
  water: boolean;
  /** Show where rain would run (streams) and pool (hollows). */
  flow: boolean;
  /** A stream shows where at least this many height samples drain through (null: a default for the map size). */
  streamSamples: number | null;
  /** Shade where the headroom differs from the map's own (#45). */
  headroom: boolean;
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

/** Every height sample before and after; the hand-set marks too when they changed. */
interface WholeHeights {
  before: Int32Array;
  after: Int32Array;
  maskBefore?: Uint8Array;
  maskAfter?: Uint8Array;
}

type UndoStep =
  | { type: 'tiles'; changes: TileChange[] }
  | { type: 'object-add'; layerIndex: number; object: TmjObject }
  | { type: 'object-remove'; layerIndex: number; object: TmjObject }
  /**
   * Height edit: per-sample changes, or (re-base) every sample's height before and
   * after in `whole`, which is far smaller than one change record per sample. `wrap`:
   * the map's east-west wrap changed with it (turning it on joins the heights at the seam).
   */
  | { type: 'heights'; changes: HeightChange[]; whole?: WholeHeights; wrap?: { before: boolean; after: boolean } }
  /** Layer structure change (add, delete, rename, move): the layer list before and after. */
  | { type: 'layers'; before: LayerSnapshot; after: LayerSnapshot };

/**
 * Layer list for undo. Layers are replaced (never mutated) on edit, so keeping the
 * array is cheap. Undo is strictly last-in-first-out, so older steps that refer to
 * layer indices see the layer order they were recorded with.
 */
export interface LayerSnapshot {
  layers: TmjLayer[];
  activeLayerIndex: number;
  nextlayerid: number;
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

/**
 * The tools, by subject (#38): Inspect, Terrain (paint / fill / erase tiles), Height
 * (elevation), Water (lakes, the sea, rivers), Roads, Points.
 */
export type ToolName = 'inspect' | 'terrain' | 'height' | 'water' | 'roads' | 'point';

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
  /**
   * Replace every height sample (re-base) as one undo step. Hand-set marks are kept,
   * unless `mask` gives new ones (heightmap import overwriting hand-set heights).
   */
  replaceHeights: (cm: Int32Array, mask?: Uint8Array) => void;

  // ---- Spot heights (each change is one undo step) ----
  /** Add a spot height at map pixel (x, y) to the "Spot heights" layer (created if needed); returns its object ID. */
  addSpotHeight: (x: number, y: number, cm: number, reachCells: number) => number | null;
  updateSpotHeight: (id: number, changes: { name?: string; cm?: number; reachCells?: number }) => void;
  deleteSpotHeight: (id: number) => void;

  // ---- Water bodies (each change is one undo step) ----
  /** Add a water body (lake, sea) at map pixel (x, y) to the "Water" layer (created if needed); returns its object ID. */
  addWaterBody: (x: number, y: number, cm: number) => number | null;
  updateWaterBody: (id: number, changes: { name?: string; cm?: number; x?: number; y?: number }) => void;
  deleteWaterBody: (id: number) => void;
  /** Turn the automatic sea (ground below 0 m connected to the map's edge) on or off for this map. */
  setSea: (on: boolean) => void;

  // ---- Contour lines (each change is one undo step) ----
  /** Add a contour (map-pixel points) to the "Contours" layer (created if needed); returns its object ID. */
  addContour: (points: Pt[], closed: boolean, cm: number, reachCells: number) => number | null;
  updateContour: (id: number, changes: { name?: string; cm?: number; reachCells?: number; points?: Pt[]; closed?: boolean }) => void;
  deleteContour: (id: number) => void;

  // ---- Ceilings (#45; object changes are one undo step each) ----
  /** Add a ceiling object (a closed shape, map pixels) to the "Ceilings" layer (created if needed); returns its object ID. */
  addCeiling: (points: Pt[], headroomCm: number) => number | null;
  updateCeiling: (id: number, changes: { name?: string; headroomCm?: number; points?: Pt[] }) => void;
  deleteCeiling: (id: number) => void;
  /** Set the map's own headroom or floor thickness (cm), or remove it (null). Saved with the map. */
  setMapLength: (property: 'headroom' | 'slab', cm: number | null) => void;

  // ---- World origin (#9): a point object on a root map ----
  /** Move the world origin to (x, y) map pixels, adding it on the "World" layer if missing. One undo step. */
  setWorldOrigin: (x: number, y: number) => void;
  /** Add the world origin at the map's centre if it has none (not an undo step); true if added. */
  ensureWorldOrigin: () => boolean;

  // ---- East-west wrap (#36) ----
  /**
   * Make the map wrap east-west or not. Turning it on eases the heights near the seam to
   * meet. One undo step, both together. False if the map can't wrap.
   */
  setWrapX: (on: boolean) => boolean;

  // ---- Lines: roads and rivers (each change is one undo step) ----
  /**
   * Add a line (map-pixel points) of a class. It goes into the active layer if that is
   * an object layer, else into "Roads and rivers" (created if needed). Returns its ID.
   */
  addLine: (points: Pt[], classId: string, extra?: { name?: string; widths?: (number | null)[]; properties?: TmjProperty[] }) => number | null;
  updateLine: (id: number, changes: { name?: string; classId?: string; points?: Pt[]; widths?: (number | null)[] }) => void;
  deleteLine: (id: number) => void;

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
  /** Layer opacity 0..1 (a display setting, like visibility: not an undo step). */
  setLayerOpacity: (layerIndex: number, opacity: number) => void;

  // ---- Layer structure (each is one undo step) ----
  /** Add a tile or object layer just above the active layer, and make it active. */
  addLayer: (kind: 'tile' | 'object') => void;
  renameLayer: (layerIndex: number, name: string) => void;
  /** Delete a layer (the last remaining layer can't be deleted). */
  deleteLayer: (layerIndex: number) => void;
  /** Move a layer up (+1, drawn later / on top) or down (-1). */
  moveLayer: (layerIndex: number, direction: 1 | -1) => void;

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
  /**
   * Replace tiles' custom properties (by local tile ID) in one tileset. Tilesets are
   * shared by the world set: the change is written to the .tsj when the map is saved.
   */
  setTileProperties: (firstgid: number, changes: Record<number, TmjProperty[]>) => void;
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
function _applyHeightChanges(
  patch: HeightPatch | null, changes: HeightChange[], which: 'old' | 'new',
  whole?: WholeHeights,
): void {
  if (!patch) return;
  if (whole) {
    patch.cm.set(which === 'old' ? whole.before : whole.after);
    const mask = which === 'old' ? whole.maskBefore : whole.maskAfter;
    if (mask) patch.mask.set(mask);
    patch.fullRefresh = true;
    return;
  }
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

/** "Tile Layer 2" etc.: the first free numbered name. */
function _uniqueLayerName(layers: TmjLayer[], base: string): string {
  const names = new Set(layers.map((l) => l.name));
  for (let n = 1; ; n++) {
    const name = `${base} ${n}`;
    if (!names.has(name)) return name;
  }
}

type StoreSet = (partial: Partial<MapStore> | ((state: MapStore) => Partial<MapStore>)) => void;

/** Apply a layer structure change as one undo step. */
/** The map's layers with a named object layer on top (added if missing), and that layer's index. */
function _topObjectLayer(mapData: TmjMap, name: string, color: string): { layers: TmjLayer[]; index: number; nextlayerid: number } {
  const index = mapData.layers.findIndex((l) => isObjectLayer(l) && l.name === name);
  if (index >= 0) return { layers: mapData.layers, index, nextlayerid: mapData.nextlayerid };
  return {
    layers: [...mapData.layers, {
      type: 'objectgroup', id: mapData.nextlayerid, name, visible: true, opacity: 1, offsetx: 0, offsety: 0,
      color, draworder: 'topdown', objects: [],
    }],
    index: mapData.layers.length,
    nextlayerid: mapData.nextlayerid + 1,
  };
}

/** The world origin point object (#9). */
function _originObject(id: number, x: number, y: number): TmjObject {
  return { id, name: WORLD_ORIGIN_NAME, type: WORLD_ORIGIN_TYPE, x, y, width: 0, height: 0, visible: true, point: true };
}

function _commitLayers(set: StoreSet, get: () => MapStore, layers: TmjLayer[], active: number, nextlayerid: number): void {
  const { mapData, activeLayerIndex, past } = get();
  if (!mapData) return;
  const before: LayerSnapshot = { layers: mapData.layers, activeLayerIndex, nextlayerid: mapData.nextlayerid };
  const after: LayerSnapshot = { layers, activeLayerIndex: active, nextlayerid };
  set({
    mapData: { ...mapData, layers, nextlayerid },
    activeLayerIndex: active,
    isDirty: true,
    past: [...past, { type: 'layers', before, after }],
    future: [],
  });
}

/** Fields besides the layer list that a layer undo/redo restores. */
function _layerExtras(mapData: TmjMap, snap: LayerSnapshot): Partial<MapStore> {
  return { activeLayerIndex: snap.activeLayerIndex, mapData: { ...mapData, layers: snap.layers, nextlayerid: snap.nextlayerid } };
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
  selectedTool: 'terrain',
  zoom: 1,
  pan: { x: 0, y: 0 },
  showGrid: true,
  past: [],
  future: [],
  pendingTiles: [],
  heights: null,
  heightsDirty: false,
  elevationView: { visible: true, opacity: 0.6, hillshade: true, showChildren: true, water: true, flow: false, streamSamples: null, headroom: false },
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
    // A world set's root map records its world origin (#9): add it at the centre the
    // first time the root is saved, so later resizes don't move world coordinates
    const ws = useWorldSetStore.getState();
    const { mapName: openName, mapWorldSet: openSet } = get();
    if (openSet && openSet === ws.activeWorldSetName
      && ws.activeWorldSet?.nodes.some((n) => n.mapName === openName && n.parentMapName === null)) {
      get().ensureWorldOrigin();
    }
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

  replaceHeights: (cm, mask) => {
    const { mapData, heights, past } = get();
    if (!heights || cm.length !== heights.cm.length) return;
    if (mask && mask.length !== heights.mask.length) return;
    const whole: WholeHeights = { before: heights.cm.slice(), after: cm.slice() };
    const newMask = mask?.slice();
    // On a wrapped square map the last column is the first one again
    if (mapData) joinSeam(mapData, whole.after, newMask ?? null, heights.cols);
    heights.cm.set(whole.after);
    if (mask) {
      whole.maskBefore = heights.mask.slice();
      whole.maskAfter = newMask!;
      heights.mask.set(whole.maskAfter);
    }
    heights.fullRefresh = true;
    set((state) => ({
      heightsDirty: true,
      isDirty: true,
      heightsRev: state.heightsRev + 1,
      pendingHeights: new Map(),
      past: [...past, { type: 'heights' as const, changes: [], whole }],
      future: [],
    }));
  },

  addSpotHeight: (x, y, cm, reachCells) => {
    const { mapData, activeLayerIndex } = get();
    if (!mapData) return null;
    const id = mapData.nextobjectid;
    const spot: TmjObject = {
      id, name: '', type: SPOT_TYPE, x, y, width: 0, height: 0, visible: true, point: true,
      properties: spotProperties([], cm, reachCells),
    };
    // On top, so spots are drawn over everything
    const top = _topObjectLayer(mapData, SPOT_LAYER, '#ffd400');
    const { nextlayerid } = top;
    const layers = updateObjectLayer(top.layers, top.index, (objects) => [...objects, spot]);
    _commitLayers(set, get, layers, activeLayerIndex, nextlayerid);
    set((state) => ({ mapData: state.mapData && { ...state.mapData, nextobjectid: id + 1 } }));
    return id;
  },

  updateSpotHeight: (id, changes) => {
    const { mapData, activeLayerIndex } = get();
    if (!mapData) return;
    let found = false;
    const layers = mapData.layers.map((layer) => {
      if (!isObjectLayer(layer) || !layer.objects.some((o) => o.id === id && isSpot(o))) return layer;
      found = true;
      return {
        ...layer,
        objects: layer.objects.map((o) => {
          if (o.id !== id) return o;
          const height = o.properties?.find((p) => p.name === 'height')?.value;
          const reach = o.properties?.find((p) => p.name === 'reach')?.value;
          return {
            ...o,
            name: changes.name ?? o.name,
            properties: spotProperties(
              o.properties,
              changes.cm ?? Math.round(Number(height) * 100),
              changes.reachCells ?? Number(reach ?? 10),
            ),
          };
        }),
      };
    });
    if (found) _commitLayers(set, get, layers, activeLayerIndex, mapData.nextlayerid);
  },

  deleteSpotHeight: (id) => {
    const { mapData, activeLayerIndex } = get();
    if (!mapData) return;
    let found = false;
    const layers = mapData.layers.map((layer) => {
      if (!isObjectLayer(layer) || !layer.objects.some((o) => o.id === id && isSpot(o))) return layer;
      found = true;
      return { ...layer, objects: layer.objects.filter((o) => o.id !== id) };
    });
    if (found) _commitLayers(set, get, layers, activeLayerIndex, mapData.nextlayerid);
  },

  addWaterBody: (x, y, cm) => {
    const { mapData, activeLayerIndex } = get();
    if (!mapData) return null;
    const id = mapData.nextobjectid;
    const body: TmjObject = {
      id, name: '', type: WATER_TYPE, x, y, width: 0, height: 0, visible: true, point: true, properties: waterProperties([], cm),
    };
    const top = _topObjectLayer(mapData, WATER_LAYER, '#3d7fd1');
    const layers = updateObjectLayer(top.layers, top.index, (objects) => [...objects, body]);
    _commitLayers(set, get, layers, activeLayerIndex, top.nextlayerid);
    set((state) => ({ mapData: state.mapData && { ...state.mapData, nextobjectid: id + 1 } }));
    return id;
  },

  updateWaterBody: (id, changes) => {
    const { mapData, activeLayerIndex } = get();
    if (!mapData) return;
    let found = false;
    const layers = mapData.layers.map((layer) => {
      if (!isObjectLayer(layer) || !layer.objects.some((o) => o.id === id && isWaterBody(o))) return layer;
      found = true;
      return {
        ...layer,
        objects: layer.objects.map((o) => {
          if (o.id !== id) return o;
          const height = Number(o.properties?.find((p) => p.name === 'height')?.value);
          return {
            ...o, name: changes.name ?? o.name, x: changes.x ?? o.x, y: changes.y ?? o.y,
            properties: waterProperties(o.properties, changes.cm ?? Math.round(height * 100)),
          };
        }),
      };
    });
    if (found) _commitLayers(set, get, layers, activeLayerIndex, mapData.nextlayerid);
  },

  deleteWaterBody: (id) => {
    const { mapData, activeLayerIndex } = get();
    if (!mapData) return;
    let found = false;
    const layers = mapData.layers.map((layer) => {
      if (!isObjectLayer(layer) || !layer.objects.some((o) => o.id === id && isWaterBody(o))) return layer;
      found = true;
      return { ...layer, objects: layer.objects.filter((o) => o.id !== id) };
    });
    if (found) _commitLayers(set, get, layers, activeLayerIndex, mapData.nextlayerid);
  },

  setSea: (on) => {
    const { mapData } = get();
    if (!mapData) return;
    const properties = withSea(mapData.properties, on);
    set({ mapData: { ...mapData, ...(properties.length ? { properties } : { properties: undefined }) }, isDirty: true });
  },

  addContour: (points, closed, cm, reachCells) => {
    const { mapData, activeLayerIndex } = get();
    if (!mapData || points.length < minContourPoints(closed)) return null;
    const id = mapData.nextobjectid;
    const contour: TmjObject = {
      id, name: '', type: CONTOUR_TYPE, width: 0, height: 0, visible: true, ...contourShape(onOwnTurn(mapData, points), closed),
      properties: spotProperties([], cm, reachCells),
    };
    const top = _topObjectLayer(mapData, CONTOUR_LAYER, '#8a5a2b');
    const layers = updateObjectLayer(top.layers, top.index, (objects) => [...objects, contour]);
    _commitLayers(set, get, layers, activeLayerIndex, top.nextlayerid);
    set((state) => ({ mapData: state.mapData && { ...state.mapData, nextobjectid: id + 1 } }));
    return id;
  },

  updateContour: (id, changes) => {
    const { mapData, activeLayerIndex } = get();
    if (!mapData) return;
    let found = false;
    const layers = mapData.layers.map((layer) => {
      if (!isObjectLayer(layer) || !layer.objects.some((o) => o.id === id && isContour(o))) return layer;
      return {
        ...layer,
        objects: layer.objects.map((o) => {
          if (o.id !== id) return o;
          const closed = changes.closed ?? !!o.polygon;
          const points = changes.points ?? contourPoints(o);
          if (points.length < minContourPoints(closed)) return o; // too few points for that shape
          found = true;
          const height = o.properties?.find((p) => p.name === 'height')?.value;
          const reach = o.properties?.find((p) => p.name === 'reach')?.value;
          const next: TmjObject = {
            ...o,
            name: changes.name ?? o.name,
            properties: spotProperties(o.properties, changes.cm ?? Math.round(Number(height) * 100), changes.reachCells ?? Number(reach ?? 10)),
          };
          delete next.polyline;
          delete next.polygon;
          return { ...next, ...contourShape(onOwnTurn(mapData, points), closed) };
        }),
      };
    });
    if (found) _commitLayers(set, get, layers, activeLayerIndex, mapData.nextlayerid);
  },

  deleteContour: (id) => {
    const { mapData, activeLayerIndex } = get();
    if (!mapData) return;
    let found = false;
    const layers = mapData.layers.map((layer) => {
      if (!isObjectLayer(layer) || !layer.objects.some((o) => o.id === id && isContour(o))) return layer;
      found = true;
      return { ...layer, objects: layer.objects.filter((o) => o.id !== id) };
    });
    if (found) _commitLayers(set, get, layers, activeLayerIndex, mapData.nextlayerid);
  },

  addCeiling: (points, headroomCm) => {
    const { mapData, activeLayerIndex } = get();
    if (!mapData || points.length < 3 || headroomCm <= 0) return null;
    const id = mapData.nextobjectid;
    const ceiling: TmjObject = {
      id, name: '', type: CEILING_TYPE, width: 0, height: 0, visible: true, ...ceilingShape(onOwnTurn(mapData, points)),
      properties: ceilingProperties([], headroomCm),
    };
    const top = _topObjectLayer(mapData, CEILING_LAYER, '#9b6bd1');
    const layers = updateObjectLayer(top.layers, top.index, (objects) => [...objects, ceiling]);
    _commitLayers(set, get, layers, activeLayerIndex, top.nextlayerid);
    set((state) => ({ mapData: state.mapData && { ...state.mapData, nextobjectid: id + 1 } }));
    return id;
  },

  updateCeiling: (id, changes) => {
    const { mapData, activeLayerIndex } = get();
    if (!mapData) return;
    if (changes.points && changes.points.length < 3) return;
    if (changes.headroomCm !== undefined && changes.headroomCm <= 0) return;
    let found = false;
    const layers = mapData.layers.map((layer) => {
      if (!isObjectLayer(layer) || !layer.objects.some((o) => o.id === id && isCeiling(o))) return layer;
      found = true;
      return {
        ...layer,
        objects: layer.objects.map((o) => {
          if (o.id !== id) return o;
          const next: TmjObject = { ...o, name: changes.name ?? o.name };
          if (changes.headroomCm !== undefined) next.properties = ceilingProperties(o.properties, changes.headroomCm);
          return changes.points ? { ...next, ...ceilingShape(changes.points) } : next;
        }),
      };
    });
    if (found) _commitLayers(set, get, layers, activeLayerIndex, mapData.nextlayerid);
  },

  deleteCeiling: (id) => {
    const { mapData, activeLayerIndex } = get();
    if (!mapData) return;
    let found = false;
    const layers = mapData.layers.map((layer) => {
      if (!isObjectLayer(layer) || !layer.objects.some((o) => o.id === id && isCeiling(o))) return layer;
      found = true;
      return { ...layer, objects: layer.objects.filter((o) => o.id !== id) };
    });
    if (found) _commitLayers(set, get, layers, activeLayerIndex, mapData.nextlayerid);
  },

  setWorldOrigin: (x, y) => {
    const { mapData, activeLayerIndex } = get();
    if (!mapData || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const found = findWorldOrigin(mapData);
    if (found) {
      if (found.object.x === x && found.object.y === y) return;
      const layers = updateObjectLayer(mapData.layers, found.layerIndex, (objects) =>
        objects.map((o) => (o.id === found.object.id ? { ...o, x, y } : o)));
      _commitLayers(set, get, layers, activeLayerIndex, mapData.nextlayerid);
      return;
    }
    const id = mapData.nextobjectid;
    const top = _topObjectLayer(mapData, WORLD_ORIGIN_LAYER, '#e8c547');
    const layers = updateObjectLayer(top.layers, top.index, (objects) => [...objects, _originObject(id, x, y)]);
    _commitLayers(set, get, layers, activeLayerIndex, top.nextlayerid);
    set((state) => ({ mapData: state.mapData && { ...state.mapData, nextobjectid: id + 1 } }));
  },

  ensureWorldOrigin: () => {
    const { mapData } = get();
    if (!mapData || findWorldOrigin(mapData)) return false;
    const { x, y } = defaultOriginPixel(mapData);
    const id = mapData.nextobjectid;
    const top = _topObjectLayer(mapData, WORLD_ORIGIN_LAYER, '#e8c547');
    const layers = updateObjectLayer(top.layers, top.index, (objects) => [...objects, _originObject(id, x, y)]);
    set({ mapData: { ...mapData, layers, nextlayerid: top.nextlayerid, nextobjectid: id + 1 }, isDirty: true });
    return true;
  },

  setWrapX: (on) => {
    const { mapData, heights, past } = get();
    if (!mapData) return false;
    const before = wrapsX(mapData);
    if (before === on) return true;
    if (on && wrapProblem(mapData)) return false;
    let whole: WholeHeights | undefined;
    if (on && heights) {
      const joined = blendSeam(heights);
      whole = { before: heights.cm.slice(), after: joined.cm, maskBefore: heights.mask.slice(), maskAfter: joined.mask };
      heights.cm.set(joined.cm);
      heights.mask.set(joined.mask);
      heights.fullRefresh = true;
    }
    set((state) => ({
      mapData: { ...mapData, properties: withWrap(mapData.properties, on) },
      isDirty: true,
      ...(whole ? { heightsDirty: true, heightsRev: state.heightsRev + 1, pendingHeights: new Map() } : {}),
      past: [...past, { type: 'heights' as const, changes: [], whole, wrap: { before, after: on } }],
      future: [],
    }));
    return true;
  },

  setMapLength: (property, cm) => {
    const { mapData } = get();
    if (!mapData) return;
    const properties = withLengthProperty(mapData.properties, property, cm);
    set({ mapData: { ...mapData, ...(properties.length ? { properties } : { properties: undefined }) }, isDirty: true });
  },

  addLine: (points, classId, extra) => {
    const { mapData, activeLayerIndex } = get();
    if (!mapData || points.length < 2) return null;
    const id = mapData.nextobjectid;
    const line: TmjObject = { id, name: extra?.name ?? '', type: classId, width: 0, height: 0, visible: true, ...toPolyline(onOwnTurn(mapData, points)) };
    const props = writeWidths(extra?.properties, extra?.widths ?? []);
    if (props.length) line.properties = props;
    let layers = mapData.layers;
    let nextlayerid = mapData.nextlayerid;
    let index = isObjectLayer(layers[activeLayerIndex]) ? activeLayerIndex
      : layers.findIndex((l) => isObjectLayer(l) && l.name === LINE_LAYER);
    if (index < 0) {
      // Above the active layer, so lines are drawn over the terrain they cross
      index = Math.min(activeLayerIndex + 1, layers.length);
      layers = [...layers.slice(0, index), {
        type: 'objectgroup' as const, id: nextlayerid, name: LINE_LAYER, visible: true, opacity: 1, offsetx: 0, offsety: 0,
        color: '#c9a77c', draworder: 'topdown', objects: [],
      }, ...layers.slice(index)];
      nextlayerid += 1;
    }
    layers = updateObjectLayer(layers, index, (objects) => [...objects, line]);
    const active = index <= activeLayerIndex && layers.length > mapData.layers.length ? activeLayerIndex + 1 : activeLayerIndex;
    _commitLayers(set, get, layers, active, nextlayerid);
    set((state) => ({ mapData: state.mapData && { ...state.mapData, nextobjectid: id + 1 } }));
    return id;
  },

  updateLine: (id, changes) => {
    const { mapData, activeLayerIndex } = get();
    if (!mapData) return;
    let found = false;
    const layers = mapData.layers.map((layer) => {
      if (!isObjectLayer(layer) || !layer.objects.some((o) => o.id === id && isLine(o))) return layer;
      found = true;
      return {
        ...layer,
        objects: layer.objects.map((o) => {
          if (o.id !== id) return o;
          let next: TmjObject = { ...o };
          if (changes.name !== undefined) next.name = changes.name;
          if (changes.classId !== undefined) next.type = changes.classId;
          if (changes.points && changes.points.length >= 2) next = { ...next, ...toPolyline(onOwnTurn(mapData, changes.points)) };
          if (changes.widths) next.properties = writeWidths(next.properties, changes.widths);
          if (next.properties && next.properties.length === 0) delete next.properties;
          return next;
        }),
      };
    });
    if (found) _commitLayers(set, get, layers, activeLayerIndex, mapData.nextlayerid);
  },

  deleteLine: (id) => {
    const { mapData, activeLayerIndex } = get();
    if (!mapData) return;
    let found = false;
    const layers = mapData.layers.map((layer) => {
      if (!isObjectLayer(layer) || !layer.objects.some((o) => o.id === id && isLine(o))) return layer;
      found = true;
      return { ...layer, objects: layer.objects.filter((o) => o.id !== id) };
    });
    if (found) _commitLayers(set, get, layers, activeLayerIndex, mapData.nextlayerid);
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

  setLayerOpacity: (layerIndex, opacity) => {
    const { mapData } = get();
    if (!mapData || !mapData.layers[layerIndex]) return;
    const value = Math.min(1, Math.max(0, opacity));
    const newLayers = mapData.layers.map((l, i) => (i === layerIndex ? { ...l, opacity: value } : l));
    set({ mapData: { ...mapData, layers: newLayers }, isDirty: true });
  },

  addLayer: (kind) => {
    const { mapData, activeLayerIndex } = get();
    if (!mapData) return;
    const id = mapData.nextlayerid;
    const name = _uniqueLayerName(mapData.layers, kind === 'tile' ? 'Tile Layer' : 'Object Layer');
    const layer: TmjLayer = kind === 'tile'
      ? {
        type: 'tilelayer', id, name, width: mapData.width, height: mapData.height,
        visible: true, opacity: 1, offsetx: 0, offsety: 0,
        data: new Array(mapData.width * mapData.height).fill(0),
      }
      : {
        type: 'objectgroup', id, name, visible: true, opacity: 1, offsetx: 0, offsety: 0,
        color: '#a0a0a0', draworder: 'topdown', objects: [],
      };
    const at = mapData.layers.length === 0 ? 0 : Math.min(activeLayerIndex + 1, mapData.layers.length);
    const layers = [...mapData.layers.slice(0, at), layer, ...mapData.layers.slice(at)];
    _commitLayers(set, get, layers, at, id + 1);
  },

  renameLayer: (layerIndex, name) => {
    const { mapData, activeLayerIndex } = get();
    const trimmed = name.trim();
    if (!mapData || !mapData.layers[layerIndex] || !trimmed || mapData.layers[layerIndex].name === trimmed) return;
    const layers = mapData.layers.map((l, i) => (i === layerIndex ? { ...l, name: trimmed } : l));
    _commitLayers(set, get, layers, activeLayerIndex, mapData.nextlayerid);
  },

  deleteLayer: (layerIndex) => {
    const { mapData, activeLayerIndex } = get();
    if (!mapData || !mapData.layers[layerIndex] || mapData.layers.length <= 1) return;
    const layers = mapData.layers.filter((_, i) => i !== layerIndex);
    const active = activeLayerIndex > layerIndex ? activeLayerIndex - 1 : Math.min(activeLayerIndex, layers.length - 1);
    _commitLayers(set, get, layers, active, mapData.nextlayerid);
  },

  moveLayer: (layerIndex, direction) => {
    const { mapData, activeLayerIndex } = get();
    const target = layerIndex + direction;
    if (!mapData || !mapData.layers[layerIndex] || target < 0 || target >= mapData.layers.length) return;
    const layers = [...mapData.layers];
    [layers[layerIndex], layers[target]] = [layers[target], layers[layerIndex]];
    // The active layer follows its layer
    const active = activeLayerIndex === layerIndex ? target : activeLayerIndex === target ? layerIndex : activeLayerIndex;
    _commitLayers(set, get, layers, active, mapData.nextlayerid);
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
      // Keep the map's ID counter ahead of every object in it
      mapData: { ...mapData, layers: newLayers, nextobjectid: Math.max(mapData.nextobjectid, obj.id + 1) },
      isDirty: true,
      past: [...past, { type: 'object-add', layerIndex, object: obj }],
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
        objects.filter((o) => o.id !== step.object.id),
      );
    } else if (step.type === 'object-remove') {
      newLayers = updateObjectLayer(newLayers, step.layerIndex, (objects) => [
        ...objects,
        step.object,
      ]);
    } else if (step.type === 'heights') {
      _applyHeightChanges(get().heights, step.changes, 'old', step.whole);
    } else if (step.type === 'layers') {
      newLayers = step.before.layers;
    }

    set((state) => ({
      mapData: { ...mapData, layers: newLayers, ...(step.type === 'heights' && step.wrap ? { properties: withWrap(mapData.properties, step.wrap.before) } : {}) },
      isDirty: true,
      past: newPast,
      future: [...future, step],
      ...(step.type === 'heights' && (step.whole || step.changes.length > 0) ? { heightsDirty: true, heightsRev: state.heightsRev + 1 } : {}),
      ...(step.type === 'layers' ? _layerExtras(mapData, step.before) : {}),
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
      newLayers = updateObjectLayer(newLayers, step.layerIndex, (objects) => [...objects, step.object]);
    } else if (step.type === 'object-remove') {
      newLayers = updateObjectLayer(newLayers, step.layerIndex, (objects) =>
        objects.filter((o) => o.id !== step.object.id),
      );
    } else if (step.type === 'heights') {
      _applyHeightChanges(get().heights, step.changes, 'new', step.whole);
    } else if (step.type === 'layers') {
      newLayers = step.after.layers;
    }

    set((state) => ({
      mapData: { ...mapData, layers: newLayers, ...(step.type === 'heights' && step.wrap ? { properties: withWrap(mapData.properties, step.wrap.after) } : {}) },
      isDirty: true,
      past: [...past, step],
      future: newFuture,
      ...(step.type === 'heights' && (step.whole || step.changes.length > 0) ? { heightsDirty: true, heightsRev: state.heightsRev + 1 } : {}),
      ...(step.type === 'layers' ? _layerExtras(mapData, step.after) : {}),
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

  setTileProperties: (firstgid, changes) => {
    const { mapData } = get();
    if (!mapData) return;
    const tilesets = mapData.tilesets.map((ts) => (ts.firstgid !== firstgid ? ts : {
      ...ts,
      tiles: ts.tiles.map((t) => (changes[t.id] ? { ...t, properties: changes[t.id] } : t)),
    }));
    set({ mapData: { ...mapData, tilesets }, isDirty: true });
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
