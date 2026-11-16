"""
Import a single map (with its tilesets) into a world set — from another world
set, or from a .mapset package.

Endpoints
---------
POST /api/mapsets/inspect                    Unpack a .mapset to a temporary staging
                                             area (multipart file); returns
                                             {staging, worldSet, maps} to import from
POST /api/world_sets/{ws}/import_map/plan    What importing would involve (JSON body below)
POST /api/world_sets/{ws}/import_map         Import (JSON body below + newName, tilesetChoices)

Body: {"source": {"worldSet": name} or {"staging": token}, "map": name,
       "newName": optional, "tilesetChoices": {tileset name: "merge"|"keep_both"|"use_target"}}

Staged packages live in <data>/.staging/<token>/ and are removed after an hour.
"""

from __future__ import annotations

import json
import re
import secrets
import shutil
import time
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, UploadFile
from pydantic import BaseModel, Field

from server import data_dir as dd
from server.api.mapsets import extract_members, open_mapset
from server.map_import import ImportError_, import_map, plan_import

router = APIRouter(tags=["map_imports"])

STAGING_DIR = ".staging"
STAGING_MAX_AGE_SECONDS = 3600
_TOKEN_RE = re.compile(r"^[0-9a-f]{32}$")


class ImportSource(BaseModel):
    worldSet: Optional[str] = None
    staging: Optional[str] = None


class ImportRequest(BaseModel):
    source: ImportSource
    map: str
    newName: Optional[str] = None
    tilesetChoices: dict[str, str] = Field(default_factory=dict)


def _staging_root() -> Path:
    return dd.data_dir() / STAGING_DIR


def _clean_old_staging() -> None:
    root = _staging_root()
    if not root.is_dir():
        return
    cutoff = time.time() - STAGING_MAX_AGE_SECONDS
    for folder in root.iterdir():
        if folder.is_dir() and folder.stat().st_mtime < cutoff:
            shutil.rmtree(folder, ignore_errors=True)


def _world_set_units(folder: Path) -> Optional[str]:
    path = folder / f"{folder.name}{dd.WORLD_SET_SUFFIX}"
    return json.loads(path.read_text(encoding="utf-8")).get("units") if path.is_file() else None


def _source_dir(source: ImportSource) -> Path:
    if source.worldSet:
        return dd.existing_world_set_dir(source.worldSet)
    if source.staging and _TOKEN_RE.match(source.staging):
        folders = [p for p in (_staging_root() / source.staging).glob("*") if p.is_dir()]
        if len(folders) == 1:
            return folders[0]
    raise HTTPException(status_code=404, detail="Import source not found (a staged package expires after an hour)")


@router.post("/mapsets/inspect", status_code=201)
async def inspect_mapset(file: UploadFile):
    """Unpack a .mapset to a staging area so single maps can be imported from it."""
    _clean_old_staging()
    zf, source_name, members = open_mapset(await file.read())
    token = secrets.token_hex(16)
    folder = _staging_root() / token / source_name
    with zf:
        try:
            extract_members(zf, members, folder)
        except Exception:
            shutil.rmtree(folder.parent, ignore_errors=True)
            raise
    return {
        "staging": token,
        "worldSet": source_name,
        "maps": sorted(p.stem for p in (folder / "maps").glob("*.tmj")),
    }


@router.post("/world_sets/{world_set}/import_map/plan")
def plan_map_import(world_set: str, request: ImportRequest):
    """Report name and tileset clashes before importing."""
    target = dd.existing_world_set_dir(world_set)
    source = _source_dir(request.source)
    try:
        plan = plan_import(source, dd.check_name(request.map, "map"), target)
    except ImportError_ as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    source_units, target_units = _world_set_units(source), _world_set_units(target)
    plan["unitsPinned"] = (source_units or "metric") if (source_units or "metric") != (target_units or "metric") else None
    return plan


@router.post("/world_sets/{world_set}/import_map", status_code=201)
def run_map_import(world_set: str, request: ImportRequest):
    """Copy a map and its tilesets into the world set, resolving tileset clashes as chosen."""
    target = dd.existing_world_set_dir(world_set)
    source = _source_dir(request.source)
    if source.resolve() == target.resolve():
        raise HTTPException(status_code=400, detail="Source and target are the same world set")
    new_name = dd.check_name(request.newName.strip(), "map") if request.newName else None
    try:
        return import_map(
            source, dd.check_name(request.map, "map"), target, new_name, request.tilesetChoices,
            _world_set_units(source), _world_set_units(target),
        )
    except FileExistsError as exc:
        raise HTTPException(status_code=409, detail=f"A map named '{exc}' already exists in '{world_set}'") from exc
    except ImportError_ as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
