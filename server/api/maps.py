"""
Map file CRUD API. Maps live in their world set's folder:
<data folder>/<world set>/maps/<map>.tmj (see server/data_dir.py).

Endpoints
---------
GET    /api/maps                                   List all maps: [{worldSet, name}]
GET    /api/world_sets/{ws}/maps                   List a world set's map names
GET    /api/world_sets/{ws}/maps/{name}            Load a map (returns TMJ JSON)
POST   /api/world_sets/{ws}/maps/{name}            Save a map (accepts TMJ JSON body)
DELETE /api/world_sets/{ws}/maps/{name}            Delete a map file
POST   /api/world_sets/{ws}/maps/upload            Upload a .tmj file (multipart)
GET    /api/world_sets/{ws}/maps/{name}/download   Download raw .tmj file

The upload route must be registered before the {name} routes.
"""

from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse

from server import data_dir as dd

router = APIRouter(tags=["maps"])


def _maps_dir(world_set: str) -> Path:
    """maps/ folder of an existing world set (created if missing)."""
    folder = dd.existing_world_set_dir(world_set) / "maps"
    folder.mkdir(exist_ok=True)
    return folder


def _map_path(world_set: str, name: str) -> Path:
    """Resolve a map name to its .tmj path, raising 400/404 as appropriate."""
    stem = dd.check_name(name.removesuffix(".tmj"), "map")
    return _maps_dir(world_set) / f"{stem}.tmj"


def _existing_map_path(world_set: str, name: str) -> Path:
    path = _map_path(world_set, name)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Map '{name}' not found in world set '{world_set}'")
    return path


def format_tmj(data: dict) -> str:
    """Serialize TMJ JSON the way Tiled does: indented, but with each tile
    layer's ``data`` array written one map row per line.

    Plain ``indent=2`` puts every tile ID on its own line, which makes map
    files roughly three times larger and hard to read or diff.
    """
    rows_by_key: dict[str, tuple[list[int], int]] = {}

    def _replace_data(layers: list) -> list:
        result = []
        for layer in layers:
            if (
                layer.get("type") == "tilelayer"
                and isinstance(layer.get("data"), list)
                and isinstance(layer.get("width"), int)
                and layer["width"] > 0
            ):
                key = f"@@TILE_DATA_{len(rows_by_key)}@@"
                rows_by_key[key] = (layer["data"], layer["width"])
                layer = {**layer, "data": key}
            elif layer.get("type") == "group" and isinstance(layer.get("layers"), list):
                layer = {**layer, "layers": _replace_data(layer["layers"])}
            result.append(layer)
        return result

    payload = data
    if isinstance(data.get("layers"), list):
        payload = {**data, "layers": _replace_data(data["layers"])}
    text = json.dumps(payload, indent=2, ensure_ascii=False)

    for key, (values, width) in rows_by_key.items():
        token = f'"{key}"'
        line_start = text.rfind("\n", 0, text.index(token)) + 1
        indent = text[line_start:len(text) - len(text[line_start:].lstrip())]
        rows = [
            indent + "  " + ", ".join(str(v) for v in values[i:i + width])
            for i in range(0, len(values), width)
        ]
        text = text.replace(token, "[\n" + ",\n".join(rows) + "\n" + indent + "]", 1)
    return text


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/maps")
def list_all_maps() -> list[dict]:
    """Every map in every world set, sorted by world set then name."""
    return [
        {"worldSet": ws, "name": p.stem}
        for ws in dd.world_set_names()
        for p in sorted((dd.data_dir() / ws / "maps").glob("*.tmj"))
    ]


@router.get("/world_sets/{world_set}/maps")
def list_maps(world_set: str) -> list[str]:
    """Return sorted list of a world set's map names (without .tmj extension)."""
    return sorted(p.stem for p in _maps_dir(world_set).glob("*.tmj"))


@router.post("/world_sets/{world_set}/maps/upload", status_code=201)
async def upload_map(world_set: str, file: UploadFile):
    """Upload a .tmj file. The filename (without extension) becomes the map name."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")
    path = _map_path(world_set, Path(file.filename).stem)
    content = await file.read()
    # Validate it is valid JSON before saving
    try:
        json.loads(content)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=422, detail=f"Invalid JSON: {exc}") from exc
    path.write_bytes(content)
    return {"uploaded": path.stem}


@router.get("/world_sets/{world_set}/maps/{name}")
def get_map(world_set: str, name: str):
    """Load a .tmj file and return its JSON content."""
    path = _existing_map_path(world_set, name)
    return JSONResponse(content=json.loads(path.read_text(encoding="utf-8")))


@router.post("/world_sets/{world_set}/maps/{name}", status_code=200)
async def save_map(world_set: str, name: str, request_body: dict):
    """Save (create or overwrite) a map from TMJ JSON body."""
    path = _map_path(world_set, name)
    path.write_text(format_tmj(request_body), encoding="utf-8")
    return {"saved": path.stem}


@router.delete("/world_sets/{world_set}/maps/{name}", status_code=200)
def delete_map(world_set: str, name: str):
    """Delete a saved map file."""
    path = _existing_map_path(world_set, name)
    path.unlink()
    return {"deleted": path.stem}


@router.get("/world_sets/{world_set}/maps/{name}/download")
def download_map(world_set: str, name: str):
    """Return the raw .tmj file as a download."""
    path = _existing_map_path(world_set, name)
    return FileResponse(
        path=str(path),
        media_type="application/json",
        filename=path.name,
        headers={"Content-Disposition": f'attachment; filename="{path.name}"'},
    )
