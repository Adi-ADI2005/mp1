"""CSV/PDF report data preparation and rendering."""

import csv
from datetime import datetime, timezone
import io
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from storage import store


class ReportingService:
    fields = [
        "pool_id", "pool_name", "location", "pool_status", "species", "fish_count",
        "camera_id", "camera_status", "temperature_c", "ph", "oxygen_mg_l", "health",
        "average_length_cm", "average_weight_g", "estimated_biomass_kg",
    ]

    def rows(self, pool_id=None):
        pools = store.find("pools", {"id": pool_id}) if pool_id else store.find("pools")
        cameras = {row.get("id"): row for row in store.find("cameras")}
        rows = []
        for pool in pools:
            camera = cameras.get(pool.get("camera_id"), {})
            rows.append({
                "pool_id": pool.get("id"),
                "pool_name": pool.get("name"),
                "location": pool.get("location"),
                "pool_status": pool.get("status"),
                "species": pool.get("species"),
                "fish_count": pool.get("fish_count"),
                "camera_id": camera.get("id", ""),
                "camera_status": camera.get("status", "unassigned"),
                "temperature_c": pool.get("temperature_c"),
                "ph": pool.get("ph"),
                "oxygen_mg_l": pool.get("oxygen_mg_l"),
                "health": pool.get("health") or "unknown",
                "average_length_cm": "Not measured",
                "average_weight_g": "Not measured",
                "estimated_biomass_kg": "Not measured",
            })
        return rows

    def csv(self, rows):
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=self.fields)
        writer.writeheader()
        safe_rows = [
            {
                key: ("'" + value if isinstance(value, str) and value[:1] in {"=", "+", "-", "@"} else value)
                for key, value in row.items()
            }
            for row in rows
        ]
        writer.writerows(safe_rows)
        return output.getvalue().encode("utf-8-sig")

    def pdf(self, rows, title):
        output = io.BytesIO()
        document = SimpleDocTemplate(output, pagesize=letter, title=title)
        styles = getSampleStyleSheet()
        story = [
            Paragraph("FishCheck", styles["Title"]),
            Paragraph(escape(title), styles["Heading2"]),
            Paragraph(
                f"Generated {datetime.now(timezone.utc).strftime('%d %b %Y, %H:%M UTC')}",
                styles["Normal"],
            ),
            Spacer(1, 18),
        ]
        data = [["Pool", "Location", "Species", "Fish", "Camera", "Health"]]
        data.extend([
            [
                f"{row['pool_id']} · {row['pool_name']}", row["location"] or "—",
                row["species"] or "Unspecified", f"{int(row['fish_count'] or 0):,}",
                row["camera_status"], str(row["health"] or "unknown").title(),
            ]
            for row in rows
        ])
        table = Table(data, repeatRows=1, colWidths=[130, 70, 68, 42, 80, 60])
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#142c36")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5d9")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f0f5f5")]),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
        ]))
        story.extend([
            table,
            Spacer(1, 16),
            Paragraph(
                "Measurements remain unavailable until a validated model and camera calibration are configured. "
                "Demo workspaces contain illustrative values, not live farm telemetry.",
                styles["BodyText"],
            ),
        ])
        document.build(story)
        return output.getvalue()


reporting_service = ReportingService()