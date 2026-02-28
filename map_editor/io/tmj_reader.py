"""
TMJ reader — deserialize Tiled's JSON (.tmj) format into TileMap / HexMap.

Public API
----------
read_map(path) -> TileMap | HexMap

Dispatches on `orientation`:
  "hexagonal"  → HexMap
  anything else → TileMap

TileDefinition metadata (name, color, category) is fully reconstructed from
per-tile custom properties written by tmj_writer.  Tilesets added from
external tools (no such properties) fall back to safe defaults.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Union

from map_editor.models.hex_map import HexMap, HexOrientation
from map_editor.models.layer import ObjectLayer, TileLayer
from map_editor.models.map_object import MapObject, ObjectShape
from map_editor.models.tile_map import TileMap
from map_editor.models.tileset import TileCategory, TileDefinition, Tileset


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def read_map(path: Union[str, Path]) -> TileMap | HexMap:
    """Read a .tmj file and return the appropriate map type."""
    path = Path(path)
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    if data.get("orientation") == "hexagonal":
        return _read_hex_map(data, path)
    return _read_tile_map(data, path)


# ---------------------------------------------------------------------------
# Map type constructors
# ---------------------------------------------------------------------------

def _read_tile_map(data: dict, path: Path) -> TileMap:
    tilesets = _read_tilesets(data.get("tilesets", []), path.parent)
    layers = _read_layers(
        data.get("layers", []),
        data["width"],
        data["height"],
    )
    _reset_object_id_counter(layers)

    return TileMap(
        name=path.stem,
        width=data["width"],
        height=data["height"],
        tile_width=data["tilewidth"],
        tile_height=data["tileheight"],
        tilesets=tilesets,
        layers=layers,
        source_path=str(path),
    )


def _read_hex_map(data: dict, path: Path) -> HexMap:
    stagger_axis = data.get("staggeraxis", "x")
    orientation = (
        HexOrientation.FLAT_TOP if stagger_axis == "x" else HexOrientation.POINTY_TOP
    )
    hex_size = float(data.get("hexsidelength", 40))

    tilesets = _read_tilesets(data.get("tilesets", []), path.parent)
    layers = _read_layers(
        data.get("layers", []),
        data["width"],
        data["height"],
    )
    _reset_object_id_counter(layers)

    return HexMap(
        name=path.stem,
        cols=data["width"],
        rows=data["height"],
        hex_size=hex_size,
        orientation=orientation,
        tilesets=tilesets,
        layers=layers,
        source_path=str(path),
    )


# ---------------------------------------------------------------------------
# Tileset parsing
# ---------------------------------------------------------------------------

def _read_tilesets(ts_list: list, map_dir: Path) -> list[Tileset]:
    result = []
    for ts_data in ts_list:
        result.append(_read_tileset(ts_data, map_dir))
    return result


def _read_tileset(ts_data: dict, map_dir: Path) -> Tileset:
    # Resolve image path
    source = ""
    if "image" in ts_data:
        rel = ts_data["image"]
        resolved = (map_dir / rel).resolve()
        source = str(resolved)

    tw = ts_data.get("tilewidth", 32)
    th = ts_data.get("tileheight", 32)
    first_gid = ts_data.get("firstgid", 1)
    columns = ts_data.get("columns", 8) or 8
    tile_count = ts_data.get("tilecount", 0)

    # Build a map of tile entry data keyed by 0-based id
    raw_tiles: dict[int, dict] = {}
    for entry in ts_data.get("tiles", []):
        raw_tiles[entry["id"]] = entry

    # If no per-tile data was saved, generate stubs from tilecount
    tiles: list[TileDefinition] = []
    if raw_tiles:
        for zero_id, entry in sorted(raw_tiles.items()):
            tile_id = zero_id + 1  # convert to 1-based
            name = entry.get("type", f"Tile {tile_id}")
            color, category = _extract_tile_props(entry.get("properties", []))
            sheet_col = zero_id % columns
            sheet_row = zero_id // columns
            tiles.append(TileDefinition(
                id=tile_id,
                name=name,
                color=color,
                category=category,
                sheet_col=sheet_col,
                sheet_row=sheet_row,
            ))
    else:
        # External tileset with no per-tile metadata — build stubs
        for zero_id in range(tile_count):
            tile_id = zero_id + 1
            sheet_col = zero_id % columns
            sheet_row = zero_id // columns
            tiles.append(TileDefinition(
                id=tile_id,
                name=f"Tile {tile_id}",
                color=(200, 200, 200),
                category=TileCategory.TERRAIN,
                sheet_col=sheet_col,
                sheet_row=sheet_row,
            ))

    return Tileset(
        name=ts_data.get("name", "Unnamed"),
        source=source,
        tile_width=tw,
        tile_height=th,
        tiles=tiles,
        first_gid=first_gid,
    )


def _extract_tile_props(
    props: list,
) -> tuple[tuple[int, int, int], TileCategory]:
    """Extract color and category from a Tiled properties list."""
    prop_map = {p["name"]: p["value"] for p in props}
    r = int(prop_map.get("color_r", 200))
    g = int(prop_map.get("color_g", 200))
    b = int(prop_map.get("color_b", 200))
    cat_name = prop_map.get("category", "TERRAIN")
    try:
        category = TileCategory[cat_name]
    except KeyError:
        category = TileCategory.TERRAIN
    return (r, g, b), category


# ---------------------------------------------------------------------------
# Layer parsing
# ---------------------------------------------------------------------------

def _read_layers(layer_list: list, map_w: int, map_h: int) -> list:
    layers = []
    for ld in layer_list:
        layer_type = ld.get("type")
        if layer_type == "tilelayer":
            layers.append(_read_tile_layer(ld, map_w, map_h))
        elif layer_type == "objectgroup":
            layers.append(_read_object_layer(ld))
    return layers


def _read_tile_layer(ld: dict, map_w: int, map_h: int) -> TileLayer:
    width = ld.get("width", map_w)
    height = ld.get("height", map_h)
    flat_data = ld.get("data", [])
    return TileLayer.from_flat(
        name=ld.get("name", "Layer"),
        width=width,
        height=height,
        flat_data=flat_data,
        visible=ld.get("visible", True),
        opacity=ld.get("opacity", 1.0),
        offset_x=int(ld.get("offsetx", 0)),
        offset_y=int(ld.get("offsety", 0)),
    )


def _read_object_layer(ld: dict) -> ObjectLayer:
    layer = ObjectLayer(
        name=ld.get("name", "Objects"),
        visible=ld.get("visible", True),
        opacity=ld.get("opacity", 1.0),
        offset_x=int(ld.get("offsetx", 0)),
        offset_y=int(ld.get("offsety", 0)),
        color=ld.get("color", "#a0a0a0"),
    )
    for obj_data in ld.get("objects", []):
        layer.add_object(_read_object(obj_data))
    return layer


# ---------------------------------------------------------------------------
# Object parsing
# ---------------------------------------------------------------------------

def _read_object(obj_data: dict) -> MapObject:
    oid = obj_data.get("id", 0)

    # Detect shape
    if obj_data.get("point"):
        shape = ObjectShape.POINT
    elif obj_data.get("ellipse"):
        shape = ObjectShape.ELLIPSE
    elif "polygon" in obj_data:
        shape = ObjectShape.POLYGON
    elif "gid" in obj_data:
        shape = ObjectShape.TILE
    else:
        shape = ObjectShape.RECTANGLE

    polygon: list[tuple[float, float]] = []
    if shape == ObjectShape.POLYGON:
        polygon = [(pt["x"], pt["y"]) for pt in obj_data.get("polygon", [])]

    # Parse custom properties back to a dict
    props: dict = {}
    for p in obj_data.get("properties", []):
        props[p["name"]] = p["value"]

    # Construct with explicit object_id to avoid touching the counter
    obj = MapObject(
        name=obj_data.get("name", ""),
        object_type=obj_data.get("type", ""),
        x=float(obj_data.get("x", 0)),
        y=float(obj_data.get("y", 0)),
        width=float(obj_data.get("width", 0)),
        height=float(obj_data.get("height", 0)),
        shape=shape,
        gid=obj_data.get("gid", 0),
        visible=obj_data.get("visible", True),
        properties=props,
        polygon=polygon,
        object_id=oid,
    )
    return obj


# ---------------------------------------------------------------------------
# ID counter reset
# ---------------------------------------------------------------------------

def _reset_object_id_counter(layers: list) -> None:
    """After loading all objects, advance the counter past the highest seen ID."""
    max_id = 0
    for layer in layers:
        if isinstance(layer, ObjectLayer):
            for obj in layer.objects:
                if obj.object_id > max_id:
                    max_id = obj.object_id
    if max_id > 0:
        MapObject.reset_id_counter(max_id)
