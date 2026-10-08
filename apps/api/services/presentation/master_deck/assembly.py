"""PowerPoint assembly: canonical deck (untouched) + appendix slides = Master Presentation.

The canonical package is opened and the appendix slides are added to it as new slide parts.
Nothing of the original slides is regenerated: their XML, relationships and media stay as
they are, and only the package-level lists (slide ids, relationships, content types) grow.
``verify_canonical_preserved`` proves that after every build by comparing each original slide
and every resource it references with the registered master, independent of zip-level details.
"""

from __future__ import annotations

import hashlib
import posixpath
import tempfile
import zipfile
from functools import lru_cache
from pathlib import Path
from typing import Any

from lxml import etree
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.util import Emu

from services.presentation.borek_deck.engine import engine
from services.presentation.master_deck.layouts import NAVY, WHITE, Canvas, draw_slide
from services.presentation.master_deck.registry import MasterDeck, MasterDeckError, get_master, verify_master

_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
_P_NS = "http://schemas.openxmlformats.org/presentationml/2006/main"
_R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
# Canonical slides the brand images of the appendix are taken from (same files, same look).
_LIGHT_SLIDE, _DIVIDER_SLIDE = 3, 8


class AssemblyError(RuntimeError):
    code = "MASTER_ASSEMBLY_FAILED"
    retryable = False


@lru_cache(maxsize=2)
def brand_images(master_id: str) -> dict[str, str]:
    """Logo and cover image exactly as the canonical deck embeds them, as files for the renderer."""
    master = get_master(master_id)
    deck = Presentation(str(master.pptx_path))
    pictures = lambda number: [shape for shape in deck.slides[number - 1].shapes if shape.shape_type == 13]  # noqa: E731
    light, divider = pictures(_LIGHT_SLIDE), pictures(_DIVIDER_SLIDE)
    if len(light) != 1 or len(divider) != 2:
        raise MasterDeckError(f"Master deck {master_id} does not carry the expected brand images")
    target = Path(tempfile.mkdtemp(prefix=f"{master_id}-brand-"))
    blobs = {"logo_dark": light[0].image.blob, "cover_bg": divider[0].image.blob, "logo_white": divider[1].image.blob}
    paths = {}
    for name, blob in blobs.items():
        path = target / f"{name}.png"
        path.write_bytes(blob)
        paths[name] = str(path)
    return paths


def _add_slide(deck: Any, layout: Any, *, dark: bool) -> Any:
    slide = deck.slides.add_slide(layout)
    for placeholder in list(slide.placeholders):
        placeholder._element.getparent().remove(placeholder._element)
    slide.background.fill.solid()
    slide.background.fill.fore_color.rgb = RGBColor.from_string(NAVY if dark else WHITE)
    return engine().bp.S(None, slide, dark, "none")


def _draw_all(deck: Any, layout: Any, contents: list[dict[str, Any]], master_id: str, *, first_page: int, total: int) -> list[str]:
    canvas = Canvas(brand_images(master_id))
    for offset, content in enumerate(contents):
        before = len(canvas.problems)
        slide = _add_slide(deck, layout, dark=content.get("layout") == "L06")
        draw_slide(slide, content, canvas, page=first_page + offset, total=total)
        for position in range(before, len(canvas.problems)):
            canvas.problems[position] = f"appendix slide {offset + 1} ({content.get('layout')}): {canvas.problems[position]}"
    return canvas.problems


def _blank_deck() -> tuple[Any, Any]:
    bp = engine().bp
    deck = Presentation()
    deck.slide_width, deck.slide_height = Emu(bp.SLIDE_W * bp.PX), Emu(bp.SLIDE_H * bp.PX)
    return deck, deck.slide_layouts[6]


def fit_problems(contents: list[dict[str, Any]], master_id: str | None = None) -> list[str]:
    """Lay the appendix out in memory; returns every text that does not fit its layout."""
    from services.presentation.master_deck.registry import DEFAULT_MASTER_ID

    deck, layout = _blank_deck()
    return _draw_all(deck, layout, contents, master_id or DEFAULT_MASTER_ID, first_page=1, total=len(contents))


def assemble(master: MasterDeck, contents: list[dict[str, Any]], out: Path) -> None:
    """Write the final deck: the verified canonical slides followed by the appendix slides."""
    verify_master(master)
    deck = Presentation(str(master.pptx_path))
    if len(deck.slides) != master.slide_count:
        raise MasterDeckError(f"Master deck {master.master_id} does not open with {master.slide_count} slides")
    total = master.slide_count + len(contents)
    problems = _draw_all(deck, deck.slide_layouts[0], contents, master.master_id, first_page=master.slide_count + 1, total=total)
    if problems:
        raise AssemblyError("; ".join(problems))
    deck.save(str(out))
    verify_canonical_preserved(master, out, expected_total=total)


# ---------------------------------------------------------------------------------- verification


def _slide_parts(package: zipfile.ZipFile) -> list[str]:
    """Slide part names in presentation order."""
    presentation = etree.fromstring(package.read("ppt/presentation.xml"))
    rels = etree.fromstring(package.read("ppt/_rels/presentation.xml.rels"))
    targets = {rel.get("Id"): rel.get("Target") for rel in rels.findall(f"{{{_REL_NS}}}Relationship")}
    ids = presentation.find(f"{{{_P_NS}}}sldIdLst")
    return [posixpath.normpath(posixpath.join("ppt", targets[item.get(f"{{{_R_NS}}}id")])) for item in ids]


def _canonical_xml(data: bytes) -> bytes:
    return etree.tostring(etree.fromstring(data), method="c14n")


def slide_fingerprint(package: zipfile.ZipFile, part: str) -> str:
    """Checksum of a slide's content and of every resource it references (media by content).

    Independent of part names, relationship ids' targets' file names and zip compression, so the
    same slide has the same fingerprint in the canonical and in the assembled package.
    """
    digest = hashlib.sha256(_canonical_xml(package.read(part)))
    rels_part = posixpath.join(posixpath.dirname(part), "_rels", posixpath.basename(part) + ".rels")
    if rels_part in package.namelist():
        rels = etree.fromstring(package.read(rels_part))
        for rel in sorted(rels.findall(f"{{{_REL_NS}}}Relationship"), key=lambda item: item.get("Id")):
            kind = rel.get("Type").rsplit("/", 1)[-1]
            digest.update(f"|{rel.get('Id')}|{kind}|".encode())
            if rel.get("TargetMode") == "External":
                digest.update(rel.get("Target").encode())
            elif kind in {"image", "media", "video", "audio"}:
                target = posixpath.normpath(posixpath.join(posixpath.dirname(part), rel.get("Target")))
                digest.update(hashlib.sha256(package.read(target)).digest())
    return digest.hexdigest()


def canonical_fingerprints(path: Path) -> list[str]:
    with zipfile.ZipFile(path) as package:
        return [slide_fingerprint(package, part) for part in _slide_parts(package)]


def verify_canonical_preserved(master: MasterDeck, final_path: Path, *, expected_total: int) -> None:
    """The first slides of the final deck are the canonical slides, in order and unchanged."""
    expected = canonical_fingerprints(master.pptx_path)
    actual = canonical_fingerprints(final_path)
    if len(actual) != expected_total:
        raise AssemblyError(f"The assembled deck has {len(actual)} slides, expected {expected_total}")
    for number, (before, after) in enumerate(zip(expected, actual[: len(expected)], strict=True), start=1):
        if before != after:
            raise AssemblyError(f"Canonical slide {number} was changed during assembly")
    try:
        reopened = Presentation(str(final_path))
    except Exception as exc:  # a package PowerPoint could not open is not a deck
        raise AssemblyError(f"The assembled deck cannot be opened: {exc}") from exc
    if len(reopened.slides) != expected_total:
        raise AssemblyError("The assembled deck does not reopen with the expected slide count")
