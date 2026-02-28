"""
TMJ writer — serialize TileMap / HexMap to Tiled's JSON (.tmj) format.

Public API
----------
write_tile_map(tile_map, path)
write_hex_map(hex_map, path)

Both functions write a UTF-8 JSON file and update map_.source_path.
Tileset image paths are stored relative to the save directory (Tiled
convention). If relative path computation fails (e.g. cross-drive on
Windows), the absolute path is used as fallback.
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path
from typing import Any, Union

from map_editor.models.hex_map import HexMap, HexOrientation
from map_editor.models.layer import ObjectLayer, TileLayer
from map_editor.models.map_object import MapObject, ObjectShape
from map_editor.models.tile_map import TileMap
from map_editor.models.tileset import Tileset


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def write_tile_map(tile_map: TileMap, path: Union[str, Path]) -> None:
    """Serialize *tile_map* to a .tmj file at *path*."""
    path = Path(path)
    layer_id = 1
    layers_data = []
    for layer in tile_map.layers:
        layers_data.append(_layer_to_dict(layer, layer_id))
        layer_id += 1

    root: dict[str, Any] = {
        "tiledversion": "1.10.0",
        "version": "1.10",
        "type": "map",
        "orientation": "orthogonal",
        "renderorder": "right-down",
        "width": tile_map.width,
        "height": tile_map.height,
        "tilewidth": tile_map.tile_width,
        "tileheight": tile_map.tile_height,
        "infinite": False,
        "nextlayerid": layer_id + 1,
        "nextobjectid": MapObject._id_counter + 1,
        "tilesets": [_tileset_to_dict(ts, path) for ts in tile_map.tilesets],
        "layers": layers_data,
    }

    _write_json(root, path)
    tile_map.source_path = str(path)


def write_hex_map(hex_map: HexMap, path: Union[str, Path]) -> None:
    """Serialize *hex_map* to a .tmj file at *path*."""
    path = Path(path)
    hw, hh = hex_map.hex_pixel_size()

    layer_id = 1
    layers_data = []
    for layer in hex_map.layers:
        layers_data.append(_layer_to_dict(layer, layer_id))
        layer_id += 1

    root: dict[str, Any] = {
        "tiledversion": "1.10.0",
        "version": "1.10",
        "type": "map",
        "orientation": "hexagonal",
        "renderorder": "right-down",
        "width": hex_map.cols,
        "height": hex_map.rows,
        "tilewidth": int(hw),
        "tileheight": int(hh),
        "infinite": False,
        "staggeraxis": hex_map.tiled_stagger_axis,
        "staggerindex": hex_map.tiled_stagger_index,
        "hexsidelength": hex_map.tiled_hex_side_length,
        "nextlayerid": layer_id + 1,
        "nextobjectid": MapObject._id_counter + 1,
        "tilesets": [_tileset_to_dict(ts, path) for ts in hex_map.tilesets],
        "layers": layers_data,
    }

    _write_json(root, path)
    hex_map.source_path = str(path)


# ---------------------------------------------------------------------------
# Tileset serialization
# ---------------------------------------------------------------------------

def _tileset_to_dict(ts: Tileset, save_path: Path) -> dict[str, Any]:
    d: dict[str, Any] = {
        "firstgid": ts.first_gid,
        "name": ts.name,
        "tilewidth": ts.tile_width,
        "tileheight": ts.tile_height,
        "spacing": 0,
        "margin": 0,
        "tilecount": ts.count,
        "columns": ts.columns,
    }

    if ts.source:
        try:
            rel = os.path.relpath(ts.source, save_path.parent)
            image_path = rel.replace("\\", "/")
        except ValueError:
            # Cross-drive on Windows — fall back to absolute
            image_path = ts.source.replace("\\", "/")
        cols = ts.columns
        rows = math.ceil(ts.count / cols) if cols else 1
        d["image"] = image_path
        d["imagewidth"] = cols * ts.tile_width
        d["imageheight"] = rows * ts.tile_height

    # Per-tile metadata stored as custom properties so they can be
    # reconstructed on load (name, color, category).
    tiles_list = []
    for t in ts.tiles:
        tile_entry: dict[str, Any] = {
            "id": t.id - 1,  # TMJ uses 0-based local IDs
            "type": t.name,
            "properties": [
                {"name": "color_r", "type": "int", "value": t.color[0]},
                {"name": "color_g", "type": "int", "value": t.color[1]},
                {"name": "color_b", "type": "int", "value": t.color[2]},
                {"name": "category", "type": "string", "value": t.category.name},
            ],
        }
        tiles_list.append(tile_entry)
    d["tiles"] = tiles_list

    return d


# ---------------------------------------------------------------------------
# Layer serialization
# ---------------------------------------------------------------------------

def _layer_to_dict(layer, layer_id: int) -> dict[str, Any]:
    base: dict[str, Any] = {
        "id": layer_id,
        "name": layer.name,
        "x": 0,
        "y": 0,
        "offsetx": layer.offset_x,
        "offsety": layer.offset_y,
        "visible": layer.visible,
        "opacity": layer.opacity,
    }

    if isinstance(layer, TileLayer):
        base.update({
            "type": "tilelayer",
            "width": layer.width,
            "height": layer.height,
            "data": layer.to_flat(),
        })
    elif isinstance(layer, ObjectLayer):
        objects_data = [_object_to_dict(obj) for obj in layer.objects]
        base.update({
            "type": "objectgroup",
            "color": layer.color,
            "draworder": "topdown",
            "objects": objects_data,
        })

    return base


# ---------------------------------------------------------------------------
# Object serialization
# ---------------------------------------------------------------------------

def _object_to_dict(obj: MapObject) -> dict[str, Any]:
    d: dict[str, Any] = {
        "id": obj.object_id,
        "name": obj.name,
        "type": obj.object_type,
        "x": obj.x,
        "y": obj.y,
        "width": obj.width,
        "height": obj.height,
        "visible": obj.visible,
        "rotation": 0,
    }

    if obj.shape == ObjectShape.POINT:
        d["point"] = True
    elif obj.shape == ObjectShape.ELLIPSE:
        d["ellipse"] = True
    elif obj.shape == ObjectShape.POLYGON and obj.polygon:
        d["polygon"] = [{"x": dx, "y": dy} for dx, dy in obj.polygon]
    elif obj.shape == ObjectShape.TILE:
        d["gid"] = obj.gid

    if obj.properties:
        props = []
        for key, value in obj.properties.items():
            if isinstance(value, bool):
                prop_type = "bool"
            elif isinstance(value, int):
                prop_type = "int"
            elif isinstance(value, float):
                prop_type = "float"
            else:
                prop_type = "string"
                value = str(value)
            props.append({"name": key, "type": prop_type, "value": value})
        d["properties"] = props

    return d


# ---------------------------------------------------------------------------
# File output
# ---------------------------------------------------------------------------

def _write_json(data: dict, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
