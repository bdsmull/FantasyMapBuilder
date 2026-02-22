"""
Shared pytest fixtures for the map editor test suite.
"""

import pytest

from map_editor.models.map_object import MapObject, ObjectShape
from map_editor.models.tileset import TileCategory, TileDefinition, Tileset
from map_editor.models.layer import TileLayer, ObjectLayer
from map_editor.models.tile_map import TileMap
from map_editor.models.hex_map import HexMap, HexOrientation


# ---------------------------------------------------------------------------
# Global state reset
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def reset_object_ids():
    """Reset the MapObject ID counter before every test."""
    MapObject.reset_id_counter(0)
    yield


# ---------------------------------------------------------------------------
# Tileset fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def three_tile_defs():
    return [
        TileDefinition(id=1, name="Grass",      color=(106, 168, 79),  category=TileCategory.TERRAIN),
        TileDefinition(id=2, name="Stone Wall", color=( 90,  90, 90),  category=TileCategory.WALL),
        TileDefinition(id=3, name="Tree",       color=( 39, 110, 39),  category=TileCategory.OBJECT),
    ]


@pytest.fixture
def small_tileset(three_tile_defs):
    """A 3-tile Tileset with no file I/O."""
    return Tileset(
        name="SmallTest",
        tile_width=32,
        tile_height=32,
        tiles=three_tile_defs,
    )


# ---------------------------------------------------------------------------
# TileMap fixture
# ---------------------------------------------------------------------------

@pytest.fixture
def small_tile_map(small_tileset):
    """A 5×4 TileMap with one TileLayer and one ObjectLayer."""
    ground = TileLayer(name="Ground", width=5, height=4)
    objects = ObjectLayer(name="Objects")
    return TileMap(
        name="TestMap",
        width=5,
        height=4,
        tile_width=32,
        tile_height=32,
        tilesets=[small_tileset],
        layers=[ground, objects],
    )


# ---------------------------------------------------------------------------
# HexMap fixture
# ---------------------------------------------------------------------------

@pytest.fixture
def small_hex_map():
    """A 6×5 flat-top HexMap with no file I/O."""
    from map_editor.models.tileset import make_default_hex_tileset
    tileset = make_default_hex_tileset(output_dir=None)
    terrain = TileLayer(name="Terrain", width=6, height=5)
    locations = ObjectLayer(name="Locations")
    return HexMap(
        name="TestWorld",
        cols=6,
        rows=5,
        hex_size=40.0,
        orientation=HexOrientation.FLAT_TOP,
        tilesets=[tileset],
        layers=[terrain, locations],
    )
