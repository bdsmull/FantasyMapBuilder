/**
 * Unit tests for the Zustand map store.
 * Tests undo/redo and tile mutation without DOM.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useMapStore } from '../store/mapStore';
import type { TmjMap } from '../types/tmj';

function makeMap(): TmjMap {
  return {
    orientation: 'orthogonal',
    width: 4,
    height: 4,
    tilewidth: 32,
    tileheight: 32,
    nextlayerid: 2,
    nextobjectid: 1,
    tilesets: [],
    layers: [
      {
        type: 'tilelayer',
        name: 'Ground',
        width: 4,
        height: 4,
        visible: true,
        opacity: 1,
        offsetx: 0,
        offsety: 0,
        data: Array(16).fill(0),
      },
    ],
  };
}

function getStore() {
  return useMapStore.getState();
}

beforeEach(() => {
  // Reset store to clean state before each test
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
  });
});

describe('loadMap', () => {
  it('sets mapData and clears undo history', () => {
    const store = getStore();
    store.loadMap(makeMap(), 'test');
    const s = getStore();
    expect(s.mapData).not.toBeNull();
    expect(s.mapName).toBe('test');
    expect(s.past).toHaveLength(0);
    expect(s.future).toHaveLength(0);
  });
});

describe('applyTile + commitPendingTiles', () => {
  it('changes the tile data', () => {
    const store = getStore();
    store.loadMap(makeMap(), 'test');
    store.applyTile(0, 1, 0, 5);
    const layer = getStore().mapData!.layers[0] as { data: number[] };
    expect(layer.data[1]).toBe(5); // col=1, row=0 → index 1
  });

  it('marks map as dirty', () => {
    const store = getStore();
    store.loadMap(makeMap(), 'test');
    store.applyTile(0, 0, 0, 3);
    expect(getStore().isDirty).toBe(true);
  });

  it('commit creates one undo step', () => {
    const store = getStore();
    store.loadMap(makeMap(), 'test');
    store.applyTile(0, 0, 0, 1);
    store.applyTile(0, 1, 0, 2);
    store.commitPendingTiles();
    expect(getStore().past).toHaveLength(1);
    expect(getStore().past[0].type).toBe('tiles');
  });

  it('commit clears pendingTiles', () => {
    const store = getStore();
    store.loadMap(makeMap(), 'test');
    store.applyTile(0, 0, 0, 7);
    store.commitPendingTiles();
    expect(getStore().pendingTiles).toHaveLength(0);
  });
});

describe('undo', () => {
  it('reverts a single tile change', () => {
    const store = getStore();
    store.loadMap(makeMap(), 'test');
    store.applyTile(0, 0, 0, 9);
    store.commitPendingTiles();
    store.undo();
    const layer = getStore().mapData!.layers[0] as { data: number[] };
    expect(layer.data[0]).toBe(0); // restored to original
  });

  it('reverts a batch stroke as one step', () => {
    const store = getStore();
    store.loadMap(makeMap(), 'test');
    store.applyTile(0, 0, 0, 5);
    store.applyTile(0, 1, 0, 5);
    store.applyTile(0, 2, 0, 5);
    store.commitPendingTiles();
    store.undo();
    const layer = getStore().mapData!.layers[0] as { data: number[] };
    expect(layer.data[0]).toBe(0);
    expect(layer.data[1]).toBe(0);
    expect(layer.data[2]).toBe(0);
    expect(getStore().past).toHaveLength(0);
  });

  it('moves step to redo stack', () => {
    const store = getStore();
    store.loadMap(makeMap(), 'test');
    store.applyTile(0, 0, 0, 3);
    store.commitPendingTiles();
    store.undo();
    expect(getStore().future).toHaveLength(1);
  });

  it('does nothing on empty undo stack', () => {
    const store = getStore();
    store.loadMap(makeMap(), 'test');
    store.undo(); // no-op
    expect(getStore().past).toHaveLength(0);
  });
});

describe('redo', () => {
  it('re-applies a tile change after undo', () => {
    const store = getStore();
    store.loadMap(makeMap(), 'test');
    store.applyTile(0, 0, 0, 7);
    store.commitPendingTiles();
    store.undo();
    store.redo();
    const layer = getStore().mapData!.layers[0] as { data: number[] };
    expect(layer.data[0]).toBe(7);
  });

  it('clears redo stack when a new action is committed', () => {
    const store = getStore();
    store.loadMap(makeMap(), 'test');
    store.applyTile(0, 0, 0, 1);
    store.commitPendingTiles();
    store.undo();
    // New action should clear future
    store.applyTile(0, 2, 2, 3);
    store.commitPendingTiles();
    expect(getStore().future).toHaveLength(0);
  });
});
