/**
 * Shared navigation utility — the single entry point for switching the
 * loaded map in response to user actions (hierarchy panel click, canvas
 * footprint click, status bar breadcrumb, etc.).
 *
 * This utility does NOT prompt the user. The caller is responsible for
 * showing any "Save / Discard / Cancel" dialog and passing the resulting
 * decision via the `saveFirst` option. If the current map is not dirty,
 * `saveFirst` is ignored and the utility jumps straight to load.
 *
 * Uses `useMapStore.getState()` / `useWorldSetStore.getState()` (not React
 * hooks) so it is safe to call from non-React code. This also keeps the two
 * stores free of imports of each other — see phase 3 design decision D-01.
 *
 * World set rule: the open map always belongs to the active world set.
 * Hierarchy navigation stays inside the active world set; switching world
 * sets goes through activateWorldSet(), which closes a map from another one.
 */

import { useMapStore } from '../store/mapStore';
import { useWorldSetStore } from '../store/worldSetStore';
import { getMap as apiGetMap } from '../api/client';

export interface NavigateOptions {
  /**
   * Caller's resolved decision for the dirty-map guard:
   *   true  → save current map to server before loading the new map
   *   false → discard unsaved changes, load directly
   *
   * Ignored when the current map is not dirty.
   */
  saveFirst: boolean;
}

/**
 * Navigate to a different map in the active world set. Handles the dirty-map
 * guard by honoring the caller's `saveFirst` decision, then fetches the new
 * map and loads it into `mapStore`.
 *
 * @throws if `saveFirst: true` and `mapStore.saveMapToServer()` rejects —
 *         in that case the new map is NOT loaded (save is a precondition).
 * @throws if no world set is active, or the server `getMap` fetch fails.
 */
export async function navigateToMap(
  name: string,
  options: NavigateOptions,
): Promise<void> {
  // Read a snapshot of the map store. We deliberately do NOT cache this
  // across the awaits below — we only need isDirty right now.
  const { isDirty, saveMapToServer, loadMap } = useMapStore.getState();

  // Step 1: dirty-map guard
  if (isDirty && options.saveFirst) {
    // Save is a precondition; let errors propagate so the caller knows
    // the navigation did not happen.
    await saveMapToServer();
  }
  // If isDirty is false, saveFirst is ignored.
  // If saveFirst is false (and isDirty is true), we discard by doing nothing here.

  // Step 2: fetch the new map's TMJ payload from the active world set
  const worldSet = useWorldSetStore.getState().activeWorldSetName;
  if (!worldSet) throw new Error('No active world set');
  const data = await apiGetMap(worldSet, name);

  // Step 3: load into the store
  loadMap(data, name, worldSet);
}

/**
 * Make `name` the active world set (or none, for null).
 *
 * Switching to another world set closes a clean map from a different one.
 * Deactivating (null) leaves the open map alone. A map with unsaved changes
 * blocks the switch instead of being discarded silently: the caller shows
 * the error and the user saves or closes the map first.
 *
 * @throws if the open map belongs to another world set and has unsaved changes,
 *         or if the world set can't be loaded (nothing changes in that case).
 */
export async function activateWorldSet(name: string | null): Promise<void> {
  const { mapData, mapName, mapWorldSet, isDirty, closeMap } = useMapStore.getState();
  const leavesOpenMap = mapData !== null && name !== null && mapWorldSet !== name;
  if (leavesOpenMap && isDirty) {
    throw new Error(`"${mapName}" has unsaved changes. Save or close it before switching world sets.`);
  }
  await useWorldSetStore.getState().setActiveWorldSet(name);
  if (leavesOpenMap) closeMap();
}
