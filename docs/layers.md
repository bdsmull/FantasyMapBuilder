# Layers

A map is a stack of **layers**, drawn from bottom to top.

| Kind | Contents |
|------|----------|
| **Tile layer** | One tile per cell; `0` means empty |
| **Object layer** | Free-form objects at pixel positions: points, rectangles, ellipses, polygons, lines ([Objects](objects.md)) |

Elevation is not a layer: it's drawn as an overlay above the tile layers and below the objects
([Elevation](elevation.md)).

---

## In the editor

The **Layers** panel lists layers top first.

| Action | How |
|---|---|
| Select (tools work on it) | Click the layer |
| Show / hide | Its checkbox |
| Add | **+ Tile** or **+ Objects** (added above the selected layer) |
| Rename | **Rename**, or double-click |
| Reorder | **↑** / **↓** |
| Delete | **Delete** (asks first if the layer has tiles or objects; the last layer can't be deleted) |
| Fade | **Opacity** slider |

Adding, renaming, reordering and deleting are undoable; visibility and opacity are display
settings saved with the map.

Hidden layers can still be edited: tools act on the selected layer whether it's visible or not.

### Roads and rivers

Lines (roads and rivers) follow the fixed **Roads & rivers** row instead of their layer's
checkbox: when it's on, every line shows, whatever layer it's on, along with faded lines from
parent and child maps. See [Roads & Rivers](roads-rivers.md#showing-lines).

### Example stack

```
[top]    Places        ← object layer: towns, landmarks, spot heights
         Roads         ← object layer: roads and rivers
         Detail        ← tile layer: forests, fields
         Ground        ← tile layer: base terrain
[bottom]
```

The editor creates **Spot heights**, **Contours** and **Roads and rivers** object layers when
you first add one of those.

---

## Python model

The Python library (`map_editor/models/layer.py`) has `TileLayer` and `ObjectLayer` classes with
`name`, `visible`, `opacity`, `offset_x` and `offset_y`.

### `TileLayer`

| Method | Description |
|--------|-------------|
| `get_tile(col, row)` / `set_tile(col, row, tile_id)` | Read / write one cell (`0` out of range) |
| `clear()` / `fill(tile_id)` | Whole-layer operations |
| `flood_fill(col, row, new_id)` | Fill the connected same-tile region; returns the changed cells |
| `to_flat()` / `TileLayer.from_flat(data, width, height)` | Row-major list, as in Tiled |
| `copy()` | Deep copy |

### `ObjectLayer`

| Method | Description |
|--------|-------------|
| `add_object(obj)` / `remove_object(obj)` / `remove_by_id(id)` | Manage objects |
| `object_by_id(id)` | Find an object |
| `objects_at(x, y, tile_w, tile_h)` | Visible objects at a pixel (points: circle of radius `tile_w // 2`; others: bounding box) |

Layer order is the order of `map.layers`; use the map's `move_layer_up` / `move_layer_down` /
`remove_layer`.
