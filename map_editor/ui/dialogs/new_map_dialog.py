"""Dialog for creating a new tile map or hex map."""
from pathlib import Path

from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import (
    QButtonGroup,
    QComboBox,
    QDialog,
    QDialogButtonBox,
    QDoubleSpinBox,
    QFormLayout,
    QGroupBox,
    QHBoxLayout,
    QLineEdit,
    QRadioButton,
    QSpinBox,
    QStackedWidget,
    QVBoxLayout,
    QWidget,
)

from map_editor.models.hex_map import HexMap, HexOrientation
from map_editor.models.tile_map import TileMap


class NewMapDialog(QDialog):
    """Dialog for creating a new tile map or hex map.

    Usage::

        dlg = NewMapDialog(parent, initial_type="tile")
        if dlg.exec() == QDialog.DialogCode.Accepted:
            new_map = dlg.create_map(placeholder_dir)
    """

    def __init__(self, parent=None, initial_type: str = "tile") -> None:
        super().__init__(parent)
        self.setWindowTitle("New Map")
        self.setMinimumWidth(380)
        self._build_ui()
        if initial_type == "hex":
            self._hex_radio.setChecked(True)
            self._stack.setCurrentIndex(1)
        else:
            self._tile_radio.setChecked(True)
            self._stack.setCurrentIndex(0)
        self._validate()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def map_type(self) -> str:
        """Return ``"tile"`` or ``"hex"``."""
        return "hex" if self._hex_radio.isChecked() else "tile"

    def create_map(self, placeholder_dir: Path) -> "TileMap | HexMap":
        """Create and return the map described by the current field values."""
        placeholder_dir = Path(placeholder_dir)
        if self.map_type() == "tile":
            tile_size = int(self._tile_size_combo.currentText())
            return TileMap.create_new(
                name=self._tile_name.text().strip(),
                width=self._tile_width.value(),
                height=self._tile_height.value(),
                tile_width=tile_size,
                tile_height=tile_size,
                placeholder_dir=placeholder_dir,
            )
        orientation = (
            HexOrientation.POINTY_TOP
            if self._hex_orient_combo.currentIndex() == 1
            else HexOrientation.FLAT_TOP
        )
        return HexMap.create_new(
            name=self._hex_name.text().strip(),
            cols=self._hex_cols.value(),
            rows=self._hex_rows.value(),
            hex_size=self._hex_size.value(),
            orientation=orientation,
            placeholder_dir=placeholder_dir,
        )

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _build_ui(self) -> None:
        root = QVBoxLayout(self)

        # Map type selector
        type_box = QGroupBox("Map Type")
        type_layout = QHBoxLayout(type_box)
        self._tile_radio = QRadioButton("Tile Map")
        self._hex_radio = QRadioButton("Hex Map")
        self._type_group = QButtonGroup(self)
        self._type_group.addButton(self._tile_radio, 0)
        self._type_group.addButton(self._hex_radio, 1)
        type_layout.addWidget(self._tile_radio)
        type_layout.addWidget(self._hex_radio)
        root.addWidget(type_box)

        # Settings pages
        self._stack = QStackedWidget()
        self._stack.addWidget(self._build_tile_page())
        self._stack.addWidget(self._build_hex_page())
        root.addWidget(self._stack)

        # OK / Cancel
        self._buttons = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Ok
            | QDialogButtonBox.StandardButton.Cancel
        )
        self._buttons.accepted.connect(self.accept)
        self._buttons.rejected.connect(self.reject)
        root.addWidget(self._buttons)

        # Connections
        self._tile_radio.toggled.connect(self._on_type_toggled)
        self._tile_name.textChanged.connect(self._validate)
        self._hex_name.textChanged.connect(self._validate)

    def _build_tile_page(self) -> QWidget:
        page = QWidget()
        form = QFormLayout(page)

        self._tile_name = QLineEdit("New Tile Map")
        form.addRow("Name:", self._tile_name)

        self._tile_width = QSpinBox()
        self._tile_width.setRange(1, 500)
        self._tile_width.setValue(20)
        form.addRow("Width (tiles):", self._tile_width)

        self._tile_height = QSpinBox()
        self._tile_height.setRange(1, 500)
        self._tile_height.setValue(15)
        form.addRow("Height (tiles):", self._tile_height)

        self._tile_size_combo = QComboBox()
        self._tile_size_combo.addItems(["16", "32", "64"])
        self._tile_size_combo.setCurrentText("32")
        form.addRow("Tile Size (px):", self._tile_size_combo)

        return page

    def _build_hex_page(self) -> QWidget:
        page = QWidget()
        form = QFormLayout(page)

        self._hex_name = QLineEdit("New Hex Map")
        form.addRow("Name:", self._hex_name)

        self._hex_cols = QSpinBox()
        self._hex_cols.setRange(1, 200)
        self._hex_cols.setValue(12)
        form.addRow("Columns:", self._hex_cols)

        self._hex_rows = QSpinBox()
        self._hex_rows.setRange(1, 200)
        self._hex_rows.setValue(10)
        form.addRow("Rows:", self._hex_rows)

        self._hex_size = QDoubleSpinBox()
        self._hex_size.setRange(20.0, 200.0)
        self._hex_size.setSingleStep(5.0)
        self._hex_size.setValue(40.0)
        form.addRow("Hex Size (px):", self._hex_size)

        self._hex_orient_combo = QComboBox()
        self._hex_orient_combo.addItems(["Flat-top", "Pointy-top"])
        form.addRow("Orientation:", self._hex_orient_combo)

        return page

    def _on_type_toggled(self, _checked: bool) -> None:
        self._stack.setCurrentIndex(0 if self._tile_radio.isChecked() else 1)
        self._validate()

    def _validate(self) -> None:
        name = (
            self._tile_name.text().strip()
            if self.map_type() == "tile"
            else self._hex_name.text().strip()
        )
        ok_btn = self._buttons.button(QDialogButtonBox.StandardButton.Ok)
        if ok_btn:
            ok_btn.setEnabled(bool(name))
