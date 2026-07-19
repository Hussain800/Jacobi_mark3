"""High-confidence regression scan for credentials in the current tree."""

from __future__ import annotations

import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PATTERNS = {
    "google_api_key": re.compile("AI" + r"za[0-9A-Za-z_-]{35}"),
    "aws_access_key": re.compile("AK" + r"IA[0-9A-Z]{16}"),
    "github_token": re.compile("gh" + r"[pousr]_[0-9A-Za-z]{36,}"),
    "private_key": re.compile("BEGIN " + r"(?:RSA |EC |OPENSSH )?PRIVATE KEY"),
}


def test_tracked_text_files_do_not_contain_high_confidence_secrets() -> None:
    output = subprocess.check_output(
        ["git", "ls-files", "-z"], cwd=ROOT, text=False
    )
    findings: list[str] = []
    own_path = Path(__file__).resolve()
    for raw_path in output.split(b"\0"):
        if not raw_path:
            continue
        path = ROOT / raw_path.decode("utf-8")
        if path.resolve() == own_path or not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for name, pattern in PATTERNS.items():
            if pattern.search(text):
                findings.append(f"{path.relative_to(ROOT)}: {name}")

    assert not findings, "potential tracked credentials:\n" + "\n".join(findings)
