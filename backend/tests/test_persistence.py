from __future__ import annotations

import io
import zipfile
from collections.abc import Iterator
from pathlib import Path

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from app.database import Base, create_database_engine
from app.engines.archive import parse_company_archive_bytes
from app.engines.company_script import parse_company_script
from app.models import (
    AnalysisJobRecord,
    EpisodeCheckpointRecord,
    EpisodeRecord,
    ProjectRecord,
    SceneRecord,
    ScreenplayEventRecord,
)
from app.repositories import (
    EpisodeConflictError,
    get_or_create_project_by_name,
    import_archive,
    import_episode,
    list_projects,
)
from app.services.jobs import (
    JobStateError,
    complete_checkpoint,
    create_analysis_job,
    fail_checkpoint,
    get_job,
    request_cancellation,
    retry_job,
    start_checkpoint,
    transition_job,
)
from test_company_archive import SYNTHETIC_SCRIPT, _archive_bytes


@pytest.fixture
def session_factory(tmp_path: Path) -> Iterator[sessionmaker[Session]]:
    database_path = tmp_path / "test.db"
    engine = create_database_engine(f"sqlite:///{database_path.as_posix()}")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    try:
        yield factory
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()


def _two_episode_archive() -> bytes:
    episode_two = SYNTHETIC_SCRIPT.replace(
        "EPISODE NUMBER: Episode 1",
        "EPISODE NUMBER: Episode 2",
        1,
    )
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_STORED) as archive:
        archive.writestr(
            "Synthetic Show/episode-001-Episode 123.txt",
            SYNTHETIC_SCRIPT,
        )
        archive.writestr(
            "Synthetic Show/episode-002-Episode 124.txt",
            episode_two,
        )
    return output.getvalue()


def _import_synthetic_project(
    session: Session,
    *,
    two_episodes: bool = False,
) -> ProjectRecord:
    archive = parse_company_archive_bytes(
        _two_episode_archive() if two_episodes else _archive_bytes(),
        source_name="synthetic.zip",
    )
    project, _ = import_archive(session, archive)
    return project


def test_archive_import_persists_source_graph_once(
    session_factory: sessionmaker[Session],
) -> None:
    with session_factory() as session:
        archive = parse_company_archive_bytes(
            _archive_bytes(),
            source_name="synthetic.zip",
        )
        project, created = import_archive(session, archive)
        duplicate, duplicate_created = import_archive(session, archive)

        assert created is True
        assert duplicate_created is False
        assert duplicate.id == project.id
        assert session.scalar(select(func.count(ProjectRecord.id))) == 1
        assert session.scalar(select(func.count(EpisodeRecord.id))) == 1
        assert session.scalar(select(func.count(SceneRecord.id))) == 2
        assert session.scalar(select(func.count(ScreenplayEventRecord.id))) == 4
        assert session.scalar(select(EpisodeRecord.source_sha256)) is not None
        assert list_projects(session)[0][1] == 1


def test_named_episode_upload_appends_to_the_matching_series(
    session_factory: sessionmaker[Session],
) -> None:
    with session_factory() as session:
        project = _import_synthetic_project(session)
        episode_two_source = SYNTHETIC_SCRIPT.replace(
            "EPISODE NUMBER: Episode 1",
            "EPISODE NUMBER: Episode 2",
            1,
        )
        ingestion = parse_company_script(
            source_text=episode_two_source,
            source_name="episode-002-Episode 124.txt",
        )

        matched, project_created = get_or_create_project_by_name(
            session,
            project.name.lower(),
        )
        episode, episode_created = import_episode(
            session,
            project_id=matched.id,
            ingestion=ingestion,
        )
        duplicate, duplicate_created = import_episode(
            session,
            project_id=matched.id,
            ingestion=ingestion,
        )

        assert project_created is False
        assert matched.id == project.id
        assert episode_created is True
        assert duplicate_created is False
        assert duplicate.id == episode.id
        assert session.scalar(
            select(func.count(EpisodeRecord.id)).where(EpisodeRecord.project_id == project.id)
        ) == 2

        conflicting = parse_company_script(
            source_text=episode_two_source.replace(
                "A secret threatens an alliance.",
                "Different content claims the same episode number.",
            ),
            source_name="episode-002-revised.txt",
        )
        with pytest.raises(EpisodeConflictError, match="already exists"):
            import_episode(
                session,
                project_id=matched.id,
                ingestion=conflicting,
            )


def test_new_series_name_creates_project_for_first_episode(
    session_factory: sessionmaker[Session],
) -> None:
    with session_factory() as session:
        project, created = get_or_create_project_by_name(session, "  New   Series  ")
        ingestion = parse_company_script(
            source_text=SYNTHETIC_SCRIPT,
            source_name="episode-001.txt",
        )
        episode, episode_created = import_episode(
            session,
            project_id=project.id,
            ingestion=ingestion,
        )

        assert created is True
        assert project.name == "New Series"
        assert episode_created is True
        assert episode.project_id == project.id


def test_job_idempotency_and_legal_transitions(
    session_factory: sessionmaker[Session],
) -> None:
    with session_factory() as session:
        project = _import_synthetic_project(session)
        job, created = create_analysis_job(
            session,
            project_id=project.id,
            idempotency_key="same-request",
        )
        duplicate, duplicate_created = create_analysis_job(
            session,
            project_id=project.id,
            idempotency_key="same-request",
        )

        assert created is True
        assert duplicate_created is False
        assert duplicate.id == job.id
        assert session.scalar(select(func.count(AnalysisJobRecord.id))) == 1
        assert session.scalar(select(func.count(EpisodeCheckpointRecord.id))) == 1

        transition_job(session, job, "running", stage="narrative_extraction")
        start_checkpoint(
            session,
            job_id=job.id,
            episode_key="EP_001",
            stage="narrative_extraction",
        )
        completed = complete_checkpoint(
            session,
            job_id=job.id,
            episode_key="EP_001",
        )
        assert completed.status == "completed"
        assert completed.progress_percent == 100
        with pytest.raises(JobStateError, match="illegal job transition"):
            transition_job(session, completed, "running")


def test_failed_job_resumes_without_reprocessing_completed_episode(
    session_factory: sessionmaker[Session],
) -> None:
    with session_factory() as session:
        project = _import_synthetic_project(session, two_episodes=True)
        job, _ = create_analysis_job(
            session,
            project_id=project.id,
            idempotency_key="resume-test",
        )
        transition_job(session, job, "running", stage="narrative_extraction")

        start_checkpoint(
            session,
            job_id=job.id,
            episode_key="EP_001",
            stage="narrative_extraction",
        )
        complete_checkpoint(session, job_id=job.id, episode_key="EP_001")
        start_checkpoint(
            session,
            job_id=job.id,
            episode_key="EP_002",
            stage="narrative_extraction",
        )
        failed = fail_checkpoint(
            session,
            job_id=job.id,
            episode_key="EP_002",
            error_message="synthetic provider failure",
        )
        job_id = failed.id
        assert failed.status == "failed"
        assert failed.episodes_completed == 1
        assert failed.episodes_failed == 1

    with session_factory() as restarted_session:
        persisted = get_job(restarted_session, job_id)
        retried = retry_job(restarted_session, persisted)
        checkpoints = restarted_session.scalars(
            select(EpisodeCheckpointRecord)
            .where(EpisodeCheckpointRecord.job_id == job_id)
            .order_by(EpisodeCheckpointRecord.episode_id)
        ).all()
        status_by_episode = {
            checkpoint.episode.episode_key: checkpoint.status
            for checkpoint in checkpoints
        }

        assert retried.status == "queued"
        assert retried.episodes_completed == 1
        assert retried.episodes_failed == 0
        assert status_by_episode == {"EP_001": "completed", "EP_002": "pending"}
        assert len(checkpoints) == 2


def test_queued_job_can_be_cancelled_and_retried(
    session_factory: sessionmaker[Session],
) -> None:
    with session_factory() as session:
        project = _import_synthetic_project(session)
        job, _ = create_analysis_job(
            session,
            project_id=project.id,
            idempotency_key="cancel-test",
        )

        cancelled = request_cancellation(session, job)
        assert cancelled.status == "cancelled"
        assert cancelled.cancel_requested is True

        retried = retry_job(session, cancelled)
        assert retried.status == "queued"
        assert retried.cancel_requested is False


def test_series_name_slug_collision_matches_existing(
    session_factory: sessionmaker[Session],
) -> None:
    with session_factory() as session:
        proj1, created1 = get_or_create_project_by_name(session, "The CEO's Secret Vow")
        assert created1 is True

        proj2, created2 = get_or_create_project_by_name(session, "the-ceos-secret-vow!")
        assert created2 is False
        assert proj1.id == proj2.id


def test_analysis_orchestration_runs_to_completion(
    session_factory: sessionmaker[Session],
) -> None:
    from app.services.orchestration import process_analysis_job
    from test_narrative import resolve_immediate

    with session_factory() as session:
        project = _import_synthetic_project(session)
        job, _ = create_analysis_job(
            session,
            project_id=project.id,
            idempotency_key="orch-test-1",
        )
        assert job.status == "queued"
        job_id = job.id

        resolve_immediate(process_analysis_job(job_id, session=session))

        final_job = session.get(AnalysisJobRecord, job_id)
        assert final_job is not None
        assert final_job.status == "completed"
        assert final_job.episodes_completed == final_job.episodes_total
        assert final_job.progress_percent == 100

