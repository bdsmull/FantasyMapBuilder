"""
Image exporter — render a map to a PNG/JPEG file.

All layers are exported regardless of their visibility setting, so the
exported image always shows the complete map content.

Public API
----------
export_tile_map(tile_map, path, *, show_grid=False)
export_hex_map(hex_map, path, *, show_grid=False)

*path* may be a str or Path. The image format is inferred from the file
extension (.png → PNG, .jpg/.jpeg → JPEG).
"""

from __future__ import annotations

import copy
from pathlib import Path
from typing import Union

from map_editor.models.hex_map import HexMap
from map_editor.models.tile_map import TileMap
from map_editor.rendering.hex_renderer import HexRenderer
from map_editor.rendering.tile_renderer import TileRenderer


def export_tile_map(
    tile_map: TileMap,
    path: Union[str, Path],
    *,
    show_grid: bool = False,
) -> None:
    """Render *tile_map* (all layers visible) to an image file at *path*."""
    layers = [copy.copy(layer) for layer in tile_map.layers]
    for layer in layers:
        layer.visible = True
    image = TileRenderer().render(tile_map, layers=layers, show_grid=show_grid)
    image.save(str(path))


def export_hex_map(
    hex_map: HexMap,
    path: Union[str, Path],
    *,
    show_grid: bool = False,
) -> None:
    """Render *hex_map* (all layers visible) to an image file at *path*."""
    layers = [copy.copy(layer) for layer in hex_map.layers]
    for layer in layers:
        layer.visible = True
    image = HexRenderer().render(hex_map, layers=layers, show_grid=show_grid)
    image.save(str(path))
