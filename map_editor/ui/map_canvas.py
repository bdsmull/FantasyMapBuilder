"""Abstract base canvas for displaying and navigating a map.

Subclasses implement ``_do_render()``, ``_pixel_to_cell()``,
``_map_pixel_size()``, ``_cell_to_pixel_center()``, ``_get_tile_size()``,
and ``map_name()``.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from PyQt6.QtCore import QEvent, QRectF, Qt, QTimer, pyqtSignal
from PyQt6.QtGui import (
    QBrush,
    QColor,
    QImage,
    QMouseEvent,
    QPainter,
    QPixmap,
    QUndoStack,
    QWheelEvent,
)
from PyQt6.QtWidgets import (
    QGraphicsPixmapItem,
    QGraphicsScene,
    QGraphicsView,
)

from map_editor.models.layer import ObjectLayer, TileLayer

if TYPE_CHECKING:
    from map_editor.tools.base_tool import BaseTool

_ZOOM_MIN = 0.1
_ZOOM_MAX = 16.0
_ZOOM_STEP = 1.2
_INITIAL_MAX_CELLS = 60  # max cells visible per axis on first open


class MapCanvas(QGraphicsView):
    """Abstract base canvas.

    Signals
    -------
    cursor_moved(col, row)
        Emitted when the mouse moves over the canvas.
        col and row are in map-cell space; both are -1 when the cursor
        is outside the map bounds.
    zoom_changed(factor)
        Emitted when the zoom level changes.  1.0 == 100 %.
    """

    cursor_moved = pyqtSignal(int, int)
    zoom_changed = pyqtSignal(float)

    def __init__(self, parent=None) -> None:
        super().__init__(parent)

        # Scene + single pixmap item that holds the rendered map
        self._scene = QGraphicsScene(self)
        self._scene.setBackgroundBrush(QBrush(QColor(20, 20, 20)))
        self._pixmap_item = QGraphicsPixmapItem()
        self._scene.addItem(self._pixmap_item)
        self.setScene(self._scene)

        # View settings
        self.setTransformationAnchor(QGraphicsView.ViewportAnchor.AnchorUnderMouse)
        self.setResizeAnchor(QGraphicsView.ViewportAnchor.AnchorUnderMouse)
        self.setDragMode(QGraphicsView.DragMode.NoDrag)
        self.setRenderHint(QPainter.RenderHint.Antialiasing)

        # Navigation state
        self._show_grid: bool = True
        self._zoom_factor: float = 1.0
        self._first_show: bool = True
        self._refreshing: bool = False  # re-entrancy guard for refresh()

        # Phase 4: undo stack (one per canvas instance)
        self._undo_stack: QUndoStack = QUndoStack(self)
        self._undo_stack.indexChanged.connect(lambda _: self.refresh())

        # Phase 4: active editing state
        self._active_tool: BaseTool | None = None
        self._active_layer: TileLayer | ObjectLayer | None = None
        self._active_gid: int = 0
        self._tool_active: bool = False  # True during a press→release gesture

    # ------------------------------------------------------------------
    # Abstract interface — subclasses must implement
    # ------------------------------------------------------------------

    def _do_render(self, clip_rect: QRectF) -> tuple[QImage, float, float]:
        """Render the map portion within *clip_rect*.

        Returns
        -------
        (image, origin_x, origin_y)
            The rendered image and its scene-space top-left position.
        """
        raise NotImplementedError

    def _pixel_to_cell(self, px: float, py: float) -> tuple[int, int]:
        """Convert a map-pixel coordinate to a cell (col, row).

        Return (-1, -1) when the point is outside the map bounds.
        """
        raise NotImplementedError

    def _map_pixel_size(self) -> tuple[float, float]:
        """Return the full pixel (width, height) of the rendered map."""
        raise NotImplementedError

    def _cell_to_pixel_center(self, col: int, row: int) -> tuple[float, float]:
        """Return the pixel centre of a given cell."""
        raise NotImplementedError

    def _get_tile_size(self) -> tuple[int, int]:
        """Return the (width, height) in pixels of a single tile/hex cell."""
        raise NotImplementedError

    def map_name(self) -> str:
        """Return the human-readable name of the map."""
        raise NotImplementedError

    # ------------------------------------------------------------------
    # Public methods — navigation
    # ------------------------------------------------------------------

    def refresh(self) -> None:
        """Re-render the visible map portion and update the displayed pixmap."""
        if self._refreshing:
            return
        self._refreshing = True
        try:
            clip_rect = self._visible_scene_rect()
            img, ox, oy = self._do_render(clip_rect)
            pixmap = QPixmap.fromImage(img)
            self._pixmap_item.setPixmap(pixmap)
            self._pixmap_item.setPos(ox, oy)
            # Keep the scene rect at full map size so scrollbars cover the whole map
            pw, ph = self._map_pixel_size()
            self._scene.setSceneRect(0.0, 0.0, pw, ph)
        except RuntimeError:
            # Qt C++ objects have been deleted (canvas is being destroyed); ignore.
            pass
        finally:
            self._refreshing = False

    def _visible_scene_rect(self) -> QRectF:
        """Return the scene-space rect currently visible in the viewport.

        Falls back to a sensible default when the widget is not yet shown
        (e.g., during construction or headless tests).
        """
        vp = self.viewport()
        if vp is not None:
            vp_rect = vp.rect()
            if not vp_rect.isEmpty():
                return self.mapToScene(vp_rect).boundingRect()
        # Widget not yet shown — render a reasonable default window size
        pw, ph = self._map_pixel_size()
        return QRectF(0.0, 0.0, min(pw, 1920.0), min(ph, 1080.0))

    def set_show_grid(self, show: bool) -> None:
        """Toggle the grid overlay and re-render."""
        self._show_grid = show
        self.refresh()

    def fit_in_view(self) -> None:
        """Scale and centre the map so it fills the current viewport."""
        rect = self._scene.sceneRect()
        if rect.isEmpty():
            return
        self.fitInView(rect, Qt.AspectRatioMode.KeepAspectRatio)
        # Read back the actual zoom Qt calculated
        self._zoom_factor = self.transform().m11()
        self.zoom_changed.emit(self._zoom_factor)
        self.refresh()

    def zoom_to(self, factor: float) -> None:
        """Set an absolute zoom level, clamped to [10 %, 1600 %]."""
        factor = max(_ZOOM_MIN, min(_ZOOM_MAX, factor))
        self.resetTransform()
        self.scale(factor, factor)
        self._zoom_factor = factor
        self.zoom_changed.emit(self._zoom_factor)
        self.refresh()

    def zoom_in(self) -> None:
        self.zoom_to(self._zoom_factor * _ZOOM_STEP)

    def zoom_out(self) -> None:
        self.zoom_to(self._zoom_factor / _ZOOM_STEP)

    def zoom_factor(self) -> float:
        return self._zoom_factor

    # ------------------------------------------------------------------
    # Public methods — editing
    # ------------------------------------------------------------------

    def set_tool(self, tool: BaseTool | None) -> None:
        """Set the active editing tool. Pass None to deactivate."""
        self._active_tool = tool
        if tool is not None:
            self.setCursor(tool.cursor())
        else:
            self.setCursor(Qt.CursorShape.ArrowCursor)

    def set_active_layer(self, layer: TileLayer | ObjectLayer | None) -> None:
        """Set which layer editing operations target."""
        self._active_layer = layer

    def set_active_gid(self, gid: int) -> None:
        """Set the global tile ID used by painting tools."""
        self._active_gid = gid

    def push_command(self, cmd) -> None:
        """Push an undo command onto this canvas's undo stack."""
        self._undo_stack.push(cmd)

    def undo_stack(self) -> QUndoStack:
        """Return the undo stack for this canvas."""
        return self._undo_stack

    # ------------------------------------------------------------------
    # Qt event overrides
    # ------------------------------------------------------------------

    def scrollContentsBy(self, dx: int, dy: int) -> None:
        """Re-render the visible portion after any scroll (pan or programmatic)."""
        super().scrollContentsBy(dx, dy)
        self.refresh()

    def showEvent(self, event) -> None:
        super().showEvent(event)
        if self._first_show:
            self._first_show = False
            # Defer until the widget is fully laid out
            QTimer.singleShot(0, self._initial_zoom)

    def _initial_zoom(self) -> None:
        """Set zoom so at most _INITIAL_MAX_CELLS × _INITIAL_MAX_CELLS cells
        are visible on first open.  Falls back to fit_in_view for small maps.
        """
        vp = self.viewport()
        if vp is None or vp.rect().isEmpty():
            self.fit_in_view()
            return

        tw, th = self._get_tile_size()
        if tw == 0 or th == 0:
            self.fit_in_view()
            return

        pw, ph = self._map_pixel_size()
        map_cols = pw / tw
        map_rows = ph / th

        if map_cols <= _INITIAL_MAX_CELLS and map_rows <= _INITIAL_MAX_CELLS:
            # Small map — show the whole thing
            self.fit_in_view()
            return

        vp_rect = vp.rect()
        zoom = min(
            vp_rect.width() / (_INITIAL_MAX_CELLS * tw),
            vp_rect.height() / (_INITIAL_MAX_CELLS * th),
        )
        self.zoom_to(max(_ZOOM_MIN, min(_ZOOM_MAX, zoom)))
        # Ensure we start at the top-left corner of the map
        self.horizontalScrollBar().setValue(self.horizontalScrollBar().minimum())
        self.verticalScrollBar().setValue(self.verticalScrollBar().minimum())

    def wheelEvent(self, event: QWheelEvent) -> None:
        if event.angleDelta().y() > 0:
            self.zoom_in()
        else:
            self.zoom_out()
        event.accept()

    def mousePressEvent(self, event: QMouseEvent) -> None:
        # Middle-button pan (unchanged)
        if event.button() == Qt.MouseButton.MiddleButton:
            self.setDragMode(QGraphicsView.DragMode.ScrollHandDrag)
            fake = QMouseEvent(
                QEvent.Type.MouseButtonPress,
                event.position(),
                event.globalPosition(),
                Qt.MouseButton.LeftButton,
                Qt.MouseButton.LeftButton,
                event.modifiers(),
            )
            super().mousePressEvent(fake)
            return

        # Right-click → delegate to tool's on_right_press (if supported)
        if event.button() == Qt.MouseButton.RightButton:
            if (
                self._active_tool is not None
                and self.dragMode() == QGraphicsView.DragMode.NoDrag
            ):
                scene_pos = self.mapToScene(event.pos())
                col, row = self._pixel_to_cell(scene_pos.x(), scene_pos.y())
                if hasattr(self._active_tool, "on_right_press"):
                    self._active_tool.on_right_press(self, col, row)
            return

        # Left-click → start a tool gesture (only when not panning)
        if event.button() == Qt.MouseButton.LeftButton:
            if (
                self._active_tool is not None
                and self.dragMode() == QGraphicsView.DragMode.NoDrag
            ):
                scene_pos = self.mapToScene(event.pos())
                col, row = self._pixel_to_cell(scene_pos.x(), scene_pos.y())
                self._tool_active = True
                self._active_tool.on_press(self, col, row)
                return

        super().mousePressEvent(event)

    def mouseReleaseEvent(self, event: QMouseEvent) -> None:
        if event.button() == Qt.MouseButton.MiddleButton:
            fake = QMouseEvent(
                QEvent.Type.MouseButtonRelease,
                event.position(),
                event.globalPosition(),
                Qt.MouseButton.LeftButton,
                Qt.MouseButton.NoButton,
                event.modifiers(),
            )
            super().mouseReleaseEvent(fake)
            self.setDragMode(QGraphicsView.DragMode.NoDrag)
            return

        if event.button() == Qt.MouseButton.LeftButton and self._tool_active:
            self._tool_active = False
            if self._active_tool is not None:
                self._active_tool.on_release(self)
            return

        super().mouseReleaseEvent(event)

    def mouseMoveEvent(self, event: QMouseEvent) -> None:
        scene_pos = self.mapToScene(event.pos())
        col, row = self._pixel_to_cell(scene_pos.x(), scene_pos.y())
        self.cursor_moved.emit(col, row)

        # Delegate drag to active tool during a gesture
        if self._tool_active and self._active_tool is not None:
            self._active_tool.on_drag(self, col, row)

        super().mouseMoveEvent(event)
