# Project instructions

<!-- codex-persistent-memory -->
## Persistent project memory

Before project work, read in order: `.codex/CONTEXT.md`, `DECISIONS.md`, `BACKLOG.md`, `USER_QUEUE.md` and `SESSION_HANDOFF.md`. Process new user queue items into the backlog without duplicates. Update memory during work and commit/push it with project changes when a remote is configured.

<!-- codex-user-queue-execution -->
## Automatic user queue execution

`Procesadas` in `.codex/USER_QUEUE.md` means incorporated into `BACKLOG.md`, not completed. After handling the direct message that starts a run, automatically execute every unblocked queue-derived backlog task by priority. Continue until each is implemented, validated and moved to `DONE`, or record its precise blocker and continue with other executable queued work. Do not stop after triage or after only one queued task unless the user explicitly asks to pause, stop or only report status.
