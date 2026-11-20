# Core Concepts

How the editor's pieces fit together. Each section links to a more detailed page.

---

## World sets

A **world set** is a folder of maps plus a hierarchy saying which map sits where on which:
world → continent → kingdom → town → building. Maps can also exist in the folder without a
place in the hierarchy. See [World Sets & Scales](world-sets.md).

---

## Maps

A **map** is a grid of cells, either **square** or **hexagonal**, with a **scale**: the
real-world size of one cell (1 m … 500 km, metric or imperial). The scale is what lets maps of
different sizes line up. Maps are saved as Tiled `.tmj` files. See [Map Types](map-types.md).

---

## Layers

A map is a stack of **layers**, drawn bottom to top:

| Kind | Contents |
|------|----------|
| Tile layer | One tile per cell (`0` = empty) |
| Object layer | Free-form objects: points, rectangles, ellipses, polygons, lines |

Layers can be added, renamed, reordered, hidden and faded. See [Layers](layers.md).

---

## Tilesets

A **tileset** is a palette of tiles: either a PNG sprite sheet or a set of plain colors.
Tilesets are shared by every map in a world set, so a change to a tile shows everywhere it's
used. Terrain tiles can also carry height settings. See [Tilesets](tilesets.md).

---

## Objects

**Objects** sit on object layers at any position: named places, spawn points, regions. The
editor gives some objects special meaning:

| Object | Meaning |
|---|---|
| Point of type `spot height` | A known ground height ([Elevation](elevation.md#spot-heights)) |
| Polyline or polygon of type `contour` | A line of known ground height ([Elevation](elevation.md#contour-lines)) |
| Other polylines | A road or river ([Roads & Rivers](roads-rivers.md)) |

See [Objects](objects.md).

---

## Elevation

A map can have a **height surface** (absolute, to the centimeter), stored alongside the map. It
can be painted, built from terrain, generated, and fitted to spot heights and contour lines,
and it is shared
across a world set's maps. See [Elevation](elevation.md).

---

## Positions and coordinates

- **Cells** are addressed by column and row.
- **Map pixels** position objects, exactly as in Tiled. Hex maps use Tiled's hex geometry.
- **Real distance** (meters) links maps: a child map's position on its parent, line widths,
  and world-wide generated terrain all work in meters.

See [Coordinate Systems](coordinates.md).

---

## Rendering and saving

The whole map lives in the browser while you edit, so painting needs no server round-trip;
**Save** sends the map, its elevation and any changed tilesets to the server. The server stores
plain files: no database. See [File Format](file-format.md) and [Architecture](architecture.md).

---

## The Python model library

The repository also contains `map_editor/`, a pure-Python model of tile maps, hex maps,
layers, tilesets and objects, with a Tiled `.tmj` reader and writer. It predates the web editor
and is used by the Python tests and for scripting; the web editor does not use it. Its API is
described in the "Python model" sections of [Map Types](map-types.md), [Layers](layers.md),
[Tilesets](tilesets.md), [Objects](objects.md) and [Coordinate Systems](coordinates.md).
