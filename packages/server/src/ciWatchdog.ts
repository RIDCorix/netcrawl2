const DEFAULT_REPOSITORY = 'RIDCorix/netcrawl2';
export const CI_WATCHDOG_POLL_INTERVAL_MS = 5 * 60 * 1000;
export const CI_WATCHDOG_PENDING_GRACE_MS = 5 * 60 * 1000;

export type CiWatchdogStatus = 'green' | 'pending' | 'non_green' | 'error' | 'disabled';

export interface CiWatchdogSnapshot {
  status: CiWatchdogStatus;
  reason: string;
  checkedAt: string | null;
  sha: string | null;
  runUrl: string | null;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
type SetTimeoutLike = (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
type ClearTimeoutLike = (timer: ReturnType<typeof setTimeout>) => void;

export interface CiWatchdogOptions {
  enabled: boolean;
  fetch?: FetchLike;
  now?: () => number;
  setTimeout?: SetTimeoutLike;
  clearTimeout?: ClearTimeoutLike;
  pollIntervalMs?: number;
  pendingGraceMs?: number;
  repository?: string;
}

interface GitHubWorkflow {
  state?: unknown;
}

interface GitHubCommit {
  sha?: unknown;
  commit?: {
    committer?: { date?: unknown } | null;
    author?: { date?: unknown } | null;
  } | null;
}

interface GitHubWorkflowRun {
  status?: unknown;
  conclusion?: unknown;
  created_at?: unknown;
  html_url?: unknown;
  head_sha?: unknown;
}

interface GitHubWorkflowRuns {
  workflow_runs?: unknown;
}

class ProviderError extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

function asTimestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export class CiWatchdog {
  private readonly enabled: boolean;
  private readonly fetchFn: FetchLike;
  private readonly now: () => number;
  private readonly setTimeoutFn: SetTimeoutLike;
  private readonly clearTimeoutFn: ClearTimeoutLike;
  private readonly repository: string;
  readonly pollIntervalMs: number;
  private readonly pendingGraceMs: number;
  private started = false;
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<CiWatchdogSnapshot> | null = null;
  private snapshot: CiWatchdogSnapshot;

  constructor(options: CiWatchdogOptions) {
    this.enabled = options.enabled;
    this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.now = options.now ?? Date.now;
    this.setTimeoutFn = options.setTimeout ?? setTimeout;
    this.clearTimeoutFn = options.clearTimeout ?? clearTimeout;
    this.pollIntervalMs = options.pollIntervalMs ?? CI_WATCHDOG_POLL_INTERVAL_MS;
    this.pendingGraceMs = options.pendingGraceMs ?? CI_WATCHDOG_PENDING_GRACE_MS;
    this.repository = options.repository ?? DEFAULT_REPOSITORY;
    this.snapshot = this.emptySnapshot(
      this.enabled ? 'error' : 'disabled',
      this.enabled ? 'not_checked' : 'watchdog_disabled',
    );
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    const generation = ++this.generation;
    if (!this.enabled) return;
    void this.pollAndSchedule(generation);
  }

  stop(): void {
    this.started = false;
    this.generation += 1;
    if (this.timer !== null) {
      this.clearTimeoutFn(this.timer);
      this.timer = null;
    }
  }

  getSnapshot(): CiWatchdogSnapshot {
    return { ...this.snapshot };
  }

  getHealth(): { statusCode: 200 | 503; body: CiWatchdogSnapshot } {
    const snapshot = this.getSnapshot();
    if (snapshot.status !== 'green' || snapshot.checkedAt === null) {
      return { statusCode: 503, body: snapshot };
    }

    const checkedAt = asTimestamp(snapshot.checkedAt);
    if (checkedAt === null || this.now() - checkedAt > this.pollIntervalMs * 2) {
      return {
        statusCode: 503,
        body: { ...snapshot, status: 'error', reason: 'snapshot_stale' },
      };
    }
    return { statusCode: 200, body: snapshot };
  }

  poll(): Promise<CiWatchdogSnapshot> {
    if (!this.enabled) {
      this.snapshot = this.emptySnapshot('disabled', 'watchdog_disabled');
      return Promise.resolve(this.getSnapshot());
    }
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.performCheck().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async pollAndSchedule(generation: number): Promise<void> {
    await this.poll();
    if (!this.started || generation !== this.generation) return;
    const timer = this.setTimeoutFn(() => {
      if (this.timer === timer) this.timer = null;
      if (!this.started || generation !== this.generation) return;
      void this.pollAndSchedule(generation);
    }, this.pollIntervalMs);
    this.timer = timer;
  }

  private emptySnapshot(status: CiWatchdogStatus, reason: string): CiWatchdogSnapshot {
    return { status, reason, checkedAt: null, sha: null, runUrl: null };
  }

  private completeSnapshot(
    status: CiWatchdogStatus,
    reason: string,
    sha: string | null,
    runUrl: string | null,
  ): CiWatchdogSnapshot {
    this.snapshot = {
      status,
      reason,
      checkedAt: new Date(this.now()).toISOString(),
      sha,
      runUrl,
    };
    return this.getSnapshot();
  }

  private async github(path: string): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchFn(`https://api.github.com/repos/${this.repository}${path}`, {
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
    } catch {
      throw new ProviderError('github_request_failed');
    }
    if (!response.ok) throw new ProviderError(`github_http_${response.status}`);
    try {
      return await response.json();
    } catch {
      throw new ProviderError('github_invalid_json');
    }
  }

  private async performCheck(): Promise<CiWatchdogSnapshot> {
    let sha: string | null = null;
    let runUrl: string | null = null;
    try {
      const workflow = (await this.github('/actions/workflows/test.yml')) as GitHubWorkflow;
      if (typeof workflow !== 'object' || workflow === null || typeof workflow.state !== 'string') {
        throw new ProviderError('github_invalid_response');
      }
      if (workflow.state !== 'active') {
        return this.completeSnapshot('non_green', 'workflow_inactive', sha, runUrl);
      }

      const master = (await this.github('/commits/master')) as GitHubCommit;
      if (typeof master !== 'object' || master === null || typeof master.sha !== 'string') {
        throw new ProviderError('github_invalid_response');
      }
      sha = master.sha;
      const commitTime = asTimestamp(master.commit?.committer?.date ?? master.commit?.author?.date);
      if (commitTime === null) throw new ProviderError('github_invalid_response');

      const query = new URLSearchParams({
        branch: 'master',
        event: 'push',
        head_sha: sha,
        per_page: '1',
      });
      const runs = (await this.github(`/actions/workflows/test.yml/runs?${query.toString()}`)) as GitHubWorkflowRuns;
      if (!Array.isArray(runs.workflow_runs)) throw new ProviderError('github_invalid_response');
      const run = runs.workflow_runs[0] as GitHubWorkflowRun | undefined;
      const now = this.now();

      if (!run) {
        const withinGrace = now - commitTime <= this.pendingGraceMs;
        return this.completeSnapshot(
          withinGrace ? 'pending' : 'non_green',
          withinGrace ? 'test_run_missing_within_grace' : 'test_run_missing',
          sha,
          runUrl,
        );
      }
      if (
        typeof run.status !== 'string' ||
        typeof run.created_at !== 'string' ||
        typeof run.html_url !== 'string' ||
        typeof run.head_sha !== 'string'
      ) {
        throw new ProviderError('github_invalid_response');
      }
      if (run.head_sha !== sha) throw new ProviderError('github_invalid_response');
      runUrl = run.html_url;
      const runTime = asTimestamp(run.created_at);
      if (runTime === null) throw new ProviderError('github_invalid_response');

      if (run.status !== 'completed') {
        const withinGrace = now - runTime <= this.pendingGraceMs;
        return this.completeSnapshot(
          withinGrace ? 'pending' : 'non_green',
          withinGrace ? 'test_run_pending' : 'test_run_not_completed',
          sha,
          runUrl,
        );
      }
      if (run.conclusion !== 'success') {
        const conclusion = typeof run.conclusion === 'string' ? run.conclusion : 'unknown';
        return this.completeSnapshot('non_green', `test_run_${conclusion}`, sha, runUrl);
      }
      return this.completeSnapshot('green', 'test_run_succeeded', sha, runUrl);
    } catch (error) {
      const reason = error instanceof ProviderError ? error.reason : 'watchdog_check_failed';
      return this.completeSnapshot('error', reason, sha, runUrl);
    }
  }
}
