"""
Map elevation ("height patches"), stored next to the maps of a world set:

    <world set>/heights/<map>.tif        32-bit signed whole centimeters, absolute
    <world set>/heights/<map>.mask.png   edit mask: 255 where a value was set by hand

A map links its heights through a Tiled custom property of type ``file``:
``{"name": "heights", "type": "file", "value": "../heights/<map>.tif"}``. The mask
sits beside the TIFF by naming convention.

Heights are sampled at cell corners on square maps ((width + 1) x (height + 1)
values) and at cell centres on hex maps (width x height values), row-major,
top-left first.
"""

from __future__ import annotations

import array
import sys
from pathlib import Path
from typing import Optional

from PIL import Image

HEIGHTS_DIR = "heights"
HEIGHTS_PROPERTY = "heights"


def sample_grid(map_data: dict) -> tuple[int, int]:
    """(columns, rows) of height samples for a map."""
    w, h = int(map_data["width"]), int(map_data["height"])
    return (w, h) if map_data.get("orientation") == "hexagonal" else (w + 1, h + 1)


def heights_path(world_set_dir: Path, map_name: str) -> Path:
    return world_set_dir / HEIGHTS_DIR / f"{map_name}.tif"


def mask_path(world_set_dir: Path, map_name: str) -> Path:
    return world_set_dir / HEIGHTS_DIR / f"{map_name}.mask.png"


def property_value(map_name: str) -> str:
    """Value of the map's ``heights`` file property (relative to the map file)."""
    return f"../{HEIGHTS_DIR}/{map_name}.tif"


def _to_little_endian(values: array.array) -> bytes:
    if sys.byteorder == "big":
        values = array.array(values.typecode, values)
        values.byteswap()
    return values.tobytes()


def write_heights(world_set_dir: Path, map_name: str, cols: int, rows: int,
                  heights_le: bytes, mask: bytes) -> None:
    """Store heights (little-endian int32 centimeters) and mask (one byte per sample)."""
    if len(heights_le) != cols * rows * 4 or len(mask) != cols * rows:
        raise ValueError("height data does not match the sample grid")
    folder = world_set_dir / HEIGHTS_DIR
    folder.mkdir(parents=True, exist_ok=True)
    image = Image.frombytes("I", (cols, rows), heights_le, "raw", "I;32")
    image.save(heights_path(world_set_dir, map_name), "TIFF", compression="tiff_adobe_deflate")
    mask_image = Image.frombytes("L", (cols, rows), bytes(255 if b else 0 for b in mask))
    mask_image.save(mask_path(world_set_dir, map_name), "PNG")


def read_heights(world_set_dir: Path, map_name: str) -> Optional[tuple[int, int, bytes, bytes]]:
    """(cols, rows, little-endian int32 centimeters, mask bytes 0/1), or None if absent."""
    path = heights_path(world_set_dir, map_name)
    if not path.is_file():
        return None
    with Image.open(path) as image:
        if image.mode != "I":
            raise ValueError(f"{path.name} is not a 32-bit integer TIFF")
        cols, rows = image.size
        values = array.array("i", image.tobytes("raw", "I"))
    heights_le = _to_little_endian(values)
    mpath = mask_path(world_set_dir, map_name)
    if mpath.is_file():
        with Image.open(mpath) as m:
            mask = bytes(1 if b else 0 for b in m.convert("L").tobytes())
        if len(mask) != cols * rows:
            mask = bytes(cols * rows)
    else:
        mask = bytes(cols * rows)
    return cols, rows, heights_le, mask


def delete_heights(world_set_dir: Path, map_name: str) -> bool:
    """Remove a map's height files; True if anything was removed."""
    removed = False
    for path in (heights_path(world_set_dir, map_name), mask_path(world_set_dir, map_name)):
        if path.is_file():
            path.unlink()
            removed = True
    return removed


def copy_heights(source_dir: Path, source_map: str, target_dir: Path, target_map: str) -> bool:
    """Copy a map's height files to another world set (under the target map name)."""
    data = read_heights(source_dir, source_map)
    if data is None:
        return False
    cols, rows, heights_le, mask = data
    write_heights(target_dir, target_map, cols, rows, heights_le, mask)
    return True
