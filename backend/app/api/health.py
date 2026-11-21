from __future__ import annotations

from fastapi import APIRouter

from app.config import get_settings
from app.schemas.health import HealthResponse


router = APIRouter(tags=["system"])


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    settings = get_settings()
    warnings: list[str] = []
    provider_ready = True
    if settings.llm_provider.lower() in {"gemini", "google"} and not settings.gemini_api_key:
        provider_ready = False
        warnings.append("GEMINI_API_KEY is required when LLM_PROVIDER=gemini")
    return HealthResponse(
        status="ok",
        service=settings.app_name,
        version=settings.version,
        environment=settings.environment,
        model_provider=settings.llm_provider,
        model=settings.llm_model,
        provider_ready=provider_ready,
        configuration_warnings=warnings,
    )

