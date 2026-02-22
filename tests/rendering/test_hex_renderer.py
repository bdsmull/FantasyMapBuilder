"""
Tests for HexRenderer.
"""

import math
import pytest

from PyQt6.QtGui import QColor, QImage

from map_editor.models.hex_map import HexMap, HexOrientation
from map_editor.models.layer import ObjectLayer, TileLayer
from map_editor.models.map_object import MapObject
from map_editor.models.tileset import TileCategory, TileDefinition, Tileset
from map_editor.rendering.hex_renderer import HexRenderer
from map_editor.rendering.tile_renderer import _BACKGROUND


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

TOLERANCE = 15  # slightly wider tolerance for anti-aliased hex edges

def _color_at(image: QImage, x: int, y: int) -> QColor:
    return QColor(image.pixel(x, y))

def _colors_close(a: QColor, b: QColor, tol: int = TOLERANCE) -> bool:
    return (
        abs(a.red()   - b.red())   <= tol
        and abs(a.green() - b.green()) <= tol
        and abs(a.blue()  - b.blue())  <= tol
    )

def _make_hex_map(
    cols: int = 6,
    rows: int = 5,
    hex_size: float = 40.0,
    orientation: HexOrientation = HexOrientation.FLAT_TOP,
) -> HexMap:
    """Return a HexMap with one placeholder TileLayer and one ObjectLayer."""
    plains_color = (144, 200, 80)
    ocean_color  = ( 30,  80, 180)
    tiles = [
        TileDefinition(id=1, name="Plains", color=plains_color, category=TileCategory.TERRAIN),
        TileDefinition(id=2, name="Ocean",  color=ocean_color,  category=TileCategory.TERRAIN),
    ]
    tileset = Tileset(name="HexTest", tiles=tiles)
    for t in tileset.tiles:
        t.sheet_col = (t.id - 1) % max(1, tileset.columns)
        t.sheet_row = (t.id - 1) // max(1, tileset.columns)

    terrain   = TileLayer(name="Terrain",   width=cols, height=rows)
    locations = ObjectLayer(name="Locations")
    return HexMap(
        name="W", cols=cols, rows=rows,
        hex_size=hex_size, orientation=orientation,
        tilesets=[tileset], layers=[terrain, locations],
    )


# ---------------------------------------------------------------------------
# Basic output checks
# ---------------------------------------------------------------------------

class TestRenderOutput:
    def test_returns_qimage(self, qapp):
        m = _make_hex_map()
        img = HexRenderer().render(m)
        assert isinstance(img, QImage)

    def test_image_not_null(self, qapp):
        m = _make_hex_map()
        img = HexRenderer().render(m)
        assert not img.isNull()

    def test_correct_width(self, qapp):
        m = _make_hex_map()
        img = HexRenderer().render(m)
        assert img.width() == math.ceil(m.pixel_width)

    def test_correct_height(self, qapp):
        m = _make_hex_map()
        img = HexRenderer().render(m)
        assert img.height() == math.ceil(m.pixel_height)


# ---------------------------------------------------------------------------
# Background / empty map
# ---------------------------------------------------------------------------

class TestEmptyMap:
    def test_empty_hex_map_is_background(self, qapp):
        m = _make_hex_map()
        img = HexRenderer().render(m, show_grid=False)
        # Centre of (2, 2) — well inside the map — should be background
        cx, cy = m.hex_center(2, 2)
        sample = _color_at(img, int(cx), int(cy))
        assert _colors_close(sample, _BACKGROUND)


# ---------------------------------------------------------------------------
# Hex colour rendering
# ---------------------------------------------------------------------------

class TestHexColor:
    def test_single_hex_center_color(self, qapp):
        m = _make_hex_map()
        terrain = m.tile_layers()[0]
        terrain.set_tile(0, 0, 1)  # Plains
        img = HexRenderer().render(m, show_grid=False)
        cx, cy = m.hex_center(0, 0)
        sample = _color_at(img, int(cx), int(cy))
        expected = QColor(144, 200, 80)
        assert _colors_close(sample, expected), f"{sample.name()} ≠ {expected.name()}"

    def test_two_hexes_different_colors(self, qapp):
        m = _make_hex_map()
        terrain = m.tile_layers()[0]
        terrain.set_tile(0, 0, 1)  # Plains
        terrain.set_tile(2, 0, 2)  # Ocean
        img = HexRenderer().render(m, show_grid=False)
        cx0, cy0 = m.hex_center(0, 0)
        cx2, cy2 = m.hex_center(2, 0)
        plains = _color_at(img, int(cx0), int(cy0))
        ocean  = _color_at(img, int(cx2), int(cy2))
        assert _colors_close(plains, QColor(144, 200,  80))
        assert _colors_close(ocean,  QColor( 30,  80, 180))

    def test_empty_hex_stays_background(self, qapp):
        m = _make_hex_map()
        terrain = m.tile_layers()[0]
        terrain.set_tile(0, 0, 1)
        img = HexRenderer().render(m, show_grid=False)
        cx, cy = m.hex_center(2, 2)  # not filled
        sample = _color_at(img, int(cx), int(cy))
        assert _colors_close(sample, _BACKGROUND)


# ---------------------------------------------------------------------------
# Layer visibility
# ---------------------------------------------------------------------------

class TestLayerVisibility:
    def test_hidden_tile_layer_not_rendered(self, qapp):
        m = _make_hex_map()
        terrain = m.tile_layers()[0]
        terrain.set_tile(0, 0, 1)
        terrain.visible = False
        img = HexRenderer().render(m, show_grid=False)
        cx, cy = m.hex_center(0, 0)
        sample = _color_at(img, int(cx), int(cy))
        assert _colors_close(sample, _BACKGROUND)

    def test_custom_layer_subset(self, qapp):
        m = _make_hex_map()
        terrain = m.tile_layers()[0]
        terrain.set_tile(0, 0, 1)
        # Render only the ObjectLayer
        img = HexRenderer().render(m, layers=[m.object_layers()[0]], show_grid=False)
        cx, cy = m.hex_center(0, 0)
        sample = _color_at(img, int(cx), int(cy))
        assert _colors_close(sample, _BACKGROUND)


# ---------------------------------------------------------------------------
# Grid lines
# ---------------------------------------------------------------------------

class TestGridLines:
    def test_grid_darkens_edge_between_hexes(self, qapp):
        m = _make_hex_map()
        terrain = m.tile_layers()[0]
        terrain.fill(1)  # Plains everywhere

        img_grid    = HexRenderer().render(m, show_grid=True)
        img_no_grid = HexRenderer().render(m, show_grid=False)

        # A point on the shared edge between hex (0,0) and hex (1,0):
        # the midpoint of the two centres
        cx0, cy0 = m.hex_center(0, 0)
        cx1, cy1 = m.hex_center(1, 0)
        ex = int((cx0 + cx1) / 2)
        ey = int((cy0 + cy1) / 2)

        px_grid    = _color_at(img_grid,    ex, ey)
        px_no_grid = _color_at(img_no_grid, ex, ey)

        brightness_grid    = px_grid.red()    + px_grid.green()    + px_grid.blue()
        brightness_no_grid = px_no_grid.red() + px_no_grid.green() + px_no_grid.blue()
        assert brightness_grid <= brightness_no_grid


# ---------------------------------------------------------------------------
# Both orientations
# ---------------------------------------------------------------------------

class TestOrientations:
    def test_flat_top_renders_without_error(self, qapp):
        m = _make_hex_map(orientation=HexOrientation.FLAT_TOP)
        img = HexRenderer().render(m)
        assert not img.isNull()

    def test_pointy_top_renders_without_error(self, qapp):
        m = _make_hex_map(orientation=HexOrientation.POINTY_TOP)
        img = HexRenderer().render(m)
        assert not img.isNull()

    def test_pointy_top_correct_size(self, qapp):
        m = _make_hex_map(orientation=HexOrientation.POINTY_TOP)
        img = HexRenderer().render(m)
        assert img.width()  == math.ceil(m.pixel_width)
        assert img.height() == math.ceil(m.pixel_height)


# ---------------------------------------------------------------------------
# Object layer markers
# ---------------------------------------------------------------------------

class TestObjectMarkers:
    def test_point_object_leaves_non_background_pixel(self, qapp):
        m = _make_hex_map()
        obj_layer = m.object_layers()[0]
        cx, cy = m.hex_center(1, 1)
        obj = MapObject.make_point("City", x=cx, y=cy, object_type="City")
        obj_layer.add_object(obj)
        img = HexRenderer().render(m, show_grid=False)
        sample = _color_at(img, int(cx), int(cy))
        assert not _colors_close(sample, _BACKGROUND)


# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------

class TestCache:
    def test_invalidate_cache_clears(self, qapp):
        renderer = HexRenderer()
        renderer._sheet_cache["fake"] = None
        renderer.invalidate_cache()
        assert renderer._sheet_cache == {}
