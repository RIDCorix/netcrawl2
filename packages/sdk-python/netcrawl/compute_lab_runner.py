"""Restricted, trace-producing Python runner used by the focused Compute Lab."""

import ast
import builtins
import json
import sys
from typing import Any


class ValidationError(Exception):
    def __init__(self, message: str, line: int | None = None):
        super().__init__(message)
        self.line = line


ALLOWED_BUILTINS = {"abs", "all", "any", "bool", "dict", "enumerate", "float", "int", "len", "list", "max", "min", "range", "reversed", "round", "sorted", "str", "sum", "type"}
ALLOWED_NODES = {
    "Module", "FunctionDef", "arguments", "arg", "Return", "Assign", "AugAssign", "AnnAssign", "For", "While", "If", "IfExp", "Break", "Continue", "Pass",
    "Name", "Load", "Store", "Constant", "List", "Tuple", "Dict", "Set", "Subscript", "Slice", "BinOp", "UnaryOp", "BoolOp", "Compare", "Call", "keyword", "Attribute",
    "Add", "Sub", "Mult", "Div", "FloorDiv", "Mod", "Pow", "USub", "UAdd", "Not", "And", "Or", "Eq", "NotEq", "Lt", "LtE", "Gt", "GtE", "In", "NotIn",
    "ListComp", "GeneratorExp", "comprehension",
}


class Validator(ast.NodeVisitor):
    def visit(self, node: ast.AST):
        if type(node).__name__ not in ALLOWED_NODES:
            raise ValidationError(f"{type(node).__name__} is not allowed in Compute Lab", getattr(node, "lineno", None))
        return super().visit(node)

    def visit_Module(self, node: ast.Module):
        if len(node.body) != 1 or not isinstance(node.body[0], ast.FunctionDef) or node.body[0].name != "solve":
            raise ValidationError("Define exactly one function: def solve(params):")
        self.visit(node.body[0])

    def visit_FunctionDef(self, node: ast.FunctionDef):
        if len(node.args.args) != 1 or node.args.args[0].arg != "params" or node.decorator_list:
            raise ValidationError("solve must have exactly one parameter named params", node.lineno)
        for statement in node.body:
            self.visit(statement)

    def visit_Name(self, node: ast.Name):
        if node.id.startswith("__"):
            raise ValidationError("dunder names are not allowed", node.lineno)

    def visit_Attribute(self, node: ast.Attribute):
        raise ValidationError("attribute access is not allowed", node.lineno)

    def visit_Call(self, node: ast.Call):
        if not isinstance(node.func, ast.Name) or node.func.id not in ALLOWED_BUILTINS:
            raise ValidationError("only safe built-in functions are allowed", node.lineno)
        self.generic_visit(node)


class InstrumentExpressions(ast.NodeTransformer):
    def __init__(self, source: str):
        self.source = source

    def visit_BinOp(self, node: ast.BinOp):
        node = self.generic_visit(node)
        return self._wrap(node)

    def visit_UnaryOp(self, node: ast.UnaryOp):
        node = self.generic_visit(node)
        return self._wrap(node)

    def visit_Compare(self, node: ast.Compare):
        node = self.generic_visit(node)
        return self._wrap(node)

    def _wrap(self, node: ast.expr):
        text = ast.get_source_segment(self.source, node) or "expression"
        wrapped = ast.Call(func=ast.Name(id="__lab_eval", ctx=ast.Load()), args=[ast.Constant(text), ast.Lambda(args=ast.arguments(posonlyargs=[], args=[], kwonlyargs=[], kw_defaults=[], defaults=[]), body=node)], keywords=[])
        return ast.copy_location(wrapped, node)


def json_value(value: Any, depth: int = 0, max_depth: int = 4) -> Any:
    if depth >= max_depth:
        return {"truncated": True, "reason": "max_depth", "type": type(value).__name__}
    if isinstance(value, type):
        return value.__name__
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (list, tuple)):
        return [json_value(item, depth + 1, max_depth) for item in value[:50]]
    if isinstance(value, dict):
        return {str(key): json_value(item, depth + 1, max_depth) for key, item in list(value.items())[:50]}
    return {"truncated": True, "reason": "not_json", "type": type(value).__name__}


def execute(payload: dict) -> dict:
    source = payload.get("source", "")
    params = payload.get("params", {})
    max_events = int(payload.get("limits", {}).get("maxEvents", 300))
    try:
        tree = ast.parse(source, mode="exec")
        Validator().visit(tree)
    except (SyntaxError, ValidationError) as exc:
        return {"status": "syntax", "frames": [], "error": {"message": str(exc), "line": getattr(exc, "lineno", None), "kind": "syntax"}}

    frames: list[dict] = []
    previous: dict[str, Any] = {}
    active_frame = None

    def emit(phase: str, line: int | None = None, **extra: Any):
        nonlocal previous
        if len(frames) >= max_events:
            raise RuntimeError("__lab_limit__")
        # CPython 3.14 exposes a FrameLocalsProxy; materialize it before
        # serializing so the debugger receives actual variable bindings.
        locals_snapshot = json_value(dict(active_frame.f_locals)) if active_frame else {}
        changed = sorted(key for key, value in locals_snapshot.items() if previous.get(key) != value)
        previous = dict(locals_snapshot)
        frames.append({"sequence": len(frames), "phase": phase, "line": line, "locals": locals_snapshot, "changed": changed, **extra})

    def tracer(frame, event, arg):
        nonlocal active_frame
        if frame.f_code.co_name != "solve":
            return tracer
        active_frame = frame
        if event == "line":
            emit("line", frame.f_lineno)
        elif event == "return":
            emit("return", frame.f_lineno, value=json_value(arg))
        return tracer

    def trace_eval(text: str, thunk):
        value = thunk()
        emit("eval", active_frame.f_lineno if active_frame else None, expression={"source": text, "value": json_value(value)})
        return value

    namespace = {"__builtins__": {name: getattr(builtins, name) for name in ALLOWED_BUILTINS}, "__lab_eval": trace_eval}
    try:
        instrumented = InstrumentExpressions(source).visit(tree)
        ast.fix_missing_locations(instrumented)
        exec(compile(instrumented, "<compute-lab>", "exec"), namespace)
        sys.settrace(tracer)
        value = namespace["solve"](params)
        sys.settrace(None)
        return {"status": "trace_ready", "frames": frames, "returnValue": json_value(value)}
    except RuntimeError as exc:
        sys.settrace(None)
        if str(exc) == "__lab_limit__":
            return {"status": "limit", "frames": frames, "error": {"message": "Trace event limit reached", "kind": "limit"}}
        return {"status": "runtime", "frames": frames, "error": {"message": str(exc), "kind": "runtime"}}
    except Exception as exc:
        sys.settrace(None)
        return {"status": "runtime", "frames": frames, "error": {"message": str(exc), "kind": type(exc).__name__}}


if __name__ == "__main__":
    print(json.dumps(execute(json.load(sys.stdin))))
