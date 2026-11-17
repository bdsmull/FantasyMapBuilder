import { useMemo } from 'react';
import { useMapStore } from '../store/mapStore';
import { useWorldSetStore } from '../store/worldSetStore';
import { useWorldSurfaceStore, surfaceKey } from '../store/worldSurfaceStore';
import { resolveUnits } from '../data/mapScales';
import type { UnitSystem } from '../data/mapScales';
import { bandIntervalCm, formatHeight } from '../utils/heightGrid';
import { edgeFit, isMismatch } from '../utils/elevationFit';
import type { EdgeFit } from '../utils/elevationFit';

export interface FitReport {
  fit: EdgeFit;
  mismatch: boolean;
  parentName: string;
  /** e.g. "edges average 180 m below 'region'" */
  summary: string;
}

/** Plain-language summary of how a child's edges sit against its parent. */
export function describeFit(fit: EdgeFit, parentName: string, units: UnitSystem): string {
  const size = formatHeight(Math.round(fit.meanAbsDiffCm), units);
  if (Math.round(fit.meanAbsDiffCm) === 0) return `edges match '${parentName}'`;
  if (Math.abs(fit.meanDiffCm) >= 0.5 * fit.meanAbsDiffCm && fit.meanAbsDiffCm > 0) {
    return `edges average ${size} ${fit.meanDiffCm > 0 ? 'below' : 'above'} '${parentName}'`;
  }
  return `edges differ from '${parentName}' by ${size} on average`;
}

/**
 * How the open map fits its parent (`self`), and how its child maps fit it
 * (`children`, by name). Recomputed after each completed edit, not during strokes.
 */
export function useEdgeFits(): { self: FitReport | null; children: Record<string, FitReport> } {
  // Geometry and scale only: tile edits update mapData on every cell painted
  const geometry = useMapStore((s) => s.mapData && [s.mapData.orientation, s.mapData.width, s.mapData.height,
    s.mapData.tilewidth, s.mapData.tileheight, s.mapData.hexsidelength, s.mapData.staggeraxis, s.mapData.staggerindex,
    s.mapData.scale, s.mapData.units, s.mapData.metersPerUnit].join('|'));
  const mapName = useMapStore((s) => s.mapName);
  const mapWorldSet = useMapStore((s) => s.mapWorldSet);
  const heights = useMapStore((s) => s.heights);
  const past = useMapStore((s) => s.past);
  const future = useMapStore((s) => s.future);
  const defaultUnits = useWorldSetStore((s) => s.activeWorldSet?.units);
  const surface = useWorldSurfaceStore();
  const key = surfaceKey(mapWorldSet, mapName);

  return useMemo(() => {
    const mapData = useMapStore.getState().mapData;
    const result: { self: FitReport | null; children: Record<string, FitReport> } = { self: null, children: {} };
    if (!mapData || !heights) return result;
    const parent = surface.parentKey === key ? surface.parent : null;
    if (parent) {
      const fit = edgeFit(mapData, heights, parent.place, parent.map, parent.patch);
      if (fit) {
        result.self = {
          fit, parentName: parent.name, mismatch: isMismatch(fit, parent.intervalCm),
          summary: describeFit(fit, parent.name, resolveUnits(mapData, defaultUnits)),
        };
      }
    }
    if (surface.key === key) {
      const interval = bandIntervalCm(mapData.scale, resolveUnits(mapData, defaultUnits));
      for (const { node, place } of surface.children) {
        const fit = edgeFit(node.map, node.patch, place, mapData, heights);
        if (!fit) continue;
        result.children[node.name] = {
          fit, parentName: mapName, mismatch: isMismatch(fit, interval),
          summary: describeFit(fit, mapName, resolveUnits(node.map, defaultUnits)),
        };
      }
    }
    return result;
    // `past`/`future` change when an edit completes or is undone: heights are edited in place
  }, [geometry, heights, past, future, surface, key, mapName, defaultUnits]); // eslint-disable-line react-hooks/exhaustive-deps
}
