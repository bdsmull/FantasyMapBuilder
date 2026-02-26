"""Abstract base class for all editing tools."""
from __future__ import annotations

from PyQt6.QtCore import Qt


class BaseTool:
    """Strategy interface for map editing tools.

    Concrete tools implement on_press / on_drag / on_release and receive the
    active canvas on each call.  Tools are stateless across canvases — a single
    instance can be reused for every open map.
    """

    def on_press(self, canvas: "MapCanvas", col: int, row: int) -> None:
        """Called when the left mouse button is pressed on a valid cell."""

    def on_drag(self, canvas: "MapCanvas", col: int, row: int) -> None:
        """Called when the mouse moves while the left button is held."""

    def on_release(self, canvas: "MapCanvas") -> None:
        """Called when the left mouse button is released."""

    def cursor(self) -> Qt.CursorShape:
        """Return the cursor to display while this tool is active."""
        return Qt.CursorShape.CrossCursor
