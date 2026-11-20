from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.screenplay import CanonicalEpisode, ParserWarning


class ArchiveIngestionResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    project_name: str
    source_name: str
    source_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    file_count: int = Field(ge=1)
    total_uncompressed_bytes: int = Field(ge=1)
    episodes: list[CanonicalEpisode] = Field(min_length=1)
    warnings: list[ParserWarning] = Field(default_factory=list)


class ArchiveValidationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    project_name: str
    source_name: str
    source_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    episode_count: int = Field(ge=1)
    scene_count: int = Field(ge=1)
    event_count: int = Field(ge=1)
    duration_ms: int = Field(gt=0)
    event_types: dict[str, int]
    warnings: list[ParserWarning] = Field(default_factory=list)

