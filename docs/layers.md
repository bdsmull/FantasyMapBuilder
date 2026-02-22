# Layers

Maps are composed of **layers** stacked from bottom to top. There are two layer types.

---

## Common properties

Both `TileLayer` and `ObjectLayer` share these attributes:

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `name` | `str` | — | Unique name within the map |
| `visible` | `bool` | `True` | Whether the layer is rendered |
| `opacity` | `float` | `1.0` | Transparency, 0.0 (invisible) – 1.0 (opaque) |
| `offset_x` | `int` | `0` | Horizontal pixel offset applied during rendering |
| `offset_y` | `int` | `0` | Vertical pixel offset applied during rendering |

Hidden layers (`visible=False`) are skipped entirely by the renderer. Semi-transparent
layers use `opacity < 1.0` to blend with layers below.

---

## TileLayer

`TileLayer` stores a 2-D grid of integer tile IDs in row-major order. An ID of `0` means
"empty" — nothing is drawn for that cell. IDs ≥ 1 reference tiles in an attached tileset
via their global tile ID.

### Tile access

| Method | Description |
|--------|-------------|
| `get_tile(col, row)` | Returns the tile ID at (col, row), or `0` if out of range |
| `set_tile(col, row, tile_id)` | Sets the tile ID at (col, row) |

### Bulk operations

| Method | Description |
|--------|-------------|
| `clear()` | Sets every cell to `0` |
| `fill(tile_id)` | Sets every cell to the given ID |
| `flood_fill(col, row, new_id)` | Replaces the contiguous same-tile region starting at (col, row) with `new_id`; returns a list of `(col, row)` cells that changed |

### Serialisation helpers

| Method | Description |
|--------|-------------|
| `to_flat()` | Returns the grid as a flat `list[int]` in row-major order (Tiled format) |
| `TileLayer.from_flat(data, width, height)` | Class method; creates a `TileLayer` from a flat list |

### Copying

```python
layer_copy = tile_layer.copy()  # deep copy — changes to the copy do not affect the original
```

---

## ObjectLayer

`ObjectLayer` holds an unordered list of `MapObject` entities. Unlike tile layers, there is
no grid — objects are positioned by pixel coordinates.

### Object management

| Method | Description |
|--------|-------------|
| `add_object(obj)` | Adds an object to the layer |
| `remove_object(obj)` | Removes an object by reference |
| `remove_by_id(object_id)` | Removes an object by its unique ID |
| `object_by_id(object_id)` | Returns the object with the given ID, or `None` |

### Spatial hit-testing

```python
hits = obj_layer.objects_at(x, y, tile_w, tile_h)
```

Returns all **visible** objects whose hitbox overlaps the given pixel point:

- `POINT` objects — circular test with radius `tile_w // 2`
- All other shapes — bounding-box test using `(x, y, width, height)`

---

## Layer ordering

Layers are rendered in the order they appear in `map.layers`, bottom to top. Use the map
methods to reorder them:

| Method | Description |
|--------|-------------|
| `move_layer_up(layer)` | Moves a layer one position toward the top of the stack |
| `move_layer_down(layer)` | Moves a layer one position toward the bottom |
| `remove_layer(layer)` | Removes a layer from the map |

### Example stack for a dungeon map

```
[top]    Objects       ← ObjectLayer  NPCs, chests, triggers
         Decals        ← TileLayer    blood, rubble overlays
         Ground        ← TileLayer    floor and wall tiles
[bottom]
```
