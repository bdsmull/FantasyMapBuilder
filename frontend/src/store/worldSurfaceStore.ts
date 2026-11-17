/**
 * The open map's child surfaces (#8 phase 2): which child maps' heights show on it,
 * and the samples they change. Filled by useWorldSurface; read by the canvas
 * (overlay) and the status bar (readout).
 */

import { create } from 'zustand';
import type { PlacedChild, SurfaceOverrides, ChildPlacement } from '../utils/worldSurface';
import type { TmjMap } from '../types/tmj';
import type { HeightPatch } from '../utils/heightGrid';

/** The open map's parent, for checking how the open map fits it. */
export interface ParentSurface {
  name: string;
  map: TmjMap;
  /** The parent's own stored heights. */
  patch: HeightPatch;
  /** Where the open map sits on it. */
  place: ChildPlacement;
  /** One contour band of the parent's scale (cm): the mismatch threshold. */
  intervalCm: number;
}

export interface WorldSurfaceStore {
  /** "<world set>/<map>" the data belongs to, or null. */
  key: string | null;
  children: PlacedChild[];
  overrides: SurfaceOverrides | null;
  parent: ParentSurface | null;
  setParent: (key: string | null, parent: ParentSurface | null) => void;
  /** "<world set>/<map>" the parent data belongs to. */
  parentKey: string | null;
  setSurface: (key: string | null, children: PlacedChild[], overrides: SurfaceOverrides | null) => void;
}

export const useWorldSurfaceStore = create<WorldSurfaceStore>((set) => ({
  key: null,
  children: [],
  overrides: null,
  parent: null,
  parentKey: null,
  setParent: (parentKey, parent) => set({ parentKey, parent }),
  setSurface: (key, children, overrides) => set({ key, children, overrides }),
}));

export const surfaceKey = (worldSet: string | null, mapName: string | null) =>
  worldSet && mapName ? `${worldSet}/${mapName}` : null;
