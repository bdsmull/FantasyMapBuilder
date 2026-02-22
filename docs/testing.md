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
| `tests/models/test_tileset.py` | 15 tests — tile definitions, placeholder PNG generation, GID lookup |
| `tests/models/test_map_object.py` | 13 tests — factory methods, ID counter isolation, properties |
| `tests/models/test_layer.py` | 27 tests — tile access, flood fill, object hit-testing |
| `tests/models/test_tile_map.py` | 25 tests — GID resolution, layer management, coordinate helpers |
| `tests/models/test_hex_map.py` | 28 tests — pixel↔hex round-trips, neighbour lookup, distance |
| `tests/rendering/conftest.py` | Session-scoped `QApplication` fixture with `offscreen` platform |
| `tests/rendering/test_tile_renderer.py` | 18 tests — image size, pixel colours, grid lines, object markers |
| `tests/rendering/test_hex_renderer.py` | 16 tests — hex colours, orientations, grid, cache invalidation |

Total: **172 tests**.

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

**Bug regressions** — every fixed bug should have a corresponding test that would have
caught it before the fix.
