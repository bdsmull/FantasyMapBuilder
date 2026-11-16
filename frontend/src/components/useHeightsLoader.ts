import { useEffect } from 'react';
import { useMapStore } from '../store/mapStore';
import { getHeights } from '../api/client';
import { hasHeightsProperty } from '../utils/heightGrid';

/**
 * Load the open map's height patch whenever a map is opened. Lives in one place
 * so every way of opening a map (Open Map, New Map, hierarchy navigation...)
 * gets its elevation without each caller fetching it.
 */
export function useHeightsLoader(): void {
  const mapName = useMapStore((s) => s.mapName);
  const mapWorldSet = useMapStore((s) => s.mapWorldSet);
  const mapData = useMapStore((s) => s.mapData);
  const linked = mapData !== null && hasHeightsProperty(mapData);

  useEffect(() => {
    if (!mapName || !mapWorldSet || !linked) return;
    const { heights, heightsDirty } = useMapStore.getState();
    if (heights || heightsDirty) return; // already loaded, or added/edited in this session
    let cancelled = false;
    getHeights(mapWorldSet, mapName)
      .then((patch) => {
        const state = useMapStore.getState();
        // Ignore a late answer for a map that is no longer open, or that changed meanwhile
        if (cancelled || state.mapName !== mapName || state.mapWorldSet !== mapWorldSet || state.heightsDirty) return;
        state.setHeights(patch);
      })
      .catch((e) => console.error('Loading elevation failed:', e));
    return () => { cancelled = true; };
  }, [mapName, mapWorldSet, linked]);
}
