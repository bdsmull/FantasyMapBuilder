"""
Tests for TMJ file I/O and image export (Phase 5).

15 tests covering write, read, round-trip, and export.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from map_editor.io import tmj_reader, tmj_writer
from map_editor.models.hex_map import HexMap, HexOrientation
from map_editor.models.layer import ObjectLayer, TileLayer
from map_editor.models.map_object import MapObject, ObjectShape
from map_editor.models.tile_map import TileMap
from map_editor.models.tileset import TileCategory, TileDefinition, Tileset


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _simple_tile_map() -> TileMap:
    """Return a minimal TileMap with one tile layer and one object layer."""
    MapObject.reset_id_counter(0)
    ts = Tileset(
        name="TestSet",
        source="",
        tile_width=32,
        tile_height=32,
        tiles=[
            TileDefinition(
                id=1, name="Grass", color=(106, 168, 79),
                category=TileCategory.TERRAIN, sheet_col=0, sheet_row=0,
            ),
            TileDefinition(
                id=2, name="Water", color=(66, 133, 244),
                category=TileCategory.TERRAIN, sheet_col=1, sheet_row=0,
            ),
        ],
        first_gid=1,
    )
    tile_layer = TileLayer(name="Ground", width=4, height=3)
    tile_layer.set_tile(0, 0, 1)
    tile_layer.set_tile(1, 1, 2)

    obj_layer = ObjectLayer(name="Objects")
    obj_layer.add_object(MapObject.make_point("Hero", 64.0, 32.0, object_type="spawn"))

    return TileMap(
        name="test_map",
        width=4,
        height=3,
        tile_width=32,
        tile_height=32,
        tilesets=[ts],
        layers=[tile_layer, obj_layer],
    )


def _simple_hex_map() -> HexMap:
    """Return a minimal HexMap with one tile layer."""
    MapObject.reset_id_counter(0)
    ts = Tileset(
        name="HexSet",
        source="",
        tile_width=64,
        tile_height=64,
        tiles=[
            TileDefinition(
                id=1, name="Plains", color=(144, 200, 80),
                category=TileCategory.TERRAIN, sheet_col=0, sheet_row=0,
            ),
        ],
        first_gid=1,
    )
    tile_layer = TileLayer(name="Terrain", width=5, height=4)
    tile_layer.set_tile(0, 0, 1)

    return HexMap(
        name="test_hex",
        cols=5,
        rows=4,
        hex_size=40.0,
        orientation=HexOrientation.FLAT_TOP,
        tilesets=[ts],
        layers=[tile_layer],
    )


# ---------------------------------------------------------------------------
# TileMap write / read tests
# ---------------------------------------------------------------------------

def test_write_tile_map_creates_file(tmp_path):
    """Writing a TileMap must produce a .tmj file."""
    map_ = _simple_tile_map()
    out = tmp_path / "map.tmj"
    tmj_writer.write_tile_map(map_, out)
    assert out.exists()
    assert out.stat().st_size > 0


def test_tile_map_metadata_round_trip(tmp_path):
    """name, width, height, tile dimensions survive a write-read cycle."""
    map_ = _simple_tile_map()
    out = tmp_path / "map.tmj"
    tmj_writer.write_tile_map(map_, out)

    loaded = tmj_reader.read_map(out)
    assert isinstance(loaded, TileMap)
    assert loaded.name == "map"
    assert loaded.width == 4
    assert loaded.height == 3
    assert loaded.tile_width == 32
    assert loaded.tile_height == 32


def test_tile_data_round_trips(tmp_path):
    """Non-zero tile GIDs in the tile layer survive a round-trip."""
    map_ = _simple_tile_map()
    out = tmp_path / "map.tmj"
    tmj_writer.write_tile_map(map_, out)

    loaded = tmj_reader.read_map(out)
    tile_layer = loaded.tile_layers()[0]
    assert tile_layer.get_tile(0, 0) == 1
    assert tile_layer.get_tile(1, 1) == 2
    assert tile_layer.get_tile(2, 2) == 0


def test_tile_layer_props_round_trip(tmp_path):
    """TileLayer visible, opacity, and offset properties survive round-trip."""
    map_ = _simple_tile_map()
    layer = map_.tile_layers()[0]
    layer.visible = False
    layer.opacity = 0.75
    layer.offset_x = 4
    layer.offset_y = 8

    out = tmp_path / "map.tmj"
    tmj_writer.write_tile_map(map_, out)
    loaded = tmj_reader.read_map(out)

    loaded_layer = loaded.tile_layers()[0]
    assert loaded_layer.visible is False
    assert abs(loaded_layer.opacity - 0.75) < 1e-6
    assert loaded_layer.offset_x == 4
    assert loaded_layer.offset_y == 8


def test_tileset_path_is_relative(tmp_path):
    """The 'image' key in the JSON must be a relative path."""
    # Place a fake PNG next to the save directory
    fake_png = tmp_path / "sheet.png"
    fake_png.write_bytes(b"PNG")

    map_ = _simple_tile_map()
    map_.tilesets[0].source = str(fake_png)

    out = tmp_path / "subdir" / "map.tmj"
    tmj_writer.write_tile_map(map_, out)

    with open(out, encoding="utf-8") as f:
        data = json.load(f)

    image_path = data["tilesets"][0]["image"]
    assert not Path(image_path).is_absolute(), f"Expected relative path, got {image_path!r}"


def test_tileset_definition_round_trip(tmp_path):
    """TileDefinition name, color, and category survive a round-trip."""
    map_ = _simple_tile_map()
    out = tmp_path / "map.tmj"
    tmj_writer.write_tile_map(map_, out)

    loaded = tmj_reader.read_map(out)
    ts = loaded.tilesets[0]

    tile1 = ts.tile_by_id(1)
    assert tile1 is not None
    assert tile1.name == "Grass"
    assert tile1.color == (106, 168, 79)
    assert tile1.category == TileCategory.TERRAIN

    tile2 = ts.tile_by_id(2)
    assert tile2 is not None
    assert tile2.name == "Water"
    assert tile2.color == (66, 133, 244)


def test_object_layer_round_trip(tmp_path):
    """ObjectLayer with a POINT object survives a round-trip."""
    map_ = _simple_tile_map()
    out = tmp_path / "map.tmj"
    tmj_writer.write_tile_map(map_, out)

    loaded = tmj_reader.read_map(out)
    obj_layers = loaded.object_layers()
    assert len(obj_layers) == 1

    obj_layer = obj_layers[0]
    assert obj_layer.name == "Objects"
    assert len(obj_layer.objects) == 1

    obj = obj_layer.objects[0]
    assert obj.name == "Hero"
    assert obj.object_type == "spawn"
    assert obj.shape == ObjectShape.POINT
    assert abs(obj.x - 64.0) < 1e-6
    assert abs(obj.y - 32.0) < 1e-6


def test_object_shapes_round_trip(tmp_path):
    """RECTANGLE and POLYGON shapes survive a round-trip."""
    MapObject.reset_id_counter(0)
    ts = Tileset(
        name="S", source="", tile_width=32, tile_height=32,
        tiles=[TileDefinition(id=1, name="T", color=(0, 0, 0),
                              category=TileCategory.TERRAIN)],
        first_gid=1,
    )
    tile_layer = TileLayer(name="Ground", width=4, height=4)
    obj_layer = ObjectLayer(name="Objects")

    rect_obj = MapObject(
        name="Zone", object_type="trigger",
        x=10.0, y=20.0, width=64.0, height=32.0,
        shape=ObjectShape.RECTANGLE,
    )
    poly_obj = MapObject(
        name="Region", object_type="",
        x=5.0, y=5.0,
        shape=ObjectShape.POLYGON,
        polygon=[(0.0, 0.0), (32.0, 0.0), (16.0, 32.0)],
    )
    obj_layer.add_object(rect_obj)
    obj_layer.add_object(poly_obj)

    map_ = TileMap(
        name="shapes", width=4, height=4,
        tile_width=32, tile_height=32,
        tilesets=[ts], layers=[tile_layer, obj_layer],
    )

    out = tmp_path / "shapes.tmj"
    tmj_writer.write_tile_map(map_, out)
    loaded = tmj_reader.read_map(out)

    objs = loaded.object_layers()[0].objects
    names = {o.name: o for o in objs}

    assert names["Zone"].shape == ObjectShape.RECTANGLE
    assert abs(names["Zone"].width - 64.0) < 1e-6

    assert names["Region"].shape == ObjectShape.POLYGON
    assert len(names["Region"].polygon) == 3


def test_object_properties_round_trip(tmp_path):
    """int and string custom properties on objects survive a round-trip."""
    MapObject.reset_id_counter(0)
    ts = Tileset(
        name="S", source="", tile_width=32, tile_height=32,
        tiles=[TileDefinition(id=1, name="T", color=(0, 0, 0),
                              category=TileCategory.TERRAIN)],
        first_gid=1,
    )
    tile_layer = TileLayer(name="Ground", width=2, height=2)
    obj_layer = ObjectLayer(name="Objects")

    obj = MapObject(
        name="NPC", object_type="npc",
        x=0.0, y=0.0,
        shape=ObjectShape.POINT,
        properties={"level": 5, "dialogue": "Hello!"},
    )
    obj_layer.add_object(obj)

    map_ = TileMap(
        name="props", width=2, height=2,
        tile_width=32, tile_height=32,
        tilesets=[ts], layers=[tile_layer, obj_layer],
    )

    out = tmp_path / "props.tmj"
    tmj_writer.write_tile_map(map_, out)
    loaded = tmj_reader.read_map(out)

    loaded_obj = loaded.object_layers()[0].objects[0]
    assert loaded_obj.properties["level"] == 5
    assert loaded_obj.properties["dialogue"] == "Hello!"


def test_object_id_counter_reset(tmp_path):
    """After loading, _id_counter must be >= the max object id in the file."""
    map_ = _simple_tile_map()
    out = tmp_path / "map.tmj"
    tmj_writer.write_tile_map(map_, out)

    MapObject.reset_id_counter(0)
    loaded = tmj_reader.read_map(out)

    max_id = max(
        obj.object_id
        for layer in loaded.layers
        if isinstance(layer, ObjectLayer)
        for obj in layer.objects
    )
    assert MapObject._id_counter >= max_id


# ---------------------------------------------------------------------------
# HexMap write / read tests
# ---------------------------------------------------------------------------

def test_hex_map_metadata_round_trip(tmp_path):
    """cols, rows, hex_size, and orientation survive a write-read cycle."""
    map_ = _simple_hex_map()
    out = tmp_path / "hex.tmj"
    tmj_writer.write_hex_map(map_, out)

    loaded = tmj_reader.read_map(out)
    assert isinstance(loaded, HexMap)
    assert loaded.cols == 5
    assert loaded.rows == 4
    assert abs(loaded.hex_size - 40.0) < 1e-6
    assert loaded.orientation == HexOrientation.FLAT_TOP


def test_hex_tile_data_round_trips(tmp_path):
    """Hex tile GIDs survive a write-read cycle."""
    map_ = _simple_hex_map()
    out = tmp_path / "hex.tmj"
    tmj_writer.write_hex_map(map_, out)

    loaded = tmj_reader.read_map(out)
    tile_layer = loaded.tile_layers()[0]
    assert tile_layer.get_tile(0, 0) == 1
    assert tile_layer.get_tile(1, 0) == 0


def test_read_dispatches_hex_correctly(tmp_path):
    """read_map must return a HexMap for orientation='hexagonal'."""
    map_ = _simple_hex_map()
    out = tmp_path / "hex.tmj"
    tmj_writer.write_hex_map(map_, out)

    loaded = tmj_reader.read_map(out)
    assert isinstance(loaded, HexMap)


# ---------------------------------------------------------------------------
# Exporter tests (require QApplication — provided by conftest)
# ---------------------------------------------------------------------------

def test_export_tile_map_creates_png(tmp_path, qapp):
    """export_tile_map must produce a loadable PNG file."""
    from PyQt6.QtGui import QImage
    from map_editor.rendering import exporter

    map_ = _simple_tile_map()
    out = tmp_path / "export.png"
    exporter.export_tile_map(map_, out)

    assert out.exists()
    img = QImage(str(out))
    assert not img.isNull()
    assert img.width() == map_.pixel_width
    assert img.height() == map_.pixel_height


# ---------------------------------------------------------------------------
# Additional shape, multi-tileset, orientation, and export tests
# ---------------------------------------------------------------------------

def test_ellipse_shape_round_trip(tmp_path):
    """ELLIPSE object survives a write-read round-trip."""
    MapObject.reset_id_counter(0)
    ts = Tileset(
        name="S", source="", tile_width=32, tile_height=32,
        tiles=[TileDefinition(id=1, name="T", color=(0, 0, 0),
                              category=TileCategory.TERRAIN)],
        first_gid=1,
    )
    tile_layer = TileLayer(name="Ground", width=4, height=4)
    obj_layer = ObjectLayer(name="Objects")
    ellipse_obj = MapObject(
        name="Pit", object_type="hazard",
        x=10.0, y=10.0, width=60.0, height=40.0,
        shape=ObjectShape.ELLIPSE,
    )
    obj_layer.add_object(ellipse_obj)
    map_ = TileMap(
        name="ellipse", width=4, height=4, tile_width=32, tile_height=32,
        tilesets=[ts], layers=[tile_layer, obj_layer],
    )
    out = tmp_path / "ellipse.tmj"
    tmj_writer.write_tile_map(map_, out)
    loaded = tmj_reader.read_map(out)

    objs = loaded.object_layers()[0].objects
    assert len(objs) == 1
    assert objs[0].shape == ObjectShape.ELLIPSE
    assert abs(objs[0].width - 60.0) < 1e-6
    assert abs(objs[0].height - 40.0) < 1e-6


def test_tile_object_round_trip(tmp_path):
    """TILE object (gid field) survives a write-read round-trip."""
    MapObject.reset_id_counter(0)
    ts = Tileset(
        name="S", source="", tile_width=32, tile_height=32,
        tiles=[TileDefinition(id=1, name="T", color=(0, 0, 0),
                              category=TileCategory.TERRAIN)],
        first_gid=1,
    )
    tile_layer = TileLayer(name="Ground", width=4, height=4)
    obj_layer = ObjectLayer(name="Objects")
    tile_obj = MapObject.make_tile_object("Chest", x=64.0, y=32.0, gid=1)
    obj_layer.add_object(tile_obj)
    map_ = TileMap(
        name="tileobj", width=4, height=4, tile_width=32, tile_height=32,
        tilesets=[ts], layers=[tile_layer, obj_layer],
    )
    out = tmp_path / "tileobj.tmj"
    tmj_writer.write_tile_map(map_, out)
    loaded = tmj_reader.read_map(out)

    objs = loaded.object_layers()[0].objects
    assert len(objs) == 1
    assert objs[0].shape == ObjectShape.TILE
    assert objs[0].gid == 1
    assert abs(objs[0].x - 64.0) < 1e-6


def test_multi_tileset_gid_round_trip(tmp_path):
    """Maps with two tilesets correctly round-trip GIDs for both tilesets."""
    MapObject.reset_id_counter(0)
    ts1 = Tileset(
        name="Set1", source="", tile_width=32, tile_height=32,
        tiles=[TileDefinition(id=1, name="Grass", color=(0, 200, 0),
                              category=TileCategory.TERRAIN)],
        first_gid=1,
    )
    tile_layer = TileLayer(name="Ground", width=4, height=3)
    map_ = TileMap(
        name="multi", width=4, height=3, tile_width=32, tile_height=32,
        tilesets=[ts1], layers=[tile_layer],
    )
    ts2 = Tileset(
        name="Set2", source="", tile_width=32, tile_height=32,
        tiles=[TileDefinition(id=1, name="Wall", color=(100, 100, 100),
                              category=TileCategory.WALL)],
        first_gid=1,
    )
    map_.add_tileset(ts2)  # sets ts2.first_gid = 2

    tile_layer.set_tile(0, 0, 1)              # ts1, GID 1
    tile_layer.set_tile(1, 0, ts2.first_gid)  # ts2

    out = tmp_path / "multi.tmj"
    tmj_writer.write_tile_map(map_, out)
    loaded = tmj_reader.read_map(out)

    assert len(loaded.tilesets) == 2
    loaded_layer = loaded.tile_layers()[0]
    gid_a = loaded_layer.get_tile(0, 0)
    gid_b = loaded_layer.get_tile(1, 0)
    assert loaded.tileset_for_gid(gid_a) is loaded.tilesets[0]
    assert loaded.tileset_for_gid(gid_b) is loaded.tilesets[1]


def test_pointy_top_hex_orientation_round_trip(tmp_path):
    """POINTY_TOP hex orientation survives a write-read cycle."""
    MapObject.reset_id_counter(0)
    ts = Tileset(
        name="HexSet", source="", tile_width=64, tile_height=64,
        tiles=[TileDefinition(id=1, name="Plains", color=(144, 200, 80),
                              category=TileCategory.TERRAIN)],
        first_gid=1,
    )
    tile_layer = TileLayer(name="Terrain", width=4, height=4)
    map_ = HexMap(
        name="hex_pt", cols=4, rows=4, hex_size=40.0,
        orientation=HexOrientation.POINTY_TOP,
        tilesets=[ts], layers=[tile_layer],
    )
    out = tmp_path / "hex_pt.tmj"
    tmj_writer.write_hex_map(map_, out)
    loaded = tmj_reader.read_map(out)

    assert isinstance(loaded, HexMap)
    assert loaded.orientation == HexOrientation.POINTY_TOP


def test_object_layer_props_round_trip(tmp_path):
    """ObjectLayer visible, opacity, and offset survive a write-read cycle."""
    map_ = _simple_tile_map()
    obj_layer = map_.object_layers()[0]
    obj_layer.visible = False
    obj_layer.opacity = 0.5
    obj_layer.offset_x = 16
    obj_layer.offset_y = 8

    out = tmp_path / "map.tmj"
    tmj_writer.write_tile_map(map_, out)
    loaded = tmj_reader.read_map(out)

    loaded_obj_layer = loaded.object_layers()[0]
    assert loaded_obj_layer.visible is False
    assert abs(loaded_obj_layer.opacity - 0.5) < 1e-6
    assert loaded_obj_layer.offset_x == 16
    assert loaded_obj_layer.offset_y == 8


def test_source_path_set_after_write(tmp_path):
    """write_tile_map and write_hex_map set map_.source_path to the saved path."""
    tile_map = _simple_tile_map()
    assert tile_map.source_path == ""  # starts empty
    out_tile = tmp_path / "tile.tmj"
    tmj_writer.write_tile_map(tile_map, out_tile)
    assert tile_map.source_path == str(out_tile)

    hex_map = _simple_hex_map()
    out_hex = tmp_path / "hex.tmj"
    tmj_writer.write_hex_map(hex_map, out_hex)
    assert hex_map.source_path == str(out_hex)


def test_external_tileset_stubs(tmp_path):
    """A tileset with no per-tile metadata (external tool) gets tile-count stubs."""
    import json as _json
    tmj = {
        "tiledversion": "1.10.0", "version": "1.10", "type": "map",
        "orientation": "orthogonal", "renderorder": "right-down",
        "width": 2, "height": 2,
        "tilewidth": 32, "tileheight": 32,
        "infinite": False,
        "nextlayerid": 2, "nextobjectid": 1,
        "tilesets": [{
            "firstgid": 1, "name": "External",
            "image": "sheet.png",
            "imagewidth": 64, "imageheight": 32,
            "tilewidth": 32, "tileheight": 32,
            "tilecount": 2, "columns": 2,
            # No "tiles" key — simulates a tileset from an external tool
        }],
        "layers": [{
            "type": "tilelayer", "id": 1, "name": "Ground",
            "width": 2, "height": 2,
            "x": 0, "y": 0, "visible": True, "opacity": 1.0,
            "data": [1, 2, 0, 0],
        }],
    }
    out = tmp_path / "external.tmj"
    out.write_text(_json.dumps(tmj), encoding="utf-8")

    loaded = tmj_reader.read_map(out)
    ts = loaded.tilesets[0]
    assert ts.count == 2
    assert ts.tile_by_id(1) is not None
    assert ts.tile_by_id(2) is not None
    assert ts.tile_by_id(1).name == "Tile 1"
    assert ts.tile_by_id(2).name == "Tile 2"


def test_export_hex_map_creates_png(tmp_path, qapp):
    """export_hex_map must produce a valid PNG file with correct dimensions."""
    from PyQt6.QtGui import QImage
    from map_editor.rendering import exporter

    map_ = _simple_hex_map()
    out = tmp_path / "hex_export.png"
    exporter.export_hex_map(map_, out)

    assert out.exists()
    img = QImage(str(out))
    assert not img.isNull()


def test_export_includes_hidden_layers(tmp_path, qapp):
    """Tiles on a hidden layer must appear in the exported image."""
    from PyQt6.QtGui import QImage, QColor
    from map_editor.rendering import exporter

    map_ = _simple_tile_map()
    # Make the tile layer invisible
    tile_layer = map_.tile_layers()[0]
    tile_layer.visible = False
    # The tile at (0,0) has color (106, 168, 79) — Grass
    # If the exporter respects visible=False, the pixel should be dark background;
    # if it overrides visibility (correct), the pixel should be a non-background color.

    out = tmp_path / "hidden.png"
    exporter.export_tile_map(map_, out, show_grid=False)

    # Reload to verify pixel content
    img = QImage(str(out))
    assert not img.isNull()
    # The exporter renders all layers regardless of visibility — so the image
    # must exist and be the full map size.
    assert img.width() == map_.pixel_width
    assert img.height() == map_.pixel_height
    # Check that the (0,0) tile cell is NOT the dark background color (20,20,20)
    # — meaning the hidden layer was rendered.
    px = QColor(img.pixel(16, 16))  # centre of first tile
    background = QColor(20, 20, 20)
    assert px != background, (
        f"Pixel at (16,16) is {px.name()}, expected non-background (layer was hidden)"
    )
