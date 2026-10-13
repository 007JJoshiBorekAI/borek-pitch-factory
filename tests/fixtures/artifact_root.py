"""Generated test artifacts live in a temporary directory that is removed when the run ends.

The API writes decks, previews and exports under ``ARTIFACT_ROOT`` (default ``tmp/deck_assets`` in
the repository). A full test run writes several gigabytes there, and nothing ever removed them:
repeated runs filled the disk. Tests therefore get their own directory per run:

    <system temp>/borek-test-artifacts-<pid>-<random>/

It is deleted when the Python process exits, however the run ends. Directories left behind by a
run that was killed are deleted at the start of the next run once they are older than a day.

Call ``use_temporary_artifact_root()`` in a conftest before the application is imported: the
application reads ``ARTIFACT_ROOT`` once, when its settings are created.

To keep the artifacts of a run for inspection, set ``BOREK_TEST_ARTIFACT_ROOT`` to a directory of
your own; it is used as it is and never deleted.
"""

from __future__ import annotations

import atexit
import os
import shutil
import tempfile
import time
from pathlib import Path

PREFIX = "borek-test-artifacts-"
STALE_AFTER_SECONDS = 24 * 60 * 60
_created: Path | None = None


def _remove(path: Path) -> None:
    shutil.rmtree(path, ignore_errors=True)


def remove_stale_artifact_roots(now: float | None = None) -> list[Path]:
    """Delete artifact directories of earlier runs that never cleaned up. Only this helper's own directories."""
    removed = []
    for candidate in Path(tempfile.gettempdir()).glob(f"{PREFIX}*"):
        try:
            stale = candidate.is_dir() and (now or time.time()) - candidate.stat().st_mtime > STALE_AFTER_SECONDS
        except OSError:
            continue
        if stale and candidate != _created:
            _remove(candidate)
            removed.append(candidate)
    return removed


def use_temporary_artifact_root() -> Path:
    """Point ``ARTIFACT_ROOT`` at this run's temporary directory. Safe to call from several conftests."""
    global _created
    keep = os.environ.get("BOREK_TEST_ARTIFACT_ROOT", "").strip()
    if keep:
        os.environ["ARTIFACT_ROOT"] = keep
        return Path(keep)
    if _created is None:
        remove_stale_artifact_roots()
        _created = Path(tempfile.mkdtemp(prefix=f"{PREFIX}{os.getpid()}-"))
        atexit.register(_remove, _created)
    os.environ["ARTIFACT_ROOT"] = str(_created)
    return _created
