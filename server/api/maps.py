"""
Map file CRUD API.

Endpoints
---------
GET    /api/maps                  List saved .tmj map names
GET    /api/maps/{name}           Load a map (returns TMJ JSON)
POST   /api/maps/{name}           Save a map (accepts TMJ JSON body)
DELETE /api/maps/{name}           Delete a map file
POST   /api/maps/upload           Upload a .tmj file (multipart)
GET    /api/maps/{name}/download  Download raw .tmj file
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse

# Maps are stored in <project-root>/maps/
_MAPS_DIR = Path(__file__).parent.parent.parent / "maps"
_MAPS_DIR.mkdir(exist_ok=True)

# Safe filename: alphanumerics, hyphens, underscores, dots (no path traversal)
_SAFE_NAME_RE = re.compile(r"^[\w\-. ]+$")

router = APIRouter(tags=["maps"])


def _safe_path(name: str) -> Path:
    """Resolve a map name to a .tmj path, raising 400 on unsafe names."""
    stem = name.removesuffix(".tmj")
    if not _SAFE_NAME_RE.match(stem):
        raise HTTPException(status_code=400, detail="Invalid map name")
    return _MAPS_DIR / f"{stem}.tmj"


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/maps")
def list_maps() -> list[str]:
    """Return sorted list of saved map names (without .tmj extension)."""
    return sorted(p.stem for p in _MAPS_DIR.glob("*.tmj"))


@router.get("/maps/{name}")
def get_map(name: str):
    """Load a .tmj file and return its JSON content."""
    path = _safe_path(name)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Map '{name}' not found")
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return JSONResponse(content=data)


@router.post("/maps/upload", status_code=201)
async def upload_map(file: UploadFile):
    """Upload a .tmj file. The filename (without extension) becomes the map name."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")
    stem = Path(file.filename).stem
    path = _safe_path(stem)
    content = await file.read()
    # Validate it is valid JSON before saving
    try:
        json.loads(content)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=422, detail=f"Invalid JSON: {exc}") from exc
    path.write_bytes(content)
    return {"uploaded": stem}


@router.post("/maps/{name}", status_code=200)
async def save_map(name: str, request_body: dict):
    """Save (create or overwrite) a map from TMJ JSON body."""
    path = _safe_path(name)
    path.write_text(
        json.dumps(request_body, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    return {"saved": path.stem}


@router.delete("/maps/{name}", status_code=200)
def delete_map(name: str):
    """Delete a saved map file."""
    path = _safe_path(name)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Map '{name}' not found")
    path.unlink()
    return {"deleted": path.stem}


@router.get("/maps/{name}/download")
def download_map(name: str):
    """Return the raw .tmj file as a download."""
    path = _safe_path(name)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Map '{name}' not found")
    return FileResponse(
        path=str(path),
        media_type="application/json",
        filename=path.name,
        headers={"Content-Disposition": f'attachment; filename="{path.name}"'},
    )
