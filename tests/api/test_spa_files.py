"""
The built editor page must not be reused from a browser's cache after a rebuild: it
names that build's hashed script files.
"""
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from server.main import SpaFiles

pytestmark = pytest.mark.asyncio


@pytest.fixture
def spa(tmp_path):
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<!doctype html>", encoding="utf-8")
    (tmp_path / "assets" / "index-abc123.js").write_text("1", encoding="utf-8")
    app = FastAPI()
    app.mount("/", SpaFiles(directory=str(tmp_path), html=True))
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def test_the_page_is_revalidated_on_every_load(spa):
    async with spa as client:
        for url in ("/", "/index.html"):
            resp = await client.get(url)
            assert resp.status_code == 200
            assert resp.headers["cache-control"] == "no-cache"
        # Unchanged: a cheap 304, which must keep saying so
        again = await client.get("/", headers={"If-None-Match": resp.headers["etag"]})
        assert again.status_code == 304
        assert again.headers["cache-control"] == "no-cache"


async def test_hashed_scripts_may_be_cached(spa):
    async with spa as client:
        resp = await client.get("/assets/index-abc123.js")
        assert resp.status_code == 200
        assert "cache-control" not in resp.headers
