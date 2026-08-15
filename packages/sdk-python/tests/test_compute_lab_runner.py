import ast

from netcrawl.compute_lab_runner import (
    ALLOWED_EXPRESSION_TYPES,
    ALLOWED_NODES,
    EXCLUDED_EXPRESSION_TYPES,
    INSTRUMENTED_EXPRESSION_TYPES,
    REQUIRED_EXPRESSION_EXCLUSIONS,
    execute,
)


def run(source, params={"a": 2, "b": 3}, names=["a", "b"], max_events=300):
    return execute({"source": source, "params": params, "parameterNames": names, "limits": {"maxEvents": max_events}})


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
    expressions = [frame["expression"]["source"] for frame in result["frames"] if frame["phase"] == "eval"]
    assert "len(nums)" in expressions and "nums[0]" in expressions


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


def test_f_string_and_bool_short_circuit_preserve_semantics():
    f_string = run("""class ProblemSolver:
    def solution(self, a, b):
        return f"{a + b}"
""")
    assert f_string["status"] == "trace_ready" and f_string["returnValue"] == "5"
    short_circuit = run("""class ProblemSolver:
    def solution(self, a, b):
        return False and (1 / 0)
""")
    assert short_circuit["status"] == "trace_ready" and short_circuit["returnValue"] is False


def test_expression_coverage_gate():
    validator_expressions = {
        name for name in ALLOWED_NODES
        if isinstance(getattr(ast, name, None), type) and issubclass(getattr(ast, name), ast.expr)
    }
    assert EXCLUDED_EXPRESSION_TYPES == REQUIRED_EXPRESSION_EXCLUSIONS == {"Name", "Constant"}
    assert ALLOWED_EXPRESSION_TYPES == validator_expressions
    assert validator_expressions - REQUIRED_EXPRESSION_EXCLUSIONS == INSTRUMENTED_EXPRESSION_TYPES


def test_store_targets_and_comprehension_target_are_explicitly_not_evaluated():
    result = run("""class ProblemSolver:
    def solution(self, a, b):
        nums = [value + 1 for value in [a, b]]
        return sum(nums)
""")
    assert result["status"] == "trace_ready"
    expressions = [frame["expression"] for frame in result["frames"] if frame["phase"] == "eval"]
    assert any(expression["node_type"] == "ListComp" for expression in expressions)
    assert all(expression["source"] != "value" for expression in expressions)


def test_add_starter_source_emits_replayable_expression_and_control_contract():
    source = """class ProblemSolver:
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
    result = run(source)
    assert result["status"] == "trace_ready" and result["returnValue"] == 5
    assert len(result["frames"]) < 1200
    eval_frames = [frame for frame in result["frames"] if frame["phase"] == "eval"]
    control_frames = [frame for frame in result["frames"] if frame["phase"] == "control"]
    by_source = {frame["expression"]["source"] for frame in eval_frames}
    assert {"[a, b]", "total + value", "a + b", "total == a + b or len(nums) == 0", "len(nums)", "nums[index]"} <= by_source
    assert "len(nums) == 0" not in by_source, "the right side of the true or must be short-circuited"
    assert all(set(frame["expression"]["location"]) == {"lineno", "col_offset", "end_lineno", "end_col_offset"} for frame in eval_frames)
    assert all(frame["expression"]["node_type"] for frame in eval_frames)
    assert any(frame.get("changed") == ["total"] for frame in result["frames"])
    assert [(frame["control"]["iteration"], frame["locals"]["value"]) for frame in control_frames if frame["control"]["node_type"] == "For" and frame["control"]["event"] == "iteration"] == [(1, 2), (2, 3)]
    while_controls = [frame["control"] for frame in control_frames if frame["control"]["node_type"] == "While"]
    assert [control.get("test") for control in while_controls if control["event"] == "test"] == [True, True, False]
    assert while_controls[-1]["event"] == "exit"
    final_left = max(i for i, frame in enumerate(eval_frames) if frame["expression"]["source"] == "index < len(nums)" and frame["expression"]["value"] is False)
    next_bool = next(i for i in range(final_left + 1, len(eval_frames)) if eval_frames[i]["expression"]["node_type"] == "BoolOp")
    assert all(frame["expression"]["source"] != "nums[index]" for frame in eval_frames[final_left + 1:next_bool])
    assert result["frames"][-1]["phase"] == "return" and result["frames"][-1]["value"] == 5


def test_for_exit_is_emitted_after_break():
    result = run("""class ProblemSolver:
    def solution(self, a, b):
        for value in [a, b]:
            break
        return value
""")
    controls = [frame["control"] for frame in result["frames"] if frame["phase"] == "control"]
    assert [control["event"] for control in controls] == ["enter", "iteration", "exit"]
