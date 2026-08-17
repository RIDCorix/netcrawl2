/**
 * The Code Server wire protocol, and the gate that keeps an outdated runtime
 * from guessing at it.
 *
 * A runtime that predates a protocol change does not fail loudly on its own. It
 * takes a command shape it has no branch for down whatever path it does have —
 * an SDK older than 1.2.4 has no `compute_lab_run` branch, so a Lab command
 * (whose `classId` is deliberately empty) fell through to the deploy path and
 * was reported as `Unknown class_id:` with nothing after the colon. The player
 * was told their worker class was wrong; their worker class was fine.
 *
 * Refusing the registration outright is what turns that into one sentence the
 * player can act on: no lease, so no command of any shape is ever handed to a
 * runtime that cannot read it.
 */

/** The wire protocol this server speaks. Bump whenever a command shape changes. */
export const RUNTIME_PROTOCOL_VERSION = 3;

/**
 * The oldest `netcrawl-sdk` release that speaks {@link RUNTIME_PROTOCOL_VERSION}.
 * The starter workspace's dependency range is checked against this value, so a
 * protocol bump that forgets the starter fails the test suite rather than a
 * player's first Codespace.
 */
export const MIN_PYTHON_SDK_VERSION = '1.4.1';

function parseVersion(version: string): number[] {
  return version.split('.').map(part => Number.parseInt(part, 10) || 0);
}

/** Numeric dotted-version compare: negative when `a` precedes `b`. */
export function compareSdkVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] || 0) - (right[index] || 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function isSupportedSdkVersion(version: unknown): boolean {
  if (typeof version !== 'string' || !/^\d+(\.\d+)*$/.test(version.trim())) return false;
  return compareSdkVersions(version.trim(), MIN_PYTHON_SDK_VERSION) >= 0;
}

const UPGRADE_INSTRUCTION =
  'Run "uv sync --upgrade-package netcrawl-sdk" in your workspace, then start the Code Server again.';

/**
 * One sentence, addressed to the player, naming the command that fixes it.
 * Every SDK release since 1.0 prints an unsuccessful registration's `error`
 * verbatim, so this reaches even a runtime far too old to understand the gate.
 *
 * The two halves of the gate are reported separately on purpose. A runtime
 * whose version this server accepts but whose protocol it does not is not
 * "too old" — it is inconsistent, and telling such a player to upgrade to the
 * version they already have would read as nonsense.
 */
export function sdkOutdatedMessage(sdkVersion: unknown, protocolVersion?: unknown): string {
  if (isSupportedSdkVersion(sdkVersion))
    return (
      `Your Code Server reports netcrawl-sdk ${String(sdkVersion).trim()} but speaks runtime protocol ` +
      `${JSON.stringify(protocolVersion) ?? 'none'}, which this server does not — it needs protocol ` +
      `${RUNTIME_PROTOCOL_VERSION}. Reinstall the SDK: ${UPGRADE_INSTRUCTION}`
    );
  const reported =
    typeof sdkVersion === 'string' && sdkVersion.trim()
      ? `Your Code Server runs netcrawl-sdk ${sdkVersion.trim()}`
      : 'Your Code Server runs a netcrawl-sdk too old to report its version';
  return `${reported}, but this server needs ${MIN_PYTHON_SDK_VERSION} or newer. ${UPGRADE_INSTRUCTION}`;
}
