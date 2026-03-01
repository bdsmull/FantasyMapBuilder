/**
 * Built-in default tileset definitions.
 * Mirrors the placeholder tile data from map_editor/models/tileset.py.
 * Tiles render as solid-colored blocks using their color_r/g/b properties.
 */

import type { TmjTileset, TmjTileEntry } from '../types/tmj';

function t(
  id: number, type: string,
  r: number, g: number, b: number,
  cat: string,
): TmjTileEntry {
  return {
    id,
    type,
    properties: [
      { name: 'color_r', type: 'int', value: r },
      { name: 'color_g', type: 'int', value: g },
      { name: 'color_b', type: 'int', value: b },
      { name: 'category', type: 'string', value: cat },
    ],
  };
}

/** 16-tile dungeon/overworld tileset for orthogonal maps. */
export const DEFAULT_TILE_TILESET: TmjTileset = {
  firstgid: 1,
  name: 'Default Tile',
  tilewidth: 32,
  tileheight: 32,
  tilecount: 16,
  columns: 8,
  image: '',
  imagewidth: 256,
  imageheight: 64,
  tiles: [
    t(0,  'Grass',       106, 168,  79, 'TERRAIN'),
    t(1,  'Dirt',        180, 122,  63, 'TERRAIN'),
    t(2,  'Sand',        230, 210, 140, 'TERRAIN'),
    t(3,  'Stone Floor', 160, 160, 160, 'TERRAIN'),
    t(4,  'Water',        66, 133, 244, 'TERRAIN'),
    t(5,  'Deep Water',   30,  80, 180, 'TERRAIN'),
    t(6,  'Snow',        230, 240, 255, 'TERRAIN'),
    t(7,  'Lava',        220,  80,  20, 'TERRAIN'),
    t(8,  'Stone Wall',   90,  90,  90, 'WALL'),
    t(9,  'Brick Wall',  140,  70,  50, 'WALL'),
    t(10, 'Ice Wall',    180, 220, 240, 'WALL'),
    t(11, 'Tree',         39, 110,  39, 'OBJECT'),
    t(12, 'Rock',        120, 110, 100, 'OBJECT'),
    t(13, 'Chest',       200, 170,  50, 'OBJECT'),
    t(14, 'Door',        140, 100,  60, 'OBJECT'),
    t(15, 'Spawn',       255,  80, 180, 'SPECIAL'),
  ],
};

/** 12-tile world-scale tileset for hexagonal maps. */
export const DEFAULT_HEX_TILESET: TmjTileset = {
  firstgid: 1,
  name: 'Default Hex',
  tilewidth: 32,
  tileheight: 32,
  tilecount: 12,
  columns: 8,
  image: '',
  imagewidth: 256,
  imageheight: 64,
  tiles: [
    t(0,  'Plains',    144, 200,  80, 'TERRAIN'),
    t(1,  'Forest',     34, 120,  34, 'TERRAIN'),
    t(2,  'Hills',     160, 140,  90, 'TERRAIN'),
    t(3,  'Mountains', 110, 100, 110, 'TERRAIN'),
    t(4,  'Ocean',      30,  80, 180, 'TERRAIN'),
    t(5,  'Coast',      90, 160, 220, 'TERRAIN'),
    t(6,  'Desert',    220, 195, 110, 'TERRAIN'),
    t(7,  'Swamp',      80, 110,  60, 'TERRAIN'),
    t(8,  'Tundra',    190, 210, 220, 'TERRAIN'),
    t(9,  'Volcano',   180,  50,  20, 'TERRAIN'),
    t(10, 'City',      190, 190, 190, 'OBJECT'),
    t(11, 'Dungeon',    80,  60,  80, 'SPECIAL'),
  ],
};
