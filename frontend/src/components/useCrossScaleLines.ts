import { useEffect } from 'react';
import { useMapStore } from '../store/mapStore';
import { useWorldSetStore } from '../store/worldSetStore';
import { useCrossScaleStore } from '../store/crossScaleStore';
import { surfaceKey } from '../store/worldSurfaceStore';
import { getMap } from '../api/client';
import { resolveMetersPerUnit } from '../data/mapScales';
import type { WorldSetNode } from '../types/worldSet';
import { relatedMaps, ghostLines, mapExtent } from '../utils/crossScaleLines';
import type { MapSource } from '../utils/crossScaleLines';

/** Descendants smaller than this (longest side, in cells of the open map) are left out: their lines would be specks. */
const _MIN_EXTENT_CELLS = 0.25;

/** Fetch the open map's Z = 0 ancestors and descendants (with a scale). */
async function _gather(worldSet: string, open: string, nodes: WorldSetNode[], units: 'metric' | 'imperial' | undefined): Promise<Map<string, MapSource>> {
  const out = new Map<string, MapSource>();
  const fetchOne = async (name: string) => {
    if (out.has(name)) return out.get(name);
    try {
      const map = await getMap(worldSet, name);
      const mpu = resolveMetersPerUnit(map, units);
      if (!mpu) return undefined;
      const src = { map, mpu };
      out.set(name, src);
      return src;
    } catch {
      return undefined; // a missing or unreadable map just doesn't show
    }
  };
  // Ancestors
  let node = nodes.find((n) => n.mapName === open);
  const seen = new Set([open]);
  while (node?.parentMapName && node.parentAnchor && node.z === 0 && !seen.has(node.parentMapName)) {
    seen.add(node.parentMapName);
    if (!(await fetchOne(node.parentMapName))) break;
    const parentName: string = node.parentMapName;
    node = nodes.find((n) => n.mapName === parentName);
  }
  // Descendants, a level at a time
  let level = [open];
  while (level.length) {
    const kids = nodes.filter((n) => n.parentMapName !== null && level.includes(n.parentMapName) && n.parentAnchor && n.z === 0 && !seen.has(n.mapName));
    kids.forEach((k) => seen.add(k.mapName));
    const got = await Promise.all(kids.map((k) => fetchOne(k.mapName).then((s) => (s ? k.mapName : null))));
    level = got.filter((n): n is string => n !== null);
  }
  return out;
}

/**
 * Keep the cross-scale store in step with the open map: fetch its ancestors and
 * descendants and place their lines on it. Refetches when the open map, its geometry
 * or the world set's layout changes (so saved edits elsewhere show the next time).
 */
export function useCrossScaleLines(): void {
  const mapName = useMapStore((s) => s.mapName);
  const mapWorldSet = useMapStore((s) => s.mapWorldSet);
  const geometry = useMapStore((s) => s.mapData && [s.mapData.orientation, s.mapData.width, s.mapData.height,
    s.mapData.tilewidth, s.mapData.tileheight, s.mapData.hexsidelength, s.mapData.staggeraxis, s.mapData.staggerindex,
    s.mapData.scale, s.mapData.units, s.mapData.metersPerUnit].join('|'));
  const activeWorldSetName = useWorldSetStore((s) => s.activeWorldSetName);
  const activeWorldSet = useWorldSetStore((s) => s.activeWorldSet);
  const setRelated = useCrossScaleStore((s) => s.setRelated);

  useEffect(() => {
    const key = surfaceKey(mapWorldSet, mapName);
    const map = useMapStore.getState().mapData;
    const units = activeWorldSet?.units;
    const mpu = resolveMetersPerUnit(map ?? undefined, units);
    const nodes = activeWorldSet?.nodes ?? [];
    if (!map || !mpu || !mapName || mapWorldSet !== activeWorldSetName || !mapWorldSet || !nodes.some((n) => n.mapName === mapName)) {
      setRelated(key, [], [], map ? mapExtent(map) : null);
      return;
    }
    let cancelled = false;
    _gather(mapWorldSet, mapName, nodes, units)
      .then((sources) => {
        if (cancelled) return;
        const current = useMapStore.getState().mapData ?? map;
        const lookup = (n: string) => (n === mapName ? { map: current, mpu } : sources.get(n));
        const minPx = _MIN_EXTENT_CELLS * Math.min(current.tilewidth, current.tileheight);
        const related = relatedMaps(mapName, nodes, lookup, (_src, rect) => Math.max(rect.x1 - rect.x0, rect.y1 - rect.y0) >= minPx);
        const openRect = mapExtent(current);
        setRelated(key, related, ghostLines(related, openRect), openRect);
      })
      .catch((e) => console.error('Loading lines from other maps failed:', e));
    return () => { cancelled = true; };
  }, [mapName, mapWorldSet, geometry, activeWorldSetName, activeWorldSet]); // eslint-disable-line react-hooks/exhaustive-deps
}
