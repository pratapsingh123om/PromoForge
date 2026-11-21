from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv


load_dotenv()

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATABASE_PATH = (
    Path("/tmp/promoforge.db")
    if os.getenv("VERCEL")
    else REPOSITORY_ROOT / "data" / "promoforge.db"
)
DEFAULT_DATABASE_URL = f"sqlite:///{DEFAULT_DATABASE_PATH.as_posix()}"


@dataclass(frozen=True, slots=True)
class Settings:
    app_name: str = "PromoForge Intelligence Engine"
    version: str = "0.1.0"
    environment: str = "development"
    host: str = "127.0.0.1"
    port: int = 8000
    api_prefix: str = "/api"
    database_url: str = DEFAULT_DATABASE_URL
    llm_provider: str = "fallback"
    llm_model: str = "gemini-3.1-flash-lite"
    gemini_api_key: str = field(default="", repr=False)
    max_concurrent_requests: int = 2
    max_retries: int = 3
    provider_timeout_seconds: int = 60
    allowed_origins: tuple[str, ...] = (
        "http://127.0.0.1:8443",
        "http://localhost:8443",
        "http://127.0.0.1:4173",
        "http://localhost:4173",
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    raw_origins = os.getenv(
        "PROMOFORGE_ALLOWED_ORIGINS",
        "http://127.0.0.1:8443,http://localhost:8443,http://127.0.0.1:4173,http://localhost:4173",
    )
    allowed_origins = tuple(
        origin.strip() for origin in raw_origins.split(",") if origin.strip()
    )
    return Settings(
        environment=os.getenv("PROMOFORGE_ENV", "development"),
        host=os.getenv("PROMOFORGE_HOST", "127.0.0.1"),
        port=int(os.getenv("PROMOFORGE_PORT", "8000")),
        database_url=os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL),
        llm_provider=os.getenv("LLM_PROVIDER", "fallback"),
        llm_model=os.getenv("LLM_MODEL", "gemini-3.1-flash-lite"),
        gemini_api_key=os.getenv("GEMINI_API_KEY", ""),
        max_concurrent_requests=int(os.getenv("MAX_CONCURRENT_REQUESTS", "2")),
        max_retries=int(os.getenv("MAX_RETRIES", "3")),
        provider_timeout_seconds=int(os.getenv("PROVIDER_TIMEOUT_SECONDS", "60")),
        allowed_origins=allowed_origins,
    )

