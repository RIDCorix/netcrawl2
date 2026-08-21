# Editor bridge operating model

This note records the repository-specific facts the VS Code bridge depends on.
It is deliberately narrower than a general architecture document.

## Verified facts

- Compute Lab tasks are transient and are authoritative only for one
  `(user, nodeId, taskId)` tuple in `actions/computeActions.ts`.
- Python execution already crosses the hardened Compute Lab runner through a
  durable `compute_lab_run` command. One Code Server session owns the sole
  execution lease in `codeServerTracker.ts`.
- Browser runs currently send the browser draft to `POST /api/compute-lab/runs`.
  Run snapshots are then pushed to the player's UI as `COMPUTE_LAB_RUN` events.
- A VS Code web extension can run on desktop and in browser-based Codespaces,
  but cannot spawn Python. Workspace files in that host must be accessed with
  `vscode.workspace.fs`; they cannot be assumed to be local `file:` URIs.
- The server is multi-user in production. Browser credentials and Code Server
  credentials already have distinct JWT purposes.

## Invariants for the MVP

- Editor sessions are a separate multi-session control plane. Registering or
  polling an editor must never claim, renew, or release the Code Server lease.
- `NetCrawl: Run Problem` saves and reads the active workspace document, then
  sends that exact text to the server. The browser draft is replaced by that
  source when the editor run starts, so the UI cannot display one program while
  the runner executes another.
- The server chooses the relative problem path. The extension rejects absolute
  paths, traversal, backslashes, empty segments, and any resolved URI outside a
  currently open workspace folder before it reads or writes a file.
- Pairing codes are short-lived, single-use values sent only in JSON bodies.
  The server retains only their digest. The resulting editor credential is
  sent in an Authorization header and stored only with VS Code SecretStorage.
- Desktop and Codespaces use the same command polling and `workspace.fs` code.
  Opening a problem never depends on a `vscode://` deep link.

## Deliberate MVP limits

- Pairing and active editor sessions are process-local. A server restart makes
  editors re-register with their stored credential; an unconsumed pairing code
  expires instead of being restored.
- Problem files live below `netcrawl/problems/` in the selected workspace.
  This bridge does not grant access to arbitrary existing workspace files.
