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
 * Uses `useMapStore.getState()` (not a React hook) so it is safe to call
 * from non-React code. This also keeps `worldSetStore.ts` free of any
 * `mapStore` import — see phase 3 design decision D-01.
 */

import { useMapStore } from '../store/mapStore';
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
 * Navigate to a different map. Handles the dirty-map guard by honoring
 * the caller's `saveFirst` decision, then fetches the new map and loads it
 * into `mapStore`.
 *
 * @throws if `saveFirst: true` and `mapStore.saveMapToServer()` rejects —
 *         in that case the new map is NOT loaded (save is a precondition).
 * @throws if the server `getMap(name)` fetch fails.
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

  // Step 2: fetch the new map's TMJ payload
  const data = await apiGetMap(name);

  // Step 3: load into the store
  loadMap(data, name);
}
