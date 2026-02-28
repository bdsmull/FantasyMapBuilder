/**
 * Shared canvas utilities: coordinate conversion and image caching.
 */

import type { TmjMap, TmjTileset, TmjTileEntry } from '../types/tmj';
import { tilesetForGid, localId, tileColor } from '../types/tmj';
import { tilesetImageUrl } from '../api/client';

// ---------------------------------------------------------------------------
// Coordinate helpers
// ---------------------------------------------------------------------------

export interface ViewState {
  zoom: number;
  pan: { x: number; y: number };
}

/**
 * Convert canvas-space pixel coordinates to tile column/row.
 * Returns fractional values; use Math.floor for the cell index.
 */
export function screenToTile(
  px: number,
  py: number,
  view: ViewState,
  tileW: number,
  tileH: number,
): { col: number; row: number } {
  return {
    col: Math.floor((px - view.pan.x) / (tileW * view.zoom)),
    row: Math.floor((py - view.pan.y) / (tileH * view.zoom)),
  };
}

/** Convert tile column/row to canvas-space pixel coordinates (top-left of tile). */
export function tileToScreen(
  col: number,
  row: number,
  view: ViewState,
  tileW: number,
  tileH: number,
): { x: number; y: number } {
  return {
    x: view.pan.x + col * tileW * view.zoom,
    y: view.pan.y + row * tileH * view.zoom,
  };
}

// ---------------------------------------------------------------------------
// Sprite-sheet image cache
// ---------------------------------------------------------------------------

const _imageCache = new Map<string, HTMLImageElement | null>();

/**
 * Load a sprite-sheet image (async, cached).
 * Returns null if the image source is empty or fails to load.
 */
export function loadTilesetImage(
  tileset: TmjTileset,
  onLoad: () => void,
): HTMLImageElement | null {
  const src = tileset.image;
  if (!src) return null;

  if (_imageCache.has(src)) return _imageCache.get(src) ?? null;

  // Start loading
  _imageCache.set(src, null); // mark as in-progress
  const img = new Image();
  img.onload = () => {
    _imageCache.set(src, img);
    onLoad();
  };
  img.onerror = () => {
    _imageCache.set(src, null);
  };
  img.src = tilesetImageUrl(src);
  return null;
}

export function clearImageCache(): void {
  _imageCache.clear();
}

// ---------------------------------------------------------------------------
// Tile lookup
// ---------------------------------------------------------------------------

export interface TileInfo {
  tileset: TmjTileset;
  entry: TmjTileEntry | null;
  color: [number, number, number];
  image: HTMLImageElement | null;
  /** Source rect on the sprite sheet */
  srcX: number;
  srcY: number;
}

export function getTileInfo(
  map: TmjMap,
  gid: number,
  onImageLoad: () => void,
): TileInfo | null {
  if (gid === 0) return null;
  const ts = tilesetForGid(map, gid);
  if (!ts) return null;
  const lid = localId(map, gid);
  const entry = ts.tiles.find((t) => t.id === lid) ?? null;
  const color = entry ? tileColor(entry) : [200, 200, 200] as [number, number, number];
  const image = loadTilesetImage(ts, onImageLoad);
  const srcX = (lid % ts.columns) * ts.tilewidth;
  const srcY = Math.floor(lid / ts.columns) * ts.tileheight;
  return { tileset: ts, entry, color, image, srcX, srcY };
}

// ---------------------------------------------------------------------------
// Object type accent colors (mirror Python tile_renderer.py)
// ---------------------------------------------------------------------------

const OBJECT_TYPE_COLORS: Record<string, string> = {
  npc: 'rgb(255,220,50)',
  enemy: 'rgb(255,80,80)',
  chest: 'rgb(200,160,40)',
  door: 'rgb(150,110,60)',
  trigger: 'rgb(80,200,255)',
  spawn: 'rgb(255,100,200)',
  exit: 'rgb(100,255,150)',
};

export function objectColor(type: string): string {
  return OBJECT_TYPE_COLORS[type.toLowerCase()] ?? 'rgb(220,220,220)';
}
