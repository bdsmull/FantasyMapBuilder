/**
 * MapCanvas — the interactive canvas for tile/hex map editing.
 *
 * Uses the Pointer Events API so the same code handles mouse and touch.
 * Pinch-to-zoom is supported via two active pointers.
 *
 * Phase 6: wires footprintOverlay after each render, tracks hover/touch
 * state, handles click-to-navigate (desktop) and two-tap model (iPad).
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useMapStore } from '../store/mapStore';
import { renderTileMap } from '../canvas/tileRenderer';
import { renderHexMap, pixelToHex, clearHexTileCache } from '../canvas/hexRenderer';
import { screenToTile } from '../canvas/canvasUtils';
import type { Tool } from '../tools/baseTool';
import { paintTool } from '../tools/paintTool';
import { eraseTool } from '../tools/eraseTool';
import { fillTool } from '../tools/fillTool';
import { pointTool } from '../tools/pointTool';
import { renderFootprintOverlay, footprintAtPoint, computeFootprint } from '../canvas/footprintOverlay';
import type { RenderedFootprint } from '../canvas/footprintOverlay';
import type { Footprint } from '../utils/worldSetUtils';
import { useWorldSetStore } from '../store/worldSetStore';
import { navigateToMap } from '../utils/navigation';
import { getMap } from '../api/client';
import { MAP_SCALE_BY_ID } from '../data/mapScales';
import type { OpenWorldSetDialogArgs } from './WorldHierarchyPanel';

const TOOLS: Record<string, Tool> = {
  paint: paintTool,
  erase: eraseTool,
  fill: fillTool,
  point: pointTool,
};

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 16;
const ZOOM_STEP = 1.2;

interface MapCanvasProps {
  onOpenWorldSetDialog: (args: OpenWorldSetDialogArgs) => void;
}

export const MapCanvas: React.FC<MapCanvasProps> = (props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const store = useMapStore();
  const activePointers = useRef<Map<number, PointerEvent>>(new Map());
  const lastPinchDistance = useRef<number | null>(null);
  const isPanning = useRef(false);
  const lastPanPoint = useRef<{ x: number; y: number } | null>(null);
  const isDrawing = useRef(false);

  // World set store and current map name
  const worldSetStore = useWorldSetStore();
  const mapName = store.mapName;

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
  } | null;
  const [canvasCtxMenu, setCanvasCtxMenu] = useState<CanvasCtxMenuState>(null);
  const ctxMenuRef = useRef<HTMLUListElement>(null);

  // Pre-computed footprint map: child mapName → tile-space Footprint on the parent grid.
  // Rebuilt whenever the children list or parent feetPerUnit changes.
  const [footprintMap, setFootprintMap] = useState<Map<string, Footprint>>(new Map());
  // Cache of fetched child TmjMap data so we don't re-fetch on every hover re-render.
  const childMapCacheRef = useRef<Map<string, import('../types/tmj').TmjMap>>(new Map());

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx || !store.mapData) return;

    const view = { zoom: store.zoom, pan: store.pan };
    const opts = {
      view,
      showGrid: store.showGrid,
      onImageLoad: () => { clearHexTileCache(); requestAnimationFrame(render); },
    };

    if (store.mapData.orientation === 'hexagonal') {
      renderHexMap(ctx, store.mapData, opts);
    } else {
      renderTileMap(ctx, store.mapData, opts);
    }

    // Footprint overlay pass — must come after tile/hex render
    const children = mapName ? worldSetStore.childrenOf(mapName) : [];
    if (children.length > 0 && store.mapData) {
      renderedFootprintsRef.current = renderFootprintOverlay(
        ctx,
        children,
        store.mapData,
        view,
        hoveredFootprint,
        footprintMap,
      );
    } else {
      renderedFootprintsRef.current = [];
    }
  }, [store.mapData, store.zoom, store.pan, store.showGrid, hoveredFootprint, worldSetStore, mapName, footprintMap]);

  // Fetch child map data and pre-compute footprints whenever the children or
  // parent feetPerUnit changes. Results are cached so navigation doesn't re-fetch.
  useEffect(() => {
    const md = store.mapData;
    const parentFPU = md?.feetPerUnit ?? (md?.scale ? MAP_SCALE_BY_ID[md.scale]?.feetPerUnit : undefined);
    if (!mapName || !parentFPU) {
      setFootprintMap(new Map());
      return;
    }
    const children = worldSetStore.childrenOf(mapName).filter((c) => c.parentAnchor !== null);
    if (children.length === 0) {
      setFootprintMap(new Map());
      return;
    }

    const toFetch = children.filter((c) => !childMapCacheRef.current.has(c.mapName));
    let cancelled = false;

    const buildMap = () => {
      if (cancelled) return;
      const fp = new Map<string, Footprint>();
      for (const child of children) {
        if (!child.parentAnchor) continue;
        const data = childMapCacheRef.current.get(child.mapName);
        const childFPU = data?.feetPerUnit ?? (data?.scale ? MAP_SCALE_BY_ID[data.scale]?.feetPerUnit : undefined);
        if (!data || !childFPU) continue;
        fp.set(child.mapName, computeFootprint(
          data.width, data.height, childFPU, parentFPU, child.parentAnchor,
        ));
      }
      setFootprintMap(fp);
    };

    if (toFetch.length === 0) {
      buildMap();
      return;
    }

    Promise.all(toFetch.map((c) => getMap(c.mapName).then((d) => [c.mapName, d] as const)))
      .then((entries) => {
        if (cancelled) return;
        for (const [name, data] of entries) childMapCacheRef.current.set(name, data);
        buildMap();
      })
      .catch(() => { if (!cancelled) setFootprintMap(new Map()); });

    return () => { cancelled = true; };
  }, [mapName, worldSetStore, store.mapData?.feetPerUnit, store.mapData?.scale]);

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

  function pointerToTile(e: PointerEvent): { col: number; row: number } | null {
    const { mapData, zoom, pan } = store;
    if (!mapData) return null;
    const pt = getCanvasPoint(e);

    if (mapData.orientation === 'hexagonal') {
      const hexSize = ((mapData.hexsidelength ?? 40) + mapData.tilewidth / 2) * zoom;
      return pixelToHex(
        pt.x - pan.x,
        pt.y - pan.y,
        hexSize,
        mapData.staggeraxis ?? 'x',
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
      tool.onRelease(store);
      return;
    }

    if (e.button === 1 || e.buttons === 4) {
      // Middle button → pan
      isPanning.current = true;
      lastPanPoint.current = getCanvasPoint(e.nativeEvent);
      return;
    }

    const tile = pointerToTile(e.nativeEvent);
    if (!tile) return;

    // Footprint interception — runs before tool dispatch
    if (store.mapData && (e.pointerType === 'mouse' || e.pointerType === 'touch')) {
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

      if (isCurrentMapInWorldSet && store.mapData && tile) {
        const canvasPt = getCanvasPoint(e.nativeEvent);
        const hits = footprintAtPoint(canvasPt.x, canvasPt.y, renderedFootprintsRef.current);
        // Dismiss picker first to avoid z-index conflict
        setPickerPos(null);
        setPickerCandidates([]);
        setCanvasCtxMenu({
          x: e.clientX,
          y: e.clientY,
          col: tile.col,
          row: tile.row,
          footprintMapName: hits.length > 0 ? hits[0] : undefined,
        });
        return; // gate passed — do NOT dispatch to tool
      }

      // Gate failed — existing behavior
      const tool = TOOLS[store.selectedTool];
      tool.onRightPress?.(tile.col, tile.row, store);
      return;
    }

    isDrawing.current = true;
    const tool = TOOLS[store.selectedTool];
    tool.onPress(tile.col, tile.row, store);
  }, [store, touchedFootprint, hoveredFootprint]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    activePointers.current.set(e.pointerId, e.nativeEvent);

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
      const hits = footprintAtPoint(canvasPt.x, canvasPt.y, renderedFootprintsRef.current);
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

    if (!isDrawing.current) return;
    const tile = pointerToTile(e.nativeEvent);
    if (!tile) return;
    const tool = TOOLS[store.selectedTool];
    tool.onDrag(tile.col, tile.row, store);
  }, [store, hoveredFootprint, render]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    activePointers.current.delete(e.pointerId);
    lastPinchDistance.current = null;

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
  const tooltipIsPlaceholder = tooltipChild ? !store.mapData?.feetPerUnit : false;

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
