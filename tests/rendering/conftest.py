"""
Shared fixtures for rendering tests.

A single QApplication must exist for QPainter / QImage operations.
We use scope="session" so it is created once and reused across all
tests in this package — creating multiple QApplications in one process
raises an error in Qt.
"""

import os
import sys
import pytest


@pytest.fixture(scope="session", autouse=True)
def qapp():
    """Session-scoped QApplication using the offscreen platform (no display needed)."""
    # Must be set before QApplication is constructed
    os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

    from PyQt6.QtWidgets import QApplication

    app = QApplication.instance()
    if app is None:
        app = QApplication(sys.argv[:1])
    yield app
