from __future__ import annotations

from time import perf_counter
from typing import Any

import httpx
from google import genai
from google.genai import errors, types
from pydantic import ValidationError

from app.llm.base import (
    LLMProvider,
    ProviderError,
    RetriableProviderError,
    SchemaT,
    StructuredGeneration,
)
from app.schemas.narrative import ProviderUsage


class GeminiProvider(LLMProvider):
    name = "gemini"
    fallback_used = False

    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        base_url: str = "",
        temperature: float = 0.1,
        max_tokens: int = 4096,
        timeout_seconds: int = 60,
        client: Any | None = None,
    ) -> None:
        if not api_key and client is None:
            raise ValueError("GEMINI_API_KEY is required")
        if not model:
            raise ValueError("LLM_MODEL is required")
        self.model = model
        self.base_url = base_url
        self.temperature = temperature
        self.max_tokens = max_tokens
        http_opts = types.HttpOptions(
            timeout=timeout_seconds * 1000,
            base_url=base_url if base_url else None,
        )
        self._client = client or genai.Client(
            api_key=api_key,
            http_options=http_opts,
        )

    async def generate_structured(
        self,
        *,
        prompt: str,
        response_schema: type[SchemaT],
        context: dict[str, Any] | None = None,
    ) -> StructuredGeneration[SchemaT]:
        del context
        started = perf_counter()
        try:
            response = await self._client.aio.models.generate_content(
                model=self.model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=self.temperature,
                    max_output_tokens=self.max_tokens,
                    response_mime_type="application/json",
                    response_json_schema=response_schema.model_json_schema(),
                ),
            )
        except errors.APIError as exc:
            code = int(getattr(exc, "code", 0) or 0)
            message = str(exc).lower()
            if code == 429 or code >= 500:
                raise RetriableProviderError(f"Gemini API temporary error ({code})") from exc
            if code in {401, 403} or (code == 400 and "api key" in message):
                raise ProviderError("Gemini API key was rejected. Check the key and its permissions.") from exc
            if code == 404:
                raise ProviderError(f"Gemini model '{self.model}' was not found or is unavailable.") from exc
            if code == 400:
                raise ProviderError(f"Gemini rejected the request for model '{self.model}'. Check the model name and request settings.") from exc
            raise ProviderError(f"Gemini API request failed ({code})") from exc
        except (httpx.TimeoutException, httpx.NetworkError) as exc:
            raise RetriableProviderError("Gemini API network or timeout error") from exc

        response_text = response.text
        if not response_text:
            raise RetriableProviderError("Gemini returned no structured response text")
        try:
            value = response_schema.model_validate_json(response_text)
        except ValidationError as exc:
            raise RetriableProviderError("Gemini response failed schema validation") from exc

        metadata = getattr(response, "usage_metadata", None)
        usage = ProviderUsage(
            input_tokens=getattr(metadata, "prompt_token_count", None),
            output_tokens=getattr(metadata, "candidates_token_count", None),
            latency_ms=max(0, round((perf_counter() - started) * 1000)),
        )
        return StructuredGeneration(
            value=value,
            usage=usage,
            raw_output=value.model_dump(mode="json"),
            raw_text=response_text,
        )

    async def aclose(self) -> None:
        await self._client.aio.aclose()

