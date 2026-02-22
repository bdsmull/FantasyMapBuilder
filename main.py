"""
Fantasy RPG Map Editor — entry point.

Run with:
    python main.py

Phase 1-2 smoke test: creates sample maps, renders them to PNG, and prints
a summary.  Replace the body of main() with a QApplication launch in Phase 3.
"""

import os
import sys
from pathlib import Path

# Ensure the project root is on sys.path when run directly
ROOT = Path(__file__).parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Use offscreen platform so renderers work without a physical display
os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")


def main() -> None:
    from PyQt6.QtWidgets import QApplication

    app = QApplication(sys.argv)

    from map_editor.models.hex_map import HexMap, HexOrientation
    from map_editor.models.tile_map import TileMap
    from map_editor.rendering.hex_renderer import HexRenderer
    from map_editor.rendering.tile_renderer import TileRenderer

    assets_dir = ROOT / "map_editor" / "assets" / "placeholders"
    renders_dir = ROOT / "map_editor" / "assets" / "renders"
    renders_dir.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------
    # Build maps
    # ------------------------------------------------------------------
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

    # Paint some placeholder tiles so the renders aren't completely empty
    ground = tile_map.tile_layers()[0]
    ts = tile_map.primary_tileset()
    for row in range(tile_map.height):
        for col in range(tile_map.width):
            tile_id = ((col + row) % ts.count) + 1
            ground.set_tile(col, row, tile_id)

    terrain = hex_map.tile_layers()[0]
    hts = hex_map.primary_tileset()
    for row in range(hex_map.rows):
        for col in range(hex_map.cols):
            tile_id = ((col + row) % hts.count) + 1
            terrain.set_tile(col, row, tile_id)

    # ------------------------------------------------------------------
    # Render and save
    # ------------------------------------------------------------------
    tile_img = TileRenderer().render(tile_map, show_grid=True)
    hex_img  = HexRenderer().render(hex_map,  show_grid=True)

    tile_path = renders_dir / "test_dungeon.png"
    hex_path  = renders_dir / "test_world.png"
    tile_img.save(str(tile_path))
    hex_img.save(str(hex_path))

    # ------------------------------------------------------------------
    # Report
    # ------------------------------------------------------------------
    print(tile_map)
    print(f"  Layers     : {tile_map.layers}")
    print(f"  Pixel size : {tile_map.pixel_width}x{tile_map.pixel_height}")
    print(f"  Render     : {tile_path}")
    print()
    print(hex_map)
    print(f"  Layers     : {hex_map.layers}")
    print(f"  Pixel size : {hex_map.pixel_width:.1f}x{hex_map.pixel_height:.1f}")
    print(f"  Render     : {hex_path}")
    print()
    print("Phase 2 complete. Renderers OK.")


if __name__ == "__main__":
    main()
