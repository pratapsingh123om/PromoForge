from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.engines.archive import parse_company_archive_path


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Validate a confidential PromoForge screenplay archive without extracting it."
    )
    parser.add_argument("archive", type=Path)
    args = parser.parse_args()

    result = parse_company_archive_path(str(args.archive.resolve()))
    event_types = Counter(
        event.type.value for episode in result.episodes for event in episode.events
    )
    report = {
        "project_name": result.project_name,
        "source_name": result.source_name,
        "source_sha256": result.source_sha256,
        "file_count": result.file_count,
        "episode_count": len(result.episodes),
        "scene_count": sum(len(episode.scenes) for episode in result.episodes),
        "event_count": sum(len(episode.events) for episode in result.episodes),
        "event_types": dict(sorted(event_types.items())),
        "duration_ms": sum(episode.duration_ms for episode in result.episodes),
        "warning_count": len(result.warnings),
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()

