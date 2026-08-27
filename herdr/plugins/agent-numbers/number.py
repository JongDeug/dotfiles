#!/usr/bin/env python3
"""Number workspaces, tabs, and agents. Strips stacked 1: 1: prefixes first."""
import json
import re
import subprocess
import sys

SOURCE = "dotfiles.agent-numbers"
PREFIX = re.compile(r"^(\[\d+\]\s*·\s*|\d+\s*[-:.)]\s*)+")
herdr = __import__("os").environ.get("HERDR_BIN_PATH", "herdr")


def run(args):
    try:
        return subprocess.run(args, capture_output=True, text=True, timeout=5)
    except Exception as e:
        sys.stderr.write(str(e) + "\n")
        return None


def load(cmd):
    out = run(cmd)
    if not out or not out.stdout:
        return None
    try:
        return json.loads(out.stdout)
    except json.JSONDecodeError:
        return None


def bare(name, default):
    name = name or ""
    name = PREFIX.sub("", name).strip()
    return name or default


def main():
    ws_data = load([herdr, "workspace", "list"])
    workspaces = (ws_data or {}).get("result", {}).get("workspaces", [])
    for i, ws in enumerate(workspaces, start=1):
        ws_id = ws.get("workspace_id") or ws.get("id")
        label = ws.get("label") or ws.get("name") or ""
        new = f"{i}: {bare(label, 'space')}"
        if ws_id and label != new:
            run([herdr, "workspace", "rename", ws_id, new])

    for ws in workspaces:
        ws_id = ws.get("workspace_id") or ws.get("id")
        if not ws_id:
            continue
        tab_data = load([herdr, "tab", "list", "--workspace", ws_id])
        tabs = (tab_data or {}).get("result", {}).get("tabs", [])
        for i, tab in enumerate(tabs, start=1):
            tab_id = tab.get("tab_id") or tab.get("id")
            label = tab.get("label") or tab.get("name") or ""
            new = f"{i}: {bare(label, 'tab')}"
            if tab_id and label != new:
                run([herdr, "tab", "rename", tab_id, new])

    agents = (load([herdr, "agent", "list"]) or {}).get("result", {}).get("agents", [])
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

    panes = (load([herdr, "pane", "list"]) or {}).get("result", {}).get("panes", [])
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
