# POSIX command coverage

Run `node --test tests/native/posix.test.js` from the repository root. On Windows
the harness uses Git Bash; set `GIT_BASH` to select another compatible Bash.
This full local suite can take several minutes because Windows retries refused
TCP connections slowly. It belongs in the optional native/full CI job.

`coverage-posix.inventory.json` is the reviewed inventory of executable Bash
command locations across all five maintained shell scripts. The metric counts
simple commands, nested command substitutions and executable loop/control
commands reported by Bash's DEBUG trap. A command repeated by a loop is one
location. Function entry events are measured separately; comments, function declarations
and syntax-only `then`/`fi`/`do`/`done`/`esac`/brace delimiters are not commands.
This is command and function coverage, not an unsupported claim of condition,
branch or statement metrics from another language's engine.

The inventory freezes each source SHA-256. The gate fails if source changes,
an expected command does not execute, a function is not called, or execution
reveals a command absent from the inventory. Review changed source and all its
executable locations before updating the inventory; never generate the expected
inventory solely from the observed trace. Detailed traces and a per-file summary
are written under ignored `data/coverage-posix-*.json`.

The harness runs byte-identical script copies in a temporary project and HOME.
Node/process signals, systemd, launchd, Zenity, browser launchers and macOS build
commands are external fixture boundaries. The Linux panel's separate fake
control subprocess is excluded from coverage by byte comparison; the original
control script executes independently. The real server, `.env`, SQLite database,
Telegram and user install locations are never used. Readiness checks briefly
bind an owned synthetic listener at loopback port 8787 after confirming the
port can be acquired, then verify its closure. Do not run this suite concurrently
with another test using that fixed production-contract port.

AppleScript is explicitly separate: static lifecycle/action/error contracts and
the surrounding shell build arguments are checked, while executable coverage is
reported as `null`. Windows has no AppleScript compiler/runtime or native
coverage engine. Fake `osacompile` only verifies shell orchestration. A real macOS
run must compile the generated application and verify actions, status failures,
close/cancel shutdown, failed-stop recovery, and native application identity.
Linux desktop/systemd and macOS desktop/launchd integration remain native smoke
checks; Bash command coverage does not stand in for those operating systems.
