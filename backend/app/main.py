from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.health import router as health_router
from app.api.evaluation import router as evaluation_router
from app.api.ingestion import router as ingestion_router
from app.api.jobs import router as jobs_router
from app.api.projects import router as projects_router
from app.api.promos import router as promos_router
from app.api.reviews import router as reviews_router
from app.config import get_settings
from app.database import init_database


settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_database()
    import asyncio
    from app.services.orchestration import resume_incomplete_jobs
    try:
        asyncio.create_task(resume_incomplete_jobs())
    except Exception:
        pass
    yield

app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    description="Source-grounded narrative intelligence and editorial workflow API.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.allowed_origins),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(health_router, prefix=settings.api_prefix)
app.include_router(evaluation_router, prefix=settings.api_prefix)
app.include_router(ingestion_router, prefix=settings.api_prefix)
app.include_router(projects_router, prefix=settings.api_prefix)
app.include_router(jobs_router, prefix=settings.api_prefix)
app.include_router(promos_router, prefix=settings.api_prefix)
app.include_router(reviews_router, prefix=settings.api_prefix)

