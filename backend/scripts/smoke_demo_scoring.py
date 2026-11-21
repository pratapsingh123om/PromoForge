from __future__ import annotations

import argparse
import json

import httpx


API = "http://127.0.0.1:8000/api"


def payload() -> dict:
    candidates = [
        {
            "candidate_id": "SAMPLE_EP_001_P_001",
            "episode": "EP_001",
            "start_clock": "00:12.20",
            "end_clock": "00:52.00",
            "duration_seconds": 39.8,
            "hook_line": "I am calling an immediate halt to this merger, Victoria.",
            "cliffhanger_line": "Where is Arthur? What have you done to him?",
            "transcript_lines": [
                {
                    "speaker": "Julian Vance",
                    "text": "I am calling an immediate halt to this merger, Victoria.",
                    "start_clock": "00:12.20",
                    "end_clock": "00:16.80",
                },
                {
                    "speaker": "Victoria Sterling",
                    "text": "Where is Arthur? What have you done to him?",
                    "start_clock": "00:47.20",
                    "end_clock": "00:52.00",
                },
            ],
        }
    ]
    return {
        "show_title": "Thorne Banquet Sample",
        "language": "en",
        "target_audience": "vertical microdrama viewers",
        "candidates": candidates,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--gemini", action="store_true")
    args = parser.parse_args()
    base = payload()
    with httpx.Client(timeout=90) as client:
        prompt = client.post(f"{API}/demo/scoring/prompt", json=base)
        prompt.raise_for_status()
        prompt_body = prompt.json()
        assert prompt_body["prompt_sha256"]

        manual = {
            **base,
            "model": {
                "provider": "no-api",
                "model": "manual-paste",
                "base_url": "",
                "temperature": 0.1,
            },
            "manual_payload": json.dumps(
                {
                    "scores": [
                        {
                            "candidate_id": "SAMPLE_EP_001_P_001",
                            "hook": 82,
                            "cliffhanger": 90,
                            "standalone": 78,
                            "why_it_works": "The takeover lands immediately and ends on an unanswered disappearance.",
                        }
                    ]
                }
            ),
        }
        response = client.post(f"{API}/demo/scoring/run", json=manual)
        response.raise_for_status()
        assert response.json()["scores"][0]["hook"] == 82
        print("no-api: ok")

        if args.gemini:
            gemini = {
                **base,
                "model": {
                    "provider": "gemini",
                    "model": "gemini-3.1-flash-lite",
                    "base_url": "",
                    "temperature": 0.1,
                },
            }
            response = client.post(f"{API}/demo/scoring/run", json=gemini)
            response.raise_for_status()
            body = response.json()
            assert body["provider"] == "gemini"
            assert len(body["scores"]) == 1
            assert body["raw_response"]
            print(
                "gemini: ok",
                f"calls={body['model_calls']}",
                f"tokens={(body['input_tokens'] or 0) + (body['output_tokens'] or 0)}",
            )


if __name__ == "__main__":
    main()
