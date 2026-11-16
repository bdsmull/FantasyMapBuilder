/**
 * The open map's child surfaces (#8 phase 2): which child maps' heights show on it,
 * and the samples they change. Filled by useWorldSurface; read by the canvas
 * (overlay) and the status bar (readout).
 */

import { create } from 'zustand';
import type { PlacedChild, SurfaceOverrides } from '../utils/worldSurface';

export interface WorldSurfaceStore {
  /** "<world set>/<map>" the data belongs to, or null. */
  key: string | null;
  children: PlacedChild[];
  overrides: SurfaceOverrides | null;
  setSurface: (key: string | null, children: PlacedChild[], overrides: SurfaceOverrides | null) => void;
}

export const useWorldSurfaceStore = create<WorldSurfaceStore>((set) => ({
  key: null,
  children: [],
  overrides: null,
  setSurface: (key, children, overrides) => set({ key, children, overrides }),
}));

export const surfaceKey = (worldSet: string | null, mapName: string | null) =>
  worldSet && mapName ? `${worldSet}/${mapName}` : null;
