/**
 * MapCanvas — the interactive canvas for tile/hex map editing.
 *
 * Uses the Pointer Events API so the same code handles mouse and touch.
 * Pinch-to-zoom is supported via two active pointers.
 *
 * Phase 6: wires footprintOverlay after each render, tracks hover/touch
 * state, handles click-to-navigate (desktop) and two-tap model (iPad).
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useMapStore } from '../store/mapStore';
import { renderTileMap } from '../canvas/tileRenderer';
import { renderHexMap, clearHexTileCache } from '../canvas/hexRenderer';
import { hexLayout, pixelToHex } from '../canvas/hexGeometry';
import { screenToTile } from '../canvas/canvasUtils';
import type { ViewState } from '../canvas/canvasUtils';
import { mod, reachShifts, seamDelta, turnReach, unrolledHex, wrapPixelX, wrapsX, wrapView } from '../utils/worldWrap';
import { mapPixelSize } from '../utils/worldCoords';
import { isObjectLayer } from '../types/tmj';
import type { TmjMap } from '../types/tmj';
import type { MapPoint, Tool } from '../tools/baseTool';
import { terrainTool } from '../tools/terrainTool';
import { pointTool, worldOriginMarker, POINT_PICK_RADIUS_PX } from '../tools/pointTool';
import { heightTool } from '../tools/heightTool';
import { inspectTool } from '../tools/inspectTool';
import { roadsTool } from '../tools/lineTool';
import { waterTool } from '../tools/waterTool';
import { readLines, shownLines, linePoints, pixelsPerMeter } from '../utils/lines';
import { resolveLineClasses, classForType } from '../data/lineClasses';
import { drawLine } from '../canvas/lineRenderer';
import { useCrossScaleStore } from '../store/crossScaleStore';
import { refinedByIndex, hiddenAreas, lineKey, mapExtent, worldTurn } from '../utils/crossScaleLines';
import { useRefinementChecks } from './useRefinementChecks';

/** Around the map, and where a wrapped world has been shown once. */
const _BACKGROUND = '#141414';
/** Opacity of roads and rivers from other maps. */
const _GHOST_ALPHA = 0.5;
/** Screen pixels around a Flow stream that count as clicking it (Convert to River). */
const _STREAM_PICK_RADIUS_PX = 10;
/** Water's opacity while the Terrain tool is in use: still visible, but the tiles painted under it show. */
const _WATER_ALPHA_PAINTING = 0.35;
import { useViewStore } from '../store/viewStore';
import { InspectorCard } from './InspectorCard';
import { cellAt } from '../utils/inspect';
import { readSpots } from '../utils/spotHeights';
import { readContours, contourPath } from '../utils/contours';
import { readCeilings, ceilingPath, headroomGrid, mapHeadroomCm } from '../utils/ceilings';
import { renderHeadroomOverlay } from '../canvas/headroomOverlay';
import { useCeilingContext } from './useCeilings';
import { renderWaterOverlay } from '../canvas/waterOverlay';
import { useWaterView } from './useWaterView';
import { formatArea } from './WaterControls';
import { streamPicker } from '../utils/streamTrace';
import type { StreamRiver } from '../utils/streamTrace';
import { waterLines } from '../utils/carve';
import { formatHeight } from '../utils/heightGrid';
import { hexTopLeft, hexPolygon } from '../canvas/hexGeometry';
import { renderFootprintOverlay, footprintAtPoint } from '../canvas/footprintOverlay';
import { childRect, placementAt } from '../utils/worldSetUtils';
import type { ChildRect } from '../utils/worldSetUtils';
import { pixelToCell } from '../utils/worldSurface';
import type { RenderedFootprint } from '../canvas/footprintOverlay';
import { useWorldSetStore } from '../store/worldSetStore';
import { navigateToMap } from '../utils/navigation';
import { getMap } from '../api/client';
import { resolveMetersPerUnit, resolveUnits } from '../data/mapScales';
import { renderElevationOverlay } from '../canvas/elevationOverlay';
import { bandIntervalCm } from '../utils/heightGrid';
import { useCursorStore } from '../store/cursorStore';
import { useWorldSurfaceStore, surfaceKey } from '../store/worldSurfaceStore';
import { displayPatch } from '../utils/worldSurface';
import type { OpenWorldSetDialogArgs } from './WorldHierarchyPanel';

const TOOLS: Record<string, Tool> = {
  inspect: inspectTool,
  terrain: terrainTool,
  height: heightTool,
  water: waterTool,
  roads: roadsTool,
  point: pointTool,
};

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 16;
const ZOOM_STEP = 1.2;

interface MapCanvasProps {
  onOpenWorldSetDialog: (args: OpenWorldSetDialogArgs) => void;
}

/** The cell at a pixel of a wrapped map, any number of turns round; its row may be off the map. */
function _wrappedTile(map: TmjMap, p: MapPoint): { col: number; row: number } {
  if (map.orientation !== 'hexagonal') {
    return { col: mod(Math.floor(p.x / map.tilewidth), map.width), row: Math.floor(p.y / map.tileheight) };
  }
  const at = unrolledHex(map, p.x, p.y);
  return { col: mod(at.col, map.width), row: at.row };
}

export const MapCanvas: React.FC<MapCanvasProps> = (props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const store = useMapStore();
  const activePointers = useRef<Map<number, PointerEvent>>(new Map());
  const lastPinchDistance = useRef<number | null>(null);
  const isPanning = useRef(false);
  const lastPanPoint = useRef<{ x: number; y: number } | null>(null);
  const isDrawing = useRef(false);
  /** The pointer in the current press-drag, in map pixels: on a wrapped map the next position is followed from it. */
  const gesturePos = useRef<MapPoint | null>(null);
  /** Terrain tool: a right press waiting to become an erase drag or a menu (see onPointerDown). */
  const rightGesture = useRef<{ tile: { col: number; row: number }; pos: { x: number; y: number }; openMenu: () => void } | null>(null);

  // World set store and current map name
  const worldSetStore = useWorldSetStore();
  const defaultUnits = worldSetStore.activeWorldSet?.units;
  const activeWorldSetName = worldSetStore.activeWorldSetName;
  // Name used for hierarchy lookups: only when the open map belongs to the active world set
  const mapName = store.mapWorldSet === activeWorldSetName ? store.mapName : '';
  // Child maps' heights shown on this one (only when they belong to this map)
  const surface = useWorldSurfaceStore();
  const surfaceOverrides = surface.key === surfaceKey(store.mapWorldSet, store.mapName) ? surface.overrides : null;
  const inspected = useViewStore((s) => s.inspected);
  const selectedSpotId = useViewStore((s) => s.selectedSpotId);
  const selectedWaterId = useViewStore((s) => s.selectedWaterId);
  const selectedObjectId = useViewStore((s) => s.selectedObjectId);
  // Lakes, the sea, and (when shown) streams and hollows
  const waterView = useWaterView();
  const { selectedLineId, selectedContourId, selectedCeilingId, selectedPoint, draftLine, dragPoints, selectedGhost, showLines, openMapRequest, originDrag } = useViewStore();
  // Roads and rivers from ancestor and descendant maps (when they belong to this map)
  const cross = useCrossScaleStore();
  const refinementChecks = useRefinementChecks();
  const crossOk = cross.key === surfaceKey(store.mapWorldSet, store.mapName) && showLines;
  const related = crossOk ? cross.related : [];
  const ghosts = crossOk ? cross.ghosts : [];
  const refIndex = useMemo(
    () => (store.mapData ? refinedByIndex(store.mapName, store.mapData, related) : new Map<string, string[]>()),
    [store.mapData?.layers, related, store.mapName], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // Rubber band for the line being drawn: follow the pointer only while drawing
  const cursorPos = useCursorStore((s) => (draftLine ? s.mapPos : null));
  // Line drawing: the Roads tool, and the Water tool's Rivers mode
  const viewWaterMode = useViewStore((s) => s.waterMode);
  const riversMode = store.selectedTool === 'water' && viewWaterMode === 'rivers';
  const lineDrawing = store.selectedTool === 'roads' || riversMode;
  // Line selection and drafts belong to the open map and the tool drawing them
  useEffect(() => {
    const v = useViewStore.getState();
    v.selectLine(null); v.setDraftLine(null); v.setDragPoints(null); v.setSelectedGhost(null);
  }, [store.mapName, store.mapWorldSet, store.selectedTool, riversMode]);
  // Contour selection and drafts belong to the open map and the Height tool's Contour mode
  const contourMode = store.selectedTool === 'height' && store.heightBrush.mode === 'contour';
  useEffect(() => {
    const v = useViewStore.getState();
    v.selectContour(null);
    if (!contourMode && v.draftLine && !lineDrawing) v.setDraftLine(null);
    v.setDragPoints(null);
  }, [store.mapName, store.mapWorldSet, contourMode]); // eslint-disable-line react-hooks/exhaustive-deps
  // Ceiling selection and drafts belong to the open map and the Height tool's Ceiling mode
  const ceilingMode = store.selectedTool === 'height' && store.heightBrush.mode === 'ceiling';
  useEffect(() => {
    const v = useViewStore.getState();
    v.selectCeiling(null);
    if (!ceilingMode && !contourMode && v.draftLine && !lineDrawing) v.setDraftLine(null);
    v.setDragPoints(null);
  }, [store.mapName, store.mapWorldSet, ceilingMode]); // eslint-disable-line react-hooks/exhaustive-deps
  // Headroom overlay: recomputed when the heights are committed, ceilings or levels above change
  const ceilingCtx = useCeilingContext();
  const headroom = useMemo(() => {
    const map = useMapStore.getState().mapData, h = useMapStore.getState().heights;
    if (!store.elevationView.headroom || !map || !h) return null;
    return { grid: headroomGrid(map, h, ceilingCtx, readCeilings(map)), own: mapHeadroomCm(map) };
  }, [store.elevationView.headroom, store.heights, store.heightsRev, store.mapData?.layers, store.mapData?.properties, ceilingCtx]); // eslint-disable-line react-hooks/exhaustive-deps
  // A water body selection belongs to the open map and the Water tool's Lakes mode
  const waterMode = store.selectedTool === 'water' && viewWaterMode === 'lakes';
  useEffect(() => { useViewStore.getState().setSelectedWaterId(null); }, [store.mapName, store.mapWorldSet, waterMode]);
  // A selected point belongs to the open map and the Points tool
  useEffect(() => { useViewStore.getState().setSelectedObjectId(null); }, [store.mapName, store.mapWorldSet, store.selectedTool]);
  // Convert to River: only in the Water tool's Rivers mode with the Flow view on; ends with the map
  const convertingStream = useViewStore((s) => s.convertingStream);
  const flowShown = store.elevationView.flow;
  useEffect(() => {
    if (convertingStream && !(riversMode && flowShown)) useViewStore.getState().setConvertingStream(false);
  }, [convertingStream, riversMode, flowShown]);
  useEffect(() => {
    const v = useViewStore.getState();
    v.setConvertingStream(false);
    v.setStreamNote('');
  }, [store.mapName, store.mapWorldSet]);
  const converting = convertingStream && riversMode && !!waterView.flow;
  const worldLineClasses = store.mapWorldSet === activeWorldSetName ? worldSetStore.activeWorldSet?.lineClasses : undefined;
  const streams = useMemo(() => {
    const map = useMapStore.getState().mapData, h = useMapStore.getState().heights;
    if (!converting || !map || !h || !waterView.flow) return null;
    const classes = resolveLineClasses(worldLineClasses);
    return streamPicker(map, h.cols, h.rows, waterView.flow, waterView.water, waterView.streamSamples,
      waterLines(readLines(map), classes), classes, resolveMetersPerUnit(map, defaultUnits) ?? null);
  }, [converting, waterView.flow, waterView.water, waterView.streamSamples, store.mapData?.layers, worldLineClasses, defaultUnits]); // eslint-disable-line react-hooks/exhaustive-deps
  const streamsRef = useRef(streams);
  streamsRef.current = streams;
  // The stream under the pointer, highlighted before you click
  const streamHoverPos = useCursorStore((s) => (converting ? s.mapPos : null));
  const hoverRiver: StreamRiver | null = useMemo(
    () => (streams && streamHoverPos ? streams.at(streamHoverPos.x, streamHoverPos.y, _STREAM_PICK_RADIUS_PX / store.zoom) : null),
    [streams, streamHoverPos, store.zoom],
  );
  // Drawing lines shows roads and rivers, so you never edit lines you can't see
  useEffect(() => {
    if (lineDrawing) useViewStore.getState().setShowLines(true);
  }, [lineDrawing]);
  // A panel asked to open a map: guard unsaved changes like a footprint click does
  useEffect(() => {
    if (!openMapRequest) return;
    useViewStore.getState().requestOpenMap(null);
    if (useMapStore.getState().isDirty) setDirtyGuardTarget(openMapRequest);
    else navigateToMap(openMapRequest, { saveFirst: false }).catch(console.error);
  }, [openMapRequest]);

  // A spot selection belongs to the open map
  useEffect(() => { useViewStore.getState().setSelectedSpotId(null); }, [store.mapName, store.mapWorldSet]);
  const inspecting = store.selectedTool === 'inspect';
  // The inspector belongs to the Inspect tool and the open map
  useEffect(() => { useViewStore.getState().setInspected(null); }, [store.mapName, store.mapWorldSet, inspecting]);

  // Overlay state
  const [hoveredFootprint, setHoveredFootprint] = useState<string | null>(null);
  const [touchedFootprint, setTouchedFootprint] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [pickerPos, setPickerPos] = useState<{ x: number; y: number } | null>(null);
  const [pickerCandidates, setPickerCandidates] = useState<string[]>([]);
  // Track last render's footprints for hit-testing (ref to avoid stale closure)
  const renderedFootprintsRef = useRef<RenderedFootprint[]>([]);
  const pickerRef = useRef<HTMLUListElement>(null);
  // Dirty-map guard modal state
  const [dirtyGuardTarget, setDirtyGuardTarget] = useState<string | null>(null);

  // Canvas right-click context menu (Phase 7)
  type CanvasCtxMenuState = {
    x: number;
    y: number;
    col: number;
    row: number;
    footprintMapName?: string;
    /** Map-pixel point clicked, snapped to a point object (e.g. a city marker) under the pointer. */
    mapX: number;
    mapY: number;
    snapName?: string;
  } | null;
  const [canvasCtxMenu, setCanvasCtxMenu] = useState<CanvasCtxMenuState>(null);
  const ctxMenuRef = useRef<HTMLUListElement>(null);

  // Pre-computed footprint map: child mapName → tile-space Footprint on the parent grid.
  // Rebuilt whenever the children list or the parent's cell size changes.
  const [footprintMap, setFootprintMap] = useState<Map<string, ChildRect>>(new Map());
  // Cache of fetched child TmjMap data so we don't re-fetch on every hover re-render.
  // Keyed by "<world set>/<map>": map names are only unique within a world set.
  const childMapCacheRef = useRef<Map<string, import('../types/tmj').TmjMap>>(new Map());
  const cacheKey = (name: string) => `${activeWorldSetName}/${name}`;

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx || !store.mapData) return;

    const map = store.mapData;
    const { zoom, pan } = store;
    const { heights, elevationView } = store;
    const shown = heights && elevationView.showChildren ? displayPatch(heights, surfaceOverrides) : heights;
    // Roads and rivers: the world set's classes when this map belongs to the active one
    const lineClasses = resolveLineClasses(store.mapWorldSet === activeWorldSetName ? worldSetStore.activeWorldSet?.lineClasses : undefined);
    const ppm = pixelsPerMeter(map, resolveMetersPerUnit(map, defaultUnits));
    const openRect = mapExtent(map);
    const worldTurnPx = worldTurn(map, related);
    // Roads and rivers, all shown or hidden by the "Roads & rivers" toggle: other maps' lines
    // (faded), then this map's on shown layers, above the terrain and under the other
    // objects. A line is hidden where a more detailed map refines it.
    const drawLines = (c: CanvasRenderingContext2D) => {
      if (!showLines) return;
      for (const g of ghosts) {
        if (refIndex.get(g.key)?.includes(store.mapName)) continue;
        for (const copy of g.copies) {
          drawLine(c, copy, zoom, classForType(g.object.type, lineClasses).cls, ppm, {
            exclude: hiddenAreas(g.key, refIndex, store.mapName, openRect, related),
            clipTo: g.clipTo,
            alpha: _GHOST_ALPHA,
          });
        }
      }
      for (const { object, layerIndex } of shownLines(map)) {
        drawLine(c, object, zoom, classForType(object.type, lineClasses).cls, ppm, {
          exclude: related.length ? hiddenAreas(lineKey(store.mapName, object.id), refIndex, store.mapName, openRect, related, worldTurnPx, linePoints(object)) : undefined,
          alpha: map.layers[layerIndex].opacity,
        });
      }
    };
    // The map at a view: all of it, or (for a world that wraps) its ground or what goes over it
    const drawMap = (view: ViewState, part?: 'ground' | 'objects') => {
      const opts = {
        view,
        part,
        showGrid: store.showGrid,
        onImageLoad: () => { clearHexTileCache(); requestAnimationFrame(render); },
        afterTileLayers: (c: CanvasRenderingContext2D) => {
          if (part === 'objects') { drawLines(c); return; }
          if (shown && elevationView.visible) {
            renderElevationOverlay(c, map, shown, view.zoom, view.pan, {
              opacity: elevationView.opacity,
              hillshade: elevationView.hillshade,
              intervalCm: bandIntervalCm(map.scale, resolveUnits(map, defaultUnits)),
            });
          }
          // Water over the ground, under roads and rivers (from the map's own heights)
          if (heights && waterView.water && (elevationView.water || elevationView.flow)) {
            renderWaterOverlay(c, map, heights, waterView.water, waterView.flow, view.zoom, view.pan, {
              water: elevationView.water, flow: elevationView.flow, streamSamples: waterView.streamSamples,
              opacity: store.selectedTool === 'terrain' ? _WATER_ALPHA_PAINTING : 1,
            });
          }
          if (headroom) renderHeadroomOverlay(c, map, headroom.grid, headroom.own, view.zoom, view.pan);
          if (!part) drawLines(c);
        },
      };
      if (map.orientation === 'hexagonal') renderHexMap(ctx, map, opts);
      else renderTileMap(ctx, map, opts);
    };

    // Everything drawn over the map at a view: footprints, marks, handles
    const drawMarks = (view: ViewState) => {
      // Footprint overlay pass — must come after tile/hex render
      const children = mapName ? worldSetStore.childrenOf(mapName) : [];
      if (children.length > 0) {
        renderedFootprintsRef.current.push(...renderFootprintOverlay(ctx, children, map, view, hoveredFootprint, footprintMap));
      }

      // Contour lines (in visible layers): a thin brown line with its height
      const shownLayers = new Set(map.layers.map((l, i) => (l.visible ? i : -1)));
      const contours = readContours(map).filter((c) => shownLayers.has(c.layerIndex));
      if (contours.length) {
        const units = resolveUnits(map, defaultUnits);
        ctx.save();
        ctx.translate(view.pan.x, view.pan.y);
        ctx.lineJoin = 'round';
        ctx.font = "600 10px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const c of contours) {
          const path = contourPath(c);
          ctx.beginPath();
          path.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x * view.zoom, p.y * view.zoom) : ctx.lineTo(p.x * view.zoom, p.y * view.zoom)));
          ctx.lineWidth = 3.5;
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
          ctx.stroke();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = c.id === selectedContourId ? '#ffd400' : '#5b3716';
          ctx.stroke();
          // The height label halfway along the line
          const lens = path.slice(1).map((p, i) => Math.hypot(p.x - path[i].x, p.y - path[i].y));
          let left = lens.reduce((a, b) => a + b, 0) / 2, k = 0;
          while (k < lens.length - 1 && left > lens[k]) left -= lens[k++];
          const t = lens[k] ? left / lens[k] : 0;
          const lx = (path[k].x + (path[k + 1].x - path[k].x) * t) * view.zoom, ly = (path[k].y + (path[k + 1].y - path[k].y) * t) * view.zoom;
          const label = `${c.name ? c.name + ' ' : ''}${formatHeight(c.cm, units)}`;
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(0,0,0,0.8)';
          ctx.strokeText(label, lx, ly);
          ctx.fillStyle = c.id === selectedContourId ? '#ffd400' : '#f3e2c7';
          ctx.fillText(label, lx, ly);
        }
        ctx.restore();
      }

      // Ceiling objects (in visible layers): a dashed purple outline with the headroom
      const ceilings = readCeilings(map).filter((c) => shownLayers.has(c.layerIndex));
      if (ceilings.length) {
        const units = resolveUnits(map, defaultUnits);
        ctx.save();
        ctx.translate(view.pan.x, view.pan.y);
        ctx.lineJoin = 'round';
        ctx.font = "600 10px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const c of ceilings) {
          const sel = c.id === selectedCeilingId;
          const path = ceilingPath(c);
          ctx.beginPath();
          path.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x * view.zoom, p.y * view.zoom) : ctx.lineTo(p.x * view.zoom, p.y * view.zoom)));
          ctx.setLineDash([]);
          ctx.lineWidth = 3.5;
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
          ctx.stroke();
          ctx.setLineDash([5, 3]);
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = sel ? '#ffd400' : '#6b3fa0';
          ctx.stroke();
          ctx.setLineDash([]);
          // The headroom at the shape's centre (average of its corners)
          const cx = c.points.reduce((a, p) => a + p.x, 0) / c.points.length * view.zoom;
          const cy = c.points.reduce((a, p) => a + p.y, 0) / c.points.length * view.zoom;
          const label = `${c.name ? c.name + ' ' : ''}↕ ${formatHeight(c.headroomCm, units)}`;
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(0,0,0,0.8)';
          ctx.strokeText(label, cx, cy);
          ctx.fillStyle = sel ? '#ffd400' : '#e4d3f7';
          ctx.fillText(label, cx, cy);
        }
        ctx.restore();
      }

      // Convert to River: the stream that a click would convert, from source to end
      if (hoverRiver) {
        const cls = classForType(hoverRiver.classId, lineClasses).cls;
        ctx.save();
        ctx.translate(view.pan.x, view.pan.y);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        hoverRiver.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x * view.zoom, p.y * view.zoom) : ctx.lineTo(p.x * view.zoom, p.y * view.zoom)));
        ctx.lineWidth = 7;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.stroke();
        ctx.lineWidth = 3;
        ctx.strokeStyle = cls.color;
        ctx.stroke();
        ctx.restore();
      }

      // Points tool: a ring around the selected point
      if (store.selectedTool === 'point' && selectedObjectId !== null) {
        for (const layer of map.layers) {
          const o = isObjectLayer(layer) && layer.visible ? layer.objects.find((x) => x.id === selectedObjectId) : undefined;
          if (!o) continue;
          const x = o.x * view.zoom + view.pan.x, y = o.y * view.zoom + view.pan.y;
          ctx.save();
          ctx.beginPath();
          ctx.arc(x, y, 9, 0, Math.PI * 2);
          ctx.lineWidth = 4;
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
          ctx.stroke();
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#ffd400';
          ctx.stroke();
          ctx.restore();
          break;
        }
      }

      // Water bodies: a blue disc with the name and surface height
      const waterBodies = waterView.bodies.filter((b) => shownLayers.has(b.layerIndex));
      if (waterBodies.length) {
        const units = resolveUnits(map, defaultUnits);
        ctx.save();
        ctx.translate(view.pan.x, view.pan.y);
        ctx.font = "600 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
        ctx.textBaseline = 'middle';
        waterBodies.forEach((b) => {
          const sel = b.id === selectedWaterId;
          const at = sel && waterMode && dragPoints ? dragPoints[0] : b;
          const x = at.x * view.zoom, y = at.y * view.zoom;
          const fill = waterView.water?.fills[waterView.bodies.indexOf(b)];
          ctx.beginPath();
          ctx.arc(x, y, 6, 0, Math.PI * 2);
          ctx.fillStyle = sel ? '#ffd400' : fill?.dry ? '#9aa4ad' : '#3d7fd1';
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5;
          ctx.fill(); ctx.stroke();
          // A small wave across the disc
          ctx.beginPath();
          ctx.moveTo(x - 4, y); ctx.quadraticCurveTo(x - 2, y - 2.5, x, y); ctx.quadraticCurveTo(x + 2, y + 2.5, x + 4, y);
          ctx.strokeStyle = sel ? '#000' : '#fff';
          ctx.lineWidth = 1.2;
          ctx.stroke();
          const label = `${b.name ? b.name + ' ' : ''}${formatHeight(b.cm, units)}${fill?.dry ? ' (dry)' : ''}`;
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(0,0,0,0.8)';
          ctx.strokeText(label, x + 9, y);
          ctx.fillStyle = sel ? '#ffd400' : '#cfe6ff';
          ctx.fillText(label, x + 9, y);
        });
        ctx.restore();
      }

      // Spot heights: a triangle and the height, on top of everything
      const spotLayers = shownLayers;
      const spots = readSpots(map).filter((s) => spotLayers.has(s.layerIndex));
      if (spots.length) {
        const units = resolveUnits(map, defaultUnits);
        ctx.save();
        ctx.translate(view.pan.x, view.pan.y);
        ctx.font = "600 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
        ctx.textBaseline = 'middle';
        for (const s of spots) {
          const x = s.x * view.zoom, y = s.y * view.zoom;
          const sel = s.id === selectedSpotId;
          ctx.beginPath();
          ctx.moveTo(x, y - 6); ctx.lineTo(x + 5, y + 4); ctx.lineTo(x - 5, y + 4); ctx.closePath();
          ctx.fillStyle = sel ? '#ffd400' : '#fff';
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 1.5;
          ctx.fill(); ctx.stroke();
          const label = `${s.name ? s.name + ' ' : ''}${formatHeight(s.cm, units)}`;
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(0,0,0,0.8)';
          ctx.strokeText(label, x + 8, y);
          ctx.fillStyle = sel ? '#ffd400' : '#fff';
          ctx.fillText(label, x + 8, y);
        }
        ctx.restore();
      }

      // Refined lines that no longer meet their originals: rings at the ends that are off,
      // and at crossings of the original that no copy meets
      if (showLines) {
        const bad = refinementChecks.filter((c) => c.result.status === 'moved');
        if (bad.length) {
          ctx.save();
          ctx.translate(view.pan.x, view.pan.y);
          // A dark halo under each ring keeps it visible over lines and light terrain
          const ring = (p: { x: number; y: number }, color: string, dashed: boolean) => {
            ctx.beginPath();
            ctx.arc(p.x * view.zoom, p.y * view.zoom, 10, 0, Math.PI * 2);
            ctx.setLineDash([]);
            ctx.lineWidth = 5;
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
            ctx.stroke();
            ctx.setLineDash(dashed ? [4, 3] : []);
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = color;
            ctx.stroke();
          };
          for (const c of bad) {
            for (const e of c.result.badEnds) ring(e.at, '#ff5a3c', false);
            for (const x of c.result.unmatchedCrossings) ring(x, '#ffb000', true);
          }
          ctx.restore();
        }
      }

      // Line drawing (Roads, Water → Rivers): the line being drawn, and the selected line's handles
      // A selected line from another map: outline it
      const ghost = selectedGhost ? ghosts.find((g) => g.key === selectedGhost) : undefined;
      for (const copy of ghost?.copies ?? []) {
        ctx.save();
        ctx.translate(view.pan.x, view.pan.y);
        ctx.strokeStyle = 'rgba(255, 212, 0, 0.9)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        copy.polyline?.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x * view.zoom, p.y * view.zoom) : ctx.lineTo(p.x * view.zoom, p.y * view.zoom)));
        ctx.stroke();
        ctx.restore();
      }

      if (draftLine || selectedLineId !== null || selectedContourId !== null || selectedCeilingId !== null) {
        ctx.save();
        ctx.translate(view.pan.x, view.pan.y);
        const z = view.zoom;
        const handle = (p: { x: number; y: number }, fill: string, size = 4) => {
          ctx.fillStyle = fill;
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 1;
          ctx.fillRect(p.x * z - size, p.y * z - size, size * 2, size * 2);
          ctx.strokeRect(p.x * z - size, p.y * z - size, size * 2, size * 2);
        };
        if (draftLine) {
          const pts = cursorPos ? [...draftLine, cursorPos] : draftLine;
          ctx.setLineDash([6, 4]);
          ctx.strokeStyle = '#ffd400';
          ctx.lineWidth = 2;
          ctx.beginPath();
          pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x * z, p.y * z) : ctx.lineTo(p.x * z, p.y * z)));
          ctx.stroke();
          ctx.setLineDash([]);
          // In Contour and Ceiling modes a bigger first point shows where to click to close the loop
          draftLine.forEach((p, i) => handle(p, '#ffd400', i === 0 && (contourMode || ceilingMode) && draftLine.length >= 3 ? 5 : 3));
        } else {
          // The selected line, contour or ceiling shape (a closed one gets its closing segment's handle too)
          const line = selectedLineId !== null ? readLines(map).find((l) => l.id === selectedLineId) : undefined;
          const contour = selectedContourId !== null ? readContours(map).find((c) => c.id === selectedContourId) : undefined;
          const ceiling = selectedCeilingId !== null && ceilingMode ? readCeilings(map).find((c) => c.id === selectedCeilingId) : undefined;
          const editPts = line ? linePoints(line.object) : contour ? contour.points : ceiling?.points;
          if (editPts) {
            const own = (!waterMode && dragPoints) || editPts;
            const pts = contour ? contourPath({ points: own, closed: contour.closed }) : ceiling ? ceilingPath({ points: own }) : own;
            ctx.strokeStyle = 'rgba(255, 212, 0, 0.9)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x * z, p.y * z) : ctx.lineTo(p.x * z, p.y * z)));
            ctx.stroke();
            ctx.setLineDash([]);
            // Midpoint handles (drag to insert a point)
            for (let i = 0; i + 1 < pts.length; i++) {
              ctx.beginPath();
              ctx.arc((pts[i].x + pts[i + 1].x) / 2 * z, (pts[i].y + pts[i + 1].y) / 2 * z, 3, 0, Math.PI * 2);
              ctx.fillStyle = 'rgba(255,255,255,0.6)';
              ctx.fill();
            }
            own.forEach((p, i) => handle(p, i === selectedPoint ? '#ffd400' : '#fff'));
          }
        }
        ctx.restore();
      }

      // The world origin (#9) on a root map: a crosshair, dashed until it's stored in the map
      const origin = worldOriginMarker(store);
      if (origin) {
        const at = originDrag ?? origin;
        const x = view.pan.x + at.x * view.zoom, y = view.pan.y + at.y * view.zoom;
        ctx.save();
        ctx.strokeStyle = '#e8c547';
        ctx.lineWidth = 2;
        ctx.setLineDash(origin.stored || originDrag ? [] : [3, 3]);
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.moveTo(x - 13, y); ctx.lineTo(x + 13, y);
        ctx.moveTo(x, y - 13); ctx.lineTo(x, y + 13);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = 'bold 11px sans-serif';
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillText('0, 0', x + 11, y - 9);
        ctx.fillStyle = '#e8c547';
        ctx.fillText('0, 0', x + 10, y - 10);
        ctx.restore();
      }

      // Outline the inspected cell
      const cell = inspected && cellAt(map, inspected.x, inspected.y);
      if (cell) {
        ctx.save();
        ctx.translate(view.pan.x, view.pan.y);
        ctx.beginPath();
        if (map.orientation === 'hexagonal') {
          const layout = hexLayout(map);
          const tl = hexTopLeft(layout, cell.col, cell.row);
          hexPolygon(layout).forEach((p, i) => {
            const x = (tl.x + p.x) * view.zoom, y = (tl.y + p.y) * view.zoom;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          });
          ctx.closePath();
        } else {
          ctx.rect(cell.col * map.tilewidth * view.zoom, cell.row * map.tileheight * view.zoom,
            map.tilewidth * view.zoom, map.tileheight * view.zoom);
        }
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffd400';
        ctx.stroke();
        ctx.restore();
      }
    };

    renderedFootprintsRef.current = [];
    const wrap = wrapView(map, zoom, pan.x, canvas.width, turnReach(map, [...(draftLine ?? []), ...(dragPoints ?? []), ...(hoverRiver?.points ?? [])]));
    if (!wrap) {
      drawMap({ zoom, pan });
      drawMarks({ zoom, pan });
      return;
    }
    // A world that wraps (#36): one turn of it, centred in the view
    ctx.fillStyle = _BACKGROUND;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.beginPath();
    ctx.rect(wrap.x0, 0, wrap.x1 - wrap.x0, canvas.height);
    ctx.clip();
    const turn = (k: number): ViewState => ({ zoom, pan: { x: pan.x + k * wrap.period, y: pan.y } });
    for (const k of wrap.ground) drawMap(turn(k), 'ground');
    for (const k of wrap.marks) drawMap(turn(k), 'objects');
    if (store.showGrid) {
      // The seam: where the map's own columns start again
      const top = pan.y, bottom = pan.y + mapPixelSize(map).height * zoom;
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([7, 5]);
      for (const k of wrap.marks) {
        const x = pan.x + k * wrap.period;
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
        ctx.stroke();
      }
      ctx.restore();
    }
    for (const k of wrap.marks) drawMarks(turn(k));
    ctx.restore();
  }, [originDrag, refinementChecks, showLines, ghosts, related, refIndex, selectedGhost, inspected, selectedSpotId, selectedWaterId, selectedObjectId, waterMode, waterView, hoverRiver, selectedLineId, selectedContourId, contourMode, selectedCeilingId, ceilingMode, headroom, selectedPoint, draftLine, dragPoints, cursorPos, activeWorldSetName, store.mapData, store.selectedTool, store.zoom, store.pan, store.showGrid, store.heights, store.heightsRev, store.elevationView, surfaceOverrides, defaultUnits, hoveredFootprint, worldSetStore, mapName, footprintMap]);

  // Fetch child map data and pre-compute footprints whenever the children or
  // parent's cell size changes. Results are cached so navigation doesn't re-fetch.
  useEffect(() => {
    const parentMPU = resolveMetersPerUnit(store.mapData ?? undefined, defaultUnits);
    if (!mapName || !parentMPU) {
      setFootprintMap(new Map());
      return;
    }
    const children = worldSetStore.childrenOf(mapName).filter((c) => c.parentAnchor !== null);
    if (children.length === 0) {
      setFootprintMap(new Map());
      return;
    }

    const toFetch = children.filter((c) => !childMapCacheRef.current.has(cacheKey(c.mapName)));
    let cancelled = false;

    const buildMap = () => {
      if (cancelled) return;
      const fp = new Map<string, ChildRect>();
      for (const child of children) {
        if (!child.parentAnchor) continue;
        const data = childMapCacheRef.current.get(cacheKey(child.mapName));
        const childMPU = resolveMetersPerUnit(data, defaultUnits);
        if (!data || !childMPU) continue;
        fp.set(child.mapName, childRect(data.width, data.height, childMPU, parentMPU, child.parentAnchor, child.parentOffset));
      }
      setFootprintMap(fp);
    };

    if (toFetch.length === 0) {
      buildMap();
      return;
    }

    Promise.all(toFetch.map((c) => getMap(activeWorldSetName ?? '', c.mapName).then((d) => [c.mapName, d] as const)))
      .then((entries) => {
        if (cancelled) return;
        for (const [name, data] of entries) childMapCacheRef.current.set(cacheKey(name), data);
        buildMap();
      })
      .catch(() => { if (!cancelled) setFootprintMap(new Map()); });

    return () => { cancelled = true; };
  }, [mapName, worldSetStore, defaultUnits, store.mapData?.metersPerUnit, store.mapData?.scale, store.mapData?.units]);

  useEffect(() => {
    // Resize canvas to fill its container
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      render();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement ?? canvas);
    resize();
    return () => ro.disconnect();
  }, [render]);

  useEffect(() => {
    requestAnimationFrame(render);
  }, [render]);

  // --------------------------------------------------------------------------
  // Dismiss picker on outside click or Escape
  // --------------------------------------------------------------------------

  useEffect(() => {
    if (!pickerPos) return;
    const dismiss = (e: PointerEvent) => {
      if (pickerRef.current?.contains(e.target as Node)) return;
      setPickerPos(null); setPickerCandidates([]);
    };
    document.addEventListener('pointerdown', dismiss, { capture: true });
    return () => document.removeEventListener('pointerdown', dismiss, { capture: true });
  }, [pickerPos]);

  useEffect(() => {
    if (!pickerPos) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setPickerPos(null); setPickerCandidates([]); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pickerPos]);

  // Dismiss canvas context menu on outside mousedown or Escape
  useEffect(() => {
    if (!canvasCtxMenu) return;
    const onMouseDown = () => setCanvasCtxMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCanvasCtxMenu(null); };
    const t = setTimeout(() => {
      document.addEventListener('mousedown', onMouseDown);
      document.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [canvasCtxMenu]);

  // --------------------------------------------------------------------------
  // Coordinate helpers
  // --------------------------------------------------------------------------

  function getCanvasPoint(e: PointerEvent): { x: number; y: number } {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  /**
   * Pointer position in map pixels (object coordinate space). On a wrapped map: on its own
   * turn, except that a drag, or a line being drawn, carries on from where it was (so it
   * can run past an edge without jumping across the map).
   */
  function pointerToMap(e: PointerEvent): MapPoint {
    const pt = getCanvasPoint(e);
    const x = (pt.x - store.pan.x) / store.zoom, y = (pt.y - store.pan.y) / store.zoom;
    const map = store.mapData;
    if (!map || !wrapsX(map)) return { x, y };
    const draft = useViewStore.getState().draftLine;
    const from = isDrawing.current ? gesturePos.current : draft?.[draft.length - 1];
    return { x: from ? from.x + seamDelta(map, from.x, x) : wrapPixelX(map, x), y };
  }

  /** Whether the pointer is beside the one turn of a wrapped world that's shown. */
  function offWorld(e: PointerEvent): boolean {
    const wrap = store.mapData && wrapView(store.mapData, store.zoom, store.pan.x, canvasRef.current!.width);
    if (!wrap) return false;
    const { x } = getCanvasPoint(e);
    return x < wrap.x0 || x > wrap.x1;
  }

  /** Where a press lands: on a wrapped map, on the turn where the tool finds something to take hold of. */
  function pressPos(e: PointerEvent, tool: Tool): MapPoint {
    const pos = pointerToMap(e), map = store.mapData;
    if (!map || !wrapsX(map) || !tool.picks || useViewStore.getState().draftLine) return pos;
    return reachShifts(map).map((s) => ({ x: pos.x + s, y: pos.y })).find((p) => tool.picks!(store, p)) ?? pos;
  }

  function pointerToTile(e: PointerEvent): { col: number; row: number } | null {
    const { mapData, zoom, pan } = store;
    if (!mapData) return null;
    if (wrapsX(mapData)) return _wrappedTile(mapData, pointerToMap(e));
    const pt = getCanvasPoint(e);

    if (mapData.orientation === 'hexagonal') {
      return pixelToHex(
        hexLayout(mapData),
        (pt.x - pan.x) / zoom,
        (pt.y - pan.y) / zoom,
        mapData.width,
        mapData.height,
      );
    }

    return screenToTile(pt.x, pt.y, { zoom, pan }, mapData.tilewidth, mapData.tileheight);
  }

  function pinchDistance(): number {
    const pts = [...activePointers.current.values()];
    const dx = pts[0].clientX - pts[1].clientX;
    const dy = pts[0].clientY - pts[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // --------------------------------------------------------------------------
  // Pointer handlers
  // --------------------------------------------------------------------------

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    activePointers.current.set(e.pointerId, e.nativeEvent);

    if (activePointers.current.size === 2) {
      // Start pinch — cancel any active drawing
      isPanning.current = false;
      isDrawing.current = false;
      lastPinchDistance.current = pinchDistance();
      const tool = TOOLS[store.selectedTool];
      if (tool.onCancel) tool.onCancel(store); else tool.onRelease(store);
      return;
    }

    if (e.button === 1 || e.buttons === 4) {
      // Middle button → pan
      isPanning.current = true;
      lastPanPoint.current = getCanvasPoint(e.nativeEvent);
      return;
    }

    const tile = pointerToTile(e.nativeEvent);
    if (!tile || offWorld(e.nativeEvent)) return;

    // Convert to River: a click on a Flow stream makes it a drawn river. Before footprints,
    // so streams inside child maps can be picked too.
    if (streamsRef.current && e.button === 0) {
      convertStreamAt(pointerToMap(e.nativeEvent));
      return;
    }

    // Footprint interception — runs before tool dispatch. The Inspect tool inspects
    // footprints instead (its card has an Open button for each child map), and line
    // drawing goes across them (roads and rivers run into child maps).
    const drawingLines = store.selectedTool === 'roads'
      || (store.selectedTool === 'water' && useViewStore.getState().waterMode === 'rivers');
    // The Points tool drags the world origin (#9) even where it sits on a child's footprint
    const origin = store.selectedTool === 'point' ? worldOriginMarker(store) : null;
    const at = origin && pointerToMap(e.nativeEvent);
    const onOrigin = !!origin && !!at && !!store.mapData
      && Math.hypot(seamDelta(store.mapData, at.x, origin.x), origin.y - at.y) * store.zoom <= POINT_PICK_RADIUS_PX;
    if (store.mapData && store.selectedTool !== 'inspect' && !drawingLines && !onOrigin
      && (e.pointerType === 'mouse' || e.pointerType === 'touch')) {
      const canvasPt = getCanvasPoint(e.nativeEvent);
      const hits = footprintAtPoint(canvasPt.x, canvasPt.y, renderedFootprintsRef.current);

      if (e.pointerType === 'mouse' && e.button === 0) {
        if (hits.length === 1) {
          // Single footprint — navigate immediately (dirty guard via navigateToMap)
          if (store.isDirty) {
            setDirtyGuardTarget(hits[0]);
          } else {
            navigateToMap(hits[0], { saveFirst: false }).catch(console.error);
          }
          return; // intercept — do not dispatch tool
        } else if (hits.length > 1) {
          // Multiple overlapping footprints — show picker
          setPickerCandidates([...hits].sort());
          setPickerPos({ x: e.clientX, y: e.clientY });
          return; // intercept — do not dispatch tool
        }
        // 0 hits: fall through to tool dispatch
      }

      if (e.pointerType === 'touch') {
        if (hits.length === 0) {
          // Touch outside all footprints — dismiss touch tooltip
          setTouchedFootprint(null);
          setTooltipPos(null);
          // fall through to tool dispatch
        } else if (hits.length > 1) {
          // Touch on overlapping footprints — show picker
          setPickerCandidates([...hits].sort());
          setPickerPos({ x: e.clientX, y: e.clientY });
          return; // intercept
        } else {
          // Touch on single footprint
          if (touchedFootprint === hits[0]) {
            // Second tap on same footprint — navigate
            setTouchedFootprint(null);
            setTooltipPos(null);
            if (store.isDirty) {
              setDirtyGuardTarget(hits[0]);
            } else {
              navigateToMap(hits[0], { saveFirst: false }).catch(console.error);
            }
          } else {
            // First tap — show tooltip, store touched
            setTouchedFootprint(hits[0]);
            setTooltipPos({ x: e.clientX + 12, y: e.clientY - 8 });
          }
          return; // intercept
        }
      }
    }

    if (e.button === 2 || (e.pointerType === 'touch' && e.buttons === 2)) {
      // Phase 7: world-set context menu gate (D-01)
      const isCurrentMapInWorldSet =
        !!worldSetStore.activeWorldSetName &&
        !!worldSetStore.activeWorldSet?.nodes.find((n) => n.mapName === mapName);

      // The world set's menu for this point (none outside a world set)
      let openMenu: (() => void) | null = null;
      if (isCurrentMapInWorldSet && store.mapData && tile) {
        const canvasPt = getCanvasPoint(e.nativeEvent);
        const hits = footprintAtPoint(canvasPt.x, canvasPt.y, renderedFootprintsRef.current);
        // Snap to a point object near the pointer, so a child can be put exactly on its marker
        const at = pointerToMap(e.nativeEvent);
        const snapRadius = 12 / store.zoom;
        let snap: { x: number; y: number; name: string } | undefined, snapD = Infinity;
        for (const layer of store.mapData.layers) {
          if (layer.type !== 'objectgroup') continue;
          for (const o of layer.objects) {
            const isPoint = o.point || (o.width === 0 && o.height === 0 && !o.polyline && !o.polygon);
            const d = Math.hypot(seamDelta(store.mapData, at.x, o.x), o.y - at.y);
            if (isPoint && d <= snapRadius && d < snapD) {
              snap = { x: o.x, y: o.y, name: o.name || 'the marker' };
              snapD = d;
            }
          }
        }
        const menu = {
          x: e.clientX,
          y: e.clientY,
          col: tile.col,
          row: tile.row,
          footprintMapName: hits.length > 0 ? hits[0] : undefined,
          mapX: snap?.x ?? at.x,
          mapY: snap?.y ?? at.y,
          snapName: snap?.name,
        };
        openMenu = () => {
          // Dismiss picker first to avoid z-index conflict
          setPickerPos(null);
          setPickerCandidates([]);
          setCanvasCtxMenu(menu);
        };
      }

      const tool = TOOLS[store.selectedTool];
      const pos = pressPos(e.nativeEvent, tool);
      gesturePos.current = pos;
      // Terrain: dragging with the right button erases; a right-click that doesn't move
      // still opens the world set's menu (decided once the pointer moves or lifts)
      if (store.selectedTool === 'terrain' && openMenu) {
        rightGesture.current = { tile, pos, openMenu };
        return;
      }
      if (openMenu) { openMenu(); return; } // do NOT dispatch to tool
      if (tool.onRightPress?.(tile.col, tile.row, store, pos)) isDrawing.current = true;
      return;
    }

    const tool = TOOLS[store.selectedTool];
    const pos = pressPos(e.nativeEvent, tool);
    isDrawing.current = true;
    gesturePos.current = pos;
    tool.onPress(tile.col, tile.row, store, pos, { shift: e.shiftKey });
  }, [store, touchedFootprint, hoveredFootprint]);

  /** Convert to River at a map point: add the stream there as a drawn river (one undo step). */
  function convertStreamAt(pos: { x: number; y: number }): void {
    const v = useViewStore.getState();
    const map = store.mapData;
    const river = streamsRef.current?.at(pos.x, pos.y, _STREAM_PICK_RADIUS_PX / store.zoom) ?? null;
    if (!map || !river) {
      v.setStreamNote('No stream there to convert. Click on one of the blue Flow streams (not one already drawn as a river).');
      return;
    }
    if (store.addLine(river.points, river.classId) === null) return;
    const classes = resolveLineClasses(store.mapWorldSet === activeWorldSetName ? worldSetStore.activeWorldSet?.lineClasses : undefined);
    const name = classForType(river.classId, classes).cls.name;
    const units = resolveUnits(map, defaultUnits);
    const drains = river.catchmentM2 !== null ? `${formatArea(river.catchmentM2, units)} drains into it` : `${river.catchmentSamples.toLocaleString('en-US')} cells drain into it`;
    const ends = river.end === 'water' ? 'down into the water' : river.end === 'river' ? 'to where it joins a drawn river' : "to the map's edge";
    v.setConvertingStream(false);
    v.setStreamNote(`Added a ${name.toLowerCase()} from where it begins ${ends}; ${drains}. Select it to change its type or shape.`);
  }

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    activePointers.current.set(e.pointerId, e.nativeEvent);
    // Map-pixel position for status bar readouts (e.g. elevation under the cursor)
    const pos = pointerToMap(e.nativeEvent);
    if (isDrawing.current) gesturePos.current = pos;
    useCursorStore.getState().setMapPos(offWorld(e.nativeEvent) ? null : pos);

    if (activePointers.current.size === 2 && lastPinchDistance.current !== null) {
      // Pinch-to-zoom
      const newDist = pinchDistance();
      const delta = newDist / lastPinchDistance.current;
      lastPinchDistance.current = newDist;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, store.zoom * delta));
      store.setZoom(newZoom);
      return;
    }

    if (isPanning.current && lastPanPoint.current) {
      const pt = getCanvasPoint(e.nativeEvent);
      const dx = pt.x - lastPanPoint.current.x;
      const dy = pt.y - lastPanPoint.current.y;
      store.setPan({ x: store.pan.x + dx, y: store.pan.y + dy });
      lastPanPoint.current = pt;
      return;
    }

    // Footprint hover tracking (desktop mouse only)
    if (e.pointerType === 'mouse' && store.mapData) {
      const canvasPt = getCanvasPoint(e.nativeEvent);
      const hits = offWorld(e.nativeEvent) ? [] : footprintAtPoint(canvasPt.x, canvasPt.y, renderedFootprintsRef.current);
      const newHovered = hits.length > 0 ? hits[0] : null;
      if (newHovered !== hoveredFootprint) {
        setHoveredFootprint(newHovered);
        // Tooltip
        if (newHovered !== null) {
          const rawX = e.clientX + 12;
          const rawY = e.clientY - 8;
          setTooltipPos({ x: rawX, y: rawY });
        } else {
          setTooltipPos(null);
        }
        requestAnimationFrame(render);
      }
    }

    // Terrain, right button: moving off the first cell turns a right-click into erasing
    const pending = rightGesture.current;
    if (pending) {
      const t = pointerToTile(e.nativeEvent);
      if (t && (t.col !== pending.tile.col || t.row !== pending.tile.row)) {
        rightGesture.current = null;
        if (TOOLS[store.selectedTool].onRightPress?.(pending.tile.col, pending.tile.row, store, pending.pos)) isDrawing.current = true;
      }
    }

    if (!isDrawing.current) return;
    const tile = pointerToTile(e.nativeEvent);
    if (!tile) return;
    const tool = TOOLS[store.selectedTool];
    tool.onDrag(tile.col, tile.row, store, pos);
  }, [store, hoveredFootprint, render]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    activePointers.current.delete(e.pointerId);
    lastPinchDistance.current = null;

    // A right-click that didn't move (Terrain tool): the world set's menu after all
    if (rightGesture.current) {
      const gesture = rightGesture.current;
      rightGesture.current = null;
      gesture.openMenu();
      return;
    }

    if (isPanning.current) {
      isPanning.current = false;
      lastPanPoint.current = null;
      return;
    }

    if (isDrawing.current) {
      isDrawing.current = false;
      const tool = TOOLS[store.selectedTool];
      tool.onRelease(store);
    }
  }, [store]);

  const onWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, store.zoom * delta));

    // Zoom towards the cursor position
    const rect = canvasRef.current!.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const newPan = {
      x: cx - (cx - store.pan.x) * (newZoom / store.zoom),
      y: cy - (cy - store.pan.y) * (newZoom / store.zoom),
    };
    store.setZoom(newZoom);
    store.setPan(newPan);
  }, [store]);

  const cursor = store.mapData
    ? (hoveredFootprint !== null ? 'pointer' : (TOOLS[store.selectedTool]?.cursor ?? 'default'))
    : 'default';

  // Tooltip display helpers
  const tooltipMapName = hoveredFootprint ?? touchedFootprint;
  const tooltipChildren = mapName ? worldSetStore.childrenOf(mapName) : [];
  const tooltipChild = tooltipMapName !== null
    ? tooltipChildren.find(c => c.mapName === tooltipMapName)
    : undefined;
  // Same rule as the overlay: no pre-computed footprint means a scale is missing.
  const tooltipIsPlaceholder = tooltipChild ? !footprintMap.has(tooltipChild.mapName) : false;

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          cursor,
          touchAction: 'none', // prevent browser scroll/zoom interference
          background: '#141414',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => useCursorStore.getState().setMapPos(null)}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* Footprint hover/touch tooltip */}
      {tooltipPos !== null && tooltipMapName !== null && (
        <div
          className="footprint-tooltip"
          style={{ left: tooltipPos.x, top: tooltipPos.y }}
        >
          <div>{tooltipMapName}</div>
          {tooltipIsPlaceholder
            ? <div className="tooltip-warn">No scale set</div>
            : <div className="tooltip-scale">{tooltipChild?.zLabel ?? `Z: ${tooltipChild?.z ?? '?'}`}</div>
          }
        </div>
      )}

      {/* Overlap picker popup */}
      {pickerPos !== null && pickerCandidates.length > 0 && (
        <ul
          ref={pickerRef}
          className="footprint-picker"
          style={{ left: pickerPos.x, top: pickerPos.y }}
        >
          {pickerCandidates.map(name => (
            <li
              key={name}
              onPointerDown={(e) => {
                e.stopPropagation();
                setPickerPos(null);
                setPickerCandidates([]);
                if (store.isDirty) {
                  setDirtyGuardTarget(name);
                } else {
                  navigateToMap(name, { saveFirst: false }).catch(console.error);
                }
              }}
            >
              {name}
            </li>
          ))}
        </ul>
      )}

      {inspecting && (
        <InspectorCard
          footprints={footprintMap}
          onOpenMap={(name) => {
            if (store.isDirty) setDirtyGuardTarget(name);
            else navigateToMap(name, { saveFirst: false }).catch(console.error);
          }}
        />
      )}

      {/* Dirty-map guard modal */}
      {dirtyGuardTarget !== null && (
        <div className="dialog-backdrop" style={{ zIndex: 3000 }}>
          <div className="dialog" style={{ minWidth: 300 }}>
            <div className="dialog-title">Unsaved Changes</div>
            <p style={{ marginBottom: 16, color: '#aaa', fontSize: 13 }}>
              You have unsaved changes. Save before navigating?
            </p>
            <div className="dialog-buttons">
              <button className="btn-secondary" onClick={() => setDirtyGuardTarget(null)}>
                Cancel
              </button>
              <button className="btn-secondary" onClick={() => {
                const target = dirtyGuardTarget;
                setDirtyGuardTarget(null);
                navigateToMap(target, { saveFirst: false }).catch(console.error);
              }}>
                Discard
              </button>
              <button className="btn-primary" onClick={() => {
                const target = dirtyGuardTarget;
                setDirtyGuardTarget(null);
                navigateToMap(target, { saveFirst: true }).catch(console.error);
              }}>
                Save &amp; Navigate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Canvas right-click context menu (Phase 7) */}
      {canvasCtxMenu !== null && (
        <ul
          ref={ctxMenuRef}
          className="canvas-ctx-menu"
          role="menu"
          style={{ left: canvasCtxMenu.x, top: canvasCtxMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <li
            role="menuitem"
            onClick={() => {
              setCanvasCtxMenu(null);
              props.onOpenWorldSetDialog({
                initialView: 'configure',
                initialParentMapName: mapName,
                initialAnchor: { col: canvasCtxMenu.col, row: canvasCtxMenu.row },
                hideParent: true,
              });
            }}
          >
            Add child map here
          </li>
          {(() => {
            // Move a child map so its centre sits exactly here (or on the marker clicked)
            const parentMPU = resolveMetersPerUnit(store.mapData ?? undefined, defaultUnits);
            const movable = (mapName ? worldSetStore.childrenOf(mapName) : []).filter((c) => {
              const data = childMapCacheRef.current.get(cacheKey(c.mapName));
              return c.parentAnchor && data && resolveMetersPerUnit(data, defaultUnits);
            });
            if (!store.mapData || !parentMPU || movable.length === 0) return null;
            const map = store.mapData;
            const where = canvasCtxMenu.snapName ? `to ${canvasCtxMenu.snapName}` : 'here';
            return (
              <>
                <li role="separator" className="separator" />
                {movable.map((c) => (
                  <li
                    key={c.mapName}
                    role="menuitem"
                    title="Centre this child map exactly on this point (saved with the world set)"
                    onClick={async () => {
                      setCanvasCtxMenu(null);
                      const data = childMapCacheRef.current.get(cacheKey(c.mapName))!;
                      const childMPU = resolveMetersPerUnit(data, defaultUnits)!;
                      const { u, v } = pixelToCell(map, canvasCtxMenu.mapX, canvasCtxMenu.mapY);
                      const { anchor, offset } = placementAt(data.width, data.height, childMPU, parentMPU, u, v);
                      worldSetStore.updateNode(c.mapName, { parentAnchor: anchor, parentOffset: offset });
                      await worldSetStore.saveWorldSet();
                    }}
                  >
                    Move {c.mapName} {where}
                  </li>
                ))}
              </>
            );
          })()}
          {canvasCtxMenu.footprintMapName && (
            <>
              <li role="separator" className="separator" />
              <li
                role="menuitem"
                onClick={() => {
                  const fp = canvasCtxMenu.footprintMapName!;
                  setCanvasCtxMenu(null);
                  props.onOpenWorldSetDialog({ initialView: 'configure', initialMapName: fp });
                }}
              >
                Edit {canvasCtxMenu.footprintMapName}…
              </li>
              <li
                role="menuitem"
                className="danger"
                onClick={async () => {
                  const fp = canvasCtxMenu.footprintMapName!;
                  setCanvasCtxMenu(null);
                  worldSetStore.removeNode(fp);
                  await worldSetStore.saveWorldSet();
                }}
              >
                Remove {canvasCtxMenu.footprintMapName} from world set
              </li>
            </>
          )}
        </ul>
      )}
    </>
  );
};
