import ast
import builtins
import sys
import typing

import pytest

from netcrawl.compute_lab_runner import (
    ALLOWED_EXCEPTIONS,
    ALLOWED_EXPRESSION_TYPES,
    ALLOWED_NODES,
    CONTROL_KINDS,
    EXCLUDED_EXPRESSION_TYPES,
    FRAME_KINDS,
    INSTRUMENTED_EXPRESSION_TYPES,
    REQUIRED_EXPRESSION_EXCLUSIONS,
    SCALAR_FIELDS,
    WALKED_FIELDS,
    InstrumentExecution,
    TraceLimit,
    ValidationError,
    Validator,
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


def _divided_by_zero() -> str:
    """What this interpreter calls `x // 0`, read rather than hardcoded.

    CPython 3.14 reworded it to match `/`; 3.12 and 3.13 say "integer division or
    modulo by zero". The tests using this are about which frames carry the error
    and where they sit, not about how CPython words it — and pinning the 3.14
    wording is exactly what made this suite green on a developer's interpreter
    and red on the one `uv` picks in CI. `requires-python` is `>=3.10` with no
    upper bound, so "the version that runs this" is not a fixed thing.
    """
    try:
        1 // 0
    except ZeroDivisionError as exc:
        return str(exc)
    raise AssertionError("1 // 0 must raise ZeroDivisionError")


DIVIDED_BY_ZERO = _divided_by_zero()


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
    """R-21's "nothing vanishes": every statement still reports itself.

    The leading `block_enter` is `def solution(self, a, b):` — a call is entered
    like any other block, and the outermost call is not a special case.
    """
    result = solution("for v in [a, b]:\n            break\n        return v")
    assert kinds(result) == ["block_enter", "block_enter", "value", "repetition", "step", "block_exit", "result"]
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
    result = solution("nums = [a]\n        try:\n            return nums[9]\n        except IndexError:\n            return -1")
    assert result["status"] == "trace_ready" and result["returnValue"] == -1
    unwound = next(frame for frame in result["frames"] if frame["kind"] == "unwind")
    assert unwound["source"] == "except IndexError"
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

    Stage 3 added this tightening against a surface nothing could reach, because
    no exception class resolved. It is reachable now, so the clause names a real
    class: the point is that the rule holds where it can actually be exercised,
    not that an unresolvable type happens to be rejected first.
    """
    result = solution(f"try:\n            return a + b\n        except Exception as {bound}:\n            return 0")
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
    assert kinds(result) == ["block_enter", "block_enter", "unwind"]
    assert result["frames"][0]["source"] == "def solution(self, a, b):"
    assert result["frames"][1]["source"] == "with a"


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


# ── methods and recursion, inside the locks (R-21 #11 and #12) ──────────────
def test_a_helper_call_reads_as_going_in_and_coming_back_out():
    """R-21 #11: never an unexplained jump to another part of the file."""
    result = solution("def double(x):\n            return x * 2\n        return double(a) + double(b)")
    assert result["status"] == "trace_ready" and result["returnValue"] == 10
    story = [(frame["kind"], frame["source"]) for frame in result["frames"]]
    assert story[0] == ("block_enter", "def solution(self, a, b):"), "the outermost call is not a special case"
    assert ("block_enter", "def double(x):") in story, "going in is a step the player can see"
    assert ("result", "return x * 2") in story, "and so is coming back out"
    assert story[-1] == ("result", "return double(a) + double(b)")
    entered = next(frame for frame in result["frames"] if frame["source"] == "def double(x):")
    assert entered["detail"] if "detail" in entered else True
    assert entered["locals"] == {"x": 2} and entered["changed"] == ["x"], "entering shows what it was called with"


def test_locals_belong_to_the_call_they_came_from():
    """A shared `previous` reported every local of the caller as freshly changed."""
    result = solution("def double(x):\n            return x * 2\n        total = double(a)\n        return total + b")
    returned = [frame for frame in result["frames"] if frame["kind"] == "value" and frame["source"] == "double(a)"]
    assert returned[0]["locals"] == {"a": 2, "b": 3}, "back in solution, holding solution's variables"
    assert returned[0]["changed"] == [], "coming back is not a change to anything"


def test_recursion_collapses_to_one_stack_entry_with_its_count():
    """R-21 #12: the repeated middle is collapsed and counted, never a wall."""
    result = run("""class ProblemSolver:
    def solution(self, a, b):
        def down(n):
            if n <= 0:
                return 0
            return down(n - 1) + 1
        return down(a + b)
""", max_events=1200)
    assert result["status"] == "trace_ready" and result["returnValue"] == 5
    stacks = [frame["stack"] for frame in result["frames"] if "stack" in frame]
    assert all(len(stack) <= 8 for stack in stacks), "a deep stack is summarised, not printed"
    assert all(stack[0]["source"] == "def solution(self, a, b):" for stack in stacks), "the outermost stays visible"
    assert max(entry.get("count", 1) for stack in stacks for entry in stack) == 6, "down(5)..down(0)"
    assert all(entry["source"] == "def down(n):" for stack in stacks for entry in stack[1:])


def test_mutual_recursion_hides_the_middle_and_says_how_much_it_hid():
    result = run("""class ProblemSolver:
    def solution(self, a, b):
        def ping(n):
            if n <= 0:
                return 0
            return pong(n - 1)
        def pong(n):
            if n <= 0:
                return 0
            return ping(n - 1)
        return ping(a * 10)
""", max_events=1200)
    assert result["status"] == "trace_ready"
    stacks = [frame["stack"] for frame in result["frames"] if "stack" in frame]
    assert all(len(stack) <= 8 for stack in stacks), "alternating names never collapse, so the cap is what bounds them"
    assert all("source" in stack[0] and "source" in stack[-1] for stack in stacks), "outermost and innermost both visible"
    # 22 live calls at the deepest point; 7 of them are shown, so 15 are counted.
    assert max(entry["hidden"] for stack in stacks for entry in stack if "hidden" in entry) == 15


def test_a_program_that_never_calls_its_own_helper_carries_no_stack():
    result = run(ADD_STARTER)
    assert all("stack" not in frame for frame in result["frames"])


def test_an_error_inside_a_helper_reports_every_frame_it_left():
    result = solution("def boom(x):\n            return x // 0\n        return boom(a)")
    assert result["status"] == "runtime"
    unwound = [frame for frame in result["frames"] if frame["kind"] == "unwind"]
    assert [frame["source"] for frame in unwound] == ["return x // 0", "return boom(a)"]
    assert all(frame["detail"]["error"] == DIVIDED_BY_ZERO for frame in unwound)
    assert "result" not in kinds(result), "a program that broke never reports a return"


# ── the sandbox locks: what a player can now reach, and what they still cannot ──
@pytest.mark.parametrize(
    "rebinding",
    [
        "helper = type",
        "for helper in [a]:\n            pass",
        "helper, other = a, b",
        "helper += 1",
        "nums = [helper for helper in [a]]",
        "with a as helper:\n            pass",
        "try:\n            pass\n        except Exception as helper:\n            pass",
    ],
)
def test_a_helper_name_can_never_be_bound_to_anything_else(rebinding):
    """The whole reason relaxing `visit_Call` adds no reachable value.

    A call through a helper name calls a function this Validator already walked —
    never a value the player computed — because the name is bound exactly once,
    by the `def`. Admitting `helper = <anything>` would hand a player
    `<anything>(...)`, which is precisely what the callee lock exists to refuse.
    """
    result = solution(f"def helper(x):\n            return x\n        {rebinding}\n        return helper(a)")
    assert result["status"] == "syntax"
    assert result["error"]["message"] == "helper is a helper function and cannot be reassigned"


@pytest.mark.parametrize(
    ("callee", "message"),
    [
        ("a.bit_length()", "only built-in functions and your own def helpers can be called"),
        ("[helper][0]()", "only built-in functions and your own def helpers can be called"),
        ("type([])()", "only built-in functions and your own def helpers can be called"),
        ("helper(a)(a)", "only built-in functions and your own def helpers can be called"),
    ],
)
def test_the_callee_lock_still_refuses_everything_that_is_not_a_bare_known_name(callee, message):
    result = solution(f"def helper(x):\n            return x\n        return {callee}")
    assert result["status"] == "syntax"
    assert result["error"]["message"] == message


@pytest.mark.parametrize("name", ["_lab_eval", "_lab_event", "_lab_decision", "__builtins__", "solution"])
def test_a_def_cannot_bind_over_the_instrumentation(name):
    """A `def` name is a plain `str` field, exactly like `except X as name`.

    `visit_Name`'s reserved-prefix check never sees it, so `def _lab_eval(...)`
    would bind a local that shadows the helper the rewritten statements around it
    call — the player's function standing where the tracer expects its own.
    """
    result = solution(f"def {name}(x):\n            return x\n        return a")
    assert result["status"] == "syntax"
    assert result["error"]["message"] == "reserved names are not allowed"


@pytest.mark.parametrize(
    ("signature", "message"),
    [
        ("def len(x)", "a helper function cannot be named after the built-in len"),
        ("def helper(x=1)", "def helper must take plain positional parameters, with no defaults, *args or **kwargs"),
        ("def helper(*x)", "def helper must take plain positional parameters, with no defaults, *args or **kwargs"),
        ("def helper(x: (1).bit_length())", "def helper annotations are not allowed"),
    ],
)
def test_a_helper_signature_stays_as_narrow_as_solutions(signature, message):
    result = solution(f"{signature}:\n            return 1\n        return a")
    assert result["status"] == "syntax" and result["error"]["message"] == message


def test_a_class_cannot_be_defined_inside_solution():
    """A nested class binds its name the way a `def` does, and could shadow one."""
    result = solution("class helper:\n            def solution(self, x):\n                return x\n        return a")
    assert result["status"] == "syntax"
    assert result["error"]["message"] == "a class cannot be defined inside solution"


@pytest.mark.parametrize("bound", ["_lab_eval", "__builtins__"])
def test_a_parameter_cannot_bind_over_the_instrumentation(bound):
    result = solution(f"def helper({bound}):\n            return 1\n        return helper(a)")
    assert result["status"] == "syntax"
    assert result["error"]["message"] == "reserved names are not allowed"


def test_an_error_caught_inside_a_finally_is_still_a_caught_error():
    """`release_lines` stops a `finally` from reading as recovery.

    Applied alone it would also stop a handler *inside* that `finally` from
    reading as recovery, and the release would then claim an error broke out of a
    block that in fact handled it. Reaching a handler is the precise signal, so
    the handler clears the error itself.
    """
    result = solution(
        "nums = [a]\n        try:\n            b = 1\n        finally:\n"
        "            try:\n                b = nums[9]\n            except IndexError:\n                b = -1\n"
        "        return b"
    )
    assert result["status"] == "trace_ready" and result["returnValue"] == -1
    closing = [frame for frame in result["frames"] if frame["kind"] == "block_exit"]
    assert all("detail" not in frame for frame in closing), "nothing broke out of either block"
    assert kinds(result)[-1] == "result"


def test_a_handled_error_does_not_make_the_release_look_like_a_break():
    result = solution(
        "total = 0\n        try:\n            total = a // 0\n        except ZeroDivisionError:\n"
        "            total = -1\n        finally:\n            b = 0\n        return total"
    )
    assert result["status"] == "trace_ready" and result["returnValue"] == -1
    closing = next(frame for frame in result["frames"] if frame["kind"] == "block_exit")
    assert "detail" not in closing, "the error was handled, so nothing broke out of the block"


def test_a_helper_defined_in_another_helper_is_not_visible_outside_it():
    result = solution("def outer(x):\n            def inner(y):\n                return y\n            return inner(x)\n        return inner(a)")
    assert result["status"] == "syntax"
    assert result["error"]["message"] == "only built-in functions and your own def helpers can be called"


def test_multi_method_via_self_stays_rejected():
    """Route (B) is rejected permanently: attribute callees are the second lock."""
    result = run("""class ProblemSolver:
    def solution(self, a, b):
        return self.helper(a)
    def helper(self, x):
        return x
""")
    assert result["status"] == "syntax"
    assert result["error"]["message"] == "ProblemSolver must contain exactly one solution method"


# ── catchable errors (R-21 #9, re-pointed from `with` to try/except/finally) ──
def test_the_errors_a_player_can_catch_are_the_ones_the_sandbox_can_raise():
    caught = solution("nums = [a]\n        try:\n            return nums[9]\n        except IndexError as e:\n            return len(str(e))")
    assert caught["status"] == "trace_ready" and caught["returnValue"] == 23
    tupled = solution("try:\n            return a // 0\n        except (ZeroDivisionError, KeyError):\n            return -1")
    assert tupled["status"] == "trace_ready" and tupled["returnValue"] == -1


def test_a_bound_error_is_readable_rather_than_reported_as_not_json():
    result = solution("nums = [a]\n        try:\n            return nums[9]\n        except IndexError as e:\n            return 0")
    handled = next(frame for frame in result["frames"] if frame["kind"] == "unwind" and "e" in frame["locals"])
    assert handled["locals"]["e"] == "IndexError: list index out of range"


@pytest.mark.parametrize(
    ("clause", "message"),
    [
        ("except:", "name the error you are catching, for example: except ZeroDivisionError:"),
        ("except BaseException:", "only these errors can be caught: Exception, IndexError, KeyError, TypeError, ValueError, ZeroDivisionError"),
        ("except SystemExit:", "only these errors can be caught: Exception, IndexError, KeyError, TypeError, ValueError, ZeroDivisionError"),
        ("except (ValueError, OSError):", "only these errors can be caught: Exception, IndexError, KeyError, TypeError, ValueError, ZeroDivisionError"),
    ],
)
def test_only_named_errors_from_the_allowlist_can_be_caught(clause, message):
    result = solution(f"try:\n            return a\n        {clause}\n            return 0")
    assert result["status"] == "syntax" and result["error"]["message"] == message


def test_the_event_cap_is_not_something_player_code_can_catch():
    """Two halves, and both are load-bearing.

    `TraceLimit` is not an `Exception`, and every handler must name a class from
    `ALLOWED_EXCEPTIONS` — all of which are `Exception` subclasses. Relax either
    and a loop can swallow the cap and spin until the wall clock kills it, which
    reaches the player as a timeout instead of an honest "we stopped watching".
    """
    assert not issubclass(TraceLimit, Exception)
    assert all(issubclass(getattr(builtins, name), Exception) for name in ALLOWED_EXCEPTIONS)
    swallowing = solution("total = 0\n        while a > 0:\n            try:\n                total = total + 1\n            except Exception:\n                total = total\n        return total", max_events=200)
    assert swallowing["status"] == "limit" and len(swallowing["frames"]) == 200


def test_finally_releases_visibly_on_both_paths_and_in_the_same_position():
    """R-21 #9 as R-25 re-pointed it: the difference is what the block says it did.

    Both facts adjacent on one card — the thing that broke and the release that
    happened anyway — and the exit in the position it would occupy on a normal
    exit, so the two runs compare side by side.
    """
    body = "total = 0\n        try:\n            total = a %s 0\n        finally:\n            b = 0\n        return total"
    finished = solution(body % "+")
    broke = solution(body % "//")
    assert finished["status"] == "trace_ready" and broke["status"] == "runtime"
    closing = [next(index for index, frame in enumerate(result["frames"]) if frame["kind"] == "block_exit")
               for result in (finished, broke)]
    # Same position relative to the block: last thing the `finally` did, then the
    # release — not "after the statement", which only ever happens when nothing
    # went wrong, and not a different place on the failing path.
    for index, result in zip(closing, (finished, broke)):
        assert result["frames"][index]["source"] == "try:"
        assert result["frames"][index - 1]["source"] == "b = 0"
    assert "detail" not in finished["frames"][closing[0]]
    assert broke["frames"][closing[1]]["detail"] == {"error": DIVIDED_BY_ZERO}
    assert kinds(broke)[-1] == "unwind", "a run a `finally` cleaned up after still broke"
    assert broke["frames"][-1]["source"] == "total = a // 0", "and it broke where it broke"
    assert broke["error"]["line"] == finished["frames"][3]["location"]["lineno"]


def test_the_event_cap_survives_a_finally_that_swallows_it():
    """Why `finally: continue` cannot spin forever, stated instead of assumed.

    `continue` inside a `finally` discards whatever exception is propagating, so
    a `try` in a loop body can swallow the cap once. It cannot swallow it twice:
    the loop's `repetition` event is inserted at `body[0]`, which is loop-body
    level and therefore outside every `try` the player wrote *in* that body — a
    player's `try` is itself an element of `body`. The next iteration raises
    `TraceLimit` before re-entering the `try`, and nothing catches it there.

    This is the property Stage 4 replaced the previous unstated one with, so it
    is pinned rather than left to be re-derived by whoever moves this insert.
    """
    source = (
        "class ProblemSolver:\n    def solution(self, a, b):\n"
        "        total = 0\n        while a > 0:\n            try:\n"
        "                total = total + 1\n            finally:\n                continue\n"
        "        return total\n"
    )
    instrumented = InstrumentExecution(source).visit(ast.parse(source))
    loop = next(node for node in ast.walk(instrumented) if isinstance(node, ast.While))
    opening = loop.body[0]
    assert isinstance(opening, ast.Expr) and opening.value.func.id == "_lab_event"
    assert opening.value.args[1].value == "repetition"
    guarded = [node for node in ast.walk(loop) if isinstance(node, ast.Try)]
    assert guarded, "the loop body does contain a try, so the swallow is reachable"
    assert all(opening not in ast.walk(node) for node in guarded), "and the repetition event is outside every one"

    swallowing = run(source, max_events=200)
    assert swallowing["status"] == "limit" and len(swallowing["frames"]) == 200


# ── fields nobody named: the class the `type_params` hole belongs to ────────
@pytest.mark.skipif(sys.version_info < (3, 12), reason="PEP 695 is a SyntaxError before 3.12, so the parser refuses it first")
@pytest.mark.parametrize(
    "header",
    [
        "def second[T](x)",
        "def second[*Ts](x)",
        "def second[**P](x)",
        "def second[helper](x)",
        "def second[_lab_eval](x)",
        "def second[T: type([]).__base__.__subclasses__()](x)",
    ],
)
def test_a_type_parameter_list_is_refused_wherever_it_can_be_written(header):
    """A fourth `str`-field binder, and an entire subtree the Validator never saw.

    `visit_FunctionDef` and `visit_ClassDef` hand-pick the fields they walk and
    never walked `type_params`, so on every CPython >= 3.12 nothing inside a type
    parameter list was checked against `ALLOWED_NODES`, `visit_Attribute` or
    `visit_Call`. `def second[helper](x)` rebinds an approved helper name to a
    `TypeVar` — the never-rebound rule the callee lock rests on, disproven — and
    `def second[_lab_eval](x)` is the instrumentation shadow again, from a field
    with no `Name` node in it.
    """
    result = solution(f"def helper(x):\n            return x\n        {header}:\n            return 1\n        return a")
    assert result["status"] == "syntax"
    assert result["error"]["message"] == "type parameters like [T] are not allowed"


@pytest.mark.skipif(sys.version_info < (3, 12), reason="PEP 695 is a SyntaxError before 3.12, so the parser refuses it first")
@pytest.mark.parametrize(
    "source",
    [
        "class ProblemSolver[T]:\n    def solution(self, a, b):\n        return a\n",
        "class ProblemSolver:\n    def solution[T](self, a, b):\n        return a\n",
    ],
)
def test_a_type_parameter_list_is_refused_on_the_class_and_on_solution_itself(source):
    result = run(source)
    assert result["status"] == "syntax"
    assert result["error"]["message"] == "type parameters like [T] are not allowed"


def test_a_field_the_hand_rolled_visitors_do_not_read_is_refused_not_skipped():
    """The finding, not the instance: an enumerating visitor fails *open*.

    `type_params` got in because `visit_FunctionDef` walks `node.body` and
    nothing else. Any future field arrives the same way, so the check is on the
    shape of the node rather than on the name of the field — here a subtree
    CPython does not have, to prove it is not `type_params` that is special.
    """
    tree = ast.parse(ADD_STARTER)
    method = tree.body[0].body[0]
    method._fields = (*method._fields, "surprise")
    method.surprise = [ast.Pass()]
    with pytest.raises(ValidationError) as refused:
        Validator(["a", "b"]).visit(tree)
    assert str(refused.value) == "surprise is not allowed in Compute Lab"


def test_a_scalar_field_nobody_accounted_for_is_refused_on_any_node():
    """The same closure for the nodes `generic_visit` does walk.

    A walked field is re-checked against `ALLOWED_NODES` by construction; a field
    that is not a node is invisible to that walk, and every binder that has
    escaped this Validator — `except X as name`, a `def` name, a parameter, a
    type parameter — was exactly that.
    """
    tree = ast.parse(ADD_STARTER)
    loop = next(node for node in ast.walk(tree) if isinstance(node, ast.For))
    loop._fields = (*loop._fields, "surprise")
    loop.surprise = "helper"
    with pytest.raises(ValidationError) as refused:
        Validator(["a", "b"]).visit(tree)
    assert str(refused.value) == "surprise is not allowed in Compute Lab"


# Fields that exist on an allowed node and are refused on purpose rather than
# read. `type_params` is the hole this revision closes; `type_comment` and
# `type_ignores` are never populated by `ast.parse` as this module calls it, so
# refusing them costs nothing and removes two more places to hide.
REFUSED_ON_PURPOSE = frozenset({"type_params", "type_comment", "type_ignores"})


def test_the_hand_rolled_visitors_still_account_for_every_field_they_meet():
    """The canary for the next CPython, since the tables are hand-written.

    A field added to one of these five nodes is refused at validation time
    whatever it is — that is `_check_fields` and it needs no maintenance. What
    needs maintenance is the judgement of whether the new field should have been
    read instead, and this is where that question gets asked: it fails on the
    version bump rather than on a player's program.
    """
    for name, walked in WALKED_FIELDS.items():
        node_type = getattr(ast, name)
        unexplained = set(node_type._fields) - walked - REFUSED_ON_PURPOSE
        assert not unexplained, f"{name} grew {sorted(unexplained)} — read it or add it to REFUSED_ON_PURPOSE"


@pytest.mark.skipif(not hasattr(ast.Name, "_field_types"), reason="ast._field_types is 3.13+; the runtime check holds regardless")
def test_every_field_that_is_not_a_node_has_an_entry_and_every_entry_is_not_a_node():
    """`SCALAR_FIELDS` refuses in the safe direction, which is why it needs a test.

    A field this table omits is refused, so a miss cannot open the sandbox — it
    breaks a program the Lab means to accept, in a player's editor rather than in
    CI. And a field listed here that is *actually* made of nodes would be the
    opposite mistake: exempted from the check that walks it.
    """
    def made_of_nodes(annotation) -> bool:
        arguments = typing.get_args(annotation)
        if arguments:
            return any(made_of_nodes(argument) for argument in arguments)
        return isinstance(annotation, type) and typing.get_origin(annotation) is None and issubclass(annotation, ast.AST)

    for name in sorted(ALLOWED_NODES):
        node_type = getattr(ast, name, None)
        if node_type is None:
            continue  # a node this interpreter is too old to have
        accounted = SCALAR_FIELDS.get(name, frozenset()) | WALKED_FIELDS.get(name, frozenset()) | REFUSED_ON_PURPOSE
        for field, annotation in node_type._field_types.items():
            if made_of_nodes(annotation):
                assert field not in SCALAR_FIELDS.get(name, frozenset()), f"{name}.{field} is made of nodes and must be walked, not exempted"
                continue
            assert field in accounted, f"{name}.{field} is not a node and has no entry — programs using it would be refused"


def test_the_runner_streams_frames_as_they_happen():
    """A run killed on the wall clock keeps everything already reported."""
    streamed = []
    result = execute(
        {"source": ADD_STARTER, "params": {"a": 2, "b": 3}, "parameterNames": ["a", "b"], "limits": {"maxEvents": 1200}},
        on_frame=streamed.append,
    )
    assert streamed == result["frames"]
