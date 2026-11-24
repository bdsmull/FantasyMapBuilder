import type { WorldSetNode } from '../types/worldSet';
import type { TmjMap } from '../types/tmj';
import { resolveMetersPerUnit } from '../data/mapScales';
import type { UnitSystem } from '../data/mapScales';
import { childRect, detectRectOverlaps } from './worldSetUtils';
import type { RectNode } from './worldSetUtils';
import { wrapsX } from './worldWrap';

/** Per-world-set collapsed-mapName sets. Outer key = world set name. */
export type CollapseState = Record<string, Set<string>>;

export interface WarningContext {
  /** Map data fetched from server, keyed by mapName. Empty entry = not loaded yet. */
  mapDataCache: Record<string, TmjMap>;
  /** Names of all known map files (from listMaps). Used to detect "missing map". */
  knownMapNames: Set<string>;
  /** All nodes in the active world set — used for sibling overlap and parent lookup. */
  allNodes: WorldSetNode[];
  /** The world set's default unit system, for maps that don't set their own. Absent = metric. */
  defaultUnits?: UnitSystem;
  /** Elevation mismatch summaries for the maps whose fit is known, by mapName. */
  elevationMismatch?: Record<string, string>;
  /** Refined-line mismatch summaries for the maps whose lines were checked, by mapName. */
  lineMismatch?: Record<string, string>;
}

export { resolveMetersPerUnit };

/** The map open in the editor: its name, world set and current (possibly unsaved) data. */
export interface OpenMap {
  name: string | null;
  worldSet: string | null;
  data: TmjMap | null;
}

/**
 * The map data warnings are worked out from: the fetched copies, with the open map's
 * live data in place of its copy when it belongs to `worldSetName` (#2). So fixing a
 * map's scale clears its warning, and its children's, without reloading the world set.
 */
export function withOpenMap(cache: Record<string, TmjMap>, open: OpenMap, worldSetName: string | null): Record<string, TmjMap> {
  if (!open.name || !open.data || !worldSetName || open.worldSet !== worldSetName) return cache;
  if (cache[open.name] === open.data) return cache;
  return { ...cache, [open.name]: open.data };
}

/**
 * Returns warning strings for a single node. Empty array = no badge.
 * MUST return [] when mapDataCache[node.mapName] is undefined (Pitfall 2).
 * Warning strings match UI-SPEC Copywriting Contract verbatim.
 */
export function getWarnings(node: WorldSetNode, ctx: WarningContext): string[] {
  const warnings: string[] = [];

  // Missing map check — file not in known list (D-05 fourth issue type)
  if (!ctx.knownMapNames.has(node.mapName)) {
    warnings.push(`Missing map: '${node.mapName}' file not found`);
    return warnings; // No further checks — map data won't be available
  }

  const data = ctx.mapDataCache[node.mapName];
  if (!data) return warnings; // Not loaded yet — show no badge (Pitfall 2)

  const mismatch = ctx.elevationMismatch?.[node.mapName];
  if (mismatch) warnings.push(`Elevation mismatch: ${mismatch}`);
  const lines = ctx.lineMismatch?.[node.mapName];
  if (lines) warnings.push(`Line mismatch: ${lines}`);

  // Missing scale
  const childMPU = resolveMetersPerUnit(data, ctx.defaultUnits);
  if (childMPU == null) {
    warnings.push('Missing scale: no scale set on this map');
  }

  // Scale inversion + overlap require parent + scales
  if (node.parentMapName && childMPU != null) {
    const parentData = ctx.mapDataCache[node.parentMapName];
    const parentMPU = resolveMetersPerUnit(parentData, ctx.defaultUnits);
    if (parentMPU != null) {
      if (childMPU >= parentMPU) {
        warnings.push('Scale inversion: this map is the same size or larger than its parent');
      }

      // Overlap: build candidate + sibling footprints, run detectOverlaps
      if (node.parentAnchor) {
        const candidate: RectNode = {
          mapName: node.mapName,
          z: node.z,
          rect: childRect(data.width, data.height, childMPU, parentMPU, node.parentAnchor, node.parentOffset),
        };
        const siblingFootprints: RectNode[] = [];
        for (const sib of ctx.allNodes) {
          if (sib.mapName === node.mapName) continue;
          if (sib.parentMapName !== node.parentMapName) continue;
          if (sib.z !== node.z) continue;
          if (!sib.parentAnchor) continue;
          const sibData = ctx.mapDataCache[sib.mapName];
          const sibMPU = resolveMetersPerUnit(sibData, ctx.defaultUnits);
          if (!sibData || sibMPU == null) continue;
          siblingFootprints.push({
            mapName: sib.mapName,
            z: sib.z,
            rect: childRect(sibData.width, sibData.height, sibMPU, parentMPU, sib.parentAnchor, sib.parentOffset),
          });
        }
        const overlaps = detectRectOverlaps([candidate, ...siblingFootprints], parentData && wrapsX(parentData) ? parentData.width : undefined);
        for (const [a, b] of overlaps) {
          const other = a === node.mapName ? b : a;
          warnings.push(`Footprint overlap: conflicts with '${other}' at the same Z level`);
        }
      }
    }
  }

  return warnings;
}

/** Toggle a mapName's collapse state in the per-world-set Record. Returns NEW Record (immutable). */
export function toggleCollapse(
  state: CollapseState,
  worldSetName: string,
  mapName: string,
): CollapseState {
  const existing = state[worldSetName] ?? new Set<string>();
  const next = new Set(existing);
  if (next.has(mapName)) next.delete(mapName);
  else next.add(mapName);
  return { ...state, [worldSetName]: next };
}

/** Check if a node is collapsed. Returns false when worldSetName is null/undefined or absent from state. */
export function isNodeCollapsed(
  state: CollapseState,
  worldSetName: string | null,
  mapName: string,
): boolean {
  if (!worldSetName) return false;
  const set = state[worldSetName];
  if (!set) return false;
  return set.has(mapName);
}
