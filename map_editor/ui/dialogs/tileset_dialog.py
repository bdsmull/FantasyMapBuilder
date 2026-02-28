"""
TilesetDialog — manage tilesets attached to the active map.

Supports:
  - Listing tilesets with basic metadata (name, source, tile size, count)
  - Adding a new tileset from a PNG sprite sheet
  - Removing an unused tileset (blocked if any tile layer references it)
"""

from __future__ import annotations

import math
from pathlib import Path

from PyQt6.QtCore import pyqtSignal
from PyQt6.QtGui import QImage
from PyQt6.QtWidgets import (
    QDialog,
    QDialogButtonBox,
    QFileDialog,
    QFormLayout,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QMessageBox,
    QPushButton,
    QSpinBox,
    QVBoxLayout,
)

from map_editor.models.layer import TileLayer
from map_editor.models.tileset import TileCategory, TileDefinition, Tileset


class TilesetDialog(QDialog):
    """Dialog for adding and removing tilesets on a map."""

    tilesets_changed = pyqtSignal()

    def __init__(self, map_, parent=None) -> None:
        super().__init__(parent)
        self._map = map_
        self.setWindowTitle("Manage Tilesets")
        self.setMinimumSize(560, 320)
        self._build_ui()
        self._refresh_list()

    # ------------------------------------------------------------------
    # UI construction
    # ------------------------------------------------------------------

    def _build_ui(self) -> None:
        main_layout = QHBoxLayout(self)

        # Left — list
        left = QVBoxLayout()
        self._list_widget = QListWidget()
        self._list_widget.currentRowChanged.connect(self._on_selection_changed)
        left.addWidget(self._list_widget)

        btn_row = QHBoxLayout()
        self._add_btn = QPushButton("Add from PNG…")
        self._add_btn.clicked.connect(self._add_tileset)
        btn_row.addWidget(self._add_btn)

        self._remove_btn = QPushButton("Remove")
        self._remove_btn.setEnabled(False)
        self._remove_btn.clicked.connect(self._remove_tileset)
        btn_row.addWidget(self._remove_btn)

        left.addLayout(btn_row)
        main_layout.addLayout(left, 1)

        # Right — detail panel
        group = QGroupBox("Details")
        form = QFormLayout(group)

        self._lbl_name = QLabel()
        form.addRow("Name:", self._lbl_name)

        self._lbl_source = QLabel()
        self._lbl_source.setWordWrap(True)
        form.addRow("Source:", self._lbl_source)

        self._lbl_size = QLabel()
        form.addRow("Tile size:", self._lbl_size)

        self._lbl_count = QLabel()
        form.addRow("Count:", self._lbl_count)

        right = QVBoxLayout()
        right.addWidget(group)
        right.addStretch()

        close_btn = QPushButton("Close")
        close_btn.clicked.connect(self.accept)
        right.addWidget(close_btn)

        main_layout.addLayout(right, 1)

    # ------------------------------------------------------------------
    # List management
    # ------------------------------------------------------------------

    def _refresh_list(self) -> None:
        self._list_widget.clear()
        for ts in self._map.tilesets:
            item = QListWidgetItem(ts.name)
            item.setData(256, ts)  # stash tileset reference
            self._list_widget.addItem(item)
        self._update_details(None)

    def _on_selection_changed(self, row: int) -> None:
        if row < 0:
            self._update_details(None)
            self._remove_btn.setEnabled(False)
            return
        item = self._list_widget.item(row)
        ts: Tileset = item.data(256)
        self._update_details(ts)
        self._remove_btn.setEnabled(True)

    def _update_details(self, ts: Tileset | None) -> None:
        if ts is None:
            self._lbl_name.clear()
            self._lbl_source.clear()
            self._lbl_size.clear()
            self._lbl_count.clear()
        else:
            self._lbl_name.setText(ts.name)
            self._lbl_source.setText(ts.source or "(placeholder)")
            self._lbl_size.setText(f"{ts.tile_width} × {ts.tile_height} px")
            self._lbl_count.setText(str(ts.count))

    # ------------------------------------------------------------------
    # Add tileset
    # ------------------------------------------------------------------

    def _add_tileset(self) -> None:
        png_path, _ = QFileDialog.getOpenFileName(
            self, "Select Sprite Sheet", "", "PNG Images (*.png);;All Files (*)"
        )
        if not png_path:
            return

        img = QImage(png_path)
        if img.isNull():
            QMessageBox.warning(self, "Load Error", f"Could not load image:\n{png_path}")
            return

        img_w = img.width()
        img_h = img.height()

        # Ask for tileset name + tile size
        params = self._ask_tileset_params(Path(png_path).stem, img_w, img_h)
        if params is None:
            return

        name, tw, th = params
        count = (img_w // tw) * (img_h // th)
        if count == 0:
            QMessageBox.warning(
                self,
                "Invalid Size",
                f"Tile size {tw}×{th} yields 0 tiles for a {img_w}×{img_h} image.",
            )
            return

        columns = min(8, img_w // tw)

        tiles: list[TileDefinition] = []
        for zero_id in range(count):
            tile_id = zero_id + 1
            tiles.append(TileDefinition(
                id=tile_id,
                name=f"Tile {tile_id}",
                color=(200, 200, 200),
                category=TileCategory.TERRAIN,
                sheet_col=zero_id % columns,
                sheet_row=zero_id // columns,
            ))

        tileset = Tileset(
            name=name,
            source=str(Path(png_path).resolve()),
            tile_width=tw,
            tile_height=th,
            tiles=tiles,
            first_gid=1,  # add_tileset() will fix this
        )
        self._map.add_tileset(tileset)
        self._refresh_list()
        self.tilesets_changed.emit()

    def _ask_tileset_params(
        self, default_name: str, img_w: int, img_h: int
    ) -> tuple[str, int, int] | None:
        """Show a small dialog to collect name and tile dimensions."""
        dlg = QDialog(self)
        dlg.setWindowTitle("Tileset Parameters")
        layout = QFormLayout(dlg)

        name_edit = QLineEdit(default_name)
        layout.addRow("Tileset name:", name_edit)

        tw_spin = QSpinBox()
        tw_spin.setRange(1, img_w)
        tw_spin.setValue(32)
        layout.addRow("Tile width (px):", tw_spin)

        th_spin = QSpinBox()
        th_spin.setRange(1, img_h)
        th_spin.setValue(32)
        layout.addRow("Tile height (px):", th_spin)

        buttons = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel
        )
        buttons.accepted.connect(dlg.accept)
        buttons.rejected.connect(dlg.reject)
        layout.addRow(buttons)

        if dlg.exec() != QDialog.DialogCode.Accepted:
            return None

        name = name_edit.text().strip() or default_name
        return name, tw_spin.value(), th_spin.value()

    # ------------------------------------------------------------------
    # Remove tileset
    # ------------------------------------------------------------------

    def _remove_tileset(self) -> None:
        row = self._list_widget.currentRow()
        if row < 0:
            return
        item = self._list_widget.item(row)
        ts: Tileset = item.data(256)

        # Check if any tile layer uses a GID in this tileset's range
        gid_start = ts.first_gid
        gid_end = ts.first_gid + ts.count  # exclusive

        for layer in self._map.layers:
            if not isinstance(layer, TileLayer):
                continue
            for r in range(layer.height):
                for c in range(layer.width):
                    gid = layer.get_tile(c, r)
                    if gid_start <= gid < gid_end:
                        QMessageBox.warning(
                            self,
                            "Tileset In Use",
                            f'Tileset "{ts.name}" is referenced by layer '
                            f'"{layer.name}" and cannot be removed.',
                        )
                        return

        self._map.tilesets.remove(ts)

        # Recompute first_gid for remaining tilesets
        next_gid = 1
        for remaining_ts in self._map.tilesets:
            remaining_ts.first_gid = next_gid
            next_gid += remaining_ts.count

        self._refresh_list()
        self.tilesets_changed.emit()
