# Testing

## Setup

Install the development dependencies:

```bash
pip install -r requirements-dev.txt
```

---

## Running the test suite

```bash
pytest
```

Run verbosely to see individual test names:

```bash
pytest -v
```

---

## Coverage

```bash
pytest --cov=map_editor --cov-report=term-missing
```

To generate an HTML report:

```bash
pytest --cov=map_editor --cov-report=html
# Open htmlcov/index.html in a browser
```

---

## Test layout

| Path | Contents |
|------|---------|
| `tests/conftest.py` | `autouse` fixture resetting `MapObject._id_counter` to 0 before every test; shared tileset/map fixtures |
| `tests/models/test_tileset.py` | 15 tests — tile definitions, placeholder PNG generation, sheet positions |
| `tests/models/test_map_object.py` | 14 tests — factory methods, ID counter isolation, properties (incl. bool) |
| `tests/models/test_layer.py` | 31 tests — tile access, flood fill (incl. 1×1), object hit-testing, from_flat edge cases |
| `tests/models/test_tile_map.py` | 27 tests — GID resolution (incl. GID 0), layer management, coordinate helpers |
| `tests/models/test_hex_map.py` | 28 tests — pixel↔hex round-trips, neighbour lookup, distance |
| `tests/rendering/conftest.py` | Session-scoped `QApplication` fixture with `offscreen` platform |
| `tests/rendering/test_tile_renderer.py` | 21 tests — image size, pixel colours, grid lines, object markers, `render_clipped` |
| `tests/rendering/test_hex_renderer.py` | 16 tests — hex colours, orientations, grid, cache invalidation |
| `tests/tools/test_tools.py` | 9 tests — headless `CanvasStub` exercising all four tools, undo, and same-GID no-op |
| `tests/ui/test_ui.py` | 22 tests — UI smoke tests via `pytest-qt` (`qtbot`) |
| `tests/io/test_tmj_io.py` | 23 tests — TMJ round-trips, all 5 object shapes, multi-tileset GIDs, POINTY_TOP hex, ObjectLayer props, source_path, external tileset stubs, PNG export |

Total: **233 tests**.

---

## Headless Qt

Rendering tests require a `QApplication` but not a physical display. The conftest sets
`QT_QPA_PLATFORM=offscreen` before constructing the application so tests run in any
environment, including CI servers with no GPU or display.

---

## Writing new tests

**Model tests** — place in `tests/models/test_<module>.py`. No Qt fixtures needed. The
`autouse` ID-reset fixture applies automatically.

**Renderer tests** — place in `tests/rendering/test_<renderer>.py`. Accept `qapp` as a
test parameter; the session fixture provides it automatically.

```python
def test_my_renderer_feature(qapp):
    m = _make_tile_map()
    img = TileRenderer().render(m)
    # sample a pixel and assert its colour
    color = QColor(img.pixel(cx, cy))
    assert color.red() > 100
```

**IO tests** — place in `tests/io/test_<feature>.py`. The `tests/io/conftest.py` provides
the same session-scoped `qapp` fixture. Write/read tests are pure Python and don't need
`qapp`; pass it as a parameter only for tests that call `exporter.*` or inspect pixel data.

**Bug regressions** — every fixed bug should have a corresponding test that would have
caught it before the fix.
