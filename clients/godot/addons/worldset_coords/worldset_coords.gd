## World coordinates for Fantasy Map Builder world sets, read straight from the files.
##
## World coordinates are meters, x east and y north of the world origin: the
## "world-origin" point object in the world's root map, or that map's centre.
## Positions are returned as {"x": float, "y": float} dictionaries (64-bit floats;
## Godot's Vector2 is 32-bit, which loses about half a meter at world scale).
## Cells are Vector2i.
##
## [codeblock]
## var ws := WorldSetCoords.open("res://world_sets/Brakka")
## var w = ws.cell_to_world("nauram-town", 12, 7)   # {x, y} meters, or null
## var cell = ws.world_to_cell("nauram-town", w.x, w.y)
## for m in ws.maps_at(ws.roots()[0], w.x, w.y): print(m.name)
## [/codeblock]
##
## The algorithm is specified in docs/coordinates.md of the Fantasy Map Builder
## repository. Mirrors frontend/src/utils/worldCoords.ts; the shared test suite in
## clients/conformance checks that the implementations agree.
class_name WorldSetCoords
extends RefCounted

const WORLD_ORIGIN_TYPE := "world-origin"
const WORLD_SET_SUFFIX := ".worldset.json"

const _METERS_PER_FOOT := 0.3048
const _FEET_PER_MILE := 5280.0
const _WHOLE_CELL_TOLERANCE := 1e-9

## Scale preset id -> [meters per cell (metric), feet per cell (imperial)]. Only needed
## for map files without a "metersPerUnit" property (saved by older editors).
## A copy of the editor's frontend/src/data/mapScales.json; the tests check they match.
const SCALES := {
	"room": [1.0, 2.0],
	"battle": [2.0, 5.0],
	"dungeon": [5.0, 10.0],
	"site": [10.0, 30.0],
	"town": [50.0, 150.0],
	"city": [250.0, _FEET_PER_MILE / 8.0],
	"local": [1e3, _FEET_PER_MILE],
	"province": [5e3, _FEET_PER_MILE * 6.0],
	"kingdom": [25e3, _FEET_PER_MILE * 30.0],
	"continent": [100e3, _FEET_PER_MILE * 100.0],
	"world": [500e3, _FEET_PER_MILE * 500.0],
}


## One map's grid: cell <-> pixel, and its cell space (one unit per cell, both axes).
class MapGeometry:
	var width: int
	var height: int
	var tilewidth: float
	var tileheight: float
	var hexagonal: bool
	var stagger_x := true
	var stagger_even := false
	var side_x := 0
	var side_y := 0
	var offset_x := 0
	var offset_y := 0
	var column_width := 0
	var row_height := 0
	var hex_width := 0
	var hex_height := 0
	var _ox: float
	var _oy: float
	var _px: float
	var _py: float

	func _init(data: Dictionary) -> void:
		width = int(data["width"])
		height = int(data["height"])
		tilewidth = float(data["tilewidth"])
		tileheight = float(data["tileheight"])
		hexagonal = data.get("orientation") == "hexagonal"
		if hexagonal:
			var axis = data.get("staggeraxis")
			stagger_x = axis == null or axis == "x"
			stagger_even = data.get("staggerindex") == "even"
			var side_value = data.get("hexsidelength")
			var side := int(side_value) if side_value != null else 0
			side_x = side if stagger_x else 0
			side_y = 0 if stagger_x else side
			offset_x = int((tilewidth - side_x) / 2.0)
			offset_y = int((tileheight - side_y) / 2.0)
			column_width = offset_x + side_x
			row_height = offset_y + side_y
			hex_width = column_width + offset_x
			hex_height = row_height + offset_y
			var c00 := hex_centre(0, 0)
			_ox = c00[0]
			_oy = c00[1]
			_px = hex_centre(1, 0)[0] - c00[0]
			_py = hex_centre(0, 1)[1] - c00[1]
			if _px == 0.0:
				_px = 1.0
			if _py == 0.0:
				_py = 1.0
		else:
			_px = tilewidth
			_py = tileheight
			_ox = tilewidth / 2.0
			_oy = tileheight / 2.0

	func _staggered(i: int) -> bool:
		return ((i & 1) == 1) != stagger_even

	func _hex_top_left(col: int, row: int) -> PackedFloat64Array:
		if stagger_x:
			return PackedFloat64Array([
				col * column_width,
				row * (hex_height + side_y) + (row_height if _staggered(col) else 0)])
		return PackedFloat64Array([
			col * (hex_width + side_x) + (column_width if _staggered(row) else 0),
			row * row_height])

	func hex_centre(col: int, row: int) -> PackedFloat64Array:
		var tl := _hex_top_left(col, row)
		return PackedFloat64Array([tl[0] + hex_width / 2.0, tl[1] + hex_height / 2.0])

	func pixel_to_cell_space(x: float, y: float) -> PackedFloat64Array:
		return PackedFloat64Array([0.5 + (x - _ox) / _px, 0.5 + (y - _oy) / _py])

	func cell_space_to_pixel(u: float, v: float) -> PackedFloat64Array:
		return PackedFloat64Array([_ox + (u - 0.5) * _px, _oy + (v - 0.5) * _py])

	## Centre of cell (col, row), in map pixels.
	func cell_centre(col: int, row: int) -> PackedFloat64Array:
		if hexagonal:
			return hex_centre(col, row)
		return cell_space_to_pixel(col + 0.5, row + 0.5)

	## The map's extent in pixels, from (0, 0).
	func pixel_size() -> PackedFloat64Array:
		if not hexagonal:
			return PackedFloat64Array([width * tilewidth, height * tileheight])
		if stagger_x:
			return PackedFloat64Array([
				width * column_width + offset_x,
				height * (hex_height + side_y) + (row_height if width > 1 else 0)])
		return PackedFloat64Array([
			width * (hex_width + side_x) + (column_width if height > 1 else 0),
			height * row_height + offset_y])

	## The cell holding a pixel (hex: the nearest centre), or null off the map.
	func pixel_to_cell(x: float, y: float) -> Variant:
		var uv := pixel_to_cell_space(x, y)
		if not hexagonal:
			var c := floori(uv[0])
			var r := floori(uv[1])
			if c >= 0 and r >= 0 and c < width and r < height:
				return Vector2i(c, r)
			return null
		var best: Variant = null
		var best_d := INF
		for col in range(floori(uv[0]) - 1, floori(uv[0]) + 2):
			for row in range(floori(uv[1]) - 1, floori(uv[1]) + 2):
				if col < 0 or row < 0 or col >= width or row >= height:
					continue
				var c := hex_centre(col, row)
				var d := (c[0] - x) * (c[0] - x) + (c[1] - y) * (c[1] - y)
				if d < best_d - 1e-9:
					best = Vector2i(col, row)
					best_d = d
		if best == null or sqrt(best_d) > maxf(hex_width, hex_height) / 2.0:
			return null
		return best


## Where a placed map sits in its world: enough to convert any of its points.
class MapFrame:
	var name: String
	var root: String
	var meters_per_cell: float
	## The map's cell-space origin, meters east / south of the root's cell-space origin.
	var bx: float
	var by: float
	## The world origin, the same way.
	var ox: float
	var oy: float


var folder: String
var data: Dictionary
var name: String
var units := "metric"
var nodes: Array = []
var _by_name := {}
var _maps := {}
var _geometry := {}


## Open a world set from its folder or its .worldset.json file (res://, user:// or an
## absolute path). Returns null if it can't be read.
static func open(path: String) -> WorldSetCoords:
	var file := path
	if DirAccess.dir_exists_absolute(path):
		file = ""
		var names := Array(DirAccess.get_files_at(path))
		names.sort()
		for f in names:
			if f.ends_with(WORLD_SET_SUFFIX):
				file = path.path_join(f)
				break
		if file == "":
			push_error("WorldSetCoords: no %s file in %s" % [WORLD_SET_SUFFIX, path])
			return null
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(file))
	if typeof(parsed) != TYPE_DICTIONARY:
		push_error("WorldSetCoords: can't read %s" % file)
		return null
	var ws := WorldSetCoords.new()
	ws.folder = file.get_base_dir()
	ws.data = parsed
	ws.name = str(parsed.get("name", ws.folder.get_file()))
	if parsed.get("units") in ["metric", "imperial"]:
		ws.units = parsed["units"]
	for n in parsed.get("nodes", []):
		if typeof(n) == TYPE_DICTIONARY:
			ws.nodes.append(n)
			ws._by_name[n.get("mapName")] = n
	return ws


static func _prop(map: Dictionary, prop_name: String) -> Variant:
	for p in map.get("properties", []):
		if typeof(p) == TYPE_DICTIONARY and p.get("name") == prop_name:
			return p.get("value")
	return map.get(prop_name)


static func _ceil_cells(x: float) -> int:
	var nearest := floorf(x + 0.5)
	if absf(x - nearest) <= _WHOLE_CELL_TOLERANCE * maxf(1.0, absf(x)):
		return int(nearest)
	return ceili(x)


## Top-left of a child map's cell space, in its parent's cell space.
static func child_top_left(child_w: int, child_h: int, child_mpu: float, parent_mpu: float,
		anchor: Dictionary, offset: Variant) -> PackedFloat64Array:
	var fp_cols := _ceil_cells((child_w * child_mpu) / parent_mpu)
	var fp_rows := _ceil_cells((child_h * child_mpu) / parent_mpu)
	var col := int(anchor["col"])
	var row := int(anchor["row"])
	var col_min := col - floori(fp_cols / 2.0)
	var col_max := col + floori((fp_cols - 1) / 2.0)
	var row_min := row - floori(fp_rows / 2.0)
	var row_max := row + floori((fp_rows - 1) / 2.0)
	var w := (child_w * child_mpu) / parent_mpu
	var h := (child_h * child_mpu) / parent_mpu
	var dx := 0.0
	var dy := 0.0
	if typeof(offset) == TYPE_DICTIONARY:
		dx = float(offset.get("x", 0.0))
		dy = float(offset.get("y", 0.0))
	var cu := (col_min + col_max + 1) / 2.0 + dx
	var cv := (row_min + row_max + 1) / 2.0 + dy
	return PackedFloat64Array([cu - w / 2.0, cv - h / 2.0])


## A map's TMJ JSON, or null if there's no such file.
func map_data(map_name: String) -> Variant:
	if not _maps.has(map_name):
		var path := folder.path_join("maps").path_join(map_name + ".tmj")
		var parsed = JSON.parse_string(FileAccess.get_file_as_string(path)) if FileAccess.file_exists(path) else null
		_maps[map_name] = parsed if typeof(parsed) == TYPE_DICTIONARY else null
	return _maps[map_name]


func geometry(map_name: String) -> MapGeometry:
	if not _geometry.has(map_name):
		var d = map_data(map_name)
		if d == null:
			return null
		_geometry[map_name] = MapGeometry.new(d)
	return _geometry[map_name]


## A map's cell size in meters: its "metersPerUnit", else its scale preset; -1 if unknown.
func cell_size(map_name: String) -> float:
	var d = map_data(map_name)
	if d == null:
		return -1.0
	var mpu = _prop(d, "metersPerUnit")
	if (typeof(mpu) == TYPE_FLOAT or typeof(mpu) == TYPE_INT) and is_finite(mpu) and mpu > 0:
		return float(mpu)
	var scale = _prop(d, "scale")
	if typeof(scale) != TYPE_STRING or not SCALES.has(scale):
		return -1.0
	var map_units = _prop(d, "units")
	if not (map_units in ["metric", "imperial"]):
		map_units = units
	var preset: Array = SCALES[scale]
	return preset[1] * _METERS_PER_FOOT if map_units == "imperial" else float(preset[0])


## Maps with no parent: each is the root of its own world (frame of coordinates).
func roots() -> PackedStringArray:
	var out := PackedStringArray()
	for n in nodes:
		if n.get("parentMapName") == null:
			out.append(n["mapName"])
	return out


## A map's world origin in its pixels: its "world-origin" point object, else its centre.
func origin_pixel(map_name: String) -> Variant:
	var d = map_data(map_name)
	var geo := geometry(map_name)
	if d == null or geo == null:
		return null
	for layer in d.get("layers", []):
		if typeof(layer) != TYPE_DICTIONARY or layer.get("type") != "objectgroup":
			continue
		for obj in layer.get("objects", []):
			if typeof(obj) == TYPE_DICTIONARY and obj.get("type", obj.get("class")) == WORLD_ORIGIN_TYPE:
				return PackedFloat64Array([float(obj.get("x", 0.0)), float(obj.get("y", 0.0))])
	return geo.cell_space_to_pixel(geo.width / 2.0, geo.height / 2.0)


## Where a placed map sits in its world; null if it isn't placed (or can't be).
func frame(map_name: String) -> MapFrame:
	var node = _by_name.get(map_name)
	var geo := geometry(map_name)
	var mpu := cell_size(map_name)
	if node == null or geo == null or mpu <= 0:
		return null
	var bx := 0.0
	var by := 0.0
	var child_geo := geo
	var child_mpu := mpu
	var seen := {map_name: true}
	while node.get("parentMapName") != null:
		var parent: String = node["parentMapName"]
		var parent_node = _by_name.get(parent)
		var parent_geo := geometry(parent)
		var parent_mpu := cell_size(parent)
		if node.get("parentAnchor") == null or parent_node == null or parent_geo == null \
				or parent_mpu <= 0 or seen.has(parent):
			return null
		seen[parent] = true
		var tl := child_top_left(child_geo.width, child_geo.height, child_mpu, parent_mpu,
			node["parentAnchor"], node.get("parentOffset"))
		bx += tl[0] * parent_mpu
		by += tl[1] * parent_mpu
		child_geo = parent_geo
		child_mpu = parent_mpu
		node = parent_node
	var root: String = node["mapName"]
	var o: PackedFloat64Array = origin_pixel(root)
	var ouv := child_geo.pixel_to_cell_space(o[0], o[1])
	var f := MapFrame.new()
	f.name = map_name
	f.root = root
	f.meters_per_cell = mpu
	f.bx = bx
	f.by = by
	f.ox = ouv[0] * child_mpu
	f.oy = ouv[1] * child_mpu
	return f


## A map pixel -> world meters {x (east), y (north)}, or null.
func pixel_to_world(map_name: String, x: float, y: float) -> Variant:
	var f := frame(map_name)
	if f == null:
		return null
	var uv := geometry(map_name).pixel_to_cell_space(x, y)
	return {"x": f.bx + uv[0] * f.meters_per_cell - f.ox, "y": f.oy - (f.by + uv[1] * f.meters_per_cell)}


## The centre of a map cell -> world meters {x, y}, or null.
func cell_to_world(map_name: String, col: int, row: int) -> Variant:
	var geo := geometry(map_name)
	if geo == null:
		return null
	var c := geo.cell_centre(col, row)
	return pixel_to_world(map_name, c[0], c[1])


## World meters -> a map pixel {x, y} (which may lie off the map), or null.
func world_to_pixel(map_name: String, x: float, y: float) -> Variant:
	var f := frame(map_name)
	if f == null:
		return null
	var u := (x + f.ox - f.bx) / f.meters_per_cell
	var v := (f.oy - y - f.by) / f.meters_per_cell
	var p := geometry(map_name).cell_space_to_pixel(u, v)
	return {"x": p[0], "y": p[1]}


## World meters -> the map cell there (Vector2i), or null when it's off the map.
func world_to_cell(map_name: String, x: float, y: float) -> Variant:
	var p = world_to_pixel(map_name, x, y)
	if p == null:
		return null
	return geometry(map_name).pixel_to_cell(p.x, p.y)


## A map's extent in world meters {west, east, south, north}, or null.
func world_rect(map_name: String) -> Variant:
	var geo := geometry(map_name)
	var a = pixel_to_world(map_name, 0.0, 0.0)
	if geo == null or a == null:
		return null
	var size := geo.pixel_size()
	var b = pixel_to_world(map_name, size[0], size[1])
	return {"west": minf(a.x, b.x), "east": maxf(a.x, b.x), "south": minf(a.y, b.y), "north": maxf(a.y, b.y)}


## Maps of root's world covering world point (x, y), as {name, z, meters_per_cell,
## pixel: {x, y}}: most detailed (smallest cells) first; among equals, ground level
## (Z = 0) before other levels, then by name.
func maps_at(root: String, x: float, y: float) -> Array:
	var found := []
	for n in nodes:
		var map_name: String = n.get("mapName", "")
		var f := frame(map_name)
		if f == null or f.root != root:
			continue
		var r = world_rect(map_name)
		if r == null or x < r.west or x > r.east or y < r.south or y > r.north:
			continue
		found.append({"name": map_name, "z": int(n.get("z", 0)), "meters_per_cell": f.meters_per_cell,
			"pixel": world_to_pixel(map_name, x, y)})
	found.sort_custom(_more_detailed)
	return found


static func _more_detailed(a: Dictionary, b: Dictionary) -> bool:
	if a.meters_per_cell != b.meters_per_cell:
		return a.meters_per_cell < b.meters_per_cell
	if (a.z != 0) != (b.z != 0):
		return a.z == 0
	return a.name < b.name
