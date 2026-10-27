#!/usr/bin/env python3
"""Judgment queue (deck's /queue tags a pane q=◆N).
queue.py N    — ctrl+N: focus the agent in slot N.
queue.py sync — mirror slots onto each workspace row as $q (◆1◆3)."""
import json
import os
import subprocess
import sys

SOURCE = "dotfiles.agent-numbers"
herdr = os.environ.get("HERDR_BIN_PATH", "herdr")


def call(*args):
    return subprocess.run([herdr, *args], capture_output=True, text=True, timeout=5).stdout


def result(*args):
    return json.loads(call(*args) or "{}").get("result", {})


def slots(agents):
    """workspace_id -> '◆1◆3' for queued agents, lowest slot first."""
    by_ws = {}
    for a in agents:
        q = (a.get("tokens") or {}).get("q")
        if q:
            by_ws.setdefault(a["workspace_id"], []).append(q)
    return {ws: "".join(sorted(qs)) for ws, qs in by_ws.items()}


def sync():
    marks = slots(result("agent", "list").get("agents", []))
    for ws in result("workspace", "list").get("workspaces", []):
        ws_id = ws["workspace_id"]
        mark = marks.get(ws_id)
        call("workspace", "report-metadata", ws_id, "--source", SOURCE, *(["--token", f"q={mark}"] if mark else ["--clear-token", "q"]))


def focus(slot):
    for a in result("agent", "list").get("agents", []):
        if (a.get("tokens") or {}).get("q") == f"◆{slot}":
            call("agent", "focus", a["pane_id"])
            return


if __name__ == "__main__":
    if sys.argv[1:] == ["test"]:
        agents = [
            {"workspace_id": "w1", "tokens": {"q": "◆3"}},
            {"workspace_id": "w1", "tokens": {"q": "◆1"}},
            {"workspace_id": "w2", "tokens": {}},
            {"workspace_id": "w3", "tokens": {"q": "◆2"}},
        ]
        assert slots(agents) == {"w1": "◆1◆3", "w3": "◆2"}
        print("ok")
    elif sys.argv[1:] == ["sync"]:
        sync()
    else:
        focus(sys.argv[1])
