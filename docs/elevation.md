# Elevation

Each map can have a **height surface**: absolute ground height (sea level = 0) everywhere on
the map, from the sea floor to mountain tops, to the centimeter. It's shown as colored
contour bands with hillshading, read out under the cursor, and connected across the maps of a
world set.

Heights can come from several sources, which combine on one surface:

| Source | Use it for |
|---|---|
| [Painting](#painting-heights) | Shaping by hand |
| [Heights from terrain](#heights-from-terrain) | A first surface from the terrain you've painted |
| [Generate](#generate) | Natural-looking bumps on top |
| [Spot heights](#spot-heights) | Known heights at points, such as a summit or a ford |
| [Child maps](#across-maps) | More detailed maps refine their parent |

Hand-painted heights are **protected**: terrain fills, generation and spot-height fitting
leave them alone. The brush's **Release** mode removes that protection.

---

## Adding elevation

In the **Elevation** section of the left panel, click **Add elevation…**, then:

- **Add** — a flat surface at the starting height, or
- **Add from terrain** — built from the painted terrain types (see below); places without a
  terrain height get the starting height.

**Remove elevation…** deletes it (when you save). Elevation is saved with the map (`Ctrl+S`).

---

## Viewing heights

| Control | Effect |
|---|---|
| Elevation checkbox | Show or hide the overlay |
| Opacity | How strongly the overlay covers the tiles |
| Hillshade | Shade slopes as if lit from the north-west |
| Show child maps | Show child maps' heights inside their footprints (see [Across maps](#across-maps)) |

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

Select the **Height** tool (`5`). Its settings appear in the Elevation section:

| Mode | Effect |
|---|---|
| Raise / Lower | Push the ground up or down, strongest at the centre (**Amount per step**) |
| Set | Flatten to the **Target** height |
| Smooth | Even out bumps toward the neighbours |
| Release | Remove protection from hand-set heights, without changing them |
| Spot | Place spot heights instead of painting (see below) |

**Radius** is in cells. Each press-drag-release stroke is one undo step. Right-click picks the
height under the pointer as the Set target, but only on maps outside a world set: inside one,
right-click opens the map menu.

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
3. In the Elevation section, click **Heights from terrain**.

Each height is set from the terrain around it (on square maps, the average of the cells
meeting at the corner), then smoothed so different types meet in slopes rather than cliffs.
The topmost tile layer with height settings counts, so a road layer without settings shows
the terrain under it. Hand-set heights are kept; places with no terrain settings keep their
height. One undo step.

The settings are stored in the world set's shared tileset, so a terrain type means the same on
every map. If nothing happens, the panel explains why, e.g. no base heights set yet.

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
3. Click **Fit to spot heights** in the Elevation section.

Fitting **bends the current surface** so it passes exactly through every spot, keeping its
shape (terrain, generated detail, painting). Each spot's pull fades to nothing at its reach;
spots stay exact where reaches overlap. Hand-set heights are kept; if they stop a spot being
met, the panel shows the remaining difference. One undo step.

Spots are Tiled point objects (type `spot height`) in a **Spot heights** layer, so Tiled and
game exports can read them. They're drawn with their name and height.

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

With the child open, the Elevation section shows **Fit to parent** with how far off it is, and:

- **Re-base** — shift the whole child up or down by the average difference (its shape is kept)
- **Tilt to match** — also tilt it to follow the slope of the parent around it

One undo step; hand-set marks are kept. If the parent's ground under the child is uneven (a
peak, say), no shift or tilt can fit it, and the panel says so.

---

## Storage

Heights are saved next to the map, in the world set folder:

| File | Contents |
|---|---|
| `heights/<map>.tif` | 32-bit integer TIFF, whole centimeters, absolute |
| `heights/<map>.mask.png` | Which heights are hand-set |

The map links to them with a Tiled `file` custom property, `heights`. See
[File Format](file-format.md#elevation-files).
