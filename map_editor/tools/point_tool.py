"""Point object tool — places and removes point objects on ObjectLayers."""
from __future__ import annotations

from PyQt6.QtCore import Qt

from map_editor.commands.tile_commands import AddObjectCommand, RemoveObjectCommand
from map_editor.models.layer import ObjectLayer
from map_editor.models.map_object import MapObject
from map_editor.tools.base_tool import BaseTool


class PointObjectTool(BaseTool):
    """Left-click to add a named point object; right-click to remove the nearest one.

    Each add or remove is one undo step.
    """

    def __init__(self) -> None:
        self._counter: int = 0

    # ------------------------------------------------------------------
    # BaseTool interface (left-click)
    # ------------------------------------------------------------------

    def on_press(self, canvas: "MapCanvas", col: int, row: int) -> None:
        if not isinstance(canvas._active_layer, ObjectLayer):
            return
        if col < 0 or row < 0:
            return
        layer: ObjectLayer = canvas._active_layer  # type: ignore[assignment]
        px, py = canvas._cell_to_pixel_center(col, row)
        self._counter += 1
        obj = MapObject.make_point(name=f"Object {self._counter}", x=px, y=py)
        layer.add_object(obj)
        canvas.push_command(AddObjectCommand(layer, obj))
        canvas.refresh()

    # on_drag and on_release are intentional no-ops

    def cursor(self) -> Qt.CursorShape:
        return Qt.CursorShape.PointingHandCursor

    # ------------------------------------------------------------------
    # Right-click (called directly by MapCanvas)
    # ------------------------------------------------------------------

    def on_right_press(self, canvas: "MapCanvas", col: int, row: int) -> None:
        """Remove the nearest point object at the given cell position."""
        if not isinstance(canvas._active_layer, ObjectLayer):
            return
        if col < 0 or row < 0:
            return
        layer: ObjectLayer = canvas._active_layer  # type: ignore[assignment]
        px, py = canvas._cell_to_pixel_center(col, row)
        tw, th = canvas._get_tile_size()
        hits = layer.objects_at(px, py, tw, th)
        if not hits:
            return
        obj = hits[0]
        layer.remove_object(obj)
        canvas.push_command(RemoveObjectCommand(layer, obj))
        canvas.refresh()
