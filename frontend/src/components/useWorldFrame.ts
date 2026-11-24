import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import { useMapStore } from '../store/mapStore';
import { useWorldSetStore } from '../store/worldSetStore';
import { surfaceKey } from '../store/worldSurfaceStore';
import { getMap } from '../api/client';
import { resolveMetersPerUnit } from '../data/mapScales';
import { mapFrame } from '../utils/worldCoords';
import type { MapFrame, WorldMapSource } from '../utils/worldCoords';

/** The open map's ancestors (any Z), for placing it in the world (#9). */
interface AncestorStore {
  /** "<world set>/<map>" they were fetched for. */
  key: string | null;
  ancestors: Map<string, WorldMapSource>;
  set: (key: string | null, ancestors: Map<string, WorldMapSource>) => void;
}

const useAncestorStore = create<AncestorStore>((set) => ({
  key: null,
  ancestors: new Map(),
  set: (key, ancestors) => set({ key, ancestors }),
}));

/**
 * Keep the open map's ancestors loaded: refetched when the open map or the world set's
 * layout changes. Call once (App).
 */
export function useWorldAncestors(): void {
  const mapName = useMapStore((s) => s.mapName);
  const mapWorldSet = useMapStore((s) => s.mapWorldSet);
  const activeWorldSetName = useWorldSetStore((s) => s.activeWorldSetName);
  const activeWorldSet = useWorldSetStore((s) => s.activeWorldSet);
  const setAncestors = useAncestorStore((s) => s.set);

  useEffect(() => {
    const key = surfaceKey(mapWorldSet, mapName);
    const nodes = activeWorldSet?.nodes ?? [];
    if (!key || !mapWorldSet || mapWorldSet !== activeWorldSetName) { setAncestors(key, new Map()); return; }
    let cancelled = false;
    (async () => {
      const found = new Map<string, WorldMapSource>();
      let node = nodes.find((n) => n.mapName === mapName);
      const seen = new Set([mapName]);
      while (node?.parentMapName && !seen.has(node.parentMapName)) {
        const parentName: string = node.parentMapName;
        seen.add(parentName);
        try {
          const map = await getMap(mapWorldSet, parentName);
          const mpu = resolveMetersPerUnit(map, activeWorldSet?.units);
          if (!mpu) break;
          found.set(parentName, { map, mpu });
        } catch {
          break; // a missing parent: the map isn't placed in the world
        }
        node = nodes.find((n) => n.mapName === parentName);
      }
      if (!cancelled) setAncestors(key, found);
    })().catch((e) => console.error('Loading parent maps failed:', e));
    return () => { cancelled = true; };
  }, [mapName, mapWorldSet, activeWorldSetName, activeWorldSet]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Where the open map sits in its world, or null (not in the active world set, unplaced, no scale, still loading). */
export function useWorldFrame(): MapFrame | null {
  const mapData = useMapStore((s) => s.mapData);
  const mapName = useMapStore((s) => s.mapName);
  const mapWorldSet = useMapStore((s) => s.mapWorldSet);
  const activeWorldSet = useWorldSetStore((s) => s.activeWorldSet);
  const activeWorldSetName = useWorldSetStore((s) => s.activeWorldSetName);
  const { key, ancestors } = useAncestorStore();
  return useMemo(() => {
    if (!mapData || !activeWorldSet || mapWorldSet !== activeWorldSetName || key !== surfaceKey(mapWorldSet, mapName)) return null;
    const mpu = resolveMetersPerUnit(mapData, activeWorldSet.units);
    if (!mpu) return null;
    const lookup = (n: string) => (n === mapName ? { map: mapData, mpu } : ancestors.get(n));
    return mapFrame(mapName, activeWorldSet.nodes, lookup);
  }, [mapData, mapName, mapWorldSet, activeWorldSet, activeWorldSetName, key, ancestors]);
}
