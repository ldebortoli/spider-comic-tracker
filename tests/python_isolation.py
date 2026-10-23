"""Test-only containment, imported before loading the Telegram module."""
import sys
import os
from pathlib import Path
import importlib.machinery
import socket
import threading
import atexit
import json

ROOT = Path(__file__).resolve().parents[1]
SANDBOX = ROOT / "test-sandbox"
if not (ROOT / "evidence/baseline-manifest.json").is_file() or (ROOT / ".env").exists() or (ROOT / ".git").exists():
    raise RuntimeError("ISOLATION: Python tests require a code-only snapshot")
SANDBOX.mkdir(exist_ok=True)
(ROOT / "evidence/isolation").mkdir(exist_ok=True)
allowed = {"PATH", "PATHEXT", "SYSTEMROOT", "SYSTEMDRIVE", "WINDIR", "COMSPEC", "TEMP", "TMP", "NODE_OPTIONS", "PYTHONDONTWRITEBYTECODE"}
for key in list(os.environ):
    if key.upper() not in allowed:
        del os.environ[key]
os.environ.update(DB_PATH=str(SANDBOX / "python-synthetic.sqlite"), PORT="0",
                  TELEGRAM_BOT_TOKEN="", TELEGRAM_POLLING_ENABLED="false", SPIDER_SYNTHETIC_TEST="code-only",
                  SCHEDULE_ENABLED="false", BACKUP_ENABLED="false", CATALOG_REFRESH_ENABLED="false",
                  TEMP=str(SANDBOX), TMP=str(SANDBOX))
state = {"imports": 0, "listeners": 0, "connections": 0, "blocked": []}
depth = 0
ports = set()
runtime = [Path(sys.base_prefix).resolve()]
# Dependency/stdlib reads are trusted tooling; application/config/data paths are not.
runtime.extend(Path(p).resolve() for p in sys.path if p and "site-packages" in p)
_native_open = open
_local = {"127.0.0.1", "localhost", "::1"}


def inside(base, target):
    return target == base or base in target.parents


def deny(kind):
    state["blocked"].append(kind)
    raise RuntimeError("ISOLATION: " + kind)


def audit(event, args):
    if event == "open" and not isinstance(args[0], int):
        target = Path(args[0]).resolve()
        mode, flags = args[1], args[2]
        writing = (isinstance(mode, str) and any(c in mode for c in "wax+")) or bool(flags & (os.O_WRONLY | os.O_RDWR | os.O_CREAT))
        if target.name == ".env" and not inside(SANDBOX, target):
            deny("non-synthetic environment")
        if writing:
            if depth:
                deny("filesystem mutation during import")
            if not any(inside(p, target) for p in [SANDBOX, ROOT / "data", ROOT / "evidence"]):
                deny("write outside synthetic outputs")
        elif not inside(ROOT, target) and not any(inside(p, target) for p in runtime):
            deny("read outside snapshot/runtime")
    elif event in {"socket.connect", "socket.sendto"}:
        if depth:
            deny("network during import")
        address = args[1] if event == "socket.connect" else args[-1]
        if not isinstance(address, tuple) or address[0] not in _local or address[1] not in ports:
            deny("external or unregistered network")
        state["connections"] += 1
    elif event == "socket.getaddrinfo":
        if args[0] not in _local:
            deny("external DNS")
    elif event == "sqlite3.connect":
        # coverage.py stores measurements in its own synthetic SQLite file.
        caller = Path(sys._getframe(1).f_code.co_filename).resolve()
        coverage_db = Path(args[0]).resolve() == ROOT / "data/coverage/python.coverage"
        coverage_tool = caller.name == "sqlitedb.py" and caller.parent.name == "coverage" and any(inside(p, caller) for p in runtime)
        if depth or not coverage_db or not coverage_tool:
            deny("process/SQLite forbidden in Python tests")
    elif event in {"subprocess.Popen", "os.system", "os.posix_spawn", "os.exec", "os.fork"}:
        deny("process/SQLite forbidden in Python tests")


sys.addaudithook(audit)
_bind = socket.socket.bind


def bind(sock, address):
    if depth:
        deny("listener during import")
    if not isinstance(address, tuple) or address[0] not in _local:
        deny("non-loopback listener")
    result = _bind(sock, address)
    ports.add(sock.getsockname()[1])
    state["listeners"] += 1
    return result


socket.socket.bind = bind
_start = threading.Thread.start


def start_thread(thread, *args, **kwargs):
    if depth:
        deny("thread during import")
    return _start(thread, *args, **kwargs)


threading.Thread.start = start_thread
_execute = importlib.machinery.SourceFileLoader.exec_module


def execute(loader, module):
    global depth
    app = inside(ROOT / "src", Path(loader.path).resolve())
    if app:
        state["imports"] += 1
        depth += 1
    try:
        return _execute(loader, module)
    finally:
        if app:
            depth -= 1


importlib.machinery.SourceFileLoader.exec_module = execute


def probe_import(callback):
    global depth
    depth += 1
    try:
        callback()
    finally:
        depth -= 1


def save():
    with _native_open(ROOT / "evidence/isolation" / ("python-" + str(os.getpid()) + ".json"), "w") as report:
        json.dump(state, report, indent=2)


atexit.register(save)
