/**
 * API client — typed fetch wrappers for all backend endpoints.
 * The Vite dev server proxies /api to http://localhost:8000.
 * In production the FastAPI server serves both the API and the React build.
 */

import type { TmjMap } from '../types/tmj';
import type { WorldSet } from '../types/worldSet';
import { mapFromFile, mapToFile } from './tmjFile';
import type { HeightPatch } from '../utils/heightGrid';

const BASE = '/api';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Maps — every map lives in a world set's folder
// ---------------------------------------------------------------------------

/** A map and the world set it belongs to. */
export interface MapRef {
  worldSet: string;
  name: string;
}

function mapsUrl(worldSet: string): string {
  return `${BASE}/world_sets/${encodeURIComponent(worldSet)}/maps`;
}

function mapUrl(worldSet: string, name: string): string {
  return `${mapsUrl(worldSet)}/${encodeURIComponent(name)}`;
}

/** List a world set's map names (placed and unplaced, without .tmj extension). */
export async function listMaps(worldSet: string): Promise<string[]> {
  return handleResponse<string[]>(await fetch(mapsUrl(worldSet)));
}

/** List every map in every world set, sorted by world set then name. */
export async function listAllMaps(): Promise<MapRef[]> {
  return handleResponse<MapRef[]>(await fetch(`${BASE}/maps`));
}

/** Load a map from a world set. */
export async function getMap(worldSet: string, name: string): Promise<TmjMap> {
  return mapFromFile(await handleResponse<TmjMap>(await fetch(mapUrl(worldSet, name))));
}

/** Where the server stored one of a saved map's tilesets. */
export interface TilesetRef {
  firstgid: number;
  source: string;
  name: string;
}

/**
 * Save (create or overwrite) a map in a world set. Its tilesets are written to
 * the world set's shared tileset files; the result says where each one went.
 */
export async function saveMap(worldSet: string, name: string, data: TmjMap): Promise<TilesetRef[]> {
  const res = await fetch(mapUrl(worldSet, name), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mapToFile(data)),
  });
  const result = await handleResponse<{ tilesets?: TilesetRef[] }>(res);
  return result.tilesets ?? [];
}

/** Record where each tileset was stored (from saveMap), so later saves update the same files. */
export function applyTilesetRefs(data: TmjMap, refs: TilesetRef[]): TmjMap {
  if (refs.length === 0) return data;
  const byGid = new Map(refs.map((r) => [r.firstgid, r]));
  return {
    ...data,
    tilesets: data.tilesets.map((ts) => {
      const ref = byGid.get(ts.firstgid);
      return ref && (ref.source !== ts.source || ref.name !== ts.name)
        ? { ...ts, source: ref.source, name: ref.name }
        : ts;
    }),
  };
}

/** Delete a map from a world set. */
export async function deleteMap(worldSet: string, name: string): Promise<void> {
  await handleResponse<unknown>(await fetch(mapUrl(worldSet, name), { method: 'DELETE' }));
}

/**
 * Upload a .tmj file from the browser's file system into a world set.
 * Returns the map name that was stored.
 */
export async function uploadMap(worldSet: string, file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${mapsUrl(worldSet)}/upload`, { method: 'POST', body: form });
  const result = await handleResponse<{ uploaded: string }>(res);
  return result.uploaded;
}

/** URL that downloads a map's raw .tmj file. */
export function downloadMapUrl(worldSet: string, name: string): string {
  return `${mapUrl(worldSet, name)}/download`;
}

// ---------------------------------------------------------------------------
// Tilesets
// ---------------------------------------------------------------------------

/**
 * Return the URL for loading a tileset image. Images stored with the world set
 * already are API URLs; legacy maps hold an absolute filesystem path instead.
 */
export function tilesetImageUrl(imagePath: string): string {
  if (imagePath.startsWith(`${BASE}/`)) return imagePath;
  return `${BASE}/tilesets/${encodeURIComponent(imagePath)}`;
}

/** Upload a sprite-sheet image into a world set; returns the URL to use as the tileset image. */
export async function uploadTilesetImage(worldSet: string, file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${BASE}/world_sets/${encodeURIComponent(worldSet)}/tilesets/images`, {
    method: 'POST',
    body: form,
  });
  return (await handleResponse<{ image: string }>(res)).image;
}

// ---------------------------------------------------------------------------
// World Sets
// ---------------------------------------------------------------------------

/** List all saved world set names (without .worldset.json extension). */
export async function listWorldSets(): Promise<string[]> {
  const res = await fetch(`${BASE}/world_sets`);
  return handleResponse<string[]>(res);
}

/** Load a world set from the server by name. */
export async function getWorldSet(name: string): Promise<WorldSet> {
  const res = await fetch(`${BASE}/world_sets/${encodeURIComponent(name)}`);
  return handleResponse<WorldSet>(res);
}

/** Save (create or overwrite) a world set on the server. */
export async function saveWorldSet(name: string, data: WorldSet): Promise<void> {
  const res = await fetch(`${BASE}/world_sets/${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  await handleResponse<unknown>(res);
}

/** Delete a world set: the server moves its folder, maps included, to <data>/.trash/. */
export async function deleteWorldSet(name: string): Promise<void> {
  const res = await fetch(`${BASE}/world_sets/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
  await handleResponse<unknown>(res);
}


/** Location of the server's world set data folder, for display. */
export async function getDataDir(): Promise<string> {
  const result = await handleResponse<{ dataDir: string }>(await fetch(`${BASE}/data_dir`));
  return result.dataDir;
}

// ---------------------------------------------------------------------------
// .mapset packages — a whole world set as one file
// ---------------------------------------------------------------------------

/** URL that downloads a world set as <name>.mapset. */
export function mapsetDownloadUrl(worldSet: string): string {
  return `${BASE}/mapsets/${encodeURIComponent(worldSet)}`;
}

export type ImportMapsetResult =
  | { ok: true; imported: string; maps: string[] }
  /** A world set with that name already exists; retry with another name. */
  | { ok: false; conflict: string };

/** Import a .mapset as a new world set, optionally under a different name. */
export async function importMapset(file: File, name?: string): Promise<ImportMapsetResult> {
  const form = new FormData();
  form.append('file', file);
  if (name) form.append('name', name);
  const res = await fetch(`${BASE}/mapsets`, { method: 'POST', body: form });
  if (res.status === 409) {
    const body = await res.json().catch(() => ({ detail: 'A world set with that name already exists' }));
    return { ok: false, conflict: String(body.detail) };
  }
  const result = await handleResponse<{ imported: string; maps: string[] }>(res);
  return { ok: true, ...result };
}

// ---------------------------------------------------------------------------
// Importing a single map (with its tilesets) into a world set
// ---------------------------------------------------------------------------

/** Where to import from: another world set, or a .mapset staged by inspectMapset(). */
export type ImportSource = { worldSet: string } | { staging: string };

export interface TilesetImportPlan {
  name: string;
  /** new: will be added; identical: target already has it; conflict: same name, different tiles */
  status: 'new' | 'identical' | 'conflict';
  /** Conflicts only: merging is possible (both color-only, same tile size). */
  canMerge?: boolean;
  summary?: {
    targetTiles: number;
    importedTiles: number;
    sameTiles: number;
    differingTiles: { id: number; target: string; imported: string }[];
    onlyImported: number[];
  };
}

export interface MapImportPlan {
  map: string;
  mapExists: boolean;
  tilesets: TilesetImportPlan[];
  /** Units the map will be pinned to so it keeps its size, if the world sets' defaults differ. */
  unitsPinned: 'metric' | 'imperial' | null;
}

export type TilesetChoice = 'merge' | 'keep_both' | 'use_target';

/** Unpack a .mapset on the server so single maps can be imported from it (valid for an hour). */
export async function inspectMapset(file: File): Promise<{ staging: string; worldSet: string; maps: string[] }> {
  const form = new FormData();
  form.append('file', file);
  return handleResponse(await fetch(`${BASE}/mapsets/inspect`, { method: 'POST', body: form }));
}

function importUrl(target: string): string {
  return `${BASE}/world_sets/${encodeURIComponent(target)}/import_map`;
}

/** What importing `map` from `source` into world set `target` would involve. */
export async function planMapImport(target: string, source: ImportSource, map: string): Promise<MapImportPlan> {
  const res = await fetch(`${importUrl(target)}/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, map }),
  });
  return handleResponse<MapImportPlan>(res);
}

/** Import a map (unplaced) into world set `target`, resolving tileset conflicts as chosen. */
export async function importMap(
  target: string,
  source: ImportSource,
  map: string,
  newName: string,
  tilesetChoices: Record<string, TilesetChoice>,
): Promise<{ imported: string }> {
  const res = await fetch(importUrl(target), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, map, newName, tilesetChoices }),
  });
  return handleResponse<{ imported: string }>(res);
}

// ---------------------------------------------------------------------------
// Elevation — binary: cols*rows little-endian int32 cm, then cols*rows mask bytes
// ---------------------------------------------------------------------------

function heightsUrl(worldSet: string, name: string): string {
  return `${BASE}/world_sets/${encodeURIComponent(worldSet)}/heights/${encodeURIComponent(name)}`;
}

/** Load a map's height patch; null if the map has none. */
export async function getHeights(worldSet: string, name: string): Promise<HeightPatch | null> {
  const res = await fetch(heightsUrl(worldSet, name));
  if (res.status === 404) return null;
  if (!res.ok) await handleResponse<unknown>(res);
  const cols = Number(res.headers.get('X-Height-Cols'));
  const rows = Number(res.headers.get('X-Height-Rows'));
  const buffer = await res.arrayBuffer();
  const n = cols * rows;
  if (!n || buffer.byteLength !== n * 5) throw new Error('Unexpected elevation data from the server');
  const view = new DataView(buffer);
  const cm = new Int32Array(n);
  for (let i = 0; i < n; i++) cm[i] = view.getInt32(i * 4, true);
  return { cols, rows, cm, mask: new Uint8Array(buffer.slice(n * 4)) };
}

/** Store a map's height patch. */
export async function putHeights(worldSet: string, name: string, patch: HeightPatch): Promise<void> {
  const n = patch.cols * patch.rows;
  const buffer = new ArrayBuffer(n * 5);
  const view = new DataView(buffer);
  for (let i = 0; i < n; i++) view.setInt32(i * 4, patch.cm[i], true);
  new Uint8Array(buffer, n * 4).set(patch.mask);
  const res = await fetch(heightsUrl(worldSet, name), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Height-Cols': String(patch.cols),
      'X-Height-Rows': String(patch.rows),
    },
    body: buffer,
  });
  await handleResponse<unknown>(res);
}

/** Remove a map's height patch (no error if it had none). */
export async function deleteHeights(worldSet: string, name: string): Promise<void> {
  const res = await fetch(heightsUrl(worldSet, name), { method: 'DELETE' });
  if (res.status !== 404) await handleResponse<unknown>(res);
}

// ---------------------------------------------------------------------------
// Heightmap images for game engines (#46) — the server only packs and unpacks
// ---------------------------------------------------------------------------

/** Wrap 16-bit steps (row-major, top row first) in a grayscale PNG, with `info` inside it. */
export async function encodeHeightmapPng(
  steps: Uint16Array, width: number, height: number, info: object,
): Promise<Blob> {
  const bytes = new Uint8Array(steps.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < steps.length; i++) view.setUint16(i * 2, steps[i], true);
  const form = new FormData();
  form.append('values', new Blob([bytes], { type: 'application/octet-stream' }), 'values.bin');
  form.append('width', String(width));
  form.append('height', String(height));
  form.append('info', JSON.stringify(info));
  const res = await fetch(`${BASE}/heightmaps/png`, { method: 'POST', body: form });
  if (!res.ok) await handleResponse<unknown>(res);
  return res.blob();
}

/** How the server laid out a decoded image's samples, and what the file said about itself. */
export interface DecodedHeightmapInfo {
  sample: 'u8' | 'u16' | 'f32';
  /** The heightmap text embedded in a PNG this editor exported, if any. */
  metadata: Record<string, unknown> | null;
  /** 32-bit images: their own lowest and highest values. */
  rawMin?: number;
  rawMax?: number;
}

/** Unpack a heightmap image (PNG, TIFF, …) into its samples. */
export async function decodeHeightmap(
  file: Blob,
): Promise<{ width: number; height: number; samples: ArrayBuffer; info: DecodedHeightmapInfo }> {
  const form = new FormData();
  form.append('file', file, 'heightmap');
  const res = await fetch(`${BASE}/heightmaps/decode`, { method: 'POST', body: form });
  if (!res.ok) await handleResponse<unknown>(res);
  return {
    width: Number(res.headers.get('X-Heightmap-Width')),
    height: Number(res.headers.get('X-Heightmap-Height')),
    info: JSON.parse(res.headers.get('X-Heightmap-Info') ?? '{}') as DecodedHeightmapInfo,
    samples: await res.arrayBuffer(),
  };
}
