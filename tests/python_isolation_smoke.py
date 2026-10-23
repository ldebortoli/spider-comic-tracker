import python_isolation as guard
import socket
import threading
import sqlite3

def blocked(callback, expected):
    before = len(guard.state["blocked"])
    try:
        callback()
    except RuntimeError as error:
        assert expected in str(error), str(error)
    else:
        raise AssertionError("guard did not block " + expected)
    assert len(guard.state["blocked"]) == before + 1

blocked(lambda: open(guard.ROOT / ".." / "not-a-real-file"), "read outside")
blocked(lambda: open(guard.ROOT / ".env"), "non-synthetic environment")
blocked(lambda: open(guard.ROOT / "must-not-exist", "w"), "write outside")
blocked(lambda: socket.getaddrinfo("example.invalid", 443), "external DNS")
with socket.socket() as sock:
    blocked(lambda: sock.connect(("203.0.113.1", 443)), "external or unregistered")
    blocked(lambda: guard.probe_import(lambda: sock.bind(("127.0.0.1", 0))), "listener during import")
blocked(lambda: guard.probe_import(lambda: threading.Thread(target=lambda: None).start()), "thread during import")
blocked(lambda: guard.probe_import(lambda: open(guard.SANDBOX / "must-not-exist", "w")), "filesystem mutation during import")
blocked(lambda: sqlite3.connect(":memory:"), "process/SQLite forbidden")
with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
    blocked(lambda: sock.sendto(b"synthetic", ("203.0.113.1", 443)), "external or unregistered")
assert guard.state["imports"] == guard.state["listeners"] == guard.state["connections"] == 0
print("Python guard smoke PASS: 10 blocked negative probes, zero application imports/listeners/connections.")
