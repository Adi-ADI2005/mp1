import csv
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse

from ..schemas.entities import ReportInput
from ..utils.audit import record_audit
from ..utils.security import get_current_user

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _rows(pools, cameras, analyses, alerts, pool_id, report_type):
    camera_by_pool = {}
    for camera in cameras:
        camera_by_pool.setdefault(camera["pool_id"], []).append(camera["camera_id"])
    latest = {}
    for analysis in analyses:
        latest.setdefault(analysis.get("pool_id"), analysis)
    selected = [pool for pool in pools if not pool_id or pool["pool_id"] == pool_id]
    if report_type == "camera":
        pools_by_id = {pool["pool_id"]: pool for pool in selected}
        return [
            {
                "camera_id": camera["camera_id"],
                "camera_name": camera.get("camera_name", ""),
                "pool_id": camera["pool_id"],
                "pool_name": pools_by_id.get(camera["pool_id"], {}).get("pool_name", ""),
                "camera_type": camera.get("camera_type", "Unknown"),
                "status": camera.get("status", "UNKNOWN"),
                "stream_url_configured": bool(camera.get("camera_url")),
                "resolution": camera.get("resolution", ""),
                "fps": camera.get("fps", ""),
                "last_seen": camera.get("last_seen", ""),
            }
            for camera in cameras
            if camera["pool_id"] in pools_by_id
        ]
    if report_type in {"species", "disease"}:
        distribution_key = "species_distribution" if report_type == "species" else "disease_distribution"
        count_key = "fish_count" if report_type == "species" else "flagged_count"
        rows = []
        for analysis in latest.values():
            if pool_id and analysis.get("pool_id") != pool_id:
                continue
            for item in analysis.get(distribution_key, []):
                rows.append({
                    "pool_id": analysis.get("pool_id", ""),
                    "analysis_date": analysis.get("created_at", ""),
                    report_type: item.get("name", "Unknown"),
                    count_key: item.get("count", 0),
                    "provider_mode": analysis.get("provider_mode", "DEMO_MODEL"),
                })
        return rows
    if report_type == "population":
        return [
            {
                "analysis_id": analysis.get("_id", ""),
                "pool_id": analysis.get("pool_id", ""),
                "analysis_date": analysis.get("created_at", ""),
                "fish_count": analysis.get("fish_count", 0),
                "estimated_biomass_kg": analysis.get("summary", {}).get("estimated_biomass_kg"),
                "provider_mode": analysis.get("provider_mode", "DEMO_MODEL"),
            }
            for analysis in analyses
            if not pool_id or analysis.get("pool_id") == pool_id
        ]
    return [
        {
            "farm": "Demo Farm" if pool.get("is_demo") else "Aquaculture Farm",
            "pool_id": pool["pool_id"],
            "pool_name": pool["pool_name"],
            "camera_ids": "; ".join(camera_by_pool.get(pool["pool_id"], [])),
            "report_date": datetime.now(timezone.utc).date().isoformat(),
            "fish_count": pool.get("current_fish_count", 0),
            "species": pool.get("species", "Other"),
            "average_length_cm": pool.get("average_length_cm"),
            "average_weight_g": pool.get("average_weight_g"),
            "disease_alerts": sum(1 for alert in alerts if alert.get("pool_id") == pool["pool_id"] and alert.get("type") == "DISEASE"),
            "provider_mode": latest.get(pool["pool_id"], {}).get("provider_mode", "DEMO_MODEL"),
        }
        for pool in selected
    ]


@router.get("")
async def list_reports(request: Request, user: dict = Depends(get_current_user)):
    return await request.app.state.database.find_many("reports", sort=("created_at", -1))


@router.post("/generate")
async def generate_report(
    payload: ReportInput, request: Request, user: dict = Depends(get_current_user),
):
    database = request.app.state.database
    if payload.pool_id and await database.find_one("pools", {"pool_id": payload.pool_id}) is None:
        raise HTTPException(status_code=404, detail="Pool not found.")
    pools = await database.find_many("pools")
    cameras = await database.find_many("cameras")
    analyses = await database.find_many("analysis_results", sort=("created_at", -1), limit=500)
    alerts = await database.find_many("health_alerts")
    rows = _rows(pools, cameras, analyses, alerts, payload.pool_id, payload.type)
    report_id = str(uuid4())
    stamp = datetime.now(timezone.utc)
    output_dir = request.app.state.settings.report_dir
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{report_id}.{payload.format}"
    columns = list(rows[0].keys()) if rows else [
        "farm", "pool_id", "pool_name", "camera_ids", "report_date", "fish_count",
        "species", "average_length_cm", "average_weight_g", "disease_alerts", "provider_mode",
    ]
    if payload.format == "csv":
        with output_path.open("w", newline="", encoding="utf-8-sig") as file:
            writer = csv.DictWriter(file, fieldnames=columns)
            writer.writeheader()
            writer.writerows(rows)
    else:
        try:
            from reportlab.lib import colors
            from reportlab.lib.pagesizes import landscape, letter
            from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
            from reportlab.lib.styles import getSampleStyleSheet
        except ImportError as exc:
            raise HTTPException(status_code=503, detail="PDF reporting dependency is unavailable.") from exc
        document = SimpleDocTemplate(str(output_path), pagesize=landscape(letter))
        table_data = [[column.replace("_", " ").title() for column in columns]]
        table_data.extend([[str(row.get(column, "")) for column in columns] for row in rows])
        table = Table(table_data, repeatRows=1)
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#164e63")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#d1e5e7")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#eff8f7")]),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("PADDING", (0, 0), (-1, -1), 7),
        ]))
        styles = getSampleStyleSheet()
        document.build([Paragraph("Aquaculture monitoring report", styles["Title"]), Spacer(1, 14), table])

    report = {
        "_id": report_id,
        "id": report_id,
        "type": payload.type,
        "format": payload.format,
        "pool_id": payload.pool_id,
        "row_count": len(rows),
        "created_at": stamp.isoformat(),
        "filename": output_path.name,
        "created_by": user.get("email"),
    }
    await database.insert_one("reports", report)
    await record_audit(database, user, "REPORT_GENERATED", report_id)
    return report


@router.get("/{report_id}")
async def get_report(report_id: str, request: Request, user: dict = Depends(get_current_user)):
    report = await request.app.state.database.find_one("reports", {"_id": report_id})
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found.")
    return report


@router.get("/{report_id}/download")
async def download_report(report_id: str, request: Request, user: dict = Depends(get_current_user)):
    report = await request.app.state.database.find_one("reports", {"_id": report_id})
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found.")
    path = request.app.state.settings.report_dir / report["filename"]
    if not path.is_file():
        raise HTTPException(status_code=410, detail="The report file is no longer available.")
    media_type = "text/csv" if report["format"] == "csv" else "application/pdf"
    return FileResponse(path, media_type=media_type, filename=report["filename"])