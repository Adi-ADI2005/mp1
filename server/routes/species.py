from fastapi import APIRouter, Depends, Request

from ..ml.config import SUPPORTED_DISEASES, SUPPORTED_SPECIES
from ..utils.security import get_current_user

router = APIRouter(prefix="/api", tags=["species"])


@router.get("/species")
async def species_list(user: dict = Depends(get_current_user)):
    return [{"name": name, "configurable": True} for name in SUPPORTED_SPECIES]


@router.get("/species/pool/{pool_id}")
async def species_in_pool(pool_id: str, request: Request, user: dict = Depends(get_current_user)):
    results = await request.app.state.database.find_many("analysis_results", {"pool_id": pool_id})
    counts = {}
    for result in results:
        for item in result.get("species_distribution", []):
            counts[item["name"]] = counts.get(item["name"], 0) + item["count"]
    return [{"name": name, "count": count} for name, count in counts.items()]


@router.get("/diseases")
async def disease_list(user: dict = Depends(get_current_user)):
    return [{"name": name, "preliminary_screening_only": True} for name in SUPPORTED_DISEASES]


@router.get("/diseases/pool/{pool_id}")
async def diseases_in_pool(pool_id: str, request: Request, user: dict = Depends(get_current_user)):
    results = await request.app.state.database.find_many("analysis_results", {"pool_id": pool_id})
    counts = {}
    for result in results:
        for item in result.get("disease_distribution", []):
            counts[item["name"]] = counts.get(item["name"], 0) + item["count"]
    return [{"name": name, "count": count} for name, count in counts.items()]