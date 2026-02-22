# File Format

The editor saves maps in [Tiled](https://www.mapeditor.org/) `.tmj` format — the JSON variant
of Tiled's `.tmx` XML format. This allows maps to be opened in Tiled directly and used with
any Tiled-compatible game engine or loader.

!!! note "Phase 5"
    Full `.tmj` import/export is planned for Phase 5. This page documents the intended
    mapping between the editor's data model and the Tiled JSON schema. The model already
    stores everything needed to produce and consume `.tmj` files.

---

## Concept mapping

| Editor | Tiled JSON |
|--------|------------|
| `TileMap` | root `map` object with `orientation: "orthogonal"` |
| `HexMap` | root `map` object with `orientation: "hexagonal"` |
| `TileLayer` | layer of type `"tilelayer"` |
| `ObjectLayer` | layer of type `"objectgroup"` |
| `Tileset` | `tileset` object |
| `TileDefinition` | tile within a tileset |
| `MapObject` | object within an objectgroup |
| `MapObject.properties` | `properties` array of `{name, type, value}` entries |

---

## Hex map stagger metadata

`HexMap` exposes three Tiled-specific properties that are set automatically based on
orientation:

| Property | `FLAT_TOP` | `POINTY_TOP` |
|----------|------------|--------------|
| `tiled_stagger_axis` | `"x"` | `"y"` |
| `tiled_stagger_index` | `"odd"` | `"odd"` |
| `tiled_hex_side_length` | `int(hex_size)` | `int(hex_size)` |

These values will be written as top-level keys in the TMJ root object.

---

## Global tile IDs

Tiled uses **global tile IDs** (GIDs) to identify tiles across multiple tilesets. When a map
has more than one tileset, each tileset is assigned a `first_gid` offset. Tile data stored
in `TileLayer` is always in GID form.

- `0` → empty cell (never drawn)
- `n ≥ 1` → local ID `n − tileset.first_gid + 1` within the tileset whose `first_gid` is
  the largest value ≤ `n`

```python
ts    = tile_map.tileset_for_gid(gid)  # → Tileset
local = tile_map.local_id(gid)         # → int (1-based within that tileset)
tdef  = ts.tile_by_id(local)           # → TileDefinition
```

---

## Layer data serialisation

`TileLayer.to_flat()` produces a flat `list[int]` in row-major order, exactly matching the
Tiled JSON `data` array:

```json
{
  "type": "tilelayer",
  "name": "Ground",
  "width": 20,
  "height": 15,
  "data": [0, 1, 2, 1, 0, ...]
}
```

`TileLayer.from_flat(data, width, height)` reverses the process when loading a file.

---

## Object shape mapping

| `ObjectShape` | Tiled JSON representation |
|--------------|--------------------------|
| `POINT` | Object with `"point": true` |
| `RECTANGLE` | Plain object with `"width"` and `"height"` |
| `ELLIPSE` | Object with `"ellipse": true` |
| `POLYGON` | Object with a `"polygon"` vertex array |
| `TILE` | Object with a `"gid"` field |
