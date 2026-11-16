/**
 * Elevation in the client and map store: binary transfer, add/remove, and saving
 * heights together with the map.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TmjMap } from '../types/tmj';

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return { ...actual, saveMap: vi.fn().mockResolvedValue([]), putHeights: vi.fn(), deleteHeights: vi.fn() };
});

import * as client from '../api/client';
import { useMapStore } from '../store/mapStore';

const map: TmjMap = {
  orientation: 'orthogonal', width: 2, height: 1, tilewidth: 16, tileheight: 16,
  nextlayerid: 1, nextobjectid: 1, tilesets: [], layers: [],
  properties: [{ name: 'author', type: 'string', value: 'Brad' }],
};

describe('getHeights / putHeights (binary transfer)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('decodes little-endian int32 heights followed by the mask', async () => {
    const buf = new ArrayBuffer(2 * 5);
    const view = new DataView(buf);
    view.setInt32(0, -1099400, true);
    view.setInt32(4, 884800, true);
    new Uint8Array(buf, 8).set([1, 0]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(buf, {
      status: 200, headers: { 'X-Height-Cols': '2', 'X-Height-Rows': '1' },
    })));
    const { getHeights } = await vi.importActual<typeof import('../api/client')>('../api/client');
    const patch = await getHeights('ws', 'm');
    expect(patch && Array.from(patch.cm)).toEqual([-1099400, 884800]);
    expect(patch && Array.from(patch.mask)).toEqual([1, 0]);
  });

  it('returns null when the map has no elevation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 404 })));
    const { getHeights } = await vi.importActual<typeof import('../api/client')>('../api/client');
    expect(await getHeights('ws', 'm')).toBeNull();
  });

  it('encodes the patch with grid headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { putHeights } = await vi.importActual<typeof import('../api/client')>('../api/client');
    await putHeights('Brakka', 'm', { cols: 2, rows: 1, cm: Int32Array.from([7, -7]), mask: Uint8Array.from([0, 1]) });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/world_sets/Brakka/heights/m');
    expect(init.method).toBe('PUT');
    expect(init.headers['X-Height-Cols']).toBe('2');
    const view = new DataView(init.body as ArrayBuffer);
    expect([view.getInt32(0, true), view.getInt32(4, true), view.getUint8(8), view.getUint8(9)]).toEqual([7, -7, 0, 1]);
  });
});

describe('map store elevation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useMapStore.getState().loadMap(map, 'm', 'ws');
  });

  it('addElevation creates a patch, links it and marks the map changed', () => {
    useMapStore.getState().addElevation(124050);
    const s = useMapStore.getState();
    expect(s.heights?.cols).toBe(3);
    expect(Array.from(s.heights?.cm ?? [])).toEqual(Array(6).fill(124050));
    expect(s.isDirty && s.heightsDirty).toBe(true);
    expect(s.mapData?.properties).toEqual([
      { name: 'author', type: 'string', value: 'Brad' },
      { name: 'heights', type: 'file', value: '../heights/m.tif' },
    ]);
  });

  it('saving writes heights before the map, then clears both dirty flags', async () => {
    useMapStore.getState().addElevation(0);
    await useMapStore.getState().saveMapToServer();
    expect(client.putHeights).toHaveBeenCalledWith('ws', 'm', useMapStore.getState().heights);
    expect(vi.mocked(client.putHeights).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(client.saveMap).mock.invocationCallOrder[0]);
    expect(useMapStore.getState().isDirty).toBe(false);
    expect(useMapStore.getState().heightsDirty).toBe(false);
  });

  it('saving unchanged heights does not rewrite them', async () => {
    useMapStore.getState().setHeights({ cols: 3, rows: 2, cm: new Int32Array(6), mask: new Uint8Array(6) });
    await useMapStore.getState().saveMapToServer();
    expect(client.putHeights).not.toHaveBeenCalled();
  });

  it('removeElevation drops the link and deletes the heights on save', async () => {
    useMapStore.getState().addElevation(0);
    useMapStore.getState().removeElevation();
    expect(useMapStore.getState().heights).toBeNull();
    expect(useMapStore.getState().mapData?.properties).toEqual([{ name: 'author', type: 'string', value: 'Brad' }]);
    await useMapStore.getState().saveMapToServer();
    expect(client.deleteHeights).toHaveBeenCalledWith('ws', 'm');
    expect(client.putHeights).not.toHaveBeenCalled();
  });

  it('loading another map clears the previous elevation', () => {
    useMapStore.getState().addElevation(5);
    useMapStore.getState().loadMap(map, 'other', 'ws');
    expect(useMapStore.getState().heights).toBeNull();
    expect(useMapStore.getState().heightsDirty).toBe(false);
  });
});
