"""Paint tool — places the active tile on press and drag."""
from __future__ import annotations

from map_editor.commands.tile_commands import SetTileRegionCommand
from map_editor.models.layer import TileLayer
from map_editor.tools.base_tool import BaseTool


class PaintTool(BaseTool):
    """Places the active tile GID on every cell the user drags over.

    The entire press→drag→release gesture is committed as a single
    ``SetTileRegionCommand`` so that a full stroke is one undo step.
    """

    def __init__(self) -> None:
        self._pending: list[tuple[int, int, int, int]] = []  # (col, row, old, new)
        self._last_cell: tuple[int, int] | None = None

    # ------------------------------------------------------------------
    # BaseTool interface
    # ------------------------------------------------------------------

    def on_press(self, canvas: "MapCanvas", col: int, row: int) -> None:
        if not isinstance(canvas._active_layer, TileLayer):
            return
        if col < 0 or row < 0:
            return
        self._apply(canvas, col, row)

    def on_drag(self, canvas: "MapCanvas", col: int, row: int) -> None:
        if not isinstance(canvas._active_layer, TileLayer):
            return
        if col < 0 or row < 0:
            return
        if (col, row) == self._last_cell:
            return  # deduplicate same cell within a stroke
        self._apply(canvas, col, row)

    def on_release(self, canvas: "MapCanvas") -> None:
        if self._pending:
            canvas.push_command(
                SetTileRegionCommand(canvas._active_layer, list(self._pending))
            )
        self._pending.clear()
        self._last_cell = None

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _apply(self, canvas: "MapCanvas", col: int, row: int) -> None:
        layer: TileLayer = canvas._active_layer  # type: ignore[assignment]
        gid = canvas._active_gid
        old_id = layer.get_tile(col, row)
        layer.set_tile(col, row, gid)
        self._pending.append((col, row, old_id, gid))
        self._last_cell = (col, row)
        canvas.refresh()
