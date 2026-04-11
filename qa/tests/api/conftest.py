"""
Pytest fixtures for Muamba Radar API tests.

Tests can run against:
  1. A live backend via HTTP (default: http://localhost:8000)
     → set API_BASE_URL env var to override
  2. FastAPI TestClient (in-process) when the MAMU_TEST_INPROCESS env var is set.

Strategy used by default: live HTTP via httpx.  This is the most realistic
approach for QA and matches what the Docker QA stack does.
"""
from __future__ import annotations

import os
import time
import uuid
from typing import Generator

import httpx
import pytest


# ── Configuration ─────────────────────────────────────────────────────────────

API_BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:8000")


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def api_base() -> str:
    return API_BASE_URL.rstrip("/")


@pytest.fixture(scope="session")
def client(api_base: str) -> Generator[httpx.Client, None, None]:
    """Session-scoped synchronous httpx client."""
    with httpx.Client(base_url=api_base, timeout=15.0) as c:
        yield c


@pytest.fixture(scope="session")
def wait_for_backend(client: httpx.Client) -> None:
    """Wait up to 30 s for the backend health check to pass before tests run."""
    deadline = time.time() + 30
    while time.time() < deadline:
        try:
            r = client.get("/health")
            if r.status_code == 200:
                return
        except httpx.TransportError:
            pass
        time.sleep(1)
    pytest.exit("Backend is not reachable — aborting test session.", returncode=3)


# ── Auth helpers ───────────────────────────────────────────────────────────────

def _unique_user() -> dict:
    uid = uuid.uuid4().hex[:8]
    return {
        "username": f"qa_{uid}",
        "name": "QA Pytest User",
        "email": f"qa_{uid}@example-qa.com",
        "password": "QaP@ssw0rd_test",
    }


@pytest.fixture()
def registered_user(client: httpx.Client, wait_for_backend) -> Generator[dict, None, None]:
    """
    Register a fresh user for a single test, yield their credentials + token,
    then delete the account for cleanup.
    """
    user = _unique_user()
    res = client.post("/auth/register", json=user)
    assert res.status_code == 201, f"Registration failed: {res.text}"
    token = res.json()["access_token"]

    yield {**user, "access_token": token}

    # Cleanup: delete account
    client.delete(
        "/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )


@pytest.fixture()
def auth_headers(registered_user: dict) -> dict:
    """Return authorization headers for the registered test user."""
    return {"Authorization": f"Bearer {registered_user['access_token']}"}
