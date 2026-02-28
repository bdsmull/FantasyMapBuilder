/**
 * MapCanvas — the interactive canvas for tile/hex map editing.
 *
 * Uses the Pointer Events API so the same code handles mouse and touch.
 * Pinch-to-zoom is supported via two active pointers.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { useMapStore } from '../store/mapStore';
import { renderTileMap } from '../canvas/tileRenderer';
import { renderHexMap } from '../canvas/hexRenderer';
import { screenToTile } from '../canvas/canvasUtils';
import type { Tool } from '../tools/baseTool';
import { paintTool } from '../tools/paintTool';
import { eraseTool } from '../tools/eraseTool';
import { fillTool } from '../tools/fillTool';
import { pointTool } from '../tools/pointTool';

const TOOLS: Record<string, Tool> = {
  paint: paintTool,
  erase: eraseTool,
  fill: fillTool,
  point: pointTool,
};

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 16;
const ZOOM_STEP = 1.2;

export const MapCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const store = useMapStore();
  const activePointers = useRef<Map<number, PointerEvent>>(new Map());
  const lastPinchDistance = useRef<number | null>(null);
  const isPanning = useRef(false);
  const lastPanPoint = useRef<{ x: number; y: number } | null>(null);
  const isDrawing = useRef(false);

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
      onImageLoad: () => requestAnimationFrame(render),
    };

    if (store.mapData.orientation === 'hexagonal') {
      renderHexMap(ctx, store.mapData, opts);
    } else {
      renderTileMap(ctx, store.mapData, opts);
    }
  }, [store.mapData, store.zoom, store.pan, store.showGrid]);

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

    if (e.button === 2 || (e.pointerType === 'touch' && e.buttons === 2)) {
      // Right-click or secondary touch
      const tool = TOOLS[store.selectedTool];
      tool.onRightPress?.(tile.col, tile.row, store);
      return;
    }

    isDrawing.current = true;
    const tool = TOOLS[store.selectedTool];
    tool.onPress(tile.col, tile.row, store);
  }, [store]);

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

    if (!isDrawing.current) return;
    const tile = pointerToTile(e.nativeEvent);
    if (!tile) return;
    const tool = TOOLS[store.selectedTool];
    tool.onDrag(tile.col, tile.row, store);
  }, [store]);

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

  const cursor = store.mapData ? (TOOLS[store.selectedTool]?.cursor ?? 'default') : 'default';

  return (
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
  );
};
