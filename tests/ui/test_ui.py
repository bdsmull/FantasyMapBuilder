"""UI tests for Phase 3 and Phase 4 components."""
import pytest
from PyQt6.QtGui import QImage

from map_editor.models.hex_map import HexMap, HexOrientation
from map_editor.models.tile_map import TileMap
from map_editor.tools.erase_tool import EraseTool
from map_editor.tools.fill_tool import FillTool
from map_editor.tools.paint_tool import PaintTool
from map_editor.ui.dialogs.new_map_dialog import NewMapDialog
from map_editor.ui.hex_canvas import HexCanvas
from map_editor.ui.layer_panel import LayerPanelWidget
from map_editor.ui.main_window import MainWindow
from map_editor.ui.tile_canvas import TileCanvas
from map_editor.ui.tile_palette import TilePaletteWidget


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _tile_map(tmp_path, name="T", w=5, h=4):
    return TileMap.create_new(name=name, width=w, height=h, placeholder_dir=tmp_path)


def _hex_map(tmp_path, name="H"):
    return HexMap.create_new(
        name=name,
        cols=4,
        rows=4,
        hex_size=40.0,
        orientation=HexOrientation.FLAT_TOP,
        placeholder_dir=tmp_path,
    )


# ---------------------------------------------------------------------------
# MainWindow — construction (Phase 3)
# ---------------------------------------------------------------------------


def test_main_window_creates(qtbot):
    """MainWindow constructs without error."""
    window = MainWindow()
    qtbot.addWidget(window)
    assert window.windowTitle() == "Fantasy RPG Map Editor"


# ---------------------------------------------------------------------------
# NewMapDialog (Phase 3)
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
    result = dlg.create_map(tmp_path)
    assert isinstance(result, TileMap)
    assert result.width == 20
    assert result.height == 15


def test_dialog_creates_hex_map(qtbot, tmp_path):
    """create_map() returns a HexMap with flat-top orientation by default."""
    dlg = NewMapDialog(initial_type="hex")
    qtbot.addWidget(dlg)
    result = dlg.create_map(tmp_path)
    assert isinstance(result, HexMap)
    assert result.orientation == HexOrientation.FLAT_TOP


# ---------------------------------------------------------------------------
# Canvas widgets — rendering (Phase 3)
# ---------------------------------------------------------------------------


def test_tile_canvas_renders(qtbot, tmp_path):
    """TileCanvas renders a non-null pixmap on construction."""
    canvas = TileCanvas(_tile_map(tmp_path))
    qtbot.addWidget(canvas)
    assert not canvas._pixmap_item.pixmap().isNull()


def test_hex_canvas_renders(qtbot, tmp_path):
    """HexCanvas renders a non-null pixmap on construction."""
    canvas = HexCanvas(_hex_map(tmp_path))
    qtbot.addWidget(canvas)
    assert not canvas._pixmap_item.pixmap().isNull()


# ---------------------------------------------------------------------------
# Sub-window lifecycle (Phase 4)
# ---------------------------------------------------------------------------


def test_open_tile_map_adds_sub_window(qtbot, tmp_path):
    """Opening a TileCanvas adds exactly one sub-window to the MDI area."""
    window = MainWindow()
    qtbot.addWidget(window)
    window._open_canvas(TileCanvas(_tile_map(tmp_path)))
    assert len(window._mdi.subWindowList()) == 1


def test_close_tile_map_no_crash(qtbot, tmp_path):
    """Closing a tile-map sub-window does not raise RuntimeError."""
    window = MainWindow()
    qtbot.addWidget(window)
    window._open_canvas(TileCanvas(_tile_map(tmp_path)))
    window._mdi.closeActiveSubWindow()
    qtbot.wait(50)  # allow Qt to destroy the canvas C++ objects


def test_close_hex_map_no_crash(qtbot, tmp_path):
    """Closing a hex-map sub-window does not raise RuntimeError."""
    window = MainWindow()
    qtbot.addWidget(window)
    window._open_canvas(HexCanvas(_hex_map(tmp_path)))
    window._mdi.closeActiveSubWindow()
    qtbot.wait(50)


# ---------------------------------------------------------------------------
# Multi-canvas + undo-stack reconnect (Phase 4)
# ---------------------------------------------------------------------------


def test_switch_between_maps_no_crash(qtbot, tmp_path):
    """Switching the active sub-window multiple times does not raise TypeError."""
    window = MainWindow()
    qtbot.addWidget(window)
    window._open_canvas(TileCanvas(_tile_map(tmp_path, "A")))
    window._open_canvas(TileCanvas(_tile_map(tmp_path, "B")))
    subs = window._mdi.subWindowList()
    # Activate each sub-window in turn — exercises _reconnect_undo_stack
    window._mdi.setActiveSubWindow(subs[0])
    window._mdi.setActiveSubWindow(subs[1])
    window._mdi.setActiveSubWindow(subs[0])


def test_independent_undo_stacks(qtbot, tmp_path):
    """Editing one canvas does not affect another canvas's undo stack."""
    window = MainWindow()
    qtbot.addWidget(window)
    c1 = TileCanvas(_tile_map(tmp_path, "A"))
    c2 = TileCanvas(_tile_map(tmp_path, "B"))
    window._open_canvas(c1)
    window._open_canvas(c2)

    tool = PaintTool()
    c1._active_layer = c1.tile_map.tile_layers()[0]
    c1._active_gid = 1
    tool.on_press(c1, 0, 0)
    tool.on_release(c1)

    assert c1.undo_stack().count() == 1
    assert c2.undo_stack().count() == 0


# ---------------------------------------------------------------------------
# Undo/redo action state in MainWindow (Phase 4)
# ---------------------------------------------------------------------------


def test_undo_disabled_on_fresh_canvas(qtbot, tmp_path):
    """Undo and Redo actions are disabled immediately after opening a new map."""
    window = MainWindow()
    qtbot.addWidget(window)
    canvas = TileCanvas(_tile_map(tmp_path))
    window._open_canvas(canvas)
    # Force-connect in case subWindowActivated didn't fire in offscreen mode
    window._reconnect_undo_stack(canvas.undo_stack())
    assert not window._undo_action.isEnabled()
    assert not window._redo_action.isEnabled()


def test_undo_enabled_after_edit(qtbot, tmp_path):
    """Undo becomes enabled once a command is pushed; Redo stays disabled."""
    window = MainWindow()
    qtbot.addWidget(window)
    canvas = TileCanvas(_tile_map(tmp_path))
    window._open_canvas(canvas)
    window._reconnect_undo_stack(canvas.undo_stack())

    tool = PaintTool()
    canvas._active_layer = canvas.tile_map.tile_layers()[0]
    canvas._active_gid = 1
    tool.on_press(canvas, 0, 0)
    tool.on_release(canvas)

    assert window._undo_action.isEnabled()
    assert not window._redo_action.isEnabled()


def test_undo_redo_cycle_updates_actions(qtbot, tmp_path):
    """After undo the action flips; after redo it flips back."""
    window = MainWindow()
    qtbot.addWidget(window)
    tile_map = _tile_map(tmp_path)
    canvas = TileCanvas(tile_map)
    window._open_canvas(canvas)
    window._reconnect_undo_stack(canvas.undo_stack())

    layer = tile_map.tile_layers()[0]
    canvas._active_layer = layer
    canvas._active_gid = 1
    tool = PaintTool()
    tool.on_press(canvas, 1, 1)
    tool.on_release(canvas)
    assert layer.get_tile(1, 1) == 1

    canvas.undo_stack().undo()
    assert layer.get_tile(1, 1) == 0
    assert not window._undo_action.isEnabled()
    assert window._redo_action.isEnabled()

    canvas.undo_stack().redo()
    assert layer.get_tile(1, 1) == 1
    assert window._undo_action.isEnabled()
    assert not window._redo_action.isEnabled()


# ---------------------------------------------------------------------------
# Layer panel wiring (Phase 4)
# ---------------------------------------------------------------------------


def test_layer_panel_populated_on_open(qtbot, tmp_path):
    """After opening a map the layer panel lists all layers."""
    window = MainWindow()
    qtbot.addWidget(window)
    tile_map = _tile_map(tmp_path)
    window._open_canvas(TileCanvas(tile_map))
    assert window._layer_panel.count() == len(tile_map.layers)


def test_layer_visibility_signal_propagates(qtbot, tmp_path):
    """Emitting layer_visibility_changed updates layer.visible and refreshes."""
    window = MainWindow()
    qtbot.addWidget(window)
    tile_map = _tile_map(tmp_path)
    canvas = TileCanvas(tile_map)
    window._open_canvas(canvas)
    layer = tile_map.tile_layers()[0]
    assert layer.visible

    window._layer_panel.layer_visibility_changed.emit(layer, False)
    assert not layer.visible

    window._layer_panel.layer_visibility_changed.emit(layer, True)
    assert layer.visible


# ---------------------------------------------------------------------------
# Tile palette (Phase 4)
# ---------------------------------------------------------------------------


def test_palette_set_tileset_emits_signal(qtbot, tmp_path):
    """set_tileset() emits tile_selected with the tileset's first_gid."""
    tile_map = _tile_map(tmp_path)
    palette = TilePaletteWidget()
    qtbot.addWidget(palette)
    tileset = tile_map.tilesets[0]
    img = QImage(tileset.source)
    if img.isNull():
        pytest.skip("Placeholder PNG not generated")
    with qtbot.waitSignal(palette.tile_selected) as blocker:
        palette.set_tileset(tileset, img)
    assert blocker.args[0] == tileset.first_gid
    assert palette.selected_gid() == tileset.first_gid


def test_palette_gid_wired_to_canvas(qtbot, tmp_path):
    """After _open_canvas the canvas active_gid matches the palette selection."""
    window = MainWindow()
    qtbot.addWidget(window)
    canvas = TileCanvas(_tile_map(tmp_path))
    window._open_canvas(canvas)
    assert canvas._active_gid == window._tile_palette.selected_gid()


# ---------------------------------------------------------------------------
# Tools via real TileCanvas widget (Phase 4)
# ---------------------------------------------------------------------------


def test_paint_tool_modifies_tile_via_canvas(qtbot, tmp_path):
    """PaintTool sets a tile and pushes one undo command through TileCanvas."""
    tile_map = _tile_map(tmp_path)
    canvas = TileCanvas(tile_map)
    qtbot.addWidget(canvas)
    layer = tile_map.tile_layers()[0]
    canvas._active_layer = layer
    canvas._active_gid = 1

    tool = PaintTool()
    canvas.set_tool(tool)
    tool.on_press(canvas, 2, 2)
    tool.on_release(canvas)

    assert layer.get_tile(2, 2) == 1
    assert canvas.undo_stack().count() == 1


def test_erase_tool_clears_tile_via_canvas(qtbot, tmp_path):
    """EraseTool sets a tile to 0 and pushes one undo command."""
    tile_map = _tile_map(tmp_path)
    canvas = TileCanvas(tile_map)
    qtbot.addWidget(canvas)
    layer = tile_map.tile_layers()[0]
    layer.set_tile(3, 3, 5)
    canvas._active_layer = layer

    tool = EraseTool()
    canvas.set_tool(tool)
    tool.on_press(canvas, 3, 3)
    tool.on_release(canvas)

    assert layer.get_tile(3, 3) == 0
    assert canvas.undo_stack().count() == 1


def test_fill_tool_fills_layer_via_canvas(qtbot, tmp_path):
    """FillTool fills all empty cells and the canvas pixmap updates."""
    tile_map = _tile_map(tmp_path)
    canvas = TileCanvas(tile_map)
    qtbot.addWidget(canvas)
    layer = tile_map.tile_layers()[0]
    canvas._active_layer = layer
    canvas._active_gid = 2

    tool = FillTool()
    canvas.set_tool(tool)
    tool.on_press(canvas, 0, 0)

    assert all(
        layer.get_tile(col, row) == 2
        for row in range(tile_map.height)
        for col in range(tile_map.width)
    )
    assert canvas.undo_stack().count() == 1
    assert not canvas._pixmap_item.pixmap().isNull()
