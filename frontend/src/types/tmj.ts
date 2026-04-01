/**
 * TypeScript interfaces mirroring the Tiled JSON (.tmj) format.
 * These match exactly what the FastAPI backend reads/writes.
 */

export interface TmjProperty {
  name: string;
  type: 'int' | 'float' | 'bool' | 'string';
  value: number | boolean | string;
}

export interface TmjObject {
  id: number;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  rotation?: number;
  point?: true;
  ellipse?: true;
  polygon?: { x: number; y: number }[];
  gid?: number;
  properties?: TmjProperty[];
}

export interface TmjTileEntry {
  id: number;         // 0-based local tile ID
  type: string;       // tile name
  properties: TmjProperty[];
}

export interface TmjTileset {
  firstgid: number;
  name: string;
  tilewidth: number;
  tileheight: number;
  tilecount: number;
  columns: number;
  spacing?: number;
  margin?: number;
  image?: string;       // absolute path to sprite sheet PNG
  imagewidth?: number;
  imageheight?: number;
  tiles: TmjTileEntry[];
}

export interface TmjTileLayer {
  type: 'tilelayer';
  id?: number;
  name: string;
  width: number;
  height: number;
  visible: boolean;
  opacity: number;
  offsetx: number;
  offsety: number;
  data: number[];   // flat GID array, row-major: data[row * width + col]
}

export interface TmjObjectLayer {
  type: 'objectgroup';
  id?: number;
  name: string;
  visible: boolean;
  opacity: number;
  offsetx: number;
  offsety: number;
  color: string;
  draworder?: string;
  objects: TmjObject[];
}

export type TmjLayer = TmjTileLayer | TmjObjectLayer;

export interface TmjMap {
  tiledversion?: string;
  version?: string;
  type?: string;
  orientation: 'orthogonal' | 'hexagonal';
  renderorder?: string;
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  infinite?: boolean;
  // Hex-specific
  staggeraxis?: 'x' | 'y';
  staggerindex?: string;
  hexsidelength?: number;
  /** Map scale preset ID (from MAP_SCALES in data/mapScales.ts). Optional — older maps omit it. */
  scale?: string;
  nextlayerid: number;
  nextobjectid: number;
  tilesets: TmjTileset[];
  layers: TmjLayer[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function isTileLayer(layer: TmjLayer): layer is TmjTileLayer {
  return layer.type === 'tilelayer';
}

export function isObjectLayer(layer: TmjLayer): layer is TmjObjectLayer {
  return layer.type === 'objectgroup';
}

export function isHexMap(map: TmjMap): boolean {
  return map.orientation === 'hexagonal';
}

/** Find the tileset that owns a given global tile ID. */
export function tilesetForGid(
  map: TmjMap,
  gid: number,
): TmjTileset | null {
  if (gid === 0) return null;
  const sorted = [...map.tilesets].sort((a, b) => b.firstgid - a.firstgid);
  for (const ts of sorted) {
    if (gid >= ts.firstgid) return ts;
  }
  return null;
}

/** Convert a GID to a 0-based local tile ID within its tileset. */
export function localId(map: TmjMap, gid: number): number {
  const ts = tilesetForGid(map, gid);
  return ts ? gid - ts.firstgid : 0;
}

/** Read color_r/g/b from a tile entry's properties. */
export function tileColor(entry: TmjTileEntry): [number, number, number] {
  const props = Object.fromEntries(entry.properties.map((p) => [p.name, p.value]));
  return [
    Number(props['color_r'] ?? 200),
    Number(props['color_g'] ?? 200),
    Number(props['color_b'] ?? 200),
  ];
}
