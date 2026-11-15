"""
Shared tilesets stored as Tiled external tileset files (.tsj).

On disk, each world set keeps its tilesets in ``<world set>/tilesets/``:

    tilesets/<Name>.tsj   Tiled JSON tileset
    tilesets/<Name>.png   image: a generated color swatch, or an uploaded sprite sheet

and maps reference them as ``{"firstgid": N, "source": "../tilesets/<Name>.tsj"}``,
so every map in the world set shares one copy and Tiled can open the maps in place.

The editor works with complete (embedded) tilesets. The server converts:

- ``inline_tilesets``      map file  -> editor: replaces each reference with the
                           tileset's content (keeping ``source``).
- ``externalize_tilesets`` editor    -> map file: writes each tileset to its .tsj and
                           replaces it with a reference.

Image paths seen by the editor are URLs (``/api/world_sets/<ws>/tilesets/<file>``);
color-only tilesets have ``image: ""`` in the editor, which draws tile colors. On disk
they get a generated swatch PNG (marked by the ``mapeditor.swatch`` property) so Tiled
can draw them too, stretched to the grid cell.
"""

from __future__ import annotations

import copy
import json
import math
import re
import shutil
from pathlib import Path
from typing import Any, Optional
from urllib.parse import quote, unquote

TILESETS_DIR = "tilesets"
SWATCH_PROPERTY = "mapeditor.swatch"
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif", ".webp"}

_UNSAFE_FILE_CHARS = re.compile(r'[\\/:*?"<>|\x00-\x1f]')
_DEFAULT_COLOR = (200, 200, 200)


def image_url(world_set: str, file_name: str) -> str:
    """URL the editor uses to load an image from a world set's tilesets/ folder."""
    return f"/api/world_sets/{quote(world_set)}/tilesets/{quote(file_name)}"


def _url_prefix(world_set: str) -> str:
    return image_url(world_set, "")


def safe_file_stem(name: str) -> str:
    """A file name stem derived from a tileset name (unsafe characters replaced)."""
    stem = _UNSAFE_FILE_CHARS.sub("_", name).strip(" .")
    return stem or "tileset"


# ---------------------------------------------------------------------------
# Comparison
# ---------------------------------------------------------------------------

def _without_swatch(props: Optional[list]) -> list:
    return [p for p in (props or []) if p.get("name") != SWATCH_PROPERTY]


def _comparable(tileset: dict) -> dict:
    """Tileset content that matters for identity: ignores map placement, image
    location, generated swatch markers and property order (Tiled re-sorts them)."""
    skip = {"firstgid", "source", "image", "imagewidth", "imageheight", "properties",
            "tilerendersize", "fillmode", "type", "version", "tiledversion"}
    result = {k: v for k, v in tileset.items() if k not in skip}
    result["properties"] = sorted(_without_swatch(tileset.get("properties")), key=lambda p: p["name"])
    result["tiles"] = sorted(
        (
            {**t, "properties": sorted(t.get("properties", []), key=lambda p: p["name"])}
            for t in tileset.get("tiles", [])
        ),
        key=lambda t: t["id"],
    )
    return result


def same_tileset(a: dict, b: dict) -> bool:
    """True if two tilesets have the same tiles and settings."""
    return _comparable(a) == _comparable(b)


# ---------------------------------------------------------------------------
# Swatch images
# ---------------------------------------------------------------------------

def _tile_color(tile: dict) -> tuple[int, int, int]:
    props = {p["name"]: p["value"] for p in tile.get("properties", [])}
    try:
        return (int(props["color_r"]), int(props["color_g"]), int(props["color_b"]))
    except (KeyError, TypeError, ValueError):
        return _DEFAULT_COLOR


def write_swatch(tileset: dict, path: Path) -> None:
    """Write a PNG sprite sheet with each tile filled with its color, and point
    the tileset's image fields at it (file name relative to the .tsj)."""
    from PIL import Image  # imported lazily: only needed when saving tilesets

    tw, th = int(tileset["tilewidth"]), int(tileset["tileheight"])
    tiles = tileset.get("tiles", [])
    count = max([int(tileset.get("tilecount", 0))] + [t["id"] + 1 for t in tiles])
    columns = max(1, int(tileset.get("columns") or 1))
    rows = max(1, math.ceil(count / columns))
    image = Image.new("RGBA", (columns * tw, rows * th), (0, 0, 0, 0))
    for tile in tiles:
        x, y = (tile["id"] % columns) * tw, (tile["id"] // columns) * th
        image.paste((*_tile_color(tile), 255), (x, y, x + tw, y + th))
    image.save(path)

    tileset.update({
        "image": path.name, "imagewidth": image.width, "imageheight": image.height,
        "columns": columns, "tilecount": count,
        # Stretch tiles to the map's grid cell in Tiled (a hex cell is larger than a swatch tile)
        "tilerendersize": "grid", "fillmode": "stretch",
    })
    tileset["properties"] = _without_swatch(tileset.get("properties")) + [
        {"name": SWATCH_PROPERTY, "type": "bool", "value": True},
    ]


# ---------------------------------------------------------------------------
# Map file -> editor
# ---------------------------------------------------------------------------

def _resolve_source(source: str, world_set_dir: Path) -> Optional[Path]:
    """Path of a tileset file referenced from a map in <world set>/maps/,
    or None if it points outside the world set's tilesets/ folder."""
    path = (world_set_dir / "maps" / source).resolve()
    tilesets = (world_set_dir / TILESETS_DIR).resolve()
    return path if path.parent == tilesets else None


def inline_tilesets(map_data: dict, world_set_dir: Path, world_set: str) -> dict:
    """Replace external tileset references with their content, for the editor."""
    result = dict(map_data)
    inlined = []
    for entry in map_data.get("tilesets", []):
        source = entry.get("source")
        if not source:
            inlined.append(entry)  # embedded (e.g. an uploaded map); externalized on next save
            continue
        path = _resolve_source(source, world_set_dir)
        if path is None or not path.is_file():
            inlined.append({
                "firstgid": entry["firstgid"], "source": source,
                "name": f"(missing) {source}", "tilewidth": map_data.get("tilewidth", 32),
                "tileheight": map_data.get("tileheight", 32), "tilecount": 0, "columns": 1,
                "image": "", "tiles": [],
            })
            continue
        tileset = json.loads(path.read_text(encoding="utf-8"))
        for key in ("type", "version", "tiledversion", "tilerendersize", "fillmode"):
            tileset.pop(key, None)
        props = tileset.get("properties", [])
        if any(p.get("name") == SWATCH_PROPERTY and p.get("value") for p in props):
            tileset["image"] = ""  # editor draws tile colors
            tileset.pop("imagewidth", None)
            tileset.pop("imageheight", None)
        elif tileset.get("image"):
            tileset["image"] = image_url(world_set, tileset["image"])
        if _without_swatch(props):
            tileset["properties"] = _without_swatch(props)
        else:
            tileset.pop("properties", None)
        inlined.append({"firstgid": entry["firstgid"], "source": source, **tileset})
    result["tilesets"] = inlined
    return result


# ---------------------------------------------------------------------------
# Editor -> map file
# ---------------------------------------------------------------------------

def _unique_stem(folder: Path, stem: str) -> str:
    if not (folder / f"{stem}.tsj").exists():
        return stem
    n = 2
    while (folder / f"{stem} ({n}).tsj").exists():
        n += 1
    return f"{stem} ({n})"


def _store_image(image: str, world_set: str, tilesets_dir: Path, stem: str) -> Optional[str]:
    """Return the file name (in tilesets/) for a tileset image, copying an
    outside image in. None means no usable image (draw a swatch instead)."""
    prefix = _url_prefix(world_set)
    if image.startswith(prefix):
        name = unquote(image[len(prefix):])
        return name if (tilesets_dir / name).is_file() and "/" not in name and "\\" not in name else None
    source = Path(image)
    if source.is_absolute() and source.is_file() and source.suffix.lower() in IMAGE_SUFFIXES:
        target = tilesets_dir / f"{stem}{source.suffix.lower()}"
        shutil.copyfile(source, target)
        return target.name
    return None


def externalize_tilesets(
    map_data: dict, world_set_dir: Path, world_set: str,
) -> tuple[dict, list[dict[str, Any]]]:
    """Write each tileset to its .tsj and return (map for disk, tileset references).

    - A tileset with a ``source`` overwrites that file (edits are shared by design).
    - A new tileset reuses an existing .tsj with identical content; if the name is
      taken by a different tileset, it gets a unique name instead of overwriting it.
    The references ({firstgid, source, name}) let the editor record where each went.
    """
    tilesets_dir = world_set_dir / TILESETS_DIR
    tilesets_dir.mkdir(parents=True, exist_ok=True)
    result = dict(map_data)
    entries, refs = [], []
    for tileset in map_data.get("tilesets", []):
        firstgid = tileset["firstgid"]
        content = {k: v for k, v in copy.deepcopy(tileset).items() if k not in ("firstgid", "source")}
        if not content.get("tiles") and not content.get("tilecount") and str(content.get("name", "")).startswith("(missing)"):
            entries.append({"firstgid": firstgid, "source": tileset["source"]})  # keep a broken reference as-is
            refs.append({"firstgid": firstgid, "source": tileset["source"], "name": content.get("name", "")})
            continue

        path = _resolve_source(tileset["source"], world_set_dir) if tileset.get("source") else None
        if path is None:
            stem = safe_file_stem(str(content.get("name", "tileset")))
            existing = tilesets_dir / f"{stem}.tsj"
            if existing.is_file():
                if not same_tileset(json.loads(existing.read_text(encoding="utf-8")), content):
                    stem = _unique_stem(tilesets_dir, stem)
                    content["name"] = stem
            path = tilesets_dir / f"{stem}.tsj"

        image_name = _store_image(str(content.get("image") or ""), world_set, tilesets_dir, path.stem)
        if image_name:
            content["image"] = image_name
            content["properties"] = _without_swatch(content.get("properties"))
            if not content["properties"]:
                del content["properties"]
        else:
            write_swatch(content, tilesets_dir / f"{path.stem}.png")

        tsj = {"type": "tileset", "version": "1.10", "tiledversion": "1.10.0", **content}
        path.write_text(json.dumps(tsj, indent=2, ensure_ascii=False), encoding="utf-8")
        source = f"../{TILESETS_DIR}/{path.name}"
        entries.append({"firstgid": firstgid, "source": source})
        refs.append({"firstgid": firstgid, "source": source, "name": content["name"]})
    result["tilesets"] = entries
    return result, refs
