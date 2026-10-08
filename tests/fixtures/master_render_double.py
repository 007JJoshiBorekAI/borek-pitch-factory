"""Test double for the office renderer of the Master Presentation.

Production renders the assembled PPTX with LibreOffice and poppler (see ``master_deck/office.py``)
and has no fallback. Developer machines and CI runners without LibreOffice still need to exercise
planning, assembly, persistence and the API, so unit tests replace only the conversion step with
this stand-in. It is never importable from application code, and it is not installed when the
real renderer is available - inside the API/worker image the tests run against LibreOffice.
"""

from __future__ import annotations

from pathlib import Path

import pytest


def render_pptx_double(pptx_path: Path, workdir: Path, *, expected_slides: int) -> tuple[Path, list[Path]]:
    from PIL import Image, ImageDraw
    from pptx import Presentation

    from services.presentation.master_deck.office import OfficeRenderError

    slides = len(Presentation(str(pptx_path)).slides)
    if slides != expected_slides:
        raise OfficeRenderError(f"The PDF has {slides} pages for {expected_slides} slides")
    out_dir = workdir / "office"
    out_dir.mkdir(parents=True, exist_ok=True)
    previews = []
    pages = []
    for number in range(1, slides + 1):
        image = Image.new("RGB", (1920, 1080), "white")
        ImageDraw.Draw(image).text((40, 40), f"TEST DOUBLE - slide {number} of {slides}", fill="black")
        path = out_dir / f"slide-{number:02d}.png"
        image.save(path)
        previews.append(path)
        pages.append(image)
    pdf_path = out_dir / "deck.pdf"
    pages[0].save(pdf_path, "PDF", save_all=True, append_images=pages[1:], resolution=96.0)
    return pdf_path, previews


def install_master_render_double(monkeypatch: pytest.MonkeyPatch) -> bool:
    """Replace the conversion step unless the real renderer is installed. Returns True if replaced."""
    from services.presentation.master_deck import office

    if office.renderer_available():
        return False
    monkeypatch.setattr(office, "render_pptx", render_pptx_double)
    return True
