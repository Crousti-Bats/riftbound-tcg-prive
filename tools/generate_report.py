"""Génère le rapport PDF d'avancement à partir de docs/PROMPT_INITIAL.md et docs/ETAT_PROJET.md.

Usage : python tools/generate_report.py <numero_etape> "<titre court>"
Sortie : docs/rapports/rapport-<NN>-<slug>.pdf
Dépendance : pip install reportlab
"""
import os
import re
import sys
import unicodedata
from datetime import date

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (PageBreak, Paragraph, Preformatted, SimpleDocTemplate, Spacer, Table,
                                TableStyle)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, "docs")

# Police Unicode (accents, ≤, →) : Arial / Consolas sous Windows, sinon Helvetica.
FONT, FONT_B, MONO = "Helvetica", "Helvetica-Bold", "Courier"
_win = os.path.join(os.environ.get("WINDIR", "C:\\Windows"), "Fonts")
try:
    pdfmetrics.registerFont(TTFont("Arial", os.path.join(_win, "arial.ttf")))
    pdfmetrics.registerFont(TTFont("Arial-Bold", os.path.join(_win, "arialbd.ttf")))
    pdfmetrics.registerFontFamily("Arial", normal="Arial", bold="Arial-Bold", italic="Arial", boldItalic="Arial-Bold")
    FONT, FONT_B = "Arial", "Arial-Bold"
    pdfmetrics.registerFont(TTFont("Consolas", os.path.join(_win, "consola.ttf")))
    MONO = "Consolas"
except Exception:  # noqa: BLE001 - fallback police standard
    pass

ss = getSampleStyleSheet()
ACCENT = colors.HexColor("#1f4e79")
S = {
    "title": ParagraphStyle("t", parent=ss["Title"], fontName=FONT_B, fontSize=24, textColor=ACCENT, leading=30),
    "sub": ParagraphStyle("s", parent=ss["Normal"], fontName=FONT, fontSize=12, alignment=TA_CENTER,
                          textColor=colors.HexColor("#555555")),
    "h1": ParagraphStyle("h1", parent=ss["Heading1"], fontName=FONT_B, fontSize=17, textColor=ACCENT, spaceBefore=6),
    "h2": ParagraphStyle("h2", parent=ss["Heading2"], fontName=FONT_B, fontSize=13.5, textColor=ACCENT, spaceBefore=10),
    "h3": ParagraphStyle("h3", parent=ss["Heading3"], fontName=FONT_B, fontSize=11.5, spaceBefore=8),
    "p": ParagraphStyle("p", parent=ss["Normal"], fontName=FONT, fontSize=9.8, leading=13.5, spaceAfter=4),
    "li": ParagraphStyle("li", parent=ss["Normal"], fontName=FONT, fontSize=9.8, leading=13.5, leftIndent=14,
                         bulletIndent=4, spaceAfter=1),
    "cell": ParagraphStyle("c", parent=ss["Normal"], fontName=FONT, fontSize=8.6, leading=11),
    "cellh": ParagraphStyle("ch", parent=ss["Normal"], fontName=FONT_B, fontSize=8.6, leading=11,
                            textColor=colors.white),
    "code": ParagraphStyle("code", parent=ss["Code"], fontName=MONO, fontSize=8.4, leading=11,
                           backColor=colors.HexColor("#f3f3f3"), borderPadding=6, spaceBefore=4, spaceAfter=8),
}


def inline(text: str) -> str:
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    text = re.sub(r"`([^`]+)`", rf'<font face="{MONO}" color="#a3361d">\1</font>', text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<link href="\2" color="#1f4e79">\1</link>', text)
    return text


def md_to_flowables(md: str, width: float):
    out, lines, i = [], md.splitlines(), 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("```"):
            buf, i = [], i + 1
            while i < len(lines) and not lines[i].startswith("```"):
                buf.append(lines[i]); i += 1
            out.append(Preformatted("\n".join(buf), S["code"], maxLineLength=105))
        elif line.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                if not all(re.fullmatch(r":?-{2,}:?", c) for c in cells):
                    rows.append(cells)
                i += 1
            i -= 1
            data = [[Paragraph(inline(c), S["cellh" if r == 0 else "cell"]) for c in row] for r, row in enumerate(rows)]
            t = Table(data, colWidths=[width / len(rows[0])] * len(rows[0]), repeatRows=1)
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#eef3f8")]),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#b8c4d0")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]))
            out += [t, Spacer(1, 8)]
        elif line.startswith("### "):
            out.append(Paragraph(inline(line[4:]), S["h3"]))
        elif line.startswith("## "):
            out.append(Paragraph(inline(line[3:]), S["h2"]))
        elif line.startswith("# "):
            out.append(Paragraph(inline(line[2:]), S["h1"]))
        elif re.match(r"^\s*[-*] ", line):
            out.append(Paragraph(inline(re.sub(r"^\s*[-*] ", "", line)), S["li"], bulletText="•"))
        elif re.match(r"^\s*\d+\. ", line):
            n = re.match(r"^\s*(\d+)\. ", line).group(1)
            out.append(Paragraph(inline(re.sub(r"^\s*\d+\. ", "", line)), S["li"], bulletText=f"{n}."))
        elif line.startswith("> "):
            out.append(Paragraph(f"<i>{inline(line[2:])}</i>", S["p"]))
        elif line.strip():
            out.append(Paragraph(inline(line), S["p"]))
        i += 1
    return out


def slugify(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def main():
    if len(sys.argv) < 3:
        sys.exit('Usage : python tools/generate_report.py <numero_etape> "<titre>"')
    num, title = int(sys.argv[1]), sys.argv[2]
    os.makedirs(os.path.join(DOCS, "rapports"), exist_ok=True)
    out = os.path.join(DOCS, "rapports", f"rapport-{num:02d}-{slugify(title)}.pdf")

    def footer(c, d):
        c.saveState(); c.setFont(FONT, 8); c.setFillColor(colors.grey)
        c.drawString(2 * cm, 1.2 * cm, f"Riftbound TCG privé — Rapport étape {num}")
        c.drawRightString(A4[0] - 2 * cm, 1.2 * cm, f"Page {d.page}")
        c.restoreState()

    doc = SimpleDocTemplate(out, pagesize=A4, leftMargin=2 * cm, rightMargin=2 * cm, topMargin=1.8 * cm,
                            bottomMargin=2 * cm, title=f"Rapport étape {num} — {title}", author="Sébastien Girard")
    w = doc.width
    story = [Spacer(1, 6 * cm), Paragraph("Riftbound TCG privé", S["title"]),
             Paragraph(f"Rapport d'avancement — Étape {num} : {inline(title)}", S["sub"]), Spacer(1, 10),
             Paragraph(date.today().strftime("%d/%m/%Y"), S["sub"]), Spacer(1, 3 * cm),
             Paragraph("Pour reprendre le projet dans une nouvelle conversation, donner ce PDF (ou le dépôt "
                       "GitHub) à l'assistant et lui demander de lire <b>docs/ETAT_PROJET.md</b> puis de "
                       "continuer à l'étape indiquée comme « prochaine étape ».", S["p"]),
             PageBreak()]
    for name in ("PROMPT_INITIAL.md", "ETAT_PROJET.md"):
        with open(os.path.join(DOCS, name), encoding="utf-8") as f:
            story += md_to_flowables(f.read(), w)
        story.append(PageBreak())
    doc.build(story[:-1], onFirstPage=footer, onLaterPages=footer)
    print(out)


if __name__ == "__main__":
    main()
