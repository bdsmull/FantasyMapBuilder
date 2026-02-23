"""Abstract base canvas for displaying and navigating a map.

Subclasses implement ``_do_render()``, ``_pixel_to_cell()``,
``_map_pixel_size()``, and ``map_name()``.
"""
from PyQt6.QtCore import QEvent, Qt, QTimer, pyqtSignal
from PyQt6.QtGui import (
    QBrush,
    QColor,
    QImage,
    QMouseEvent,
    QPainter,
    QPixmap,
    QWheelEvent,
)
from PyQt6.QtWidgets import (
    QGraphicsPixmapItem,
    QGraphicsScene,
    QGraphicsView,
)

_ZOOM_MIN = 0.1
_ZOOM_MAX = 16.0
_ZOOM_STEP = 1.2


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

        # State
        self._show_grid: bool = True
        self._zoom_factor: float = 1.0
        self._first_show: bool = True

    # ------------------------------------------------------------------
    # Abstract interface — subclasses must implement
    # ------------------------------------------------------------------

    def _do_render(self) -> QImage:
        """Render the current map state and return a QImage."""
        raise NotImplementedError

    def _pixel_to_cell(self, px: float, py: float) -> tuple[int, int]:
        """Convert a map-pixel coordinate to a cell (col, row).

        Return (-1, -1) when the point is outside the map bounds.
        """
        raise NotImplementedError

    def _map_pixel_size(self) -> tuple[float, float]:
        """Return the full pixel (width, height) of the rendered map."""
        raise NotImplementedError

    def map_name(self) -> str:
        """Return the human-readable name of the map."""
        raise NotImplementedError

    # ------------------------------------------------------------------
    # Public methods
    # ------------------------------------------------------------------

    def refresh(self) -> None:
        """Re-render the map and update the displayed pixmap."""
        img = self._do_render()
        pixmap = QPixmap.fromImage(img)
        self._pixmap_item.setPixmap(pixmap)
        self._scene.setSceneRect(0, 0, pixmap.width(), pixmap.height())

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

    def zoom_to(self, factor: float) -> None:
        """Set an absolute zoom level, clamped to [10 %, 1600 %]."""
        factor = max(_ZOOM_MIN, min(_ZOOM_MAX, factor))
        self.resetTransform()
        self.scale(factor, factor)
        self._zoom_factor = factor
        self.zoom_changed.emit(self._zoom_factor)

    def zoom_in(self) -> None:
        self.zoom_to(self._zoom_factor * _ZOOM_STEP)

    def zoom_out(self) -> None:
        self.zoom_to(self._zoom_factor / _ZOOM_STEP)

    def zoom_factor(self) -> float:
        return self._zoom_factor

    # ------------------------------------------------------------------
    # Qt event overrides
    # ------------------------------------------------------------------

    def showEvent(self, event) -> None:
        super().showEvent(event)
        if self._first_show:
            self._first_show = False
            # Defer until the widget is fully laid out
            QTimer.singleShot(0, self.fit_in_view)

    def wheelEvent(self, event: QWheelEvent) -> None:
        if event.modifiers() & Qt.KeyboardModifier.ControlModifier:
            if event.angleDelta().y() > 0:
                self.zoom_in()
            else:
                self.zoom_out()
            event.accept()
        else:
            super().wheelEvent(event)

    def mousePressEvent(self, event: QMouseEvent) -> None:
        if event.button() == Qt.MouseButton.MiddleButton:
            self.setDragMode(QGraphicsView.DragMode.ScrollHandDrag)
            # Synthesise a left-button press so QGraphicsView starts panning
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
        super().mouseReleaseEvent(event)

    def mouseMoveEvent(self, event: QMouseEvent) -> None:
        scene_pos = self.mapToScene(event.pos())
        col, row = self._pixel_to_cell(scene_pos.x(), scene_pos.y())
        self.cursor_moved.emit(col, row)
        super().mouseMoveEvent(event)
