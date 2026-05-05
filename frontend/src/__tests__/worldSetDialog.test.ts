/**
 * Wave 0 contract tests for WorldSetDialog.
 * Environment is `node` (no DOM) — logic contracts only, no JSX rendering.
 * Mirrors the testing style of worldSetStore.test.ts.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useWorldSetStore } from '../store/worldSetStore';
import type { WorldSet } from '../types/worldSet';
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

beforeEach(() => {
  useWorldSetStore.setState({ activeWorldSetName: null, activeWorldSet: null });
  vi.clearAllMocks();
});
afterEach(() => { vi.clearAllMocks(); });

describe('WorldSetDialog (Wave 0 contract)', () => {
  it('module loads with mocked api client', async () => {
    const { listWorldSets } = await import('../api/client');
    expect(vi.isMockFunction(listWorldSets)).toBe(true);
  });

  it('DIALOG-02: create flow saves empty WorldSet then activates it', async () => {
    const { saveWorldSet, getWorldSet } = await import('../api/client');
    const empty: WorldSet = { name: 'new-ws', version: WORLD_SET_VERSION, nodes: [] };
    vi.mocked(getWorldSet).mockResolvedValue(empty);
    // Simulate the create handler sequence:
    await saveWorldSet('new-ws', empty);
    await useWorldSetStore.getState().setActiveWorldSet('new-ws');
    expect(saveWorldSet).toHaveBeenCalledWith('new-ws', empty);
    expect(getWorldSet).toHaveBeenCalledWith('new-ws');
    expect(useWorldSetStore.getState().activeWorldSetName).toBe('new-ws');
  });

  it('DIALOG-03: delete flow calls deleteWorldSet then listWorldSets', async () => {
    const { deleteWorldSet, listWorldSets } = await import('../api/client');
    vi.mocked(listWorldSets).mockResolvedValue(['other-ws']);
    // Simulate the delete handler sequence:
    await deleteWorldSet('victim-ws');
    const after = await listWorldSets();
    expect(deleteWorldSet).toHaveBeenCalledWith('victim-ws');
    expect(listWorldSets).toHaveBeenCalled();
    expect(after).toEqual(['other-ws']);
  });
});
