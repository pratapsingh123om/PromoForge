from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ReviewDecision(str, Enum):
    APPROVE = "approve"
    CHANGES = "approve_with_changes"
    REJECT = "reject"


class SourceEpisodeReference(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    episode_id: str = Field(min_length=1, max_length=64)
    episode_number: int = Field(ge=1)
    duration_ms: int = Field(gt=0)
    event_ids: list[str] = Field(min_length=1)
    spoiler_event_ids: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_event_ids(self) -> "SourceEpisodeReference":
        if len(self.event_ids) != len(set(self.event_ids)):
            raise ValueError("event_ids must be unique")
        unknown_spoilers = set(self.spoiler_event_ids) - set(self.event_ids)
        if unknown_spoilers:
            raise ValueError("spoiler_event_ids must be present in event_ids")
        return self


class PromoSegment(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    episode_id: str = Field(min_length=1, max_length=64)
    start_ms: int = Field(ge=0)
    end_ms: int = Field(gt=0)
    evidence_event_ids: list[str] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_range_and_evidence(self) -> "PromoSegment":
        if self.end_ms <= self.start_ms:
            raise ValueError("end_ms must be greater than start_ms")
        if len(self.evidence_event_ids) != len(set(self.evidence_event_ids)):
            raise ValueError("evidence_event_ids must be unique")
        return self


class PromoCandidate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    candidate_id: str = Field(min_length=1, max_length=128)
    system_id: str = Field(default="promoforge", min_length=1, max_length=64)
    rank: int = Field(ge=1)
    segments: list[PromoSegment] = Field(min_length=1, max_length=3)


class RubricScores(BaseModel):
    model_config = ConfigDict(extra="forbid")

    hook: int = Field(ge=1, le=5)
    curiosity: int = Field(ge=1, le=5)
    clarity: int = Field(ge=1, le=5)
    emotion: int = Field(ge=1, le=5)
    coherence: int = Field(ge=1, le=5)
    spoiler_safety: int = Field(ge=1, le=5)
    editability: int = Field(ge=1, le=5)
    brand_fit: int = Field(ge=1, le=5)

    def mean(self) -> float:
        scores = self.model_dump()
        return sum(scores.values()) / len(scores)


class EditorReview(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    candidate_id: str = Field(min_length=1, max_length=128)
    reviewer_id: str = Field(min_length=1, max_length=128)
    decision: ReviewDecision
    scores: RubricScores
    boundary_usable: bool
    spoiler_safe: bool
    notes: str | None = Field(default=None, max_length=2000)


class EvaluationPolicy(BaseModel):
    model_config = ConfigDict(extra="forbid")

    min_duration_ms: int = Field(default=20_000, gt=0)
    max_duration_ms: int = Field(default=60_000, gt=0)
    duplicate_iou_threshold: float = Field(default=0.6, gt=0, le=1)
    top_k: int = Field(default=10, ge=1, le=100)
    min_reviews_per_candidate: int = Field(default=2, ge=1, le=20)

    @model_validator(mode="after")
    def validate_duration_range(self) -> "EvaluationPolicy":
        if self.max_duration_ms < self.min_duration_ms:
            raise ValueError("max_duration_ms must be at least min_duration_ms")
        return self


class PromoEvaluationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_episodes: list[SourceEpisodeReference] = Field(min_length=1)
    candidates: list[PromoCandidate] = Field(min_length=1)
    reviews: list[EditorReview] = Field(default_factory=list)
    policy: EvaluationPolicy = Field(default_factory=EvaluationPolicy)


class CandidateEvaluationResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    candidate_id: str
    system_id: str
    rank: int
    duration_ms: int = Field(ge=0)
    automatically_valid: bool
    issues: list[str]
    duplicate_of: list[str]
    review_count: int = Field(ge=0)
    mean_editor_score: float | None = Field(default=None, ge=1, le=5)
    consensus_decision: str | None
    editor_accepted: bool | None
    boundary_usable: bool | None
    spoiler_safe: bool | None
    usable: bool | None


class SystemEvaluationMetrics(BaseModel):
    model_config = ConfigDict(extra="forbid")

    candidate_count: int = Field(ge=0)
    automatically_valid_count: int = Field(ge=0)
    automatic_validity_rate: float = Field(ge=0, le=1)
    fully_reviewed_count: int = Field(ge=0)
    review_coverage: float = Field(ge=0, le=1)
    precision_at_k: float | None = Field(default=None, ge=0, le=1)
    precision_at_k_complete: bool
    acceptance_rate: float | None = Field(default=None, ge=0, le=1)
    mean_editor_score: float | None = Field(default=None, ge=1, le=5)
    boundary_usable_rate: float | None = Field(default=None, ge=0, le=1)
    spoiler_violation_rate: float | None = Field(default=None, ge=0, le=1)
    duplicate_candidate_rate: float = Field(ge=0, le=1)
    duplicate_pair_count: int = Field(ge=0)
    inter_reviewer_agreement: float | None = Field(default=None, ge=0, le=1)


class SystemEvaluationSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    system_id: str
    metrics: SystemEvaluationMetrics


class EvaluationDatasetSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    candidate_count: int = Field(ge=0)
    review_count: int = Field(ge=0)
    reviewer_count: int = Field(ge=0)
    system_count: int = Field(ge=0)


class PromoEvaluationReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    policy: EvaluationPolicy
    dataset: EvaluationDatasetSummary
    systems: list[SystemEvaluationSummary]
    candidates: list[CandidateEvaluationResult]


class RubricCriterion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str
    label: str
    question: str


class RubricDefinition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scale_min: int = 1
    scale_max: int = 5
    criteria: list[RubricCriterion]
    decisions: list[str]
    instructions: list[str]
