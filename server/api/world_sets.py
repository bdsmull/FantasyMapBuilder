"""
World set CRUD API.

Each world set is a folder in the data folder (see server/data_dir.py)
holding ``<name>.worldset.json`` and a ``maps/`` folder.

Endpoints
---------
GET    /api/data_dir             Location of the data folder (read-only)
GET    /api/world_sets           List world set names
GET    /api/world_sets/{name}    Load a world set (returns WorldSet JSON)
POST   /api/world_sets/{name}    Create or save a world set (accepts WorldSet JSON body)
DELETE /api/world_sets/{name}    Move a world set folder, maps included, to <data>/.trash/
"""

from __future__ import annotations

import json
import shutil
from datetime import datetime

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from server import data_dir as dd

router = APIRouter(tags=["world_sets"])


@router.get("/data_dir")
def get_data_dir() -> dict:
    """Return the data folder's location, for display."""
    return {"dataDir": str(dd.data_dir())}


@router.get("/world_sets")
def list_world_sets() -> list[str]:
    """Return sorted list of world set names."""
    return dd.world_set_names()


@router.get("/world_sets/{name}")
def get_world_set(name: str):
    """Load a world set's .worldset.json and return its JSON content."""
    folder = dd.existing_world_set_dir(name)
    path = folder / f"{folder.name}{dd.WORLD_SET_SUFFIX}"
    return JSONResponse(content=json.loads(path.read_text(encoding="utf-8")))


@router.post("/world_sets/{name}", status_code=200)
async def save_world_set(name: str, request_body: dict):
    """Create (folder + maps/) or overwrite a world set from JSON body."""
    folder = dd.world_set_dir(name)
    (folder / "maps").mkdir(parents=True, exist_ok=True)
    (folder / f"{folder.name}{dd.WORLD_SET_SUFFIX}").write_text(
        json.dumps(request_body, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    return {"saved": folder.name}


@router.delete("/world_sets/{name}", status_code=200)
def delete_world_set(name: str):
    """Move a world set folder (including its maps) to <data>/.trash/ rather than deleting it."""
    folder = dd.existing_world_set_dir(name)
    trash = dd.data_dir() / ".trash"
    trash.mkdir(exist_ok=True)
    target = trash / f"{folder.name} {datetime.now():%Y-%m-%d %H%M%S}"
    if target.exists():
        raise HTTPException(status_code=409, detail="A trashed copy with that timestamp already exists")
    shutil.move(str(folder), str(target))
    return {"deleted": folder.name}
