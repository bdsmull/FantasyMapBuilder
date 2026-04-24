/**
 * Unit tests for the Zustand world set store.
 * Mirrors the style of mapStore.test.ts — environment is `node`, no DOM.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useWorldSetStore } from '../store/worldSetStore';
import type { WorldSet, WorldSetNode } from '../types/worldSet';

// Mock the api client so setActiveWorldSet and saveWorldSet don't hit the network.
vi.mock('../api/client', () => ({
  // Maps API — not used here but mocked to satisfy the module shape
  listMaps: vi.fn(),
  getMap: vi.fn(),
  saveMap: vi.fn(),
  deleteMap: vi.fn(),
  uploadMap: vi.fn(),
  downloadMapUrl: vi.fn(),
  tilesetImageUrl: vi.fn(),
  // World sets API — used by the store
  listWorldSets: vi.fn(),
  getWorldSet: vi.fn(),
  saveWorldSet: vi.fn(),
  deleteWorldSet: vi.fn(),
}));

function makeWorldSet(nodes: WorldSetNode[] = []): WorldSet {
  return { name: 'test-ws', version: '1.0', nodes };
}

function makeNode(partial: Partial<WorldSetNode> & { mapName: string }): WorldSetNode {
  return {
    mapName: partial.mapName,
    parentMapName: partial.parentMapName ?? null,
    parentAnchor: partial.parentAnchor ?? null,
    z: partial.z ?? 0,
    zLabel: partial.zLabel ?? null,
  };
}

beforeEach(() => {
  useWorldSetStore.setState({
    activeWorldSetName: null,
    activeWorldSet: null,
  });
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------

describe('setActiveWorldSet', () => {
  it('loads world set from server and sets both fields', async () => {
    const { getWorldSet } = await import('../api/client');
    const sample = makeWorldSet([makeNode({ mapName: 'root' })]);
    vi.mocked(getWorldSet).mockResolvedValue(sample);

    await useWorldSetStore.getState().setActiveWorldSet('test-ws');

    const s = useWorldSetStore.getState();
    expect(s.activeWorldSetName).toBe('test-ws');
    expect(s.activeWorldSet).toEqual(sample);
    expect(getWorldSet).toHaveBeenCalledWith('test-ws');
  });

  it('null argument clears both fields without hitting the server', async () => {
    // Seed an active world set first
    useWorldSetStore.setState({
      activeWorldSetName: 'prior',
      activeWorldSet: makeWorldSet(),
    });
    const { getWorldSet } = await import('../api/client');

    await useWorldSetStore.getState().setActiveWorldSet(null);

    const s = useWorldSetStore.getState();
    expect(s.activeWorldSetName).toBeNull();
    expect(s.activeWorldSet).toBeNull();
    expect(getWorldSet).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------

describe('saveWorldSet', () => {
  it('calls api saveWorldSet with current name and data', async () => {
    const { saveWorldSet: apiSave } = await import('../api/client');
    const ws = makeWorldSet([makeNode({ mapName: 'a' })]);
    useWorldSetStore.setState({ activeWorldSetName: 'my-ws', activeWorldSet: ws });

    await useWorldSetStore.getState().saveWorldSet();

    expect(apiSave).toHaveBeenCalledWith('my-ws', ws);
  });

  it('throws when no active world set', async () => {
    await expect(useWorldSetStore.getState().saveWorldSet()).rejects.toThrow(
      /No active world set/,
    );
  });
});

// ---------------------------------------------------------------------------

describe('addNode', () => {
  beforeEach(() => {
    useWorldSetStore.setState({
      activeWorldSetName: 'ws',
      activeWorldSet: makeWorldSet([makeNode({ mapName: 'root' })]),
    });
  });

  it('appends a valid node and returns { ok: true, warnings: [] }', () => {
    const result = useWorldSetStore
      .getState()
      .addNode(
        makeNode({ mapName: 'child', parentMapName: 'root', parentAnchor: { col: 1, row: 1 } }),
      );
    expect(result).toEqual({ ok: true, warnings: [] });
    const nodes = useWorldSetStore.getState().activeWorldSet!.nodes;
    expect(nodes).toHaveLength(2);
    expect(nodes.find((n) => n.mapName === 'child')).toBeDefined();
  });

  it('blocks duplicate mapName — returns ok:false and does not mutate state', () => {
    const before = useWorldSetStore.getState().activeWorldSet!.nodes.length;
    const result = useWorldSetStore.getState().addNode(makeNode({ mapName: 'root' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/already exists/);
    expect(useWorldSetStore.getState().activeWorldSet!.nodes).toHaveLength(before);
  });

  it('blocks cycle — adding a parent whose chain walks back to the candidate', () => {
    // Existing: root (no parent), mid (parent=root). Now try to add root with parent=mid → cycle.
    useWorldSetStore.setState({
      activeWorldSetName: 'ws',
      activeWorldSet: makeWorldSet([
        makeNode({ mapName: 'root' }),
        makeNode({ mapName: 'mid', parentMapName: 'root', parentAnchor: { col: 0, row: 0 } }),
      ]),
    });
    // removeNode 'root' then re-add it with parent=mid would cycle. Simpler:
    // attempt to add a fresh node 'root2' that names root as parent — that's fine.
    // We need a real cycle: add 'newRoot' whose parentMapName is 'mid' and mapName is ancestor of mid.
    // Since mapNames must be unique, "real cycle" comes from adding a node whose mapName
    // appears in the parent chain of its proposed parent.

    // Add 'leaf' with parent='mid' → fine
    const ok = useWorldSetStore
      .getState()
      .addNode(makeNode({ mapName: 'leaf', parentMapName: 'mid', parentAnchor: { col: 0, row: 0 } }));
    expect(ok.ok).toBe(true);

    // Now attempt to add node named 'root' again but with parent='leaf' — blocked by DUPLICATE first, not cycle.
    // Build a dedicated cycle case: remove 'mid', then try to add a node whose mapName is 'anc'
    // with parent='mid' — nope, mid doesn't exist. Use a direct self-loop scenario instead:
    const selfLoop = useWorldSetStore
      .getState()
      .addNode(makeNode({ mapName: 'selfie', parentMapName: 'selfie', parentAnchor: { col: 0, row: 0 } }));
    expect(selfLoop.ok).toBe(false);
    if (!selfLoop.ok) expect(selfLoop.error).toMatch(/cycle/);
  });

  it('blocks inconsistent parent link — parentMapName set but parentAnchor null', () => {
    const result = useWorldSetStore
      .getState()
      .addNode(makeNode({ mapName: 'bad', parentMapName: 'root', parentAnchor: null }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/parentMapName and parentAnchor/);
  });

  it('blocks inconsistent parent link — parentAnchor set but parentMapName null', () => {
    const result = useWorldSetStore
      .getState()
      .addNode(makeNode({ mapName: 'bad', parentMapName: null, parentAnchor: { col: 0, row: 0 } }));
    expect(result.ok).toBe(false);
  });

  it('warns on same-cell sibling overlap but still inserts', () => {
    // Seed two siblings at same parent, z=0, same anchor
    useWorldSetStore.setState({
      activeWorldSetName: 'ws',
      activeWorldSet: makeWorldSet([
        makeNode({ mapName: 'root' }),
        makeNode({ mapName: 'a', parentMapName: 'root', parentAnchor: { col: 5, row: 5 }, z: 0 }),
      ]),
    });
    const result = useWorldSetStore
      .getState()
      .addNode(
        makeNode({ mapName: 'b', parentMapName: 'root', parentAnchor: { col: 5, row: 5 }, z: 0 }),
      );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatch(/overlaps/);
    }
    // Node still inserted
    expect(useWorldSetStore.getState().activeWorldSet!.nodes).toHaveLength(3);
  });

  it('no warning when sibling at same cell but DIFFERENT z', () => {
    useWorldSetStore.setState({
      activeWorldSetName: 'ws',
      activeWorldSet: makeWorldSet([
        makeNode({ mapName: 'root' }),
        makeNode({ mapName: 'a', parentMapName: 'root', parentAnchor: { col: 5, row: 5 }, z: 0 }),
      ]),
    });
    const result = useWorldSetStore
      .getState()
      .addNode(
        makeNode({ mapName: 'b', parentMapName: 'root', parentAnchor: { col: 5, row: 5 }, z: 1 }),
      );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.warnings).toHaveLength(0);
  });

  it('returns ok:false when no active world set', () => {
    useWorldSetStore.setState({ activeWorldSetName: null, activeWorldSet: null });
    const result = useWorldSetStore
      .getState()
      .addNode(makeNode({ mapName: 'x' }));
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe('removeNode', () => {
  beforeEach(() => {
    // Tree: root → mid → leaf, plus sibling 'other'
    useWorldSetStore.setState({
      activeWorldSetName: 'ws',
      activeWorldSet: makeWorldSet([
        makeNode({ mapName: 'root' }),
        makeNode({ mapName: 'mid', parentMapName: 'root', parentAnchor: { col: 0, row: 0 } }),
        makeNode({ mapName: 'leaf', parentMapName: 'mid', parentAnchor: { col: 1, row: 1 } }),
        makeNode({ mapName: 'other', parentMapName: 'root', parentAnchor: { col: 2, row: 2 } }),
      ]),
    });
  });

  it('removes a leaf node only', () => {
    useWorldSetStore.getState().removeNode('leaf');
    const nodes = useWorldSetStore.getState().activeWorldSet!.nodes;
    expect(nodes.map((n) => n.mapName).sort()).toEqual(['mid', 'other', 'root']);
  });

  it('cascades — removes a node and all its descendants', () => {
    useWorldSetStore.getState().removeNode('mid');
    const nodes = useWorldSetStore.getState().activeWorldSet!.nodes;
    expect(nodes.map((n) => n.mapName).sort()).toEqual(['other', 'root']);
  });

  it('removing root removes the whole tree', () => {
    useWorldSetStore.getState().removeNode('root');
    const nodes = useWorldSetStore.getState().activeWorldSet!.nodes;
    expect(nodes).toHaveLength(0);
  });

  it('is a no-op for an unknown mapName', () => {
    useWorldSetStore.getState().removeNode('does-not-exist');
    expect(useWorldSetStore.getState().activeWorldSet!.nodes).toHaveLength(4);
  });

  it('is a no-op when no active world set', () => {
    useWorldSetStore.setState({ activeWorldSetName: null, activeWorldSet: null });
    expect(() => useWorldSetStore.getState().removeNode('root')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------

describe('updateNode', () => {
  beforeEach(() => {
    useWorldSetStore.setState({
      activeWorldSetName: 'ws',
      activeWorldSet: makeWorldSet([
        makeNode({ mapName: 'root' }),
        makeNode({
          mapName: 'child',
          parentMapName: 'root',
          parentAnchor: { col: 1, row: 1 },
          z: 0,
          zLabel: 'ground',
        }),
      ]),
    });
  });

  it('patches parentAnchor without touching z or zLabel', () => {
    useWorldSetStore.getState().updateNode('child', { parentAnchor: { col: 9, row: 9 } });
    const child = useWorldSetStore.getState().activeWorldSet!.nodes.find((n) => n.mapName === 'child')!;
    expect(child.parentAnchor).toEqual({ col: 9, row: 9 });
    expect(child.z).toBe(0);
    expect(child.zLabel).toBe('ground');
  });

  it('patches z and zLabel together', () => {
    useWorldSetStore.getState().updateNode('child', { z: 2, zLabel: 'upstairs' });
    const child = useWorldSetStore.getState().activeWorldSet!.nodes.find((n) => n.mapName === 'child')!;
    expect(child.z).toBe(2);
    expect(child.zLabel).toBe('upstairs');
  });

  it('does not alter parentMapName even if passed unknown keys', () => {
    useWorldSetStore.getState().updateNode('child', { z: 5 });
    const child = useWorldSetStore.getState().activeWorldSet!.nodes.find((n) => n.mapName === 'child')!;
    expect(child.parentMapName).toBe('root');
  });

  it('is a no-op for an unknown mapName', () => {
    const before = JSON.stringify(useWorldSetStore.getState().activeWorldSet);
    useWorldSetStore.getState().updateNode('nope', { z: 99 });
    const after = JSON.stringify(useWorldSetStore.getState().activeWorldSet);
    expect(after).toBe(before);
  });

  it('is a no-op when no active world set', () => {
    useWorldSetStore.setState({ activeWorldSetName: null, activeWorldSet: null });
    expect(() => useWorldSetStore.getState().updateNode('root', { z: 1 })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------

describe('computed helpers', () => {
  beforeEach(() => {
    // Multi-root tree:
    //   rootA → c1 → g1
    //   rootA → c2
    //   rootB
    useWorldSetStore.setState({
      activeWorldSetName: 'ws',
      activeWorldSet: makeWorldSet([
        makeNode({ mapName: 'rootA' }),
        makeNode({ mapName: 'rootB' }),
        makeNode({ mapName: 'c1', parentMapName: 'rootA', parentAnchor: { col: 0, row: 0 } }),
        makeNode({ mapName: 'c2', parentMapName: 'rootA', parentAnchor: { col: 1, row: 1 } }),
        makeNode({ mapName: 'g1', parentMapName: 'c1', parentAnchor: { col: 0, row: 0 } }),
      ]),
    });
  });

  it('rootNodes returns only nodes with parentMapName === null', () => {
    const roots = useWorldSetStore.getState().rootNodes();
    expect(roots.map((n) => n.mapName).sort()).toEqual(['rootA', 'rootB']);
  });

  it('childrenOf returns direct children only (not grandchildren)', () => {
    const kids = useWorldSetStore.getState().childrenOf('rootA');
    expect(kids.map((n) => n.mapName).sort()).toEqual(['c1', 'c2']);
  });

  it('childrenOf on a leaf returns an empty array', () => {
    expect(useWorldSetStore.getState().childrenOf('g1')).toEqual([]);
  });

  it('parentOf returns the parent node', () => {
    const parent = useWorldSetStore.getState().parentOf('g1');
    expect(parent?.mapName).toBe('c1');
  });

  it('parentOf on a root returns null', () => {
    expect(useWorldSetStore.getState().parentOf('rootA')).toBeNull();
  });

  it('parentOf on an unknown node returns null', () => {
    expect(useWorldSetStore.getState().parentOf('ghost')).toBeNull();
  });

  it('all helpers return empty/null when no active world set', () => {
    useWorldSetStore.setState({ activeWorldSetName: null, activeWorldSet: null });
    expect(useWorldSetStore.getState().rootNodes()).toEqual([]);
    expect(useWorldSetStore.getState().childrenOf('anything')).toEqual([]);
    expect(useWorldSetStore.getState().parentOf('anything')).toBeNull();
  });
});
