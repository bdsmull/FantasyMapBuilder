"""Tests for editing tools and undo/redo commands."""
import pytest
from PyQt6.QtGui import QUndoStack

from map_editor.models.layer import ObjectLayer, TileLayer
from map_editor.tools.erase_tool import EraseTool
from map_editor.tools.fill_tool import FillTool
from map_editor.tools.paint_tool import PaintTool
from map_editor.tools.point_tool import PointObjectTool


# ---------------------------------------------------------------------------
# CanvasStub — minimal canvas interface for tool testing (no QWidget needed)
# ---------------------------------------------------------------------------

class CanvasStub:
    def __init__(self, tile_map):
        self._undo_stack = QUndoStack()
        self._active_layer = tile_map.tile_layers()[0]
        self._active_gid = 1
        self._tile_map = tile_map
        self.refreshed = False

    def push_command(self, cmd):
        self._undo_stack.push(cmd)

    def refresh(self):
        self.refreshed = True

    def _cell_to_pixel_center(self, col: int, row: int) -> tuple[float, float]:
        px = col * self._tile_map.tile_width + self._tile_map.tile_width // 2
        py = row * self._tile_map.tile_height + self._tile_map.tile_height // 2
        return float(px), float(py)

    def _get_tile_size(self) -> tuple[int, int]:
        return self._tile_map.tile_width, self._tile_map.tile_height


@pytest.fixture
def canvas(small_tile_map):
    return CanvasStub(small_tile_map)


# ---------------------------------------------------------------------------
# PaintTool tests
# ---------------------------------------------------------------------------

def test_paint_tool_sets_tile(canvas):
    tool = PaintTool()
    layer: TileLayer = canvas._active_layer

    assert layer.get_tile(0, 0) == 0

    tool.on_press(canvas, 0, 0)
    assert layer.get_tile(0, 0) == canvas._active_gid

    tool.on_release(canvas)
    assert canvas._undo_stack.count() == 1


def test_erase_tool_clears_tile(canvas):
    tool = EraseTool()
    layer: TileLayer = canvas._active_layer

    # Pre-fill so there is something to erase
    layer.set_tile(1, 1, 5)
    canvas._active_layer = layer

    tool.on_press(canvas, 1, 1)
    assert layer.get_tile(1, 1) == 0

    tool.on_release(canvas)
    assert canvas._undo_stack.count() == 1


def test_fill_tool_flood_fills(canvas):
    tool = FillTool()
    layer: TileLayer = canvas._active_layer

    # All cells start at 0; fill with gid 1
    canvas._active_gid = 1
    tool.on_press(canvas, 0, 0)

    # Every cell should now be 1
    for row in range(canvas._tile_map.height):
        for col in range(canvas._tile_map.width):
            assert layer.get_tile(col, row) == 1

    assert canvas._undo_stack.count() == 1


def test_undo_paint_stroke(canvas):
    tool = PaintTool()
    layer: TileLayer = canvas._active_layer

    tool.on_press(canvas, 0, 0)
    tool.on_drag(canvas, 1, 0)
    tool.on_release(canvas)

    assert layer.get_tile(0, 0) == canvas._active_gid
    assert layer.get_tile(1, 0) == canvas._active_gid

    canvas._undo_stack.undo()

    assert layer.get_tile(0, 0) == 0
    assert layer.get_tile(1, 0) == 0


def test_undo_fill(canvas):
    tool = FillTool()
    layer: TileLayer = canvas._active_layer

    canvas._active_gid = 2
    tool.on_press(canvas, 0, 0)

    canvas._undo_stack.undo()

    for row in range(canvas._tile_map.height):
        for col in range(canvas._tile_map.width):
            assert layer.get_tile(col, row) == 0


def test_erase_tool_undo(canvas):
    """Undo after an erase stroke restores the original tile value."""
    tool = EraseTool()
    layer: TileLayer = canvas._active_layer

    layer.set_tile(2, 2, 3)
    tool.on_press(canvas, 2, 2)
    assert layer.get_tile(2, 2) == 0

    tool.on_release(canvas)
    canvas._undo_stack.undo()
    assert layer.get_tile(2, 2) == 3


def test_fill_same_gid_noop(canvas):
    """FillTool pushes no command when the target cell already has the active GID."""
    tool = FillTool()
    layer: TileLayer = canvas._active_layer

    layer.set_tile(0, 0, 1)
    canvas._active_gid = 1  # same as what's already there
    tool.on_press(canvas, 0, 0)
    assert canvas._undo_stack.count() == 0


# ---------------------------------------------------------------------------
# PointObjectTool tests
# ---------------------------------------------------------------------------

def test_point_tool_adds_object(canvas, small_tile_map):
    tool = PointObjectTool()
    obj_layer: ObjectLayer = next(
        l for l in small_tile_map.layers if isinstance(l, ObjectLayer)
    )
    canvas._active_layer = obj_layer

    tool.on_press(canvas, 2, 2)

    assert len(obj_layer.objects) == 1
    assert obj_layer.objects[0].name == "Object 1"


def test_point_tool_removes_object(canvas, small_tile_map):
    tool = PointObjectTool()
    obj_layer: ObjectLayer = next(
        l for l in small_tile_map.layers if isinstance(l, ObjectLayer)
    )
    canvas._active_layer = obj_layer

    # Add then remove
    tool.on_press(canvas, 1, 1)
    assert len(obj_layer.objects) == 1

    tool.on_right_press(canvas, 1, 1)
    assert len(obj_layer.objects) == 0

    assert canvas._undo_stack.count() == 2
