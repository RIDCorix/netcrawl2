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
    "Module", "ClassDef", "FunctionDef", "arguments", "arg", "Return", "Assign", "AugAssign", "AnnAssign", "For", "While", "If", "IfExp", "Break", "Continue", "Pass",
    "Name", "Load", "Store", "Constant", "List", "Tuple", "Dict", "Set", "Subscript", "Slice", "BinOp", "UnaryOp", "BoolOp", "Compare", "Call", "keyword",
    "Add", "Sub", "Mult", "Div", "FloorDiv", "Mod", "Pow", "USub", "UAdd", "Not", "And", "Or", "Eq", "NotEq", "Lt", "LtE", "Gt", "GtE", "In", "NotIn",
    "ListComp", "GeneratorExp", "comprehension", "JoinedStr", "FormattedValue",
}

# These are deliberate semantic exclusions, not instrumentation gaps. Names and
# constants are shown through their containing expression and locals snapshot;
# assignment targets must never be evaluated a second time.
REQUIRED_EXPRESSION_EXCLUSIONS = frozenset({"Name", "Constant"})
EXCLUDED_EXPRESSION_TYPES = REQUIRED_EXPRESSION_EXCLUSIONS
ALLOWED_EXPRESSION_TYPES = frozenset(
    name for name in ALLOWED_NODES
    if isinstance(getattr(ast, name, None), type) and issubclass(getattr(ast, name), ast.expr)
)
INSTRUMENTED_EXPRESSION_TYPES = ALLOWED_EXPRESSION_TYPES - EXCLUDED_EXPRESSION_TYPES


class Validator(ast.NodeVisitor):
    def __init__(self, parameter_names: list[str]):
        self.parameter_names = parameter_names
    def visit(self, node: ast.AST):
        if type(node).__name__ not in ALLOWED_NODES:
            raise ValidationError(f"{type(node).__name__} is not allowed in Compute Lab", getattr(node, "lineno", None))
        return super().visit(node)

    def visit_Module(self, node: ast.Module):
        if len(node.body) != 1 or not isinstance(node.body[0], ast.ClassDef) or node.body[0].name != "ProblemSolver":
            raise ValidationError("Define exactly one class: class ProblemSolver:")
        self.visit(node.body[0])

    def visit_ClassDef(self, node: ast.ClassDef):
        if node.bases or node.keywords or node.decorator_list or len(node.body) != 1:
            raise ValidationError("ProblemSolver must contain exactly one solution method", node.lineno)
        method = node.body[0]
        if not isinstance(method, ast.FunctionDef) or method.name != "solution":
            raise ValidationError("ProblemSolver must define exactly one method: solution", getattr(method, "lineno", node.lineno))
        self.visit(method)

    def visit_FunctionDef(self, node: ast.FunctionDef):
        arguments = [*node.args.posonlyargs, *node.args.args, *node.args.kwonlyargs]
        if node.args.vararg is not None:
            arguments.append(node.args.vararg)
        if node.args.kwarg is not None:
            arguments.append(node.args.kwarg)
        if any(argument.arg.startswith("_lab_") for argument in arguments):
            raise ValidationError("reserved names are not allowed", node.lineno)
        if node.returns is not None or any(argument.annotation is not None for argument in arguments):
            raise ValidationError("solution annotations are not allowed", node.lineno)
        names = [argument.arg for argument in node.args.args]
        if (node.name != "solution" or node.decorator_list or node.args.posonlyargs or node.args.vararg or
                node.args.kwonlyargs or node.args.kwarg or node.args.defaults or node.args.kw_defaults or
                names != ["self", *self.parameter_names]):
            raise ValidationError(f"solution must be def solution(self, {', '.join(self.parameter_names)})", node.lineno)
        for statement in node.body:
            self.visit(statement)

    def visit_Name(self, node: ast.Name):
        if node.id.startswith("__") or node.id.startswith("_lab_"):
            raise ValidationError("reserved names are not allowed", node.lineno)

    def visit_Attribute(self, node: ast.Attribute):
        raise ValidationError("attribute access is not allowed", node.lineno)

    def visit_Call(self, node: ast.Call):
        if not isinstance(node.func, ast.Name) or node.func.id not in ALLOWED_BUILTINS:
            raise ValidationError("only safe built-in functions are allowed", node.lineno)
        self.generic_visit(node)


class InstrumentExpressions(ast.NodeTransformer):
    def __init__(self, source: str):
        self.source = source

    def visit(self, node: ast.AST):
        transformed = super().visit(node)
        if not isinstance(transformed, ast.expr):
            return transformed
        if type(transformed).__name__ in EXCLUDED_EXPRESSION_TYPES:
            return transformed
        context = getattr(transformed, "ctx", ast.Load())
        if isinstance(context, (ast.Store, ast.Del)):
            return transformed
        return self._wrap(transformed)

    def visit_If(self, node: ast.If):
        node = self.generic_visit(node)
        node.test = self._control_test(node, node.test)
        return node

    def visit_While(self, node: ast.While):
        node = self.generic_visit(node)
        node.test = self._control_test(node, node.test)
        return [self._control_event(node, "enter"), node, self._control_event(node, "exit")]

    def visit_For(self, node: ast.For):
        node = self.generic_visit(node)
        target = ast.get_source_segment(self.source, node.target) or "target"
        node.body.insert(
            0,
            self._control_event(
                node,
                "iteration",
                target=target,
                target_names=self._target_names(node.target),
            ),
        )
        return [self._control_event(node, "enter"), node, self._control_event(node, "exit")]

    @classmethod
    def _target_names(cls, target: ast.expr) -> list[str]:
        if isinstance(target, ast.Name):
            return [target.id]
        if isinstance(target, (ast.Tuple, ast.List)):
            return [name for element in target.elts for name in cls._target_names(element)]
        return []

    def _wrap(self, node: ast.expr):
        wrapped = ast.Call(
            func=ast.Name(id="_lab_eval", ctx=ast.Load()),
            args=[self._metadata(node), self._thunk(node)],
            keywords=[],
        )
        return ast.copy_location(wrapped, node)

    def _metadata(self, node: ast.AST) -> ast.Dict:
        location = {
            "lineno": getattr(node, "lineno", None),
            "col_offset": getattr(node, "col_offset", None),
            "end_lineno": getattr(node, "end_lineno", None),
            "end_col_offset": getattr(node, "end_col_offset", None),
        }
        values: dict[str, Any] = {
            "node_type": type(node).__name__,
            "source": ast.get_source_segment(self.source, node) or "expression",
            "location": location,
        }
        return ast.parse(repr(values), mode="eval").body

    @staticmethod
    def _thunk(expression: ast.expr) -> ast.Lambda:
        return ast.Lambda(
            args=ast.arguments(posonlyargs=[], args=[], kwonlyargs=[], kw_defaults=[], defaults=[]),
            body=expression,
        )

    def _control_test(self, statement: ast.If | ast.While, test: ast.expr) -> ast.Call:
        call = ast.Call(
            func=ast.Name(id="_lab_control_test", ctx=ast.Load()),
            args=[self._metadata(statement), self._thunk(test), ast.Constant(bool(statement.orelse))],
            keywords=[],
        )
        return ast.copy_location(call, test)

    def _control_event(self, statement: ast.For | ast.While, event: str, **fields: Any) -> ast.Expr:
        call = ast.Call(
            func=ast.Name(id="_lab_control", ctx=ast.Load()),
            args=[self._metadata(statement), ast.Constant(event)],
            keywords=[ast.keyword(arg=key, value=ast.parse(repr(value), mode="eval").body) for key, value in fields.items()],
        )
        return ast.copy_location(ast.Expr(value=call), statement)


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
    parameter_names = payload.get("parameterNames", [])
    max_events = int(payload.get("limits", {}).get("maxEvents", 1200))
    try:
        if (not isinstance(params, dict) or not isinstance(parameter_names, list) or
                any(not isinstance(name, str) or not name.isidentifier() for name in parameter_names) or
                any(name.startswith("_lab_") for name in parameter_names) or
                len(set(parameter_names)) != len(parameter_names) or
                set(params) != set(parameter_names)):
            raise ValidationError("parameterNames must be unique Python identifiers matching params")
        tree = ast.parse(source, mode="exec")
        Validator(parameter_names).visit(tree)
    except (SyntaxError, ValidationError) as exc:
        return {"status": "syntax", "frames": [], "error": {"message": str(exc), "line": getattr(exc, "line", getattr(exc, "lineno", None)), "kind": "syntax"}}

    frames: list[dict] = []
    previous: dict[str, Any] = {}
    active_frame = None
    solution_code = None
    loop_iterations: dict[tuple[str, int | None, int | None], int] = {}

    def emit(phase: str, line: int | None = None, **extra: Any):
        nonlocal previous
        if len(frames) >= max_events:
            raise RuntimeError("__lab_limit__")
        # CPython 3.14 exposes a FrameLocalsProxy; materialize it before
        # serializing so the debugger receives actual variable bindings.
        locals_snapshot = json_value({key: value for key, value in dict(active_frame.f_locals).items() if key != "self"}) if active_frame else {}
        changed = sorted(key for key, value in locals_snapshot.items() if previous.get(key) != value)
        previous = dict(locals_snapshot)
        frames.append({"sequence": len(frames), "phase": phase, "line": line, "locals": locals_snapshot, "changed": changed, **extra})

    def tracer(frame, event, arg):
        nonlocal active_frame
        if frame.f_code is not solution_code:
            return tracer
        active_frame = frame
        if event == "line":
            emit("line", frame.f_lineno)
        elif event == "return":
            emit("return", frame.f_lineno, value=json_value(arg))
        return tracer

    def trace_eval(metadata: dict, thunk):
        value = thunk()
        emit(
            "eval",
            active_frame.f_lineno if active_frame else metadata["location"]["lineno"],
            expression={**metadata, "value": json_value(value)},
        )
        return value

    def trace_control(metadata: dict, event: str, **fields: Any):
        key = (metadata["node_type"], metadata["location"]["lineno"], metadata["location"]["col_offset"])
        target_names = fields.pop("target_names", [])
        control = {"node_type": metadata["node_type"], "location": metadata["location"], "event": event, **fields}
        if event == "enter":
            loop_iterations[key] = 0
        elif event == "iteration":
            loop_iterations[key] = loop_iterations.get(key, 0) + 1
            control["iteration"] = loop_iterations[key]
            control["targetBindings"] = {
                name: json_value(active_frame.f_locals[name])
                for name in target_names
                if active_frame is not None and name in active_frame.f_locals
            }
        emit("control", metadata["location"]["lineno"], control=control)

    def trace_control_test(metadata: dict, thunk, has_else: bool):
        value = thunk()
        truth = bool(value)
        trace_control(metadata, "test", test=truth)
        if metadata["node_type"] == "If":
            trace_control(metadata, "branch", branch="body" if truth else "else" if has_else else "none")
        elif truth:
            trace_control(metadata, "iteration")
        return truth

    namespace = {
        "__builtins__": {**{name: getattr(builtins, name) for name in ALLOWED_BUILTINS}, "__build_class__": builtins.__build_class__},
        "_lab_eval": trace_eval,
        "_lab_control": trace_control,
        "_lab_control_test": trace_control_test,
        "__name__": "__compute_lab__",
    }
    try:
        instrumented = InstrumentExpressions(source).visit(tree)
        ast.fix_missing_locations(instrumented)
        exec(compile(instrumented, "<compute-lab>", "exec"), namespace)
        solver = namespace["ProblemSolver"]()
        solution_code = solver.solution.__code__
        sys.settrace(tracer)
        value = solver.solution(**params)
        sys.settrace(None)
        return {"status": "trace_ready", "frames": frames, "returnValue": json_value(value)}
    except RuntimeError as exc:
        sys.settrace(None)
        if str(exc) == "__lab_limit__":
            return {"status": "limit", "frames": frames, "error": {"message": "Trace event limit reached", "line": active_frame.f_lineno if active_frame else None, "kind": "limit"}}
        return {"status": "runtime", "frames": frames, "error": {"message": str(exc), "line": active_frame.f_lineno if active_frame else None, "kind": "runtime"}}
    except Exception as exc:
        sys.settrace(None)
        return {"status": "runtime", "frames": frames, "error": {"message": str(exc), "line": active_frame.f_lineno if active_frame else None, "kind": type(exc).__name__}}


if __name__ == "__main__":
    print(json.dumps(execute(json.load(sys.stdin))))
