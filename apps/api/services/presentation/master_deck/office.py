"""Server-side rendering of an assembled Master Presentation: the PPTX is the only source.

    deck.pptx --LibreOffice headless--> deck.pdf --pdftoppm--> one PNG per slide

The PDF and every preview therefore show the very file the user downloads. There is no second
renderer and no approximation: when LibreOffice, poppler or the Inter fonts are missing, or the
result does not have exactly one page per slide in Inter, rendering fails and so does the job.

Runtime requirements (installed by docker/api and docker/worker):
``libreoffice-impress``, ``poppler-utils`` (pdftoppm, pdffonts, pdfinfo), ``fontconfig`` and
``fonts-inter`` (Inter Regular/Bold/Italic, SIL Open Font License 1.1).
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
from pathlib import Path

CONVERT_TIMEOUT_SECONDS = 240
RASTER_TIMEOUT_SECONDS = 240
PREVIEW_WIDTH, PREVIEW_HEIGHT = 1920, 1080
_FONT_LINE = re.compile(r"^(?:[A-Z]{6}\+)?(\S+)\s")


class OfficeRenderError(RuntimeError):
    """The deck could not be converted faithfully; nothing may be published."""

    code = "MASTER_PRESENTATION_RENDER_FAILED"
    retryable = False


class OfficeRendererUnavailable(OfficeRenderError):
    """A required tool or font is not installed in this runtime."""

    code = "MASTER_RENDERER_UNAVAILABLE"


def _tool(names: tuple[str | None, ...], what: str) -> str:
    for candidate in names:
        if candidate and shutil.which(candidate):
            return str(shutil.which(candidate))
    raise OfficeRendererUnavailable(f"{what} is not installed in this runtime; the deck cannot be rendered")


def soffice_path() -> str:
    return _tool((os.environ.get("SOFFICE_PATH"), os.environ.get("LIBREOFFICE_PATH"), "soffice", "libreoffice"), "LibreOffice")


def _poppler(name: str) -> str:
    return _tool((os.environ.get(f"{name.upper()}_PATH"), name), f"poppler ({name})")


def renderer_available() -> bool:
    try:
        soffice_path(), _poppler("pdftoppm"), _poppler("pdffonts"), _poppler("pdfinfo")
    except OfficeRendererUnavailable:
        return False
    return True


def _run(command: list[str], *, timeout: int, what: str, env: dict[str, str] | None = None) -> str:
    try:
        completed = subprocess.run(command, capture_output=True, text=True, timeout=timeout, env=env, check=False)
    except subprocess.TimeoutExpired as exc:
        raise OfficeRenderError(f"{what} timed out after {timeout} s") from exc
    except OSError as exc:
        raise OfficeRendererUnavailable(f"{what} could not be started: {exc}") from exc
    if completed.returncode != 0:
        raise OfficeRenderError(f"{what} failed (exit {completed.returncode}): {completed.stderr.strip()[:300]}")
    return completed.stdout


def pdf_page_count(pdf_path: Path) -> int:
    output = _run([_poppler("pdfinfo"), str(pdf_path)], timeout=60, what="Reading the PDF")
    match = re.search(r"^Pages:\s+(\d+)", output, re.MULTILINE)
    if not match:
        raise OfficeRenderError("The converted PDF reports no page count")
    return int(match.group(1))


def pdf_fonts(pdf_path: Path) -> set[str]:
    """Font names embedded in the PDF, without the subset prefix."""
    output = _run([_poppler("pdffonts"), str(pdf_path)], timeout=60, what="Reading the PDF fonts")
    fonts = set()
    for line in output.splitlines()[2:]:
        match = _FONT_LINE.match(line)
        if match:
            fonts.add(match.group(1))
    return fonts


def render_pptx(pptx_path: Path, workdir: Path, *, expected_slides: int) -> tuple[Path, list[Path]]:
    """Convert the assembled deck. Returns the PDF and one 1920 x 1080 PNG per slide, in order."""
    soffice = soffice_path()
    pdftoppm = _poppler("pdftoppm")
    out_dir = workdir / "office"
    out_dir.mkdir(parents=True, exist_ok=True)
    profile = workdir / "office-profile"  # isolated, writable profile: no shared state between jobs
    env = {**os.environ, "HOME": str(workdir)}
    _run(
        [
            soffice,
            "--headless",
            "--norestore",
            "--nolockcheck",
            f"-env:UserInstallation={profile.resolve().as_uri()}",
            "--convert-to",
            "pdf:impress_pdf_Export",
            "--outdir",
            str(out_dir),
            str(pptx_path),
        ],
        timeout=CONVERT_TIMEOUT_SECONDS,
        what="LibreOffice PDF conversion",
        env=env,
    )
    pdf_path = out_dir / (pptx_path.stem + ".pdf")
    if not pdf_path.is_file() or pdf_path.stat().st_size == 0:
        raise OfficeRenderError("LibreOffice produced no PDF for the deck")
    pages = pdf_page_count(pdf_path)
    if pages != expected_slides:
        raise OfficeRenderError(f"The PDF has {pages} pages for {expected_slides} slides")
    # The deck is set in Inter only. Any other embedded font means a font was substituted.
    foreign = sorted(name for name in pdf_fonts(pdf_path) if not name.lower().startswith("inter"))
    if foreign:
        raise OfficeRendererUnavailable(
            f"The deck was not rendered in Inter (substituted fonts: {', '.join(foreign)}); install the Inter fonts"
        )
    prefix = out_dir / "slide"
    _run(
        [pdftoppm, "-png", "-scale-to-x", str(PREVIEW_WIDTH), "-scale-to-y", str(PREVIEW_HEIGHT), str(pdf_path), str(prefix)],
        timeout=RASTER_TIMEOUT_SECONDS,
        what="Rendering the slide previews",
    )
    previews = sorted(out_dir.glob("slide-*.png"), key=lambda path: int(path.stem.rsplit("-", 1)[1]))
    if len(previews) != expected_slides or not all(path.stat().st_size > 0 for path in previews):
        raise OfficeRenderError(f"{len(previews)} previews were rendered for {expected_slides} slides")
    return pdf_path, previews
