/**
 * Contract tests for canvas right-click context menu gate logic and anchor pre-fill.
 * Environment: node (no DOM). Tests the predicates and data shapes, not React rendering.
 * CTX-01: gate shows menu only when world set active AND current map is a node
 * CTX-02: "Add child map here" pre-fills anchor from clicked tile coordinates
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useWorldSetStore } from '../store/worldSetStore';
import { WORLD_SET_VERSION } from '../types/worldSet';

vi.mock('../api/client', () => ({
  listMaps: vi.fn(),
  getMap: vi.fn(),
  saveMap: vi.fn(),
  deleteMap: vi.fn(),
  uploadMap: vi.fn(),
  downloadMapUrl: vi.fn(),
  tilesetImageUrl: vi.fn(),
  listWorldSets: vi.fn(),
  getWorldSet: vi.fn(),
  saveWorldSet: vi.fn(),
  deleteWorldSet: vi.fn(),
}));

// Extract the gate predicate from MapCanvas.tsx for isolated testing.
// This mirrors the exact condition in the right-click handler.
function isCurrentMapInWorldSet(
  activeWorldSetName: string | null,
  activeWorldSet: { nodes: Array<{ mapName: string }> } | null,
  mapName: string | null,
): boolean {
  return (
    !!activeWorldSetName &&
    !!activeWorldSet?.nodes.find((n) => n.mapName === mapName)
  );
}

// Simulate what the right-click handler does when gate passes: build context menu args.
function buildContextMenuArgs(
  mapName: string,
  tile: { col: number; row: number },
  _footprintMapName?: string,
) {
  return {
    initialView: 'configure' as const,
    initialParentMapName: mapName,
    initialAnchor: { col: tile.col, row: tile.row },
    hideParent: true,
  };
}

beforeEach(() => {
  useWorldSetStore.setState({ activeWorldSetName: null, activeWorldSet: null });
});

describe('CTX-01: Canvas context menu gate logic', () => {
  it('gate returns false when no world set is active (activeWorldSetName is null)', () => {
    const result = isCurrentMapInWorldSet(null, null, 'my-map');
    expect(result).toBe(false);
  });

  it('gate returns false when world set is active but current map is not a node', () => {
    const ws = {
      name: 'ws',
      version: WORLD_SET_VERSION,
      nodes: [{ mapName: 'other-map', parentMapName: null, parentAnchor: null, z: 0, zLabel: null }],
    };
    const result = isCurrentMapInWorldSet('ws', ws, 'my-map');
    expect(result).toBe(false);
  });

  it('gate returns false when world set has no nodes', () => {
    const ws = { name: 'ws', version: WORLD_SET_VERSION, nodes: [] };
    const result = isCurrentMapInWorldSet('ws', ws, 'my-map');
    expect(result).toBe(false);
  });

  it('gate returns false when mapName is null', () => {
    const ws = {
      name: 'ws',
      version: WORLD_SET_VERSION,
      nodes: [{ mapName: 'my-map', parentMapName: null, parentAnchor: null, z: 0, zLabel: null }],
    };
    const result = isCurrentMapInWorldSet('ws', ws, null);
    expect(result).toBe(false);
  });

  it('gate returns true when world set is active AND current map is a node', () => {
    const ws = {
      name: 'ws',
      version: WORLD_SET_VERSION,
      nodes: [
        { mapName: 'parent-map', parentMapName: null, parentAnchor: null, z: 0, zLabel: null },
        { mapName: 'current-map', parentMapName: 'parent-map', parentAnchor: { col: 0, row: 0 }, z: 1, zLabel: null },
      ],
    };
    const result = isCurrentMapInWorldSet('ws', ws, 'current-map');
    expect(result).toBe(true);
  });

  it('gate returns true when current map is the root node', () => {
    const ws = {
      name: 'ws',
      version: WORLD_SET_VERSION,
      nodes: [{ mapName: 'root-map', parentMapName: null, parentAnchor: null, z: 0, zLabel: null }],
    };
    const result = isCurrentMapInWorldSet('ws', ws, 'root-map');
    expect(result).toBe(true);
  });

  it('gate uses store state correctly via worldSetStore', () => {
    useWorldSetStore.setState({
      activeWorldSetName: 'test-ws',
      activeWorldSet: {
        name: 'test-ws',
        version: WORLD_SET_VERSION,
        nodes: [{ mapName: 'canvas-map', parentMapName: null, parentAnchor: null, z: 0, zLabel: null }],
      },
    });
    const { activeWorldSetName, activeWorldSet } = useWorldSetStore.getState();
    const result = isCurrentMapInWorldSet(activeWorldSetName, activeWorldSet, 'canvas-map');
    expect(result).toBe(true);
  });
});

describe('CTX-02: Anchor pre-fill from clicked tile', () => {
  it('onOpenWorldSetDialog args contain initialAnchor matching clicked tile coordinates', () => {
    const tile = { col: 7, row: 4 };
    const args = buildContextMenuArgs('parent-map', tile);
    expect(args.initialAnchor).toEqual({ col: 7, row: 4 });
  });

  it('initialAnchor preserves col=0, row=0 for top-left tile', () => {
    const tile = { col: 0, row: 0 };
    const args = buildContextMenuArgs('parent-map', tile);
    expect(args.initialAnchor).toEqual({ col: 0, row: 0 });
  });

  it('initialAnchor preserves large tile coordinates', () => {
    const tile = { col: 99, row: 49 };
    const args = buildContextMenuArgs('parent-map', tile);
    expect(args.initialAnchor).toEqual({ col: 99, row: 49 });
  });

  it('args always include initialView: configure, hideParent: true, initialParentMapName', () => {
    const tile = { col: 3, row: 5 };
    const args = buildContextMenuArgs('my-parent', tile);
    expect(args.initialView).toBe('configure');
    expect(args.hideParent).toBe(true);
    expect(args.initialParentMapName).toBe('my-parent');
  });
});
