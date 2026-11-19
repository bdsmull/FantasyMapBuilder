/**
 * Maps related to the open one (ancestors and descendants), placed in its pixels, for
 * showing roads and rivers across map scales (#6, 6b). Filled by useCrossScaleLines.
 */

import { create } from 'zustand';
import type { RelatedMap, GhostLine, Rect } from '../utils/crossScaleLines';

export interface CrossScaleStore {
  /** "<world set>/<map>" the data belongs to, or null. */
  key: string | null;
  related: RelatedMap[];
  ghosts: GhostLine[];
  /** The open map's area in its own pixels. */
  openRect: Rect | null;
  setRelated: (key: string | null, related: RelatedMap[], ghosts: GhostLine[], openRect: Rect | null) => void;
}

export const useCrossScaleStore = create<CrossScaleStore>((set) => ({
  key: null,
  related: [],
  ghosts: [],
  openRect: null,
  setRelated: (key, related, ghosts, openRect) => set({ key, related, ghosts, openRect }),
}));
