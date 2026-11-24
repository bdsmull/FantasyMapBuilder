# worldset-coords

World coordinates for Fantasy Map Builder world sets, read straight from the files: meters
east (x) and north (y) of the world origin on the root map. No dependencies; Python 3.8+.

```bash
pip install ./clients/python
```

```python
from worldset_coords import WorldSet

ws = WorldSet.load("world_sets/Brakka")          # the folder, or its .worldset.json
x, y = ws.cell_to_world("nauram-town", 12, 7)    # centre of a cell, in meters
ws.pixel_to_world("nauram-town", 400.0, 224.0)   # any map pixel (Tiled object coordinates)
ws.world_to_cell("nauram-town", x, y)            # (col, row), or None off the map
ws.world_to_pixel("nauram-town", x, y)
ws.world_rect("nauram-town")                     # {"west", "east", "south", "north"}
[m.name for m in ws.maps_at(ws.roots[0], x, y)]  # most detailed map first
```

Methods return `None` for maps that aren't placed in the world set.

The method is specified in `docs/world-coordinates.md` of the Fantasy Map Builder repository;
`tests/` checks this package against the shared test suite in `clients/conformance`.
