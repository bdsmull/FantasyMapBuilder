"""
World set file CRUD API.

Endpoints
---------
GET    /api/world_sets           List saved world set names
GET    /api/world_sets/{name}    Load a world set (returns WorldSet JSON)
POST   /api/world_sets/{name}    Save a world set (accepts WorldSet JSON body)
DELETE /api/world_sets/{name}    Delete a world set file
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

# World sets are stored in <project-root>/world_sets/
_WORLD_SETS_DIR = Path(__file__).parent.parent.parent / "world_sets"
_WORLD_SETS_DIR.mkdir(exist_ok=True)

# Double-extension suffix — must be stripped with removesuffix, NOT Path.stem.
_SUFFIX = ".worldset.json"

# Same safe-name regex as maps.py (letters, digits, underscore, dot, hyphen, space).
_SAFE_NAME_RE = re.compile(r"^[\w\-. ]+$")

router = APIRouter(tags=["world_sets"])


def _bare_name(path: Path) -> str:
    """Return the stem with `.worldset.json` stripped (NOT Path.stem which keeps .worldset)."""
    return path.name.removesuffix(_SUFFIX)


def _safe_path(name: str) -> Path:
    """Resolve a world set name to a .worldset.json path, raising 400 on unsafe names."""
    stem = name.removesuffix(_SUFFIX)
    if not _SAFE_NAME_RE.match(stem):
        raise HTTPException(status_code=400, detail="Invalid world set name")
    return _WORLD_SETS_DIR / f"{stem}{_SUFFIX}"


@router.get("/world_sets")
def list_world_sets() -> list[str]:
    """Return sorted list of saved world set names (without .worldset.json extension)."""
    return sorted(_bare_name(p) for p in _WORLD_SETS_DIR.glob(f"*{_SUFFIX}"))


@router.get("/world_sets/{name}")
def get_world_set(name: str):
    """Load a .worldset.json file and return its JSON content."""
    path = _safe_path(name)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"World set '{name}' not found")
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return JSONResponse(content=data)


@router.post("/world_sets/{name}", status_code=200)
async def save_world_set(name: str, request_body: dict):
    """Save (create or overwrite) a world set from JSON body."""
    path = _safe_path(name)
    path.write_text(
        json.dumps(request_body, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    return {"saved": _bare_name(path)}


@router.delete("/world_sets/{name}", status_code=200)
def delete_world_set(name: str):
    """Delete a saved world set file."""
    path = _safe_path(name)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"World set '{name}' not found")
    path.unlink()
    return {"deleted": _bare_name(path)}
