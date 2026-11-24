# Elevation

Each map can have a **height surface**: absolute ground height (sea level = 0) everywhere on
the map, from the sea floor to mountain tops, to the centimeter. It's shown as colored
contour bands with hillshading, read out under the cursor, and connected across the maps of a
world set. [Water](#water) (lakes, the sea, and where rain would run) follows from it.

Heights can come from several sources, which combine on one surface:

| Source | Use it for |
|---|---|
| [Painting](#painting-heights) | Shaping by hand |
| [Heights from terrain](#heights-from-terrain) | A first surface from the terrain you've painted |
| [Generate](#generate) | Natural-looking bumps on top |
| [Spot heights](#spot-heights) | Known heights at points, such as a summit or a ford |
| [Contour lines](#contour-lines) | Lines of known height, e.g. traced from a topographic map |
| [Child maps](#across-maps) | More detailed maps refine their parent |
| [Heightmap import](#import-heightmap) | A heightmap made in another tool |

Hand-painted heights are **protected**: terrain fills, generation and fitting to spots and
contours leave them alone. The brush's **Release** mode removes that protection.

---

## Adding elevation

Choose the **Height** tool (`2`). On a map without elevation its panel offers **Add elevation…**;
click it, then:

- **Add** — a flat surface at the starting height, or
- **Add from terrain** — built from the painted terrain types (see below); places without a
  terrain height get the starting height.

**Remove elevation…** (Height tool, Elevation section) deletes it (when you save). Elevation is
saved with the map (`Ctrl+S`).

---

## Viewing heights

The **Show** section of the left panel sets how the elevation is drawn, whatever tool you use:

| Control | Effect |
|---|---|
| Elevation checkbox | Show or hide the overlay |
| Opacity | How strongly the overlay covers the tiles |
| Hillshade | Shade slopes as if lit from the north-west |
| Child maps | Show child maps' heights inside their footprints (see [Across maps](#across-maps)) |
| Water | Show lakes and the sea, shaded by depth (see [Water](#water)) |
| Flow | Show streams where rain would run and hollows where it would pool; **Streams** sets how many |
| Headroom | Shade where the headroom differs from the map's own (see [Ceilings](#ceilings)) |

**Colors.** Maps that span more than 500 m of height, or go below sea level, use absolute
colors (blues below sea level; greens, tans, browns, greys and white with height). Flatter maps
stretch the colors over their own range so small differences stay visible.

**Contour bands** are spaced to suit the map's scale:

| Scale | Room | Battle | Dungeon | Site | Town | City | Local | Province | Kingdom | Continent | World |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Metric | 1 m | 1 m | 2 m | 5 m | 10 m | 25 m | 50 m | 100 m | 250 m | 250 m | 500 m |
| Imperial | 2 ft | 5 ft | 5 ft | 10 ft | 25 ft | 50 ft | 100 ft | 250 ft | 500 ft | 1000 ft | 1000 ft |

The **status bar** shows the height under the cursor, and which child map it comes from when
the cursor is over one. The **Inspect** tool shows it too, with whether it's hand-set.

---

## Painting heights

Select the **Height** tool (`2`). Its panel (right) has a **Brush** section:

| Mode | Effect |
|---|---|
| Raise / Lower | Push the ground up or down, strongest at the centre (**Amount per step**) |
| Set | Flatten to the **Target** height |
| Smooth | Even out bumps toward the neighbours |
| Release | Remove protection from hand-set heights, without changing them |
| Spot | Place spot heights instead of painting (see below) |
| Contour | Draw contour lines instead of painting (see below) |
| Ceiling | Set this level's headroom and draw ceiling shapes (see [Ceilings](#ceilings)) |

**Radius** is in cells. Each press-drag-release stroke is one undo step. Right-click picks the
height under the pointer as the Set target (in Spot and Contour modes, as the height for new
ones), but only on maps outside a world set: inside one, right-click opens the map menu.

Below the brush, the **Elevation** section builds the surface: fitting it to the parent map,
**Heights from terrain**, **Generate…**, **Fit to spots & contours**, and **Remove elevation…**.

Heights are stored at cell **corners** on square maps and at hex **centres** on hex maps, and
are smooth in between.

---

## Heights from terrain

Each terrain type in a tileset can have a **base height** (typical ground height) and a
**relief** (how much the ground varies; used by [Generate](#generate)).

1. **Edit → Manage Tilesets… → Heights…** on a tileset.
2. Enter values in the map's units, or click **Suggest values** to fill blanks for common
   names (Plains 100 m / 20 m, Hills 400 m / 150 m, Mountains 2,000 m / 800 m,
   Ocean −200 m / 50 m …). Nothing changes until you click **Apply**. Types like *Canyon*
   or *Sunken Land* get no suggestion, because their height depends on their surroundings.
3. In the Height tool's Elevation section, click **Heights from terrain**.

Each height is set from the terrain around it (on square maps, the average of the cells
meeting at the corner), then smoothed so different types meet in slopes rather than cliffs.
The topmost tile layer with height settings counts, so a road layer without settings shows
the terrain under it. Hand-set heights are kept; places with no terrain settings keep their
height. One undo step.

The settings are stored in the world set's shared tileset, so a terrain type means the same on
every map. If nothing happens, the panel explains why, e.g. no base heights set yet. If some
painted types have no base height, the panel warns which ones (and in which tileset) and how
many cells kept their height, e.g. *No base height for Plains, Forest (Coarse Detail): 3,456
cells kept their current height*. A map often uses several tilesets; each needs its own
settings.

---

## Generate

**Generate…** adds natural-looking detail **on top of** the current heights. A typical flow is
Heights from terrain → Generate → touch up by hand.

| Setting | Meaning |
|---|---|
| Strength | Multiplies each terrain type's relief (0–200%) |
| Relief elsewhere | Relief where the terrain sets none (0 = leave those places alone) |
| Feature size | Width of the largest bumps (e.g. 20 km) |
| Roughness | How much each smaller layer of bumps keeps (30–80%; higher is more rugged) |
| Seed | Which pattern; **New** picks another |

About 95% of places change by no more than ±relief. Hand-set heights are kept; one undo step.

**World-anchored.** Feature size, roughness and seed belong to the **world set**, and the
pattern is laid out in real distance across the whole world set. A place gets the same bumps on
a province map and on the town map inside it, so maps generated separately match. A map whose
cells are larger than the feature size can't show any bumps; the panel says so. Changing these
settings affects maps generated from then on.

---

## Spot heights

Spot heights are known heights at points, such as a summit, a ford or a well.

1. Height tool → **Spot** mode.
2. Set the **height** and **reach** (in cells) for new spots, then click the map to place one.
   Click a spot to select it and edit its name, height and reach, or delete it.
3. Click **Fit to spots & contours** in the Height tool's Elevation section (see
   [Fitting](#fitting-to-spots-and-contours)).

Spots are Tiled point objects (type `spot height`) in a **Spot heights** layer, so Tiled and
game exports can read them. They're drawn with their name and height.

---

## Contour lines

Contour lines are lines of known height: trace them from a topographic map, or sketch the shape
of a hill or a valley side.

1. Height tool → **Contour** mode.
2. Set the **height** and **reach** (in cells) for new contours. The **−** / **+** buttons step
   the height by one contour interval of the map's scale, handy when tracing one line after
   another.
3. Click the map to add points; **double-click** or **Enter** finishes the line. Click the
   **first point** again (it's drawn larger) to close a loop around a hilltop or a hollow.
   **Backspace** removes the last point; **Esc** cancels.
4. Click **Fit to spots & contours** in the Height tool's Elevation section.

Click a contour to select it: drag its points, drag a segment's midpoint to add a point, and
**Delete** removes the selected point (or the whole contour when no point is selected). The
panel edits its name, height and reach, and whether it's a **closed loop**. Every change is one
undo step.

Contours are drawn as thin brown lines labelled with their height. They're Tiled objects of
type `contour` (a polyline, or a polygon when closed) in a **Contours** layer. They aren't roads
or rivers: the Roads and Water tools and the Roads & rivers toggle ignore them.

---

## Fitting to spots and contours

**Fit to spots & contours** **bends the current surface** so it passes through every spot
height and follows every contour, keeping its shape (terrain, generated detail, painting). The
bend is the smoothest one that fits, and it fades to nothing at each mark's **reach**:

- Between contours closer than twice their reach, the ground rises smoothly from one to the
  next. Set the reach to at least half the spacing of your contours.
- Beyond the outermost contours it eases back into the existing ground within the reach.
- Spots are met to the centimeter; contours to within a few centimeters where they curve tightly.

Hand-set heights are kept. If they stop the surface meeting a mark, or contours cross or crowd
each other, the panel shows the largest remaining difference. One undo step. On a large map
with long contours it can take a second or two.

---

## Water

The **Water** tool (`3`) has two modes: **Lakes & sea**, and **Rivers** (drawing rivers, streams,
brooks and canals; see [Roads & Rivers](roads-rivers.md)). Lakes and the sea need elevation;
rivers don't.

### Lakes and seas

A lake is a **surface height** placed in a basin: the water fills every place connected to that
point whose ground is lower, the way a real lake fills its basin, so its shore follows the
ground.

1. Water tool → **Lakes & sea**.
2. Set the **surface** height for new water (right-click picks the height under the pointer).
3. Click in the basin.

Click a lake's marker to select it: edit its name and surface, drag it to another basin, or
delete it (**Delete**). The panel shows how much it covers and how deep it gets, and warns when:

- it's **dry**: the ground at the marker is above the surface (its marker turns grey);
- it **reaches the map's edge**: on this map's ground it would spill beyond the map, usually
  because the surface is above the lowest point of the basin's rim.

**The sea** needs no marker: ground below 0 m that connects to the map's edge is sea. An inland
basin below sea level stays dry unless you place water in it. **Sea below 0 m** (Water tool,
Lakes & sea) turns the automatic sea off for a map (for an inland map whose edge dips below 0 m).

Water is shaded by depth, light when shallow and dark when deep. The **Inspect** tool shows the
water at a point: which lake (or the sea), how deep, and its surface. Water is worked out from
each map's own heights (child maps' heights shown on a parent don't change it).

Lakes are Tiled point objects of type `water` with a `height` (the surface, in meters) in a
**Water** layer; the sea switch is the map's `sea` property.

### Where rain would run

Tick **Flow** (Show section, or **Show Flow** in the Water tool's Rivers mode) to see streams and
hollows worked out from the heights:

- **Streams** show where enough ground drains through a place, getting wider downstream. The
  **Streams** slider shows fewer (only the big ones) or more.
- **Hollows** (pale blue) are places with no way out, where water would pool.

Flow runs into lakes and the sea and off the map's edge, and follows drawn rivers as channels.
It's a view only: nothing is stored and the heights don't change.

### Turning a stream into a river

With **Flow** shown, the Water tool's **Rivers** mode has a **Convert to River** button (under
**From the elevation**). Press it, then click on a
stream (the one under the pointer is highlighted first; Esc cancels). It becomes a drawn river
line:

- from where the stream begins (following its main branch, the one with the most water) down to
  where it ends: a lake or the sea, the map's edge, or a river already drawn (it ends exactly on
  that river);
- its type comes from the land draining into it: a **brook** under 10 km², a **stream** under
  100 km², otherwise a **river** (a stream on maps without a scale; with a world set's own
  waterways, the narrowest, middle or widest);
- one undo step. It's an ordinary river from then on: edit, retype or carve it like one you drew.

### Carving rivers

**Carve rivers** (Water tool, Rivers mode) cuts each drawn river, stream, brook and canal (see
[Roads & Rivers](roads-rivers.md)) into the heights, so the ground and the drawn rivers agree:

- the bed is a tenth of the river's width below the ground along it (between 0.3 m and 5 m), and
  it never rises downstream (from the river's higher end to its lower one);
- heights within half the river's width of it, and at least the nearest ones on a coarse map,
  are lowered to the bed. Nothing is raised.

Hand-set heights are kept; one undo step. Roads are not carved.

---

## Across maps

In a world set, child maps **lead**: each map keeps its own heights, and a parent **shows** its
children's heights inside their footprints, averaged to the parent's cell size, easing into the
parent's own heights across a narrow band at the edge. The parent's stored heights are not
changed. Grandchildren count too. **Show child maps** turns this off to see the parent's own
heights.

Only ground-level maps (Z = 0) take part. Children much smaller than one parent cell are left
out.

### Fitting a child to its parent

A child's edges should meet its parent's ground. When they're off by more than one contour band
of the parent's scale on average, the hierarchy panel shows an **Elevation mismatch** warning.

With the child open, the Height tool's Elevation section shows **Fit to parent** with how far
off it is, and:

- **Re-base** — shift the whole child up or down by the average difference (its shape is kept)
- **Tilt to match** — also tilt it to follow the slope of the parent around it

One undo step; hand-set marks are kept. If the parent's ground under the child is uneven (a
peak, say), no shift or tilt can fit it, and the panel says so.

---

## Ceilings

On a building's floors, in caves and mines, a map's heights are its **floor**. The **ceiling**
over a spot, and so the **headroom** (ceiling less floor), is the lower of:

- **The level above.** [Z levels](world-sets.md#z-levels) share a parent map. The floor of the
  next level up covering the spot (the lowest higher Z that has elevation), less that level's
  **floor thickness**, is the ceiling. A map below ground (Z < 0) with no level above has the
  parent's ground over it.
- **This level's own headroom:** inside a **ceiling shape**, the shape's headroom (the lowest,
  where shapes overlap), elsewhere the map's **headroom**. Both are heights above the floor, so
  the ceiling follows a sloping floor.

With neither there is no ceiling: open sky.

**Floor thickness** is set for the whole world set in **Edit → World Sets…** (0.3 m unless set).
A map's own, in its Ceiling mode panel, overrides it: it's the thickness under that map's floor.

### Ceiling mode

The Height tool's **Ceiling** mode panel shows the level and what's above it, and sets:

| Setting | Effect |
|---|---|
| This map's headroom | Headroom wherever no ceiling shape sets one. Blank: none |
| Floor thickness | Thickness of this map's floor, for the level below. Blank: the world set's |
| New shapes: headroom | Headroom inside shapes you draw next |

Click the map to start a **ceiling shape**, click to add corners, and click the first corner
(or double-click, or press `Enter`) to close it. `Esc` cancels; `Backspace` removes the last
corner. Click a shape's outline to select it: rename it, change its headroom, drag its corners,
drag a side's midpoint to add one, and `Delete` removes the selected corner, or the shape. A
shape's headroom can be lower than the map's (a low passage) or higher (a tall hall), but never
above the floor over it. Each change is one undo step.

### Seeing headroom

- The **status bar** shows the headroom under the cursor and what sets it (the floor of the
  level above, the ground, the map's headroom or a ceiling shape), or "open sky" on a level
  off the ground. The **Inspect** tool shows it with the ceiling's height.
- **Show → Headroom** shades the cells where the headroom differs from the map's own: orange
  where it's lower, blue where it's higher. On a map without a headroom, it shades wherever
  there's a ceiling.

The levels above are read when the map opens; after editing another level, reopen this one to
see the change.

---

## Heightmaps for game engines

Game engines (Unity, Unreal, Godot terrain plugins) build terrain from a **heightmap**: a grid of
16-bit values, 0 to 65535, plus the heights those stand for. In the Height tool's Elevation
section:

### Export heightmap

| Setting | Choices |
|---|---|
| Format | **PNG**, 16-bit grayscale (Unreal, Godot, most tools), or **RAW** `.r16`, 16-bit little-endian (Unity's *Import Raw*, byte order *Windows*) |
| Size | **This map's samples** (a 40 × 20 map's 41 × 21 corners), or **square 2ⁿ + 1** (33 … 4097, as Unity needs), stretched to fill it |
| Range | **This map's range**: 0 is its lowest height and 65535 its highest. Or a **fixed range**, so neighbouring maps' heightmaps line up |
| Include child maps' heights | The surface as shown, with child maps' heights inside their footprints (when they have some) |

**Export** downloads the image and a `.json` beside it (the browser may ask to allow two
downloads). The panel and the `.json` give what the engine asks for: the lowest and highest
heights, the size of one step, the spacing between samples and the terrain's real width and
length. Set the engine terrain to that size and height range. Heights outside a fixed range are
clamped to it, and the panel warns first. Hex maps are resampled to a square grid, one sample per
hex each way. See [File Format](file-format.md#exported-heightmaps) for the `.json`.

### Import heightmap

**Choose file…** takes a grayscale PNG or TIFF (8- or 16-bit, or 32-bit integer or float), a
16-bit RAW (`.r16` / `.raw`), or the `.json` exported beside one (it fills in the range and RAW
size). Then:

- **Heights from … to …**: the heights the file's lowest and highest values stand for. A PNG this
  editor exported fills them in; otherwise they start at the map's current range.
- **Size** and **Big-endian** (RAW only): RAW files have no header; a square size is guessed.
- **Keep hand-set heights**: on by default; untick to overwrite them too (they lose their mark).

The file is stretched over the whole map, like an engine terrain; the panel warns when its shape
differs from the map's. **Import** sets the heights as one undo step.

---

## Storage

Heights are saved next to the map, in the world set folder:

| File | Contents |
|---|---|
| `heights/<map>.tif` | 32-bit integer TIFF, whole centimeters, absolute |
| `heights/<map>.mask.png` | Which heights are hand-set |

The map links to them with a Tiled `file` custom property, `heights`. See
[File Format](file-format.md#elevation-files).
