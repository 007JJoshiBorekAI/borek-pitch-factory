#!/usr/bin/env python3
"""Print a Supabase access token for NEXT_PUBLIC_DEV_ACCESS_TOKEN (local dev only)."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]


def load_dotenv(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def main() -> int:
    load_dotenv(ROOT / ".env")
    supabase_url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    anon_key = os.environ.get("SUPABASE_ANON_KEY", "").strip()
    email = os.environ.get("E2E_TEST_EMAIL", "").strip()
    password = os.environ.get("E2E_TEST_PASSWORD", "").strip()
    if not supabase_url or not anon_key:
        print("Set SUPABASE_URL and SUPABASE_ANON_KEY in .env", file=sys.stderr)
        return 1
    if not email or not password:
        print("Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD in .env", file=sys.stderr)
        return 1
    headers = {
        "apikey": anon_key,
        "Authorization": f"Bearer {anon_key}",
        "Content-Type": "application/json",
    }
    body = json.dumps({"email": email, "password": password}).encode("utf-8")
    request = Request(
        f"{supabase_url}/auth/v1/token?grant_type=password",
        data=body,
        headers=headers,
        method="POST",
    )
    try:
        with urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:500]
        print(f"Supabase sign-in failed ({exc.code}): {detail}", file=sys.stderr)
        return 1
    token = payload.get("access_token")
    if not token:
        print("Supabase response missing access_token", file=sys.stderr)
        return 1
    print(token)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
