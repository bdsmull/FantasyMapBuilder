import { describe, it, expect, beforeEach } from 'vitest';
import { useMapStore } from '../store/mapStore';
import type { TmjMap, TmjTileLayer } from '../types/tmj';
import { isTileLayer, isObjectLayer } from '../types/tmj';

function makeMap(): TmjMap {
  const tile = (id: number, name: string): TmjTileLayer => ({
    type: 'tilelayer', id, name, width: 2, height: 2, visible: true, opacity: 1, offsetx: 0, offsety: 0, data: [0, 0, 0, 0],
  });
  return {
    orientation: 'orthogonal', width: 2, height: 2, tilewidth: 16, tileheight: 16,
    nextlayerid: 3, nextobjectid: 1, tilesets: [], layers: [tile(1, 'Ground'), tile(2, 'Detail')],
  };
}

const store = () => useMapStore.getState();
const names = () => store().mapData!.layers.map((l) => l.name);

beforeEach(() => {
  store().loadMap(makeMap(), 'm', 'ws');
  store().setActiveLayer(0);
});

describe('addLayer', () => {
  it('adds a tile layer above the active one, with a fresh id and a unique name', () => {
    store().addLayer('tile');
    expect(names()).toEqual(['Ground', 'Tile Layer 1', 'Detail']);
    const layer = store().mapData!.layers[1];
    expect(layer.id).toBe(3);
    expect(store().mapData!.nextlayerid).toBe(4);
    expect(isTileLayer(layer) && layer.data).toEqual([0, 0, 0, 0]);
    expect(store().activeLayerIndex).toBe(1);
    expect(store().isDirty).toBe(true);
    store().addLayer('tile');
    expect(names()).toContain('Tile Layer 2');
  });

  it('adds an object layer', () => {
    store().addLayer('object');
    const layer = store().mapData!.layers[1];
    expect(isObjectLayer(layer) && layer.objects).toEqual([]);
    expect(layer.name).toBe('Object Layer 1');
  });

  it('undo removes it and restores the active layer and next id; redo brings it back', () => {
    store().addLayer('tile');
    store().undo();
    expect(names()).toEqual(['Ground', 'Detail']);
    expect(store().activeLayerIndex).toBe(0);
    expect(store().mapData!.nextlayerid).toBe(3);
    store().redo();
    expect(names()).toEqual(['Ground', 'Tile Layer 1', 'Detail']);
    expect(store().activeLayerIndex).toBe(1);
  });
});

describe('renameLayer', () => {
  it('renames, and ignores blank or unchanged names', () => {
    store().renameLayer(0, '  Terrain  ');
    expect(names()[0]).toBe('Terrain');
    const steps = store().past.length;
    store().renameLayer(0, '   ');
    store().renameLayer(0, 'Terrain');
    expect(store().past.length).toBe(steps);
    store().undo();
    expect(names()[0]).toBe('Ground');
  });
});

describe('deleteLayer', () => {
  it('deletes and keeps the active layer pointing at a remaining layer', () => {
    store().setActiveLayer(1);
    store().deleteLayer(0);
    expect(names()).toEqual(['Detail']);
    expect(store().activeLayerIndex).toBe(0);
    store().undo();
    expect(names()).toEqual(['Ground', 'Detail']);
    expect(store().activeLayerIndex).toBe(1);
  });

  it('refuses to delete the last layer', () => {
    store().deleteLayer(1);
    store().deleteLayer(0);
    expect(names()).toEqual(['Ground']);
  });
});

describe('moveLayer', () => {
  it('moves up and down; the active layer follows; out-of-range moves do nothing', () => {
    store().moveLayer(0, 1);
    expect(names()).toEqual(['Detail', 'Ground']);
    expect(store().activeLayerIndex).toBe(1);
    const steps = store().past.length;
    store().moveLayer(1, 1);
    store().moveLayer(0, -1);
    expect(store().past.length).toBe(steps);
    store().undo();
    expect(names()).toEqual(['Ground', 'Detail']);
  });

  it('older tile edits still undo onto the right layer after a move', () => {
    store().applyTile(0, 1, 1, 5);   // paint on Ground (index 0)
    store().commitPendingTiles();
    store().moveLayer(0, 1);         // Ground is now index 1
    store().undo();                  // undo the move
    store().undo();                  // undo the paint
    const ground = store().mapData!.layers.find((l) => l.name === 'Ground');
    const detail = store().mapData!.layers.find((l) => l.name === 'Detail');
    expect(isTileLayer(ground!) && ground.data).toEqual([0, 0, 0, 0]);
    expect(isTileLayer(detail!) && detail.data).toEqual([0, 0, 0, 0]);
  });
});

describe('setLayerOpacity', () => {
  it('clamps to 0..1, marks the map changed, and is not an undo step', () => {
    store().setLayerOpacity(0, 1.7);
    expect(store().mapData!.layers[0].opacity).toBe(1);
    store().setLayerOpacity(0, 0.35);
    expect(store().mapData!.layers[0].opacity).toBe(0.35);
    expect(store().isDirty).toBe(true);
    expect(store().past).toHaveLength(0);
  });
});
