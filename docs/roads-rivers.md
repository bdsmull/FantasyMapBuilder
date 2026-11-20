# Roads & Rivers

Roads, paths, rivers and canals are **lines**: Tiled polylines with a class and a real-world
width. They draw at their true width at every scale (never thinner than a visible minimum),
and they show across the maps of a world set.

---

## Classes

A line's **class** sets its default width and look. The built-in classes follow the original
world legend:

| Class | Width | Kind | Legend |
|---|---|---|---|
| Highway | 12 m | road | `*` well-maintained highway |
| Major road | 8 m | road | `=` |
| Minor road | 5 m | road | `-` |
| Path | 2 m | road | `\|` small path |
| Trail | 1 m | road | `.` narrow trail |
| River | 20 m | water | |
| Stream | 5 m | water | |
| Brook | 1.5 m | water | |
| Canal | 10 m | water | |

Roads are drawn with a dark edge; water as a single blue stroke.

**Edit → Road & River Classes…** changes a world set's classes: rename, re-width, recolor, add
or remove, or **Reset to built-in**. Lines refer to their class by a stable ID, so a change
applies to every map in the world set. A line whose type isn't a class (for example older lines
typed just `road`) is drawn like its nearest class and marked "unclassified"; pick a class to
set it.

---

## Drawing and editing (Line tool)

Select the **Line** tool (`6`). Its panel shows the class for new lines and the selected line.

**Drawing**

- Click to add points; **double-click** or **Enter** finishes (two or more points).
- **Backspace** removes the last point; **Esc** cancels.

New lines go into the selected layer if it's an object layer, otherwise into a
**Roads and rivers** layer (created above the selected layer).

**Editing**

- Click a line to select it, then drag its **points** (squares) to move them.
- Drag a segment's **midpoint handle** (circle) to insert a point there.
- **Delete** removes the selected point, or the whole line when no point is selected.
- The panel edits the **name**, **class**, and the selected point's **width** (blank = the
  class width). Per-point widths let a river widen downstream or a road narrow into a lane.

Every change is one undo step. The Line tool draws across child map footprints instead of
opening them, so roads can run into towns.

---

## Showing lines

The fixed **Roads & rivers** row in the Layers panel (also **View → Roads & Rivers**) shows or
hides all lines:

- **On** — every line on the map, whatever layer it's on (even a hidden one), plus faded lines
  from parent and child maps
- **Off** — no lines

Object layers' own checkboxes then only affect their other objects. A single line hidden in
Tiled (`visible: false` on the object) stays hidden. Choosing the Line tool turns the row on.
The count beside it shows lines on this map and from other maps.

---

## Across map scales

Each line is stored once, on the map where it was drawn. Other maps in the world set show it as
a faded, read-only **ghost** line:

- a **parent** shows its children's lines inside their footprints;
- a **child** shows its ancestors' lines, clipped to the child's area.

### Copying a line down and refining it

On a child map, click a ghost line from a parent (or further up) with the Line tool. The panel
shows where it comes from, with:

- **Copy to this map** — copies the part inside this map, keeping its name, class and widths,
  so you can refine it at this scale. If the line leaves and re-enters the map, you get one
  copy per piece.
- **Open &lt;map&gt;** — go to the map it comes from.

The copy remembers its source (a `refines` link). From then on **the most detailed version wins
inside its own map's area**:

- On the child, the original's ghost disappears; your copy is the line there.
- On the parent (and further up), the original is hidden inside the child's footprint and the
  refined version shows instead. Several child maps can each refine their own stretch of one
  long road.

The links show both ways:

- The original lists **Refined on: &lt;maps&gt;**, each with an Open button.
- The copy shows **Refines "&lt;name&gt;" on &lt;map&gt;**, or that the source line no longer
  exists.

If the original is edited later, the copy keeps its own shape.

!!! note "Rivers and the ground"
    On a map with elevation, **Carve rivers** cuts the drawn rivers, streams, brooks and canals
    into the heights, and the **Flow** view treats them as channels
    (see [Elevation → Water](elevation.md#carving-rivers)).

### When a copy no longer meets its original

A refined copy can take its own course inside its map, but where it leaves the map it should
meet the original. The editor compares the two at the map's edge: each end of the copy that lies
on the edge should be within two of the map's cells of a point where the original crosses the
edge, and each crossing should have a copy end near it. When that stops being true (typically
after the original is moved on the parent), the copy is flagged:

- **On the child map**, red rings mark the copy's ends that are off, and dashed orange rings mark
  crossings no copy meets. Selecting the copy shows *This copy doesn't meet "Road east" at the
  map's edge any more (up to 120 m off)*, with **Snap ends to the original**, which moves the
  ends that are off onto the original's crossings (one undo step).
- **On the parent**, the original's **Refined on** list marks the map with ⚠, and its rings show
  inside that map's footprint.
- **In the hierarchy panel**, the map holding the copy gets a **Line mismatch** warning.

A copy is also flagged when its original no longer crosses the map at all, or no longer exists.

!!! tip "Small maps need precise placement"
    A town map that's much smaller than one parent cell sits at the centre of its anchor cell
    unless you place it exactly. If roads that meet at the town's marker don't reach the town
    map, right-click the marker on the parent → **Move &lt;town&gt; to &lt;marker&gt;**
    (see [Exact placement](world-sets.md#exact-placement)).

---

## Storage

| What | Where |
|---|---|
| A line | A Tiled polyline object in an object layer; its **type** is the class ID (e.g. `major-road`) |
| Per-point widths | String property `widths`: meters per point, comma-separated, blank = class width (e.g. `",,25,40"`) |
| Refinement link | String property `refines`: `<source map>#<object id>` |
| Classes | `lineClasses` in the world set file (absent = the built-in set) |

See [File Format](file-format.md#editor-custom-properties).
