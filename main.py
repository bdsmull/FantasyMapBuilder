"""
Fantasy RPG Map Editor — entry point.

Run with:
    python main.py
"""

import sys
from pathlib import Path

# Ensure the project root is on sys.path when run directly
ROOT = Path(__file__).parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def main() -> None:
    # Phase 1 smoke test — verify models import and instantiate correctly.
    # Replace with QApplication launch once Phase 3 UI is in place.
    from map_editor.models.tile_map import TileMap
    from map_editor.models.hex_map import HexMap, HexOrientation

    assets_dir = ROOT / "map_editor" / "assets" / "placeholders"

    tile_map = TileMap.create_new(
        name="Test Dungeon",
        width=20,
        height=15,
        placeholder_dir=assets_dir,
    )
    hex_map = HexMap.create_new(
        name="Test World",
        cols=12,
        rows=10,
        hex_size=40.0,
        orientation=HexOrientation.FLAT_TOP,
        placeholder_dir=assets_dir,
    )

    print(tile_map)
    print(f"  Layers: {tile_map.layers}")
    print(f"  Pixel size: {tile_map.pixel_width}x{tile_map.pixel_height}")
    print()
    print(hex_map)
    print(f"  Layers: {hex_map.layers}")
    print(f"  Pixel size: {hex_map.pixel_width:.1f}x{hex_map.pixel_height:.1f}")
    print()
    print("Placeholder tilesets written to:", assets_dir)
    print("Phase 1 complete. Models OK.")


if __name__ == "__main__":
    main()
