"""
MapObject model.

Represents a named entity placed on an object layer — e.g. an NPC, a chest,
a trigger zone, or a spawn point. Coordinates are stored in tile-space (or
axial hex-space) as floats so objects can be positioned anywhere within a
tile, matching the Tiled object model.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from enum import Enum, auto
from typing import Any, Optional


class ObjectShape(Enum):
    """The geometric footprint of an object (mirrors Tiled object shapes)."""
    POINT = auto()      # Single point / icon
    RECTANGLE = auto()  # Axis-aligned bounding box
    ELLIPSE = auto()    # Ellipse inscribed in bounding box
    POLYGON = auto()    # Arbitrary closed polygon (list of relative points)
    TILE = auto()       # A tile image placed as an object (gid reference)


@dataclass
class MapObject:
    """
    A single entity placed on a map.

    Attributes:
        object_id:   Unique integer ID (auto-assigned, matches Tiled's "id").
        name:        Human-readable label shown in the editor.
        object_type: Category string (e.g. "NPC", "Chest", "Trigger").
        x:           Left edge in pixels (Tiled convention, origin top-left).
        y:           Top edge in pixels.
        width:       Bounding box width in pixels (0 for points).
        height:      Bounding box height in pixels (0 for points).
        shape:       Geometric shape of the object.
        gid:         Tile GID if shape == TILE, else 0.
        visible:     Whether the object is shown in the editor.
        properties:  Arbitrary key-value metadata (string → any).
        polygon:     List of (dx, dy) offsets relative to (x, y) for POLYGON.
    """

    name: str
    object_type: str = ""
    x: float = 0.0
    y: float = 0.0
    width: float = 0.0
    height: float = 0.0
    shape: ObjectShape = ObjectShape.POINT
    gid: int = 0
    visible: bool = True
    properties: dict[str, Any] = field(default_factory=dict)
    polygon: list[tuple[float, float]] = field(default_factory=list)
    object_id: int = field(default_factory=lambda: MapObject._next_id())

    # ------------------------------------------------------------------
    # ID counter (module-level singleton)
    # ------------------------------------------------------------------

    _id_counter: int = 0  # class-level, incremented via _next_id()

    @staticmethod
    def _next_id() -> int:
        MapObject._id_counter += 1
        return MapObject._id_counter

    @classmethod
    def reset_id_counter(cls, value: int = 0) -> None:
        """Reset the counter — call this when loading a map from disk."""
        cls._id_counter = value

    # ------------------------------------------------------------------
    # Convenience constructors
    # ------------------------------------------------------------------

    @classmethod
    def make_point(
        cls,
        name: str,
        x: float,
        y: float,
        object_type: str = "",
        properties: Optional[dict[str, Any]] = None,
    ) -> "MapObject":
        return cls(
            name=name,
            object_type=object_type,
            x=x,
            y=y,
            shape=ObjectShape.POINT,
            properties=properties or {},
        )

    @classmethod
    def make_rect(
        cls,
        name: str,
        x: float,
        y: float,
        width: float,
        height: float,
        object_type: str = "",
        properties: Optional[dict[str, Any]] = None,
    ) -> "MapObject":
        return cls(
            name=name,
            object_type=object_type,
            x=x,
            y=y,
            width=width,
            height=height,
            shape=ObjectShape.RECTANGLE,
            properties=properties or {},
        )

    @classmethod
    def make_tile_object(
        cls,
        name: str,
        x: float,
        y: float,
        gid: int,
        object_type: str = "",
        properties: Optional[dict[str, Any]] = None,
    ) -> "MapObject":
        """A tile image placed as an object (gid > 0)."""
        return cls(
            name=name,
            object_type=object_type,
            x=x,
            y=y,
            gid=gid,
            shape=ObjectShape.TILE,
            properties=properties or {},
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def move_to(self, x: float, y: float) -> None:
        self.x = x
        self.y = y

    def set_property(self, key: str, value: Any) -> None:
        self.properties[key] = value

    def get_property(self, key: str, default: Any = None) -> Any:
        return self.properties.get(key, default)

    def __repr__(self) -> str:
        return (
            f"MapObject(id={self.object_id}, name={self.name!r}, "
            f"type={self.object_type!r}, x={self.x}, y={self.y})"
        )
