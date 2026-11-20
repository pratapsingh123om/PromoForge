from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.database import SessionLocal
from app.services.promos import generate_episode_promos


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate deterministic, source-grounded promo candidates."
    )
    parser.add_argument("job_id")
    parser.add_argument("episode_id")
    args = parser.parse_args()

    with SessionLocal() as session:
        result = generate_episode_promos(
            session,
            job_id=args.job_id,
            episode_key=args.episode_id,
        )
    report = {
        "episode_id": result.episode_id,
        "generator_version": result.generator_version,
        "cached": result.cached,
        "proposal_count": result.proposal_count,
        "selected_count": result.selected_count,
        "status_counts": dict(Counter(candidate.status for candidate in result.candidates)),
        "selected": [
            {
                "candidate_key": candidate.candidate_key,
                "rank": candidate.rank,
                "start_ms": candidate.start_ms,
                "end_ms": candidate.end_ms,
                "duration_ms": candidate.duration_ms,
                "score": candidate.score,
                "evidence_count": len(candidate.evidence_event_ids),
            }
            for candidate in result.candidates
            if candidate.status == "selected"
        ],
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
