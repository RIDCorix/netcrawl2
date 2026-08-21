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
- Desktop VS Code and browser-based Codespaces both run the extension against a
  workspace filesystem provider. File operations use `vscode.workspace.fs` and
  cannot assume a local `file:` URI.
- Compute Lab's local-first instructions and Editor Bridge are complementary:
  direct local runs stay local, while the mounted bridge is the production path
  that opens the generated problem file and synchronizes a saved-source run.
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
  paths, traversal, backslashes, empty segments, and any URI outside a currently
  open workspace folder. Before each read, write, or open it walks every path
  component with the provider's `FileStat`, rejects symbolic links and unknown
  types, and rechecks the chain after creating directories. A provider that
  cannot prove the path is a regular directory/file therefore fails closed.
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
