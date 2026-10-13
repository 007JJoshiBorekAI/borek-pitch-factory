"""Render a Borek-engine deck into the artifact bundle the pipeline already consumes.

The bundle has the same layout the TypeScript renderer returns (``deck.pptx``, ``deck.pdf``,
``manifest.json`` and one PNG per slide), so ``renderer_client._extract_bundle`` publishes it
atomically and nothing downstream (artifact filing, deck center, downloads) changes.

* PPTX     ``borek_pptx.build_deck`` (python-pptx), on the reference theme when it is present
* previews ``preview_pptx.render`` (Pillow, Inter font - no PowerPoint or LibreOffice needed)
* PDF      the previews as pages (works everywhere), or LibreOffice when
           ``DECK_PDF_ENGINE=libreoffice`` and ``soffice`` is installed (selectable text)
"""

from __future__ import annotations

import io
import json
import logging
import os
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path
from typing import Any

from services.presentation.borek_deck.deck_plan import borek_slides_from_specs
from services.presentation.borek_deck.engine import engine

logger = logging.getLogger(__name__)

SOFFICE_TIMEOUT_SECONDS = 180


class BorekDeckRenderError(RuntimeError):
    code = "PPTX_RENDER_FAILED"
    retryable = False


def render_deck_bundle(
    slide_specs: list[dict[str, Any]],
    *,
    deck_kind: str,
    pdf_engine: str = "preview",
) -> bytes:
    """Build deck.pptx, deck.pdf and previews for persisted slide specs; return the zipped bundle."""
    if deck_kind in ("master_v1", "master_v2"):
        # Master Presentation: the canonical deck is assembled, never drawn by the layout engine.
        from services.presentation.master_deck.render import MasterRenderError, render_master_bundle

        try:
            return render_master_bundle(slide_specs)
        except MasterRenderError as exc:
            error = BorekDeckRenderError(str(exc))
            error.code = exc.code
            raise error from exc
    eng = engine()
    try:
        slides = borek_slides_from_specs(slide_specs)
    except (KeyError, TypeError) as exc:
        raise BorekDeckRenderError("Slide specs are not Borek deck slides") from exc
    if not slides:
        raise BorekDeckRenderError("A deck needs at least one slide")
    with tempfile.TemporaryDirectory(prefix="borek-deck-") as tmp:
        work = Path(tmp)
        pptx_path = work / "deck.pptx"
        try:
            warnings = eng.bp.build_deck(
                slides,
                pptx_path,
                template=eng.template_for(deck_kind),
                footer_text=eng.footer_for(deck_kind),
            )
            preview_dir = work / "previews"
            count = eng.preview.render(str(pptx_path), str(preview_dir))
        except Exception as exc:
            raise BorekDeckRenderError(f"Borek deck could not be rendered: {type(exc).__name__}: {exc}") from exc
        previews = sorted(preview_dir.glob("slide_*.png"), key=lambda path: int(path.stem.split("_")[1]))
        if count != len(slides) or len(previews) != len(slides):
            raise BorekDeckRenderError(
                f"Borek deck rendered {len(previews)} preview pages for {len(slides)} slides"
            )
        pdf_path = work / "deck.pdf"
        used_pdf_engine = _write_pdf(pptx_path, previews, pdf_path, pdf_engine)
        preview_names = [f"preview-{index:03d}.png" for index in range(1, len(previews) + 1)]
        manifest = {
            "validation": {
                "status": "VALID",
                "warnings": [{"slide": index, "message": message} for index, message in warnings],
            },
            "engine": "borek_deck",
            "deckKind": deck_kind,
            "pdfEngine": used_pdf_engine,
            "slideCount": len(slides),
            "previews": preview_names,
        }
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.write(pptx_path, "deck.pptx")
            archive.write(pdf_path, "deck.pdf")
            archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False))
            for source, name in zip(previews, preview_names, strict=True):
                archive.write(source, name)
        return buffer.getvalue()


def _write_pdf(pptx_path: Path, previews: list[Path], pdf_path: Path, pdf_engine: str) -> str:
    if pdf_engine == "libreoffice":
        if _pdf_with_libreoffice(pptx_path, pdf_path):
            return "libreoffice"
        logger.warning("LibreOffice PDF export unavailable; building the PDF from the preview pages")
    _pdf_from_previews(previews, pdf_path)
    return "preview"


def _pdf_from_previews(previews: list[Path], pdf_path: Path) -> None:
    from PIL import Image

    pages = [Image.open(path).convert("RGB") for path in previews]
    try:
        # 1920 x 1080 px at 96 dpi is the deck's 20 x 11.25 in page
        pages[0].save(pdf_path, "PDF", save_all=True, append_images=pages[1:], resolution=96.0)
    finally:
        for page in pages:
            page.close()


def _pdf_with_libreoffice(pptx_path: Path, pdf_path: Path) -> bool:
    soffice = _soffice()
    if soffice is None:
        return False
    try:
        subprocess.run(
            [soffice, "--headless", "--convert-to", "pdf", "--outdir", str(pptx_path.parent), str(pptx_path)],
            check=True,
            capture_output=True,
            timeout=SOFFICE_TIMEOUT_SECONDS,
        )
    except (OSError, subprocess.SubprocessError):
        logger.exception("LibreOffice PDF export failed")
        return False
    produced = pptx_path.with_suffix(".pdf")
    return produced.is_file() and produced.resolve() == pdf_path.resolve()


def _soffice() -> str | None:
    for candidate in (os.environ.get("SOFFICE_PATH"), os.environ.get("LIBREOFFICE_PATH"), "soffice", "libreoffice"):
        if candidate and shutil.which(candidate):
            return candidate
    return None
