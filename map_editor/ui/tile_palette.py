"""Tile palette widget — shows a tileset sprite sheet for tile selection."""
from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QColor, QImage, QPainter, QPen
from PyQt6.QtWidgets import QWidget

from map_editor.models.tileset import Tileset


class TilePaletteWidget(QWidget):
    """Displays a tileset's sprite sheet and lets the user select a tile.

    Emits ``tile_selected(gid: int)`` when a tile is clicked.
    """

    tile_selected = pyqtSignal(int)  # emits the global tile GID

    def __init__(self, parent=None) -> None:
        super().__init__(parent)
        self._tileset: Tileset | None = None
        self._sheet_image: QImage | None = None
        self._selected_gid: int = 0
        self.setMinimumHeight(100)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def set_tileset(self, tileset: Tileset, sheet_image: QImage) -> None:
        """Update the displayed tileset and sprite sheet."""
        self._tileset = tileset
        self._sheet_image = sheet_image
        self._selected_gid = tileset.first_gid
        self.update()
        self.tile_selected.emit(tileset.first_gid)

    def selected_gid(self) -> int:
        """Return the currently selected global tile ID."""
        return self._selected_gid

    # ------------------------------------------------------------------
    # Qt events
    # ------------------------------------------------------------------

    def paintEvent(self, event) -> None:
        if self._tileset is None or self._sheet_image is None:
            return
        if self._sheet_image.isNull() or self._sheet_image.width() == 0:
            return

        painter = QPainter(self)
        scale = self.width() / self._sheet_image.width()
        display_h = int(self._sheet_image.height() * scale)

        # Draw the sprite sheet scaled to widget width
        from PyQt6.QtCore import QRect
        painter.drawImage(QRect(0, 0, self.width(), display_h), self._sheet_image)

        # Draw selection highlight
        if self._selected_gid > 0:
            local_id = self._selected_gid - self._tileset.first_gid + 1
            tile_def = self._tileset.tile_by_id(local_id)
            if tile_def is not None:
                scaled_tw = int(self._tileset.tile_width * scale)
                scaled_th = int(self._tileset.tile_height * scale)
                if scaled_tw > 0 and scaled_th > 0:
                    x = tile_def.sheet_col * scaled_tw
                    y = tile_def.sheet_row * scaled_th
                    painter.setPen(QPen(QColor(255, 220, 0), 2))
                    painter.drawRect(x, y, scaled_tw - 1, scaled_th - 1)

        painter.end()
        self.setMinimumHeight(display_h)

    def mousePressEvent(self, event) -> None:
        if self._tileset is None or self._sheet_image is None:
            return
        if self._sheet_image.isNull() or self._sheet_image.width() == 0:
            return

        scale = self.width() / self._sheet_image.width()
        scaled_tw = int(self._tileset.tile_width * scale)
        scaled_th = int(self._tileset.tile_height * scale)
        if scaled_tw == 0 or scaled_th == 0:
            return

        click_col = event.pos().x() // scaled_tw
        click_row = event.pos().y() // scaled_th
        tile_idx = click_row * self._tileset.columns + click_col
        if tile_idx >= self._tileset.count:
            return

        gid = self._tileset.first_gid + tile_idx
        self._selected_gid = gid
        self.update()
        self.tile_selected.emit(gid)
