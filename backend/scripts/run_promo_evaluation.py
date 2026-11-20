from __future__ import annotations

import argparse
import sys
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.schemas.evaluation import PromoEvaluationRequest
from app.services.evaluation import evaluate_promos


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Evaluate blinded promo candidates and editor reviews."
    )
    parser.add_argument(
        "dataset",
        nargs="?",
        type=Path,
        default=BACKEND_ROOT / "eval" / "fixtures" / "synthetic_promo_evaluation.json",
        help="Evaluation dataset JSON (defaults to the synthetic fixture).",
    )
    args = parser.parse_args()
    payload = PromoEvaluationRequest.model_validate_json(
        args.dataset.read_text(encoding="utf-8")
    )
    report = evaluate_promos(payload)
    print(report.model_dump_json(indent=2))


if __name__ == "__main__":
    main()
