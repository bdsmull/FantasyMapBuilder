"""
Tileset model.

A Tileset is a collection of TileDefinitions, each identified by a positive
integer ID (Tiled convention: 0 = empty/no tile, IDs start at 1).

Placeholder generation produces a PNG sprite sheet of solid-colored squares
so the editor is usable before any real art is loaded.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from enum import Enum, auto
from pathlib import Path
from typing import Optional

from PIL import Image, ImageDraw, ImageFont


class TileCategory(Enum):
    TERRAIN = auto()   # Ground-level tiles (grass, water, stone, …)
    WALL = auto()      # Blocking / vertical surfaces
    OBJECT = auto()    # Decorative map objects (trees, rocks, …)
    SPECIAL = auto()   # Editor-only tiles (spawn markers, triggers, …)


# ---------------------------------------------------------------------------
# Default placeholder tile definitions
# ---------------------------------------------------------------------------

_PLACEHOLDER_TILES: list[dict] = [
    # id, name,             color (R, G, B),       category
    {"id": 1,  "name": "Grass",        "color": (106, 168,  79), "category": TileCategory.TERRAIN},
    {"id": 2,  "name": "Dirt",         "color": (180, 122,  63), "category": TileCategory.TERRAIN},
    {"id": 3,  "name": "Sand",         "color": (230, 210, 140), "category": TileCategory.TERRAIN},
    {"id": 4,  "name": "Stone Floor",  "color": (160, 160, 160), "category": TileCategory.TERRAIN},
    {"id": 5,  "name": "Water",        "color": ( 66, 133, 244), "category": TileCategory.TERRAIN},
    {"id": 6,  "name": "Deep Water",   "color": ( 30,  80, 180), "category": TileCategory.TERRAIN},
    {"id": 7,  "name": "Snow",         "color": (230, 240, 255), "category": TileCategory.TERRAIN},
    {"id": 8,  "name": "Lava",         "color": (220,  80,  20), "category": TileCategory.TERRAIN},
    {"id": 9,  "name": "Stone Wall",   "color": ( 90,  90,  90), "category": TileCategory.WALL},
    {"id": 10, "name": "Brick Wall",   "color": (140,  70,  50), "category": TileCategory.WALL},
    {"id": 11, "name": "Ice Wall",     "color": (180, 220, 240), "category": TileCategory.WALL},
    {"id": 12, "name": "Tree",         "color": ( 39, 110,  39), "category": TileCategory.OBJECT},
    {"id": 13, "name": "Rock",         "color": (120, 110, 100), "category": TileCategory.OBJECT},
    {"id": 14, "name": "Chest",        "color": (200, 170,  50), "category": TileCategory.OBJECT},
    {"id": 15, "name": "Door",         "color": (140, 100,  60), "category": TileCategory.OBJECT},
    {"id": 16, "name": "Spawn",        "color": (255,  80, 180), "category": TileCategory.SPECIAL},
]

# Hex-world-scale placeholder tiles (coarser terrain types)
_PLACEHOLDER_HEX_TILES: list[dict] = [
    {"id": 1,  "name": "Plains",       "color": (144, 200,  80), "category": TileCategory.TERRAIN},
    {"id": 2,  "name": "Forest",       "color": ( 34, 120,  34), "category": TileCategory.TERRAIN},
    {"id": 3,  "name": "Hills",        "color": (160, 140,  90), "category": TileCategory.TERRAIN},
    {"id": 4,  "name": "Mountains",    "color": (110, 100, 110), "category": TileCategory.TERRAIN},
    {"id": 5,  "name": "Ocean",        "color": ( 30,  80, 180), "category": TileCategory.TERRAIN},
    {"id": 6,  "name": "Coast",        "color": ( 90, 160, 220), "category": TileCategory.TERRAIN},
    {"id": 7,  "name": "Desert",       "color": (220, 195, 110), "category": TileCategory.TERRAIN},
    {"id": 8,  "name": "Swamp",        "color": ( 80, 110,  60), "category": TileCategory.TERRAIN},
    {"id": 9,  "name": "Tundra",       "color": (190, 210, 220), "category": TileCategory.TERRAIN},
    {"id": 10, "name": "Volcano",      "color": (180,  50,  20), "category": TileCategory.TERRAIN},
    {"id": 11, "name": "City",         "color": (190, 190, 190), "category": TileCategory.OBJECT},
    {"id": 12, "name": "Dungeon",      "color": ( 80,  60,  80), "category": TileCategory.SPECIAL},
]


@dataclass
class TileDefinition:
    """Metadata for a single tile type within a tileset."""

    id: int                          # 1-based; 0 is always "empty"
    name: str
    color: tuple[int, int, int]      # RGB, used for placeholder rendering
    category: TileCategory = TileCategory.TERRAIN
    # Pixel rect within the sprite sheet image (col, row) — set after loading
    sheet_col: int = 0
    sheet_row: int = 0

    @property
    def is_passable(self) -> bool:
        """Convenience: walls are impassable by default."""
        return self.category != TileCategory.WALL


@dataclass
class Tileset:
    """
    A named collection of TileDefinitions backed by an image sprite sheet.

    Attributes:
        name:        Human-readable name shown in the palette.
        source:      Path to the PNG sprite sheet (empty string = placeholder).
        tile_width:  Width of each tile in pixels.
        tile_height: Height of each tile in pixels.
        tiles:       Ordered list of TileDefinitions (sorted by id).
        first_gid:   Tiled firstgid value when embedded in a map (default 1).
    """

    name: str
    source: str = ""
    tile_width: int = 32
    tile_height: int = 32
    tiles: list[TileDefinition] = field(default_factory=list)
    first_gid: int = 1

    # ------------------------------------------------------------------
    # Lookup helpers
    # ------------------------------------------------------------------

    def tile_by_id(self, tile_id: int) -> Optional[TileDefinition]:
        """Return the TileDefinition for *tile_id*, or None if not found."""
        for t in self.tiles:
            if t.id == tile_id:
                return t
        return None

    def tile_by_name(self, name: str) -> Optional[TileDefinition]:
        for t in self.tiles:
            if t.name == name:
                return t
        return None

    @property
    def count(self) -> int:
        return len(self.tiles)

    # ------------------------------------------------------------------
    # Columns in the sprite sheet
    # ------------------------------------------------------------------

    @property
    def columns(self) -> int:
        """Number of tile columns in the sprite sheet (8 per row by default)."""
        return min(8, self.count) if self.count else 1

    # ------------------------------------------------------------------
    # Factory: generate placeholder tileset
    # ------------------------------------------------------------------

    @classmethod
    def make_placeholder(
        cls,
        name: str = "Default",
        tile_defs: Optional[list[dict]] = None,
        tile_width: int = 32,
        tile_height: int = 32,
        output_dir: Optional[Path] = None,
    ) -> "Tileset":
        """
        Build a Tileset from *tile_defs* (list of dicts with id/name/color/category)
        and generate a PNG sprite sheet saved to *output_dir*.

        Returns the fully populated Tileset.
        """
        if tile_defs is None:
            tile_defs = _PLACEHOLDER_TILES

        tiles: list[TileDefinition] = []
        for entry in tile_defs:
            t = TileDefinition(
                id=entry["id"],
                name=entry["name"],
                color=entry["color"],
                category=entry["category"],
            )
            tiles.append(t)

        tileset = cls(
            name=name,
            tile_width=tile_width,
            tile_height=tile_height,
            tiles=tiles,
        )

        # Assign sheet col/row positions
        cols = tileset.columns
        for t in tileset.tiles:
            idx = t.id - 1  # 0-based index
            t.sheet_col = idx % cols
            t.sheet_row = idx // cols

        # Generate the PNG
        if output_dir is not None:
            output_dir = Path(output_dir)
            output_dir.mkdir(parents=True, exist_ok=True)
            png_path = output_dir / f"{name.lower().replace(' ', '_')}_placeholder.png"
            tileset.source = str(png_path)
            _generate_placeholder_png(tileset, png_path)

        return tileset


# ---------------------------------------------------------------------------
# Convenience constructors
# ---------------------------------------------------------------------------

def make_default_tile_tileset(output_dir: Optional[Path] = None) -> Tileset:
    """Return the default tile-grid placeholder tileset."""
    return Tileset.make_placeholder(
        name="Default Tile",
        tile_defs=_PLACEHOLDER_TILES,
        output_dir=output_dir,
    )


def make_default_hex_tileset(output_dir: Optional[Path] = None) -> Tileset:
    """Return the default hex-grid placeholder tileset."""
    return Tileset.make_placeholder(
        name="Default Hex",
        tile_defs=_PLACEHOLDER_HEX_TILES,
        output_dir=output_dir,
    )


# ---------------------------------------------------------------------------
# Internal: PNG generation
# ---------------------------------------------------------------------------

def _generate_placeholder_png(tileset: Tileset, path: Path) -> None:
    """Draw a sprite sheet of solid-colored tiles with name labels."""
    tw = tileset.tile_width
    th = tileset.tile_height
    cols = tileset.columns
    rows = (tileset.count + cols - 1) // cols

    img = Image.new("RGBA", (cols * tw, rows * th), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Try to load a small font; fall back to the default if unavailable
    try:
        font = ImageFont.truetype("arial.ttf", max(8, th // 5))
    except (OSError, IOError):
        font = ImageFont.load_default()

    for tile in tileset.tiles:
        x0 = tile.sheet_col * tw
        y0 = tile.sheet_row * th
        x1 = x0 + tw - 1
        y1 = y0 + th - 1

        # Fill
        draw.rectangle([x0, y0, x1, y1], fill=(*tile.color, 255))
        # 1-pixel dark border
        draw.rectangle([x0, y0, x1, y1], outline=(0, 0, 0, 180), width=1)

        # Label: first word of the tile name, centred
        label = tile.name.split()[0]
        # Use textbbox to measure (Pillow ≥ 9.2)
        try:
            bbox = draw.textbbox((0, 0), label, font=font)
            lw = bbox[2] - bbox[0]
            lh = bbox[3] - bbox[1]
        except AttributeError:
            lw, lh = draw.textsize(label, font=font)  # older Pillow

        lx = x0 + (tw - lw) // 2
        ly = y0 + (th - lh) // 2
        # Shadow for legibility
        draw.text((lx + 1, ly + 1), label, font=font, fill=(0, 0, 0, 200))
        draw.text((lx, ly), label, font=font, fill=(255, 255, 255, 230))

    img.save(path, "PNG")
