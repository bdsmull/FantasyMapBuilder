import { useMemo } from 'react';
import { useMapStore } from '../store/mapStore';
import { useCrossScaleStore } from '../store/crossScaleStore';
import { surfaceKey } from '../store/worldSurfaceStore';
import { checkRefinements } from '../utils/lineFit';
import type { RefinementCheck } from '../utils/lineFit';

/**
 * Refined-line checks for the open map (#6): its copies of ancestors' lines, and
 * descendants' copies of its own lines. Recomputed when the map's layers change.
 */
export function useRefinementChecks(): RefinementCheck[] {
  const mapName = useMapStore((s) => s.mapName);
  const mapWorldSet = useMapStore((s) => s.mapWorldSet);
  const layers = useMapStore((s) => s.mapData?.layers);
  const cross = useCrossScaleStore();
  return useMemo(() => {
    const map = useMapStore.getState().mapData;
    if (!map || cross.key !== surfaceKey(mapWorldSet, mapName) || cross.related.length === 0) return [];
    return checkRefinements(mapName, map, cross.related);
  }, [layers, cross, mapName, mapWorldSet]); // eslint-disable-line react-hooks/exhaustive-deps
}
