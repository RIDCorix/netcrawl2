import ast

import pytest

from netcrawl.compute_lab_runner import (
    ALLOWED_EXPRESSION_TYPES,
    ALLOWED_NODES,
    CONTROL_KINDS,
    EXCLUDED_EXPRESSION_TYPES,
    FRAME_KINDS,
    INSTRUMENTED_EXPRESSION_TYPES,
    REQUIRED_EXPRESSION_EXCLUSIONS,
    InstrumentExecution,
    execute,
)

ADD_STARTER = """class ProblemSolver:
    def solution(self, a, b):
        nums = [a, b]
        total = 0
        for value in nums:
            if value > 0:
                total = total + value
        if total == a + b or len(nums) == 0:
            index = 0
        else:
            index = len(nums)
        while index < len(nums) and nums[index] >= 0:
            index = index + 1
        return total
"""


def run(source, params={"a": 2, "b": 3}, names=["a", "b"], max_events=300):
    return execute({"source": source, "params": params, "parameterNames": names, "limits": {"maxEvents": max_events}})


def solution(body, params={"a": 2, "b": 3}, names=["a", "b"], max_events=300):
    signature = ", ".join(names)
    return run(f"class ProblemSolver:\n    def solution(self, {signature}):\n        {body}\n", params, names, max_events)


def kinds(result):
    return [frame["kind"] for frame in result["frames"]]


def test_type_builtin_is_allowed_for_typeof_puzzle_solution():
    result = run("""class ProblemSolver:
    def solution(self, value):
        return type(value)
""", {"value": [1, 2, 3]}, ["value"])
    assert result["status"] == "trace_ready"
    assert result["returnValue"] == "list"


def test_problem_solver_trace_has_named_inputs_and_expression_frames():
    result = run("""class ProblemSolver:
    def solution(self, a, b):
        nums = [a, b]
        return len(nums) + nums[0]
""")
    assert result["status"] == "trace_ready"
    assert result["frames"][0]["locals"] == {"a": 2, "b": 3}
    values = [frame["source"] for frame in result["frames"] if frame["kind"] == "value"]
    assert "len(nums)" in values and "nums[0]" in values


def test_contract_and_attribute_access_fail_before_execution():
    bad_signature = run("""class ProblemSolver:
    def solution(self, b, a):
        return a + b
""")
    assert bad_signature["status"] == "syntax" and bad_signature["error"]["line"] == 2
    assert run("""class ProblemSolver:
    def solution(self, a, b):
        return a.real
""")["status"] == "syntax"
    assert run("""class ProblemSolver:
    def solution(self, a, b):
        _lab_control = 1
        return a + b
""")["status"] == "syntax"
    assert run("""class ProblemSolver:
    def __init__(self):
        pass
    def solution(self, a, b):
        return a + b
""")["status"] == "syntax"


@pytest.mark.parametrize(
    "signature",
    [
        "self, a: (1).bit_length(), b",
        "self, a: (1).bit_length(), /, b",
        "self, a, b, *rest: (1).bit_length()",
        "self, a, b, *, extra: (1).bit_length()",
        "self, a, b, **options: (1).bit_length()",
        "self, a, b) -> (1).bit_length(",
    ],
)
def test_annotations_are_rejected_across_the_complete_signature_surface(signature):
    result = run(f"""class ProblemSolver:
    def solution({signature}):
        return a + b
""")
    assert result["status"] == "syntax"
    assert result["error"]["message"] == "solution annotations are not allowed"
    assert result["error"]["line"] == 2


@pytest.mark.parametrize(
    ("signature", "params", "names"),
    [
        ("self, _lab_input, b", {"_lab_input": 2, "b": 3}, ["_lab_input", "b"]),
        ("self, _lab_input, /, a, b", {"a": 2, "b": 3}, ["a", "b"]),
        ("self, a, b, *_lab_rest", {"a": 2, "b": 3}, ["a", "b"]),
        ("self, a, b, *, _lab_extra", {"a": 2, "b": 3}, ["a", "b"]),
        ("self, a, b, **_lab_options", {"a": 2, "b": 3}, ["a", "b"]),
    ],
)
def test_reserved_helper_names_are_rejected_in_parameter_names_and_every_ast_arg_surface(
    signature, params, names
):
    result = run(
        f"""class ProblemSolver:
    def solution({signature}):
        return 0
""",
        params,
        names,
    )
    assert result["status"] == "syntax"
    assert result["error"]["message"] == (
        "parameterNames must be unique Python identifiers matching params"
        if any(name.startswith("_lab_") for name in names)
        else "reserved names are not allowed"
    )


def test_f_string_and_bool_short_circuit_preserve_semantics():
    f_string = solution('return f"{a + b}"')
    assert f_string["status"] == "trace_ready" and f_string["returnValue"] == "5"
    short_circuit = solution("return False and (1 / 0)")
    assert short_circuit["status"] == "trace_ready" and short_circuit["returnValue"] is False


def test_expression_coverage_gate():
    validator_expressions = {
        name for name in ALLOWED_NODES
        if isinstance(getattr(ast, name, None), type) and issubclass(getattr(ast, name), ast.expr)
    }
    assert EXCLUDED_EXPRESSION_TYPES == REQUIRED_EXPRESSION_EXCLUSIONS == {"Name", "Constant", "Starred"}
    assert ALLOWED_EXPRESSION_TYPES == validator_expressions
    assert validator_expressions - REQUIRED_EXPRESSION_EXCLUSIONS == INSTRUMENTED_EXPRESSION_TYPES


def test_store_targets_and_comprehension_target_are_explicitly_not_evaluated():
    result = solution("nums = [value + 1 for value in [a, b]]\n        return sum(nums)")
    assert result["status"] == "trace_ready"
    values = [frame["source"] for frame in result["frames"] if frame["kind"] == "value"]
    assert "[value + 1 for value in [a, b]]" in values
    assert all(value != "value" for value in values)


# ── the player-facing frame contract ────────────────────────────────────────
def test_every_frame_is_located_named_and_carries_no_parser_vocabulary():
    """R-21 #3 and #14, as a code property rather than a human judgement.

    No frame may name the class that produced it, and every frame must offer the
    same three things — the player's own source, its exact range, and the values
    involved — so a construct nobody wrote a rule for is indistinguishable from
    one that was.
    """
    result = run(ADD_STARTER)
    assert result["status"] == "trace_ready"
    parser_words = {name for name in ALLOWED_NODES if name[:1].isupper()} | {"node_type", "col_offset", "end_lineno"}
    for frame in result["frames"]:
        assert frame["kind"] in FRAME_KINDS, frame
        assert isinstance(frame["source"], str) and frame["source"], frame
        assert set(frame["location"]) == {"lineno", "col_offset", "end_lineno", "end_col_offset"}, frame
        assert frame["source"] in ADD_STARTER, "a label is composed from the player's own source, never invented"
        assert not (parser_words & set(frame) | parser_words & set(frame.get("detail", {}))), frame


def test_block_frames_point_at_the_header_the_player_reads_not_the_whole_suite():
    result = run(ADD_STARTER)
    headers = {frame["source"] for frame in result["frames"] if frame["kind"] in {"block_enter", "repetition", "decision"}}
    assert "for value in nums" in headers
    assert "if value > 0" in headers
    assert "while index < len(nums) and nums[index] >= 0" in headers
    assert all("\n" not in header for header in headers), "a block's own frames never quote its body"


def test_bindings_are_located_at_their_own_statement():
    """The pre-existing `line` frames reported a binding one statement late.

    `index = 0` produced no frame of its own at all, and the change to `index`
    surfaced against the `while` header two lines below it.
    """
    result = run(ADD_STARTER)
    bindings = {frame["source"]: frame for frame in result["frames"] if frame["kind"] == "binding"}
    assert bindings["index = 0"]["location"]["lineno"] == 9
    assert bindings["index = 0"]["detail"]["bindings"] == {"index": 0}
    assert bindings["nums = [a, b]"]["detail"]["bindings"] == {"nums": [2, 3]}
    assert "index" in bindings["index = 0"]["changed"]


def test_the_add_starter_replays_the_whole_program_within_a_bounded_budget():
    result = run(ADD_STARTER, max_events=1200)
    assert result["status"] == "trace_ready" and result["returnValue"] == 5
    assert len(result["frames"]) < 100, "the shipped starter must stay small enough to read"
    values = {frame["source"] for frame in result["frames"] if frame["kind"] == "value"}
    assert {"[a, b]", "total + value", "a + b", "total == a + b or len(nums) == 0", "len(nums)", "nums[index]"} <= values
    assert "len(nums) == 0" not in values, "the right side of the true or must be short-circuited"
    repeats = [
        (frame["detail"]["iteration"], frame["detail"]["bindings"]["value"])
        for frame in result["frames"]
        if frame["kind"] == "repetition" and frame["source"] == "for value in nums"
    ]
    assert repeats == [(1, 2), (2, 3)]
    decisions = [
        frame["detail"]["outcome"]
        for frame in result["frames"]
        if frame["kind"] == "decision" and frame["source"].startswith("while")
    ]
    assert decisions == [True, True, False]
    assert result["frames"][-1]["kind"] == "result" and result["frames"][-1]["value"] == 5
    assert result["frames"][-1]["source"] == "return total"


def test_dropping_line_frames_lost_no_statement():
    """R-21's "nothing vanishes": every statement still reports itself."""
    result = solution("for v in [a, b]:\n            break\n        return v")
    assert kinds(result) == ["block_enter", "value", "repetition", "step", "block_exit", "result"]
    assert [frame["source"] for frame in result["frames"] if frame["kind"] == "step"] == ["break"]
    for statement in ("pass", "continue"):
        body = f"for v in [a, b]:\n            {statement}\n        return v"
        assert statement in [frame["source"] for frame in solution(body)["frames"] if frame["kind"] == "step"]


def test_if_without_else_reports_that_no_branch_was_selected():
    result = solution("if a < 0:\n            return a\n        return b")
    decisions = [frame["detail"] for frame in result["frames"] if frame["kind"] == "decision"]
    assert decisions == [{"outcome": False, "taken": "none"}]


def test_if_with_else_names_the_branch_that_ran():
    result = solution("if a > b:\n            return a\n        else:\n            return b")
    decisions = [frame["detail"] for frame in result["frames"] if frame["kind"] == "decision"]
    assert decisions == [{"outcome": False, "taken": "alternative"}]


def test_for_destructuring_reports_structured_target_bindings():
    result = solution("for left, right in [(a, b)]:\n            return left + right")
    repetition = next(frame for frame in result["frames"] if frame["kind"] == "repetition")
    assert repetition["source"] == "for left, right in [(a, b)]"
    assert repetition["detail"]["bindings"] == {"left": 2, "right": 3}


def test_an_uncaught_error_lands_on_the_failing_step_and_is_never_reported_as_a_return():
    """CPython reports a `return` when a frame is left by an exception.

    Emitting that would tell the player their program returned nothing when it
    in fact broke, and would land the view on the wrong step.
    """
    result = solution("nums = [a]\n        return nums[9]")
    assert result["status"] == "runtime"
    assert "result" not in kinds(result)
    failing = result["frames"][-1]
    assert failing["kind"] == "unwind"
    assert failing["source"] == "return nums[9]"
    assert failing["detail"]["error"] == "list index out of range"
    assert failing["locals"] == {"a": 2, "b": 3, "nums": [2]}
    assert result["error"]["line"] == 4


def test_an_error_with_no_message_still_says_something():
    result = solution("assert a < 0\n        return a + b")
    assert result["status"] == "runtime"
    assert result["error"]["message"] == "AssertionError"
    assert result["frames"][-1]["detail"]["error"] == "AssertionError"


def test_a_caught_error_reports_the_handler_and_still_returns():
    result = solution("nums = [a]\n        try:\n            return nums[9]\n        except:\n            return -1")
    assert result["status"] == "trace_ready" and result["returnValue"] == -1
    unwound = next(frame for frame in result["frames"] if frame["kind"] == "unwind")
    assert unwound["source"] == "except:"
    assert kinds(result)[-1] == "result"


# ── "not hardcoded", as a property of the runner ────────────────────────────
def test_control_frames_are_derived_from_node_fields_not_from_a_construct_list():
    """The only parser class name the instrumenter knows is `While`.

    `ast.While._fields` and `ast.If._fields` are byte-identical, so reflection
    over a node's own shape cannot tell a loop from a branch. Every other block,
    decision, unwind site and binding is derived. This test fails the moment a
    fourth construct earns a name of its own.
    """
    roles = InstrumentExecution("")._roles
    assert roles(ast.parse("for x in y:\n    pass").body[0]) == frozenset({"block", "repeats"})
    assert roles(ast.parse("while x:\n    pass").body[0]) == frozenset({"block", "decision", "repeats"})
    assert roles(ast.parse("if x:\n    pass").body[0]) == frozenset({"block", "decision"})
    assert roles(ast.parse("with x:\n    pass").body[0]) == frozenset({"block"})
    assert roles(ast.parse("try:\n    pass\nexcept:\n    pass").body[0]) == frozenset({"block", "unwind"})
    assert roles(ast.parse("assert x").body[0]) == frozenset({"decision"})
    assert roles(ast.parse("x = 1").body[0]) == frozenset({"binding"})
    assert roles(ast.parse("x += 1").body[0]) == frozenset({"binding"})
    assert roles(ast.parse("break").body[0]) == frozenset({"step"})
    assert roles(ast.parse("def f():\n    pass").body[0]) == frozenset()
    assert CONTROL_KINDS == {"block_enter", "block_exit", "decision", "repetition", "binding", "unwind", "step"}


@pytest.mark.parametrize(
    ("body", "expected"),
    [
        ("d = {k: k + 1 for k in [a, b]}\n        return len(d)", 2),
        ("return len({k for k in [a, b]})", 2),
        ("assert a > 0\n        return a + b", 5),
        ("nums = [a, b]\n        return max(*nums)", 3),
        ("try:\n            return a + b\n        finally:\n            b = 0", 5),
        ("return a if a > b else b", 3),
        ("x, y = a, b\n        return x + y", 5),
    ],
)
def test_widened_constructs_execute_and_report_themselves(body, expected):
    result = solution(body)
    assert result["status"] == "trace_ready", result.get("error")
    assert result["returnValue"] == expected
    assert all(frame["source"] for frame in result["frames"])


def test_the_walrus_operator_is_rejected_rather_than_silently_miswired():
    """`:=` assigns into whichever scope evaluates it.

    Every instrumented expression and every test is evaluated inside a lambda,
    so admitting `NamedExpr` would bind the player's variable in the
    instrumentation's scope and leave their own name undefined at the next line.
    Rejecting it is the only option that never runs a program the player did not
    write; the fix — eager evaluation — would break `and`/`or` short-circuiting.
    """
    result = solution("if (c := a + b) > 0:\n            return c\n        return 0")
    assert result["status"] == "syntax"
    assert result["error"]["message"] == "NamedExpr is not allowed in Compute Lab"


@pytest.mark.parametrize("bound", ["_lab_eval", "_lab_event", "_lab_decision", "__builtins__"])
def test_an_except_clause_cannot_bind_over_the_instrumentation(bound):
    """Admitting `Try` opened a name-binding surface the old locks did not cover.

    `except X as name` binds a local from a plain `str` field, not a `Name` node,
    so `visit_Name`'s reserved-prefix check never sees it. A local binding shadows
    the module-level helpers the instrumentation calls, which would let player
    code stand where the tracer expects its own function.
    """
    result = solution(f"try:\n            return a + b\n        except _ as {bound}:\n            return 0")
    assert result["status"] == "syntax"
    assert result["error"]["message"] == "reserved names are not allowed"


def test_with_parses_and_traces_even_though_no_legal_program_can_use_it_yet():
    """Scope note, not an oversight: `with` is admitted as syntax here.

    Nothing the sandbox exposes returns a context manager, so entering one still
    fails at runtime — what this proves is that the block reports itself with no
    `visit_With` anywhere, which is the whole point of deriving blocks.
    """
    result = solution("with a:\n            return b")
    assert result["status"] == "runtime"
    assert [frame["kind"] for frame in result["frames"]] == ["block_enter", "unwind"]
    assert result["frames"][0]["source"] == "with a"


def test_synthesised_metadata_never_steals_the_first_line():
    """Literals built by re-parsing `repr(...)` are born at line 1 and keep it.

    CPython then attributes that bytecode to line 1, so the player's highlight
    jumped to `class ProblemSolver:` and every statement reported an extra step.
    """
    tree = ast.parse(ADD_STARTER)
    instrumented = InstrumentExecution(ADD_STARTER).visit(tree)
    ast.fix_missing_locations(instrumented)
    stamped = [
        node for node in ast.walk(instrumented)
        if getattr(node, "lineno", None) == 1 and not isinstance(node, (ast.Module, ast.ClassDef))
    ]
    assert stamped == []


def test_the_event_budget_buys_observation_rather_than_round_trips():
    """The cap is 1,200 sequential HTTP posts, so frames per step is the lever."""
    loop = "total = 0\n        for i in range(%d):\n            total = total + i\n        return total"
    assert len(run(f"class ProblemSolver:\n    def solution(self, a, b):\n        {loop % 100}\n",
                   max_events=1200)["frames"]) < 400
    deep = run(f"class ProblemSolver:\n    def solution(self, a, b):\n        {loop % 10000}\n", max_events=1200)
    assert deep["status"] == "limit"
    observed = max(frame["detail"]["iteration"] for frame in deep["frames"] if frame["kind"] == "repetition")
    assert observed > 350, f"only {observed} iterations reached inside the cap"


def test_the_runner_streams_frames_as_they_happen():
    """A run killed on the wall clock keeps everything already reported."""
    streamed = []
    result = execute(
        {"source": ADD_STARTER, "params": {"a": 2, "b": 3}, "parameterNames": ["a", "b"], "limits": {"maxEvents": 1200}},
        on_frame=streamed.append,
    )
    assert streamed == result["frames"]
