import type { LineClass } from '../data/lineClasses';

/** A single map's placement within a world set. */
export interface WorldSetNode {
  mapName: string;
  parentMapName: string | null;
  parentAnchor: { col: number; row: number } | null;
  /**
   * Fine position: how far (in parent cells) the child's centre is moved from its
   * default spot (centred on its rounded-up footprint around the anchor cell). Lets a
   * small map sit at an exact point, e.g. a town on its city marker. Absent = 0, 0.
   */
  parentOffset?: { x: number; y: number } | null;
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
