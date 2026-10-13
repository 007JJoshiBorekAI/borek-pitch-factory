"""Appendix layouts of the Borek Master Presentation, drawn with python-pptx.

Every function reproduces one layout of "Borek Master Presentation 02102026" on the 1920 x 1080
grid: positions, sizes, colours and type are the master's own values (taken from its HTML), not
approximations. Corners are square, there are no gradients or shadows, kickers are neutral grey,
and text never shrinks: content that does not fit is reported by ``fit_problems`` and rejected.

Only the layouts the appendix planner uses are implemented. The other L-ids are valid layout
identifiers of the library but cannot be rendered yet; asking for one is an explicit error.
"""

from __future__ import annotations

from typing import Any, Callable

from services.presentation.borek_deck.engine import engine

LAYOUT_IDS: tuple[str, ...] = tuple(f"L{number:02d}" for number in range(1, 26))
LAYOUT_NAMES = {
    "L01": "Two-column contrast",
    "L06": "Section divider",
    "L07": "Three-stage process",
    "L08": "Matrix + notes",
    "L14": "Objections / FAQ",
    "L25": "Open cards (navy top rule)",
}
# Filled-card layouts: the master allows at most one of them in a row.
FILLED_CARD_LAYOUTS = frozenset({"L02", "L04", "L05", "L07", "L16", "L18"})

# Master palette (Prompt Guide, "Colour").
NAVY, SLATE, GREY, MUTED = "0D1240", "5C6178", "8A90A5", "9AA0B3"
PANEL, LINE, RULE, WHITE, BLUE = "F3F4F8", "E2E4EC", "D5DDE9", "FFFFFF", "124F94"
FOOTER_TEXT = "Borek Solutions Group · boreksolutions.de"

# The engine measures text with the bundled Inter; the renderer sets it with its own Inter build.
# Upright text differs by a fraction of a percent, so a small margin keeps the predicted line
# breaks - and with them the master's row and card geometry - identical to the render. Italic
# text is set in a separate italic face that the engine cannot measure; it gets a wider margin,
# so a question may be given a second line it does not need, but texts never overlap.
MEASURE_SAFETY = 0.985
MEASURE_SAFETY_ITALIC = 0.93


def measured_height(text: Any, size: float, weight: int, width: float, line_height: float, *, italic: bool = False) -> float:
    factor = MEASURE_SAFETY_ITALIC if italic else MEASURE_SAFETY
    return engine().bp.th(str(text), size, weight, width * factor, line_height)


def line_count(text: Any, size: float, weight: int, width: float, letter_spacing: float = 0.0) -> int:
    return engine().bp.nlines(str(text), size, weight, width * MEASURE_SAFETY, letter_spacing)


Draw = Callable[[Any, dict[str, Any], "Canvas"], None]
_LAYOUTS: dict[str, Draw] = {}


class LayoutError(ValueError):
    """The slide cannot be drawn: unknown or unimplemented layout, or malformed content."""


class Canvas:
    """What a layout needs besides the slide: brand images of the canonical deck and fit findings."""

    def __init__(self, images: dict[str, str]) -> None:
        self.images = images  # logo_dark, logo_white, cover_bg -> file paths
        self.problems: list[str] = []

    def fit(self, what: str, text: str, size: float, weight: int, width: float, max_lines: int, ls: float = 0.0) -> None:
        lines = line_count(text, size, weight, width, ls)
        if lines > max_lines:
            self.problems.append(f"{what} needs {lines} lines, the layout allows {max_lines}: '{str(text)[:60]}'")


def layout(layout_id: str) -> Callable[[Draw], Draw]:
    def register(function: Draw) -> Draw:
        _LAYOUTS[layout_id] = function
        return function

    return register


def implemented_layouts() -> frozenset[str]:
    return frozenset(_LAYOUTS)


def draw_slide(slide: Any, content: dict[str, Any], canvas: Canvas, *, page: int, total: int) -> None:
    """Draw one appendix slide (an ``S`` wrapper of the deck engine) and its footer."""
    layout_id = str(content.get("layout"))
    if layout_id not in LAYOUT_IDS:
        raise LayoutError(f"'{layout_id}' is not a layout of the master library (L01-L25)")
    draw = _LAYOUTS.get(layout_id)
    if draw is None:
        raise LayoutError(f"Layout {layout_id} is part of the master library but is not implemented yet")
    try:
        draw(slide, content, canvas)
    except (KeyError, TypeError, IndexError) as exc:
        raise LayoutError(f"Layout {layout_id} content is malformed ({type(exc).__name__}: {exc})") from exc
    _footer(slide, page, total, dark=layout_id == "L06")


def _footer(s: Any, page: int, total: int, *, dark: bool) -> None:
    left, top, color = (115, 1010, engine().bp.mix(WHITE, NAVY, 0.7)) if dark else (72, 1000, MUTED)
    s.text(left, top, 1200, FOOTER_TEXT, size=15, color=color, ls=2.6, caps=True, lh=1.2, wrap=False)
    s.text(1920 - left - 300, top, 300, f"{page:02d} / {total:02d}", size=15, color=color, ls=2.6, lh=1.2, align="r", wrap=False)


def _header(s: Any, c: dict[str, Any], canvas: Canvas, *, width: int = 1300, max_lines: int = 2) -> None:
    """Logo right 72 / top 107 / width 280, kicker 18 Semibold caps grey, title 60 Light."""
    s.pic(canvas.images["logo_dark"], 1568, 107, 280)
    s.text(72, 119, 1100, c["kicker"], size=18, weight=600, color=GREY, ls=3.5, caps=True, lh=1.2, wrap=False)
    canvas.fit("title", c["title"], 60, 300, width, max_lines, -1.2)
    s.text(72, 150, width, c["title"], size=60, weight=300, color=NAVY, lh=1.1, ls=-1.2)


def _lead(s: Any, canvas: Canvas, text: str, *, top: int, width: int, size: int, max_lines: int = 2) -> None:
    canvas.fit("lead", text, size, 400, width, max_lines)
    s.text(72, top, width, text, size=size, color=SLATE, lh=1.45)


def _statement(s: Any, canvas: Canvas, c: dict[str, Any], *, top: int, footnote_top: int, open_panel: bool = False) -> None:
    """Statement panel, height 110: 14px kicker + 25px Medium statement; optional 19px grey footnote."""
    statement = c.get("statement")
    if statement:
        if open_panel:  # L25: no fill, only a 3px navy top rule
            s.rect(72, top, 1776, 3, fill=NAVY)
            x, width, y = 72, 1776, top + 3 + 22
        else:
            s.rect(72, top, 1776, 110, fill=PANEL, line=LINE, lw=1)
            x, width = 72 + 36, 1776 - 72
            text_height = measured_height(statement["text"], 25, 500, width, 1.3)
            y = top + (110 - (14 * 1.2 + 8 + text_height)) / 2
        canvas.fit("statement", statement["text"], 25, 500, width, 2)
        s.text(x, y, 1200, statement["kicker"], size=14, weight=700, color=MUTED, ls=2.5, caps=True, lh=1.2, wrap=False)
        s.text(x, y + 14 * 1.2 + 8, width, statement["text"], size=25, weight=500, color=NAVY, lh=1.3)
    if c.get("footnote"):
        canvas.fit("footnote", c["footnote"], 19, 400, 1776, 1)
        s.text(72, footnote_top, 1776, c["footnote"], size=19, color=GREY, lh=1.45)


@layout("L06")
def section_divider(s: Any, c: dict[str, Any], canvas: Canvas) -> None:
    """Cover image, one flat navy overlay 0.82, kicker, 105px Light title in one line, one 30px line."""
    s.pic(canvas.images["cover_bg"], 0, 0, 1920, 1080)
    s.rect(0, 0, 1920, 1080, fill=NAVY, fill_alpha=0.82)
    s.pic(canvas.images["logo_white"], 115, 90, 286)
    s.text(115, 300, 1600, c["kicker"], size=20, weight=700, color="C9CEE0", ls=4.5, caps=True, lh=1.2, wrap=False)
    canvas.fit("title", c["title"], 105, 300, 1690, 1, -2.5)
    s.text(115, 420, 1690, c["title"], size=105, weight=300, color=WHITE, lh=1.05, ls=-2.5)
    canvas.fit("text", c["text"], 30, 400, 1430, 2)
    s.text(115, 585, 1430, c["text"], size=30, color="E4E7F3", lh=1.4)


@layout("L01")
def two_column_contrast(s: Any, c: dict[str, Any], canvas: Canvas) -> None:
    """Lead, two comparison cards (label, 36px title, up to four dash bullets), statement panel."""
    _header(s, c, canvas)
    _lead(s, canvas, c["lead"], top=300, width=1300, size=26)
    card_width = (1776 - 36) / 2
    cards = [c["left"], c["right"]]
    inner = card_width - 88
    heights = []
    for card in cards:
        bullets = sum(measured_height(item, 23, 400, inner - 16 - 26, 1.4) for item in card["bullets"]) + 16 * max(len(card["bullets"]) - 1, 0)
        heights.append(36 + 15 * 1.2 + 14 + 36 * 1.15 + 30 + bullets + 36)
    height = max(360, *heights)
    if 400 + height > 770:
        canvas.problems.append("the comparison cards are taller than the layout allows; use fewer or shorter bullets")
    for index, card in enumerate(cards):
        x = 72 + index * (card_width + 36)
        if len(card["bullets"]) > 4:
            canvas.problems.append("a comparison card holds at most four bullets")
        s.rect(x, 400, card_width, height, fill=PANEL, line=LINE, lw=1)
        s.text(x + 44, 400 + 36, inner, card["label"], size=15, weight=700, color=GREY, ls=2.5, caps=True, lh=1.2, wrap=False)
        canvas.fit("card title", card["title"], 36, 500, inner, 1)
        s.text(x + 44, 400 + 36 + 18 + 14, inner, card["title"], size=36, weight=500, color=NAVY, lh=1.15)
        y = 400 + 36 + 18 + 14 + 36 * 1.15 + 30
        for item in card["bullets"]:
            s.text(x + 44, y, 26, "—", size=23, color=MUTED, lh=1.4, wrap=False)
            y = s.text(x + 44 + 26 + 16, y, inner - 42, item, size=23, color=SLATE, lh=1.4) + 16
    _statement(s, canvas, c, top=785, footnote_top=912)


@layout("L25")
def open_cards(s: Any, c: dict[str, Any], canvas: Canvas) -> None:
    """Four open cards: no fill, no border, a 3px navy top rule; the statement panel is open too."""
    _header(s, c, canvas, width=1450, max_lines=1)
    _lead(s, canvas, c["lead"], top=238, width=1545, size=24)
    cards = c["cards"]
    if len(cards) != 4:
        canvas.problems.append(f"the open-cards layout holds four cards, not {len(cards)}")
    width = (1776 - 3 * 40) / 4
    for index, card in enumerate(cards[:4]):
        x = 72 + index * (width + 40)
        s.rect(x, 345, width, 3, fill=NAVY)
        canvas.fit("card title", card["title"], 28, 600, width, 2)
        s.text(x, 345 + 3 + 26, width, card["title"], size=28, weight=600, color=NAVY, lh=1.25)
        text_top = 345 + 3 + 26 + 70 + 16
        if text_top + measured_height(card["text"], 21, 400, width, 1.5) > 770:
            canvas.problems.append(f"card text is too long for the open-cards layout: '{card['text'][:60]}'")
        s.text(x, text_top, width, card["text"], size=21, color=SLATE, lh=1.5)
    _statement(s, canvas, c, top=785, footnote_top=912, open_panel=True)


@layout("L08")
def matrix_notes(s: Any, c: dict[str, Any], canvas: Canvas) -> None:
    """Two-column matrix (blue code + title | text, up to six rows) and two explanation notes."""
    bp = engine().bp
    _header(s, c, canvas)
    _lead(s, canvas, c["lead"], top=300, width=1300, size=24)
    rows = c["rows"]
    if not 1 <= len(rows) <= 6:
        canvas.problems.append(f"the matrix holds one to six rows, not {len(rows)}")
    y = 400.0
    for index, row in enumerate(rows[:6]):
        code_width = bp.text_w(row["code"], 22, 600) + 16
        title_height = measured_height(row["title"], 22, 600, 360 - code_width - 12, 1.3)
        text_height = measured_height(row["text"], 22, 400, 720, 1.3)
        height = 20 + max(title_height, text_height) + 20
        s.text(72, y + 20, code_width, row["code"], size=22, weight=600, color=BLUE, lh=1.3, wrap=False)
        s.text(72 + code_width, y + 20, 360 - code_width - 12, row["title"], size=22, weight=600, color=NAVY, lh=1.3)
        s.text(72 + 360, y + 20, 720, row["text"], size=22, color=SLATE, lh=1.3)
        y += height
        if index < len(rows) - 1:
            s.rect(72, y, 1080, 1, fill=LINE)
            y += 1
    if y > 940:
        canvas.problems.append("the matrix rows run past the content zone; use shorter texts or fewer rows")
    notes = c["notes"]
    if len(notes) != 2:
        canvas.problems.append(f"the layout holds two notes, not {len(notes)}")
    note_y = 400.0
    for note in notes[:2]:
        text_height = measured_height(note["text"], 20, 400, 608 - 72, 1.45)
        height = 32 + 70 + 14 + text_height + 32
        canvas.fit("note title", note["title"], 28, 600, 608 - 72, 2)
        s.rect(1240, note_y, 608, height, fill=PANEL, line=LINE, lw=1)
        s.text(1240 + 36, note_y + 32, 608 - 72, note["title"], size=28, weight=600, color=NAVY, lh=1.25)
        s.text(1240 + 36, note_y + 32 + 70 + 14, 608 - 72, note["text"], size=20, color=SLATE, lh=1.45)
        note_y += height + 28
    if note_y - 28 > 940:
        canvas.problems.append("the two notes run past the content zone; shorten their texts")


@layout("L07")
def three_stage_process(s: Any, c: dict[str, Any], canvas: Canvas) -> None:
    """Three stage cards (blue number, 39px title, text, optional result line) and a statement panel."""
    _header(s, c, canvas)
    _lead(s, canvas, c["lead"], top=250, width=1500, size=24)
    stages = c["stages"]
    if len(stages) != 3:
        canvas.problems.append(f"the process layout holds three stages, not {len(stages)}")
    width = (1776 - 2 * 36) / 3
    inner = width - 80
    heights = []
    for stage in stages[:3]:
        height = 36 + 46 + 36 + 86 + 22 + measured_height(stage["text"], 21, 400, inner, 1.45) + 36
        if stage.get("result"):
            height += 22 + 1 + 22 + measured_height(stage["result"], 20, 400, inner, 1.4)
        heights.append(height)
    height = max(410, *heights) if heights else 410
    if 330 + height > 750:
        canvas.problems.append("the stage cards are taller than the layout allows; shorten the stage texts")
    for index, stage in enumerate(stages[:3]):
        x = 72 + index * (width + 36)
        s.rect(x, 330, width, height, fill=PANEL, line=LINE, lw=1)
        s.text(x + 40, 330 + 36, inner, stage["number"], size=46, weight=600, color=BLUE, lh=1.0, wrap=False)
        canvas.fit("stage title", stage["title"], 39, 600, inner, 2)
        s.text(x + 40, 330 + 36 + 46 + 36, inner, stage["title"], size=39, weight=600, color=NAVY, lh=1.1)
        s.text(x + 40, 330 + 36 + 46 + 36 + 86 + 22, inner, stage["text"], size=21, color=SLATE, lh=1.45)
        if stage.get("result"):
            result_height = measured_height(stage["result"], 20, 400, inner, 1.4)
            top = 330 + height - 36 - result_height
            s.rect(x + 40, top - 22 - 1, inner, 1, fill=RULE)
            s.text(x + 40, top, inner, stage["result"], size=20, color=NAVY, lh=1.4)
    _statement(s, canvas, c, top=765, footnote_top=903)


@layout("L14")
def objections_faq(s: Any, c: dict[str, Any], canvas: Canvas) -> None:
    """Four quoted questions (32px Light italic) with a short answer each, and a support line."""
    _header(s, c, canvas, max_lines=1)
    _lead(s, canvas, c["lead"], top=250, width=1500, size=23)
    items = c["items"]
    if len(items) != 4:
        canvas.problems.append(f"the FAQ layout holds four questions, not {len(items)}")
    width = (1776 - 36) / 2
    inner = width - 80
    y = 390.0
    for row in range(2):
        pair = items[row * 2 : row * 2 + 2]
        if not pair:
            break
        height = max(
            34 + measured_height(item["question"], 32, 300, inner, 1.25, italic=True) + 16 + measured_height(item["answer"], 21, 400, inner, 1.45) + 34
            for item in pair
        )
        for column, item in enumerate(pair):
            x = 72 + column * (width + 36)
            question_height = measured_height(item["question"], 32, 300, inner, 1.25, italic=True)
            s.rect(x, y, width, height, fill=PANEL, line=LINE, lw=1)
            s.text(x + 40, y + 34, inner, item["question"], size=32, weight=300, color=NAVY, lh=1.25, italic=True)
            s.text(x + 40, y + 34 + question_height + 16, inner, item["answer"], size=21, color=SLATE, lh=1.45)
        y += height + 30
    if y - 30 > 850:
        canvas.problems.append("the four question cards run into the support line; use shorter questions or answers")
    if c.get("support"):
        canvas.fit("support line", c["support"], 23, 600, 1600, 2)
        s.text(72, 870, 1600, c["support"], size=23, weight=600, color=NAVY, lh=1.4)
