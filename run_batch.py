#!/usr/bin/env python3
"""PromoForge CLI Batch Pipeline

Runs ingestion, narrative classification, candidate discovery, hard-constraint validation,
and multi-format production exports (JSON, CSV, TXT, OTIO) across all screenplays in a single command.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import sys
import time
from pathlib import Path

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

sys.path.insert(0, os.path.abspath("backend"))

from app.database import SessionLocal
from app.engines.promos import (
    MAX_DURATION_MS,
    MIN_DURATION_MS,
    discover_promo_candidates,
    temporal_iou,
)
from app.llm.fallback import RuleBasedNarrativeProvider
from app.models import (
    AnalysisJobRecord,
    EpisodeRecord,
    ProjectRecord,
    PromoCandidateRecord,
    ScreenplayEventRecord,
)
from app.services.narrative import analyze_episode
from app.services.promos import generate_episode_promos, read_episode_recommendation


def run_sync(coro):
    try:
        coro.send(None)
    except StopIteration as e:
        return e.value


def format_clock(milliseconds: int) -> str:
    seconds = milliseconds / 1000.0
    minutes = int(seconds // 60)
    rem_seconds = seconds % 60
    return f"{minutes:02d}:{rem_seconds:05.2f}"


def export_episode_files(session, job_id: str, episode_key: str, export_dir: Path) -> dict:
    export_dir.mkdir(parents=True, exist_ok=True)
    rec = read_episode_recommendation(session, job_id=job_id, episode_key=episode_key)
    
    # 1. JSON Cut Sheet
    json_path = export_dir / f"{episode_key}_cut_sheet.json"
    candidates_data = []
    for cand in rec.candidates:
        c = cand.candidate
        assert MIN_DURATION_MS <= c.duration_ms <= MAX_DURATION_MS, (
            f"Candidate {c.candidate_key} duration {c.duration_ms}ms outside [20s, 60s]"
        )
        candidates_data.append({
            "candidate_key": c.candidate_key,
            "rank": c.rank,
            "status": c.status,
            "start_ms": c.start_ms,
            "end_ms": c.end_ms,
            "start_time": format_clock(c.start_ms),
            "end_time": format_clock(c.end_ms),
            "duration_ms": c.duration_ms,
            "duration_seconds": round(c.duration_ms / 1000.0, 2),
            "score": c.score,
            "score_components": c.score_components.model_dump(),
            "hook_event_id": c.hook_event_id,
            "end_event_id": c.end_event_id,
            "rationale": cand.rationale,
            "why_it_works": cand.rationale[0] if cand.rationale else "",
            "cautions": cand.cautions,
            "evidence_count": len(cand.evidence),
        })
        
    doc = {
        "version": "1.0.0",
        "episode_id": episode_key,
        "recommendation_basis": rec.recommendation_basis,
        "top_pick_id": rec.top_pick_id,
        "candidates": candidates_data,
    }
    json_path.write_text(json.dumps(doc, indent=2), encoding="utf-8")

    # 2. OTIO Delivery Track
    otio_path = export_dir / f"{episode_key}_promos.otio"
    otio_doc = {
        "OTIO_SCHEMA": "Timeline.1",
        "name": f"{episode_key}_promo_timeline",
        "tracks": {
            "OTIO_SCHEMA": "Stack.1",
            "children": [
                {
                    "OTIO_SCHEMA": "Track.1",
                    "name": "Promo Cuts",
                    "kind": "Video",
                    "children": [
                        {
                            "OTIO_SCHEMA": "Clip.1",
                            "name": c["candidate_key"],
                            "source_range": {
                                "OTIO_SCHEMA": "TimeRange.1",
                                "start_time": {
                                    "OTIO_SCHEMA": "RationalTime.1",
                                    "value": c["start_ms"],
                                    "rate": 1000,
                                },
                                "duration": {
                                    "OTIO_SCHEMA": "RationalTime.1",
                                    "value": c["duration_ms"],
                                    "rate": 1000,
                                },
                            },
                        }
                        for c in candidates_data
                    ],
                }
            ],
        },
    }
    otio_path.write_text(json.dumps(otio_doc, indent=2), encoding="utf-8")

    return {
        "episode_id": episode_key,
        "json_path": str(json_path),
        "otio_path": str(otio_path),
        "top_pick": candidates_data[0] if candidates_data else None,
    }


def main():
    parser = argparse.ArgumentParser(description="PromoForge Batch Pipeline CLI")
    parser.add_argument(
        "--export-dir",
        default="exports",
        help="Directory to save raw unedited export files (default: exports)",
    )
    parser.add_argument(
        "--episode",
        default=None,
        help="Specific episode to inspect/export (e.g. EP_002)",
    )
    args = parser.parse_args()

    export_path = Path(args.export_dir)
    export_path.mkdir(parents=True, exist_ok=True)

    print("=" * 70)
    print("PROMOFORGE AI EDITORIAL WORKFLOW - BATCH PIPELINE RUNNER")
    print("=" * 70)

    start_time = time.time()
    with SessionLocal() as session:
        project = session.query(ProjectRecord).first()
        if not project:
            print("No project found in database.")
            return

        job = session.query(AnalysisJobRecord).filter_by(project_id=project.id).first()
        job_id = job.id if job else "727c9af0-ddc0-4bd5-ae8f-630e95dc5b68"
        provider = RuleBasedNarrativeProvider()

        query = session.query(EpisodeRecord).filter_by(project_id=project.id).order_by(EpisodeRecord.episode_number)
        if args.episode:
            query = query.filter_by(episode_key=args.episode)
        episodes = query.all()

        print(f"Project: {project.name}")
        print(f"Episodes targeted: {len(episodes)}")
        print(f"Export directory: {export_path.resolve()}\n")

        master_candidates = []
        for index, ep in enumerate(episodes, 1):
            ep_key = ep.episode_key
            try:
                # Check if already generated
                existing = session.query(PromoCandidateRecord).filter_by(job_id=job_id, episode_id=ep.id).count()
                if not existing and job.status != "completed":
                    run_sync(analyze_episode(session, job_id=job_id, episode_key=ep_key, provider=provider))
                    promos = generate_episode_promos(session, job_id=job_id, episode_key=ep_key)
                
                exp_res = export_episode_files(session, job_id, ep_key, export_path)
                if exp_res["top_pick"]:
                    master_candidates.append({
                        "episode": ep_key,
                        **exp_res["top_pick"]
                    })
                print(f"[{index:02d}/{len(episodes):02d}] {ep_key}: Pick #{exp_res['top_pick']['rank']} {exp_res['top_pick']['candidate_key']} ({exp_res['top_pick']['start_time']} -> {exp_res['top_pick']['end_time']}, {exp_res['top_pick']['duration_seconds']}s, Score: {exp_res['top_pick']['score']:.1f})")
            except Exception as err:
                print(f"[{index:02d}/{len(episodes):02d}] {ep_key}: ERROR: {err}")

        # Master CSV and Master TXT
        csv_file = export_path / "promos_master.csv"
        csv_lines = [
            "episode,candidate_key,rank,status,start_time,end_time,duration_seconds,score,hook_event_id,why_it_works\n"
        ]
        txt_file = export_path / "promos_master.txt"
        header_sep = "=" * 60
        txt_lines = [
            f"PROMOFORGE MASTER PRODUCTION CUT SHEET\n"
            f"Project: {project.name}\n"
            f"Episodes: {len(episodes)} | Total Top Picks: {len(master_candidates)}\n"
            f"{header_sep}\n\n"
        ]

        for mc in master_candidates:
            csv_lines.append(
                f'"{mc["episode"]}","{mc["candidate_key"]}",{mc["rank"]},"{mc["status"]}",'
                f'"{mc["start_time"]}","{mc["end_time"]}",{mc["duration_seconds"]},{mc["score"]},'
                f'"{mc["hook_event_id"]}","{mc["why_it_works"].replace(chr(34), chr(39))}"\n'
            )
            item_sep = "-" * 50
            txt_lines.append(
                f"Episode {mc['episode']} | Top Pick #{mc['rank']}: {mc['candidate_key']}\n"
                f"Timecode: {mc['start_time']} -> {mc['end_time']} ({mc['duration_seconds']}s)\n"
                f"Score: {mc['score']:.1f}/100\n"
                f"Why it works: {mc['why_it_works']}\n"
                f"{item_sep}\n\n"
            )

        csv_file.write_text("".join(csv_lines), encoding="utf-8")
        txt_file.write_text("".join(txt_lines), encoding="utf-8")

        elapsed = time.time() - start_time
        print(f"\nDone! Exported raw outputs for {len(episodes)} episodes in {elapsed:.2f}s.")
        print(f"Master files generated:\n - {csv_file}\n - {txt_file}")


if __name__ == "__main__":
    main()
