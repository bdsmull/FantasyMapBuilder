"""Layer panel widget — lists map layers with selection and visibility toggle."""
from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtWidgets import QListWidget, QListWidgetItem

from map_editor.models.layer import Layer, ObjectLayer, TileLayer


class LayerPanelWidget(QListWidget):
    """Shows all layers in a map, top-first, with checkboxes for visibility.

    Signals:
        layer_selected(object):              emitted when the user clicks a layer
        layer_visibility_changed(object, bool): emitted when a checkbox is toggled
    """

    layer_selected = pyqtSignal(object)               # Layer
    layer_visibility_changed = pyqtSignal(object, bool)  # (Layer, visible)

    def __init__(self, parent=None) -> None:
        super().__init__(parent)
        self._suppress_signals: bool = False
        self.itemClicked.connect(self._on_item_clicked)
        self.itemChanged.connect(self._on_item_changed)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def set_map(self, map_) -> None:
        """Populate the panel from a TileMap or HexMap (or clear if None)."""
        self._suppress_signals = True
        self.clear()

        if map_ is None:
            self._suppress_signals = False
            return

        # Display layers top→bottom (reversed storage order)
        for layer in reversed(map_.layers):
            item = QListWidgetItem(layer.name)
            item.setFlags(
                item.flags()
                | Qt.ItemFlag.ItemIsUserCheckable
                | Qt.ItemFlag.ItemIsSelectable
                | Qt.ItemFlag.ItemIsEnabled
            )
            item.setCheckState(
                Qt.CheckState.Checked if layer.visible else Qt.CheckState.Unchecked
            )
            item.setData(Qt.ItemDataRole.UserRole, layer)
            self.addItem(item)

        self._suppress_signals = False

        # Auto-select the first TileLayer
        for i in range(self.count()):
            item = self.item(i)
            if isinstance(item.data(Qt.ItemDataRole.UserRole), TileLayer):
                self.setCurrentItem(item)
                self.layer_selected.emit(item.data(Qt.ItemDataRole.UserRole))
                break

    # ------------------------------------------------------------------
    # Slots
    # ------------------------------------------------------------------

    def _on_item_clicked(self, item: QListWidgetItem) -> None:
        if self._suppress_signals:
            return
        layer = item.data(Qt.ItemDataRole.UserRole)
        self.layer_selected.emit(layer)

    def _on_item_changed(self, item: QListWidgetItem) -> None:
        if self._suppress_signals:
            return
        layer = item.data(Qt.ItemDataRole.UserRole)
        visible = item.checkState() == Qt.CheckState.Checked
        self.layer_visibility_changed.emit(layer, visible)
