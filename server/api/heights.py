"""
Map elevation API (see server/heights.py for storage).

Endpoints
---------
GET    /api/world_sets/{ws}/heights/{map}   Height patch as binary (404 if the map has none)
PUT    /api/world_sets/{ws}/heights/{map}   Store a height patch (binary body)
DELETE /api/world_sets/{ws}/heights/{map}   Remove a map's height patch

Binary layout (application/octet-stream), for both GET and PUT:
    cols * rows little-endian int32 heights in whole centimeters, row-major,
    followed by cols * rows bytes of edit mask (1 = set by hand).
Headers ``X-Height-Cols`` / ``X-Height-Rows`` give the grid size; on PUT it must
match the map's sample grid (cell corners on square maps, centres on hex maps).
"""

from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response

from server import data_dir as dd
from server import heights as hs

router = APIRouter(tags=["heights"])

_GRID_HEADERS = ("X-Height-Cols", "X-Height-Rows")


def _map_file(world_set: str, name: str):
    folder = dd.existing_world_set_dir(world_set)
    path = folder / "maps" / f"{dd.check_name(name, 'map')}.tmj"
    if not path.is_file():
        raise HTTPException(status_code=404, detail=f"Map '{name}' not found in world set '{world_set}'")
    return folder, path


@router.get("/world_sets/{world_set}/heights/{name}")
def get_heights(world_set: str, name: str):
    folder, _ = _map_file(world_set, name)
    data = hs.read_heights(folder, name)
    if data is None:
        raise HTTPException(status_code=404, detail=f"Map '{name}' has no elevation")
    cols, rows, heights_le, mask = data
    return Response(
        content=heights_le + mask,
        media_type="application/octet-stream",
        headers={"X-Height-Cols": str(cols), "X-Height-Rows": str(rows),
                 "Access-Control-Expose-Headers": ", ".join(_GRID_HEADERS)},
    )


@router.put("/world_sets/{world_set}/heights/{name}")
async def put_heights(world_set: str, name: str, request: Request):
    folder, map_path = _map_file(world_set, name)
    try:
        cols, rows = (int(request.headers[h]) for h in _GRID_HEADERS)
    except (KeyError, ValueError):
        raise HTTPException(status_code=400, detail="X-Height-Cols and X-Height-Rows headers are required") from None
    expected = hs.sample_grid(json.loads(map_path.read_text(encoding="utf-8")))
    if (cols, rows) != expected:
        raise HTTPException(status_code=400, detail=f"Height grid {cols}x{rows} doesn't match the map ({expected[0]}x{expected[1]})")
    body = await request.body()
    n = cols * rows
    if len(body) != n * 5:
        raise HTTPException(status_code=400, detail=f"Expected {n * 5} bytes, got {len(body)}")
    hs.write_heights(folder, name, cols, rows, body[: n * 4], body[n * 4:])
    return {"saved": name, "cols": cols, "rows": rows}


@router.delete("/world_sets/{world_set}/heights/{name}")
def delete_heights(world_set: str, name: str):
    folder, _ = _map_file(world_set, name)
    if not hs.delete_heights(folder, name):
        raise HTTPException(status_code=404, detail=f"Map '{name}' has no elevation")
    return {"deleted": name}
