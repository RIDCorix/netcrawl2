"""The runner emits the frame shape it declares, and declares the release it emits it in.

R-50: `detail["loop"]` reached the runner and never reached a release number. The
1.4.1 on PyPI and the deployed UI both said "1.4.1" and disagreed about the frame,
so the version gate compared equal and admitted a runtime that emits no loop
identity — and the loop track, which is drawn only from that identity, was absent
for every player with no error anywhere to say so.

These tests are the emitter's half of `frame_contract.json`. They fail when the
runner's `detail` keys drift from the declaration, which is the edit whose
invisibility was the actual defect. The reader's half — that the server's floor
sits at or above the declared release, and that the UI reads no key nobody emits —
is `scripts/test-frame-contract.mjs`; the *published* artifact's half is
`scripts/test-python-sdk-artifact-lifecycle.py`.
"""

import json
from pathlib import Path

from netcrawl.compute_lab_runner import FRAME_KINDS, execute
from netcrawl.version import __version__

CONTRACT = json.loads((Path(__file__).resolve().parents[1] / "frame_contract.json").read_text(encoding="utf-8"))
KINDS = CONTRACT["kinds"]
FRAME = CONTRACT["frame"]

# Between them these reach every kind the runner can emit, and every optional key
# it can attach. `test_the_fixtures_reach_every_declared_kind` is what stops a
# conformance pass from being vacuous when one of them stops running.
FIXTURES = {
    "every_construct": """class ProblemSolver:
    def solution(self, a, b):
        def double(x):
            return x * 2
        nums = [a, b]
        total = 0
        for value in nums:
            if value > 0:
                total = total + double(value)
            else:
                total = total - 1
        index = 0
        while index < len(nums):
            index = index + 1
            if index > 5:
                break
        for left, right in [(a, b)]:
            total = total + left + right
        try:
            bad = nums[99]
        except IndexError:
            total = total + 1
        finally:
            total = total + 0
        return total
""",
    # An error nobody catches: every frame it leaves reports it.
    "uncaught": """class ProblemSolver:
    def solution(self, a, b):
        nums = [a, b]
        return nums[99]
""",
    # The one way `block_exit` carries `error`: a release that happened anyway.
    "finally_while_unwinding": """class ProblemSolver:
    def solution(self, a, b):
        nums = [a]
        try:
            bad = nums[99]
        finally:
            a = a
        return a
""",
    # An `assert` has a `test` and no body, so its decision carries no `taken`.
    "assert_only": """class ProblemSolver:
    def solution(self, a, b):
        assert a > 0
        return a
""",
    # A target that names nothing, so its binding carries no `bindings`.
    "subscript_target": """class ProblemSolver:
    def solution(self, a, b):
        nums = [a, b]
        nums[0] = 9
        return nums[0]
""",
    # `break` and `continue` have no fields at all, which is what a bare step is.
    # Both have to actually run: a `break` the loop never reaches is compiled and
    # instrumented, and emits nothing.
    "break_and_continue": """class ProblemSolver:
    def solution(self, a, b):
        total = 0
        for i in range(4):
            if i == 0:
                continue
            if i == 2:
                break
            total = total + i
        return total
""",
    # Nested loops: the identity is per live instance, not per source location.
    "nested": """class ProblemSolver:
    def solution(self, a, b):
        total = 0
        for i in range(3):
            for j in range(2):
                total = total + i + j
        return total
""",
}


def frames_of(source, params={"a": 2, "b": 3}, names=["a", "b"]):
    result = execute({"source": source, "params": params, "parameterNames": names, "limits": {"maxEvents": 2000}})
    assert result["status"] in {"trace_ready", "runtime"}, f"{result['status']}: {result.get('error')}"
    return result["frames"]


def every_frame():
    for name, source in FIXTURES.items():
        for frame in frames_of(source):
            yield name, frame


def test_the_contract_declares_every_kind_the_runner_can_emit():
    # A kind the runner can produce but the declaration omits would be exempt
    # from every check below, which is the same silence R-50 was.
    assert set(KINDS) == set(FRAME_KINDS)


def test_the_fixtures_reach_every_declared_kind():
    reached = {frame["kind"] for _, frame in every_frame()}
    assert reached == set(KINDS), f"unreached: {sorted(set(KINDS) - reached)}"


def test_the_runner_emits_no_detail_key_the_contract_does_not_declare():
    for fixture, frame in every_frame():
        declared = set(KINDS[frame["kind"]]["required"]) | set(KINDS[frame["kind"]]["optional"])
        emitted = set(frame.get("detail") or {})
        assert emitted <= declared, (
            f"{fixture}: a {frame['kind']} frame carries {sorted(emitted - declared)}, which frame_contract.json "
            "does not declare. Declare it and move sinceVersion to the release that will carry it — a reader on an "
            "older release cannot see this key, and a version compare cannot tell you so."
        )


def test_every_required_key_is_on_every_frame_of_its_kind():
    for fixture, frame in every_frame():
        emitted = set(frame.get("detail") or {})
        missing = set(KINDS[frame["kind"]]["required"]) - emitted
        assert not missing, (
            f"{fixture}: a {frame['kind']} frame is missing {sorted(missing)}. Either the runner stopped emitting a "
            "key the UI is entitled to, or the key was never unconditional and belongs in `optional`."
        )


def test_the_runner_emits_no_top_level_field_the_contract_does_not_declare():
    declared = set(FRAME["required"]) | set(FRAME["optional"])
    for fixture, frame in every_frame():
        undeclared = set(frame) - declared
        assert not undeclared, (
            f"{fixture}: a {frame['kind']} frame carries top-level {sorted(undeclared)}, which frame_contract.json "
            "does not declare. Declare it and move sinceVersion — a reader on an older release never receives it, "
            "and `detail` was only half this wire."
        )


def test_every_required_top_level_field_is_on_every_frame():
    for fixture, frame in every_frame():
        missing = set(FRAME["required"]) - set(frame)
        assert not missing, (
            f"{fixture}: a {frame['kind']} frame is missing top-level {sorted(missing)}. Every one of these is `?:` on "
            "`ComputeLabFrame`, so the UI reads it as undefined and draws nothing rather than failing — which is how "
            "`types` went missing for every player without a single error."
        )


def test_no_step_frame_carries_a_field_only_the_terminal_frame_may():
    # `error` is assembled by app.py for the closing error/limit frame. A step
    # frame carrying it would make the run look terminal to the server, which
    # refuses exactly that shape.
    for fixture, frame in every_frame():
        overlap = set(frame) & set(FRAME["terminalOnly"])
        assert not overlap, f"{fixture}: a {frame['kind']} step frame carries terminal-only {sorted(overlap)}"


def test_every_variable_carries_the_type_chip_the_boxes_draw():
    """R-50's second face, and the reason `detail` alone was not the contract.

    `1a92eed` added `frame["types"]` in the same commit as `detail["loop"]`, and
    the 1.4.1 on PyPI emits neither. `stage.tsx` reads `frame?.types?.[name]` for
    the chip under each variable box; absent, it renders nothing and no error —
    which is why the `int` labels are missing from R-50's "before" screenshot and
    present in the "after" one, a difference the first delivery read as identical.
    """
    frames = frames_of(FIXTURES["nested"])
    assert all("types" in frame for frame in frames)
    for frame in frames:
        # Parallel to `locals`: a box with no type chip is the failure being pinned.
        assert set(frame["types"]) == set(frame["locals"]), frame
        assert all(isinstance(name, str) for name in frame["types"].values()), frame
    holding = next(frame for frame in reversed(frames) if frame["locals"])
    assert holding["types"] == {name: "int" for name in holding["locals"]}, holding


def test_a_for_loop_carries_the_loop_identity_the_track_is_drawn_from():
    """R-50 itself, as the screen reported it: 「重複次數 2」 and no track.

    `detail["iteration"]` and `detail["loop"]` are set in the same unconditional
    block, so this is what tells the two apart from the outside — a runner that
    counts repetitions and cannot say *which loop* they belong to is the one that
    reached production.
    """
    repetitions = [frame for frame in frames_of(FIXTURES["nested"]) if frame["kind"] == "repetition"]
    assert repetitions
    for frame in repetitions:
        assert isinstance(frame["detail"]["loop"], int), frame
        assert isinstance(frame["detail"]["iteration"], int), frame
    # Per live instance, not per source location: the inner loop opens again on
    # every outer iteration, so three outer runs of one inner loop are four ids.
    assert len({frame["detail"]["loop"] for frame in repetitions}) == 4


def test_a_loop_block_exit_closes_the_track_it_opened():
    frames = frames_of(FIXTURES["nested"])
    opened = {frame["detail"]["loop"] for frame in frames if frame["kind"] == "repetition"}
    closed = {frame["detail"]["loop"] for frame in frames if frame["kind"] == "block_exit" and "loop" in (frame.get("detail") or {})}
    assert closed <= opened, "a block_exit named a loop that never repeated"
    assert closed, "no loop reported its exit, so no track can ever be drawn as finished"


def test_the_release_is_not_older_than_the_shape_it_emits():
    # sinceVersion is the release that first emits the declaration above. A tree
    # whose own version sits below it is claiming to be a release that predates
    # the frames it is producing — the exact inconsistency R-50 shipped.
    def parts(version):
        return [int(piece) for piece in version.split(".")]

    assert parts(__version__) >= parts(CONTRACT["sinceVersion"]), (
        f"netcrawl-sdk {__version__} emits the frame shape declared for {CONTRACT['sinceVersion']}"
    )
