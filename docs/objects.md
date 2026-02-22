# Objects

**Objects** are free-form entities placed on an `ObjectLayer`. Unlike tiles, objects are not
constrained to a grid — they sit at arbitrary pixel coordinates and can take a variety of
shapes.

---

## Shapes

Each `MapObject` has an `ObjectShape` that determines how it is drawn and hit-tested:

| Shape | `ObjectShape` | Typical use |
|-------|--------------|-------------|
| Point | `POINT` | NPCs, spawn points, waypoints, markers |
| Rectangle | `RECTANGLE` | Rooms, trigger zones, collision regions |
| Ellipse | `ELLIPSE` | Circular areas of effect |
| Polygon | `POLYGON` | Irregular region outlines |
| Tile | `TILE` | A specific tileset sprite placed as a sprite object |

---

## Attributes

| Attribute | Type | Description |
|-----------|------|-------------|
| `object_id` | `int` | Auto-assigned unique ID; never reused within a session |
| `name` | `str` | Human-readable label (e.g. `"Innkeeper"`) |
| `object_type` | `str` | Category string (e.g. `"NPC"`, `"Chest"`, `"Spawn"`) |
| `x` | `float` | Pixel X of the object's anchor |
| `y` | `float` | Pixel Y of the object's anchor |
| `width` | `float` | Width in pixels (used by RECTANGLE, ELLIPSE, TILE) |
| `height` | `float` | Height in pixels |
| `shape` | `ObjectShape` | The shape enum value |
| `gid` | `int` | Global tile ID for TILE-shape objects (`0` = none) |
| `visible` | `bool` | Whether the object is rendered |
| `properties` | `dict[str, Any]` | Arbitrary key/value metadata |
| `polygon` | `list[tuple[float, float]] \| None` | Vertex offsets for POLYGON shapes |

---

## Factory methods

Rather than constructing `MapObject` directly, use the provided factory methods:

```python
from map_editor.models.map_object import MapObject

# A point marker
npc = MapObject.make_point("Innkeeper", x=320.0, y=128.0, object_type="NPC")

# A rectangular region
room = MapObject.make_rect(
    "Boss Room", x=64.0, y=64.0, width=192.0, height=128.0
)

# A tile sprite placed in the world
barrel = MapObject.make_tile_object(
    "Barrel", gid=14, x=160.0, y=96.0, width=32.0, height=32.0
)
```

---

## Object IDs

IDs are assigned from a class-level counter and are unique within a session. They are never
reused after an object is deleted.

```python
# Reset the counter (used in tests for deterministic IDs)
MapObject.reset_id_counter(0)
```

---

## Custom properties

Store arbitrary metadata on any object using the properties dictionary:

```python
chest = MapObject.make_point("Chest", x=100.0, y=200.0, object_type="Chest")
chest.set_property("loot_table", "dungeon_common")
chest.set_property("locked", True)

loot = chest.get_property("loot_table")   # "dungeon_common"
locked = chest.get_property("locked")     # True
chest.move_to(110.0, 205.0)               # update position
```

Properties are serialised as a key/value list in the Tiled `.tmj` format (Phase 5).

---

## Renderer markers

While the interactive UI is being built, the renderers draw placeholder markers on object
layers to make objects visible:

| Shape | Marker |
|-------|--------|
| `POINT` | Filled circle, labelled with the first letter of the object name |
| `RECTANGLE` | Outline rectangle with a text label |
| `ELLIPSE` | Outline ellipse |
| `POLYGON` | Outline polygon |
| `TILE` | Small filled square |

Marker colour is keyed by `object_type` (e.g. all "NPC" objects share one accent colour).
