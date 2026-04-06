/** A single map's placement within a world set. */
export interface WorldSetNode {
  mapName: string;
  parentMapName: string | null;
  parentAnchor: { col: number; row: number } | null;
  z: number;
  zLabel?: string | null;
}

/** A named collection of map nodes forming a hierarchical world. */
export interface WorldSet {
  name: string;
  version: string;    // "1.0"
  nodes: WorldSetNode[];
}

/** Current world set file format version. */
export const WORLD_SET_VERSION = '1.0';
