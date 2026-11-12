"""Turn state of local CLI sessions -> $HERMES_HOME/state/hc-agent-state.json.

Hermes runs turns in the gateway, which has no terminal, so this can't signal the terminal itself.
`hermes-hc` (beside this folder) runs the CLI and turns this file into OSC 7501 for herdr.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

# Turns from other platforms (telegram, api, cron...) are not the terminal's.
_MINE = {None, "local", "cli", "tui"}


def _home() -> Path:
    try:
        from hermes_constants import get_hermes_home
        return Path(get_hermes_home())
    except Exception:
        return Path(os.environ.get("HERMES_HOME") or Path.home() / ".hermes")


def _write(state: str, kwargs: dict) -> None:
    if kwargs.get("platform") not in _MINE:
        return
    path = _home() / "state" / "hc-agent-state.json"
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps({"state": state, "session": kwargs.get("session_id"), "ts": time.time()}))
        os.replace(tmp, path)
    except OSError:
        pass


def _hook(state: str):
    def fire(**kwargs) -> None:
        _write(state, kwargs)
    return fire


# pre_llm_call: once per turn before the loop; post_llm_call: the turn finished.
_STATES = {
    "pre_llm_call": "working",
    "pre_approval_request": "blocked",
    "on_human_input_request": "blocked",
    "post_approval_response": "working",
    "on_human_input_resolved": "working",
    "post_llm_call": "idle",
    "agent_loop_stopped": "idle",
}


def register(ctx):
    for name, state in _STATES.items():
        ctx.register_hook(name, _hook(state))
