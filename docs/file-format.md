# File Format

Everything the editor saves is a plain file in a [world set folder](#world-set-folders-and-mapset-packages):
Tiled maps and tilesets, a world set file, and height files. Tiled can open every map directly,
and a game engine can read them without the editor.

---

## Maps (`.tmj`)

Maps are [Tiled](https://www.mapeditor.org/) JSON maps (`.tmj`). The editor keeps everything Tiled
knows about, and stores its own settings as Tiled **custom properties**, so Tiled keeps them too
when it saves a map.

| Editor concept | Tiled JSON |
|--------|------------|
| Square map | root `map` with `orientation: "orthogonal"` |
| Hex map | root `map` with `orientation: "hexagonal"`, `hexsidelength`, `staggeraxis`, `staggerindex` (see [Map Types](map-types.md#hex-maps)) |
| Tile layer | layer of type `"tilelayer"` |
| Object layer | layer of type `"objectgroup"` |
| Tileset | a `tilesets` entry with `firstgid` and `source` (an external `.tsj`) |
| Object | an object in an object group |

**Tile data** is a flat, row-major array of [global tile IDs](tilesets.md#global-tile-ids-gids)
(`0` = empty). The editor writes it the way Tiled does: one map row per line, which keeps files
small and readable.

---

## Editor custom properties

| Where | Name | Type | Meaning |
|---|---|---|---|
| Map | `scale` | string | Scale preset ID: `room`, `battle`, `dungeon`, `site`, `town`, `city`, `local`, `province`, `kingdom`, `continent`, `world` |
| Map | `units` | string | `metric` or `imperial`; absent = the world set's default |
| Map | `metersPerUnit` | float | Cell size in meters. Written on every save (from `scale` and the units when `scale` is a preset), so readers needn't know the presets; also a custom cell size when `scale` isn't one ([World Coordinates](world-coordinates.md#1-cell-size)) |
| Map | `heights` | file | `../heights/<map>.tif` ([elevation](#elevation-files)) |
| Map | `wrapX` | bool | `true`: a root map whose east edge continues at its west edge ([A world that wraps](world-sets.md#a-world-that-wraps)); absent = off. On square maps the last column of heights then equals the first |
| Map | `sea` | bool | `false` turns off the automatic sea below 0 m ([Elevation](elevation.md#lakes-and-seas)); absent = on |
| Tileset | `mapeditor.swatch` | bool | The tileset's image is a generated color swatch; the real data is each tile's color |
| Tile | `color_r`, `color_g`, `color_b` | int | Display color (color-only tilesets) |
| Tile | `category` | string | `TERRAIN`, `WALL`, `OBJECT` or `SPECIAL` |
| Tile | `heightBase`, `heightRelief` | float | Terrain height settings in meters ([Elevation](elevation.md#heights-from-terrain)) |
| Object (point, type `spot height`) | `height` | float | Known ground height in meters |
| Object (point, type `spot height`) | `reach` | float | How far it pulls the surface, in cells (default 10) |
| Object (polyline or polygon, type `contour`) | `height` | float | Contour height in meters ([Elevation](elevation.md#contour-lines)) |
| Object (polyline or polygon, type `contour`) | `reach` | float | How far it pulls the surface, in cells (default 10) |
| Object (point, type `water`) | `height` | float | A lake's or sea's surface height in meters ([Elevation](elevation.md#lakes-and-seas)) |
| Map | `headroom` | float | The level's ceiling height above its floor, in meters ([Ceilings](elevation.md#ceilings)); absent = none |
| Map | `slab` | float | Thickness of the map's floor, in meters: the level below's ceiling is this much under it; absent = the world set's `floorSlabM` |
| Object (polygon, type `ceiling`) | `headroom` | float | Ceiling height above the floor inside the shape, in meters ([Ceilings](elevation.md#ceilings)) |
| Object (point, type `world-origin`) | — | — | The world origin, on a world set's root map ([World Coordinates](world-coordinates.md#5-the-world-origin)); the editor puts it on a `World` layer |
| Object (polyline) | type | — | Line class ID, e.g. `major-road`, `river` ([Roads & Rivers](roads-rivers.md)); `contour` is a contour line instead |
| Object (polyline) | `widths` | string | Width in meters per point, comma-separated; blank = class width (e.g. `",,25,40"`) |
| Object (polyline) | `refines` | string | `<map>#<object id>` of the line this one refines |

On a map with `wrapX`, a line or shape across the seam is one object: its `x` is on the map, and its
points carry on past the edge (below 0, or beyond the map's width) without jumping back.

---

## Object shapes

| Shape | Tiled representation |
|-------|---------------------|
| Point | `"point": true` |
| Rectangle | `width` and `height` |
| Ellipse | `"ellipse": true` |
| Polygon | `polygon`: points relative to `x`, `y` |
| Polyline (roads, rivers) | `polyline`: points relative to `x`, `y` |
| Tile object | `gid` (anchored at its bottom-left, as in Tiled) |

Object `x`, `y` are map pixels, as in Tiled.

---

## Tilesets (`.tsj`)

Each world set keeps its tilesets as Tiled **external tilesets** in `tilesets/`, shared by its
maps (`"source": "../tilesets/<Name>.tsj"`). Saving a map writes its tilesets back to these files,
so edits are shared. A color-only tileset gets a generated swatch PNG next to it, marked with
`mapeditor.swatch`. See [Tilesets](tilesets.md).

---

## World set file

`<World set>/<World set>.worldset.json`:

```json
{
  "name": "Brakka",
  "version": "1.0",
  "units": "metric",
  "generation": { "seed": 1474163110, "featureSizeM": 20000, "roughness": 0.5 },
  "lineClasses": [
    { "id": "major-road", "name": "Major road", "kind": "road", "widthM": 8, "color": "#f2e2b8" }
  ],
  "nodes": [
    { "mapName": "world", "parentMapName": null, "parentAnchor": null, "z": 0 },
    {
      "mapName": "nauram-town",
      "parentMapName": "nauram-region",
      "parentAnchor": { "col": 13, "row": 16 },
      "parentOffset": { "x": 0.044, "y": -0.481 },
      "z": 0,
      "zLabel": "Ground"
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `units` | Default units for maps that don't set their own; absent = metric |
| `generation` | Height generation settings shared by the world set ([Generate](elevation.md#generate)); absent until used. `roughness` absent = 0.5 |
| `lineClasses` | Road and river classes; absent = the built-in set |
| `floorSlabM` | Floor thickness between Z levels, in meters ([Ceilings](elevation.md#ceilings)); absent = 0.3 |
| `nodes` | One entry per placed map |
| `nodes[].parentAnchor` | The parent cell it sits on; `null` for a root |
| `nodes[].parentOffset` | Optional fine position: how far, in parent cells, its centre is moved from its default spot (centred on the anchor) |
| `nodes[].z`, `zLabel` | Level (0 = ground, +1 … floors, −1 … below) and an optional label |

Rules the editor keeps: each map appears at most once; a node has both a parent and an anchor or
neither; there are no cycles. Maps in `maps/` without a node are "unplaced".

---

## Elevation files

| File | Format |
|---|---|
| `heights/<map>.tif` | Single-band 32-bit signed integer TIFF: absolute height in **whole centimeters** (sea level = 0) |
| `heights/<map>.mask.png` | 8-bit grayscale, same size: `255` where the height was set by hand (protected), `0` elsewhere |

Samples are at cell **corners** on square maps (`(width + 1) × (height + 1)`) and at hex
**centres** on hex maps (`width × height`), row-major, top-left first. The map links its heights
with the `heights` file property; the mask sits beside the TIFF by name.

Game engines usually import 16-bit heightmaps with a vertical scale. The editor's
[Export heightmap](elevation.md#heightmaps-for-game-engines) writes those, or a reader can convert
these 32-bit centimeter values itself.

### Exported heightmaps

**Export heightmap** writes `<map>.heightmap.png` (16-bit grayscale) or `<map>.heightmap.r16`
(16-bit unsigned, little-endian, no header), and `<map>.heightmap.json` beside it:

```json
{
  "map": "inn-ground", "format": "png", "width": 21, "height": 21,
  "minM": 96, "maxM": 104.2, "metersPerStep": 0.000125124,
  "spacingXM": 1, "spacingYM": 1, "widthM": 20, "heightM": 20,
  "rowOrder": "top-first"
}
```

A sample of `s` steps (0 … 65535) is `minM + s × metersPerStep` meters high. Rows run from the
map's top (north) edge, columns from its left; samples are `spacingXM` / `spacingYM` meters
apart, `widthM × heightM` from the first to the last. RAW files add `"byteOrder":
"little-endian"`; `"assembled": true` means child maps' heights are included. The PNG also
carries the same JSON in a `heightmap` text chunk.

Square maps export their corner samples as they are; hex maps are sampled onto a square grid
through the hex centres, one sample per hex each way. The **2ⁿ + 1** size stretches either to a
square of 33 … 4097 samples.

---

## World set folders and `.mapset` packages

Each world set is a self-contained folder in the data folder (default `world_sets/`; see
[Getting Started](getting-started.md#where-maps-are-stored)):

```
<World set>/
  <World set>.worldset.json   hierarchy, default units, generation, line classes
  maps/*.tmj                  placed and unplaced maps
  tilesets/*.tsj              shared Tiled external tilesets
  tilesets/*.png              generated color swatches and uploaded sprite sheets
  heights/*.tif, *.mask.png   elevation
```

Maps reference tilesets and heights by relative path, so Tiled can open any map in the folder
directly.

A **`.mapset`** file is the same folder packaged as one plain zip, for moving a world set between
computers (Edit → World Sets… → Export / Import .mapset…):

```
mapset.json                          manifest
<World set>/<World set>.worldset.json
<World set>/maps/…
<World set>/tilesets/…
<World set>/heights/…
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

- Images and height files (`.png`, `.jpg`, `.gif`, `.webp`, `.tif`) are stored uncompressed, so
  they can be read in place; everything else is deflated.
- Hidden files (names starting with `.`) are never included.
- Extracting the zip gives a normal world set folder that Tiled can open.
- On import the editor refuses a name that already exists (HTTP 409) and can import under a new
  name, which renames the folder, the `.worldset.json` file and its `name` field.

### Importing a single map

Edit → World Sets… → *Import map…* copies one map, with the tilesets it uses, from another world
set or from a `.mapset` into the active world set. The map arrives unplaced. For each tileset the
target already has under the same name:

| Situation | Result |
|---|---|
| Identical tiles and image | Shared with the target |
| Different | You choose: **merge** (color-only tilesets with the same tile size), **keep both** (the imported one is stored as `<Name> (2)`), or **use this world set's** |

Merging matches tiles by ID and never changes how existing maps look: where the same ID holds a
different tile, the target's tile keeps the ID and the imported tile is added under a new one (the
imported map's GIDs are renumbered, flip flags preserved). If the map inherited its units from
its old world set and the new one's default differs, its units are pinned so it keeps its size.
