import type { WorldSetNode } from '../types/worldSet';
import type { TmjMap } from '../types/tmj';
import { MAP_SCALE_BY_ID } from '../data/mapScales';
import { computeFootprint, detectOverlaps } from './worldSetUtils';
import type { FootprintedNode } from './worldSetUtils';

/** Per-world-set collapsed-mapName sets. Outer key = world set name. */
export type CollapseState = Record<string, Set<string>>;

export interface WarningContext {
  /** Map data fetched from server, keyed by mapName. Empty entry = not loaded yet. */
  mapDataCache: Record<string, TmjMap>;
  /** Names of all known map files (from listMaps). Used to detect "missing map". */
  knownMapNames: Set<string>;
  /** All nodes in the active world set — used for sibling overlap and parent lookup. */
  allNodes: WorldSetNode[];
}

/** Resolve feetPerUnit from a TmjMap, falling back to MAP_SCALE_BY_ID[scale]. */
export function resolveFeetPerUnit(data: TmjMap | undefined): number | undefined {
  if (!data) return undefined;
  if (data.feetPerUnit != null) return data.feetPerUnit;
  if (data.scale && MAP_SCALE_BY_ID[data.scale]) return MAP_SCALE_BY_ID[data.scale].feetPerUnit;
  return undefined;
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

  // Missing scale
  const childFPU = resolveFeetPerUnit(data);
  if (childFPU == null) {
    warnings.push('Missing scale: no feetPerUnit set on this map');
  }

  // Scale inversion + overlap require parent + scales
  if (node.parentMapName && childFPU != null) {
    const parentData = ctx.mapDataCache[node.parentMapName];
    const parentFPU = resolveFeetPerUnit(parentData);
    if (parentFPU != null) {
      if (childFPU >= parentFPU) {
        warnings.push('Scale inversion: this map is the same size or larger than its parent');
      }

      // Overlap: build candidate + sibling footprints, run detectOverlaps
      if (node.parentAnchor) {
        const candidate: FootprintedNode = {
          mapName: node.mapName,
          z: node.z,
          footprint: computeFootprint(data.width, data.height, childFPU, parentFPU, node.parentAnchor),
        };
        const siblingFootprints: FootprintedNode[] = [];
        for (const sib of ctx.allNodes) {
          if (sib.mapName === node.mapName) continue;
          if (sib.parentMapName !== node.parentMapName) continue;
          if (sib.z !== node.z) continue;
          if (!sib.parentAnchor) continue;
          const sibData = ctx.mapDataCache[sib.mapName];
          const sibFPU = resolveFeetPerUnit(sibData);
          if (!sibData || sibFPU == null) continue;
          siblingFootprints.push({
            mapName: sib.mapName,
            z: sib.z,
            footprint: computeFootprint(sibData.width, sibData.height, sibFPU, parentFPU, sib.parentAnchor),
          });
        }
        const overlaps = detectOverlaps([candidate, ...siblingFootprints]);
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
