from __future__ import annotations

from collections.abc import Coroutine
from typing import Any, TypeVar

import pytest
from fastapi import HTTPException

from app.api.health import health
from app.api.evaluation import read_evaluation_rubric
from app.api.ingestion import ingest_text, validate_archive_content
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


def test_health_endpoint() -> None:
    response = resolve_immediate(health())

    assert response.model_dump() == {
        "status": "ok",
        "service": "PromoForge Intelligence Engine",
        "version": "0.1.0",
        "environment": "development",
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

