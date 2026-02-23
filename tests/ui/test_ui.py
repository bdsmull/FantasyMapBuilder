"""UI smoke tests for Phase 3 components."""
import pytest

from map_editor.models.hex_map import HexMap, HexOrientation
from map_editor.models.tile_map import TileMap
from map_editor.ui.dialogs.new_map_dialog import NewMapDialog
from map_editor.ui.hex_canvas import HexCanvas
from map_editor.ui.main_window import MainWindow
from map_editor.ui.tile_canvas import TileCanvas


# ---------------------------------------------------------------------------
# MainWindow
# ---------------------------------------------------------------------------


def test_main_window_creates(qtbot):
    """MainWindow constructs without error."""
    window = MainWindow()
    qtbot.addWidget(window)
    assert window.windowTitle() == "Fantasy RPG Map Editor"


# ---------------------------------------------------------------------------
# NewMapDialog
# ---------------------------------------------------------------------------


def test_new_tile_dialog_type(qtbot):
    """Dialog defaults to tile map type."""
    dlg = NewMapDialog()
    qtbot.addWidget(dlg)
    assert dlg.map_type() == "tile"


def test_new_hex_dialog_type(qtbot):
    """Dialog respects initial_type='hex'."""
    dlg = NewMapDialog(initial_type="hex")
    qtbot.addWidget(dlg)
    assert dlg.map_type() == "hex"


def test_dialog_creates_tile_map(qtbot, tmp_path):
    """create_map() returns a TileMap with the correct dimensions."""
    dlg = NewMapDialog()
    qtbot.addWidget(dlg)
    # Default values: 20 × 15 tiles, 32 px each
    result = dlg.create_map(tmp_path)
    assert isinstance(result, TileMap)
    assert result.width == 20
    assert result.height == 15


def test_dialog_creates_hex_map(qtbot, tmp_path):
    """create_map() returns a HexMap with flat-top orientation by default."""
    dlg = NewMapDialog(initial_type="hex")
    qtbot.addWidget(dlg)
    # Default: Flat-top (index 0)
    result = dlg.create_map(tmp_path)
    assert isinstance(result, HexMap)
    assert result.orientation == HexOrientation.FLAT_TOP


# ---------------------------------------------------------------------------
# Canvas widgets
# ---------------------------------------------------------------------------


def test_tile_canvas_renders(qtbot, tmp_path):
    """TileCanvas renders a non-null pixmap on construction."""
    tile_map = TileMap.create_new(
        name="UI Test Tile",
        width=5,
        height=5,
        placeholder_dir=tmp_path,
    )
    canvas = TileCanvas(tile_map)
    qtbot.addWidget(canvas)
    assert not canvas._pixmap_item.pixmap().isNull()


def test_hex_canvas_renders(qtbot, tmp_path):
    """HexCanvas renders a non-null pixmap on construction."""
    hex_map = HexMap.create_new(
        name="UI Test Hex",
        cols=4,
        rows=4,
        hex_size=40.0,
        orientation=HexOrientation.FLAT_TOP,
        placeholder_dir=tmp_path,
    )
    canvas = HexCanvas(hex_map)
    qtbot.addWidget(canvas)
    assert not canvas._pixmap_item.pixmap().isNull()
