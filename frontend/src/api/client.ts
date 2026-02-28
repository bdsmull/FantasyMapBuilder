/**
 * API client — typed fetch wrappers for all backend endpoints.
 * The Vite dev server proxies /api to http://localhost:8000.
 * In production the FastAPI server serves both the API and the React build.
 */

import type { TmjMap } from '../types/tmj';

const BASE = '/api';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Maps
// ---------------------------------------------------------------------------

/** List all saved map names (without .tmj extension). */
export async function listMaps(): Promise<string[]> {
  const res = await fetch(`${BASE}/maps`);
  return handleResponse<string[]>(res);
}

/** Load a map from the server by name. */
export async function getMap(name: string): Promise<TmjMap> {
  const res = await fetch(`${BASE}/maps/${encodeURIComponent(name)}`);
  return handleResponse<TmjMap>(res);
}

/** Save (create or overwrite) a map on the server. */
export async function saveMap(name: string, data: TmjMap): Promise<void> {
  const res = await fetch(`${BASE}/maps/${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  await handleResponse<unknown>(res);
}

/** Delete a saved map from the server. */
export async function deleteMap(name: string): Promise<void> {
  const res = await fetch(`${BASE}/maps/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
  await handleResponse<unknown>(res);
}

/**
 * Upload a .tmj file from the browser's file system to the server.
 * Returns the map name that was stored.
 */
export async function uploadMap(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${BASE}/maps/upload`, {
    method: 'POST',
    body: form,
  });
  const result = await handleResponse<{ uploaded: string }>(res);
  return result.uploaded;
}

/** Trigger download of a raw .tmj file from the server. */
export function downloadMapUrl(name: string): string {
  return `${BASE}/maps/${encodeURIComponent(name)}/download`;
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
