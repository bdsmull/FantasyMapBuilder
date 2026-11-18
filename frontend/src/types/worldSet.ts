import type { LineClass } from '../data/lineClasses';

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
  /** Default unit system for contained maps that don't set their own. Absent = metric. */
  units?: 'metric' | 'imperial';
  /**
   * Height generation (#8 phase 3b): one noise field for the whole world set, so maps
   * generated separately match where they overlap. Absent until something is generated.
   */
  generation?: { seed: number; featureSizeM: number; roughness?: number };
  /** Road and river classes for this world set's maps (#6). Absent = the built-in set. */
  lineClasses?: LineClass[];
  nodes: WorldSetNode[];
}

/** Current world set file format version. */
export const WORLD_SET_VERSION = '1.0';
