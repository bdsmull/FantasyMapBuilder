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

## Built-in placeholder tilesets

The editor ships with two default tilesets generated automatically on first run. No external
artwork is required.

### Tile-map tileset (16 tiles)

| ID | Name | Category |
|----|------|----------|
| 1 | Stone Floor | Terrain |
| 2 | Dirt | Terrain |
| 3 | Grass | Terrain |
| 4 | Sand | Terrain |
| 5 | Water | Terrain |
| 6 | Deep Water | Terrain |
| 7 | Lava | Terrain |
| 8 | Snow | Terrain |
| 9 | Stone Wall | Wall |
| 10 | Brick Wall | Wall |
| 11 | Wood | Object |
| 12 | Door | Special |
| 13 | Stairs | Special |
| 14 | Chest | Object |
| 15 | Dark | Terrain |
| 16 | Fog | Special |

### Hex-map tileset (12 tiles)

| ID | Name | Category |
|----|------|----------|
| 1 | Plains | Terrain |
| 2 | Forest | Terrain |
| 3 | Ocean | Terrain |
| 4 | Mountain | Terrain |
| 5 | Desert | Terrain |
| 6 | Tundra | Terrain |
| 7 | Swamp | Terrain |
| 8 | Hills | Terrain |
| 9 | River | Terrain |
| 10 | City | Special |
| 11 | Dungeon | Special |
| 12 | Volcano | Special |

Hex placeholder tiles are drawn as flat-top hexagons in the sprite sheet so the shapes are
visually recognisable even at a glance.

---

## Placeholder PNG generation

When `Tileset.make_placeholder()` is called, the editor checks whether the PNG sprite sheet
already exists. If not, it generates one using Pillow:

- **Tile maps** — each cell is a coloured rectangle with a short text label.
- **Hex maps** — each cell is a coloured flat-top hexagon polygon with a text label.

Generated files are saved to `map_editor/assets/placeholders/` which is listed in `.gitignore`
and not committed to the repository.

---

## Custom sprite sheets

To use your own artwork, set the `source` attribute on a `Tileset` to the path of a PNG
sprite sheet. Each tile's `sheet_col` and `sheet_row` give its position in the sheet in
units of `tile_width × tile_height` pixels.

Full sprite-sheet import UI is planned for Phase 5.

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
