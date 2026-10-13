"""Test runs do not fill the repository's tmp/deck_assets: their artifacts are temporary."""

from __future__ import annotations

import os
import tempfile
import time
from pathlib import Path

from app.config import settings
from app.services.deck_assets import deck_assets_root
from tests.fixtures import artifact_root

REPOSITORY_ARTIFACTS = Path(__file__).resolve().parents[3] / "tmp" / "deck_assets"


def test_generated_artifacts_go_to_this_runs_temporary_directory() -> None:
    root = deck_assets_root().resolve()
    temporary = Path(tempfile.gettempdir()).resolve()
    assert temporary in root.parents and root.name.startswith(artifact_root.PREFIX), root
    assert REPOSITORY_ARTIFACTS.resolve() != root and REPOSITORY_ARTIFACTS.resolve() not in root.parents
    assert Path(settings.ARTIFACT_ROOT).resolve() == root == Path(os.environ["ARTIFACT_ROOT"]).resolve()
    # One directory per run, whichever test configuration asked first.
    assert artifact_root.use_temporary_artifact_root().resolve() == root


def test_the_directory_is_removed_when_the_run_ends_and_stale_ones_before_the_next(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(tempfile, "tempdir", str(tmp_path))
    monkeypatch.setattr(artifact_root, "_created", None)
    monkeypatch.delenv("BOREK_TEST_ARTIFACT_ROOT", raising=False)
    registered = []
    monkeypatch.setattr(artifact_root.atexit, "register", lambda function, *args: registered.append((function, args)))
    stale = tmp_path / f"{artifact_root.PREFIX}999-killed"
    recent = tmp_path / f"{artifact_root.PREFIX}998-running"
    foreign = tmp_path / "someone-elses-data"
    for folder in (stale, recent, foreign):
        (folder / "deck").mkdir(parents=True)
        (folder / "deck" / "slide.png").write_bytes(b"x" * 10)
    old = time.time() - 2 * artifact_root.STALE_AFTER_SECONDS
    os.utime(stale, (old, old))
    os.utime(foreign, (old, old))

    created = artifact_root.use_temporary_artifact_root()
    assert created.parent == tmp_path and created.is_dir() and os.environ["ARTIFACT_ROOT"] == str(created)
    assert not stale.exists(), "a directory a killed run left behind is removed"
    assert recent.exists(), "a directory of a run that may still be going is left alone"
    assert foreign.exists(), "nothing but this helper's own directories is ever deleted"
    # The removal is registered for the end of the process, and it removes everything written.
    assert [args for _function, args in registered] == [(created,)]
    (created / "deck-1").mkdir()
    (created / "deck-1" / "slide.png").write_bytes(b"x" * 10)
    registered[0][0](*registered[0][1])
    assert not created.exists()

    # A directory of the developer's own is used as it is and never deleted.
    own = tmp_path / "keep-these"
    monkeypatch.setenv("BOREK_TEST_ARTIFACT_ROOT", str(own))
    assert artifact_root.use_temporary_artifact_root() == own and os.environ["ARTIFACT_ROOT"] == str(own) and len(registered) == 1
