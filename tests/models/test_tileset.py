import pytest
from pathlib import Path

from map_editor.models.tileset import (
    TileCategory,
    TileDefinition,
    Tileset,
    make_default_tile_tileset,
    make_default_hex_tileset,
    _PLACEHOLDER_TILES,
    _PLACEHOLDER_HEX_TILES,
)


class TestTileDefinition:
    def test_defaults(self):
        t = TileDefinition(id=1, name="Grass", color=(106, 168, 79))
        assert t.id == 1
        assert t.name == "Grass"
        assert t.color == (106, 168, 79)
        assert t.category == TileCategory.TERRAIN
        assert t.sheet_col == 0
        assert t.sheet_row == 0

    def test_is_passable_terrain(self):
        t = TileDefinition(id=1, name="Grass", color=(0, 0, 0), category=TileCategory.TERRAIN)
        assert t.is_passable is True

    def test_is_passable_object(self):
        t = TileDefinition(id=1, name="Tree", color=(0, 0, 0), category=TileCategory.OBJECT)
        assert t.is_passable is True

    def test_is_passable_wall(self):
        t = TileDefinition(id=1, name="Wall", color=(0, 0, 0), category=TileCategory.WALL)
        assert t.is_passable is False

    def test_is_passable_special(self):
        t = TileDefinition(id=1, name="Spawn", color=(0, 0, 0), category=TileCategory.SPECIAL)
        assert t.is_passable is True


class TestTileset:
    def test_tile_by_id_found(self, small_tileset):
        t = small_tileset.tile_by_id(2)
        assert t is not None
        assert t.name == "Stone Wall"

    def test_tile_by_id_missing(self, small_tileset):
        assert small_tileset.tile_by_id(99) is None

    def test_tile_by_id_zero_missing(self, small_tileset):
        # 0 is always "empty" and should never exist in a tileset
        assert small_tileset.tile_by_id(0) is None

    def test_tile_by_name_found(self, small_tileset):
        t = small_tileset.tile_by_name("Grass")
        assert t is not None
        assert t.id == 1

    def test_tile_by_name_missing(self, small_tileset):
        assert small_tileset.tile_by_name("Nonexistent") is None

    def test_count(self, small_tileset):
        assert small_tileset.count == 3

    def test_columns_fewer_than_8(self, small_tileset):
        assert small_tileset.columns == 3

    def test_columns_caps_at_8(self):
        tiles = [
            TileDefinition(id=i, name=f"T{i}", color=(i, i, i))
            for i in range(1, 17)  # 16 tiles
        ]
        ts = Tileset(name="Big", tiles=tiles)
        assert ts.columns == 8

    def test_columns_empty_tileset(self):
        ts = Tileset(name="Empty", tiles=[])
        assert ts.columns == 1

    def test_make_placeholder_no_io(self):
        tile_defs = [
            {"id": 1, "name": "A", "color": (10, 20, 30), "category": TileCategory.TERRAIN},
            {"id": 2, "name": "B", "color": (40, 50, 60), "category": TileCategory.WALL},
        ]
        ts = Tileset.make_placeholder(name="NoIO", tile_defs=tile_defs, output_dir=None)
        assert ts.count == 2
        assert ts.source == ""
        # Sheet positions assigned
        assert ts.tiles[0].sheet_col == 0
        assert ts.tiles[0].sheet_row == 0
        assert ts.tiles[1].sheet_col == 1
        assert ts.tiles[1].sheet_row == 0

    def test_make_placeholder_writes_png(self, tmp_path):
        tile_defs = [
            {"id": 1, "name": "X", "color": (255, 0, 0), "category": TileCategory.TERRAIN},
        ]
        ts = Tileset.make_placeholder(name="WithIO", tile_defs=tile_defs, output_dir=tmp_path)
        png = Path(ts.source)
        assert png.exists()
        assert png.suffix == ".png"

    def test_make_placeholder_sheet_row_wraps(self):
        # 9 tiles with columns=8 → tile 9 should be on row 1
        tile_defs = [
            {"id": i, "name": f"T{i}", "color": (i * 10, 0, 0), "category": TileCategory.TERRAIN}
            for i in range(1, 10)
        ]
        ts = Tileset.make_placeholder(name="Wrap", tile_defs=tile_defs, output_dir=None)
        last = ts.tile_by_id(9)
        assert last.sheet_row == 1
        assert last.sheet_col == 0


class TestDefaultTilesets:
    def test_make_default_tile_tileset_count(self):
        ts = make_default_tile_tileset(output_dir=None)
        assert ts.count == len(_PLACEHOLDER_TILES)

    def test_make_default_tile_tileset_first_id(self):
        ts = make_default_tile_tileset(output_dir=None)
        assert ts.tiles[0].id == 1

    def test_make_default_tile_tileset_first_gid(self):
        ts = make_default_tile_tileset(output_dir=None)
        assert ts.first_gid == 1

    def test_make_default_hex_tileset_count(self):
        ts = make_default_hex_tileset(output_dir=None)
        assert ts.count == len(_PLACEHOLDER_HEX_TILES)

    def test_make_default_hex_tileset_first_id(self):
        ts = make_default_hex_tileset(output_dir=None)
        assert ts.tiles[0].id == 1
