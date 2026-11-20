from __future__ import annotations

import json
import sys
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from google import genai

from app.config import get_settings


def main() -> None:
    settings = get_settings()
    client = genai.Client(api_key=settings.gemini_api_key)
    try:
        names = []
        for model in client.models.list():
            name = str(getattr(model, "name", ""))
            lowered = name.lower()
            if (
                "gemini" in lowered
                and ("flash" in lowered or "pro" in lowered)
                and not any(
                    excluded in lowered
                    for excluded in ("image", "live", "tts", "audio", "robotics")
                )
            ):
                names.append(name.removeprefix("models/"))
        print(json.dumps(sorted(set(names)), indent=2))
    finally:
        client.close()


if __name__ == "__main__":
    main()

