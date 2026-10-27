#!/usr/bin/env python3
"""Number workspaces and tabs. Strips stacked 1: 1: prefixes first."""
import json
import re
import subprocess
import sys

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


def sidebar_order(workspaces):
    """Mirror herdr's sidebar: a repo with both a main checkout and linked worktrees
    is drawn as one group (parents, then worktrees) at its first member's position.
    prefix+shift+N follows this order, not creation order."""
    # TODO: collapsed groups hide their children in the sidebar; we still count them.
    groups = {}
    for ws in workspaces:
        key = (ws.get("worktree") or {}).get("repo_key")
        if key:
            groups.setdefault(key, []).append(ws)
    grouped = {
        k for k, m in groups.items()
        if {bool(w["worktree"].get("is_linked_worktree")) for w in m} == {True, False}
    }
    out, emitted = [], set()
    for ws in workspaces:
        key = (ws.get("worktree") or {}).get("repo_key")
        if key not in grouped:
            out.append(ws)
        elif key not in emitted:
            emitted.add(key)
            members = groups[key]
            out += [w for w in members if not w["worktree"].get("is_linked_worktree")]
            out += [w for w in members if w["worktree"].get("is_linked_worktree")]
    return out


def main():
    ws_data = load([herdr, "workspace", "list"])
    workspaces = (ws_data or {}).get("result", {}).get("workspaces", [])
    for i, ws in enumerate(sidebar_order(workspaces), start=1):
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


if __name__ == "__main__":
    main()
