# Coordinate Systems

The editor works with four kinds of position.

| Space | Units | Used for |
|---|---|---|
| **Cell** | column, row | Tiles, anchor cells, the cursor |
| **Map pixels** | pixels from the map's top-left corner | Objects, lines, the canvas (exactly Tiled's object coordinates) |
| **Cell space** | fractional cells (`u`, `v`) | Where child maps sit on their parents |
| **Real distance** | meters | Scale, line widths, elevation, world-wide generation |
| **World** | meters east (x) and north (y) of the world origin | The status bar, the Inspect card, and outside tools ([World Coordinates](world-coordinates.md)) |

---

## Square maps

Cell `(col, row)` covers pixels `col × tilewidth … (col+1) × tilewidth` across and
`row × tileheight … (row+1) × tileheight` down. Heights are stored at the cell **corners**.

---

## Hex maps

Hex maps use Tiled's hex geometry (`frontend/src/canvas/hexGeometry.ts` mirrors Tiled's
`HexagonalRenderer`, including its integer rounding):

- `tilewidth` × `tileheight` is each hex's bounding box; `hexsidelength` is its flat side.
- With `staggeraxis: x` (flat-topped), columns are `sideOffsetX + hexsidelength` pixels apart and
  every other column (`staggerindex`) is shifted down half a hex. With `staggeraxis: y`
  (pointy-topped), the same applies to rows.
- Offset coordinates `(col, row)` index the layer data, as in Tiled.

Heights are stored at hex **centres**.

---

## Cell space and real distance

To relate maps of different scales, the editor treats one cell as one unit along both axes
(**cell space**): cell `(c, r)` spans `[c, c+1] × [r, r+1]`. A map's scale gives the size of a
cell in meters.

A **child map** is placed on its parent in the parent's cell space:

1. Its real size is `width × its cell size` by `height × its cell size`, which is
   `size ÷ parent cell size` parent cells.
2. By default it is centred on its anchor cell (on the block of cells its size rounds up to).
3. An optional offset moves it to an exact point (see [Exact placement](world-sets.md#exact-placement)).

Chaining placements up the hierarchy gives every map a position in meters relative to the root
map. That's how a parent shows a child's heights and roads, and how generated terrain lines up
across maps. Measured from the root map's **world origin**, with north up, it's the map's
**world position**: see [World Coordinates](world-coordinates.md) for the exact steps and the
libraries that work it out for Godot and Python.

!!! note "Hex maps in cell space"
    On hex maps, cell space spaces columns by the column pitch and rows by the row pitch, so a hex
    parent's footprints and placements line up with its columns and rows rather than with
    perfectly round distances. This is a deliberate simplification.

---

## Python model

The Python `HexMap` (`map_editor/models/hex_map.py`) uses its own geometry, which predates the
switch to Tiled's: a circumradius `hex_size`, orientation `FLAT_TOP` / `POINTY_TOP`, and three
coordinate representations.

| Space | Notation | Description |
|-------|----------|-------------|
| Offset | `(col, row)` | Storage; matches `TileLayer` indices |
| Axial | `(q, r)` | Used internally for neighbours and distance (`s = -q - r` implicit) |
| Pixel | `(px, py)` | Position on the model's own pixel layout |

```python
cx, cy = hex_map.hex_center(col, row)        # centre of a hex
col, row = hex_map.pixel_to_hex(px, py)      # nearest hex
corners = hex_map.hex_corners(col, row)      # six (x, y) points
neighbours = hex_map.axial_neighbors(col, row)
d = hex_map.axial_distance(c1, r1, c2, r2)   # steps between hexes
```

`TileMap` offers `tile_to_pixel(col, row)`, `pixel_to_tile(px, py)` and `in_bounds(col, row)`.
