"""Registry of canonical master decks: trusted, versioned repository assets.

A master deck is the immutable base of every Master Presentation. It is addressed by id only -
never by a path a caller supplies - and it is verified (checksum, slide count) before
every use. A missing, replaced or damaged master is an explicit error; nothing is substituted.
"""

from __future__ import annotations

import hashlib
import json
import re
import zipfile
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

ASSETS = Path(__file__).resolve().parent / "assets"
DEFAULT_MASTER_ID = "borek_ai_tech_en_v1"
_SLIDE_PART = re.compile(r"ppt/slides/slide\d+\.xml")


class MasterDeckError(RuntimeError):
    """The canonical master deck is unknown, missing or not the registered file."""

    code = "MASTER_DECK_INVALID"
    retryable = False


@dataclass(frozen=True)
class MasterDeck:
    master_id: str
    master_version: str
    sha256: str
    slide_count: int
    language: str

    @property
    def directory(self) -> Path:
        return ASSETS / self.master_id

    @property
    def pptx_path(self) -> Path:
        return self.directory / "deck.pptx"

    def identity(self) -> dict[str, str]:
        return {"master_id": self.master_id, "master_version": self.master_version, "master_sha256": self.sha256}


# The checksum is the trust anchor: it is the SHA-256 of the supplied "Ai Tech Borek
# Presentation EN.pptx" and lives in code, so replacing the file (or its manifest) is detected.
_REGISTRY: dict[str, MasterDeck] = {
    DEFAULT_MASTER_ID: MasterDeck(
        master_id=DEFAULT_MASTER_ID,
        master_version="1.0",
        sha256="2c23670e46dc2ce71d3527b0acc846cad54572d9817977ec26c3efe17f51dd5a",
        slide_count=26,
        language="en",
    ),
}


def get_master(master_id: str = DEFAULT_MASTER_ID) -> MasterDeck:
    master = _REGISTRY.get(str(master_id))
    if master is None:
        raise MasterDeckError(f"Unknown master deck '{master_id}'")
    return master


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def pptx_slide_count(path: Path) -> int:
    try:
        with zipfile.ZipFile(path) as package:
            return sum(1 for name in package.namelist() if _SLIDE_PART.fullmatch(name))
    except (OSError, zipfile.BadZipFile) as exc:
        raise MasterDeckError(f"Master deck is not a readable PowerPoint package: {exc}") from exc


def load_manifest(master: MasterDeck) -> dict:
    """Slide titles of the deck, written by ``scripts/build_master_deck_manifest.py``."""
    path = master.directory / "manifest.json"
    if not path.is_file():
        raise MasterDeckError(f"Master deck {master.master_id} has no manifest")
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if (manifest.get("master_id"), manifest.get("sha256")) != (master.master_id, master.sha256):
        raise MasterDeckError(f"Master deck {master.master_id}: manifest does not belong to the registered file")
    if len(manifest.get("slides") or []) != master.slide_count:
        raise MasterDeckError(f"Master deck {master.master_id}: manifest does not list {master.slide_count} slides")
    return manifest


def verify_master(master: MasterDeck) -> dict:
    """Check the stored deck against the registry. Returns the manifest; raises on any mismatch."""
    path = master.pptx_path
    if not path.is_file():
        raise MasterDeckError(f"Master deck {master.master_id} is missing")
    actual = file_sha256(path)
    if actual != master.sha256:
        raise MasterDeckError(
            f"Master deck {master.master_id} does not match its registered checksum (found {actual[:12]}…)"
        )
    count = pptx_slide_count(path)
    if count != master.slide_count:
        raise MasterDeckError(f"Master deck {master.master_id} has {count} slides, expected {master.slide_count}")
    return load_manifest(master)


@lru_cache(maxsize=4)
def canonical_slide_titles(master_id: str = DEFAULT_MASTER_ID) -> tuple[str, ...]:
    return tuple(str(slide["title"]) for slide in load_manifest(get_master(master_id))["slides"])
