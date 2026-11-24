import { useEffect } from 'react';
import { useMapStore } from '../store/mapStore';
import { useWorldSetStore } from '../store/worldSetStore';
import { useCeilingStore } from '../store/ceilingStore';
import { surfaceKey } from '../store/worldSurfaceStore';
import { getMap, getHeights } from '../api/client';
import { resolveMetersPerUnit } from '../data/mapScales';
import { hasHeightsProperty } from '../utils/heightGrid';
import { placeChild } from '../utils/worldSurface';
import { NO_CEILING_CONTEXT, slabCm } from '../utils/ceilings';
import type { CeilingContext, LevelAbove } from '../utils/ceilings';

/** The open map's ceiling context, from its world set (reading the store directly). */
export function useCeilingContext(): CeilingContext {
  const mapName = useMapStore((s) => s.mapName);
  const mapWorldSet = useMapStore((s) => s.mapWorldSet);
  const store = useCeilingStore();
  return store.key === surfaceKey(mapWorldSet, mapName) ? store.context : NO_CEILING_CONTEXT;
}

/**
 * Keep the ceiling store in step with the open map (#45): fetch the sibling levels
 * above it (same parent, higher Z) that have heights and, for maps below ground, the
 * parent's heights. Refetches when the open map, its geometry or the world set changes
 * (so saved edits to another level show the next time this one is opened).
 */
export function useCeilings(): void {
  const mapName = useMapStore((s) => s.mapName);
  const mapWorldSet = useMapStore((s) => s.mapWorldSet);
  const mapData = useMapStore((s) => s.mapData);
  const activeWorldSetName = useWorldSetStore((s) => s.activeWorldSetName);
  const activeWorldSet = useWorldSetStore((s) => s.activeWorldSet);
  const setContext = useCeilingStore((s) => s.setContext);

  const inActive = !!mapName && mapWorldSet === activeWorldSetName;
  const defaultUnits = activeWorldSet?.units;
  const mpu = inActive ? resolveMetersPerUnit(mapData ?? undefined, defaultUnits) : undefined;
  const geometry = mapData ? [mapData.orientation, mapData.width, mapData.height, mpu].join('|') : '';

  useEffect(() => {
    const key = surfaceKey(mapWorldSet, mapName);
    const map = useMapStore.getState().mapData;
    const nodes = activeWorldSet?.nodes ?? [];
    const node = nodes.find((n) => n.mapName === mapName);
    if (!inActive || !map || !mpu || !mapWorldSet || !node?.parentMapName || !node.parentAnchor) {
      setContext(key, { ...NO_CEILING_CONTEXT, z: node?.z ?? 0 });
      return;
    }
    const { parentMapName, parentAnchor, parentOffset, z } = node;
    const levels = nodes.filter((n) => n.parentMapName === parentMapName && n.parentAnchor && n.z > z && n.mapName !== mapName);
    if (levels.length === 0 && z >= 0) {
      setContext(key, { ...NO_CEILING_CONTEXT, z });
      return;
    }
    const slabM = activeWorldSet?.floorSlabM;
    let cancelled = false;
    (async () => {
      const parentMap = await getMap(mapWorldSet, parentMapName);
      const parentMPU = resolveMetersPerUnit(parentMap, defaultUnits);
      if (!parentMPU) return { ...NO_CEILING_CONTEXT, z };
      const above = (await Promise.all(levels.map(async (n): Promise<LevelAbove | null> => {
        try {
          const lvl = await getMap(mapWorldSet, n.mapName);
          const lvlMPU = resolveMetersPerUnit(lvl, defaultUnits);
          if (!lvlMPU || !hasHeightsProperty(lvl)) return null;
          const patch = await getHeights(mapWorldSet, n.mapName);
          if (!patch) return null;
          return {
            name: n.mapName, z: n.z, map: lvl, patch, slabCm: slabCm(lvl, slabM),
            place: placeChild(lvl.width, lvl.height, lvlMPU, parentMPU, n.parentAnchor!, n.parentOffset),
          };
        } catch {
          return null; // a missing or unreadable level just doesn't count
        }
      }))).filter((l): l is LevelAbove => l !== null).sort((a, b) => a.z - b.z);
      const groundPatch = z < 0 && hasHeightsProperty(parentMap) ? await getHeights(mapWorldSet, parentMapName) : null;
      return {
        z,
        place: placeChild(map.width, map.height, mpu, parentMPU, parentAnchor, parentOffset),
        above,
        ground: groundPatch ? { name: parentMapName, map: parentMap, patch: groundPatch } : null,
      } satisfies CeilingContext;
    })()
      .then((ctx) => { if (!cancelled) setContext(key, ctx); })
      .catch((e) => { if (!cancelled) { console.error('Loading levels above failed:', e); setContext(key, { ...NO_CEILING_CONTEXT, z }); } });
    return () => { cancelled = true; };
  }, [inActive, mapName, mapWorldSet, geometry, activeWorldSet, defaultUnits]); // eslint-disable-line react-hooks/exhaustive-deps
}
