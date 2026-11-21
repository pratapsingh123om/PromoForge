from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from app.llm.base import (
    LLMProvider,
    ProviderError,
    RetriableProviderError,
    SchemaT,
    StructuredGeneration,
)
from app.llm.fallback import RuleBasedNarrativeProvider
from app.llm.gemini import GeminiProvider
from app.schemas.narrative import ProviderUsage


@dataclass
class ModelConfig:
    provider: str = "fallback"  # fallback | gemini | openai | no-api
    model: str = "rule-based"
    base_url: str = "https://api.openai.com/v1"
    api_key: str = ""
    temperature: float = 0.1
    max_tokens: int = 4096


class OpenAICompatibleProvider(LLMProvider):
    name = "openai"
    fallback_used = False

    def __init__(
        self,
        *,
        model: str = "gpt-4o-mini",
        base_url: str = "https://api.openai.com/v1",
        api_key: str = "",
        temperature: float = 0.1,
        max_tokens: int = 4096,
        timeout_seconds: int = 60,
    ) -> None:
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.timeout = timeout_seconds

    async def generate_structured(
        self,
        *,
        prompt: str,
        response_schema: type[SchemaT],
        context: dict[str, Any] | None = None,
    ) -> StructuredGeneration[SchemaT]:
        url = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are an expert story analyst. Respond ONLY with a valid JSON object matching "
                        f"the schema: {json.dumps(response_schema.model_json_schema())}"
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            "response_format": {"type": "json_object"},
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                response = await client.post(url, headers=headers, json=payload)
            except httpx.TimeoutException as exc:
                raise RetriableProviderError("OpenAI endpoint timed out") from exc
            except httpx.NetworkError as exc:
                raise RetriableProviderError("Network connection to OpenAI endpoint failed") from exc

        if response.status_code == 429 or response.status_code >= 500:
            raise RetriableProviderError(f"OpenAI endpoint returned {response.status_code}")
        if response.status_code in {401, 403}:
            raise ProviderError("OpenAI-compatible API key was rejected. Check the key and permissions.")
        if response.status_code == 404:
            raise ProviderError(f"OpenAI-compatible model '{self.model}' or base URL was not found.")
        if response.status_code != 200:
            raise ProviderError(f"OpenAI endpoint error ({response.status_code}): {response.text[:200]}")

        try:
            body = response.json()
            raw_content = body["choices"][0]["message"]["content"]
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise RetriableProviderError("OpenAI-compatible endpoint returned malformed JSON") from exc
        try:
            val = response_schema.model_validate_json(raw_content)
        except ValidationError as exc:
            raise RetriableProviderError(f"Model response failed schema validation: {exc}") from exc

        usage_data = body.get("usage", {})
        usage = ProviderUsage(
            input_tokens=usage_data.get("prompt_tokens"),
            output_tokens=usage_data.get("completion_tokens"),
            latency_ms=0,
        )
        return StructuredGeneration(
            value=val,
            usage=usage,
            raw_output=val.model_dump(mode="json"),
            raw_text=raw_content,
        )


class NoApiManualProvider(LLMProvider):
    name = "no-api"
    fallback_used = False

    def __init__(self, manual_json: str | dict | None = None) -> None:
        self.model = "manual-paste"
        self.manual_json = manual_json

    async def generate_structured(
        self,
        *,
        prompt: str,
        response_schema: type[SchemaT],
        context: dict[str, Any] | None = None,
    ) -> StructuredGeneration[SchemaT]:
        if not self.manual_json:
            raise ProviderError("No manual JSON payload supplied in no-API mode.")

        try:
            if isinstance(self.manual_json, str):
                val = response_schema.model_validate_json(self.manual_json)
            else:
                val = response_schema.model_validate(self.manual_json)
        except ValidationError as exc:
            raise ProviderError(f"Pasted JSON does not match required schema: {exc}") from exc

        return StructuredGeneration(
            value=val,
            usage=ProviderUsage(input_tokens=0, output_tokens=0, latency_ms=0),
            raw_output=val.model_dump(mode="json"),
            raw_text=(
                self.manual_json
                if isinstance(self.manual_json, str)
                else json.dumps(self.manual_json, ensure_ascii=False)
            ),
        )


async def call_llm(
    prompt: str,
    response_schema: type[SchemaT],
    config: ModelConfig | None = None,
    context: dict[str, Any] | None = None,
    manual_payload: str | dict | None = None,
) -> StructuredGeneration[SchemaT]:
    """Single swappable LLM gateway function per DEMO.md Section 6.
    Nothing else talks directly to a provider.
    """
    cfg = config or ModelConfig()
    provider_type = cfg.provider.lower()

    if provider_type in {"gemini", "google"}:
        provider = GeminiProvider(
            api_key=cfg.api_key,
            model=cfg.model,
            temperature=cfg.temperature,
            max_tokens=cfg.max_tokens,
        )
    elif provider_type in {"openai", "openai-compatible", "groq", "together"}:
        provider = OpenAICompatibleProvider(
            model=cfg.model,
            base_url=cfg.base_url,
            api_key=cfg.api_key,
            temperature=cfg.temperature,
            max_tokens=cfg.max_tokens,
        )
    elif provider_type in {"no-api", "paste", "manual"}:
        provider = NoApiManualProvider(manual_json=manual_payload)
    else:
        # Default rule-based fallback
        provider = RuleBasedNarrativeProvider()

    return await provider.generate_structured(
        prompt=prompt,
        response_schema=response_schema,
        context=context,
    )
