#!/usr/bin/env python3
"""Number agent panes 1..9 in herdr agent-list order (same as Ctrl+1..9)."""
import json
import subprocess
import sys

SOURCE = "dotfiles.agent-numbers"
herdr = __import__("os").environ.get("HERDR_BIN_PATH", "herdr")


def run(args):
    try:
        return subprocess.run(
            args, capture_output=True, text=True, timeout=5
        )
    except Exception as e:
        sys.stderr.write(str(e) + "\n")
        return None


def main():
    out = run([herdr, "agent", "list"])
    if not out or not out.stdout:
        sys.exit(1)
    try:
        agents = json.loads(out.stdout).get("result", {}).get("agents", [])
    except json.JSONDecodeError:
        sys.exit(1)

    numbered = set()
    for i, agent in enumerate(agents[:9], start=1):
        pane = agent.get("pane_id")
        if not pane:
            continue
        numbered.add(pane)
        run(
            [
                herdr,
                "pane",
                "report-metadata",
                pane,
                "--source",
                SOURCE,
                "--token",
                f"n={i}",
            ]
        )

    listed = run([herdr, "pane", "list"])
    if not listed or not listed.stdout:
        return
    try:
        panes = json.loads(listed.stdout).get("result", {}).get("panes", [])
    except json.JSONDecodeError:
        return
    for pane in panes:
        pid = pane.get("pane_id")
        if pid and pid not in numbered:
            run(
                [
                    herdr,
                    "pane",
                    "report-metadata",
                    pid,
                    "--source",
                    SOURCE,
                    "--clear-token",
                    "n",
                ]
            )


if __name__ == "__main__":
    main()
