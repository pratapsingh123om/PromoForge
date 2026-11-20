from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from sqlalchemy import select


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.database import SessionLocal
from app.models import (
    EpisodeRecord,
    ModelRunRecord,
    NarrativeEventRecord,
    ScreenplayEventRecord,
)
from app.services.jobs import get_job


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify persisted narrative source grounding.")
    parser.add_argument("--job-id", required=True)
    parser.add_argument("--episode", required=True)
    args = parser.parse_args()

    with SessionLocal() as session:
        job = get_job(session, args.job_id)
        episode = session.scalar(
            select(EpisodeRecord).where(
                EpisodeRecord.project_id == job.project_id,
                EpisodeRecord.episode_key == args.episode,
            )
        )
        if episode is None:
            raise SystemExit(f"Episode not found: {args.episode}")

        source_ids = set(
            session.scalars(
                select(ScreenplayEventRecord.event_key).where(
                    ScreenplayEventRecord.episode_id == episode.id
                )
            )
        )
        model_run = session.scalar(
            select(ModelRunRecord)
            .where(
                ModelRunRecord.job_id == job.id,
                ModelRunRecord.episode_id == episode.id,
                ModelRunRecord.status == "completed",
            )
            .order_by(ModelRunRecord.completed_at.desc())
        )
        if model_run is None:
            raise SystemExit("No completed model run found")

        narrative_rows = session.scalars(
            select(NarrativeEventRecord).where(
                NarrativeEventRecord.model_run_id == model_run.id
            )
        ).all()
        unknown_primary = sorted(
            row.source_event_key
            for row in narrative_rows
            if row.source_event_key not in source_ids
        )
        unknown_evidence = sorted(
            {
                evidence_id
                for row in narrative_rows
                for evidence_id in row.evidence_event_ids
                if evidence_id not in source_ids
            }
        )
        report = {
            "job_id": job.id,
            "job_status": job.status,
            "job_progress_percent": job.progress_percent,
            "episode": episode.episode_key,
            "provider": model_run.provider,
            "fallback_used": model_run.fallback_used,
            "source_event_count": len(source_ids),
            "narrative_event_count": len(narrative_rows),
            "unknown_primary_references": unknown_primary,
            "unknown_evidence_references": unknown_evidence,
            "grounded": not unknown_primary and not unknown_evidence,
        }
        print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()

