"""Seed the in-memory API with post-meeting fixture data for FIGMA-05 validation."""

from __future__ import annotations

import io
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "packages" / "contracts" / "fixtures" / "demo_data" / "ms30_demo_pack.json"
API_BASE = os.getenv("FIGMA05_API_BASE", os.getenv("FIGMA04_API_BASE", "http://127.0.0.1:8000")).rstrip("/")


def _request(
    token: str,
    method: str,
    path: str,
    payload: dict | None = None,
    multipart: tuple[str, bytes, str] | None = None,
) -> dict:
    url = f"{API_BASE}{path}"
    headers = {"Authorization": f"Bearer {token}"}
    data: bytes | None = None
    if multipart is not None:
        file_name, content, mime_type = multipart
        boundary = "figma05seed"
        body = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="file"; filename="{file_name}"\r\n'
            f"Content-Type: {mime_type}\r\n\r\n"
        ).encode("utf-8") + content + f"\r\n--{boundary}--\r\n".encode("utf-8")
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
        data = body
    elif payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=30) as response:
        raw = response.read().decode("utf-8")
        return json.loads(raw) if raw else {}


def _wait_for_api(timeout_seconds: int = 60) -> None:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"{API_BASE}/health", timeout=3) as response:
                if response.status == 200:
                    return
        except (urllib.error.URLError, TimeoutError):
            time.sleep(1)
    raise RuntimeError(f"API did not become healthy at {API_BASE}/health")


def main() -> int:
    token = os.getenv("FIGMA05_ACCESS_TOKEN", os.getenv("FIGMA04_ACCESS_TOKEN", "")).strip()
    if not token:
        print(
            "FIGMA05_ACCESS_TOKEN is required (use the local dev bearer token; never commit it).",
            file=sys.stderr,
        )
        return 2

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    _wait_for_api()

    rich = manifest["client"]
    rich_pack = manifest["rich_client_pack"]
    contact = rich_pack["contacts"][0]

    opportunity = _request(
        token,
        "POST",
        "/opportunities",
        {
            "client_name": rich["name"],
            "opportunity_name": rich["opportunity"],
            "department": rich["department"],
            "language": rich["language"],
            "additional_client_information": rich_pack,
            "stage1_intake": {
                "client_web_page": "https://northstar-demo.example.invalid",
                "poc_name": contact["name"],
                "poc_position": contact["role"],
                "sales_topic_description": "DEMO DATA - service desk transformation discovery",
                "about_company": rich_pack["notes"],
            },
        },
    )

    _request(
        token,
        "POST",
        f"/opportunities/{opportunity['id']}/transcripts",
        multipart=("Acme-first-meeting.txt", b"DEMO DATA - post-meeting transcript excerpt.", "text/plain"),
    )

    extras: dict[str, bool] = {"meeting_feedback": False, "client_document": False}

    try:
        _request(
            token,
            "PUT",
            f"/opportunities/{opportunity['id']}/meeting-feedback",
            {
                "text": "Client confirmed interest in a 12-week DE/EN pilot. Quality consistency and onboarding speed are the main concerns.",
            },
        )
        extras["meeting_feedback"] = True
    except urllib.error.HTTPError:
        pass

    try:
        _request(
            token,
            "POST",
            f"/opportunities/{opportunity['id']}/client-documents",
            multipart=(
                "Current service volumes.xlsx",
                b"DEMO DATA - spreadsheet placeholder",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ),
        )
        extras["client_document"] = True
    except urllib.error.HTTPError:
        pass

    print(
        json.dumps(
            {
                "opportunity_id": opportunity["id"],
                "client_name": rich["name"],
                "upload_path": f"/upload?opportunityId={opportunity['id']}",
                "extras": extras,
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
