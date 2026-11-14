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

/** Save (create or overwrite) a map in a world set. */
export async function saveMap(worldSet: string, name: string, data: TmjMap): Promise<void> {
  const res = await fetch(mapUrl(worldSet, name), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mapToFile(data)),
  });
  await handleResponse<unknown>(res);
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
 * Return the URL for serving a tileset image.
 * `imagePath` is the absolute server-side path stored in the TMJ file.
 */
export function tilesetImageUrl(imagePath: string): string {
  // Strip leading slashes/drive letters for the path segment
  return `${BASE}/tilesets/${encodeURIComponent(imagePath)}`;
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
