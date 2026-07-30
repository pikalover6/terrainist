"""
Offline, zero-cost probe: does STOCK Claude Code honour `effort:` in
.claude/agents/*.md frontmatter?

Adapted from ccpatch/verify.py's offline mode. Nothing is ever sent to
api.anthropic.com: the local endpoint answers every POST with canned SSE.

Ground truth is `output_config.effort` on the request body, filtered to
requests that carry a tool set. The child is identified by a fingerprint
string planted in the agent's system prompt, not by request position.
"""

import http.server
import json
import os
import shutil
import socket
import subprocess
import sys
import threading
from pathlib import Path

SCRATCH = Path(__file__).resolve().parent
# Point CC_BINARY at the Claude Code binary under test (any version, any box).
STOCK = os.environ.get(
    "CC_BINARY", "/Users/kaihoward/.local/share/claude/versions/2.1.220"
)
MODEL = "claude-sonnet-4-6"
PARENT_EFFORT = "high"
FINGERPRINT = "ZQPROBEAGENTZQ"
DUMMY_KEY = "sk-ant-api03-" + "0" * 80 + "-probeAAAA"

PROMPT = (
    "Use the Agent tool exactly once to spawn a subagent. "
    "Then reply with only what the subagent returned, and nothing else."
)


# --------------------------------------------------------------------------
# canned SSE (verbatim shape from ccpatch/verify.py)
# --------------------------------------------------------------------------

def _sse(events):
    return "".join(
        f"event: {n}\ndata: {json.dumps(p)}\n\n" for n, p in events
    ).encode()


def _message(blocks, stop_reason):
    events = [("message_start", {"type": "message_start", "message": {
        "id": "msg_local", "type": "message", "role": "assistant", "model": MODEL,
        "content": [], "stop_reason": None, "stop_sequence": None,
        "usage": {"input_tokens": 1, "output_tokens": 1}}})]
    for i, b in enumerate(blocks):
        events.append(("content_block_start", {
            "type": "content_block_start", "index": i, "content_block": b["start"]}))
        events.append(("content_block_delta", {
            "type": "content_block_delta", "index": i, "delta": b["delta"]}))
        events.append(("content_block_stop", {"type": "content_block_stop", "index": i}))
    events += [
        ("message_delta", {"type": "message_delta", "usage": {"output_tokens": 1},
                           "delta": {"stop_reason": stop_reason, "stop_sequence": None}}),
        ("message_stop", {"type": "message_stop"}),
    ]
    return _sse(events)


def _canned_text(t):
    return _message([{"start": {"type": "text", "text": ""},
                      "delta": {"type": "text_delta", "text": t}}], "end_turn")


def _canned_tool_use(tool_input):
    return _message([{"start": {"type": "tool_use", "id": "toolu_local",
                                "name": "Agent", "input": {}},
                      "delta": {"type": "input_json_delta",
                                "partial_json": json.dumps(tool_input)}}], "tool_use")


# --------------------------------------------------------------------------
# endpoint
# --------------------------------------------------------------------------

class Recorder:
    def __init__(self, tool_input):
        self.tool_input = tool_input
        self.calls = []
        self.turn = 0
        self.lock = threading.Lock()

    def note(self, body):
        # Only requests carrying a tool set are conversation turns. Session
        # titling etc. fire their own calls at their own fixed effort.
        raw = json.dumps(body)
        with self.lock:
            entry = {
                "model": body.get("model"),
                "effort": (body.get("output_config") or {}).get("effort"),
                "has_tools": bool(body.get("tools")),
                "is_child": FINGERPRINT in raw,
                "n_tools": len(body.get("tools") or []),
            }
            if entry["has_tools"]:
                self.turn += 1
                entry["turn"] = self.turn
            self.calls.append(entry)
            return entry


def handler_for(rec):
    class H(http.server.BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *a):
            pass

        def do_GET(self):
            self._reply(200, b'{"data":[]}', "application/json")

        def do_POST(self):
            n = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(n)
            try:
                body = json.loads(raw)
            except ValueError:
                body = {}
            e = rec.note(body)
            # First real turn -> make the parent call the Agent tool.
            if e.get("turn") == 1 and not e["is_child"]:
                return self._sse(_canned_tool_use(rec.tool_input))
            return self._sse(_canned_text("hi"))

        def _reply(self, code, payload, ctype):
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def _sse(self, payload):
            self._reply(200, payload, "text/event-stream")

    return H


def serve(rec):
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler_for(rec))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, port


# --------------------------------------------------------------------------
# isolated sandbox
# --------------------------------------------------------------------------

def build_sandbox(tag, frontmatter_effort):
    """Fresh HOME + CLAUDE_CONFIG_DIR + project dir. Touches nothing real."""
    root = SCRATCH / f"sandbox-{tag}"
    if root.exists():
        shutil.rmtree(root)
    home = root / "home"
    cfg = home / ".claude"
    proj = root / "proj"
    agents = proj / ".claude" / "agents"
    agents.mkdir(parents=True)
    cfg.mkdir(parents=True)

    eff_line = f"effort: {frontmatter_effort}\n" if frontmatter_effort else ""
    (agents / "impl-low.md").write_text(
        "---\n"
        "name: impl-low\n"
        "description: Probe implementer used to measure effort propagation.\n"
        f"{eff_line}"
        "---\n"
        f"You are {FINGERPRINT}, a probe agent. "
        "Answer exactly what you are asked and nothing else.\n"
    )

    # Same fixture shape Claude Code itself writes for its plugin-eval harness,
    # plus trust for the project dir and approval for the dummy API key
    # (approval list stores key.trim()[-20:]).
    (cfg.parent / ".claude.json").write_text(json.dumps({
        "hasCompletedOnboarding": True,
        "autoUpdates": False,
        "bypassPermissionsModeAccepted": False,
        "primaryApiKey": DUMMY_KEY,
        "customApiKeyResponses": {"approved": [DUMMY_KEY.strip()[-20:]], "rejected": []},
        "projects": {
            str(proj): {
                "hasTrustDialogAccepted": True,
                "hasCompletedProjectOnboarding": True,
                "allowedTools": ["Agent"],
                "history": [],
            }
        },
    }, indent=2))
    return home, cfg, proj


def clean_env(home, cfg, port):
    """Env built from scratch: no CLAUDE_*/ANTHROPIC_* leakage from this session."""
    env = {
        "PATH": "/usr/bin:/bin:/usr/sbin:/sbin",
        "HOME": str(home),
        "TMPDIR": os.environ.get("TMPDIR", "/tmp"),
        "LANG": "en_US.UTF-8",
        "TERM": "dumb",
        "SHELL": "/bin/sh",
        "USER": os.environ.get("USER", "probe"),
        "CLAUDE_CONFIG_DIR": str(cfg),
        "ANTHROPIC_BASE_URL": f"http://127.0.0.1:{port}",
        "ANTHROPIC_API_KEY": DUMMY_KEY,
        "DISABLE_AUTOUPDATER": "1",
        "DISABLE_TELEMETRY": "1",
        "DISABLE_ERROR_REPORTING": "1",
        "DISABLE_BUG_COMMAND": "1",
        "DISABLE_NON_ESSENTIAL_MODEL_CALLS": "1",
        "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
    }
    return env


# --------------------------------------------------------------------------
# one scenario
# --------------------------------------------------------------------------

def run_scenario(tag, frontmatter_effort, binary=STOCK, extra_args=(), timeout=240,
                 param_effort=None):
    print(f"\n{'='*74}\nSCENARIO {tag}: frontmatter effort = "
          f"{frontmatter_effort!r}, tool-param effort = {param_effort!r}, "
          f"parent --effort {PARENT_EFFORT}")
    print(f"  binary: {binary}")
    home, cfg, proj = build_sandbox(tag, frontmatter_effort)

    tool_input = {
        "description": "effort probe",
        "prompt": "return 'hi', nothing else",
        "subagent_type": "impl-low",
        "run_in_background": False,
    }
    if param_effort is not None:
        tool_input["effort"] = param_effort
    print(f"  Agent tool input: {json.dumps(tool_input)}")

    rec = Recorder(tool_input)
    srv, port = serve(rec)
    env = clean_env(home, cfg, port)
    cmd = [binary, "-p", PROMPT, "--model", MODEL, "--effort", PARENT_EFFORT,
           "--allowedTools", "Agent", *extra_args]
    try:
        p = subprocess.run(cmd, cwd=str(proj), env=env, capture_output=True,
                           text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        print("  TIMEOUT")
        srv.shutdown()
        return None
    finally:
        srv.shutdown()

    print(f"  exit={p.returncode}  stdout={ (p.stdout or '').strip()[:160]!r}")
    if p.returncode != 0:
        print(f"  stderr: {(p.stderr or '').strip()[:900]}")

    print("  --- captured requests ---")
    for i, c in enumerate(rec.calls, 1):
        kind = ("turn %d" % c["turn"]) if c["has_tools"] else "side-call (no tools)"
        who = "CHILD" if c["is_child"] else ("parent" if c["has_tools"] else "-")
        print(f"    #{i:<2} {kind:<22} {who:<7} model={c['model']} "
              f"effort={c['effort']!r} tools={c['n_tools']}")

    turns = [c for c in rec.calls if c["has_tools"]]
    parents = [c["effort"] for c in turns if not c["is_child"]]
    children = [c["effort"] for c in turns if c["is_child"]]
    print(f"  => parent efforts: {parents}")
    print(f"  => CHILD  efforts: {children}")
    return {"parents": parents, "children": children,
            "seq": [c["effort"] for c in turns], "rc": p.returncode,
            "stderr": (p.stderr or "")[:900]}


if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "both"
    out = {}
    if which in ("both", "all", "1"):
        out["1-frontmatter-low"] = run_scenario("fm-low", "low")
    if which in ("both", "all", "2"):
        out["2-control-no-effort"] = run_scenario("control", None)
    if which in ("all", "3"):
        out["3-stock-tool-param-low"] = run_scenario(
            "param-low", None, param_effort="low")
    if which in ("all", "4"):
        out["4-frontmatter-integer"] = run_scenario("fm-int", "500")
    if which in ("all", "5"):
        out["5-patched-tool-param-low"] = run_scenario(
            "patched-param", None, param_effort="low",
            binary="/Users/kaihoward/.local/share/claude-subagents-effort/claude2-2.1.220")
    print("\n" + "=" * 74)
    print(json.dumps(out, indent=2))
