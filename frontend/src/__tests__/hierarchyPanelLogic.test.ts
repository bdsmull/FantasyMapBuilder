import { describe, it, expect } from 'vitest';
import {
  getWarnings,
  toggleCollapse,
  isNodeCollapsed,
  resolveFeetPerUnit,
} from '../utils/hierarchyPanelLogic';
import type { CollapseState, WarningContext } from '../utils/hierarchyPanelLogic';
import type { WorldSetNode } from '../types/worldSet';
import type { TmjMap } from '../types/tmj';

function mkMap(overrides: Partial<TmjMap> = {}): TmjMap {
  return {
    width: 10, height: 10, tilewidth: 32, tileheight: 32,
    orientation: 'orthogonal', renderorder: 'right-down',
    infinite: false, layers: [], tilesets: [], type: 'map',
    version: '1.10', tiledversion: '1.11', nextlayerid: 1, nextobjectid: 1,
    ...overrides,
  } as TmjMap;
}
function mkNode(o: Partial<WorldSetNode> & { mapName: string }): WorldSetNode {
  return { parentMapName: null, parentAnchor: null, z: 0, zLabel: null, ...o };
}

describe('resolveFeetPerUnit', () => {
  it('returns feetPerUnit when set', () => {
    expect(resolveFeetPerUnit(mkMap({ feetPerUnit: 7 }))).toBe(7);
  });
  it('falls back to MAP_SCALE_BY_ID[scale] when feetPerUnit absent', () => {
    expect(resolveFeetPerUnit(mkMap({ scale: 'building' }))).toBe(5);
  });
  it('returns undefined when no scale info', () => {
    expect(resolveFeetPerUnit(mkMap())).toBeUndefined();
  });
});

describe('getWarnings', () => {
  const knownMapNames = new Set(['m', 'parent', 'sibling']);

  it('returns [] when map data not in cache (Pitfall 2)', () => {
    const ctx: WarningContext = { mapDataCache: {}, knownMapNames, allNodes: [] };
    expect(getWarnings(mkNode({ mapName: 'm' }), ctx)).toEqual([]);
  });

  it('flags missing-map when mapName not in knownMapNames', () => {
    const ctx: WarningContext = { mapDataCache: {}, knownMapNames: new Set(['other']), allNodes: [] };
    const warnings = getWarnings(mkNode({ mapName: 'm' }), ctx);
    expect(warnings.some((w) => w.includes('Missing map'))).toBe(true);
    expect(warnings.some((w) => w.includes("'m'"))).toBe(true);
  });

  it('flags missing-scale when map cached but has no feetPerUnit / scale', () => {
    const ctx: WarningContext = { mapDataCache: { m: mkMap() }, knownMapNames, allNodes: [] };
    expect(getWarnings(mkNode({ mapName: 'm' }), ctx))
      .toEqual(['Missing scale: no feetPerUnit set on this map']);
  });

  it('does NOT flag missing-scale when map has scale id but no feetPerUnit', () => {
    const ctx: WarningContext = { mapDataCache: { m: mkMap({ scale: 'building' }) }, knownMapNames, allNodes: [] };
    expect(getWarnings(mkNode({ mapName: 'm' }), ctx))
      .toEqual([]); // resolveFeetPerUnit falls back via MAP_SCALE_BY_ID
  });

  it('flags scale inversion when childFPU >= parentFPU', () => {
    const ctx: WarningContext = {
      mapDataCache: {
        m: mkMap({ feetPerUnit: 5 }),
        parent: mkMap({ feetPerUnit: 5 }),
      },
      knownMapNames,
      allNodes: [],
    };
    const node = mkNode({ mapName: 'm', parentMapName: 'parent', parentAnchor: { col: 0, row: 0 } });
    const warnings = getWarnings(node, ctx);
    expect(warnings.some((w) => w.includes('Scale inversion'))).toBe(true);
  });

  it('does NOT flag scale inversion when childFPU < parentFPU', () => {
    const ctx: WarningContext = {
      mapDataCache: {
        m: mkMap({ feetPerUnit: 5 }),
        parent: mkMap({ feetPerUnit: 10 }),
      },
      knownMapNames,
      allNodes: [],
    };
    const node = mkNode({ mapName: 'm', parentMapName: 'parent', parentAnchor: { col: 0, row: 0 } });
    const warnings = getWarnings(node, ctx);
    expect(warnings.some((w) => w.includes('Scale inversion'))).toBe(false);
  });

  it('flags footprint overlap when siblings at same z+parent overlap', () => {
    const node = mkNode({ mapName: 'm', parentMapName: 'parent', parentAnchor: { col: 5, row: 5 }, z: 0 });
    const sibling = mkNode({ mapName: 'sibling', parentMapName: 'parent', parentAnchor: { col: 5, row: 5 }, z: 0 });
    const ctx: WarningContext = {
      mapDataCache: {
        m: mkMap({ feetPerUnit: 5, width: 4, height: 4 }),
        parent: mkMap({ feetPerUnit: 10 }),
        sibling: mkMap({ feetPerUnit: 5, width: 4, height: 4 }),
      },
      knownMapNames,
      allNodes: [node, sibling],
    };
    const warnings = getWarnings(node, ctx);
    expect(warnings.some((w) => w.includes('Footprint overlap') && w.includes('sibling'))).toBe(true);
  });

  it('does NOT flag overlap for siblings at DIFFERENT z levels', () => {
    const node = mkNode({ mapName: 'm', parentMapName: 'parent', parentAnchor: { col: 5, row: 5 }, z: 0 });
    const sibling = mkNode({ mapName: 'sibling', parentMapName: 'parent', parentAnchor: { col: 5, row: 5 }, z: 1 });
    const ctx: WarningContext = {
      mapDataCache: {
        m: mkMap({ feetPerUnit: 5, width: 4, height: 4 }),
        parent: mkMap({ feetPerUnit: 10 }),
        sibling: mkMap({ feetPerUnit: 5, width: 4, height: 4 }),
      },
      knownMapNames,
      allNodes: [node, sibling],
    };
    const warnings = getWarnings(node, ctx);
    expect(warnings.some((w) => w.includes('Footprint overlap'))).toBe(false);
  });
});

describe('toggleCollapse', () => {
  it('adds mapName when not present', () => {
    const out = toggleCollapse({}, 'ws1', 'mapA');
    expect(out.ws1.has('mapA')).toBe(true);
  });

  it('removes mapName when present (toggle off)', () => {
    const initial: CollapseState = { ws1: new Set(['mapA']) };
    const out = toggleCollapse(initial, 'ws1', 'mapA');
    expect(out.ws1.has('mapA')).toBe(false);
  });

  it('returns a new outer Record (immutable update)', () => {
    const initial: CollapseState = { ws1: new Set(['mapA']) };
    const out = toggleCollapse(initial, 'ws1', 'mapB');
    expect(out).not.toBe(initial);
    expect(out.ws1).not.toBe(initial.ws1);
    expect(initial.ws1.has('mapB')).toBe(false); // input not mutated
  });

  it('preserves other world set keys', () => {
    const initial: CollapseState = { ws1: new Set(['a']), ws2: new Set(['b']) };
    const out = toggleCollapse(initial, 'ws1', 'c');
    expect(out.ws2).toBe(initial.ws2); // untouched key reference preserved
  });
});

describe('isNodeCollapsed', () => {
  const state: CollapseState = { ws1: new Set(['mapA']) };
  it('returns true when mapName is in the world set\'s collapse set', () => {
    expect(isNodeCollapsed(state, 'ws1', 'mapA')).toBe(true);
  });
  it('returns false when mapName not collapsed', () => {
    expect(isNodeCollapsed(state, 'ws1', 'mapB')).toBe(false);
  });
  it('returns false when worldSetName is null', () => {
    expect(isNodeCollapsed(state, null, 'mapA')).toBe(false);
  });
  it('returns false when world set absent from state', () => {
    expect(isNodeCollapsed(state, 'unknown-ws', 'mapA')).toBe(false);
  });
});
