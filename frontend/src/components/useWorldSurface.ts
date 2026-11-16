import { useEffect } from 'react';
import { useMapStore } from '../store/mapStore';
import { useWorldSetStore } from '../store/worldSetStore';
import { useWorldSurfaceStore, surfaceKey } from '../store/worldSurfaceStore';
import { getMap, getHeights } from '../api/client';
import { resolveMetersPerUnit } from '../data/mapScales';
import { hasHeightsProperty, sampleGrid } from '../utils/heightGrid';
import type { WorldSetNode } from '../types/worldSet';
import { placedChildren, computeOverrides } from '../utils/worldSurface';
import type { SurfaceSource } from '../utils/worldSurface';

/**
 * Descendants smaller than this (longest side, in cells of the open map) are not
 * fetched: they'd change at most a sliver of one cell, and a world map can have
 * hundreds of them.
 */
const _MIN_EXTENT_CELLS = 0.25;

/** Fetch the Z = 0 descendants of `root` (with heights) that are big enough to show. */
async function _gather(
  worldSet: string, root: string, nodes: WorldSetNode[], rootMPU: number, defaultUnits: 'metric' | 'imperial' | undefined,
): Promise<Map<string, SurfaceSource>> {
  const sources = new Map<string, SurfaceSource>();
  let level = [root];
  const seen = new Set([root]);
  while (level.length > 0) {
    const kids = nodes.filter((n) => n.parentMapName !== null && level.includes(n.parentMapName)
      && n.parentAnchor && n.z === 0 && !seen.has(n.mapName));
    kids.forEach((n) => seen.add(n.mapName));
    const fetched = await Promise.all(kids.map(async (n) => {
      try {
        const map = await getMap(worldSet, n.mapName);
        const mpu = resolveMetersPerUnit(map, defaultUnits);
        if (!mpu || Math.max(map.width, map.height) * mpu < _MIN_EXTENT_CELLS * rootMPU) return null;
        const patch = hasHeightsProperty(map) ? await getHeights(worldSet, n.mapName) : null;
        return [n.mapName, { map, mpu, patch }] as const;
      } catch {
        return null; // a missing or unreadable child just doesn't show
      }
    }));
    level = [];
    for (const entry of fetched) {
      if (!entry) continue;
      sources.set(entry[0], entry[1]);
      level.push(entry[0]);
    }
  }
  return sources;
}

/**
 * Keep the world surface store in step with the open map: fetch its child maps'
 * heights and work out which of its samples they change. Refetches when the open
 * map, its geometry or the world set's layout changes (so saved edits to a child
 * show the next time its parent is opened).
 */
export function useWorldSurface(): void {
  const mapName = useMapStore((s) => s.mapName);
  const mapWorldSet = useMapStore((s) => s.mapWorldSet);
  const mapData = useMapStore((s) => s.mapData);
  const activeWorldSetName = useWorldSetStore((s) => s.activeWorldSetName);
  const activeWorldSet = useWorldSetStore((s) => s.activeWorldSet);
  const setSurface = useWorldSurfaceStore((s) => s.setSurface);

  const inActive = !!mapName && mapWorldSet === activeWorldSetName;
  const defaultUnits = activeWorldSet?.units;
  const mpu = inActive ? resolveMetersPerUnit(mapData ?? undefined, defaultUnits) : undefined;
  // Only geometry matters here, not tile edits
  const geometry = mapData
    ? [mapData.orientation, mapData.width, mapData.height, mapData.tilewidth, mapData.tileheight,
      mapData.hexsidelength, mapData.staggeraxis, mapData.staggerindex, mpu].join('|')
    : '';

  useEffect(() => {
    const key = surfaceKey(mapWorldSet, mapName);
    const map = useMapStore.getState().mapData;
    const nodes = activeWorldSet?.nodes ?? [];
    if (!inActive || !map || !mpu || !mapWorldSet || !nodes.some((n) => n.parentMapName === mapName)) {
      setSurface(key, [], null);
      return;
    }
    let cancelled = false;
    _gather(mapWorldSet, mapName, nodes, mpu, defaultUnits)
      .then((sources) => {
        if (cancelled) return;
        const children = placedChildren(mapName, mpu, nodes, (n) => sources.get(n));
        const { cols, rows } = sampleGrid(map);
        setSurface(key, children, children.length > 0 ? computeOverrides(map, cols, rows, children) : null);
      })
      .catch((e) => console.error('Loading child elevation failed:', e));
    return () => { cancelled = true; };
  }, [inActive, mapName, mapWorldSet, geometry, activeWorldSet, defaultUnits]); // eslint-disable-line react-hooks/exhaustive-deps
}
