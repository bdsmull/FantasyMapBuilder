"""
Import a single map from another world set (or an unpacked .mapset) into a
target world set, bringing along the tilesets it uses.

Two steps, so the user can decide before anything is written:

- ``plan_import``  reports whether the map name is taken and, per tileset,
                   whether the target already has it: ``new``, ``identical`` or
                   ``conflict`` (same name, different tiles), with a summary.
- ``import_map``   copies the map with the user's choice for each conflict:
                     merge       combine into the target's tileset (color-only only);
                     keep_both   store the imported one under a new name;
                     use_target  point the map at the target's version.

Merging never changes how an existing map looks: tiles are matched by ID; where
the same ID holds a different tile, the target's tile keeps the ID and the
imported tile is added under a new ID (the imported map is renumbered).
The imported map arrives unplaced (not in the target's hierarchy).
"""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any, Optional

from server.tileset_files import (
    SWATCH_PROPERTY, TILESETS_DIR, _comparable, _resolve_source,
    externalize_tilesets, image_url, same_image, same_tileset, safe_file_stem, tsj_image_file,
)

#: Tiled stores flip/rotation flags in the top four bits of a GID.
GID_FLAGS = 0xF0000000

CHOICES = ("merge", "keep_both", "use_target")


class ImportError_(ValueError):
    """An import that can't proceed (unknown map, invalid choice...)."""


# ---------------------------------------------------------------------------
# Reading tilesets
# ---------------------------------------------------------------------------

def _load_tsj(path: Path) -> dict:
    tsj = json.loads(path.read_text(encoding="utf-8"))
    for key in ("type", "version", "tiledversion"):
        tsj.pop(key, None)
    return tsj


def _source_tilesets(map_data: dict, world_set_dir: Path) -> list[tuple[dict, dict, Optional[Path]]]:
    """(map entry, tileset content, real image file or None) for each tileset of a map,
    whether referenced (.tsj) or still embedded."""
    result = []
    for entry in map_data.get("tilesets", []):
        if entry.get("source"):
            path = _resolve_source(entry["source"], world_set_dir)
            if path is None or not path.is_file():
                raise ImportError_(f"Tileset file {entry['source']} is missing")
            content = _load_tsj(path)
            image = tsj_image_file(content, path.parent)
        else:
            content = {k: v for k, v in copy.deepcopy(entry).items() if k != "firstgid"}
            img = Path(str(content.get("image") or ""))
            image = img if img.is_absolute() and img.is_file() else None
        result.append((entry, content, image))
    return result


def _target_tileset(target_dir: Path, name: str) -> Optional[tuple[Path, dict]]:
    path = target_dir / TILESETS_DIR / f"{safe_file_stem(name)}.tsj"
    return (path, _load_tsj(path)) if path.is_file() else None


def _tile_count(tileset: dict) -> int:
    ids = [t["id"] for t in tileset.get("tiles", [])]
    return max([int(tileset.get("tilecount", 0))] + [i + 1 for i in ids])


# ---------------------------------------------------------------------------
# Comparing and merging
# ---------------------------------------------------------------------------

def _tiles_by_id(tileset: dict) -> dict[int, dict]:
    return {t["id"]: t for t in _comparable(tileset)["tiles"]}


def _settings(tileset: dict) -> dict:
    return {k: v for k, v in _comparable(tileset).items() if k not in ("tiles", "tilecount", "columns", "name")}


def can_merge(target: dict, target_image: Optional[Path], source: dict, source_image: Optional[Path]) -> bool:
    """Merging by tile ID only makes sense for color-only tilesets with the same tile size."""
    return target_image is None and source_image is None and _settings(target) == _settings(source)


def merge_tilesets(target: dict, source: dict) -> tuple[dict, dict[int, int]]:
    """Combine two tilesets. Returns (merged tileset, source tile ID -> merged ID).

    Target tiles keep their IDs. A source tile with an ID the target lacks keeps
    its ID; one whose ID holds a different tile in the target is appended.
    """
    merged = copy.deepcopy(target)
    target_tiles = _tiles_by_id(target)
    raw_source = {t["id"]: t for t in source.get("tiles", [])}
    next_id = _tile_count(target)
    id_map: dict[int, int] = {}
    # Source IDs the target doesn't use are kept, so reserve them first.
    free_ids = {i for i in raw_source if i not in target_tiles}
    next_id = max([next_id] + [i + 1 for i in free_ids])
    for sid, tile in sorted(_tiles_by_id(source).items()):
        if target_tiles.get(sid) == tile:
            id_map[sid] = sid
        elif sid in free_ids:
            id_map[sid] = sid
            merged["tiles"].append(copy.deepcopy(raw_source[sid]))
        else:
            id_map[sid] = next_id
            merged["tiles"].append({**copy.deepcopy(raw_source[sid]), "id": next_id})
            next_id += 1
    merged["tiles"].sort(key=lambda t: t["id"])
    merged["tilecount"] = max(next_id, _tile_count(merged))
    return merged, id_map


def _summary(target: dict, source: dict) -> dict[str, Any]:
    t, s = _tiles_by_id(target), _tiles_by_id(source)
    differing = [
        {"id": i, "target": t[i].get("type", ""), "imported": s[i].get("type", "")}
        for i in sorted(set(t) & set(s)) if t[i] != s[i]
    ]
    return {
        "targetTiles": len(t),
        "importedTiles": len(s),
        "sameTiles": sum(1 for i in set(t) & set(s) if t[i] == s[i]),
        "differingTiles": differing,
        "onlyImported": sorted(set(s) - set(t)),
    }


# ---------------------------------------------------------------------------
# Plan
# ---------------------------------------------------------------------------

def _read_map(world_set_dir: Path, map_name: str) -> dict:
    path = world_set_dir / "maps" / f"{map_name}.tmj"
    if not path.is_file():
        raise ImportError_(f"Map '{map_name}' not found")
    return json.loads(path.read_text(encoding="utf-8"))


def plan_import(source_dir: Path, map_name: str, target_dir: Path) -> dict[str, Any]:
    """Describe what importing ``map_name`` into ``target_dir`` would involve."""
    map_data = _read_map(source_dir, map_name)
    tilesets = []
    for _, content, image in _source_tilesets(map_data, source_dir):
        name = str(content.get("name", ""))
        existing = _target_tileset(target_dir, name)
        if existing is None:
            tilesets.append({"name": name, "status": "new"})
            continue
        path, target = existing
        target_image = tsj_image_file(target, path.parent)
        if same_tileset(target, content) and same_image(target_image, image):
            tilesets.append({"name": name, "status": "identical"})
        else:
            tilesets.append({
                "name": name, "status": "conflict",
                "canMerge": can_merge(target, target_image, content, image),
                "summary": _summary(target, content),
            })
    return {
        "map": map_name,
        "mapExists": (target_dir / "maps" / f"{map_name}.tmj").exists(),
        "tilesets": tilesets,
    }


# ---------------------------------------------------------------------------
# Import
# ---------------------------------------------------------------------------

def _remap_gid(gid: int, old: list[tuple[int, int, int, dict[int, int]]]) -> int:
    """Map a GID through (old firstgid, count, new firstgid, id map) ranges, keeping flags."""
    flags, raw = gid & GID_FLAGS, gid & ~GID_FLAGS
    if raw == 0:
        return gid
    for old_first, count, new_first, id_map in old:
        if old_first <= raw < old_first + count:
            local = raw - old_first
            return flags | (new_first + id_map.get(local, local))
    return gid  # GID outside every tileset: leave it alone


def _remap_layers(layers: list, ranges: list) -> list:
    result = []
    for layer in layers:
        layer = copy.deepcopy(layer)
        if layer.get("type") == "tilelayer" and isinstance(layer.get("data"), list):
            layer["data"] = [_remap_gid(g, ranges) for g in layer["data"]]
        elif layer.get("type") == "objectgroup":
            for obj in layer.get("objects", []):
                if obj.get("gid"):
                    obj["gid"] = _remap_gid(obj["gid"], ranges)
        elif layer.get("type") == "group":
            layer["layers"] = _remap_layers(layer.get("layers", []), ranges)
        result.append(layer)
    return result


def import_map(
    source_dir: Path,
    map_name: str,
    target_dir: Path,
    new_name: Optional[str],
    choices: dict[str, str],
    source_units: Optional[str],
    target_units: Optional[str],
) -> dict[str, Any]:
    """Copy a map into the target world set. ``choices`` resolves each conflicting
    tileset by name. Units the map inherited from its old world set are pinned
    when the target's default differs, so the map keeps its size."""
    target_name = new_name or map_name
    target_path = target_dir / "maps" / f"{target_name}.tmj"
    if target_path.exists():
        raise FileExistsError(target_name)

    map_data = _read_map(source_dir, map_name)
    plan = {t["name"]: t for t in plan_import(source_dir, map_name, target_dir)["tilesets"]}

    new_tilesets, ranges = [], []
    next_gid = 1
    for entry, content, image in _source_tilesets(map_data, source_dir):
        name = str(content.get("name", ""))
        status = plan[name]["status"]
        id_map: dict[int, int] = {}
        if status == "identical":
            path, resolved = _target_tileset(target_dir, name)
            tileset = {**resolved, "source": f"../{TILESETS_DIR}/{path.name}"}
        elif status == "new":
            tileset = {**content, "image": str(image) if image else ""}
        else:
            choice = choices.get(name)
            if choice not in CHOICES:
                raise ImportError_(f"Choose merge, keep_both or use_target for tileset '{name}'")
            path, target = _target_tileset(target_dir, name)
            if choice == "use_target":
                tileset = {**target, "source": f"../{TILESETS_DIR}/{path.name}"}
            elif choice == "merge":
                if not plan[name]["canMerge"]:
                    raise ImportError_(f"Tileset '{name}' can't be merged (it has a sprite sheet or a different tile size)")
                merged, id_map = merge_tilesets(target, content)
                tileset = {**merged, "source": f"../{TILESETS_DIR}/{path.name}"}
            else:  # keep_both: no source + different content -> stored under a new name
                tileset = {**content, "image": str(image) if image else ""}
        if not tileset.get("image") or any(p.get("name") == SWATCH_PROPERTY for p in tileset.get("properties", [])):
            # color-only (or a stored swatch): let externalize regenerate the swatch
            tileset["image"] = ""
            tileset["properties"] = [p for p in tileset.get("properties", []) if p.get("name") != SWATCH_PROPERTY]
            if not tileset["properties"]:
                del tileset["properties"]
        elif not Path(str(tileset["image"])).is_absolute():
            # a sprite sheet already stored in the target: reference it, don't copy it
            tileset["image"] = image_url(target_dir.name, str(tileset["image"]))
        count = _tile_count(tileset)
        ranges.append((entry["firstgid"], _tile_count(content), next_gid, id_map))
        new_tilesets.append({"firstgid": next_gid, **tileset})
        next_gid += count

    result = {**map_data, "tilesets": new_tilesets, "layers": _remap_layers(map_data.get("layers", []), ranges)}
    props = result.get("properties", [])
    if not any(p["name"] == "units" for p in props) and not result.get("units") \
            and (source_units or "metric") != (target_units or "metric"):
        result["properties"] = props + [{"name": "units", "type": "string", "value": source_units or "metric"}]

    from server.api.maps import format_tmj  # local import: avoids an import cycle
    on_disk, refs = externalize_tilesets(result, target_dir, target_dir.name)
    target_path.parent.mkdir(parents=True, exist_ok=True)
    target_path.write_text(format_tmj(on_disk), encoding="utf-8")
    return {"imported": target_name, "tilesets": refs}
