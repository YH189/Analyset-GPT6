"""Printable reports, built from calculated analysis values only."""

from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

import reportlab
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .models import Analysis, Comparison


def pdf_report(report: Analysis, drift: Comparison | None) -> bytes:
    output = BytesIO()
    doc = SimpleDocTemplate(output, rightMargin=36, leftMargin=36, topMargin=36, bottomMargin=36)
    font_dir = Path(reportlab.__file__).parent / "fonts"
    for label, filename in [
        ("AnalySetSans", "Vera.ttf"),
        ("AnalySetSans-Bold", "VeraBd.ttf"),
        ("AnalySetSans-Italic", "VeraIt.ttf"),
        ("AnalySetSans-BoldItalic", "VeraBI.ttf"),
    ]:
        if label not in pdfmetrics.getRegisteredFontNames():
            pdfmetrics.registerFont(TTFont(label, str(font_dir / filename)))
    pdfmetrics.registerFontFamily(
        "AnalySetSans",
        normal="AnalySetSans",
        bold="AnalySetSans-Bold",
        italic="AnalySetSans-Italic",
        boldItalic="AnalySetSans-BoldItalic",
    )
    styles = getSampleStyleSheet()
    for style in styles.byName.values():
        style.fontName = (
            "AnalySetSans-Bold" if style.name.startswith(("Heading", "Title")) else "AnalySetSans"
        )
    styles["BodyText"].fontSize = 9
    styles["BodyText"].leading = 13
    story = []

    def para(text, style="BodyText"):
        story.append(Paragraph(escape(str(text)), styles[style]))
        story.append(Spacer(1, 6))

    def table(rows, widths):
        cells = [[Paragraph(escape(str(v)), styles["BodyText"]) for v in row] for row in rows]
        element = Table(cells, colWidths=widths, repeatRows=1, hAlign="LEFT")
        element.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#ededed")),
                    ("LINEBELOW", (0, 0), (-1, -1), 0.3, colors.lightgrey),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                ]
            )
        )
        story.extend([element, Spacer(1, 12)])

    para("AnalySet", "Title")
    para("Dataset quality and drift report", "Heading2")
    para(f"{report.filename} | {report.timestamp}")
    para(f"{report.row_count:,} rows / {report.column_count} columns / {report.file_size:,} bytes")
    para(f"AnalySet Quality Score: {report.quality_score}/100", "Heading2")
    table(
        [["Dimension", "Score", "Weight"]]
        + [[k, f"{v:.2f}", f"{report.settings.weights[k]}%"] for k, v in report.components.items()],
        [3 * inch, inch, inch],
    )
    para("Summary", "Heading2")
    for sentence in report.summary:
        para(sentence)
    para("Column statistics", "Heading2")
    for c in report.columns:
        para(f"{c['name']} ({c['dtype']})", "Heading3")
        para(
            f"Missing: {c['missing_count']} ({c['missing_percentage']}%). Unique: {c['unique_values']}. Outliers: {c['outlier_count']}."
        )
        if c["dtype"] == "numeric":
            para(
                " / ".join(
                    f"{key}: {c[key]:.6g}" if c[key] is not None else f"{key}: —"
                    for key in ["min", "max", "mean", "median", "std", "q1", "q3"]
                )
            )
        elif c["value_counts"]:
            para(
                "Most frequent: "
                + ", ".join(f"{v['value']} ({v['count']})" for v in c["value_counts"])
            )
    para("Detected issues", "Heading2")
    for issue in report.issues:
        para(f"{issue.severity} — {issue.column}: {issue.issue_type}", "Heading3")
        para(f"{issue.affected_rows} rows ({issue.affected_percentage}%). {issue.description}")
        para(f"Suggested fix: {issue.suggested_fix}")
    if drift:
        para("Baseline comparison and drift", "Heading2")
        para(f"{drift.overall}: {drift.drifted} of {drift.analyzed} analyzed columns show drift.")
        para(
            f"Added columns: {drift.added_columns}. Removed columns: {drift.removed_columns}. Type changes: {drift.type_changes}."
        )
        for c in drift.columns:
            para(
                f"{c['column']}: {c['status']}; {c['method']}={c['statistic']}; threshold={c['threshold']}. {c['interpretation']}"
            )
    para("Methodology and limitations", "Heading2")
    para(
        "AnalySet uses a configurable quality heuristic, not an industry-standard score. Missing tokens: blank, NA, N/A, null, none, NaN (case-insensitive). Duplicate rows are exact repeats after the first occurrence. Identifier and range checks use column-name heuristics. Statistical outliers require contextual review."
    )
    para(
        f"IQR bounds use Q1 minus {report.settings.iqr_multiplier} × IQR and Q3 plus {report.settings.iqr_multiplier} × IQR. Drift statuses use effect-size thresholds, not significance claims. Numeric tests use at most 10,000 deterministic samples per dataset; at least 20 observations are required."
    )
    doc.build(story)
    return output.getvalue()
