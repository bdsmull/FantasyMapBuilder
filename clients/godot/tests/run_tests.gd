## The Godot world-coordinate addon against the shared test suite
## (clients/conformance/expected.json, written by the editor's reference implementation).
##
## Run (from the repository root):
##   godot --headless --path clients/godot --import
##   godot --headless --path clients/godot --script res://tests/run_tests.gd
## Exits 0 when every check passes, 1 otherwise.
extends SceneTree

const TOL := 1e-6

var _failures := 0
var _checks := 0


func _init() -> void:
	var conformance := ProjectSettings.globalize_path("res://").path_join("../conformance").simplify_path()
	var expected = JSON.parse_string(FileAccess.get_file_as_string(conformance.path_join("expected.json")))
	var ws := WorldSetCoords.open(conformance.path_join("Conformance"))
	if typeof(expected) != TYPE_DICTIONARY or ws == null:
		printerr("Couldn't read the conformance files under ", conformance)
		quit(1)
		return
	_run(ws, expected)
	_check_scales(conformance.path_join("../../frontend/src/data/mapScales.json").simplify_path())
	print("%d checks, %d failed" % [_checks, _failures])
	quit(1 if _failures > 0 else 0)


func _check(ok: bool, what: String) -> void:
	_checks += 1
	if not ok:
		_failures += 1
		printerr("FAIL: ", what)


func _close(got: Variant, want: Array, what: String) -> void:
	var ok: bool = got != null and absf(float(got.x) - float(want[0])) <= TOL and absf(float(got.y) - float(want[1])) <= TOL
	_check(ok, "%s: got %s, want %s" % [what, str(got), str(want)])


## The addon embeds the scale table (it must work outside this repository). The editor and
## its server share one file; this fails if the addon's copy drifts from it.
func _check_scales(path: String) -> void:
	var shared = JSON.parse_string(FileAccess.get_file_as_string(path))
	if typeof(shared) != TYPE_ARRAY or shared.is_empty():
		_check(false, "can't read the shared scale table %s" % path)
		return
	var ids := []
	for s in shared:
		ids.append(s["id"])
	for id in WorldSetCoords.SCALES:
		_check(id in ids, "scale '%s' is in the addon but not in the shared table" % id)
	var ws := WorldSetCoords.new()
	for s in shared:
		var id: String = s["id"]
		var meters := float(s["metric"]["metersPerUnit"])
		var feet := float(s["imperial"]["feetPerUnit"])
		var embedded = WorldSetCoords.SCALES.get(id)
		_check(embedded != null and embedded[0] == meters and embedded[1] == feet,
			"scale '%s': the addon has %s, the shared table [%s, %s]" % [id, str(embedded), meters, feet])
		# And through the addon's own code, with its unit conversion
		ws._maps[id] = {"properties": [{"name": "scale", "type": "string", "value": id}]}
		for units in ["metric", "imperial"]:
			ws.units = units
			var want := meters if units == "metric" else feet * 0.3048
			_check(absf(ws.cell_size(id) - want) <= 1e-12 * want,
				"%s cell size of scale '%s': got %s, want %s" % [units, id, ws.cell_size(id), want])


func _run(ws: WorldSetCoords, expected: Dictionary) -> void:
	_check(ws.name == "Conformance", "world set name")
	_check(Array(ws.roots()) == expected["roots"], "roots: %s" % str(ws.roots()))

	for map_name in expected["cellSizes"]:
		var want = expected["cellSizes"][map_name]
		var got := ws.cell_size(map_name)
		_check((want == null and got < 0) or (want != null and absf(got - want) <= 1e-9 * absf(want)),
			"cell size of %s: got %s, want %s" % [map_name, got, want])

	for map_name in expected["frames"]:
		var want = expected["frames"][map_name]
		var f = ws.frame(map_name)
		if want == null:
			_check(f == null, "%s has no frame" % map_name)
			continue
		_check(f != null and f.root == want["root"], "root of %s" % map_name)
		var r = ws.world_rect(map_name)
		for side in want["rect"]:
			_check(r != null and absf(r[side] - want["rect"][side]) <= TOL,
				"%s rect %s: got %s, want %s" % [map_name, side, str(r), want["rect"][side]])

	for c in expected["pixelToWorld"]:
		_close(ws.pixel_to_world(c["map"], c["pixel"][0], c["pixel"][1]), c["world"], "pixel_to_world %s %s" % [c["map"], c["pixel"]])
	for c in expected["cellToWorld"]:
		_close(ws.cell_to_world(c["map"], int(c["cell"][0]), int(c["cell"][1])), c["world"], "cell_to_world %s %s" % [c["map"], c["cell"]])
	for c in expected["worldToPixel"]:
		_close(ws.world_to_pixel(c["map"], c["world"][0], c["world"][1]), c["pixel"], "world_to_pixel %s %s" % [c["map"], c["world"]])
	for c in expected["worldToCell"]:
		var got = ws.world_to_cell(c["map"], c["world"][0], c["world"][1])
		var want = c["cell"]
		var ok: bool = (want == null and got == null) or (want != null and got != null and got.x == int(want[0]) and got.y == int(want[1]))
		_check(ok, "world_to_cell %s %s: got %s, want %s" % [c["map"], c["world"], str(got), str(want)])
	for c in expected["mapsAt"]:
		var got := ws.maps_at(c["root"], c["world"][0], c["world"][1])
		var names := []
		for m in got:
			names.append(m.name)
		var want_names := []
		for m in c["maps"]:
			want_names.append(m["name"])
		_check(names == want_names, "maps_at %s %s: got %s, want %s" % [c["root"], c["world"], names, want_names])
		if names == want_names:
			for i in got.size():
				_check(got[i].z == int(c["maps"][i]["z"]), "maps_at z of %s" % got[i].name)
				_close(got[i].pixel, c["maps"][i]["pixel"], "maps_at pixel of %s" % got[i].name)

	_check(ws.pixel_to_world("loose", 0, 0) == null, "unplaced map has no world position")
	_check(ws.frame("no-such-map") == null, "unknown map has no frame")
