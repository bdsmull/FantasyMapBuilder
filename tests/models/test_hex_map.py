import math
import pytest

from map_editor.models.hex_map import HexMap, HexOrientation
from map_editor.models.layer import ObjectLayer, TileLayer


# ---------------------------------------------------------------------------
# Creation
# ---------------------------------------------------------------------------

class TestHexMapCreation:
    def test_create_new_has_one_tileset(self, small_hex_map):
        assert len(small_hex_map.tilesets) == 1

    def test_create_new_has_two_layers(self, small_hex_map):
        assert len(small_hex_map.layers) == 2

    def test_create_new_layer_types(self, small_hex_map):
        assert isinstance(small_hex_map.layers[0], TileLayer)
        assert isinstance(small_hex_map.layers[1], ObjectLayer)

    def test_create_new_layer_dimensions(self, small_hex_map):
        terrain = small_hex_map.tile_layers()[0]
        assert terrain.width == small_hex_map.cols
        assert terrain.height == small_hex_map.rows


# ---------------------------------------------------------------------------
# Bounds
# ---------------------------------------------------------------------------

class TestBounds:
    def test_in_bounds_corners(self, small_hex_map):
        assert small_hex_map.in_bounds(0, 0) is True
        assert small_hex_map.in_bounds(5, 4) is True  # cols=6, rows=5

    def test_in_bounds_negative(self, small_hex_map):
        assert small_hex_map.in_bounds(-1, 0) is False
        assert small_hex_map.in_bounds(0, -1) is False

    def test_in_bounds_just_outside(self, small_hex_map):
        assert small_hex_map.in_bounds(6, 0) is False
        assert small_hex_map.in_bounds(0, 5) is False


# ---------------------------------------------------------------------------
# Pixel size
# ---------------------------------------------------------------------------

class TestHexPixelSize:
    def test_flat_top_width(self, small_hex_map):
        s = small_hex_map.hex_size  # 40
        w, h = small_hex_map.hex_pixel_size()
        assert w == pytest.approx(2 * s)

    def test_flat_top_height(self, small_hex_map):
        s = small_hex_map.hex_size
        w, h = small_hex_map.hex_pixel_size()
        assert h == pytest.approx(math.sqrt(3) * s)

    def test_pointy_top_width(self):
        hm = HexMap(name="PT", cols=4, rows=4, hex_size=30.0,
                    orientation=HexOrientation.POINTY_TOP)
        s = 30.0
        w, h = hm.hex_pixel_size()
        assert w == pytest.approx(math.sqrt(3) * s)

    def test_pointy_top_height(self):
        hm = HexMap(name="PT", cols=4, rows=4, hex_size=30.0,
                    orientation=HexOrientation.POINTY_TOP)
        s = 30.0
        w, h = hm.hex_pixel_size()
        assert h == pytest.approx(2 * s)


# ---------------------------------------------------------------------------
# Hex centre
# ---------------------------------------------------------------------------

class TestHexCenter:
    def test_origin_flat_top(self, small_hex_map):
        s = small_hex_map.hex_size  # 40
        h = math.sqrt(3) * s
        cx, cy = small_hex_map.hex_center(0, 0)
        # col=0 (even) → no vertical stagger
        assert cx == pytest.approx(s)       # = 40
        assert cy == pytest.approx(h / 2)   # = ~34.6

    def test_adjacent_col_flat_top(self, small_hex_map):
        s = small_hex_map.hex_size
        w = 2 * s
        cx1, _ = small_hex_map.hex_center(0, 0)
        cx2, _ = small_hex_map.hex_center(1, 0)
        # Each column is 3/4 of a hex width apart
        assert cx2 - cx1 == pytest.approx(w * 3 / 4)

    def test_odd_col_stagger_flat_top(self, small_hex_map):
        s = small_hex_map.hex_size
        h = math.sqrt(3) * s
        _, cy_even = small_hex_map.hex_center(0, 0)
        _, cy_odd = small_hex_map.hex_center(1, 0)
        # Odd column is staggered down by h/2
        assert cy_odd - cy_even == pytest.approx(h / 2)


# ---------------------------------------------------------------------------
# Hex corners
# ---------------------------------------------------------------------------

class TestHexCorners:
    def test_returns_six_corners(self, small_hex_map):
        corners = small_hex_map.hex_corners(0, 0)
        assert len(corners) == 6

    def test_all_corners_equidistant_from_center(self, small_hex_map):
        cx, cy = small_hex_map.hex_center(2, 2)
        corners = small_hex_map.hex_corners(2, 2)
        s = small_hex_map.hex_size
        for px, py in corners:
            dist = math.hypot(px - cx, py - cy)
            assert dist == pytest.approx(s, rel=1e-6)


# ---------------------------------------------------------------------------
# Pixel → hex
# ---------------------------------------------------------------------------

class TestPixelToHex:
    def test_known_center_flat_top(self, small_hex_map):
        # The center of hex (2, 2) should round back to (2, 2)
        cx, cy = small_hex_map.hex_center(2, 2)
        result = small_hex_map.pixel_to_hex(cx, cy)
        assert result == (2, 2)

    def test_all_centers_round_trip(self, small_hex_map):
        for col in range(small_hex_map.cols):
            for row in range(small_hex_map.rows):
                cx, cy = small_hex_map.hex_center(col, row)
                result = small_hex_map.pixel_to_hex(cx, cy)
                assert result == (col, row), f"Failed at ({col}, {row})"

    def test_out_of_bounds_returns_none(self, small_hex_map):
        result = small_hex_map.pixel_to_hex(-9999.0, -9999.0)
        assert result is None


# ---------------------------------------------------------------------------
# Neighbours
# ---------------------------------------------------------------------------

class TestAxialNeighbors:
    def test_interior_hex_has_six_neighbors(self, small_hex_map):
        # (2, 2) is well inside the 6×5 map
        neighbors = small_hex_map.axial_neighbors(2, 2)
        assert len(neighbors) == 6

    def test_corner_hex_has_fewer_neighbors(self, small_hex_map):
        neighbors = small_hex_map.axial_neighbors(0, 0)
        assert len(neighbors) < 6

    def test_neighbors_are_in_bounds(self, small_hex_map):
        for col in range(small_hex_map.cols):
            for row in range(small_hex_map.rows):
                for nc, nr in small_hex_map.axial_neighbors(col, row):
                    assert small_hex_map.in_bounds(nc, nr)

    def test_neighbor_relationship_is_symmetric(self, small_hex_map):
        # If B is a neighbor of A, A must be a neighbor of B
        col, row = 2, 2
        for nc, nr in small_hex_map.axial_neighbors(col, row):
            back = small_hex_map.axial_neighbors(nc, nr)
            assert (col, row) in back


# ---------------------------------------------------------------------------
# Distance
# ---------------------------------------------------------------------------

class TestAxialDistance:
    def test_distance_to_self(self, small_hex_map):
        assert small_hex_map.axial_distance(2, 2, 2, 2) == 0

    def test_distance_to_neighbor_is_one(self, small_hex_map):
        neighbors = small_hex_map.axial_neighbors(2, 2)
        for nc, nr in neighbors:
            assert small_hex_map.axial_distance(2, 2, nc, nr) == 1

    def test_distance_is_symmetric(self, small_hex_map):
        d1 = small_hex_map.axial_distance(0, 0, 3, 2)
        d2 = small_hex_map.axial_distance(3, 2, 0, 0)
        assert d1 == d2

    def test_distance_nonnegative(self, small_hex_map):
        for c1 in range(small_hex_map.cols):
            for r1 in range(small_hex_map.rows):
                assert small_hex_map.axial_distance(0, 0, c1, r1) >= 0


# ---------------------------------------------------------------------------
# Tiled compatibility properties
# ---------------------------------------------------------------------------

class TestTiledProperties:
    def test_stagger_axis_flat_top(self, small_hex_map):
        assert small_hex_map.tiled_stagger_axis == "x"

    def test_stagger_index(self, small_hex_map):
        assert small_hex_map.tiled_stagger_index == "odd"

    def test_stagger_axis_pointy_top(self):
        hm = HexMap(name="PT", cols=3, rows=3, hex_size=20.0,
                    orientation=HexOrientation.POINTY_TOP)
        assert hm.tiled_stagger_axis == "y"

    def test_hex_side_length(self, small_hex_map):
        assert small_hex_map.tiled_hex_side_length == int(small_hex_map.hex_size)
