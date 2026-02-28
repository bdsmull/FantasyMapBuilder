"""
Tileset image serving API.

Endpoints
---------
GET /api/tilesets/{path:path}
    Serve a sprite-sheet PNG by absolute filesystem path.
    The frontend passes the path it received from the map's tileset.image field.
    Only image files on the local filesystem are served; path traversal is blocked.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

router = APIRouter(tags=["tilesets"])

_ALLOWED_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif", ".webp"}


@router.get("/tilesets/{path:path}")
def get_tileset_image(path: str):
    """Serve a sprite-sheet image from the local filesystem."""
    image_path = Path(path)

    # Security: must be an absolute path to an existing image file.
    # We don't allow relative paths or directory traversal.
    if not image_path.is_absolute():
        raise HTTPException(
            status_code=400,
            detail="Tileset path must be absolute",
        )
    if image_path.suffix.lower() not in _ALLOWED_SUFFIXES:
        raise HTTPException(status_code=400, detail="Not an image file")
    if not image_path.is_file():
        raise HTTPException(status_code=404, detail="Tileset image not found")

    media_types = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
    }
    return FileResponse(
        path=str(image_path),
        media_type=media_types.get(image_path.suffix.lower(), "image/png"),
    )
