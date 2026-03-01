# Tilesets

A **tileset** is a named collection of tile definitions backed by a PNG sprite sheet. Tiles
are identified by a 1-based integer ID matching the Tiled editor convention (`0` means "empty").

---

## Tile categories

| Category | `TileCategory` | Notes |
|----------|---------------|-------|
| Terrain | `TERRAIN` | Ground, water, grass — passable by default |
| Wall | `WALL` | Solid blocking tiles — always impassable |
| Object | `OBJECT` | Furniture, decorations — passable by default |
| Special | `SPECIAL` | Doors, traps, triggers — passable by default |

The `is_passable` property on `TileDefinition` returns `False` for wall tiles only.

---

## Tile definitions

Each tile in a tileset is a `TileDefinition`:

| Attribute | Type | Description |
|-----------|------|-------------|
| `id` | `int` | Unique 1-based tile ID within this tileset |
| `name` | `str` | Human-readable label (e.g. `"Stone Floor"`) |
| `color` | `tuple[int, int, int]` | RGB fallback colour when no sprite sheet is loaded |
| `category` | `TileCategory` | Gameplay category |
| `sheet_col` | `int` | Column of this tile in the sprite sheet |
| `sheet_row` | `int` | Row of this tile in the sprite sheet |

---

## Built-in default tilesets

The editor ships two built-in tilesets. No external artwork is required — tiles render as
solid-coloured blocks using the `color_r/g/b` properties defined on each tile entry.

The appropriate default is offered automatically when creating a new map and can be added to
an existing map at any time via **Manage Tilesets → Load Built-in Default**.

### Tile-map tileset — "Default Tile" (16 tiles, 8 columns)

Intended for orthogonal (dungeon / overworld) maps.

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

### Hex-map tileset — "Default Hex" (12 tiles, 8 columns)

Intended for hexagonal world-scale maps. Sprite-sheet cells are drawn as flat-top hexagons.

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

> **Note:** Local IDs in the TMJ `tiles` array are 0-based. GIDs stored in layer data
> are `firstgid + localId` (Tiled convention).

---

## Placeholder PNG generation (Python backend)

The Python model (`map_editor/models/tileset.py`) can generate PNG sprite sheets via Pillow:

- **Tile maps** — each cell is a coloured rectangle with a short text label.
- **Hex maps** — each cell is a coloured flat-top hexagon polygon with a text label.

Generated files are saved to `map_editor/assets/placeholders/`. The web frontend does not
require these PNGs — it renders tiles as solid-coloured blocks directly from the
`color_r/g/b` properties stored in the TMJ file.

---

## Custom sprite sheets

To use your own artwork, open **Manage Tilesets** and click **Add from PNG…**.
Browse to any PNG sprite sheet, enter a tileset name and tile dimensions, and the editor
builds tile stubs automatically — one per cell in the sheet.

Each tile's position in the sheet is derived from its local ID:

```
srcX = (localId % columns) * tilewidth
srcY = floor(localId / columns) * tileheight
```

---

## Global tile IDs (GIDs)

When a map has multiple tilesets, each tileset is assigned a `first_gid` offset. Tile IDs
stored in layers are *global* — they encode both the tileset and the local tile position.

Use the map helpers to resolve them:

```python
# Which tileset owns this GID?
ts = tile_map.tileset_for_gid(gid)

# Local 1-based ID within that tileset
local = tile_map.local_id(gid)

# Resolve the TileDefinition
tile_def = ts.tile_by_id(local)
```

This convention matches the Tiled editor.
