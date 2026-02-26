"""Main application window."""
from pathlib import Path

from PyQt6.QtCore import Qt
from PyQt6.QtGui import QAction, QActionGroup, QBrush, QColor, QUndoStack
from PyQt6.QtWidgets import (
    QApplication,
    QDialog,
    QDockWidget,
    QMainWindow,
    QMdiArea,
    QMessageBox,
    QScrollArea,
    QToolBar,
)

from map_editor.models.layer import ObjectLayer, TileLayer
from map_editor.tools.erase_tool import EraseTool
from map_editor.tools.fill_tool import FillTool
from map_editor.tools.paint_tool import PaintTool
from map_editor.tools.point_tool import PointObjectTool
from map_editor.ui.dialogs.new_map_dialog import NewMapDialog
from map_editor.ui.hex_canvas import HexCanvas
from map_editor.ui.layer_panel import LayerPanelWidget
from map_editor.ui.map_canvas import MapCanvas
from map_editor.ui.tile_canvas import TileCanvas
from map_editor.ui.tile_palette import TilePaletteWidget

# Placeholder assets live next to the map_editor package:
#   map_editor/ui/main_window.py  → parents[1] = map_editor/ → assets/placeholders/
_PLACEHOLDER_DIR = Path(__file__).parents[1] / "assets" / "placeholders"


class MainWindow(QMainWindow):
    """Top-level window for the Fantasy RPG Map Editor."""

    def __init__(self, parent=None) -> None:
        super().__init__(parent)
        self.setWindowTitle("Fantasy RPG Map Editor")

        # Tool instances (shared across all canvases)
        self._paint_tool = PaintTool()
        self._erase_tool = EraseTool()
        self._fill_tool = FillTool()
        self._point_tool = PointObjectTool()
        self._active_tool_name: str = "paint"

        # Panel/palette references (set in _build_docks)
        self._layer_panel: LayerPanelWidget | None = None
        self._tile_palette: TilePaletteWidget | None = None

        # Undo/redo actions (set in _build_menu)
        self._undo_action: QAction | None = None
        self._redo_action: QAction | None = None

        # Tool actions (set in _build_toolbar)
        self._tool_actions: dict[str, QAction] = {}

        self._build_mdi()
        self._build_docks()
        self._build_toolbar()
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
        # Left dock — Layers panel
        self._layer_panel = LayerPanelWidget()
        layers_dock = QDockWidget("Layers", self)
        layers_dock.setWidget(self._layer_panel)
        layers_dock.setMinimumWidth(180)
        layers_dock.setFeatures(
            QDockWidget.DockWidgetFeature.DockWidgetMovable
            | QDockWidget.DockWidgetFeature.DockWidgetFloatable
        )
        self.addDockWidget(Qt.DockWidgetArea.LeftDockWidgetArea, layers_dock)

        # Right dock — Tile Palette (scrollable)
        self._tile_palette = TilePaletteWidget()
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setWidget(self._tile_palette)
        palette_dock = QDockWidget("Tile Palette", self)
        palette_dock.setWidget(scroll)
        palette_dock.setMinimumWidth(200)
        palette_dock.setFeatures(
            QDockWidget.DockWidgetFeature.DockWidgetMovable
            | QDockWidget.DockWidgetFeature.DockWidgetFloatable
        )
        self.addDockWidget(Qt.DockWidgetArea.RightDockWidgetArea, palette_dock)

    def _build_toolbar(self) -> None:
        toolbar = QToolBar("Tools", self)
        self.addToolBar(Qt.ToolBarArea.TopToolBarArea, toolbar)

        group = QActionGroup(self)
        group.setExclusive(True)

        act_paint = QAction("Paint", self)
        act_paint.setShortcut("Ctrl+1")
        act_paint.setCheckable(True)
        act_paint.setChecked(True)
        act_paint.triggered.connect(lambda: self._set_tool("paint"))
        group.addAction(act_paint)
        toolbar.addAction(act_paint)

        act_erase = QAction("Erase", self)
        act_erase.setShortcut("Ctrl+2")
        act_erase.setCheckable(True)
        act_erase.triggered.connect(lambda: self._set_tool("erase"))
        group.addAction(act_erase)
        toolbar.addAction(act_erase)

        act_fill = QAction("Fill", self)
        act_fill.setShortcut("Ctrl+3")
        act_fill.setCheckable(True)
        act_fill.triggered.connect(lambda: self._set_tool("fill"))
        group.addAction(act_fill)
        toolbar.addAction(act_fill)

        act_point = QAction("Point", self)
        act_point.setShortcut("Ctrl+4")
        act_point.setCheckable(True)
        act_point.triggered.connect(lambda: self._set_tool("point"))
        group.addAction(act_point)
        toolbar.addAction(act_point)

        self._tool_actions = {
            "paint": act_paint,
            "erase": act_erase,
            "fill": act_fill,
            "point": act_point,
        }

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

        # --- Edit ---
        edit_menu = mb.addMenu("&Edit")

        self._undo_action = QAction("&Undo", self)
        self._undo_action.setShortcut("Ctrl+Z")
        self._undo_action.setEnabled(False)
        edit_menu.addAction(self._undo_action)

        self._redo_action = QAction("&Redo", self)
        self._redo_action.setShortcut("Ctrl+Y")
        self._redo_action.setEnabled(False)
        edit_menu.addAction(self._redo_action)

        edit_menu.addSeparator()

        act_clear = QAction("Clear &Layer", self)
        act_clear.triggered.connect(self._clear_layer)
        edit_menu.addAction(act_clear)

        act_fill_layer = QAction("&Fill Layer", self)
        act_fill_layer.triggered.connect(self._fill_layer)
        edit_menu.addAction(act_fill_layer)

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
        from PyQt6.QtWidgets import QLabel
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
        self._populate_panel_and_palette(canvas)
        canvas.set_tool(self._paint_tool)

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
            self._reconnect_undo_stack(canvas.undo_stack())
            self._populate_panel_and_palette(canvas)
        else:
            self._map_label.setText("No map open")
            self._cursor_label.clear()
            self._zoom_label.clear()
            if self._undo_action:
                self._undo_action.setEnabled(False)
            if self._redo_action:
                self._redo_action.setEnabled(False)

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
            "<b>Fantasy RPG Map Editor</b> v0.4.0<br><br>"
            "A dual-mode map editor for tile and hex RPG maps.<br>"
            "Built with Python and PyQt6.",
        )

    # ------------------------------------------------------------------
    # Phase 4 — tool + panel helpers
    # ------------------------------------------------------------------

    def _set_tool(self, name: str) -> None:
        tool_map = {
            "paint": self._paint_tool,
            "erase": self._erase_tool,
            "fill": self._fill_tool,
            "point": self._point_tool,
        }
        tool = tool_map.get(name)
        self._active_tool_name = name
        if canvas := self._active_canvas():
            canvas.set_tool(tool)

    def _reconnect_undo_stack(self, stack: QUndoStack) -> None:
        if self._undo_action is None or self._redo_action is None:
            return
        try:
            self._undo_action.triggered.disconnect()
        except (RuntimeError, TypeError):
            pass
        try:
            self._redo_action.triggered.disconnect()
        except (RuntimeError, TypeError):
            pass
        try:
            stack.canUndoChanged.disconnect()
        except (RuntimeError, TypeError):
            pass
        try:
            stack.canRedoChanged.disconnect()
        except (RuntimeError, TypeError):
            pass

        self._undo_action.triggered.connect(stack.undo)
        self._redo_action.triggered.connect(stack.redo)
        stack.canUndoChanged.connect(self._undo_action.setEnabled)
        stack.canRedoChanged.connect(self._redo_action.setEnabled)
        self._undo_action.setEnabled(stack.canUndo())
        self._redo_action.setEnabled(stack.canRedo())

    def _populate_panel_and_palette(self, canvas: MapCanvas) -> None:
        if self._layer_panel is None or self._tile_palette is None:
            return

        # Disconnect previous panel signals
        try:
            self._layer_panel.layer_selected.disconnect()
        except (RuntimeError, TypeError):
            pass
        try:
            self._layer_panel.layer_visibility_changed.disconnect()
        except (RuntimeError, TypeError):
            pass

        # Disconnect previous palette signals
        try:
            self._tile_palette.tile_selected.disconnect()
        except (RuntimeError, TypeError):
            pass

        # Populate layer panel
        map_ = canvas.tile_map if isinstance(canvas, TileCanvas) else canvas.hex_map
        self._layer_panel.set_map(map_)

        # Connect layer panel signals
        self._layer_panel.layer_selected.connect(canvas.set_active_layer)
        self._layer_panel.layer_visibility_changed.connect(
            lambda layer, vis: self._on_layer_visibility_changed(canvas, layer, vis)
        )

        # Load tileset sprite sheet
        from PyQt6.QtGui import QImage
        if map_.tilesets:
            tileset = map_.tilesets[0]
            sheet_image = QImage(tileset.source)
            if not sheet_image.isNull():
                self._tile_palette.set_tileset(tileset, sheet_image)

        # Connect palette signal
        self._tile_palette.tile_selected.connect(canvas.set_active_gid)

        # Force-set active GID and active layer
        canvas.set_active_gid(self._tile_palette.selected_gid())

        for layer in map_.layers:
            if isinstance(layer, TileLayer):
                canvas.set_active_layer(layer)
                break

    def _on_layer_visibility_changed(
        self, canvas: MapCanvas, layer, visible: bool
    ) -> None:
        layer.visible = visible
        canvas.refresh()

    def _clear_layer(self) -> None:
        canvas = self._active_canvas()
        if canvas is None:
            return
        layer = canvas._active_layer
        if not isinstance(layer, TileLayer):
            return
        layer.clear()
        canvas.refresh()

    def _fill_layer(self) -> None:
        canvas = self._active_canvas()
        if canvas is None:
            return
        layer = canvas._active_layer
        if not isinstance(layer, TileLayer):
            return
        layer.fill(canvas._active_gid)
        canvas.refresh()
