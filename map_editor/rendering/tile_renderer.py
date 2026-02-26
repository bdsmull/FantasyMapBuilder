"""
TileRenderer — QPainter-based renderer for square-grid TileMaps.

Returns a QImage so the renderer is headless (no display / QApplication required).
The canvas layer (Phase 3) converts to QPixmap via QPixmap.fromImage() for display.

Rendering pipeline per call to render():
  1. Allocate QImage, fill with dark background.
  2. For each visible layer (bottom → top):
       TileLayer  → _draw_tile_layer
       ObjectLayer → _draw_object_layer
  3. Draw grid lines (optional).
"""

from __future__ import annotations

import math
import os
from typing import Optional

from PyQt6.QtCore import QPoint, QRect, QRectF
from PyQt6.QtGui import (
    QBrush,
    QColor,
    QFont,
    QImage,
    QPainter,
    QPen,
    QPolygonF,
)
from PyQt6.QtCore import QPointF

from map_editor.models.layer import Layer, ObjectLayer, TileLayer
from map_editor.models.map_object import MapObject, ObjectShape
from map_editor.models.tile_map import TileMap
from map_editor.models.tileset import Tileset


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_BACKGROUND = QColor(20, 20, 20)
_GRID_COLOR = QColor(0, 0, 0, 70)          # semi-transparent black
_GRID_PEN_WIDTH = 1

# Accent colours keyed by object_type string (case-insensitive lookup)
_OBJECT_TYPE_COLORS: dict[str, QColor] = {
    "npc":     QColor(255, 220,  50),
    "enemy":   QColor(255,  80,  80),
    "chest":   QColor(200, 160,  40),
    "door":    QColor(150, 110,  60),
    "trigger": QColor( 80, 200, 255),
    "spawn":   QColor(255, 100, 200),
    "exit":    QColor(100, 255, 150),
}
_OBJECT_DEFAULT_COLOR = QColor(220, 220, 220)


def _object_color(obj: MapObject) -> QColor:
    return _OBJECT_TYPE_COLORS.get(obj.object_type.lower(), _OBJECT_DEFAULT_COLOR)


# ---------------------------------------------------------------------------
# TileRenderer
# ---------------------------------------------------------------------------

class TileRenderer:
    """
    Renders a TileMap to a QImage.

    Instances are inexpensive to create; the only internal state is the
    sprite-sheet image cache.  Call invalidate_cache() after swapping tilesets.
    """

    def __init__(self) -> None:
        # Maps tileset source path → QImage (None if load failed)
        self._sheet_cache: dict[str, Optional[QImage]] = {}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def render(
        self,
        tile_map: TileMap,
        layers: Optional[list[Layer]] = None,
        *,
        show_grid: bool = True,
    ) -> QImage:
        """
        Render *tile_map* to a QImage.

        Parameters
        ----------
        tile_map:   The map to render.
        layers:     Layers to include; defaults to tile_map.layers (all).
        show_grid:  Whether to draw tile-boundary grid lines.
        """
        image = QImage(
            tile_map.pixel_width,
            tile_map.pixel_height,
            QImage.Format.Format_ARGB32_Premultiplied,
        )
        image.fill(_BACKGROUND)

        painter = QPainter(image)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing, False)

        for layer in (layers if layers is not None else tile_map.layers):
            if not layer.visible:
                continue
            painter.setOpacity(layer.opacity)
            if isinstance(layer, TileLayer):
                self._draw_tile_layer(painter, tile_map, layer)
            elif isinstance(layer, ObjectLayer):
                self._draw_object_layer(painter, tile_map, layer)

        painter.setOpacity(1.0)
        if show_grid:
            self._draw_grid(painter, tile_map)

        painter.end()
        return image

    def render_clipped(
        self,
        tile_map: TileMap,
        clip_rect: QRectF,
        layers: Optional[list[Layer]] = None,
        *,
        show_grid: bool = True,
    ) -> tuple[QImage, float, float]:
        """
        Render only the portion of *tile_map* that intersects *clip_rect*.

        Returns
        -------
        (image, origin_x, origin_y)
            *image* covers the visible tile region; *origin_x/y* is the
            scene-space position of the image's top-left corner so the
            caller can position the pixmap item correctly.
        """
        tw = tile_map.tile_width
        th = tile_map.tile_height

        # Visible tile range with a 1-tile margin on each side
        col_start = max(0, int(clip_rect.left() / tw) - 1)
        row_start = max(0, int(clip_rect.top() / th) - 1)
        col_end = min(tile_map.width, math.ceil(clip_rect.right() / tw) + 1)
        row_end = min(tile_map.height, math.ceil(clip_rect.bottom() / th) + 1)

        if col_end <= col_start or row_end <= row_start:
            img = QImage(1, 1, QImage.Format.Format_ARGB32_Premultiplied)
            img.fill(_BACKGROUND)
            return img, 0.0, 0.0

        origin_x = float(col_start * tw)
        origin_y = float(row_start * th)
        img_w = (col_end - col_start) * tw
        img_h = (row_end - row_start) * th

        image = QImage(img_w, img_h, QImage.Format.Format_ARGB32_Premultiplied)
        image.fill(_BACKGROUND)

        painter = QPainter(image)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing, False)
        # Translate so scene-space coordinates map into the smaller image
        painter.translate(-origin_x, -origin_y)

        for layer in (layers if layers is not None else tile_map.layers):
            if not layer.visible:
                continue
            painter.setOpacity(layer.opacity)
            if isinstance(layer, TileLayer):
                self._draw_tile_layer(
                    painter, tile_map, layer,
                    col_start, row_start, col_end, row_end,
                )
            elif isinstance(layer, ObjectLayer):
                self._draw_object_layer(painter, tile_map, layer)

        painter.setOpacity(1.0)
        if show_grid:
            self._draw_grid(
                painter, tile_map,
                col_start, row_start, col_end, row_end,
            )

        painter.end()
        return image, origin_x, origin_y

    def invalidate_cache(self) -> None:
        """Discard cached sprite-sheet images (call after a tileset is reloaded)."""
        self._sheet_cache.clear()

    # ------------------------------------------------------------------
    # Layer drawing
    # ------------------------------------------------------------------

    def _draw_tile_layer(
        self,
        painter: QPainter,
        tile_map: TileMap,
        layer: TileLayer,
        col_start: int = 0,
        row_start: int = 0,
        col_end: Optional[int] = None,
        row_end: Optional[int] = None,
    ) -> None:
        if col_end is None:
            col_end = layer.width
        if row_end is None:
            row_end = layer.height
        tw = tile_map.tile_width
        th = tile_map.tile_height

        for row in range(row_start, row_end):
            for col in range(col_start, col_end):
                tile_id = layer.get_tile(col, row)
                if tile_id == 0:
                    continue

                # Resolve tileset and tile definition
                tileset = tile_map.tileset_for_gid(tile_id)
                if tileset is None:
                    continue
                local_id = tile_map.local_id(tile_id)
                tile_def = tileset.tile_by_id(local_id)
                if tile_def is None:
                    continue

                x, y = tile_map.tile_to_pixel(col, row)

                sheet = self._get_sheet(tileset)
                if sheet is not None:
                    # Draw from sprite sheet
                    src_x = tile_def.sheet_col * tileset.tile_width
                    src_y = tile_def.sheet_row * tileset.tile_height
                    painter.drawImage(
                        QRect(x, y, tw, th),
                        sheet,
                        QRect(src_x, src_y, tileset.tile_width, tileset.tile_height),
                    )
                else:
                    # Placeholder: solid colour rectangle
                    painter.fillRect(x, y, tw, th, QColor(*tile_def.color))

    def _draw_object_layer(
        self, painter: QPainter, tile_map: TileMap, layer: ObjectLayer
    ) -> None:
        tw = tile_map.tile_width
        th = tile_map.tile_height
        for obj in layer.objects:
            if obj.visible:
                self._draw_object_marker(painter, obj, tw, th)

    def _draw_object_marker(
        self, painter: QPainter, obj: MapObject, tile_w: int, tile_h: int
    ) -> None:
        color = _object_color(obj)
        pen = QPen(color)
        pen.setWidth(2)
        painter.setPen(pen)

        if obj.shape == ObjectShape.POINT or (obj.width == 0 and obj.height == 0):
            # Filled circle centred on the object's position
            r = max(4, tile_w // 4)
            cx, cy = int(obj.x), int(obj.y)
            painter.setBrush(QBrush(color))
            painter.drawEllipse(cx - r, cy - r, r * 2, r * 2)
            _draw_label(painter, obj.name[:1], cx, cy)

        elif obj.shape == ObjectShape.RECTANGLE:
            painter.setBrush(QBrush(QColor(color.red(), color.green(), color.blue(), 60)))
            painter.drawRect(int(obj.x), int(obj.y), int(obj.width), int(obj.height))
            cx = int(obj.x + obj.width / 2)
            cy = int(obj.y + obj.height / 2)
            _draw_label(painter, obj.name[:1], cx, cy)

        elif obj.shape == ObjectShape.ELLIPSE:
            painter.setBrush(QBrush(QColor(color.red(), color.green(), color.blue(), 60)))
            painter.drawEllipse(int(obj.x), int(obj.y), int(obj.width), int(obj.height))

        elif obj.shape == ObjectShape.POLYGON and obj.polygon:
            pts = [QPointF(obj.x + dx, obj.y + dy) for dx, dy in obj.polygon]
            painter.setBrush(QBrush(QColor(color.red(), color.green(), color.blue(), 60)))
            painter.drawPolygon(QPolygonF(pts))

        elif obj.shape == ObjectShape.TILE:
            # Small filled square at the object's position
            s = max(6, tile_w // 3)
            painter.setBrush(QBrush(color))
            painter.drawRect(int(obj.x), int(obj.y), s, s)
            _draw_label(painter, obj.name[:1], int(obj.x + s // 2), int(obj.y + s // 2))

        painter.setBrush(QBrush())  # reset brush

    # ------------------------------------------------------------------
    # Grid
    # ------------------------------------------------------------------

    def _draw_grid(
        self,
        painter: QPainter,
        tile_map: TileMap,
        col_start: int = 0,
        row_start: int = 0,
        col_end: Optional[int] = None,
        row_end: Optional[int] = None,
    ) -> None:
        if col_end is None:
            col_end = tile_map.width
        if row_end is None:
            row_end = tile_map.height
        pen = QPen(_GRID_COLOR)
        pen.setWidth(_GRID_PEN_WIDTH)
        painter.setPen(pen)

        tw = tile_map.tile_width
        th = tile_map.tile_height
        x0 = col_start * tw
        y0 = row_start * th
        x1 = col_end * tw
        y1 = row_end * th

        for col in range(col_start, col_end + 1):
            x = col * tw
            painter.drawLine(x, y0, x, y1)

        for row in range(row_start, row_end + 1):
            y = row * th
            painter.drawLine(x0, y, x1, y)

    # ------------------------------------------------------------------
    # Sprite-sheet cache
    # ------------------------------------------------------------------

    def _get_sheet(self, tileset: Tileset) -> Optional[QImage]:
        """Load and cache the tileset sprite sheet; returns None on failure."""
        source = tileset.source
        if not source:
            return None
        if source not in self._sheet_cache:
            if os.path.isfile(source):
                img = QImage(source)
                self._sheet_cache[source] = img if not img.isNull() else None
            else:
                self._sheet_cache[source] = None
        return self._sheet_cache[source]


# ---------------------------------------------------------------------------
# Shared helper
# ---------------------------------------------------------------------------

def _draw_label(painter: QPainter, text: str, cx: int, cy: int) -> None:
    """Draw a single character centred at (cx, cy) with a dark drop-shadow."""
    font = QFont()
    font.setPixelSize(10)
    font.setBold(True)
    painter.setFont(font)
    fm = painter.fontMetrics()
    w = fm.horizontalAdvance(text)
    h = fm.height()
    x = cx - w // 2
    y = cy + h // 4
    painter.setPen(QPen(QColor(0, 0, 0, 180)))
    painter.drawText(x + 1, y + 1, text)
    painter.setPen(QPen(QColor(255, 255, 255, 220)))
    painter.drawText(x, y, text)
