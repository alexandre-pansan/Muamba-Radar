"""
Health and auxiliary endpoint tests.
Covers: GET /health, GET /sources, GET /fx, GET /featured-images, GET /suggestions
"""
from __future__ import annotations

import httpx
import pytest


@pytest.mark.usefixtures("wait_for_backend")
class TestHealth:
    def test_health_returns_ok(self, client: httpx.Client) -> None:
        r = client.get("/health")
        assert r.status_code == 200
        assert r.json() == {"status": "ok"}

    def test_health_is_fast(self, client: httpx.Client) -> None:
        """Health check should respond within 2 seconds."""
        import time
        start = time.perf_counter()
        r = client.get("/health")
        elapsed = time.perf_counter() - start
        assert r.status_code == 200
        assert elapsed < 2.0, f"Health check too slow: {elapsed:.2f}s"


@pytest.mark.usefixtures("wait_for_backend")
class TestSources:
    def test_sources_returns_list(self, client: httpx.Client) -> None:
        r = client.get("/sources")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)

    def test_sources_have_required_fields(self, client: httpx.Client) -> None:
        r = client.get("/sources")
        assert r.status_code == 200
        for source in r.json():
            assert "source" in source
            assert "country" in source
            assert "enabled" in source

    def test_sources_country_values_valid(self, client: httpx.Client) -> None:
        """All sources should declare a known country."""
        valid_countries = {"py", "br", "all"}
        r = client.get("/sources")
        assert r.status_code == 200
        for source in r.json():
            assert source["country"] in valid_countries, (
                f"Unknown country '{source['country']}' in source '{source['source']}'"
            )


@pytest.mark.usefixtures("wait_for_backend")
class TestFxRate:
    def test_fx_returns_brl_per_usd(self, client: httpx.Client) -> None:
        r = client.get("/fx")
        assert r.status_code == 200
        data = r.json()
        assert "brl_per_usd" in data
        assert isinstance(data["brl_per_usd"], (int, float))

    def test_fx_rate_is_positive(self, client: httpx.Client) -> None:
        r = client.get("/fx")
        assert r.status_code == 200
        assert r.json()["brl_per_usd"] > 0


@pytest.mark.usefixtures("wait_for_backend")
class TestFeaturedImages:
    def test_featured_images_returns_list(self, client: httpx.Client) -> None:
        r = client.get("/featured-images")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_featured_images_limit_param(self, client: httpx.Client) -> None:
        """Limit parameter should be respected."""
        r = client.get("/featured-images", params={"limit": 3})
        assert r.status_code == 200
        assert len(r.json()) <= 3

    def test_featured_images_limit_bounds(self, client: httpx.Client) -> None:
        """limit=0 or limit=100 should return 422."""
        r = client.get("/featured-images", params={"limit": 0})
        assert r.status_code == 422

        r = client.get("/featured-images", params={"limit": 100})
        assert r.status_code == 422


@pytest.mark.usefixtures("wait_for_backend")
class TestSuggestions:
    def test_suggestions_returns_list(self, client: httpx.Client) -> None:
        r = client.get("/suggestions", params={"q": "iphone"})
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_suggestions_max_8_results(self, client: httpx.Client) -> None:
        r = client.get("/suggestions", params={"q": "i"})
        assert r.status_code == 200
        assert len(r.json()) <= 8

    def test_suggestions_requires_q_param(self, client: httpx.Client) -> None:
        r = client.get("/suggestions")
        assert r.status_code == 422

    def test_suggestions_empty_q_rejected(self, client: httpx.Client) -> None:
        r = client.get("/suggestions", params={"q": ""})
        assert r.status_code == 422
