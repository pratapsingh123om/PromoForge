from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from sqlalchemy import func, select


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.database import SessionLocal
from app.engines.archive import parse_company_archive_path
from app.models import EpisodeCheckpointRecord, EpisodeRecord, ScreenplayEventRecord
from app.repositories import import_archive
from app.services.jobs import create_analysis_job


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Import a validated confidential screenplay archive into local SQLite."
    )
    parser.add_argument("archive", type=Path)
    parser.add_argument(
        "--create-job",
        action="store_true",
        help="Create the initial resumable analysis job and per-episode checkpoints.",
    )
    parser.add_argument("--idempotency-key", default="company-pack-analysis-v1")
    args = parser.parse_args()

    archive = parse_company_archive_path(str(args.archive.resolve()))
    with SessionLocal() as session:
        project, created = import_archive(session, archive)
        job = None
        job_created = None
        if args.create_job:
            job, job_created = create_analysis_job(
                session,
                project_id=project.id,
                idempotency_key=args.idempotency_key,
            )

        report = {
            "project_id": project.id,
            "project_name": project.name,
            "project_created": created,
            "episodes": session.scalar(
                select(func.count(EpisodeRecord.id)).where(
                    EpisodeRecord.project_id == project.id
                )
            ),
            "events": session.scalar(
                select(func.count(ScreenplayEventRecord.id))
                .join(EpisodeRecord, EpisodeRecord.id == ScreenplayEventRecord.episode_id)
                .where(EpisodeRecord.project_id == project.id)
            ),
            "warnings": len(project.ingestion_warnings or []),
            "job_id": job.id if job else None,
            "job_created": job_created,
            "job_status": job.status if job else None,
            "checkpoints": (
                session.scalar(
                    select(func.count(EpisodeCheckpointRecord.id)).where(
                        EpisodeCheckpointRecord.job_id == job.id
                    )
                )
                if job
                else 0
            ),
        }
        print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()

