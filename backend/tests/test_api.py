from __future__ import annotations

from collections.abc import Coroutine
from typing import Any, TypeVar

import pytest
from fastapi import HTTPException

from app.api.health import health
from app.api.evaluation import read_evaluation_rubric
from app.api.ingestion import (
    ingest_text,
    validate_archive_content,
    validate_screenplay_files,
)
from app.config import get_settings
from app.main import app
from app.schemas.screenplay import TextIngestionRequest


ResultT = TypeVar("ResultT")


def resolve_immediate(coroutine: Coroutine[Any, Any, ResultT]) -> ResultT:
    """Resolve handlers that intentionally perform no asynchronous I/O in M0."""

    try:
        coroutine.send(None)
    except StopIteration as completed:
        return completed.value
    raise AssertionError("M0 handler unexpectedly suspended for asynchronous I/O")


def test_m0_routes_are_registered() -> None:
    route_methods = {
        (path, method.upper())
        for path, operations in app.openapi()["paths"].items()
        for method in operations
    }

    assert ("/api/health", "GET") in route_methods
    assert ("/api/ingestion/text", "POST") in route_methods
    assert ("/api/ingestion/archive/validate", "POST") in route_methods
    assert ("/api/ingestion/files/validate", "POST") in route_methods
    assert ("/api/demo/scoring/prompt", "POST") in route_methods
    assert ("/api/demo/scoring/run", "POST") in route_methods
    assert ("/api/projects", "GET") in route_methods
    assert ("/api/projects/import", "POST") in route_methods
    assert any(path.endswith("/episodes") and method == "GET" for path, method in route_methods)
    assert any(path.endswith("/analyze") and method == "POST" for path, method in route_methods)
    assert ("/api/projects/episodes/import", "POST") in route_methods
    assert any(path.endswith("/episodes/import") and method == "POST" for path, method in route_methods)
    assert any(path.endswith("/retry") and method == "POST" for path, method in route_methods)
    assert any(path.endswith("/cancel") and method == "POST" for path, method in route_methods)
    assert any(path.endswith("/narrative") and method == "GET" for path, method in route_methods)
    assert ("/api/evaluation/rubric", "GET") in route_methods
    assert ("/api/evaluation/promos", "POST") in route_methods
    assert any(path.endswith("/promos/generate") and method == "POST" for path, method in route_methods)
    assert any(path.endswith("/promos") and method == "GET" for path, method in route_methods)
    assert any(
        path.endswith("/promos/recommendation") and method == "GET"
        for path, method in route_methods
    )
    assert any(
        path.endswith("/promos/evaluation-template") and method == "GET"
        for path, method in route_methods
    )
    assert any(path.endswith("/evaluation/sessions") and method == "POST" for path, method in route_methods)
    assert any(path.endswith("/assignments") and method == "GET" for path, method in route_methods)
    assert any(path.endswith("/review") and method == "POST" for path, method in route_methods)
    assert any(path.endswith("/tiebreaker") and method == "POST" for path, method in route_methods)
    assert any(path.endswith("/finalize") and method == "POST" for path, method in route_methods)
    assert ("/api/evaluation/ready", "GET") in route_methods
    assert ("/api/evaluation/sessions", "GET") in route_methods
    assert any(path.endswith("/export") and method == "GET" for path, method in route_methods)
    assert any("/promos/" in path and method == "PATCH" for path, method in route_methods)


def test_health_endpoint() -> None:
    response = resolve_immediate(health())
    settings = get_settings()

    assert response.model_dump() == {
        "status": "ok",
        "service": "PromoForge Intelligence Engine",
        "version": "0.1.0",
        "environment": "development",
        "model_provider": settings.llm_provider,
        "model": settings.llm_model,
        "provider_ready": not (
            settings.llm_provider.lower() in {"gemini", "google"}
            and not settings.gemini_api_key
        ),
        "configuration_warnings": (
            ["GEMINI_API_KEY is required when LLM_PROVIDER=gemini"]
            if settings.llm_provider.lower() in {"gemini", "google"}
            and not settings.gemini_api_key
            else []
        ),
    }


def test_evaluation_rubric_is_editor_facing_and_blinded() -> None:
    rubric = read_evaluation_rubric()

    assert [criterion.key for criterion in rubric.criteria] == [
        "hook",
        "curiosity",
        "clarity",
        "emotion",
        "coherence",
        "spoiler_safety",
        "editability",
        "brand_fit",
    ]
    assert "Hide system and model identity from reviewers." in rubric.instructions


def test_text_ingestion_endpoint_returns_canonical_episode() -> None:
    response = resolve_immediate(
        ingest_text(
            TextIngestionRequest(
                episode_id="ep 003",
                text=(
                    "[00:12.000 --> 00:15.000] EMMA: Who told you my secret?\n"
                    "[00:15.000 --> 00:18.000] ACTION: Daniel steps backwards."
                ),
            )
        )
    )

    body = response.model_dump(mode="json")
    assert body["episode"]["episode_id"] == "EP_003"
    assert body["episode"]["duration_ms"] == 18_000
    assert body["episode"]["events"][0]["event_id"] == "EP_003_E001"
    assert body["episode"]["events"][0]["start_ms"] == 12_000
    assert body["episode"]["events"][0]["character"] == "Emma"
    assert body["warnings"] == []
    assert len(body["source_sha256"]) == 64


def test_strict_ingestion_reports_unparsed_lines() -> None:
    payload = TextIngestionRequest(
        episode_id="EP_001",
        text="This line has no timestamp.",
        strict=True,
    )

    with pytest.raises(HTTPException) as error:
        resolve_immediate(ingest_text(payload))

    assert error.value.status_code == 422
    assert error.value.detail["code"] == "ingestion_failed"
    assert error.value.detail["line_numbers"] == [1]


def test_archive_validation_summary_uses_engine_output() -> None:
    from test_company_archive import _archive_bytes

    response = validate_archive_content(
        _archive_bytes(),
        source_name="synthetic.zip",
    )

    assert response.episode_count == 1
    assert response.scene_count == 2
    assert response.event_count == 4
    assert response.event_types == {
        "action": 1,
        "camera": 1,
        "dialogue": 1,
        "sound": 1,
    }


def test_batch_file_validation_keeps_successes_and_reports_failures() -> None:
    from test_company_archive import SYNTHETIC_SCRIPT

    response = validate_screenplay_files(
        [
            ("episode-001.txt", SYNTHETIC_SCRIPT.encode("utf-8")),
            ("broken.txt", b"not a screenplay"),
        ],
        language="en",
    )

    assert response.file_count == 2
    assert response.valid_count == 1
    assert response.failed_count == 1
    assert response.total_event_count == 4
    assert response.total_scoring_event_count == 2
    assert response.episodes[0].last_timestamp_ms == 12_000
    assert response.episodes[0].alias_analysis_available is False
    assert response.episodes[1].error == "missing required header: EPISODE NUMBER"


def test_batch_file_validation_rejects_duplicate_episode_ids() -> None:
    from test_company_archive import SYNTHETIC_SCRIPT

    response = validate_screenplay_files(
        [
            ("first.txt", SYNTHETIC_SCRIPT.encode("utf-8")),
            ("second.txt", SYNTHETIC_SCRIPT.encode("utf-8")),
        ],
        language="en",
    )

    assert response.valid_count == 1
    assert response.failed_count == 1
    assert "Duplicate EP_001" in (response.episodes[1].error or "")

