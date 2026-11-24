/**
 * What the open map's ceilings depend on outside it (#45): the levels above it and,
 * below ground, the parent's ground. Filled by useCeilings; read by the canvas
 * (headroom overlay), the status bar and the inspector.
 */

import { create } from 'zustand';
import type { CeilingContext } from '../utils/ceilings';
import { NO_CEILING_CONTEXT } from '../utils/ceilings';

export interface CeilingStore {
  /** "<world set>/<map>" the context belongs to, or null. */
  key: string | null;
  context: CeilingContext;
  setContext: (key: string | null, context: CeilingContext) => void;
}

export const useCeilingStore = create<CeilingStore>((set) => ({
  key: null,
  context: NO_CEILING_CONTEXT,
  setContext: (key, context) => set({ key, context }),
}));
