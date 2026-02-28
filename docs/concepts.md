# Core Concepts

This page gives a high-level overview of how the editor is structured. Each section links to a more detailed reference page.

---

## Maps

A **map** is the top-level container for a scene. Two types are supported:

| Type | Class | Grid shape | Typical use |
|------|-------|------------|-------------|
| Tile map | `TileMap` | Square cells | Towns, dungeons, interiors, combat |
| Hex map | `HexMap` | Hexagonal cells | Regions, continents, world overviews |

Both types share the same layer, tileset, and object model and expose a nearly identical API. See [Map Types](map-types.md).

---

## Layers

A map is made up of **layers** stacked from bottom to top. There are two layer kinds:

| Kind | Class | Contents |
|------|-------|----------|
| Tile layer | `TileLayer` | A 2-D grid of integer tile IDs |
| Object layer | `ObjectLayer` | An unordered list of `MapObject` entities |

Layers can be hidden, made translucent, and reordered. Tile ID `0` means "empty" — nothing is drawn for that cell. See [Layers](layers.md).

---

## Tilesets

A **tileset** is a named palette of tile definitions backed by a PNG sprite sheet. Each tile has a 1-based ID, a category (terrain, wall, object, special), an RGB display colour, and a position within the sheet.

The editor ships with two built-in placeholder tilesets — one for tile maps (16 types) and one for hex maps (12 terrain types) — so no external artwork is required to get started. See [Tilesets](tilesets.md).

---

## Objects

**Objects** are free-form entities placed on an `ObjectLayer`: NPCs, spawn points, region labels, anything that doesn't fit neatly into a tile grid. Objects have a shape (point, rectangle, ellipse, polygon, or tile-sprite), pixel coordinates, a name, a type string, and an arbitrary key/value properties dictionary. See [Objects](objects.md).

---

## Coordinate Systems

Square maps use column/row tile coordinates that map linearly to pixel space. Hex maps add a third representation — axial `(q, r)` — used internally for distance and neighbour calculations. See [Coordinate Systems](coordinates.md).

---

## Rendering

The `tileRenderer.ts` and `hexRenderer.ts` modules draw maps onto an HTML5 `<canvas>` element using the Canvas 2D API. Rendering runs entirely in the browser — no server round-trips are needed for display. Tileset images are fetched from the server once and cached for the session.

---

## File Format

Maps are saved and loaded in [Tiled](https://www.mapeditor.org/) `.tmj` format — a JSON schema compatible with the Tiled editor and any Tiled-compatible game engine. See [File Format](file-format.md).
