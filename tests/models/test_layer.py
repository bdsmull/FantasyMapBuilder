import pytest

from map_editor.models.layer import LayerType, ObjectLayer, TileLayer
from map_editor.models.map_object import MapObject, ObjectShape


# ---------------------------------------------------------------------------
# TileLayer
# ---------------------------------------------------------------------------

class TestTileLayerInit:
    def test_all_zeros_by_default(self):
        layer = TileLayer(name="Ground", width=4, height=3)
        for row in layer.data:
            assert all(v == 0 for v in row)

    def test_dimensions(self):
        layer = TileLayer(name="L", width=7, height=5)
        assert len(layer.data) == 5
        assert all(len(row) == 7 for row in layer.data)

    def test_layer_type(self):
        layer = TileLayer(name="L", width=1, height=1)
        assert layer.layer_type == LayerType.TILE

    def test_defaults(self):
        layer = TileLayer(name="L", width=2, height=2)
        assert layer.visible is True
        assert layer.opacity == 1.0
        assert layer.offset_x == 0
        assert layer.offset_y == 0


class TestTileLayerAccess:
    def test_get_tile_in_bounds(self):
        layer = TileLayer(name="L", width=3, height=3)
        layer.data[1][2] = 5
        assert layer.get_tile(2, 1) == 5

    def test_get_tile_out_of_bounds_returns_zero(self):
        layer = TileLayer(name="L", width=3, height=3)
        assert layer.get_tile(-1, 0) == 0
        assert layer.get_tile(0, -1) == 0
        assert layer.get_tile(3, 0) == 0
        assert layer.get_tile(0, 3) == 0

    def test_set_tile_in_bounds_returns_true(self):
        layer = TileLayer(name="L", width=3, height=3)
        result = layer.set_tile(1, 2, 7)
        assert result is True
        assert layer.data[2][1] == 7

    def test_set_tile_out_of_bounds_returns_false(self):
        layer = TileLayer(name="L", width=3, height=3)
        assert layer.set_tile(-1, 0, 1) is False
        assert layer.set_tile(3, 0, 1) is False
        assert layer.set_tile(0, 3, 1) is False

    def test_set_tile_out_of_bounds_no_mutation(self):
        layer = TileLayer(name="L", width=2, height=2)
        layer.set_tile(99, 99, 42)
        for row in layer.data:
            assert all(v == 0 for v in row)


class TestTileLayerBulkOps:
    def test_clear(self):
        layer = TileLayer(name="L", width=3, height=3)
        layer.fill(5)
        layer.clear()
        for row in layer.data:
            assert all(v == 0 for v in row)

    def test_fill(self):
        layer = TileLayer(name="L", width=3, height=3)
        layer.fill(3)
        for row in layer.data:
            assert all(v == 3 for v in row)


class TestFloodFill:
    def _make_layer(self, grid: list[list[int]]) -> TileLayer:
        h = len(grid)
        w = len(grid[0])
        layer = TileLayer(name="L", width=w, height=h)
        layer.data = [row[:] for row in grid]
        return layer

    def test_simple_fill_entire_layer(self):
        layer = TileLayer(name="L", width=3, height=3)
        changed = layer.flood_fill(0, 0, 1)
        assert len(changed) == 9
        assert layer.get_tile(2, 2) == 1

    def test_same_id_is_noop(self):
        layer = TileLayer(name="L", width=3, height=3)
        changed = layer.flood_fill(0, 0, 0)
        assert changed == []

    def test_fill_bounded_region(self):
        #  0 0 1
        #  0 0 1
        #  1 1 1
        grid = [[0, 0, 1], [0, 0, 1], [1, 1, 1]]
        layer = self._make_layer(grid)
        changed = layer.flood_fill(0, 0, 2)
        # Only the 4 zero cells in the top-left should change
        assert len(changed) == 4
        assert layer.get_tile(0, 0) == 2
        assert layer.get_tile(1, 0) == 2
        assert layer.get_tile(0, 1) == 2
        assert layer.get_tile(1, 1) == 2
        # Border tiles unchanged
        assert layer.get_tile(2, 0) == 1
        assert layer.get_tile(0, 2) == 1

    def test_fill_does_not_cross_diagonal(self):
        # Flood fill is 4-directional, not 8-directional
        #  0 1
        #  1 0
        grid = [[0, 1], [1, 0]]
        layer = self._make_layer(grid)
        changed = layer.flood_fill(0, 0, 2)
        assert len(changed) == 1
        assert layer.get_tile(1, 1) == 0  # not reached

    def test_fill_returns_changed_positions(self):
        layer = TileLayer(name="L", width=2, height=1)
        changed = layer.flood_fill(0, 0, 5)
        assert set(changed) == {(0, 0), (1, 0)}


class TestFlatSerialisation:
    def test_to_flat_order(self):
        layer = TileLayer(name="L", width=3, height=2)
        layer.data = [[1, 2, 3], [4, 5, 6]]
        assert layer.to_flat() == [1, 2, 3, 4, 5, 6]

    def test_round_trip(self):
        layer = TileLayer(name="L", width=4, height=3)
        for r in range(3):
            for c in range(4):
                layer.data[r][c] = r * 4 + c + 1
        flat = layer.to_flat()
        restored = TileLayer.from_flat("L", width=4, height=3, flat_data=flat)
        assert restored.data == layer.data

    def test_from_flat_short_data_pads_zeros(self):
        restored = TileLayer.from_flat("L", width=3, height=2, flat_data=[1, 2])
        assert restored.get_tile(2, 0) == 0
        assert restored.get_tile(0, 1) == 0


class TestCopy:
    def test_copy_has_same_data(self):
        layer = TileLayer(name="L", width=3, height=3)
        layer.fill(7)
        copy = layer.copy()
        assert copy.to_flat() == layer.to_flat()

    def test_copy_is_deep(self):
        layer = TileLayer(name="L", width=3, height=3)
        copy = layer.copy()
        copy.set_tile(0, 0, 99)
        assert layer.get_tile(0, 0) == 0  # original unaffected

    def test_copy_preserves_metadata(self):
        layer = TileLayer(name="MyLayer", width=2, height=2, visible=False, opacity=0.5)
        copy = layer.copy()
        assert copy.name == "MyLayer"
        assert copy.visible is False
        assert copy.opacity == 0.5


# ---------------------------------------------------------------------------
# ObjectLayer
# ---------------------------------------------------------------------------

class TestObjectLayer:
    def test_layer_type(self):
        layer = ObjectLayer(name="Objs")
        assert layer.layer_type == LayerType.OBJECT

    def test_add_and_count(self):
        layer = ObjectLayer(name="Objs")
        obj = MapObject.make_point("A", 0, 0)
        layer.add_object(obj)
        assert len(layer.objects) == 1

    def test_remove_object_found(self):
        layer = ObjectLayer(name="Objs")
        obj = MapObject.make_point("A", 0, 0)
        layer.add_object(obj)
        result = layer.remove_object(obj)
        assert result is True
        assert len(layer.objects) == 0

    def test_remove_object_not_found(self):
        layer = ObjectLayer(name="Objs")
        obj = MapObject.make_point("A", 0, 0)
        result = layer.remove_object(obj)
        assert result is False

    def test_remove_by_id_found(self):
        layer = ObjectLayer(name="Objs")
        obj = MapObject.make_point("A", 0, 0)
        layer.add_object(obj)
        removed = layer.remove_by_id(obj.object_id)
        assert removed is obj
        assert len(layer.objects) == 0

    def test_remove_by_id_missing(self):
        layer = ObjectLayer(name="Objs")
        assert layer.remove_by_id(999) is None

    def test_object_by_id_found(self):
        layer = ObjectLayer(name="Objs")
        obj = MapObject.make_point("A", 0, 0)
        layer.add_object(obj)
        assert layer.object_by_id(obj.object_id) is obj

    def test_object_by_id_missing(self):
        layer = ObjectLayer(name="Objs")
        assert layer.object_by_id(999) is None


class TestObjectsAt:
    TILE_W = 32
    TILE_H = 32

    def _layer_with(self, *objects) -> ObjectLayer:
        layer = ObjectLayer(name="L")
        for obj in objects:
            layer.add_object(obj)
        return layer

    def test_point_hit_at_exact_position(self):
        obj = MapObject.make_point("P", x=100.0, y=100.0)
        layer = self._layer_with(obj)
        hits = layer.objects_at(100.0, 100.0, self.TILE_W, self.TILE_H)
        assert obj in hits

    def test_point_hit_within_half_tile(self):
        obj = MapObject.make_point("P", x=100.0, y=100.0)
        layer = self._layer_with(obj)
        # Half-tile radius is 16px; test at 15px offset
        hits = layer.objects_at(115.0, 100.0, self.TILE_W, self.TILE_H)
        assert obj in hits

    def test_point_miss_outside_half_tile(self):
        obj = MapObject.make_point("P", x=100.0, y=100.0)
        layer = self._layer_with(obj)
        hits = layer.objects_at(200.0, 200.0, self.TILE_W, self.TILE_H)
        assert obj not in hits

    def test_rect_hit_inside(self):
        obj = MapObject.make_rect("R", x=50.0, y=50.0, width=64.0, height=32.0)
        layer = self._layer_with(obj)
        hits = layer.objects_at(80.0, 60.0, self.TILE_W, self.TILE_H)
        assert obj in hits

    def test_rect_miss_outside(self):
        obj = MapObject.make_rect("R", x=50.0, y=50.0, width=64.0, height=32.0)
        layer = self._layer_with(obj)
        hits = layer.objects_at(10.0, 10.0, self.TILE_W, self.TILE_H)
        assert obj not in hits

    def test_multiple_objects_at_same_position(self):
        a = MapObject.make_point("A", x=0.0, y=0.0)
        b = MapObject.make_point("B", x=0.0, y=0.0)
        layer = self._layer_with(a, b)
        hits = layer.objects_at(0.0, 0.0, self.TILE_W, self.TILE_H)
        assert a in hits
        assert b in hits
