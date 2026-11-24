# Clients: world coordinates outside the editor

Libraries that read a Fantasy Map Builder world set folder and give world positions: meters
east (x) and north (y) of the world origin on the root map. They need no editor or server.

| Folder | What |
|---|---|
| `godot/addons/worldset_coords/` | Godot 4 addon (GDScript). Copy it into your project's `addons/` folder |
| `python/` | Python package `worldset_coords` (no dependencies; Python 3.8+) |
| `conformance/` | The shared test suite: a sample world set and the expected answers |

The method is specified in [docs/world-coordinates.md](../docs/world-coordinates.md). The
editor's TypeScript code (`frontend/src/utils/worldCoords.ts`) is the reference implementation
and writes `conformance/expected.json`. CI checks every library against it.
