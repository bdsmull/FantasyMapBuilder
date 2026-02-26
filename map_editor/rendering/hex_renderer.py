"""
HexRenderer — QPainter-based renderer for hex-grid HexMaps.

Returns a QImage (headless, no display required).
The canvas (Phase 3) converts to QPixmap via QPixmap.fromImage() for display.

Hex shapes are drawn as QPolygonF with anti-aliasing enabled so the angled
edges look smooth at any zoom level.

Grid mode: when show_grid=True, each hex polygon outline is drawn with a
semi-transparent pen (no fill), producing a clean shared-edge grid without
double-drawing.
"""

from __future__ import annotations

import math
import os
from typing import Optional

from PyQt6.QtCore import QPointF, QRect, QRectF
from PyQt6.QtGui import (
    QBrush,
    QColor,
    QFont,
    QImage,
    QPainter,
    QPainterPath,
    QPen,
    QPolygonF,
)

from map_editor.models.hex_map import HexMap
from map_editor.models.layer import Layer, ObjectLayer, TileLayer
from map_editor.models.map_object import MapObject, ObjectShape
from map_editor.models.tileset import Tileset
from map_editor.rendering.tile_renderer import _draw_label, _object_color


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_BACKGROUND = QColor(20, 20, 20)
_GRID_COLOR = QColor(0, 0, 0, 90)   # slightly stronger than tile grid (shared edges)
_GRID_PEN_WIDTH = 1


# ---------------------------------------------------------------------------
# HexRenderer
# ---------------------------------------------------------------------------

class HexRenderer:
    """
    Renders a HexMap to a QImage.

    Antialiasing is enabled for smooth hex polygon edges.
    Sprite-sheet images are cached by source path; call invalidate_cache()
    after a tileset is swapped.
    """

    def __init__(self) -> None:
        self._sheet_cache: dict[str, Optional[QImage]] = {}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def render(
        self,
        hex_map: HexMap,
        layers: Optional[list[Layer]] = None,
        *,
        show_grid: bool = True,
    ) -> QImage:
        """
        Render *hex_map* to a QImage.

        Parameters
        ----------
        hex_map:    The map to render.
        layers:     Layers to include; defaults to hex_map.layers (all).
        show_grid:  Whether to draw hex-boundary grid lines.
        """
        img_w = math.ceil(hex_map.pixel_width)
        img_h = math.ceil(hex_map.pixel_height)

        image = QImage(img_w, img_h, QImage.Format.Format_ARGB32_Premultiplied)
        image.fill(_BACKGROUND)

        painter = QPainter(image)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing, True)

        for layer in (layers if layers is not None else hex_map.layers):
            if not layer.visible:
                continue
            painter.setOpacity(layer.opacity)
            if isinstance(layer, TileLayer):
                self._draw_tile_layer(painter, hex_map, layer)
            elif isinstance(layer, ObjectLayer):
                self._draw_object_layer(painter, hex_map, layer)

        painter.setOpacity(1.0)
        if show_grid:
            self._draw_grid(painter, hex_map)

        painter.end()
        return image

    def invalidate_cache(self) -> None:
        """Discard cached sprite-sheet images."""
        self._sheet_cache.clear()

    def render_clipped(
        self,
        hex_map: HexMap,
        clip_rect: QRectF,
        layers=None,
        *,
        show_grid: bool = True,
    ) -> tuple[QImage, float, float]:
        """
        Render only the portion of *hex_map* that intersects *clip_rect*.

        Returns
        -------
        (image, origin_x, origin_y)
            *image* covers the visible hex region; *origin_x/y* is the
            scene-space position of the image's top-left corner.
        """
        hw, hh = hex_map.hex_pixel_size()
        map_w = math.ceil(hex_map.pixel_width)
        map_h = math.ceil(hex_map.pixel_height)

        # Extend clip region by 2 hex cells on each side to avoid edge clipping
        pad_x = hw * 2.0
        pad_y = hh * 2.0
        origin_x = max(0.0, clip_rect.left() - pad_x)
        origin_y = max(0.0, clip_rect.top() - pad_y)
        end_x = min(float(map_w), clip_rect.right() + pad_x)
        end_y = min(float(map_h), clip_rect.bottom() + pad_y)

        if end_x <= origin_x or end_y <= origin_y:
            img = QImage(1, 1, QImage.Format.Format_ARGB32_Premultiplied)
            img.fill(_BACKGROUND)
            return img, 0.0, 0.0

        img_w = math.ceil(end_x - origin_x)
        img_h = math.ceil(end_y - origin_y)

        # Approximate cell range covering the padded region (with extra margin)
        col_start = max(0, int(origin_x / hw) - 1)
        row_start = max(0, int(origin_y / hh) - 1)
        col_end = min(hex_map.cols, math.ceil(end_x / hw) + 1)
        row_end = min(hex_map.rows, math.ceil(end_y / hh) + 1)

        image = QImage(img_w, img_h, QImage.Format.Format_ARGB32_Premultiplied)
        image.fill(_BACKGROUND)

        painter = QPainter(image)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing, True)
        # Translate so scene-space coordinates map into the smaller image
        painter.translate(-origin_x, -origin_y)

        for layer in (layers if layers is not None else hex_map.layers):
            if not layer.visible:
                continue
            painter.setOpacity(layer.opacity)
            if isinstance(layer, TileLayer):
                self._draw_tile_layer(
                    painter, hex_map, layer,
                    col_start, row_start, col_end, row_end,
                )
            elif isinstance(layer, ObjectLayer):
                self._draw_object_layer(painter, hex_map, layer)

        painter.setOpacity(1.0)
        if show_grid:
            self._draw_grid(
                painter, hex_map,
                col_start, row_start, col_end, row_end,
            )

        painter.end()
        return image, origin_x, origin_y

    # ------------------------------------------------------------------
    # Layer drawing
    # ------------------------------------------------------------------

    def _draw_tile_layer(
        self,
        painter: QPainter,
        hex_map: HexMap,
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
        for row in range(row_start, row_end):
            for col in range(col_start, col_end):
                tile_id = layer.get_tile(col, row)
                if tile_id == 0:
                    continue

                tileset = hex_map.tileset_for_gid(tile_id)
                if tileset is None:
                    continue
                local_id = hex_map.local_id(tile_id)
                tile_def = tileset.tile_by_id(local_id)
                if tile_def is None:
                    continue

                polygon = _hex_polygon(hex_map, col, row)

                sheet = self._get_sheet(tileset)
                if sheet is not None:
                    # Draw the sprite-sheet tile scaled to the hex bounding box,
                    # then clip to the hex polygon so only the hex shape shows.
                    hw, hh = hex_map.hex_pixel_size()
                    cx, cy = hex_map.hex_center(col, row)
                    dest_x = int(cx - hw / 2)
                    dest_y = int(cy - hh / 2)
                    dest_w = math.ceil(hw)
                    dest_h = math.ceil(hh)
                    src_x = tile_def.sheet_col * tileset.tile_width
                    src_y = tile_def.sheet_row * tileset.tile_height
                    clip_path = QPainterPath()
                    clip_path.addPolygon(polygon)
                    painter.save()
                    painter.setClipPath(clip_path)
                    painter.drawImage(
                        QRect(dest_x, dest_y, dest_w, dest_h),
                        sheet,
                        QRect(src_x, src_y, tileset.tile_width, tileset.tile_height),
                    )
                    painter.restore()
                else:
                    # Placeholder: solid colour hex fill, no outline
                    painter.setBrush(QBrush(QColor(*tile_def.color)))
                    painter.setPen(QPen(QColor(0, 0, 0, 0)))  # no pen
                    painter.drawPolygon(polygon)

    def _draw_object_layer(
        self, painter: QPainter, hex_map: HexMap, layer: ObjectLayer
    ) -> None:
        hw, hh = hex_map.hex_pixel_size()
        tile_w = int(hw)
        tile_h = int(hh)
        for obj in layer.objects:
            if obj.visible:
                self._draw_object_marker(painter, obj, tile_w, tile_h)

    def _draw_object_marker(
        self, painter: QPainter, obj: MapObject, tile_w: int, tile_h: int
    ) -> None:
        """Delegates to the same marker logic as TileRenderer."""
        color = _object_color(obj)
        pen = QPen(color)
        pen.setWidth(2)
        painter.setPen(pen)

        if obj.shape == ObjectShape.POINT or (obj.width == 0 and obj.height == 0):
            r = max(4, tile_w // 5)
            cx, cy = int(obj.x), int(obj.y)
            painter.setBrush(QBrush(color))
            painter.drawEllipse(cx - r, cy - r, r * 2, r * 2)
            _draw_label(painter, obj.name[:1], cx, cy)

        elif obj.shape == ObjectShape.RECTANGLE:
            painter.setBrush(QBrush(QColor(color.red(), color.green(), color.blue(), 60)))
            painter.drawRect(int(obj.x), int(obj.y), int(obj.width), int(obj.height))

        painter.setBrush(QBrush())

    # ------------------------------------------------------------------
    # Grid
    # ------------------------------------------------------------------

    def _draw_grid(
        self,
        painter: QPainter,
        hex_map: HexMap,
        col_start: int = 0,
        row_start: int = 0,
        col_end: Optional[int] = None,
        row_end: Optional[int] = None,
    ) -> None:
        if col_end is None:
            col_end = hex_map.cols
        if row_end is None:
            row_end = hex_map.rows
        pen = QPen(_GRID_COLOR)
        pen.setWidth(_GRID_PEN_WIDTH)
        painter.setPen(pen)
        painter.setBrush(QBrush())  # transparent fill

        for row in range(row_start, row_end):
            for col in range(col_start, col_end):
                painter.drawPolygon(_hex_polygon(hex_map, col, row))

    # ------------------------------------------------------------------
    # Sprite-sheet cache
    # ------------------------------------------------------------------

    def _get_sheet(self, tileset: Tileset) -> Optional[QImage]:
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
# Helper
# ---------------------------------------------------------------------------

def _hex_polygon(hex_map: HexMap, col: int, row: int) -> QPolygonF:
    """Build a QPolygonF for the hex at offset (col, row)."""
    corners = hex_map.hex_corners(col, row)
    return QPolygonF([QPointF(x, y) for x, y in corners])
