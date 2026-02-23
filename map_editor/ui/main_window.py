"""Main application window."""
from pathlib import Path

from PyQt6.QtCore import Qt
from PyQt6.QtGui import QAction, QBrush, QColor
from PyQt6.QtWidgets import (
    QApplication,
    QDialog,
    QDockWidget,
    QLabel,
    QMainWindow,
    QMdiArea,
    QMessageBox,
)

from map_editor.ui.dialogs.new_map_dialog import NewMapDialog
from map_editor.ui.hex_canvas import HexCanvas
from map_editor.ui.map_canvas import MapCanvas
from map_editor.ui.tile_canvas import TileCanvas

# Placeholder assets live next to the map_editor package:
#   map_editor/ui/main_window.py  → parents[1] = map_editor/ → assets/placeholders/
_PLACEHOLDER_DIR = Path(__file__).parents[1] / "assets" / "placeholders"


class MainWindow(QMainWindow):
    """Top-level window for the Fantasy RPG Map Editor."""

    def __init__(self, parent=None) -> None:
        super().__init__(parent)
        self.setWindowTitle("Fantasy RPG Map Editor")

        self._build_mdi()
        self._build_docks()
        self._build_menu()
        self._build_status_bar()

        self._mdi.subWindowActivated.connect(self._on_sub_window_activated)

    # ------------------------------------------------------------------
    # Widget construction
    # ------------------------------------------------------------------

    def _build_mdi(self) -> None:
        self._mdi = QMdiArea()
        self._mdi.setBackground(QBrush(QColor(30, 30, 30)))
        self.setCentralWidget(self._mdi)

    def _build_docks(self) -> None:
        # Left dock — Layers panel (Phase 4 stub)
        layers_label = QLabel("Layer panel\n(available in Phase 4)")
        layers_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layers_label.setStyleSheet("color: #888;")
        layers_dock = QDockWidget("Layers", self)
        layers_dock.setWidget(layers_label)
        layers_dock.setMinimumWidth(180)
        layers_dock.setFeatures(
            QDockWidget.DockWidgetFeature.DockWidgetMovable
            | QDockWidget.DockWidgetFeature.DockWidgetFloatable
        )
        self.addDockWidget(Qt.DockWidgetArea.LeftDockWidgetArea, layers_dock)

        # Right dock — Tile Palette (Phase 4 stub)
        palette_label = QLabel("Tile palette\n(available in Phase 4)")
        palette_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        palette_label.setStyleSheet("color: #888;")
        palette_dock = QDockWidget("Tile Palette", self)
        palette_dock.setWidget(palette_label)
        palette_dock.setMinimumWidth(200)
        palette_dock.setFeatures(
            QDockWidget.DockWidgetFeature.DockWidgetMovable
            | QDockWidget.DockWidgetFeature.DockWidgetFloatable
        )
        self.addDockWidget(Qt.DockWidgetArea.RightDockWidgetArea, palette_dock)

    def _build_menu(self) -> None:
        mb = self.menuBar()

        # --- File ---
        file_menu = mb.addMenu("&File")

        act_new_tile = QAction("New &Tile Map", self)
        act_new_tile.setShortcut("Ctrl+T")
        act_new_tile.triggered.connect(self._new_tile_map)
        file_menu.addAction(act_new_tile)

        act_new_hex = QAction("New &Hex Map", self)
        act_new_hex.setShortcut("Ctrl+H")
        act_new_hex.triggered.connect(self._new_hex_map)
        file_menu.addAction(act_new_hex)

        file_menu.addSeparator()

        act_close = QAction("&Close Map", self)
        act_close.setShortcut("Ctrl+W")
        act_close.triggered.connect(self._mdi.closeActiveSubWindow)
        file_menu.addAction(act_close)

        file_menu.addSeparator()

        act_quit = QAction("&Quit", self)
        act_quit.setShortcut("Ctrl+Q")
        act_quit.triggered.connect(QApplication.quit)
        file_menu.addAction(act_quit)

        # --- View ---
        view_menu = mb.addMenu("&View")

        act_zoom_in = QAction("Zoom &In", self)
        act_zoom_in.setShortcut("Ctrl+=")
        act_zoom_in.triggered.connect(self._zoom_in)
        view_menu.addAction(act_zoom_in)

        act_zoom_out = QAction("Zoom &Out", self)
        act_zoom_out.setShortcut("Ctrl+-")
        act_zoom_out.triggered.connect(self._zoom_out)
        view_menu.addAction(act_zoom_out)

        act_reset_zoom = QAction("&Reset Zoom", self)
        act_reset_zoom.setShortcut("Ctrl+0")
        act_reset_zoom.triggered.connect(self._reset_zoom)
        view_menu.addAction(act_reset_zoom)

        view_menu.addSeparator()

        self._grid_action = QAction("Show &Grid", self)
        self._grid_action.setShortcut("G")
        self._grid_action.setCheckable(True)
        self._grid_action.setChecked(True)
        self._grid_action.triggered.connect(self._toggle_grid)
        view_menu.addAction(self._grid_action)

        # --- Window ---
        win_menu = mb.addMenu("&Window")

        act_tile = QAction("&Tile Windows", self)
        act_tile.triggered.connect(self._mdi.tileSubWindows)
        win_menu.addAction(act_tile)

        act_cascade = QAction("&Cascade", self)
        act_cascade.triggered.connect(self._mdi.cascadeSubWindows)
        win_menu.addAction(act_cascade)

        win_menu.addSeparator()

        act_close_all = QAction("Close &All", self)
        act_close_all.triggered.connect(self._mdi.closeAllSubWindows)
        win_menu.addAction(act_close_all)

        # --- Help ---
        help_menu = mb.addMenu("&Help")

        act_about = QAction("&About", self)
        act_about.triggered.connect(self._about)
        help_menu.addAction(act_about)

    def _build_status_bar(self) -> None:
        sb = self.statusBar()

        self._map_label = QLabel("No map open")
        sb.addWidget(self._map_label, 1)  # stretch = 1

        self._cursor_label = QLabel()
        sb.addPermanentWidget(self._cursor_label)

        self._zoom_label = QLabel()
        sb.addPermanentWidget(self._zoom_label)

    # ------------------------------------------------------------------
    # Slots
    # ------------------------------------------------------------------

    def _new_tile_map(self) -> None:
        dlg = NewMapDialog(self, initial_type="tile")
        if dlg.exec() != QDialog.DialogCode.Accepted:
            return
        canvas = TileCanvas(dlg.create_map(_PLACEHOLDER_DIR))
        self._open_canvas(canvas)

    def _new_hex_map(self) -> None:
        dlg = NewMapDialog(self, initial_type="hex")
        if dlg.exec() != QDialog.DialogCode.Accepted:
            return
        canvas = HexCanvas(dlg.create_map(_PLACEHOLDER_DIR))
        self._open_canvas(canvas)

    def _open_canvas(self, canvas: MapCanvas) -> None:
        sub = self._mdi.addSubWindow(canvas)
        sub.setWindowTitle(canvas.map_name())
        sub.resize(640, 480)
        canvas.cursor_moved.connect(self._on_cursor_moved)
        canvas.zoom_changed.connect(self._on_zoom_changed)
        sub.show()

    def _active_canvas(self) -> MapCanvas | None:
        sub = self._mdi.activeSubWindow()
        if sub is None:
            return None
        widget = sub.widget()
        return widget if isinstance(widget, MapCanvas) else None

    def _zoom_in(self) -> None:
        if c := self._active_canvas():
            c.zoom_in()

    def _zoom_out(self) -> None:
        if c := self._active_canvas():
            c.zoom_out()

    def _reset_zoom(self) -> None:
        if c := self._active_canvas():
            c.fit_in_view()

    def _toggle_grid(self, checked: bool) -> None:
        if c := self._active_canvas():
            c.set_show_grid(checked)

    def _on_sub_window_activated(self, sub) -> None:
        canvas = sub.widget() if sub is not None else None
        if isinstance(canvas, MapCanvas):
            self._map_label.setText(f"Map: {canvas.map_name()}")
            self._zoom_label.setText(f"Zoom: {canvas.zoom_factor() * 100:.0f}%")
        else:
            self._map_label.setText("No map open")
            self._cursor_label.clear()
            self._zoom_label.clear()

    def _on_cursor_moved(self, col: int, row: int) -> None:
        canvas = self._active_canvas()
        if col >= 0:
            prefix = "Hex" if isinstance(canvas, HexCanvas) else "Tile"
            self._cursor_label.setText(f"{prefix} {col}, {row}")
        else:
            self._cursor_label.clear()

    def _on_zoom_changed(self, factor: float) -> None:
        self._zoom_label.setText(f"Zoom: {factor * 100:.0f}%")

    def _about(self) -> None:
        QMessageBox.about(
            self,
            "About Fantasy RPG Map Editor",
            "<b>Fantasy RPG Map Editor</b> v0.3.0<br><br>"
            "A dual-mode map editor for tile and hex RPG maps.<br>"
            "Built with Python and PyQt6.",
        )
