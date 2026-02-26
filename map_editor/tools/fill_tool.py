"""Fill tool — flood-fills a contiguous region on press."""
from __future__ import annotations

from map_editor.commands.tile_commands import FloodFillCommand
from map_editor.models.layer import TileLayer
from map_editor.tools.base_tool import BaseTool


class FillTool(BaseTool):
    """Flood-fills all contiguous cells matching the clicked cell's tile.

    A single click is a single undo step.
    """

    def on_press(self, canvas: "MapCanvas", col: int, row: int) -> None:
        if not isinstance(canvas._active_layer, TileLayer):
            return
        if col < 0 or row < 0:
            return
        layer: TileLayer = canvas._active_layer  # type: ignore[assignment]
        gid = canvas._active_gid
        old_id = layer.get_tile(col, row)
        if old_id == gid:
            return  # nothing to do
        changed = layer.flood_fill(col, row, gid)
        if not changed:
            return
        canvas.push_command(FloodFillCommand(layer, changed, old_id, gid))
        canvas.refresh()

    # on_drag and on_release are intentional no-ops (inherited from BaseTool)
