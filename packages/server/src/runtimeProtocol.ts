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

/**
 * The wire protocol this server speaks. Bump whenever a command shape changes.
 *
 * A *frame* shape is not a command shape, and R-50 is the case that settles it.
 * `detail.loop` was added to what the runner reports back and the release number
 * did not move, so the loop track was absent for every player; the fix is the
 * floor below, not this number, and deliberately so:
 *
 *  1. This value gates commands the server sends *to* a runtime. A frame travels
 *     the other way. `packages/sdk-python/frame_contract.json` is what declares
 *     the frame shape, and `MIN_PYTHON_SDK_VERSION` is what enforces it.
 *  2. Both halves already refuse exactly the same runtimes here, and their
 *     sentences differ: the floor tells a player to upgrade a package, which is
 *     true and actionable. A protocol mismatch tells them their build is
 *     inconsistent and to reinstall — wrong advice for someone whose only problem
 *     is an old release.
 *  3. The check in `runtimeRoutes` is exact equality, and the SDK carries its own
 *     copy in `netcrawl/version.py`. One push starts both the PyPI publish and
 *     the Railway deploy and they do not land together, so bumping this refuses
 *     every player who upgrades while the halves disagree — a regression bought
 *     for nothing, since (2) already refused them with a better sentence.
 */
export const RUNTIME_PROTOCOL_VERSION = 3;

/**
 * The oldest `netcrawl-sdk` release that speaks {@link RUNTIME_PROTOCOL_VERSION}
 * and emits the frame shape the Lab UI reads.
 *
 * The starter workspace's dependency range is checked against this value, so a
 * protocol bump that forgets the starter fails the test suite rather than a
 * player's first Codespace. `frame_contract.json`'s `sinceVersion` is checked
 * against it too: a frame shape the UI needs cannot ship while this floor still
 * admits a runtime that never emits it, and the starter cannot lock a release
 * that was never published — which is the chain that turns a forgotten publish
 * into a red build instead of a screen that draws nothing.
 */
export const MIN_PYTHON_SDK_VERSION = '1.4.6';

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
