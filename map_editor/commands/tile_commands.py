"""Undo/redo commands for tile and object editing operations."""
from PyQt6.QtGui import QUndoCommand

from map_editor.models.layer import ObjectLayer, TileLayer
from map_editor.models.map_object import MapObject


class SetTileRegionCommand(QUndoCommand):
    """Undo/redo for a batch of tile changes (single paint or erase stroke)."""

    def __init__(
        self,
        layer: TileLayer,
        changes: list[tuple[int, int, int, int]],  # (col, row, old_id, new_id)
        parent: QUndoCommand | None = None,
    ) -> None:
        super().__init__("Paint", parent)
        self._layer = layer
        self._changes = changes
        self._first = True  # changes already applied by tool; skip first redo()

    def redo(self) -> None:
        if self._first:
            self._first = False
            return
        for col, row, _, new_id in self._changes:
            self._layer.set_tile(col, row, new_id)

    def undo(self) -> None:
        for col, row, old_id, _ in self._changes:
            self._layer.set_tile(col, row, old_id)


class FloodFillCommand(QUndoCommand):
    """Undo/redo for a flood-fill operation."""

    def __init__(
        self,
        layer: TileLayer,
        changed: list[tuple[int, int]],  # (col, row) cells that were changed
        old_id: int,
        new_id: int,
        parent: QUndoCommand | None = None,
    ) -> None:
        super().__init__("Flood Fill", parent)
        self._layer = layer
        self._changed = changed
        self._old_id = old_id
        self._new_id = new_id
        self._first = True

    def redo(self) -> None:
        if self._first:
            self._first = False
            return
        for col, row in self._changed:
            self._layer.set_tile(col, row, self._new_id)

    def undo(self) -> None:
        for col, row in self._changed:
            self._layer.set_tile(col, row, self._old_id)


class AddObjectCommand(QUndoCommand):
    """Undo/redo for placing a point object on an ObjectLayer."""

    def __init__(
        self,
        layer: ObjectLayer,
        obj: MapObject,
        parent: QUndoCommand | None = None,
    ) -> None:
        super().__init__("Add Object", parent)
        self._layer = layer
        self._obj = obj
        self._first = True

    def redo(self) -> None:
        if self._first:
            self._first = False
            return
        self._layer.add_object(self._obj)

    def undo(self) -> None:
        self._layer.remove_object(self._obj)


class RemoveObjectCommand(QUndoCommand):
    """Undo/redo for deleting a point object from an ObjectLayer."""

    def __init__(
        self,
        layer: ObjectLayer,
        obj: MapObject,
        parent: QUndoCommand | None = None,
    ) -> None:
        super().__init__("Remove Object", parent)
        self._layer = layer
        self._obj = obj
        self._first = True

    def redo(self) -> None:
        if self._first:
            self._first = False
            return
        self._layer.remove_object(self._obj)

    def undo(self) -> None:
        self._layer.add_object(self._obj)
