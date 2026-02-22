# Map Types

## Tile Map

`TileMap` represents a rectangular grid of square cells, typically used for small-scale areas
such as towns, dungeons, interiors, and tactical combat arenas.

### Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `name` | `str` | — | Human-readable map name |
| `width` | `int` | — | Number of columns |
| `height` | `int` | — | Number of rows |
| `tile_width` | `int` | `32` | Cell width in pixels |
| `tile_height` | `int` | `32` | Cell height in pixels |
| `tilesets` | `list[Tileset]` | — | Tilesets attached to this map |
| `layers` | `list[Layer]` | — | Layers, ordered bottom → top |

### Computed

| Property | Value |
|----------|-------|
| `pixel_width` | `width × tile_width` |
| `pixel_height` | `height × tile_height` |

### Creating a tile map

Use the factory method to get a blank map with a default `Ground` tile layer, an `Objects`
object layer, and the built-in placeholder tileset:

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

---

## Hex Map

`HexMap` represents a hexagonal-cell grid, typically used for large-scale maps such as
regional overviews, continents, and world maps.

### Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `name` | `str` | — | Human-readable map name |
| `cols` | `int` | — | Number of columns |
| `rows` | `int` | — | Number of rows |
| `hex_size` | `float` | `40.0` | Circumradius of each hex in pixels |
| `orientation` | `HexOrientation` | — | `FLAT_TOP` or `POINTY_TOP` |
| `tilesets` | `list[Tileset]` | — | Tilesets attached to this map |
| `layers` | `list[Layer]` | — | Layers, ordered bottom → top |

### Computed

| Property | Description |
|----------|-------------|
| `pixel_width` | Total canvas width in pixels |
| `pixel_height` | Total canvas height in pixels |

### Hex orientations

```
FLAT_TOP                   POINTY_TOP
   ___                        /\
  /   \                      /  \
 |     |                    |    |
  \___/                      \  /
                               \/
```

- **`FLAT_TOP`** — flat edges at the top and bottom; odd columns are shifted down by half a hex height.
- **`POINTY_TOP`** — vertices at the top and bottom; odd rows are shifted right by half a hex width.

### Creating a hex map

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

---

## Shared API

Both `TileMap` and `HexMap` expose the same interface for tilesets and layers.

### Tileset helpers

| Method | Description |
|--------|-------------|
| `primary_tileset()` | Returns the first tileset |
| `add_tileset(ts)` | Appends a tileset |
| `tileset_for_gid(gid)` | Returns the tileset that owns the given global tile ID |
| `local_id(gid)` | Converts a global tile ID to a local (1-based) tileset ID |

### Layer helpers

| Method | Description |
|--------|-------------|
| `tile_layers()` | Returns all `TileLayer` instances |
| `object_layers()` | Returns all `ObjectLayer` instances |
| `layer_by_name(name)` | Looks up a layer by name |
| `add_tile_layer(layer)` | Appends a new tile layer |
| `add_object_layer(layer)` | Appends a new object layer |
| `remove_layer(layer)` | Removes a layer |
| `move_layer_up(layer)` | Moves a layer one step toward the top |
| `move_layer_down(layer)` | Moves a layer one step toward the bottom |

### Tile access shortcuts

Both map types also expose `get_tile(col, row)` and `set_tile(col, row, tile_id)` that
delegate to the first tile layer, for convenience when a map has a single tile layer.
