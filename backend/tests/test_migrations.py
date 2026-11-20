from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect


def test_initial_migration_up_and_down(tmp_path: Path, monkeypatch: object) -> None:
    database_path = tmp_path / "migration.db"
    database_url = f"sqlite:///{database_path.as_posix()}"
    monkeypatch.setenv("DATABASE_URL", database_url)

    config_path = Path(__file__).resolve().parents[1] / "alembic.ini"
    config = Config(str(config_path))
    command.upgrade(config, "head")

    engine = create_engine(database_url)
    tables = set(inspect(engine).get_table_names())
    assert {
        "projects",
        "episodes",
        "screenplay_scenes",
        "screenplay_events",
        "analysis_jobs",
        "episode_checkpoints",
        "promo_candidates",
        "evaluation_sessions",
        "review_assignments",
        "editor_reviews",
        "alembic_version",
    } <= tables

    command.downgrade(config, "base")
    remaining = set(inspect(engine).get_table_names())
    engine.dispose()
    assert remaining <= {"alembic_version"}

