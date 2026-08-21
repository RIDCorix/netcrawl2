# NetCrawl Editor Bridge

Open a Compute Lab problem in desktop VS Code or browser-based GitHub Codespaces,
edit the real workspace file, and run that exact saved document through
NetCrawl's existing sandboxed runner.

## Install

1. Download `netcrawl-editor-bridge.vsix` from the latest NetCrawl GitHub release.
2. In VS Code or Codespaces, open **Extensions: Install from VSIX...** and choose
   the file.
3. In NetCrawl's Compute Lab choose **Pair editor**, then run
   **NetCrawl: Pair Editor** and enter the displayed server URL and one-time code.

The long-lived editor credential is stored only in VS Code SecretStorage. The
pairing code expires after five minutes and cannot be reused.

## Use

Choose the paired editor in the Compute Lab and press **Open in VS Code**. The
bridge writes only below `netcrawl/problems/` inside the selected workspace.
After editing, press **Run solution** in the Compute Lab (or run **NetCrawl: Run
Problem** from VS Code). The bridge saves and runs that exact workspace file.
While it runs, VS Code highlights and reveals the current server-reported source
range. The highlight clears at the terminal outcome, while the game keeps the
complete execution trace available for replay.

If a workspace contains multiple folders, set `netcrawl.workspaceFolder` to the
exact folder name that should hold NetCrawl problems.
