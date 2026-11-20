from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.evaluation import PromoEvaluationReport, ReviewDecision, RubricScores


class CreateEvaluationSessionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    session_key: str = Field(default="editorial-v1", min_length=1, max_length=128)
    reviewer_ids: list[str] = Field(min_length=2, max_length=20)

    @model_validator(mode="after")
    def validate_reviewers(self) -> "CreateEvaluationSessionRequest":
        if len(self.reviewer_ids) != len(set(self.reviewer_ids)):
            raise ValueError("reviewer_ids must be unique")
        if any(not reviewer_id for reviewer_id in self.reviewer_ids):
            raise ValueError("reviewer_ids cannot be blank")
        return self


class TiebreakerRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    reviewer_id: str = Field(min_length=1, max_length=128)


class ReviewSubmission(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    reviewer_id: str = Field(min_length=1, max_length=128)
    decision: ReviewDecision
    scores: RubricScores
    boundary_usable: bool
    spoiler_safe: bool
    notes: str | None = Field(default=None, max_length=2000)


class EvaluationSessionSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    job_id: str
    episode_id: str
    session_key: str
    status: str
    candidate_count: int = Field(ge=0)
    assignment_count: int = Field(ge=0)
    completed_assignment_count: int = Field(ge=0)
    min_reviews_per_candidate: int = Field(ge=1)
    created_at: datetime
    completed_at: datetime | None


class EvaluationReadyItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    job_id: str
    project_id: str
    project_name: str
    episode_id: str
    generator_version: str
    candidate_count: int = Field(ge=1)


class CreateEvaluationSessionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session: EvaluationSessionSummary
    created: bool


class ReviewEvidenceItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_id: str
    start_ms: int
    end_ms: int
    event_type: str
    character: str | None
    text: str


class ReviewAssignmentResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    session_id: str
    reviewer_id: str
    blind_label: str
    assignment_order: int = Field(ge=1)
    status: str
    episode_id: str
    start_ms: int
    end_ms: int
    duration_ms: int
    evidence: list[ReviewEvidenceItem]
    completed_at: datetime | None


class ReviewAssignmentListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session: EvaluationSessionSummary
    assignments: list[ReviewAssignmentResponse]


class ReviewSubmissionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    assignment: ReviewAssignmentResponse


class TiebreakerResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session: EvaluationSessionSummary
    assignments_created: int = Field(ge=0)


class EvaluationSessionReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session: EvaluationSessionSummary
    report: PromoEvaluationReport
