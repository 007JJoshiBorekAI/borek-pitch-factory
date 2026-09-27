"""Generate Meridian_Client_Brief.pdf from the TXT brief (requires reportlab)."""

from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

HERE = Path(__file__).resolve().parent
TXT = HERE / "Meridian_Client_Brief.txt"
PDF = HERE / "Meridian_Client_Brief.pdf"


def main() -> None:
    text = TXT.read_text(encoding="utf-8")
    c = canvas.Canvas(str(PDF), pagesize=A4)
    width, height = A4
    margin = 18 * mm
    y = height - margin
    line_height = 4.2 * mm
    c.setFont("Helvetica", 9)
    for raw_line in text.splitlines():
        line = raw_line.replace("\t", "    ")
        if y < margin:
            c.showPage()
            c.setFont("Helvetica", 9)
            y = height - margin
        c.drawString(margin, y, line[:120])
        y -= line_height
    c.save()
    print(f"Wrote {PDF}")


if __name__ == "__main__":
    main()
