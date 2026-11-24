# World Coordinates

Every point of every placed map in a world set has a **world position**: meters **east (x)** and
**north (y)** of the world's origin. A weather system, a MUD or a game can use it to tell where
things are without asking the editor. This page specifies how to work it out from the files
alone. Three implementations follow it and are checked against each other:

| Implementation | Where | Use it from |
|---|---|---|
| **Godot 4 addon** (GDScript) | `clients/godot/addons/worldset_coords/` | Any Godot 4 project, every export platform |
| **Python package** | `clients/python/worldset_coords/` | Scripts, servers (no dependencies) |
| **Editor** (TypeScript, the reference) | `frontend/src/utils/worldCoords.ts` | The status bar and Inspect card |

Another language only needs to follow the steps below and pass the shared test suite
([Conformance](#conformance)).

---

## What you read

A world set is a folder (see [File Format](file-format.md)):

- `<name>.worldset.json`: `units` (the default unit system, `metric` when absent) and `nodes`,
  one per placed map, with `mapName`, `parentMapName` (null for a root), `parentAnchor`
  `{col, row}`, the optional `parentOffset` `{x, y}`, and `z`.
- `maps/<map>.tmj`: Tiled JSON. You need `orientation`, `width`, `height`, `tilewidth`,
  `tileheight`, for hex maps `hexsidelength`, `staggeraxis`, `staggerindex`, the custom
  properties `metersPerUnit`, `scale` and `units`, and the root map's origin object.

A map without a node is not placed, and has no world position. Nor does a map whose chain of
parents is broken (a missing map or anchor, a loop) or one that has no cell size.

---

## 1. Cell size

A map's **cell size** `m` (meters per cell) is its `metersPerUnit` custom property. The editor's
server writes it every time it saves a map.

Older files may lack it. Then use the scale preset named by the `scale` property, in the map's
`units` property, else the world set's `units`, else metric:

| `scale` | metric (m) | imperial (ft) |
|---|---|---|
| `room` | 1 | 2 |
| `battle` | 2 | 5 |
| `dungeon` | 5 | 10 |
| `site` | 10 | 30 |
| `town` | 50 | 150 |
| `city` | 250 | 660 |
| `local` | 1,000 | 5,280 |
| `province` | 5,000 | 31,680 |
| `kingdom` | 25,000 | 158,400 |
| `continent` | 100,000 | 528,000 |
| `world` | 500,000 | 2,640,000 |

One foot is exactly 0.3048 m.

---

## 2. Cell space

Each map has a **cell space** `(u, v)`: one unit per cell along both axes, with `u` growing to the
right (east) and `v` downwards (south), as map pixels do.

A map pixel `(x, y)` converts with a pitch `(px, py)` and the centre `(cx, cy)` of cell (0, 0):

```
u = 0.5 + (x − cx) / px        x = cx + (u − 0.5) × px
v = 0.5 + (y − cy) / py        y = cy + (v − 0.5) × py
```

**Square maps:** `px = tilewidth`, `py = tileheight`, `cx = tilewidth / 2`, `cy = tileheight / 2`.
So `u = x / tilewidth`, and cell `(col, row)` spans `[col, col + 1] × [row, row + 1]`.

**Hex maps** use Tiled's hex layout. With `half(n)` meaning n / 2 truncated towards zero:

```
staggerX     = staggeraxis is "x" (or absent)       staggerEven = staggerindex is "even"
side         = hexsidelength truncated to an integer
sideX, sideY = (side, 0) if staggerX else (0, side)
offsetX      = half(tilewidth − sideX)               offsetY = half(tileheight − sideY)
columnWidth  = offsetX + sideX                       rowHeight = offsetY + sideY
hexWidth     = columnWidth + offsetX                 hexHeight = rowHeight + offsetY
staggered(i) = (i is odd) ≠ staggerEven

top-left of hex (col, row):
  staggerX:  ( col × columnWidth,
               row × (hexHeight + sideY) + (rowHeight if staggered(col) else 0) )
  else:      ( col × (hexWidth + sideX) + (columnWidth if staggered(row) else 0),
               row × rowHeight )
centre = top-left + (hexWidth / 2, hexHeight / 2)
```

Then `(cx, cy)` is the centre of hex (0, 0), `px` is the x distance from it to the centre of hex
(1, 0), and `py` the y distance to the centre of hex (0, 1). Use 1 for either if it comes out as 0.

The **centre of a cell** is `((col + 0.5) × tilewidth, (row + 0.5) × tileheight)` on square
maps, and the hex centre above on hex maps.

---

## 3. Where a child sits on its parent

A child map with `width × height` cells of size `m` on a parent with cells of size `M`, anchored at
`(col, row)` with offset `(ox, oy)` (0, 0 when absent). Everything here is in the parent's cell
space:

```
w = width × m / M                h = height × m / M          (the child's size)
fw = ceilCells(w)                fh = ceilCells(h)           (whole parent cells it covers)
colMin = col − floor(fw / 2)     colMax = col + floor((fw − 1) / 2)
rowMin = row − floor(fh / 2)     rowMax = row + floor((fh − 1) / 2)
centreU = (colMin + colMax + 1) / 2 + ox
centreV = (rowMin + rowMax + 1) / 2 + oy
left = centreU − w / 2           top = centreV − h / 2
```

`ceilCells(x)` rounds up, except that a value within `1e-9 × max(1, |x|)` of a whole number counts as
that number. This matters because unit conversions leave values like `31.000000000000004`.

`(left, top)` is where the child's cell-space (0, 0) lies in the parent's cell space.

---

## 4. Branch position

Walk from the map up its parents to the root (`parentMapName` null), adding up each step in
meters:

```
bx = Σ left × M        by = Σ top × M        (M: that step's parent cell size)
```

`(bx, by)` is the map's cell-space (0, 0) in meters east and south of the root's cell-space (0, 0).
A root has `(0, 0)`. Z levels (floors, cellars) are placed exactly like other children.

---

## 5. The world origin

The root map holds the **world origin**: a point object whose Tiled type (class) is
`world-origin`, in any object layer (the editor uses one called `World`). Its `x`, `y` are root
map pixels. A root without one has its origin at the centre of its cell space:
`(width / 2, height / 2)` in cell space, converted to pixels. The editor adds the object the first
time the root map is saved, and you can drag it with the Points tool.

Convert the origin to the root's cell space `(ou, ov)`. Then:

```
originX = ou × rootCellSize        originY = ov × rootCellSize
```

Each root is its own world. Maps under different roots don't share coordinates.

---

## 6. World position

For a pixel `(x, y)` of a map with cell size `m`, branch position `(bx, by)` and its root's
`(originX, originY)`:

```
(u, v) = cell space of (x, y)
worldX = bx + u × m − originX                 (east)
worldY = originY − (by + v × m)               (north)
```

And back:

```
u = (worldX + originX − bx) / m
v = (originY − worldY − by) / m
(x, y) = pixel of (u, v)
```

The cell at a world point is the one holding that pixel. On a square map that's `floor(u)`,
`floor(v)`. On a hex map it's the hex whose centre is nearest, checking the 3 × 3 cells around
`floor(u)`, `floor(v)`. None if no centre is within half a hex (`max(hexWidth, hexHeight) / 2`).

A map's **extent** is from pixel (0, 0) to its pixel size: `width × tilewidth` by
`height × tileheight` on square maps. On hex maps:
- **staggerX:** `width × columnWidth + offsetX` by `height × (hexHeight + sideY)`, plus `rowHeight` when `width > 1`.
- **otherwise:** `width × (hexWidth + sideX)`, plus `columnWidth` when `height > 1`, by `height × rowHeight + offsetY`.

**Maps at a world point:** the placed maps of a root whose extent holds the point. They're listed
with the smallest cells (most detailed) first; among equal cell sizes, Z = 0 comes before other
levels, then they're sorted by name.

Heights (z) are already absolute: meters above sea level, in each map's height file (see
[Elevation files](file-format.md#elevation-files)).

---

## Using the libraries

=== "Godot 4"

    Copy `clients/godot/addons/worldset_coords/` into your project's `addons/` folder.
    Positions come back as `{"x": float, "y": float}` dictionaries of 64-bit floats, not
    `Vector2`, which is 32-bit and loses about half a meter at world scale.

    ```gdscript
    var ws := WorldSetCoords.open("res://world_sets/Brakka")
    var w = ws.cell_to_world("nauram-town", 12, 7)        # {x, y} meters, or null
    var cell = ws.world_to_cell("nauram-town", w.x, w.y)  # Vector2i, or null
    for m in ws.maps_at(ws.roots()[0], w.x, w.y):         # most detailed first
        print(m.name, " z ", m.z, " at pixel ", m.pixel)
    ```

=== "Python"

    ```bash
    pip install ./clients/python        # or put clients/python on PYTHONPATH
    ```

    ```python
    from worldset_coords import WorldSet

    ws = WorldSet.load("world_sets/Brakka")
    x, y = ws.cell_to_world("nauram-town", 12, 7)
    ws.world_to_cell("nauram-town", x, y)      # (col, row) or None
    [m.name for m in ws.maps_at(ws.roots[0], x, y)]
    ```

Both offer: `cell_size`, `roots`, `frame`, `pixel_to_world`, `cell_to_world`, `world_to_pixel`,
`world_to_cell`, `world_rect` (west, east, south, north) and `maps_at`.

---

## Conformance

`clients/conformance/` holds a small world set, `Conformance/`, and `expected.json`, the
reference implementation's answers for it. The world set covers square and both kinds of hex
map, offsets, Z levels, imperial units, a file without `metersPerUnit`, a second root without an
origin object, and an unplaced map. Answers are in meters and should match within 1e-6.

CI runs all three implementations against it: pytest for Python, a headless Godot for the addon,
and Vitest for the reference. After changing the reference, regenerate the answers:

```bash
cd frontend
UPDATE_CONFORMANCE=1 npx vitest run src/__tests__/worldCoords.test.ts   # PowerShell: $env:UPDATE_CONFORMANCE=1
```

Run the Godot tests locally with:

```bash
godot --headless --path clients/godot --import
godot --headless --path clients/godot --script res://tests/run_tests.gd
```
