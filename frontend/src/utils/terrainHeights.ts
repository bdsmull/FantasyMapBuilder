/**
 * Heights from terrain types (#8 phase 3a).
 *
 * A terrain tile can carry two Tiled custom properties (floats, meters):
 *   heightBase   – typical ground height for this terrain
 *   heightRelief – how much the ground varies within it (used by generation, 3b)
 * They live in the world set's shared .tsj tileset, so a type means the same on
 * every map that uses it.
 *
 * "Heights from terrain" sets each height sample from the terrain around it, then
 * smooths across boundaries so different types meet in slopes, not cliffs. Hand-set
 * (masked) samples are kept and hold the surface around them in place; samples with
 * no terrain settings nearby keep their current height.
 */

import type { TmjMap, TmjTileEntry, TmjProperty } from '../types/tmj';
import { isTileLayer } from '../types/tmj';
import type { HeightPatch } from './heightGrid';
import { hexNeighbours } from './heightGrid';

export const TILE_HEIGHT_BASE = 'heightBase';
export const TILE_HEIGHT_RELIEF = 'heightRelief';

/** Height settings of a terrain type, in cm. */
export interface TerrainHeight {
  baseCm: number;
  reliefCm: number;
}

const _GID_MASK = 0x0fffffff; // strip Tiled's flip flags

function _num(props: TmjProperty[] | undefined, name: string): number | null {
  const v = props?.find((p) => p.name === name)?.value;
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** A tile's height settings, or null if it has no base height. */
export function tileTerrainHeight(tile: Pick<TmjTileEntry, 'properties'> | undefined): TerrainHeight | null {
  const base = _num(tile?.properties, TILE_HEIGHT_BASE);
  if (base === null) return null;
  return { baseCm: Math.round(base * 100), reliefCm: Math.round(Math.max(0, _num(tile?.properties, TILE_HEIGHT_RELIEF) ?? 0) * 100) };
}

/** Lookup from a cell's GID to its terrain height settings. */
export function terrainLookup(map: TmjMap): (gid: number) => TerrainHeight | null {
  const byGid = new Map<number, TerrainHeight>();
  for (const ts of map.tilesets) {
    for (const tile of ts.tiles ?? []) {
      const h = tileTerrainHeight(tile);
      if (h) byGid.set(ts.firstgid + tile.id, h);
    }
  }
  return (gid) => (gid ? byGid.get(gid & _GID_MASK) ?? null : null);
}

/** True when any tile in the map's tilesets has a base height. */
export function hasTerrainHeights(map: TmjMap): boolean {
  return map.tilesets.some((ts) => (ts.tiles ?? []).some((t) => tileTerrainHeight(t) !== null));
}

/**
 * Terrain settings per cell (row-major): the topmost tile layer whose tile there has
 * settings, so a layer of roads or buildings without settings shows the terrain under it.
 */
export function cellTerrain(map: TmjMap): (TerrainHeight | null)[] {
  const lookup = terrainLookup(map);
  const cells: (TerrainHeight | null)[] = new Array(map.width * map.height).fill(null);
  const layers = map.layers.filter(isTileLayer);
  for (let i = 0; i < cells.length; i++) {
    for (let l = layers.length - 1; l >= 0; l--) {
      const h = lookup(layers[l].data[i] ?? 0);
      if (h) { cells[i] = h; break; }
    }
  }
  return cells;
}

/** Neighbouring samples of each sample (square: the 4 around a corner; hex: the 6 around a centre). */
export function sampleNeighbours(map: TmjMap, cols: number, rows: number): (i: number) => number[] {
  if (map.orientation === 'hexagonal') {
    // The neighbour pattern depends only on column/row parity (the stagger): work it
    // out once per parity on a small interior grid, then offset it
    const probe = { ...map, width: 6, height: 6 };
    const patterns = new Map<number, [number, number][]>();
    const pattern = (col: number, row: number) => {
      const key = (col & 1) * 2 + (row & 1);
      let p = patterns.get(key);
      if (!p) {
        const pc = 2 + (col & 1), pr = 2 + (row & 1);
        p = hexNeighbours(probe, pc, pr).map((n) => [n.col - pc, n.row - pr] as [number, number]);
        patterns.set(key, p);
      }
      return p;
    };
    return (i) => {
      const col = i % cols, row = (i - col) / cols;
      const out: number[] = [];
      for (const [dc, dr] of pattern(col, row)) {
        const c = col + dc, r = row + dr;
        if (c >= 0 && r >= 0 && c < cols && r < rows) out.push(r * cols + c);
      }
      return out;
    };
  }
  return (i) => {
    const col = i % cols, row = (i - col) / cols;
    const out: number[] = [];
    if (col > 0) out.push(i - 1);
    if (col < cols - 1) out.push(i + 1);
    if (row > 0) out.push(i - cols);
    if (row < rows - 1) out.push(i + cols);
    return out;
  };
}

/** Smoothing passes across terrain boundaries: each blends a sample halfway to its neighbours' average. */
const _SMOOTH_PASSES = 2;

/**
 * A value per height sample taken from the terrain around it: the hex's own type on
 * hex maps, the average of the (up to 4) cells meeting at a corner on square maps.
 * `pick` chooses the value (e.g. base or relief); `has` is 0 where no terrain sets one.
 */
export function terrainSamples(
  map: TmjMap, cols: number, rows: number, pick: (t: TerrainHeight) => number,
): { values: Float64Array; has: Uint8Array } {
  const cells = cellTerrain(map);
  const values = new Float64Array(cols * rows);
  const has = new Uint8Array(cols * rows);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      let sum = 0, n = 0;
      if (map.orientation === 'hexagonal') {
        const t = cells[row * map.width + col];
        if (t) { sum = pick(t); n = 1; }
      } else {
        for (const [dc, dr] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
          const c = col + dc, r = row + dr;
          if (c < 0 || r < 0 || c >= map.width || r >= map.height) continue;
          const t = cells[r * map.width + c];
          if (t) { sum += pick(t); n++; }
        }
      }
      if (n === 0) continue;
      const i = row * cols + col;
      values[i] = sum / n;
      has[i] = 1;
    }
  }
  return { values, has };
}

/** Smooth `values` in place where `free` is set: each pass blends a sample halfway to its neighbours' average. */
export function smoothSamples(
  map: TmjMap, cols: number, rows: number, values: Float64Array | Int32Array, free: Uint8Array, passes = _SMOOTH_PASSES,
): void {
  const neighbours = sampleNeighbours(map, cols, rows);
  for (let pass = 0; pass < passes; pass++) {
    const prev = values.slice();
    for (let i = 0; i < values.length; i++) {
      if (!free[i]) continue;
      const ns = neighbours(i);
      if (ns.length === 0) continue;
      let sum = 0;
      for (const j of ns) sum += prev[j];
      const v = 0.5 * prev[i] + 0.5 * (sum / ns.length);
      values[i] = values instanceof Int32Array ? Math.round(v) : v;
    }
  }
}

/**
 * New heights for the patch from the map's terrain. Returns the heights and how many
 * samples were set from terrain (0 = the map has no terrain settings under any free sample).
 */
export function heightsFromTerrain(map: TmjMap, patch: HeightPatch): { cm: Int32Array; changed: number } {
  const { cols, rows } = patch;
  const { values, has } = terrainSamples(map, cols, rows, (t) => t.baseCm);
  const out = patch.cm.slice();
  const free = new Uint8Array(cols * rows); // set from terrain, and free to smooth
  let changed = 0;
  for (let i = 0; i < out.length; i++) {
    if (patch.mask[i] || !has[i]) continue;
    out[i] = Math.round(values[i]);
    free[i] = 1;
    changed++;
  }
  if (changed > 0) smoothSamples(map, cols, rows, out, free);
  return { cm: out, changed };
}

// ---------------------------------------------------------------------------
// Suggested values for common terrain names
// ---------------------------------------------------------------------------

/** [name keywords, base m, relief m], most specific first. */
const _SUGGESTIONS: [string[], number, number][] = [
  [['deep ocean', 'abyss', 'deep sea'], -3000, 500],
  [['ocean', 'sea'], -200, 50],
  [['lake', 'water', 'river', 'pond'], -2, 1],
  [['swamp', 'marsh', 'bog', 'fen', 'wetland'], 2, 1],
  [['beach', 'coast', 'shore', 'sand'], 2, 1],
  [['flood plain', 'floodplain'], 10, 2],
  [['high mountain', 'peak', 'summit'], 4000, 1000],
  [['volcano'], 2500, 1000],
  [['mountain'], 2000, 800],
  [['highland', 'plateau', 'mesa'], 1000, 200],
  [['hill'], 400, 150],
  [['glacier', 'ice', 'snow', 'tundra'], 200, 50],
  [['dune', 'desert'], 300, 50],
  [['jungle', 'rainforest'], 100, 30],
  [['forest', 'wood'], 200, 50],
  [['plain', 'grass', 'meadow', 'prairie', 'steppe', 'savanna', 'farm', 'field'], 100, 20],
];

/** Suggested [base m, relief m] for a terrain name, or null if it isn't recognised. */
export function suggestTerrainHeight(name: string): { baseM: number; reliefM: number } | null {
  const n = name.toLowerCase();
  for (const [keys, baseM, reliefM] of _SUGGESTIONS) {
    if (keys.some((k) => n.includes(k))) return { baseM, reliefM };
  }
  return null;
}

/** A tile's properties with the height settings replaced (null removes one). */
export function withTerrainHeight(props: TmjProperty[], baseM: number | null, reliefM: number | null): TmjProperty[] {
  const rest = props.filter((p) => p.name !== TILE_HEIGHT_BASE && p.name !== TILE_HEIGHT_RELIEF);
  if (baseM !== null) rest.push({ name: TILE_HEIGHT_BASE, type: 'float', value: baseM });
  if (reliefM !== null) rest.push({ name: TILE_HEIGHT_RELIEF, type: 'float', value: reliefM });
  return rest;
}
