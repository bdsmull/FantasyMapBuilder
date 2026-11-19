# Map Types

Every map is a grid of either **square** cells or **hexagons**, at any [scale](world-sets.md#scales-and-units).
Squares suit buildings, dungeons and battle grids; hexes suit overland travel. Both support
the same layers, tilesets, objects, elevation, and roads and rivers.

---

## Square maps

| Setting | Meaning |
|---|---|
| Width × height | Size in cells |
| Tile W × Tile H | On-screen cell size in pixels (does not change the real-world size, which is the scale) |

Saved with Tiled `orientation: "orthogonal"`.

---

## Hex maps

Hex maps use **Tiled's hex geometry** exactly, so a map looks and lines up the same in Tiled and
in the editor:

| Tiled field | Meaning |
|---|---|
| `tilewidth` × `tileheight` | The hex's bounding box in pixels |
| `hexsidelength` | Length of the flat sides along the stagger axis |
| `staggeraxis` | `x`: flat-topped hexes, columns shifted; `y`: pointy-topped, rows shifted |
| `staggerindex` | `odd` or `even`: which columns (or rows) are shifted half a cell |

**New Map** creates regular, flat-topped hexes (`staggeraxis: x`, `staggerindex: odd`) from the
**Hex Side** length. Maps with other settings, made in Tiled, open and edit correctly.

```
Flat-topped (stagger axis x)      Pointy-topped (stagger axis y)
   ___     ___                        /\    /\
  /   \___/   \                      /  \  /  \
  \___/   \___/                     |    ||    |
      \___/                          \  /  \  /
                                      \/    \/
```

---

## Changing a map

- **File → Map Properties…** — scale and units
- **Layers panel** — add, remove, reorder and fade layers ([Layers](layers.md))
- The grid size and shape are fixed once a map is created.

---

## Python model

The Python library in `map_editor/` (used by the Python tests and for scripting, not by the web
editor) has its own map classes.

!!! note
    The Python `HexMap` describes hexes by their circumradius (`hex_size`) and uses its own
    geometry; it predates the editor's switch to Tiled's hex geometry. Use Tiled's fields above
    when working with files the editor saves.

### `TileMap`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `name` | `str` | — | Human-readable map name |
| `width` | `int` | — | Number of columns |
| `height` | `int` | — | Number of rows |
| `tile_width` | `int` | `32` | Cell width in pixels |
| `tile_height` | `int` | `32` | Cell height in pixels |
| `tilesets` | `list[Tileset]` | — | Tilesets attached to this map |
| `layers` | `list[Layer]` | — | Layers, ordered bottom → top |

`pixel_width` = `width × tile_width`; `pixel_height` = `height × tile_height`.

```python
from pathlib import Path
from map_editor.models.tile_map import TileMap

tile_map = TileMap.create_new(
    name="My Dungeon",
    width=20,
    height=15,
    placeholder_dir=Path("map_editor/assets/placeholders"),
)
```

`create_new` adds a `Ground` tile layer, an `Objects` object layer and the built-in
placeholder tileset.

### `HexMap`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `name` | `str` | — | Human-readable map name |
| `cols` | `int` | — | Number of columns |
| `rows` | `int` | — | Number of rows |
| `hex_size` | `float` | `40.0` | Circumradius of each hex in pixels |
| `orientation` | `HexOrientation` | — | `FLAT_TOP` or `POINTY_TOP` |
| `tilesets` | `list[Tileset]` | — | Tilesets attached to this map |
| `layers` | `list[Layer]` | — | Layers, ordered bottom → top |

```python
from pathlib import Path
from map_editor.models.hex_map import HexMap, HexOrientation

hex_map = HexMap.create_new(
    name="My World",
    cols=12,
    rows=10,
    hex_size=40.0,
    orientation=HexOrientation.FLAT_TOP,
    placeholder_dir=Path("map_editor/assets/placeholders"),
)
```

### Shared API

Both classes expose the same helpers.

| Method | Description |
|--------|-------------|
| `primary_tileset()` | The first tileset |
| `add_tileset(ts)` | Append a tileset |
| `tileset_for_gid(gid)` | The tileset that owns a global tile ID |
| `local_id(gid)` | Global tile ID → local (1-based) ID |
| `tile_layers()` / `object_layers()` | Layers of each kind |
| `layer_by_name(name)` | Look up a layer |
| `add_tile_layer(layer)` / `add_object_layer(layer)` | Append a layer |
| `remove_layer(layer)` | Remove a layer |
| `move_layer_up(layer)` / `move_layer_down(layer)` | Reorder |
| `get_tile(col, row)` / `set_tile(col, row, tile_id)` | Shortcuts to the first tile layer |
