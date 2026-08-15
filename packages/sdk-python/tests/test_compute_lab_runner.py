from netcrawl.compute_lab_runner import execute


def run(source, params={"a": 2, "b": 3}, names=["a", "b"], max_events=300):
    return execute({"source": source, "params": params, "parameterNames": names, "limits": {"maxEvents": max_events}})


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
