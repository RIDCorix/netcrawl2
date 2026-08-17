"""Restricted, trace-producing Python runner used by the focused Compute Lab.

Every frame this module emits describes *what execution did*, never which parser
class produced it. A frame carries a semantic ``kind``, the player's own source
segment, that segment's exact range, and the values involved. The Compute Lab UI
renders all of them through one card, so a construct nobody wrote a rule for is
displayed exactly like one that was.
"""

import ast
import builtins
import json
import sys
from typing import Any, Callable


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
    # Widening: new syntax only. None of these reaches a name, attribute or callee
    # the two sandbox locks (visit_Attribute, visit_Call) did not already govern.
    # `NamedExpr` is deliberately absent: `:=` assigns into whichever scope
    # evaluates it, and every instrumented expression and test is evaluated inside
    # a lambda, so admitting it would bind the player's variable in the
    # instrumentation's scope and leave their own name undefined. Evaluating
    # eagerly instead of through a thunk would fix the scope and break `and`/`or`
    # short-circuiting, which is load-bearing. Rejecting it keeps the rule that no
    # accepted program runs differently from the one the player wrote.
    "DictComp", "SetComp", "Assert", "Starred",
    "Try", "ExceptHandler", "With", "withitem",
}

# Semantic frame vocabulary. Closed because it describes what execution did, not
# what syntax it was; a construct nobody anticipated is a new *arrangement* of
# these, never a new one. ``step`` is the bottom element and the reason the set
# can stay closed: any statement that did none of the others still emits a frame,
# so nothing a player typed can execute and leave no trace.
CONTROL_KINDS = frozenset({"block_enter", "block_exit", "decision", "repetition", "binding", "unwind", "step"})
FRAME_KINDS = CONTROL_KINDS | {"value", "result"}

# These are deliberate semantic exclusions, not instrumentation gaps. Names and
# constants are shown through their containing expression and locals snapshot;
# assignment targets must never be evaluated a second time. `Starred` is excluded
# because `_lab_eval(..., lambda: *nums)` is a syntax error — a starred expression
# is illegal anywhere a call may appear. It stays Located and Valued through the
# sub-expression it unpacks.
REQUIRED_EXPRESSION_EXCLUSIONS = frozenset({"Name", "Constant", "Starred"})
EXCLUDED_EXPRESSION_TYPES = REQUIRED_EXPRESSION_EXCLUSIONS
ALLOWED_EXPRESSION_TYPES = frozenset(
    name for name in ALLOWED_NODES
    if isinstance(getattr(ast, name, None), type) and issubclass(getattr(ast, name), ast.expr)
)
INSTRUMENTED_EXPRESSION_TYPES = ALLOWED_EXPRESSION_TYPES - EXCLUDED_EXPRESSION_TYPES

# ``ast.While._fields`` and ``ast.If._fields`` are byte-identical (test, body,
# orelse), so reflection over the node's own shape cannot tell a loop from a
# branch. Every other repeating statement is recognised by its ``iter`` field.
# This is the one name in the module keyed on a parser class, and it names a
# semantic fact — this statement re-runs its body — not a rendering rule.
REPEATING_STATEMENTS = frozenset({"While"})

# The suite a block statement owns. Its own frames point at the header the player
# reads — `for value in nums` — never at the indented body, which reports itself.
SUITE_FIELDS = frozenset({"body", "orelse", "finalbody", "handlers"})


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

    def visit_ExceptHandler(self, node: ast.ExceptHandler):
        if node.name is not None and (node.name.startswith("__") or node.name.startswith("_lab_")):
            raise ValidationError("reserved names are not allowed", node.lineno)
        self.generic_visit(node)

    def visit_Attribute(self, node: ast.Attribute):
        raise ValidationError("attribute access is not allowed", node.lineno)

    def visit_Call(self, node: ast.Call):
        if not isinstance(node.func, ast.Name) or node.func.id not in ALLOWED_BUILTINS:
            raise ValidationError("only safe built-in functions are allowed", node.lineno)
        self.generic_visit(node)


class InstrumentExecution(ast.NodeTransformer):
    """Rewrites the player's tree so every step reports itself.

    There is no per-construct method here on purpose. Expressions are wrapped by
    reflection over ``ast.expr``; statements are classified by reflection over
    their own ``_fields``. A statement that owns a ``body`` is a block, a ``test``
    is a decision, ``handlers`` is an unwind site, a ``target``/``value`` pair is
    a binding, and a statement with no fields at all is a bare step.
    """

    def __init__(self, source: str):
        self.source = source
        self.lines = source.split("\n")
        # Where each executable line starts, so a frame CPython hands us without
        # a node — the return, and any uncaught error — is Located like the rest.
        self.statement_metadata: dict[int, dict] = {}

    def visit(self, node: ast.AST):
        transformed = super().visit(node)
        if isinstance(transformed, ast.stmt):
            self.statement_metadata.setdefault(transformed.lineno, self._metadata_value(transformed))
            return self._instrument_statement(transformed)
        if not isinstance(transformed, ast.expr):
            return transformed
        if type(transformed).__name__ in EXCLUDED_EXPRESSION_TYPES:
            return transformed
        context = getattr(transformed, "ctx", ast.Load())
        if isinstance(context, (ast.Store, ast.Del)):
            return transformed
        return self._wrap(transformed)

    # ── statement roles, derived from the node's own fields ──────────────────
    @staticmethod
    def _roles(node: ast.stmt) -> frozenset[str]:
        fields = frozenset(type(node)._fields)
        if "name" in fields and "body" in fields:
            return frozenset()  # a definition declares; it is not an execution step
        roles = set()
        if not fields:
            roles.add("step")
        if "body" in fields:
            roles.add("block")
        if "test" in fields:
            roles.add("decision")
        if "handlers" in fields:
            roles.add("unwind")
        if "iter" in fields or type(node).__name__ in REPEATING_STATEMENTS:
            roles.add("repeats")
        if "value" in fields and ("targets" in fields or "target" in fields) and "body" not in fields:
            roles.add("binding")
        return frozenset(roles)

    def _instrument_statement(self, node: ast.stmt):
        roles = self._roles(node)
        if not roles:
            return node
        before: list[ast.stmt] = []
        after: list[ast.stmt] = []
        if "step" in roles:
            before.append(self._event(node, "step"))
        if "binding" in roles:
            targets = node.targets if hasattr(node, "targets") else [node.target]
            after.append(self._event(node, "binding", names=[name for target in targets for name in self._target_names(target)]))
        # A pure decision (`if`) is already fully described by its own test frame;
        # opening a block around it would double every branch the player writes.
        if "block" in roles and ("repeats" in roles or "decision" not in roles):
            before.append(self._event(node, "block_enter"))
            after.append(self._event(node, "block_exit"))
        if "repeats" in roles:
            target = getattr(node, "target", None)
            node.body.insert(0, self._event(node, "repetition", names=self._target_names(target) if target else []))
        if "decision" in roles:
            node.test = self._decision(node, node.test)
        if "unwind" in roles:
            for handler in node.handlers:
                handler.body.insert(0, self._event(handler, "unwind"))
        return [*before, node, *after]

    @classmethod
    def _target_names(cls, target: ast.expr) -> list[str]:
        if isinstance(target, ast.Name):
            return [target.id]
        if isinstance(target, (ast.Tuple, ast.List)):
            return [name for element in target.elts for name in cls._target_names(element)]
        if isinstance(target, ast.Starred):
            return cls._target_names(target.value)
        return []

    # ── instrumentation primitives ──────────────────────────────────────────
    def _wrap(self, node: ast.expr):
        wrapped = ast.Call(
            func=ast.Name(id="_lab_eval", ctx=ast.Load()),
            args=[self._metadata(node), self._thunk(node)],
            keywords=[],
        )
        return ast.copy_location(wrapped, node)

    def _located(self, tree: ast.AST, node: ast.AST) -> ast.AST:
        """Stamp a synthesised subtree with the player's own source location.

        Literals built by re-parsing ``repr(...)`` are born at line 1 and keep it
        through ``fix_missing_locations``, which only fills nodes that are
        missing a location. CPython then attributes that bytecode to line 1, and
        ``sys.settrace`` reports the player's execution as happening on the
        ``class ProblemSolver:`` line.
        """
        for child in ast.walk(tree):
            ast.copy_location(child, node)
        return tree

    def _literal(self, value: Any, node: ast.AST) -> ast.expr:
        return self._located(ast.parse(repr(value), mode="eval").body, node)

    def _location(self, node: ast.AST) -> dict[str, int]:
        """The range to highlight: a whole expression, or a block's header only."""
        end = (getattr(node, "end_lineno", None), getattr(node, "end_col_offset", None))
        if any(field in SUITE_FIELDS for field in type(node)._fields):
            end = (node.lineno, node.col_offset)
            for field in type(node)._fields:
                if field in SUITE_FIELDS:
                    continue
                value = getattr(node, field, None)
                for item in value if isinstance(value, list) else [value]:
                    if not isinstance(item, ast.AST):
                        continue
                    for descendant in ast.walk(item):
                        reach = (getattr(descendant, "end_lineno", None), getattr(descendant, "end_col_offset", None))
                        if reach[0] is not None and reach > end:
                            end = reach
            if end == (node.lineno, node.col_offset):
                # `try:`, a bare `except:` — a header with no expression of its own.
                line = self.lines[node.lineno - 1] if node.lineno <= len(self.lines) else ""
                end = (node.lineno, len(line.encode()))
        return {
            "lineno": node.lineno,
            "col_offset": node.col_offset,
            "end_lineno": end[0],
            "end_col_offset": end[1],
        }

    def _segment(self, location: dict[str, int]) -> str:
        """Slice the player's own source. CPython columns are UTF-8 byte offsets."""
        selected = self.lines[location["lineno"] - 1 : location["end_lineno"]]
        if not selected:
            return ""
        if len(selected) == 1:
            return selected[0].encode()[location["col_offset"] : location["end_col_offset"]].decode(errors="replace")
        first = selected[0].encode()[location["col_offset"] :].decode(errors="replace")
        last = selected[-1].encode()[: location["end_col_offset"]].decode(errors="replace")
        return "\n".join([first, *selected[1:-1], last])

    def _metadata_value(self, node: ast.AST) -> dict[str, Any]:
        location = self._location(node)
        return {"source": self._segment(location) or "expression", "location": location}

    def _metadata(self, node: ast.AST) -> ast.expr:
        return self._literal(self._metadata_value(node), node)

    def _thunk(self, expression: ast.expr) -> ast.Lambda:
        return ast.Lambda(
            args=ast.arguments(posonlyargs=[], args=[], kwonlyargs=[], kw_defaults=[], defaults=[]),
            body=expression,
        )

    def _decision(self, statement: ast.stmt, test: ast.expr) -> ast.Call:
        call = ast.Call(
            func=ast.Name(id="_lab_decision", ctx=ast.Load()),
            args=[
                self._metadata(statement),
                self._thunk(test),
                ast.Constant("body" in type(statement)._fields),
                ast.Constant(bool(getattr(statement, "orelse", []))),
            ],
            keywords=[],
        )
        return ast.copy_location(call, test)

    def _event(self, node: ast.AST, kind: str, **fields: Any) -> ast.Expr:
        call = ast.Call(
            func=ast.Name(id="_lab_event", ctx=ast.Load()),
            args=[self._metadata(node), ast.Constant(kind)],
            keywords=[ast.keyword(arg=key, value=self._literal(value, node)) for key, value in fields.items()],
        )
        return ast.copy_location(ast.Expr(value=call), node)


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


def describe_exception(exc: BaseException) -> str:
    """Never hand the player an empty sentence. `assert x` raises with no message."""
    return str(exc) or type(exc).__name__


def execute(payload: dict, on_frame: Callable[[dict], None] | None = None) -> dict:
    """Run one Lab submission and return its terminal status plus every frame.

    ``on_frame`` receives each frame as it is produced. The daemon uses it to
    stream frames to its own stdout, so a run killed by the wall-clock timeout
    still hands the player everything that had already happened.
    """
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
    unwinding: str | None = None
    repetitions: dict[tuple[int | None, int | None], int] = {}
    transformer = InstrumentExecution(source)

    def emit(kind: str, metadata: dict | None = None, **extra: Any):
        nonlocal previous
        if len(frames) >= max_events:
            raise RuntimeError("__lab_limit__")
        # CPython 3.14 exposes a FrameLocalsProxy; materialize it before
        # serializing so the debugger receives actual variable bindings.
        locals_snapshot = json_value({key: value for key, value in dict(active_frame.f_locals).items() if key != "self"}) if active_frame else {}
        changed = sorted(key for key, value in locals_snapshot.items() if previous.get(key) != value)
        previous = dict(locals_snapshot)
        located = metadata or (transformer.statement_metadata.get(active_frame.f_lineno) if active_frame else None)
        frame = {
            "sequence": len(frames),
            "kind": kind,
            "line": (located["location"]["lineno"] if located else None) or (active_frame.f_lineno if active_frame else None),
            "locals": locals_snapshot,
            "changed": changed,
            **({"source": located["source"], "location": located["location"]} if located else {}),
            **extra,
        }
        frames.append(frame)
        if on_frame is not None:
            on_frame(frame)

    def tracer(frame, event, arg):
        nonlocal active_frame, unwinding
        if frame.f_code is not solution_code:
            return None
        active_frame = frame
        if event == "exception":
            # Provisional: an error is in flight. If the player catches it, the
            # next `line` event clears this and the run continues normally.
            unwinding = describe_exception(arg[1])
        elif event == "line":
            unwinding = None
        elif event == "return":
            # CPython reports a `return` when a frame is left by an exception too,
            # with arg None. Reporting that as the returned value would tell the
            # player their program returned nothing when it in fact broke.
            if unwinding is None:
                emit("result", value=json_value(arg))
            else:
                emit("unwind", detail={"error": unwinding})
        return tracer

    def trace_eval(metadata: dict, thunk):
        value = thunk()
        emit("value", metadata, value=json_value(value))
        return value

    def trace_event(metadata: dict, kind: str, names: list[str] | None = None):
        detail: dict[str, Any] = {}
        if kind == "repetition":
            key = (metadata["location"]["lineno"], metadata["location"]["col_offset"])
            repetitions[key] = repetitions.get(key, 0) + 1
            detail["iteration"] = repetitions[key]
        if names:
            detail["bindings"] = {
                name: json_value(active_frame.f_locals[name])
                for name in names
                if active_frame is not None and name in active_frame.f_locals
            }
        emit(kind, metadata, **({"detail": detail} if detail else {}))

    def trace_decision(metadata: dict, thunk, has_body: bool, has_alternative: bool):
        value = thunk()
        outcome = bool(value)
        detail: dict[str, Any] = {"outcome": outcome}
        if has_body:
            detail["taken"] = "body" if outcome else "alternative" if has_alternative else "none"
        emit("decision", metadata, detail=detail)
        return outcome

    namespace = {
        "__builtins__": {**{name: getattr(builtins, name) for name in ALLOWED_BUILTINS}, "__build_class__": builtins.__build_class__},
        "_lab_eval": trace_eval,
        "_lab_event": trace_event,
        "_lab_decision": trace_decision,
        "__name__": "__compute_lab__",
    }
    try:
        instrumented = transformer.visit(tree)
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
        return {"status": "runtime", "frames": frames, "error": {"message": describe_exception(exc), "line": active_frame.f_lineno if active_frame else None, "kind": "runtime"}}
    except Exception as exc:
        sys.settrace(None)
        return {"status": "runtime", "frames": frames, "error": {"message": describe_exception(exc), "line": active_frame.f_lineno if active_frame else None, "kind": type(exc).__name__}}


def main() -> None:
    """Stream frames as they happen, then one terminal result line.

    Line-delimited rather than one final document so that a run the daemon has to
    kill on the wall clock still leaves every frame it had already produced on
    stdout. Without this a timed-out run reaches the player as a blank panel.
    """
    def write(payload: dict) -> None:
        sys.stdout.write(json.dumps(payload) + "\n")
        sys.stdout.flush()

    result = execute(json.load(sys.stdin), on_frame=lambda frame: write({"frame": frame}))
    # The frames already went out one line at a time; repeating them here would
    # double the transport for no reader.
    write({"result": {key: value for key, value in result.items() if key != "frames"}})


if __name__ == "__main__":
    main()
