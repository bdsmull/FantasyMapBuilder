# Tilesets

A **tileset** is a palette of tiles: a PNG sprite sheet, or a set of plain colors. Tiles are
painted onto tile layers; each tile can carry a name and custom properties.

---

## Shared by the world set

A world set keeps its tilesets as **Tiled external tilesets** (`tilesets/<Name>.tsj`) that every
map in it refers to. Change a tile (its name, color, or height settings) and every map using that
tileset shows the change. Tiled opens these files directly.

Color-only tilesets also get a generated swatch image (`tilesets/<Name>.png`) so Tiled can show
them; the editor draws them from each tile's `color_r` / `color_g` / `color_b` properties.

---

## Managing tilesets

**Edit → Manage Tilesets…** lists the open map's tilesets:

| Action | Effect |
|---|---|
| **Load Built-in Default** | Adds the color tileset for square or hex maps (once) |
| **Add from PNG…** | Adds your own sprite sheet: give a name and the tile size; one tile per cell of the sheet |
| **Heights…** | Base height and relief for each terrain type (see below) |
| **Remove** | Removes a tileset no layer uses |

The **tile palette** shows the active tileset; hover a tile to see its name, click to select it
for Paint and Fill. Hide the palette with its × or `P`.

---

## Terrain heights

Each tile can have two optional custom properties (floats, meters), used by
[Heights from terrain](elevation.md#heights-from-terrain) and [Generate](elevation.md#generate):

| Property | Meaning |
|---|---|
| `heightBase` | Typical ground height of this terrain |
| `heightRelief` | How much the ground varies within it |

Edit them with **Heights…** (in the map's units). **Suggest values** fills blanks for common
terrain names; nothing changes until **Apply**. They're saved into the shared `.tsj` when the map
is saved.

---

## Built-in tilesets

### "Default Tile" — square maps (16 tiles)

| Local ID | Name | Category |
|----------|------|----------|
| 0 | Grass | Terrain |
| 1 | Dirt | Terrain |
| 2 | Sand | Terrain |
| 3 | Stone Floor | Terrain |
| 4 | Water | Terrain |
| 5 | Deep Water | Terrain |
| 6 | Snow | Terrain |
| 7 | Lava | Terrain |
| 8 | Stone Wall | Wall |
| 9 | Brick Wall | Wall |
| 10 | Ice Wall | Wall |
| 11 | Tree | Object |
| 12 | Rock | Object |
| 13 | Chest | Object |
| 14 | Door | Object |
| 15 | Spawn | Special |

### "Default Hex" — hex maps (12 tiles)

| Local ID | Name | Category |
|----------|------|----------|
| 0 | Plains | Terrain |
| 1 | Forest | Terrain |
| 2 | Hills | Terrain |
| 3 | Mountains | Terrain |
| 4 | Ocean | Terrain |
| 5 | Coast | Terrain |
| 6 | Desert | Terrain |
| 7 | Swamp | Terrain |
| 8 | Tundra | Terrain |
| 9 | Volcano | Terrain |
| 10 | City | Object |
| 11 | Dungeon | Special |

Each built-in tile carries `color_r`, `color_g`, `color_b` and `category` properties.

---

## Global tile IDs (GIDs)

Layer data stores **global** tile IDs, as in Tiled: each tileset in a map has a `firstgid`, and a
tile's GID is `firstgid + local ID`. `0` means an empty cell. The top bits of a GID are Tiled's
flip flags; the editor preserves them.

For a sprite sheet, a tile's position follows from its local ID:

```
srcX = (localId % columns) * tilewidth
srcY = floor(localId / columns) * tileheight
```

---

## Python model

The Python library (`map_editor/models/tileset.py`) models tilesets as `Tileset` objects with
`TileDefinition` entries (1-based `id`, `name`, RGB `color`, `category`, sheet position) and can
generate placeholder PNG sheets with Pillow (rectangles for square maps, flat-topped hexagons for
hex maps) into `map_editor/assets/placeholders/`. The web editor doesn't need these files.

| Category | `TileCategory` | Notes |
|----------|---------------|-------|
| Terrain | `TERRAIN` | Passable |
| Wall | `WALL` | Impassable (`is_passable` is `False` only for walls) |
| Object | `OBJECT` | Passable |
| Special | `SPECIAL` | Doors, traps, triggers |

```python
ts = tile_map.tileset_for_gid(gid)   # which tileset owns this GID
local = tile_map.local_id(gid)       # 1-based ID within it
tile_def = ts.tile_by_id(local)      # the TileDefinition
```
