# World Sets & Scales

A **world set** links maps into a hierarchy: a world map contains continents, a continent
contains kingdoms, a kingdom contains towns, a town contains buildings. Each map stays an
ordinary Tiled map; the world set records where each one sits on its parent.

---

## Scales and units

Every map has a **scale**: the real-world size of one cell. There are 11 levels; skip any you
don't need. Square cells or hexes can be used at any level (the suggested shape is only the
default for new maps).

| Scale | Metric cell | Imperial cell | Suggested shape | Typical use |
|---|---|---|---|---|
| Room | 1 m | 2 ft | square | Detailed interiors, furniture, close tactical play |
| Battle | 2 m | 5 ft | square | Standard combat grid, buildings, ship decks |
| Dungeon | 5 m | 10 ft | square | Dungeon complexes, caves, castle floors |
| Site | 10 m | 30 ft | square | Castle grounds, villages, ruins |
| Town | 50 m | 150 ft | hex | Walled towns, city districts |
| City | 250 m | ⅛ mi | hex | Whole cities with farmland and surroundings |
| Local | 1 km | 1 mi | hex | A day's travel: a valley or forest |
| Province | 5 km | 6 mi | hex | A barony or county, several days' travel |
| Kingdom | 25 km | 30 mi | hex | A nation and its borders |
| Continent | 100 km | 100 mi | hex | Continents and seas |
| World | 500 km | 500 mi | hex | The whole world |

**Units.** A world set has default units (metric unless you choose imperial in the World Sets
dialog). A map can override them. The map's scale in its units gives its cell size, which is
used everywhere real distances matter: placing child maps, elevation, line widths, generation.

Set a map's scale and units when creating it, or later with **File → Map Properties…**. A map
with no scale still works on its own, but can't be placed precisely in a world set (its
footprint shows as a placeholder) and can't use generation.

---

## Working with world sets

- **Choose the active world set** in the selector at the top of the left panel, or in
  **Edit → World Sets…**, where you can also create, export and delete world sets.
  Deleting moves the folder to the data folder's `.trash`, where it can be recovered by hand.
- The **hierarchy panel** shows the active world set as a tree. Click a map to open it.
  Right-click a map for **Add child here**, **Change parent** and **Remove from world set**.
- A map can exist in the world set's folder without being placed in the hierarchy ("unplaced");
  that's useful for drafts and imported maps.

### Placing a child map

Any of these:

- On the parent map, right-click where the child should go → **Add child map here**.
- In **Edit → World Sets…**, add a map and choose its **Parent**, **Anchor col/row** (the parent
  cell it sits on) and **Z level**.
- In the hierarchy panel, right-click the parent → **Add child here**.

The child is centred on its anchor cell. To put it at an exact spot, see below.

### Z levels

Maps on the same spot at different heights, such as a building's floors or a cave under a
town, share a parent and anchor but have different **Z levels** (0 = ground; +1, +2 … floors;
−1 … below ground), each with an optional label like "Second Floor". Elevation and roads
assemble only the ground level (Z = 0). Each level's heights are its floor, and the floor of
the level above (or the ground, below ground) is its ceiling: see
[Ceilings](elevation.md#ceilings).

---

## Footprints

On a parent map, each child shows as its **footprint**: its real area, with its name.

- A child too small to see at the parent's scale (a 360 m town on 25 km cells) shows as a
  small solid **marker** with its name beside it, so it stays visible and clickable.
- **Hover** a footprint to see a tooltip and, faintly, the whole parent cells it touches.
- **Click** a footprint to open the child (on touch screens, tap once for the name, again to
  open). Overlapping footprints show a picker.
- The **status bar** shows a link to the parent map; click it to go back up.

### Exact placement

Small maps often need to sit at a precise point, such as a town on its city marker, where the
roads meet. On the parent map:

1. Right-click the exact spot, or right-click a **point object** (it snaps to it).
2. Choose **Move &lt;child&gt; here**, or **Move &lt;child&gt; to &lt;point name&gt;**.

The world set is saved right away. Elevation, roads and rivers, and generation all use the new
position. Changing the anchor cell later in the World Sets dialog re-centres the child on
that cell.

### Warnings

The hierarchy panel badges maps with problems:

| Warning | Meaning |
|---|---|
| Missing map | The world set refers to a map file that doesn't exist |
| Missing scale | The map has no scale, so it can't be placed or compared |
| Scale inversion | The map is the same size or larger per cell than its parent |
| Footprint overlap | It overlaps a sibling at the same Z level (real areas are compared) |
| Elevation mismatch | Its edges don't meet its parent's ground (see [Elevation](elevation.md#fitting-a-child-to-its-parent)) |
| Line mismatch | A road or river refined on it no longer meets its original at the map's edge (see [Roads & Rivers](roads-rivers.md#when-a-copy-no-longer-meets-its-original)) |

The elevation and line checks need the maps' data, so they cover the open map and the maps
around it: open a map to check it.

---

## What follows the hierarchy

Because every map knows where it sits in real meters, several features work across maps:

- **Elevation** — a parent shows its children's heights inside their footprints, and children
  can be re-based to fit their parent ([Elevation](elevation.md#across-maps)).
- **Roads and rivers** — lines show faded on parent and child maps and can be copied down and
  refined ([Roads & Rivers](roads-rivers.md#across-map-scales)).
- **Generation** — generated terrain detail is one world-wide pattern, so maps generated
  separately match where they overlap ([Elevation](elevation.md#generate)).
- **World coordinates** — every point has a world position (see below).

### World coordinates

Every point of every placed map has a **world position**: meters east (**x**) and north
(**y**) of the **world origin**, a `0, 0` marker on the world set's root map.

- **Where it is:** the origin starts at the root map's centre. The editor stores it in the map
  (a point object on a **World** layer) the first time you save the root, so resizing the map
  later doesn't move anyone's coordinates.
- **Moving it:** with the **Points** tool on the root map, drag the marker. The Points panel's
  **Centre it** puts it back in the middle. Both are undoable.
- **Seeing positions:** the **status bar** shows the world position under the cursor, and the
  **Inspect** card shows it for the clicked point, with **Copy** for the exact meters.

Games and other tools can work out the same positions from the files, without the editor:
[World Coordinates](world-coordinates.md) describes the method and the ready-made Godot 4 and
Python libraries.

---

## Moving world sets between computers

- **Export:** Edit → World Sets… → **Export** saves the whole world set (maps, tilesets, height
  files) as one `.mapset` file.
- **Import:** **Import .mapset…** adds it under its own name, or a new name if that one is taken.
- **Import map…** copies a single map with the tilesets it uses from another world set or a
  `.mapset`. Where a tileset of the same name already exists and differs, you choose: merge it,
  keep both, or use this world set's. The map arrives unplaced.

See [File Format](file-format.md#world-set-folders-and-mapset-packages) for the details.

---

## On disk

Each world set is a folder in the data folder (see [Getting Started](getting-started.md#where-maps-are-stored)):

```
<World set>/
  <World set>.worldset.json   the hierarchy, default units, generation settings, line classes
  maps/*.tmj                  every map (Tiled format)
  tilesets/*.tsj, *.png       shared tilesets
  heights/*.tif, *.mask.png   elevation
```

Tiled can open any map in the folder directly. The `.worldset.json` format is described in
[File Format](file-format.md#world-set-file).
