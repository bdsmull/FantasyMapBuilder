# Coordinate Systems

The editor uses different coordinate systems for tile maps and hex maps.

---

## Tile map coordinates

Square tile maps use two related coordinate spaces:

| Space | Notation | Description |
|-------|----------|-------------|
| Tile | `(col, row)` | Integer column/row within the grid |
| Pixel | `(px, py)` | Float position on the rendered canvas |

### Conversion

```python
# Tile → pixel: returns the top-left corner of the cell
px, py = tile_map.tile_to_pixel(col, row)
# px = col * tile_width
# py = row * tile_height

# Pixel → tile: floors to the nearest cell
col, row = tile_map.pixel_to_tile(px, py)
# col = int(px // tile_width)
# row = int(py // tile_height)
```

### Bounds checking

```python
if tile_map.in_bounds(col, row):
    tile_map.set_tile(col, row, tile_id)
```

---

## Hex map coordinates

Hex maps use three coordinate representations:

| Space | Notation | Description |
|-------|----------|-------------|
| Offset | `(col, row)` | Storage and display; matches `TileLayer` data indices |
| Axial | `(q, r)` | Math-friendly; used internally for neighbours and distance |
| Pixel | `(px, py)` | Float position on the canvas |

### Offset coordinates

Offset coordinates map directly to the column/row indices used when reading and writing tiles:

```python
terrain = hex_map.tile_layers()[0]
terrain.set_tile(col=3, row=2, tile_id=1)
```

For `FLAT_TOP` orientation, odd columns are shifted down by half a hex height.
For `POINTY_TOP`, odd rows are shifted right by half a hex width.

### Axial coordinates

Axial coordinates `(q, r)` form a skewed 2-D axis aligned with the hex grid. A third cube
coordinate `s = -q - r` is always implicit. Axial space is used internally for algorithms:
it makes distance and neighbour lookups simple arithmetic.

```python
# Offset ↔ axial conversion (available for advanced use)
q, r = hex_map._offset_to_axial(col, row)
col, row = hex_map._axial_to_offset(q, r)
```

### Pixel coordinates

```python
# Centre pixel of the hex at (col, row)
cx, cy = hex_map.hex_center(col, row)

# Nearest hex from a pixel position
col, row = hex_map.pixel_to_hex(px, py)

# Six corner points of the hex polygon at (col, row)
corners = hex_map.hex_corners(col, row)
# → list of 6 (x, y) float tuples
```

### Hex bounding box

```python
hw, hh = hex_map.hex_pixel_size()
# FLAT_TOP:   hw = 2 × hex_size,           hh = √3 × hex_size
# POINTY_TOP: hw = √3 × hex_size,          hh = 2 × hex_size
```

For `hex_size = 40`:

| Orientation | `hw` | `hh` |
|-------------|------|------|
| `FLAT_TOP` | 80.0 | ≈ 69.3 |
| `POINTY_TOP` | ≈ 69.3 | 80.0 |

---

## Neighbour and distance algorithms

These methods work in offset space externally but use axial math internally:

```python
# All 6 neighbours of the hex at (col, row), filtered to in-bounds only
neighbours = hex_map.axial_neighbors(col, row)
# → list of (col, row) offset pairs

# Exact hex-grid distance in hex steps
d = hex_map.axial_distance(col1, row1, col2, row2)
```

### Distance example

```
hex_map.axial_distance(0, 0, 3, 0)  → 3
hex_map.axial_distance(0, 0, 2, 2)  → 3  (FLAT_TOP)
```

---

## Visual reference

```
FLAT_TOP — hex_size = 40
  hex_pixel_size → (80.0, 69.3)
  hex_center(0, 0) → (40.0, 34.6)
  hex_center(1, 0) → (120.0, 34.6)   ← next column, same row

POINTY_TOP — hex_size = 40
  hex_pixel_size → (69.3, 80.0)
  hex_center(0, 0) → (34.6, 40.0)
  hex_center(0, 1) → (34.6, 120.0)   ← same column, next row
```
