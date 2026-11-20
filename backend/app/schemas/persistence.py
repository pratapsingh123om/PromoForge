from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ProjectResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    status: str
    source_name: str | None
    source_sha256: str | None
    episode_count: int = Field(ge=0)
    warning_count: int = Field(ge=0)
    created_at: datetime


class ProjectImportResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    project: ProjectResponse
    created: bool


class EpisodeResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    episode_id: str
    episode_number: int
    external_episode_id: str | None
    source_name: str | None
    duration_ms: int
    scene_count: int
    event_count: int
    warning_count: int


class EpisodeImportResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    project_id: str
    episode: EpisodeResponse
    created: bool


class NamedEpisodeImportResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    project: ProjectResponse
    episode: EpisodeResponse
    project_created: bool
    episode_created: bool


class AnalysisJobRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    idempotency_key: str = Field(default="analysis-v1", min_length=1, max_length=128)


class AnalysisJobResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    project_id: str
    idempotency_key: str
    status: str
    stage: str
    episodes_total: int
    episodes_completed: int
    episodes_failed: int
    episodes_pending: int
    progress_percent: int
    resumable: bool
    cancel_requested: bool
    error_message: str | None
    created_at: datetime
    updated_at: datetime


class AnalysisJobMutationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    job: AnalysisJobResponse
    created: bool | None = None

