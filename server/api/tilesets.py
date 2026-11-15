"""
Tileset image API.

Endpoints
---------
GET  /api/world_sets/{ws}/tilesets/{file}   Serve an image from a world set's tilesets/ folder
POST /api/world_sets/{ws}/tilesets/images   Upload a sprite-sheet image into tilesets/ (multipart);
                                            returns {"image": <URL to use as the tileset image>}
GET  /api/tilesets/{path:path}              Legacy: serve a sprite sheet by absolute filesystem
                                            path (maps saved before shared tilesets)
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import FileResponse

from server import data_dir as dd
from server.tileset_files import IMAGE_SUFFIXES, TILESETS_DIR, image_url, safe_file_stem

router = APIRouter(tags=["tilesets"])

_MEDIA_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
}


def _image_response(path: Path) -> FileResponse:
    return FileResponse(path=str(path), media_type=_MEDIA_TYPES.get(path.suffix.lower(), "image/png"))


@router.post("/world_sets/{world_set}/tilesets/images", status_code=201)
async def upload_tileset_image(world_set: str, file: UploadFile):
    """Store an uploaded sprite sheet in the world set's tilesets/ folder."""
    folder = dd.existing_world_set_dir(world_set) / TILESETS_DIR
    folder.mkdir(exist_ok=True)
    original = Path(file.filename or "")
    suffix = original.suffix.lower()
    if suffix not in IMAGE_SUFFIXES:
        raise HTTPException(status_code=400, detail="Not an image file")
    stem = safe_file_stem(original.stem)
    target = folder / f"{stem}{suffix}"
    n = 2
    while target.exists():
        target = folder / f"{stem} ({n}){suffix}"
        n += 1
    target.write_bytes(await file.read())
    return {"image": image_url(folder.parent.name, target.name)}


@router.get("/world_sets/{world_set}/tilesets/{file_name}")
def get_world_set_tileset_image(world_set: str, file_name: str):
    """Serve an image from a world set's tilesets/ folder (no subfolders, images only)."""
    folder = (dd.existing_world_set_dir(world_set) / TILESETS_DIR).resolve()
    path = (folder / file_name).resolve()
    if path.parent != folder or path.suffix.lower() not in IMAGE_SUFFIXES:
        raise HTTPException(status_code=400, detail="Not a tileset image")
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Tileset image not found")
    return _image_response(path)


@router.get("/tilesets/{path:path}")
def get_tileset_image(path: str):
    """Legacy: serve a sprite-sheet image by absolute filesystem path."""
    image_path = Path(path)

    # Security: must be an absolute path to an existing image file.
    # We don't allow relative paths or directory traversal.
    if not image_path.is_absolute():
        raise HTTPException(
            status_code=400,
            detail="Tileset path must be absolute",
        )
    if image_path.suffix.lower() not in IMAGE_SUFFIXES:
        raise HTTPException(status_code=400, detail="Not an image file")
    if not image_path.is_file():
        raise HTTPException(status_code=404, detail="Tileset image not found")
    return _image_response(image_path)
