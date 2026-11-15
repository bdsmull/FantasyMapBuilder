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

## World set folders and `.mapset` packages

Each world set is a self-contained folder in the server's data folder
(default `world_sets/`; see `server/data_dir.py`):

```
<World set>/
  <World set>.worldset.json   hierarchy of placed maps, default units
  maps/*.tmj                  placed and unplaced maps
  tilesets/*.tsj              shared Tiled external tilesets
  tilesets/*.png              generated color swatches and uploaded sprite sheets
  heights/*.tif               height patches (planned, #8)
```

Maps reference tilesets by relative path (`"source": "../tilesets/<Name>.tsj"`), so
Tiled can open any map in the folder directly. A tileset whose image is a generated
swatch carries the boolean custom property `mapeditor.swatch`; its real data is the
`color_r` / `color_g` / `color_b` properties of each tile.

A **`.mapset`** file is the same folder packaged as one plain zip, for moving a world
set between computers or projects (World Sets → Export / Import .mapset…):

```
mapset.json                          manifest
<World set>/<World set>.worldset.json
<World set>/maps/…
<World set>/tilesets/…
```

`mapset.json`:

| Field | Meaning |
|---|---|
| `format` | Always `"mapset"` |
| `formatVersion` | `1`. Readers should reject versions they don't know |
| `worldSet` | World set name; every other entry lives under `<worldSet>/` |
| `created` | UTC timestamp of the export (ISO 8601) |
| `files` | Every packaged file, as zip entry paths |

Notes for readers (e.g. a game-engine importer):

- Images and height files (`.png`, `.jpg`, `.gif`, `.webp`, `.tif`) are stored
  uncompressed, so they can be read in place; everything else is deflated.
- Hidden files (names starting with `.`) are never included.
- Extracting the zip yields a normal world set folder that Tiled can open.
- On import (World Sets → Import .mapset…) the Map Builder refuses a name that already exists (HTTP 409) and can
  import under a new name, which renames the folder, the `.worldset.json` file and
  its `name` field.

### Importing a single map

World Sets → *Import map…* copies one map, with the tilesets it uses, from another
world set or from a `.mapset` into the active world set. The map arrives unplaced.
For each tileset the target already has under the same name:

| Situation | Result |
|---|---|
| Identical tiles and image | Shared with the target |
| Different | You choose: **merge** (color-only tilesets with the same tile size), **keep both** (the imported one is stored as `<Name> (2)`), or **use this world set's** |

Merging matches tiles by ID and never changes how existing maps look: where the same
ID holds a different tile, the target's tile keeps the ID and the imported tile is
added under a new one (the imported map's GIDs are renumbered, flip flags preserved).
If the map inherited its units from its old world set and the new one's default
differs, its units are pinned so it keeps its size.
