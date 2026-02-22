"""
Tests for TileRenderer.

Pixel-colour assertions use a ±10 tolerance per channel to allow for
QPainter compositing rounding without being brittle.
"""

import pytest

from PyQt6.QtGui import QColor, QImage

from map_editor.models.layer import ObjectLayer, TileLayer
from map_editor.models.map_object import MapObject, ObjectShape
from map_editor.models.tile_map import TileMap
from map_editor.models.tileset import TileCategory, TileDefinition, Tileset
from map_editor.rendering.tile_renderer import TileRenderer, _BACKGROUND


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

TOLERANCE = 10  # per-channel colour tolerance

def _color_at(image: QImage, x: int, y: int) -> QColor:
    return QColor(image.pixel(x, y))

def _colors_close(a: QColor, b: QColor, tol: int = TOLERANCE) -> bool:
    return (
        abs(a.red()   - b.red())   <= tol
        and abs(a.green() - b.green()) <= tol
        and abs(a.blue()  - b.blue())  <= tol
    )

def _make_map(cols: int = 5, rows: int = 4, tw: int = 32, th: int = 32) -> TileMap:
    """Return a TileMap with one placeholder TileLayer and one ObjectLayer."""
    grass_color = (106, 168, 79)
    wall_color  = ( 90,  90, 90)
    tiles = [
        TileDefinition(id=1, name="Grass", color=grass_color, category=TileCategory.TERRAIN),
        TileDefinition(id=2, name="Wall",  color=wall_color,  category=TileCategory.WALL),
    ]
    tileset = Tileset(name="Test", tile_width=tw, tile_height=th, tiles=tiles)
    # Assign sheet positions (make_placeholder does this automatically; do it manually here)
    for t in tileset.tiles:
        t.sheet_col = (t.id - 1) % tileset.columns
        t.sheet_row = (t.id - 1) // tileset.columns

    ground  = TileLayer(name="Ground",  width=cols, height=rows)
    objects = ObjectLayer(name="Objects")
    return TileMap(
        name="T", width=cols, height=rows,
        tile_width=tw, tile_height=th,
        tilesets=[tileset], layers=[ground, objects],
    )


# ---------------------------------------------------------------------------
# Basic output checks
# ---------------------------------------------------------------------------

class TestRenderOutput:
    def test_returns_qimage(self, qapp):
        m = _make_map()
        img = TileRenderer().render(m)
        assert isinstance(img, QImage)

    def test_image_not_null(self, qapp):
        m = _make_map()
        img = TileRenderer().render(m)
        assert not img.isNull()

    def test_correct_width(self, qapp):
        m = _make_map(cols=5, rows=4, tw=32, th=32)
        img = TileRenderer().render(m)
        assert img.width() == 5 * 32

    def test_correct_height(self, qapp):
        m = _make_map(cols=5, rows=4, tw=32, th=32)
        img = TileRenderer().render(m)
        assert img.height() == 4 * 32


# ---------------------------------------------------------------------------
# Background / empty map
# ---------------------------------------------------------------------------

class TestEmptyMap:
    def test_empty_map_is_background_color(self, qapp):
        m = _make_map()
        img = TileRenderer().render(m, show_grid=False)
        # Centre of any tile should be background colour
        sample = _color_at(img, 16, 16)
        assert _colors_close(sample, _BACKGROUND)


# ---------------------------------------------------------------------------
# Tile colour rendering
# ---------------------------------------------------------------------------

class TestTileColor:
    def test_single_tile_color(self, qapp):
        m = _make_map()
        ground = m.tile_layers()[0]
        ground.set_tile(0, 0, 1)  # Grass at (0,0)
        img = TileRenderer().render(m, show_grid=False)
        # Sample the centre of tile (0,0)
        cx, cy = 16, 16
        sample = _color_at(img, cx, cy)
        expected = QColor(106, 168, 79)
        assert _colors_close(sample, expected), f"{sample.name()} ≠ {expected.name()}"

    def test_two_tiles_different_colors(self, qapp):
        m = _make_map()
        ground = m.tile_layers()[0]
        ground.set_tile(0, 0, 1)  # Grass
        ground.set_tile(1, 0, 2)  # Wall
        img = TileRenderer().render(m, show_grid=False)
        grass_pixel = _color_at(img, 16, 16)
        wall_pixel  = _color_at(img, 48, 16)
        assert _colors_close(grass_pixel, QColor(106, 168, 79))
        assert _colors_close(wall_pixel,  QColor( 90,  90, 90))

    def test_empty_tile_stays_background(self, qapp):
        m = _make_map()
        ground = m.tile_layers()[0]
        ground.set_tile(0, 0, 1)   # Tile at (0,0)
        # (1,0) stays empty
        img = TileRenderer().render(m, show_grid=False)
        empty_sample = _color_at(img, 48, 16)
        assert _colors_close(empty_sample, _BACKGROUND)


# ---------------------------------------------------------------------------
# Layer visibility / opacity
# ---------------------------------------------------------------------------

class TestLayerVisibility:
    def test_hidden_tile_layer_not_rendered(self, qapp):
        m = _make_map()
        ground = m.tile_layers()[0]
        ground.set_tile(0, 0, 1)
        ground.visible = False
        img = TileRenderer().render(m, show_grid=False)
        sample = _color_at(img, 16, 16)
        assert _colors_close(sample, _BACKGROUND)

    def test_custom_layer_subset(self, qapp):
        m = _make_map()
        ground = m.tile_layers()[0]
        ground.set_tile(0, 0, 1)
        # Render only the ObjectLayer (no tiles)
        img = TileRenderer().render(m, layers=[m.object_layers()[0]], show_grid=False)
        sample = _color_at(img, 16, 16)
        assert _colors_close(sample, _BACKGROUND)


# ---------------------------------------------------------------------------
# Grid lines
# ---------------------------------------------------------------------------

class TestGridLines:
    def test_grid_present_at_tile_boundary(self, qapp):
        m = _make_map()
        ground = m.tile_layers()[0]
        ground.fill(1)  # Fill all with Grass
        img_grid    = TileRenderer().render(m, show_grid=True)
        img_no_grid = TileRenderer().render(m, show_grid=False)
        # Column boundary x=32 (between col 0 and col 1)
        px_grid    = _color_at(img_grid,    32, 16)
        px_no_grid = _color_at(img_no_grid, 32, 16)
        # With grid the pixel should be darker
        grid_brightness    = px_grid.red()    + px_grid.green()    + px_grid.blue()
        no_grid_brightness = px_no_grid.red() + px_no_grid.green() + px_no_grid.blue()
        assert grid_brightness < no_grid_brightness

    def test_no_grid_tile_boundary_matches_tile(self, qapp):
        m = _make_map()
        ground = m.tile_layers()[0]
        ground.fill(1)  # Grass everywhere
        img = TileRenderer().render(m, show_grid=False)
        # Without grid, the boundary pixel should be the tile colour
        sample = _color_at(img, 32, 16)
        assert _colors_close(sample, QColor(106, 168, 79))


# ---------------------------------------------------------------------------
# Object layer markers
# ---------------------------------------------------------------------------

class TestObjectMarkers:
    def test_point_object_leaves_non_background_pixel(self, qapp):
        m = _make_map()
        obj_layer = m.object_layers()[0]
        # Place an object at the centre of tile (0,0)
        obj = MapObject.make_point("Guard", x=16.0, y=16.0, object_type="NPC")
        obj_layer.add_object(obj)
        img = TileRenderer().render(m, show_grid=False)
        sample = _color_at(img, 16, 16)
        assert not _colors_close(sample, _BACKGROUND)

    def test_hidden_object_not_rendered(self, qapp):
        m = _make_map()
        obj_layer = m.object_layers()[0]
        obj = MapObject.make_point("Guard", x=16.0, y=16.0)
        obj.visible = False
        obj_layer.add_object(obj)
        img = TileRenderer().render(m, show_grid=False)
        sample = _color_at(img, 16, 16)
        assert _colors_close(sample, _BACKGROUND)

    def test_rect_object_renders(self, qapp):
        m = _make_map()
        obj_layer = m.object_layers()[0]
        obj = MapObject.make_rect("Zone", x=5.0, y=5.0, width=22.0, height=22.0,
                                  object_type="Trigger")
        obj_layer.add_object(obj)
        img = TileRenderer().render(m, show_grid=False)
        # Somewhere inside the rect should differ from pure background
        sample = _color_at(img, 16, 16)
        assert not _colors_close(sample, _BACKGROUND)


# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------

class TestCache:
    def test_invalidate_cache_clears(self, qapp):
        renderer = TileRenderer()
        m = _make_map()
        renderer.render(m)
        # Populate a fake cache entry to confirm it gets cleared
        renderer._sheet_cache["fake_path"] = None
        renderer.invalidate_cache()
        assert renderer._sheet_cache == {}
