"""
preview_pptx.py - quick PNG preview of a generated deck (no PowerPoint / LibreOffice needed).

    python preview_pptx.py deck.pptx            -> deck_preview/slide_01.png ...
    python preview_pptx.py deck.pptx --contact  -> also writes deck_preview/contact_sheet.png

It is an approximation (Pillow draws rectangles, pictures and Inter text); use PowerPoint for the final check.
"""
import argparse
import io
from pathlib import Path

from lxml import etree
from PIL import Image, ImageDraw, ImageFont
from pptx import Presentation
from pptx.oxml.ns import qn

HERE = Path(__file__).resolve().parent
FONT = HERE / "borek_assets" / "fonts" / "Inter-Variable.ttf"
PX = 9525
_cache = {}


def font(size, weight):
    k = (round(size * 4), weight)
    if k not in _cache:
        f = ImageFont.truetype(str(FONT), size)
        try:
            f.set_variation_by_axes([weight])
        except Exception:
            pass
        _cache[k] = f
    return _cache[k]


def hex2rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def fill_of(spPr):
    sf = spPr.find(qn("a:solidFill"))
    if sf is None:
        return None
    c = sf.find(qn("a:srgbClr"))
    if c is None:
        return None
    a = c.find(qn("a:alpha"))
    return hex2rgb(c.get("val")), (int(a.get("val")) / 100000 if a is not None else 1.0)


def draw_shape(img, el, kind):
    spPr = el.find(qn("p:spPr"))
    xfrm = spPr.find(qn("a:xfrm"))
    off, ext = xfrm.find(qn("a:off")), xfrm.find(qn("a:ext"))
    x, y, w, h = (int(off.get("x")) / PX, int(off.get("y")) / PX, int(ext.get("cx")) / PX, int(ext.get("cy")) / PX)
    geom = spPr.find(qn("a:prstGeom"))
    prst = geom.get("prst") if geom is not None else "rect"
    radius = 0
    if prst == "roundRect":
        gd = geom.find(qn("a:avLst"))
        adj = 16667
        if gd is not None and gd.find(qn("a:gd")) is not None:
            adj = int(gd.find(qn("a:gd")).get("fmla").split()[1])
        radius = adj / 100000 * min(w, h)
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    box = [x, y, x + w, y + h]

    def shp(fillc, outline=None, width=1):
        if prst == "ellipse":
            d.ellipse(box, fill=fillc, outline=outline, width=width)
        elif radius:
            d.rounded_rectangle(box, radius=radius, fill=fillc, outline=outline, width=width)
        else:
            d.rectangle(box, fill=fillc, outline=outline, width=width)
    gf = spPr.find(qn("a:gradFill"))
    if gf is not None:   # horizontal alpha gradient
        stops = [(int(g.get("pos")) / 100000, hex2rgb(g[0].get("val")), int(g[0][0].get("val")) / 100000)
                 for g in gf.find(qn("a:gsLst"))]
        for px in range(int(w)):
            t = px / max(w - 1, 1)
            for (p0, c0, a0), (p1, c1, a1) in zip(stops, stops[1:]):
                if p0 <= t <= p1:
                    a = a0 + (a1 - a0) * ((t - p0) / max(p1 - p0, 1e-6))
                    d.line([(x + px, y), (x + px, y + h)], fill=c0 + (int(a * 255),))
                    break
    else:
        f = fill_of(spPr)
        ln = spPr.find(qn("a:ln"))
        outline, lw = None, 1
        if ln is not None and ln.find(qn("a:solidFill")) is not None:
            c = ln.find(qn("a:solidFill")).find(qn("a:srgbClr"))
            a = c.find(qn("a:alpha"))
            outline = hex2rgb(c.get("val")) + (int((int(a.get("val")) / 100000 if a is not None else 1) * 255),)
            lw = max(1, round(int(ln.get("w", PX)) / PX))
        if f or outline:
            shp(f[0] + (int(f[1] * 255),) if f else None, outline, lw)
    img.alpha_composite(layer)


def draw_pic(img, shape):
    pic = Image.open(io.BytesIO(shape.image.blob)).convert("RGBA")
    iw, ih = pic.size
    l, t, r, b = shape.crop_left, shape.crop_top, shape.crop_right, shape.crop_bottom
    pic = pic.crop((int(l * iw), int(t * ih), int(iw - r * iw), int(ih - b * ih)))
    x, y, w, h = shape.left / PX, shape.top / PX, shape.width / PX, shape.height / PX
    pic = pic.resize((max(int(w), 1), max(int(h), 1)), Image.LANCZOS)
    geom = shape._element.spPr.find(qn("a:prstGeom"))
    prst = geom.get("prst") if geom is not None else "rect"
    mask = None
    if prst in ("ellipse", "roundRect"):
        mask = Image.new("L", pic.size, 0)
        md = ImageDraw.Draw(mask)
        if prst == "ellipse":
            md.ellipse([0, 0, pic.width - 1, pic.height - 1], fill=255)
        else:
            gd = geom.find(qn("a:avLst")).find(qn("a:gd"))
            md.rounded_rectangle([0, 0, pic.width - 1, pic.height - 1],
                                 radius=int(gd.get("fmla").split()[1]) / 100000 * min(pic.size), fill=255)
    am = shape._element.blipFill.find(qn("a:blip")).find(qn("a:alphaModFix"))
    if am is not None:
        a = pic.getchannel("A").point(lambda v: int(v * int(am.get("amt")) / 100000))
        pic.putalpha(a)
    if mask is not None:
        a = pic.getchannel("A")
        pic.putalpha(Image.composite(a, Image.new("L", pic.size, 0), mask))
    img.alpha_composite(pic, (int(x), int(y)))


def draw_text(img, shape):
    tf = shape.text_frame
    d = ImageDraw.Draw(img)
    x, y, w = shape.left / PX, shape.top / PX, shape.width / PX
    wrap = tf.word_wrap is not False
    ytop = y
    anchor = shape._element.txBody.find(qn("a:bodyPr")).get("anchor", "t")
    if anchor in ("ctr", "b"):
        _y0 = shape.top / PX
        _h = shape.height / PX
        _tot = 0.0
        for _p in tf.paragraphs:
            if _p.runs:
                _tot += _p.runs[0].font.size.pt / 0.75 * 1.2083 * (_p.line_spacing or 1.0)
        ytop = _y0 + ((_h - _tot) / 2 if anchor == "ctr" else (_h - _tot))
    for p in tf.paragraphs:
        runs = [(r.text, r.font) for r in p.runs]
        if not runs:
            continue
        spc = p.line_spacing or 1.0
        size0 = runs[0][1].size.pt / 0.75
        pitch = size0 * 1.2083 * spc
        # tokens: (word, font obj, px size, weight, color, ls)
        toks = []
        for text, f in runs:
            size = f.size.pt / 0.75
            wt = 700 if f.bold else 400
            rPr = None
            col = f.color.rgb
            col = (col[0], col[1], col[2])
            ls = 0.0
            for r in p.runs:
                if r.text == text and r.font is f:
                    ls = int(r._r.get_or_add_rPr().get("spc", "0")) / 75
            for i, wd in enumerate(text.split(" ")):
                toks.append(((" " if i else "") + wd, size, wt, col, ls, f.italic))
        lines, cur, cw_ = [], [], 0.0
        for tk in toks:
            fnt = font(tk[1], tk[2])
            tw = fnt.getlength(tk[0]) + tk[4] * len(tk[0])
            if wrap and cur and cw_ + tw > w + 0.5 and tk[0].startswith(" "):
                lines.append(cur)
                tk = (tk[0][1:],) + tk[1:]
                tw = fnt.getlength(tk[0]) + tk[4] * len(tk[0])
                cur, cw_ = [], 0.0
            cur.append(tk)
            cw_ += tw
        lines.append(cur)
        for ln in lines:
            lw_ = sum(font(t[1], t[2]).getlength(t[0]) + t[4] * len(t[0]) for t in ln)
            cx = x
            if p.alignment is not None:
                s = str(p.alignment)
                if "CENTER" in s:
                    cx = x + (w - lw_) / 2
                elif "RIGHT" in s:
                    cx = x + w - lw_
            base = ytop + pitch - 0.2412 * max(t[1] for t in ln)
            for t in ln:
                fnt = font(t[1], t[2])
                if t[4]:
                    for ch in t[0]:
                        d.text((cx, base), ch, font=fnt, fill=t[3], anchor="ls")
                        cx += fnt.getlength(ch) + t[4]
                else:
                    d.text((cx, base), t[0], font=fnt, fill=t[3], anchor="ls")
                    cx += fnt.getlength(t[0])
            ytop += pitch


def render(prs_path, outdir, contact=False):
    prs = Presentation(prs_path)
    outdir = Path(outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    thumbs = []
    for i, slide in enumerate(prs.slides, 1):
        bg = slide._element.find(qn("p:cSld")).find(qn("p:bg"))
        col = (255, 255, 255)
        if bg is not None:
            c = bg.find(".//" + qn("a:srgbClr"))
            col = hex2rgb(c.get("val"))
        img = Image.new("RGBA", (1920, 1080), col + (255,))
        for sh in slide.shapes:
            tag = etree.QName(sh._element).localname
            if tag == "pic":
                draw_pic(img, sh)
            elif tag == "sp":
                if sh._element.find(qn("p:txBody")) is not None and sh.has_text_frame and sh.text_frame.text.strip():
                    draw_text(img, sh)
                else:
                    draw_shape(img, sh._element, tag)
        p = outdir / f"slide_{i:02d}.png"
        img.convert("RGB").save(p)
        thumbs.append(img.convert("RGB"))
    if contact and thumbs:
        tw, th_ = 640, 360
        cols = 3
        rows = (len(thumbs) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * tw + (cols + 1) * 10, rows * th_ + (rows + 1) * 10), (200, 204, 212))
        for i, t in enumerate(thumbs):
            sheet.paste(t.resize((tw, th_), Image.LANCZOS), (10 + (i % cols) * (tw + 10), 10 + (i // cols) * (th_ + 10)))
        sheet.save(outdir / "contact_sheet.png")
    return len(thumbs)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("pptx")
    ap.add_argument("--out")
    ap.add_argument("--contact", action="store_true")
    a = ap.parse_args()
    out = a.out or str(Path(a.pptx).with_suffix("")) + "_preview"
    print(render(a.pptx, out, a.contact), "slides ->", out)
