from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Coroutine
from pathlib import Path
from typing import Any, TypeVar


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.database import SessionLocal
from app.llm.fallback import RuleBasedNarrativeProvider
from app.services.narrative import analyze_episode


ResultT = TypeVar("ResultT")


def resolve_local(coroutine: Coroutine[Any, Any, ResultT]) -> ResultT:
    """Run the non-network fallback, which intentionally performs no async I/O."""
    try:
        coroutine.send(None)
    except StopIteration as completed:
        return completed.value
    raise RuntimeError("local fallback unexpectedly suspended")


def main() -> None:
    parser = argparse.ArgumentParser(description="Analyze one persisted episode locally.")
    parser.add_argument("--job-id", required=True)
    parser.add_argument("--episode", required=True)
    args = parser.parse_args()

    with SessionLocal() as session:
        result = resolve_local(
            analyze_episode(
                session,
                job_id=args.job_id,
                episode_key=args.episode,
                provider=RuleBasedNarrativeProvider(),
            )
        )
        print(json.dumps(result.model_dump(mode="json"), indent=2))


if __name__ == "__main__":
    main()

