/**
 * Zustand store — the single source of truth for the ACTIVE world set.
 *
 * Store holds at most one active world set at a time. Mutation actions
 * (addNode, removeNode, updateNode) update in-memory state only;
 * callers must explicitly call saveWorldSet() to persist.
 *
 * This store does NOT import mapStore. Cross-store behavior (dirty-map guard,
 * navigation) lives in `frontend/src/utils/navigation.ts` — see Plan 03-02.
 */

import { create } from 'zustand';
import type { WorldSet, WorldSetNode } from '../types/worldSet';
import {
  getWorldSet as apiGetWorldSet,
  saveWorldSet as apiSaveWorldSet,
} from '../api/client';

// ---------------------------------------------------------------------------
// Action result types
// ---------------------------------------------------------------------------

/** Result of addNode / updateNode — distinguishes hard errors from soft warnings. */
export type AddNodeResult =
  | { ok: true; warnings: string[] }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface WorldSetStore {
  // ---- State ----
  activeWorldSetName: string | null;
  activeWorldSet: WorldSet | null;

  // ---- Lifecycle ----
  setActiveWorldSet: (name: string | null) => Promise<void>;
  saveWorldSet: () => Promise<void>;

  // ---- Mutations (in-memory only — must call saveWorldSet to persist) ----
  addNode: (node: WorldSetNode) => AddNodeResult;
  removeNode: (mapName: string) => void;
  updateNode: (
    mapName: string,
    changes: Partial<Pick<WorldSetNode, 'parentAnchor' | 'z' | 'zLabel'>>,
  ) => void;

  // ---- Computed helpers ----
  childrenOf: (mapName: string) => WorldSetNode[];
  parentOf: (mapName: string) => WorldSetNode | null;
  rootNodes: () => WorldSetNode[];
}

// ---------------------------------------------------------------------------
// Invariant helpers (pure — used by addNode / updateNode)
// ---------------------------------------------------------------------------

/** Walk parent links starting from `startMapName`; returns true if `targetMapName` appears. */
function _createsCycle(
  nodes: WorldSetNode[],
  startMapName: string | null,
  targetMapName: string,
): boolean {
  const byName = new Map(nodes.map((n) => [n.mapName, n]));
  let current = startMapName;
  const seen = new Set<string>();
  while (current) {
    if (current === targetMapName) return true;
    if (seen.has(current)) return false; // malformed existing graph — bail
    seen.add(current);
    const node = byName.get(current);
    current = node ? node.parentMapName : null;
  }
  return false;
}

/** parentMapName and parentAnchor must both be null or both be non-null. */
function _parentLinkConsistent(node: WorldSetNode): boolean {
  const hasParent = node.parentMapName !== null;
  const hasAnchor = node.parentAnchor !== null;
  return hasParent === hasAnchor;
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useWorldSetStore = create<WorldSetStore>((set, get) => ({
  activeWorldSetName: null,
  activeWorldSet: null,

  // ---- Lifecycle ----

  setActiveWorldSet: async (name) => {
    if (name === null) {
      set({ activeWorldSetName: null, activeWorldSet: null });
      return;
    }
    const data = await apiGetWorldSet(name);
    set({ activeWorldSetName: name, activeWorldSet: data });
  },

  saveWorldSet: async () => {
    const { activeWorldSetName, activeWorldSet } = get();
    if (!activeWorldSetName || !activeWorldSet) {
      throw new Error('No active world set to save');
    }
    await apiSaveWorldSet(activeWorldSetName, activeWorldSet);
  },

  // ---- Mutations ----

  addNode: (node) => {
    const { activeWorldSet } = get();
    if (!activeWorldSet) {
      return { ok: false, error: 'No active world set' };
    }

    // Hard block 1: parent link consistency
    if (!_parentLinkConsistent(node)) {
      return {
        ok: false,
        error: 'parentMapName and parentAnchor must both be set or both be null',
      };
    }

    // Hard block 2: duplicate mapName
    if (activeWorldSet.nodes.some((n) => n.mapName === node.mapName)) {
      return { ok: false, error: `Node for map '${node.mapName}' already exists` };
    }

    // Hard block 3: cycle detection — walk parent chain from candidate.parentMapName
    // If we encounter node.mapName anywhere, the candidate creates a cycle.
    if (
      node.parentMapName !== null &&
      _createsCycle(activeWorldSet.nodes, node.parentMapName, node.mapName)
    ) {
      return {
        ok: false,
        error: `Adding node '${node.mapName}' under '${node.parentMapName}' would create a cycle`,
      };
    }

    // Soft warnings — insert but flag
    const warnings: string[] = [];

    // Same-Z overlap: compare candidate footprint to existing siblings at same parent+z.
    // The store has no access to per-map feetPerUnit / dimensions; it treats every
    // node as a 1x1 anchor footprint for the purposes of this warning. Higher-level
    // callers (management dialog in Phase 4) may supply richer data using
    // computeFootprint directly before calling addNode.
    if (node.parentMapName !== null && node.parentAnchor !== null) {
      const siblings = activeWorldSet.nodes.filter(
        (n) => n.parentMapName === node.parentMapName && n.z === node.z && n.parentAnchor !== null,
      );
      const sameCell = siblings.find(
        (n) =>
          n.parentAnchor!.col === node.parentAnchor!.col &&
          n.parentAnchor!.row === node.parentAnchor!.row,
      );
      if (sameCell) {
        warnings.push(
          `Node '${node.mapName}' overlaps '${sameCell.mapName}' at same parent, z=${node.z}, and anchor cell`,
        );
      }
    }

    // Insert via immutable update (do NOT push to the existing array)
    set({
      activeWorldSet: {
        ...activeWorldSet,
        nodes: [...activeWorldSet.nodes, node],
      },
    });

    return { ok: true, warnings };
  },

  removeNode: (mapName) => {
    const { activeWorldSet } = get();
    if (!activeWorldSet) return;
    if (!activeWorldSet.nodes.some((n) => n.mapName === mapName)) return;

    // BFS from mapName: collect the target plus every descendant (parentMapName chain).
    const toRemove = new Set<string>([mapName]);
    const queue: string[] = [mapName];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const n of activeWorldSet.nodes) {
        if (n.parentMapName === current && !toRemove.has(n.mapName)) {
          toRemove.add(n.mapName);
          queue.push(n.mapName);
        }
      }
    }

    set({
      activeWorldSet: {
        ...activeWorldSet,
        nodes: activeWorldSet.nodes.filter((n) => !toRemove.has(n.mapName)),
      },
    });
  },

  updateNode: (mapName, changes) => {
    const { activeWorldSet } = get();
    if (!activeWorldSet) return;
    const idx = activeWorldSet.nodes.findIndex((n) => n.mapName === mapName);
    if (idx === -1) return;

    const current = activeWorldSet.nodes[idx];
    const patched: WorldSetNode = {
      ...current,
      ...(changes.parentAnchor !== undefined ? { parentAnchor: changes.parentAnchor } : {}),
      ...(changes.z !== undefined ? { z: changes.z } : {}),
      ...(changes.zLabel !== undefined ? { zLabel: changes.zLabel } : {}),
    };

    const newNodes = [...activeWorldSet.nodes];
    newNodes[idx] = patched;
    set({ activeWorldSet: { ...activeWorldSet, nodes: newNodes } });
  },

  // ---- Computed helpers ----

  childrenOf: (mapName) => {
    const ws = get().activeWorldSet;
    if (!ws) return [];
    return ws.nodes.filter((n) => n.parentMapName === mapName);
  },

  parentOf: (mapName) => {
    const ws = get().activeWorldSet;
    if (!ws) return null;
    const node = ws.nodes.find((n) => n.mapName === mapName);
    if (!node || node.parentMapName === null) return null;
    return ws.nodes.find((n) => n.mapName === node.parentMapName) ?? null;
  },

  rootNodes: () => {
    const ws = get().activeWorldSet;
    if (!ws) return [];
    return ws.nodes.filter((n) => n.parentMapName === null);
  },
}));
