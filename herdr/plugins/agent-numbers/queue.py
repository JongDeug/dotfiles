#!/usr/bin/env python3
"""ctrl+N: focus the agent in judgment-queue slot N (deck's /queue tags it q=◆N)."""
import json
import os
import subprocess
import sys

herdr = os.environ.get("HERDR_BIN_PATH", "herdr")
out = subprocess.run([herdr, "agent", "list"], capture_output=True, text=True, timeout=5).stdout
for agent in json.loads(out or "{}").get("result", {}).get("agents", []):
    if (agent.get("tokens") or {}).get("q") == f"◆{sys.argv[1]}":
        subprocess.run([herdr, "agent", "focus", agent["pane_id"]], capture_output=True, timeout=5)
        break
