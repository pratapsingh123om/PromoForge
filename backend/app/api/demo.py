from __future__ import annotations

import asyncio
import hashlib
import json

from fastapi import APIRouter, HTTPException, status

from app.config import get_settings
from app.llm.base import ProviderError, RetriableProviderError
from app.llm.dispatcher import ModelConfig, call_llm
from app.schemas.demo import (
    DemoScorePromptRequest,
    DemoScorePromptResponse,
    DemoScoreRequest,
    DemoScoreResponse,
    DemoScoringPayload,
)


router = APIRouter(prefix="/demo", tags=["demo"])


def build_scoring_prompt(payload: DemoScorePromptRequest) -> str:
    candidate_rows = []
    for candidate in payload.candidates:
        candidate_rows.append(
            {
                "candidate_id": candidate.candidate_id,
                "episode": candidate.episode,
                "start": candidate.start_clock,
                "end": candidate.end_clock,
                "duration_seconds": candidate.duration_seconds,
                "proposed_hook_line": candidate.hook_line,
                "proposed_cliffhanger_line": candidate.cliffhanger_line,
                "transcript": [
                    {
                        "speaker": line.speaker,
                        "text": line.text,
                        "start": line.start_clock,
                        "end": line.end_clock,
                    }
                    for line in candidate.transcript_lines
                ],
            }
        )

    audience = payload.target_audience or "Not specified"
    return (
        "You are scoring already-valid screenplay promo windows. Do not invent dialogue, "
        "timestamps, candidates, or confidence values. Score only from the supplied transcript.\n\n"
        f"Show: {payload.show_title}\n"
        f"Language: {payload.language}\n"
        f"Target audience: {audience}\n\n"
        "For every candidate, return exactly one object with the same candidate_id and these fields:\n"
        "- hook: 0-100 strength of the opening line as an immediate attention grabber\n"
        "- cliffhanger: 0-100 strength of the final line as an unresolved reason to continue\n"
        "- standalone: 0-100 clarity without context outside the cut\n"
        "- why_it_works: 2-4 evidence-grounded sentences (maximum 450 characters) explaining "
        "why the exact opening stops attention, how a specific middle beat escalates the story, "
        "why the final line creates unresolved curiosity, and any standalone-context or spoiler risk; "
        "quote or closely reference supplied lines and never claim certainty\n\n"
        "Return JSON only, matching the supplied schema. Candidate data:\n"
        f"{json.dumps(candidate_rows, ensure_ascii=False, separators=(',', ':'))}"
    )


def _prompt_response(payload: DemoScorePromptRequest) -> DemoScorePromptResponse:
    prompt = build_scoring_prompt(payload)
    return DemoScorePromptResponse(
        prompt=prompt,
        response_schema=DemoScoringPayload.model_json_schema(),
        prompt_sha256=hashlib.sha256(prompt.encode("utf-8")).hexdigest(),
    )


@router.post("/scoring/prompt", response_model=DemoScorePromptResponse)
async def create_scoring_prompt(
    payload: DemoScorePromptRequest,
) -> DemoScorePromptResponse:
    return _prompt_response(payload)


@router.post("/scoring/run", response_model=DemoScoreResponse)
async def run_demo_scoring(payload: DemoScoreRequest) -> DemoScoreResponse:
    settings = get_settings()
    prompt_info = _prompt_response(payload)
    request_key = payload.model.api_key.get_secret_value() if payload.model.api_key else ""
    api_key = request_key
    if payload.model.provider == "gemini" and not api_key:
        api_key = settings.gemini_api_key
    if payload.model.provider in {"gemini", "openai"} and not api_key:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "api_key_required",
                "message": (
                    "No API key was supplied and the backend has no configured key for this provider."
                ),
            },
        )
    if payload.model.provider == "no-api" and payload.manual_payload is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "manual_payload_required",
                "message": "Paste the model JSON response before validating no-API mode.",
            },
        )

    model_config = ModelConfig(
        provider=payload.model.provider,
        model=payload.model.model,
        base_url=payload.model.base_url,
        api_key=api_key,
        temperature=payload.model.temperature,
        max_tokens=payload.model.max_tokens,
    )
    attempts = 1 if payload.model.provider == "no-api" else 2
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            generation = await call_llm(
                prompt=prompt_info.prompt,
                response_schema=DemoScoringPayload,
                config=model_config,
                manual_payload=payload.manual_payload,
            )
            expected_ids = [candidate.candidate_id for candidate in payload.candidates]
            returned_ids = [score.candidate_id for score in generation.value.scores]
            if len(returned_ids) != len(set(returned_ids)):
                raise ProviderError("Model returned duplicate candidate_id values")
            if set(returned_ids) != set(expected_ids):
                raise ProviderError("Model response candidate IDs do not match the request")
            ordered = {score.candidate_id: score for score in generation.value.scores}
            return DemoScoreResponse(
                provider=payload.model.provider,
                model=payload.model.model,
                model_calls=attempt + 1,
                input_tokens=generation.usage.input_tokens,
                output_tokens=generation.usage.output_tokens,
                latency_ms=generation.usage.latency_ms,
                retries=attempt,
                estimated_cost=None,
                prompt_sha256=prompt_info.prompt_sha256,
                raw_response=(
                    generation.raw_text
                    or json.dumps(generation.raw_output, ensure_ascii=False)
                ),
                scores=[ordered[candidate_id] for candidate_id in expected_ids],
            )
        except RetriableProviderError as exc:
            last_error = exc
            if attempt < attempts - 1:
                await asyncio.sleep(0.5 * (attempt + 1))
        except (ProviderError, ValueError, KeyError, TypeError) as exc:
            last_error = exc
            break

    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail={
            "code": "model_scoring_failed",
            "message": str(last_error or "Model scoring failed"),
        },
    )
