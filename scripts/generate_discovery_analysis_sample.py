"""Write the sample AI Opportunity Analysis the web preview mode shows without a server.

It is the deterministic fixture analysis for a client without any information, so the web
bundle never carries hand-maintained page content. Run after changing the library or layout:

    python scripts/generate_discovery_analysis_sample.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / "apps" / "api")]

from services.framework.discovery_analysis.pipeline import generate_discovery_analysis  # noqa: E402

TARGET = ROOT / "apps" / "web" / "src" / "lib" / "discoveryAnalysisSample.json"
SAMPLE_OPPORTUNITY = {
    "id": "00000000-0000-4000-8000-000000000000",
    "client_name": "",
    "opportunity_name": "",
    "stage1_intake": None,
}


def build_sample() -> dict:
    paper = generate_discovery_analysis(
        SAMPLE_OPPORTUNITY,
        persist=lambda _paper: None,
        document_id="00000000-0000-4000-8000-000000000001",
        generated_at="2026-10-01T00:00:00Z",
    )
    # The preview is read-only: it needs the pages and the research statement, not the content model.
    paper["analysis"] = {"research": paper["analysis"]["research"]}
    paper["presentation_brief"] = None
    return paper


def main() -> None:
    TARGET.write_text(json.dumps(build_sample(), ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(f"wrote {TARGET.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
