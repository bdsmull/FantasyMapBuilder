/**
 * Unit tests for navigateToMap dirty-map guard behavior.
 * Mocks the api client's getMap so no network calls happen.
 * Replaces mapStore.saveMapToServer with a vi.fn() spy via setState.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { navigateToMap, activateWorldSet } from '../utils/navigation';
import { useMapStore } from '../store/mapStore';
import { useWorldSetStore } from '../store/worldSetStore';
import type { TmjMap } from '../types/tmj';

// Mock the api client module so navigation.ts's `getMap` import is controllable.
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

function makeTmj(): TmjMap {
  return {
    orientation: 'orthogonal',
    width: 2,
    height: 2,
    tilewidth: 32,
    tileheight: 32,
    nextlayerid: 1,
    nextobjectid: 1,
    tilesets: [],
    layers: [],
  };
}

let saveSpy: ReturnType<typeof vi.fn>;
let loadSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  saveSpy = vi.fn().mockResolvedValue(undefined);
  loadSpy = vi.fn();

  // Reset mapStore to a clean state, then inject our spies
  useMapStore.setState({
    mapData: null,
    mapName: '',
    isDirty: false,
    activeLayerIndex: 0,
    activeGid: 1,
    selectedTool: 'paint',
    zoom: 1,
    pan: { x: 0, y: 0 },
    showGrid: true,
    past: [],
    future: [],
    pendingTiles: [],
    // replace store methods with spies so we can assert calls
    saveMapToServer: saveSpy,
    loadMap: loadSpy,
  });
  // Hierarchy navigation happens inside the active world set
  useWorldSetStore.setState({
    activeWorldSetName: 'ws',
    activeWorldSet: { name: 'ws', version: '1.0', nodes: [] },
  });

  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('navigateToMap', () => {
  it('loads the new map when isDirty is false (saveFirst ignored, no save call)', async () => {
    const { getMap } = await import('../api/client');
    const tmj = makeTmj();
    vi.mocked(getMap).mockResolvedValue(tmj);
    useMapStore.setState({ isDirty: false });

    await navigateToMap('new-map', { saveFirst: true });

    expect(saveSpy).not.toHaveBeenCalled();
    expect(getMap).toHaveBeenCalledWith('ws', 'new-map');
    expect(loadSpy).toHaveBeenCalledWith(tmj, 'new-map', 'ws');
  });

  it('also loads without saving when isDirty=false and saveFirst=false', async () => {
    const { getMap } = await import('../api/client');
    const tmj = makeTmj();
    vi.mocked(getMap).mockResolvedValue(tmj);
    useMapStore.setState({ isDirty: false });

    await navigateToMap('fresh', { saveFirst: false });

    expect(saveSpy).not.toHaveBeenCalled();
    expect(loadSpy).toHaveBeenCalledWith(tmj, 'fresh', 'ws');
  });

  it('saves before loading when isDirty=true and saveFirst=true', async () => {
    const { getMap } = await import('../api/client');
    const tmj = makeTmj();
    vi.mocked(getMap).mockResolvedValue(tmj);
    useMapStore.setState({ isDirty: true });

    await navigateToMap('target', { saveFirst: true });

    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(getMap).toHaveBeenCalledWith('ws', 'target');
    expect(loadSpy).toHaveBeenCalledWith(tmj, 'target', 'ws');

    // Save MUST happen before load — check call order via mock.invocationCallOrder
    expect(saveSpy.mock.invocationCallOrder[0]).toBeLessThan(
      loadSpy.mock.invocationCallOrder[0],
    );
  });

  it('discards without saving when isDirty=true and saveFirst=false', async () => {
    const { getMap } = await import('../api/client');
    const tmj = makeTmj();
    vi.mocked(getMap).mockResolvedValue(tmj);
    useMapStore.setState({ isDirty: true });

    await navigateToMap('target', { saveFirst: false });

    expect(saveSpy).not.toHaveBeenCalled();
    expect(loadSpy).toHaveBeenCalledWith(tmj, 'target', 'ws');
  });

  it('propagates save error and does NOT load when save rejects (saveFirst=true)', async () => {
    const { getMap } = await import('../api/client');
    saveSpy.mockRejectedValue(new Error('save failed'));
    useMapStore.setState({ isDirty: true, saveMapToServer: saveSpy });

    await expect(navigateToMap('target', { saveFirst: true })).rejects.toThrow(/save failed/);

    expect(getMap).not.toHaveBeenCalled();
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it('propagates getMap error and does NOT load when fetch fails', async () => {
    const { getMap } = await import('../api/client');
    vi.mocked(getMap).mockRejectedValue(new Error('404 not found'));
    useMapStore.setState({ isDirty: false });

    await expect(navigateToMap('missing', { saveFirst: false })).rejects.toThrow(/404/);

    expect(loadSpy).not.toHaveBeenCalled();
  });

  it('throws when no world set is active', async () => {
    useWorldSetStore.setState({ activeWorldSetName: null, activeWorldSet: null });
    await expect(navigateToMap('any', { saveFirst: false })).rejects.toThrow(/No active world set/);
    expect(loadSpy).not.toHaveBeenCalled();
  });
});

describe('activateWorldSet', () => {
  let closeSpy: ReturnType<typeof vi.fn>;
  let setActiveSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    closeSpy = vi.fn();
    setActiveSpy = vi.fn().mockResolvedValue(undefined);
    useMapStore.setState({ mapData: makeTmj(), mapName: 'm', mapWorldSet: 'ws', isDirty: false, closeMap: closeSpy });
    useWorldSetStore.setState({ setActiveWorldSet: setActiveSpy });
  });

  it('closes a clean map from another world set when switching', async () => {
    await activateWorldSet('other');
    expect(setActiveSpy).toHaveBeenCalledWith('other');
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('refuses to switch away from a map with unsaved changes, changing nothing', async () => {
    useMapStore.setState({ isDirty: true });
    await expect(activateWorldSet('other')).rejects.toThrow(/unsaved changes/);
    expect(setActiveSpy).not.toHaveBeenCalled();
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it("keeps the open map when re-activating the map's own world set", async () => {
    await activateWorldSet('ws');
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('keeps the open map (even if dirty) when deactivating', async () => {
    useMapStore.setState({ isDirty: true });
    await activateWorldSet(null);
    expect(setActiveSpy).toHaveBeenCalledWith(null);
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('does not close the map when the world set fails to load', async () => {
    setActiveSpy.mockRejectedValue(new Error('404'));
    await expect(activateWorldSet('missing')).rejects.toThrow(/404/);
    expect(closeSpy).not.toHaveBeenCalled();
  });
});
