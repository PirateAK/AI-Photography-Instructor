"""Shared test fixtures. Runtime engine settings (provider/API key) are
isolated per-test so the suite never reads the developer's real
runtime_settings.json and never makes real AI calls."""

import pytest


@pytest.fixture(autouse=True)
def isolated_runtime_settings(tmp_path, monkeypatch):
    import backend.runtime_config as rc

    monkeypatch.setattr(rc, "PATH", tmp_path / "runtime_settings.json")
    yield


@pytest.fixture(autouse=True)
def isolated_history_db(tmp_path, monkeypatch):
    import backend.history as hist

    monkeypatch.setattr(hist, "_DB_PATH", str(tmp_path / "photo_history.db"))
    yield
