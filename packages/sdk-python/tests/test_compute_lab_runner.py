from netcrawl.compute_lab_runner import execute


def test_type_builtin_is_allowed_for_typeof_puzzle_solution():
    result = execute({
        "source": "def solve(params):\n    return type(params['value'])\n",
        "params": {"value": [1, 2, 3]},
    })

    assert result["status"] == "trace_ready"
    assert result["returnValue"] == "list"


def test_non_whitelisted_builtin_is_rejected_during_validation():
    result = execute({
        "source": "def solve(params):\n    return print(params)\n",
        "params": {},
    })

    assert result["status"] == "syntax"
    assert result["error"]["message"] == "only safe built-in functions are allowed"


def test_attribute_access_remains_rejected():
    result = execute({
        "source": "def solve(params):\n    return type(params['value']).__name__\n",
        "params": {"value": 42},
    })

    assert result["status"] == "syntax"
    assert result["error"]["message"] == "attribute access is not allowed"
