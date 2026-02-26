"""Configure offscreen Qt platform for tools tests."""
import os

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
