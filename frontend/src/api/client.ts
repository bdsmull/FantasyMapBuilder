/**
 * API client — typed fetch wrappers for all backend endpoints.
 * The Vite dev server proxies /api to http://localhost:8000.
 * In production the FastAPI server serves both the API and the React build.
 */

import type { TmjMap } from '../types/tmj';
import type { WorldSet } from '../types/worldSet';
import { mapFromFile, mapToFile } from './tmjFile';

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
