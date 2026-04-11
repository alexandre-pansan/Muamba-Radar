"""Unit test configuration — no server needed, pure imports only."""
from __future__ import annotations

import sys
import os

# Make backend importable as "app.*"
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../../backend"))
