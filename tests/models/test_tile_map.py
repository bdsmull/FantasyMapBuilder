import pytest

from map_editor.models.layer import ObjectLayer, TileLayer
from map_editor.models.tile_map import TileMap
from map_editor.models.tileset import TileCategory, TileDefinition, Tileset


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_tileset(name: str, count: int, first_gid: int = 1) -> Tileset:
    tiles = [
        TileDefinition(id=i, name=f"{name}_{i}", color=(i, i, i))
        for i in range(1, count + 1)
    ]
    return Tileset(name=name, tiles=tiles, first_gid=first_gid)


# ---------------------------------------------------------------------------
# Creation
# ---------------------------------------------------------------------------

class TestTileMapCreation:
    def test_create_new_has_one_tileset(self, tmp_path):
        m = TileMap.create_new("T", width=10, height=8, placeholder_dir=tmp_path)
        assert len(m.tilesets) == 1

    def test_create_new_has_two_layers(self, tmp_path):
        m = TileMap.create_new("T", width=10, height=8, placeholder_dir=tmp_path)
        assert len(m.layers) == 2

    def test_create_new_layer_types(self, tmp_path):
        m = TileMap.create_new("T", width=10, height=8, placeholder_dir=tmp_path)
        assert isinstance(m.layers[0], TileLayer)
        assert isinstance(m.layers[1], ObjectLayer)

    def test_create_new_layer_dimensions(self, tmp_path):
        m = TileMap.create_new("T", width=10, height=8, placeholder_dir=tmp_path)
        ground = m.tile_layers()[0]
        assert ground.width == 10
        assert ground.height == 8


# ---------------------------------------------------------------------------
# Display geometry
# ---------------------------------------------------------------------------

class TestGeometry:
    def test_pixel_width(self, small_tile_map):
        assert small_tile_map.pixel_width == 5 * 32

    def test_pixel_height(self, small_tile_map):
        assert small_tile_map.pixel_height == 4 * 32

    def test_in_bounds_corners(self, small_tile_map):
        assert small_tile_map.in_bounds(0, 0) is True
        assert small_tile_map.in_bounds(4, 3) is True

    def test_in_bounds_just_outside(self, small_tile_map):
        assert small_tile_map.in_bounds(-1, 0) is False
        assert small_tile_map.in_bounds(0, -1) is False
        assert small_tile_map.in_bounds(5, 0) is False
        assert small_tile_map.in_bounds(0, 4) is False

    def test_pixel_to_tile(self, small_tile_map):
        assert small_tile_map.pixel_to_tile(0.0, 0.0) == (0, 0)
        assert small_tile_map.pixel_to_tile(32.0, 64.0) == (1, 2)
        assert small_tile_map.pixel_to_tile(31.9, 31.9) == (0, 0)

    def test_tile_to_pixel(self, small_tile_map):
        assert small_tile_map.tile_to_pixel(0, 0) == (0, 0)
        assert small_tile_map.tile_to_pixel(2, 3) == (64, 96)


# ---------------------------------------------------------------------------
# Tileset management
# ---------------------------------------------------------------------------

class TestTilesetManagement:
    def test_primary_tileset(self, small_tile_map):
        assert small_tile_map.primary_tileset() is small_tile_map.tilesets[0]

    def test_primary_tileset_empty(self):
        m = TileMap(name="T", width=1, height=1, tilesets=[], layers=[])
        assert m.primary_tileset() is None

    def test_add_second_tileset_first_gid(self, small_tile_map):
        # small_tileset has 3 tiles, first_gid=1 → second should get first_gid=4
        ts2 = _make_tileset("Second", count=5)
        small_tile_map.add_tileset(ts2)
        assert ts2.first_gid == 4

    def test_add_third_tileset_first_gid(self, small_tile_map):
        ts2 = _make_tileset("Second", count=5)
        ts3 = _make_tileset("Third", count=3)
        small_tile_map.add_tileset(ts2)
        small_tile_map.add_tileset(ts3)
        # ts2: first_gid=4, count=5 → ts3 first_gid=9
        assert ts3.first_gid == 9

    def test_tileset_for_gid_first(self, small_tile_map):
        ts = small_tile_map.tileset_for_gid(1)
        assert ts is small_tile_map.tilesets[0]

    def test_tileset_for_gid_second(self, small_tile_map):
        ts2 = _make_tileset("Second", count=5)
        small_tile_map.add_tileset(ts2)
        assert small_tile_map.tileset_for_gid(4) is ts2
        assert small_tile_map.tileset_for_gid(8) is ts2

    def test_tileset_for_gid_boundary(self, small_tile_map):
        ts2 = _make_tileset("Second", count=5)
        small_tile_map.add_tileset(ts2)
        # GID 3 still belongs to the first tileset (count=3, first_gid=1)
        assert small_tile_map.tileset_for_gid(3) is small_tile_map.tilesets[0]

    def test_local_id(self, small_tile_map):
        ts2 = _make_tileset("Second", count=5)
        small_tile_map.add_tileset(ts2)
        # ts2 first_gid=4; gid=6 → local_id = 6 - 4 + 1 = 3
        assert small_tile_map.local_id(6) == 3

    def test_local_id_first_tileset(self, small_tile_map):
        assert small_tile_map.local_id(1) == 1
        assert small_tile_map.local_id(3) == 3


# ---------------------------------------------------------------------------
# Layer management
# ---------------------------------------------------------------------------

class TestLayerManagement:
    def test_tile_layers_filter(self, small_tile_map):
        tile_layers = small_tile_map.tile_layers()
        assert all(isinstance(l, TileLayer) for l in tile_layers)
        assert len(tile_layers) == 1

    def test_object_layers_filter(self, small_tile_map):
        obj_layers = small_tile_map.object_layers()
        assert all(isinstance(l, ObjectLayer) for l in obj_layers)
        assert len(obj_layers) == 1

    def test_layer_by_name_found(self, small_tile_map):
        layer = small_tile_map.layer_by_name("Ground")
        assert layer is not None
        assert layer.name == "Ground"

    def test_layer_by_name_missing(self, small_tile_map):
        assert small_tile_map.layer_by_name("Nonexistent") is None

    def test_add_tile_layer_appended(self, small_tile_map):
        new = small_tile_map.add_tile_layer("Overlay")
        assert small_tile_map.layers[-1] is new
        assert new.width == small_tile_map.width
        assert new.height == small_tile_map.height

    def test_add_object_layer_appended(self, small_tile_map):
        new = small_tile_map.add_object_layer("Events")
        assert small_tile_map.layers[-1] is new

    def test_remove_layer_present(self, small_tile_map):
        ground = small_tile_map.tile_layers()[0]
        result = small_tile_map.remove_layer(ground)
        assert result is True
        assert ground not in small_tile_map.layers

    def test_remove_layer_not_present(self, small_tile_map):
        phantom = TileLayer(name="Ghost", width=5, height=4)
        assert small_tile_map.remove_layer(phantom) is False

    def test_move_layer_up(self, small_tile_map):
        ground = small_tile_map.layers[0]
        objects = small_tile_map.layers[1]
        small_tile_map.move_layer_up(ground)
        assert small_tile_map.layers[0] is objects
        assert small_tile_map.layers[1] is ground

    def test_move_layer_down(self, small_tile_map):
        ground = small_tile_map.layers[0]
        objects = small_tile_map.layers[1]
        small_tile_map.move_layer_down(objects)
        assert small_tile_map.layers[0] is objects
        assert small_tile_map.layers[1] is ground

    def test_move_layer_up_at_top_returns_false(self, small_tile_map):
        top = small_tile_map.layers[-1]
        assert small_tile_map.move_layer_up(top) is False

    def test_move_layer_down_at_bottom_returns_false(self, small_tile_map):
        bottom = small_tile_map.layers[0]
        assert small_tile_map.move_layer_down(bottom) is False


# ---------------------------------------------------------------------------
# GID 0 edge cases
# ---------------------------------------------------------------------------

class TestGidEdgeCases:
    def test_tileset_for_gid_zero_returns_none(self, small_tile_map):
        """GID 0 is the empty-cell sentinel; no tileset should claim it."""
        assert small_tile_map.tileset_for_gid(0) is None

    def test_local_id_gid_zero_returns_zero(self, small_tile_map):
        """local_id for the empty sentinel GID falls back to returning the raw GID."""
        assert small_tile_map.local_id(0) == 0
