# Fantasy RPG Map Editor

A web-based editor for fantasy RPG maps, built with FastAPI and React.

Maps range from a single room to the whole world, and link into a navigable hierarchy called a
**world set**: click from a world map down to a dungeon room and back, with every level of
geography connected.

Maps are saved in [Tiled](https://www.mapeditor.org/) `.tmj` format, so Tiled and Tiled-compatible
game engines can open them. The editor runs in any modern browser, including on an iPad on the
same network.

---

## Key features

| Area | What you can do |
|------|-----------------|
| **Maps** | Square or hex grids at 11 scale levels, from Room (1 m) to World (500 km), metric or imperial |
| **World sets** | Place child maps on their parents, navigate by clicking, true-size footprints, exact placement |
| **Layers** | Tile and object layers: add, rename, delete, reorder, opacity, visibility |
| **Tilesets** | Built-in color tilesets or your own sprite sheets, shared across a world set |
| **Elevation** | Paint heights, build them from terrain types, generate natural detail, fit them to spot heights and contour lines; parents show their children's heights |
| **Roads and rivers** | Lines with real-world widths that show across map scales and can be refined on more detailed maps |
| **Inspect** | Click anywhere to see terrain, elevation, objects and child maps |
| **Sharing** | Export or import a world set as one `.mapset` file, or import a single map |

---

## Where to start

- [Getting Started](getting-started.md) — install, run, and the editor's tools and panels
- [World Sets & Scales](world-sets.md) — building a hierarchy of maps
- [Elevation](elevation.md) — giving maps a height surface
- [Roads & Rivers](roads-rivers.md) — drawing lines and carrying them across scales
- [File Format](file-format.md) — what is stored where, for Tiled and game-engine use
- [Architecture](architecture.md) — how the code is organized
- [Changelog](https://github.com/bdsmull/FantasyMapBuilder/blob/main/CHANGELOG.md) — what changed in each release
