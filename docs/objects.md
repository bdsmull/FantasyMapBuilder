# Objects

**Objects** live on object layers at any pixel position, not tied to the grid: named places,
spawn points, regions, roads. Each has an ID, a name, a type, a shape and optional custom
properties, exactly as in Tiled.

---

## Shapes

| Shape | Tiled representation | Typical use |
|---|---|---|
| Point | `"point": true` | Places, NPCs, spawn points, spot heights |
| Rectangle | `width` and `height` | Rooms, trigger zones |
| Ellipse | `"ellipse": true` | Circular areas |
| Polygon | `polygon` points | Regions with irregular outlines |
| Polyline | `polyline` points | Roads and rivers |
| Tile object | `gid` | A tile placed as a sprite |

The editor draws all of them. Points show as a colored circle with the first letter of their
name; the color follows the object's type.

---

## Working with objects

| Task | How |
|---|---|
| Place a point | **Point** tool (`4`): click the map. Right-click removes the nearest point, on maps outside a world set; inside one, right-click opens the map menu |
| See an object's details | **Inspect** tool (`I`): click it to see its name, type, shape, layer and custom properties |
| Spot heights | **Height** tool → Spot mode ([Elevation](elevation.md#spot-heights)) |
| Roads and rivers | **Line** tool (`6`) ([Roads & Rivers](roads-rivers.md)) |
| Snap a child map to a place | Right-click the point on the parent → **Move &lt;child&gt; to &lt;point&gt;** ([World Sets](world-sets.md#exact-placement)) |

Other shapes and general property editing aren't built into the editor yet; create them in
Tiled and the editor shows them.

---

## Objects the editor gives meaning to

| Object | Type / properties | Meaning |
|---|---|---|
| Spot height | point, type `spot height`; `height` (m), `reach` (cells) | A known ground height |
| Road or river | polyline, type = class ID (e.g. `major-road`); optional `widths`, `refines` | A line with real-world width |

All other objects are kept exactly as they are. See
[File Format](file-format.md#editor-custom-properties).

---

## Python model

The Python library (`map_editor/models/map_object.py`) models objects as `MapObject` with an
`ObjectShape` (`POINT`, `RECTANGLE`, `ELLIPSE`, `POLYGON`, `TILE`), `object_id`, `name`,
`object_type`, `x`, `y`, `width`, `height`, `gid`, `visible`, a `properties` dict and optional
`polygon` points. It doesn't model polylines.

```python
from map_editor.models.map_object import MapObject

npc = MapObject.make_point("Innkeeper", x=320.0, y=128.0, object_type="NPC")
room = MapObject.make_rect("Boss Room", x=64.0, y=64.0, width=192.0, height=128.0)
barrel = MapObject.make_tile_object("Barrel", gid=14, x=160.0, y=96.0, width=32.0, height=32.0)

npc.set_property("loot_table", "dungeon_common")
npc.get_property("loot_table")   # "dungeon_common"
npc.move_to(330.0, 130.0)

MapObject.reset_id_counter(0)    # IDs come from a class-level counter (reset in tests)
```
