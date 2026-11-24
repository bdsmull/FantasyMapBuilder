# WorldSetCoords (Godot 4)

World coordinates for Fantasy Map Builder world sets, read straight from the files: meters
east (x) and north (y) of the world origin on the root map. Pure GDScript, so it works on
every platform Godot exports to.

## Install

Copy this folder to `res://addons/worldset_coords/`. The `WorldSetCoords` class is then
available everywhere; there's no plugin to enable.

Put your world set folder (`<name>.worldset.json` plus `maps/`) in the project, e.g.
`res://world_sets/Brakka/`. For an exported game, make sure the export includes the `.tmj` and
`.json` files: in the export preset, under **Resources → Filters to export non-resource
files**, add `*.tmj, *.json`.

## Use

```gdscript
var ws := WorldSetCoords.open("res://world_sets/Brakka")   # folder or .worldset.json
var w = ws.cell_to_world("nauram-town", 12, 7)             # {x, y} meters, or null
var p = ws.pixel_to_world("nauram-town", 400.0, 224.0)     # any map pixel
var cell = ws.world_to_cell("nauram-town", w.x, w.y)       # Vector2i, or null off the map
var rect = ws.world_rect("nauram-town")                    # {west, east, south, north}
for m in ws.maps_at(ws.roots()[0], w.x, w.y):              # most detailed first
	print(m.name, " (z ", m.z, ") pixel ", m.pixel)
```

Positions are dictionaries of 64-bit floats, not `Vector2` (32-bit; about half a meter of error
at world scale). Use `Vector2(w.x, w.y)` near your local origin if you need one.

Methods return `null` for maps that aren't placed in the world set.

The method is specified in `docs/world-coordinates.md` of the Fantasy Map Builder repository.
`clients/godot/tests/run_tests.gd` checks this addon against the shared test suite.
