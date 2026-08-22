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
from types import CodeType
from typing import Any, Callable


class ValidationError(Exception):
    def __init__(self, message: str, line: int | None = None):
        super().__init__(message)
        self.line = line


class TraceLimit(BaseException):
    """The event cap, raised as something player code provably cannot catch.

    It derives from ``BaseException`` rather than ``Exception``, and that half
    only holds because :meth:`Validator.visit_ExceptHandler` requires every
    handler to name a class from ``ALLOWED_EXCEPTIONS`` — all of which are
    ``Exception`` subclasses.

    The previous ``RuntimeError`` sentinel was *not* exploitable, and that was
    measured rather than assumed: a bare ``except:`` did catch it, but every
    handler body begins with an instrumentation call, which raises again
    immediately and escapes the same ``try``. So the cap held — by accident, on a
    property of the instrumenter that nothing states and nothing tests. This
    stage admits ``except Exception``, which is a far more likely thing for a
    player to write around a runaway loop, so the guarantee is made structural
    instead: relax either half and the cap becomes advisory, and a stopped run
    reaches the player as a timeout rather than an honest "we stopped watching".
    """


ALLOWED_BUILTINS = {"abs", "all", "any", "bool", "dict", "enumerate", "float", "int", "len", "list", "max", "min", "range", "reversed", "round", "sorted", "str", "sum", "type"}

# The errors an allowed operation raises on bad *data* — the case a player
# writing a pure function actually guards against, and the reason `except` was
# unwritable until now. Everything excluded is excluded for a stated reason:
# `AttributeError`, `NameError` and `ImportError` are raised only by operations
# the Validator rejects before execution; `AssertionError` is the player's own
# deliberate failure, so catching it defeats the statement they wrote;
# `RecursionError` is a `RuntimeError` and catching it inside the recursion that
# is already at the limit re-raises immediately.
ALLOWED_EXCEPTIONS = {"Exception", "IndexError", "KeyError", "TypeError", "ValueError", "ZeroDivisionError"}
ALLOWED_BUILTINS |= ALLOWED_EXCEPTIONS
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

# The fields on an allowed node whose value is *not* an AST child. They matter
# because `generic_visit` walks children and `Validator.visit` re-checks each one
# against `ALLOWED_NODES` — so a field made of nodes is covered by construction,
# and a field made of anything else is invisible to that walk. Every name binder
# that has escaped this Validator was exactly that: a plain `str` on a node whose
# other fields looked complete. Listing the scalars that are accounted for, and
# refusing every other, is what makes "a field nobody thought of" a refusal the
# player can read instead of a hole. `type_comment` is deliberately absent from
# every entry: `ast.parse` never populates it here, so nothing is lost by
# refusing it and one more field stops being a place to hide.
SCALAR_FIELDS = {
    "AnnAssign": frozenset({"simple"}),
    "ClassDef": frozenset({"name"}),
    "Constant": frozenset({"value", "kind"}),
    "ExceptHandler": frozenset({"name"}),
    "FormattedValue": frozenset({"conversion"}),
    "FunctionDef": frozenset({"name"}),
    "Name": frozenset({"id"}),
    "comprehension": frozenset({"is_async"}),
    "keyword": frozenset({"arg"}),
}

# What each hand-rolled visitor actually reads. `visit_Module`, `visit_ClassDef`
# and `_check_signature` all replace `generic_visit` with a hand-picked list of
# fields, and a visitor that enumerates fields fails **open** on every field
# nobody named. That is not hypothetical: PEP 695's `type_params` — an entire
# subtree, carrying a fourth `str`-field name binder — passed unchecked on every
# CPython ≥ 3.12 for exactly this reason. Any field outside these sets must be
# empty; see `Validator._check_fields`.
WALKED_FIELDS = {
    "Module": frozenset({"body"}),
    "ClassDef": frozenset({"name", "bases", "keywords", "body", "decorator_list"}),
    "FunctionDef": frozenset({"name", "args", "body", "decorator_list", "returns"}),
    "arguments": frozenset({"posonlyargs", "args", "vararg", "kwonlyargs", "kw_defaults", "kwarg", "defaults"}),
    "arg": frozenset({"arg", "annotation"}),
    "Name": frozenset({"id", "ctx"}),
}

# Semantic frame vocabulary. Closed because it describes what execution did, not
# what syntax it was; a construct nobody anticipated is a new *arrangement* of
# these, never a new one. ``step`` is the bottom element and the reason the set
# can stay closed: any statement that did none of the others still emits a frame,
# so nothing a player typed can execute and leave no trace.
#
# Calls are the newest evidence that the set holds. Going into a helper and
# coming back out needed no eighth kind: a function body is a block, so it is
# entered and exited, and its return is a ``result`` like any other. What a call
# does add is *where* — carried by each frame's ``stack``, not by a new word.
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

# How many call-stack entries a frame carries after identical adjacent calls are
# collapsed. Recursion collapses to one entry with a count, so this only bites on
# mutual recursion, where a wall of alternating names is exactly what the player
# must not be shown.
MAX_STACK_ENTRIES = 8

# How long a repeating statement will run, when that is knowable *without running
# any of the player's own code*.
#
# Since players may define `__len__`, a duck-typed `len()` from inside the tracer
# would execute a player method in the tracer's own frame — a sandbox change, and
# not one this layer is allowed to make. So the question is asked only of the
# built-in sized types, whose length is a C-level slot and cannot re-enter Python.
# Anything else — a `while`, a generator, a player's own object — has no total,
# and "no total" is a first-class answer the screen has an honest shape for.
MEASURABLE_TYPES = (range, list, tuple, str, dict, set, frozenset, bytes)


def type_name(value: Any) -> str:
    """The word the player would use for this value's type.

    `NoneType` is the one substitution: it is CPython's internal spelling of a
    thing the player writes, reads and thinks of as `None`, and no player program
    can ever name it.
    """
    return "None" if value is None else type(value).__name__


class Validator(ast.NodeVisitor):
    """The two locks that hold the sandbox, and the one thing that may pass them.

    ``visit_Attribute`` rejects every attribute; ``visit_Call`` rejects every
    callee that is not a bare ``Name``. Together they are why
    ``type([]).__base__.__subclasses__()`` is unreachable, and neither is relaxed
    here.

    What is relaxed is *which* bare names may be called: a built-in, or a
    function the player defined with ``def`` inside ``solution``. That widening
    adds no reachable value only while **a name bound by a ``def`` cannot be
    bound to anything else** — because a call through a helper name is then
    provably a call to a function this Validator already walked, never an
    arbitrary value the player computed. Admitting attribute callees, or losing
    that rule, would each give a player ``<anything>(...)``, and keeping those
    two apart is what this class is for.

    **The rule is a property of this allowlist, not of Python**, and it is worth
    stating as the closure it actually has rather than as the enumeration it was
    first written as. It holds in three places, and relaxing any one of them
    ends it:

    * ``visit_Name`` refuses a ``Store``/``Del`` on a helper name, which covers
      every binder that produces a ``Name`` node — assignment, augmented
      assignment, a ``for`` target, a comprehension target, ``with ... as``.
    * ``_check_signature`` and ``visit_ExceptHandler`` cover the binders that
      bind from a plain ``str`` field and so produce no ``Name`` node for
      ``visit_Name`` to see: a ``def`` name, a parameter, an ``except ... as``
      name.
    * ``ALLOWED_NODES`` refuses the node types that would bind another way —
      ``Import``, ``Global``, ``Nonlocal``, ``Delete``, ``NamedExpr``, ``Match``,
      ``Lambda`` — and ``visit_ClassDef`` refuses a class nested in ``solution``.

    As first written the rule was **false**, and how it broke is the part to keep
    in view. PEP 695 ``def helper[T](x)`` binds ``helper``'s type parameter from
    a ``str`` field inside ``type_params`` — a field that neither
    ``visit_FunctionDef`` nor ``visit_ClassDef`` walked, so nothing inside it was
    ever checked against ``ALLOWED_NODES``, ``visit_Attribute`` or ``visit_Call``
    on any CPython ≥ 3.12. The listed binders were not wrong; being a list at all
    was, in a visitor that hand-picks the fields it reads. ``_check_fields`` is
    what closes that class rather than that instance: on ``Module``,
    ``ClassDef``, ``FunctionDef``, ``arguments`` and ``arg``, a field this class
    does not itself read must be empty, and ``_check_scalar_fields`` extends the
    same refusal to every non-node field on every other allowed node. So the next
    construct CPython adds arrives here as a refusal the player can read, not as
    a hole nobody is looking for.
    """

    def __init__(self, parameter_names: list[str]):
        self.parameter_names = parameter_names
        # Every `def` name anywhere in the submission, so the tracer can tell the
        # player's own code objects from the instrumentation's lambdas.
        self.helper_names: set[str] = set()
        # The `def` names visible in the scope being walked right now.
        self._functions: frozenset[str] = frozenset()
        self._depth = 0

    def visit(self, node: ast.AST):
        if type(node).__name__ not in ALLOWED_NODES:
            raise ValidationError(f"{type(node).__name__} is not allowed in Compute Lab", getattr(node, "lineno", None))
        self._check_scalar_fields(node)
        return super().visit(node)

    @staticmethod
    def _check_scalar_fields(node: ast.AST) -> None:
        """Refuse any non-AST field that ``SCALAR_FIELDS`` does not account for.

        The node-shaped fields need no list: ``generic_visit`` walks them and
        ``visit`` checks each against ``ALLOWED_NODES``. Everything else is
        invisible to that walk, which is the whole reason a plain ``str`` has now
        been the hiding place four times — ``except X as name``, a ``def`` name,
        a parameter, and the name inside a PEP 695 type parameter.
        """
        accounted = SCALAR_FIELDS.get(type(node).__name__, frozenset())
        for field, value in ast.iter_fields(node):
            if field in accounted:
                continue
            for item in value if isinstance(value, list) else [value]:
                if item is None or isinstance(item, ast.AST):
                    continue
                raise ValidationError(f"{field} is not allowed in Compute Lab", getattr(node, "lineno", None))

    @staticmethod
    def _check_fields(node: ast.AST) -> None:
        """Refuse any field the hand-rolled visitor above does not itself read.

        ``type_params`` is called out by name because it is the one a player can
        actually type today, and a message naming the syntax teaches more than
        the field name would. The loop after it is the finding rather than the
        instance: it is what makes a field nobody has heard of arrive as a
        refusal instead of as an unchecked subtree.
        """
        if getattr(node, "type_params", None):
            raise ValidationError("type parameters like [T] are not allowed", getattr(node, "lineno", None))
        walked = WALKED_FIELDS[type(node).__name__]
        for field, value in ast.iter_fields(node):
            if field in walked or not value:
                continue
            raise ValidationError(f"{field} is not allowed in Compute Lab", getattr(node, "lineno", None))

    def visit_Module(self, node: ast.Module):
        self._check_fields(node)
        if len(node.body) != 1 or not isinstance(node.body[0], ast.ClassDef) or node.body[0].name != "ProblemSolver":
            raise ValidationError("Define exactly one class: class ProblemSolver:")
        self.visit(node.body[0])

    def visit_ClassDef(self, node: ast.ClassDef):
        # A class inside `solution` binds its name the way a `def` does, and
        # `_declared_functions` does not collect it — so it could shadow a helper
        # the callee lock has already approved. It is unreachable by accident
        # today (its one method would have to be named `solution`, which
        # `_check_signature` rejects at depth); saying so outright is cheaper than
        # depending on that.
        if self._depth > 0:
            raise ValidationError("a class cannot be defined inside solution", node.lineno)
        self._check_fields(node)
        if node.bases or node.keywords or node.decorator_list or len(node.body) != 1:
            raise ValidationError("ProblemSolver must contain exactly one solution method", node.lineno)
        method = node.body[0]
        if not isinstance(method, ast.FunctionDef) or method.name != "solution":
            raise ValidationError("ProblemSolver must define exactly one method: solution", getattr(method, "lineno", node.lineno))
        self.visit(method)

    @staticmethod
    def _declared_functions(scope: ast.AST) -> list[str]:
        """The `def` names bound in one scope.

        Any depth of block nesting inside it — a helper defined under an ``if``
        is still bound in the enclosing function — but never through another
        ``def``, which owns its own scope. Collected up front so a helper may be
        called above its own definition, exactly as Python allows.
        """
        names: list[str] = []

        def walk(container: ast.AST) -> None:
            for child in ast.iter_child_nodes(container):
                if isinstance(child, ast.FunctionDef):
                    names.append(child.name)
                elif isinstance(child, (ast.stmt, ast.excepthandler)):
                    walk(child)

        walk(scope)
        return names

    def visit_FunctionDef(self, node: ast.FunctionDef):
        parameters = self._check_signature(node)
        declared = self._declared_functions(node)
        for name in declared:
            if name in ALLOWED_BUILTINS:
                raise ValidationError(f"a helper function cannot be named after the built-in {name}", node.lineno)
            if name in self._functions or declared.count(name) > 1 or name in parameters:
                raise ValidationError(f"{name} is already defined here and cannot be redefined", node.lineno)
        for parameter in parameters:
            if parameter in self._functions:
                raise ValidationError(f"{parameter} is a helper function and cannot be reused as a parameter", node.lineno)
        enclosing = self._functions
        self._functions = enclosing | frozenset(declared)
        self.helper_names.update(declared)
        self._depth += 1
        try:
            for statement in node.body:
                self.visit(statement)
        finally:
            self._depth -= 1
            self._functions = enclosing

    def _check_signature(self, node: ast.FunctionDef) -> list[str]:
        arguments = [*node.args.posonlyargs, *node.args.args, *node.args.kwonlyargs]
        if node.args.vararg is not None:
            arguments.append(node.args.vararg)
        if node.args.kwarg is not None:
            arguments.append(node.args.kwarg)
        # This method *is* the walk for a `def` header — nothing below visits
        # `node.args`, so every field of the signature is read here or nowhere.
        # `_check_fields` is what makes "or nowhere" a refusal.
        self._check_fields(node)
        self._check_fields(node.args)
        for argument in arguments:
            self._check_fields(argument)
        # A parameter binds a local from a plain `str` field, so `visit_Name`'s
        # reserved-prefix check never sees it — the same surface as a `def` name
        # and an `except ... as` name. Held to the same rule as all three.
        if any(argument.arg.startswith("_lab_") or argument.arg.startswith("__") for argument in arguments):
            raise ValidationError("reserved names are not allowed", node.lineno)
        names = [argument.arg for argument in node.args.args]
        # Nothing beyond plain positional parameters, at either depth. Defaults
        # matter most: they evaluate in the *enclosing* scope, which would be a
        # second place a player's expression runs, and nothing here needs them.
        simple = not (node.decorator_list or node.args.posonlyargs or node.args.vararg or
                      node.args.kwonlyargs or node.args.kwarg or node.args.defaults or node.args.kw_defaults)
        annotated = node.returns is not None or any(argument.annotation is not None for argument in arguments)
        if self._depth == 0:
            if annotated:
                raise ValidationError("solution annotations are not allowed", node.lineno)
            if node.name != "solution" or not simple or names != ["self", *self.parameter_names]:
                raise ValidationError(f"solution must be def solution(self, {', '.join(self.parameter_names)})", node.lineno)
            return names

        # A `def` name is a plain `str` field, exactly like `except X as name` and
        # a parameter, so `visit_Name`'s reserved-prefix check never sees it.
        # `def _lab_eval(...)` binds a local that shadows the instrumentation
        # helper the rewritten statements around it call — the player's function
        # would stand where the tracer expects its own.
        #
        # Those three are the whole `str`-field surface *of this signature*, and
        # they are checked here because nothing else can see them. What is not
        # provable by listing them is that no fourth exists: `type_params` was a
        # fourth, and it was reached from a field this method did not read at
        # all. `_check_fields` above is the answer to that, and it is the reason
        # this comment can say "the whole surface" without meaning "the surface
        # anyone thought of" — see the class docstring.
        if node.name == "solution" or node.name.startswith("__") or node.name.startswith("_lab_"):
            raise ValidationError("reserved names are not allowed", node.lineno)
        if annotated:
            raise ValidationError(f"def {node.name} annotations are not allowed", node.lineno)
        if not simple:
            raise ValidationError(
                f"def {node.name} must take plain positional parameters, with no defaults, *args or **kwargs",
                node.lineno,
            )
        return names

    def visit_Name(self, node: ast.Name):
        if node.id.startswith("__") or node.id.startswith("_lab_"):
            raise ValidationError("reserved names are not allowed", node.lineno)
        if isinstance(node.ctx, (ast.Store, ast.Del)) and node.id in self._functions:
            raise ValidationError(f"{node.id} is a helper function and cannot be reassigned", node.lineno)
        self._check_fields(node)
        self.generic_visit(node)

    def visit_ExceptHandler(self, node: ast.ExceptHandler):
        if node.name is not None and (node.name.startswith("__") or node.name.startswith("_lab_")):
            raise ValidationError("reserved names are not allowed", node.lineno)
        if node.name in self._functions:
            raise ValidationError(f"{node.name} is a helper function and cannot be reassigned", node.lineno)
        # A bare `except:` catches `BaseException`, which is what the event cap is
        # raised as. Requiring a named class is what keeps the cap uncatchable —
        # see `TraceLimit` — and it is also the only way to say which errors the
        # sandbox can actually produce.
        if node.type is None:
            raise ValidationError("name the error you are catching, for example: except ZeroDivisionError:", node.lineno)
        caught = node.type.elts if isinstance(node.type, ast.Tuple) else [node.type]
        for entry in caught:
            if not isinstance(entry, ast.Name) or entry.id not in ALLOWED_EXCEPTIONS:
                raise ValidationError(
                    f"only these errors can be caught: {', '.join(sorted(ALLOWED_EXCEPTIONS))}",
                    getattr(entry, "lineno", node.lineno),
                )
        self.generic_visit(node)

    def visit_Attribute(self, node: ast.Attribute):
        raise ValidationError("attribute access is not allowed", node.lineno)

    def visit_Call(self, node: ast.Call):
        if not isinstance(node.func, ast.Name) or node.func.id not in ALLOWED_BUILTINS | self._functions:
            raise ValidationError("only built-in functions and your own def helpers can be called", node.lineno)
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
        # Keyed by the `def` line, which is what a code object reports as its
        # `co_firstlineno`. Entering a call is the one event CPython hands us with
        # nothing but a code object, so this is how it gets Located and Named.
        self.function_metadata: dict[int, dict] = {}
        # Lines that run *on the way out*. Executing one is not evidence that an
        # error was handled, so the tracer must not read it as such — see the
        # `line` event.
        self.release_lines: set[int] = set()

    def visit(self, node: ast.AST):
        transformed = super().visit(node)
        if isinstance(transformed, ast.stmt):
            self.statement_metadata.setdefault(transformed.lineno, self._metadata_value(transformed))
            if isinstance(transformed, ast.FunctionDef):
                self.function_metadata.setdefault(transformed.lineno, self._function_metadata_value(transformed))
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
            # Names and constants are deliberately quiet in ordinary expressions,
            # but an assignment's RHS needs one semantic value frame even when it
            # is only `b` or `1`. The UI can then use the same located frame for
            # every assignment instead of parsing Python or special-casing AST
            # shapes. The thunk evaluates the RHS exactly once.
            value = getattr(node, "value", None)
            if isinstance(value, ast.expr) and type(value).__name__ in EXCLUDED_EXPRESSION_TYPES:
                node.value = self._wrap(value)
            targets = node.targets if hasattr(node, "targets") else [node.target]
            after.append(self._event(node, "binding", names=[name for target in targets for name in self._target_names(target)]))
        # A pure decision (`if`) is already fully described by its own test frame;
        # opening a block around it would double every branch the player writes.
        if "block" in roles and ("repeats" in roles or "decision" not in roles):
            before.append(self._event(node, "block_enter"))
            release = getattr(node, "finalbody", None)
            if release:
                # A statement that owns a `finalbody` reports its exit from inside
                # that suite, because that is the one place the release provably
                # happened on *both* paths. Reporting it after the statement — as
                # every other block does — reports it only on the path where
                # nothing went wrong, which is the path that teaches nothing.
                self.release_lines.add(node.lineno)
                for statement in release:
                    self.release_lines.update(range(statement.lineno, (statement.end_lineno or statement.lineno) + 1))
                release.append(self._event(node, "block_exit"))
            else:
                after.append(self._event(node, "block_exit"))
        if "repeats" in roles:
            target = getattr(node, "target", None)
            # How far this loop will go, asked of the iterable object itself and
            # nowhere else. `block_enter` fires *before* the iterable is
            # evaluated, so there is nothing to measure there; correlating with a
            # neighbouring `value` frame does not work either, because a bare
            # `Name` iterable — `for value in nums`, the commonest form a player
            # writes — is excluded from the generic expression pass and emits no
            # `value` frame at all. The iterable expression is the only place the
            # object is in hand, so that is where the question is asked.
            if getattr(node, "iter", None) is not None:
                node.iter = self._extent(node, node.iter)
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

    def _function_metadata_value(self, node: ast.FunctionDef) -> dict[str, Any]:
        """`def helper(n):` — the whole header, colon included.

        The generic block rule ends a header at its last sub-expression, which is
        right for `for value in nums` and one character short for a signature: a
        player reading "went into `def helper(n`" is reading a typo. The colon is
        the header's own terminator, so the range is extended to it rather than to
        the end of the line, which would swallow a trailing comment.
        """
        location = dict(self._location(node))
        line = self.lines[location["end_lineno"] - 1] if location["end_lineno"] <= len(self.lines) else ""
        colon = line.encode().find(b":", location["end_col_offset"])
        if colon != -1:
            location["end_col_offset"] = colon + 1
        return {"source": self._segment(location) or f"def {node.name}", "location": location}

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

    def _extent(self, statement: ast.stmt, iterable: ast.expr) -> ast.Call:
        """`for x in nums:` → `for x in _lab_extent(<where>, nums):`.

        The iterable is passed through unchanged, so the loop's own semantics are
        untouched — the wrapper only looks at what it is handed.

        It *carries* the statement's range, because that range is what identifies
        the loop instance being measured, but every node it introduces is located
        on the **iterable**. A block's header ends at the furthest reach of its
        non-suite fields, so a synthetic node located on the whole `for` statement
        would drag that header down over the loop body — the loop would report
        itself as its own contents.
        """
        call = ast.Call(
            func=ast.Name(id="_lab_extent", ctx=ast.Load()),
            args=[self._literal(self._metadata_value(statement), iterable), iterable],
            keywords=[],
        )
        return ast.copy_location(call, iterable)

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
    if isinstance(value, BaseException):
        # `except ValueError as e` binds one of these. Rendering it as "not JSON"
        # would make the only variable the handler is about the one variable the
        # player cannot read.
        message = str(value)
        return f"{type(value).__name__}: {message}" if message else type(value).__name__
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


def player_code_objects(code: CodeType, helper_names: set[str]) -> set[CodeType]:
    """Every code object the player wrote, and nothing the instrumentation wrote.

    Matching on the filename would sweep in the lambdas every wrapped expression
    is evaluated inside, and tracing those would report the instrumentation's own
    frame as the player's. Matching on names the Validator itself collected keeps
    the set to `solution` plus the helpers it approved.
    """
    found = {code}
    for const in code.co_consts:
        if isinstance(const, CodeType) and const.co_name in helper_names:
            found |= player_code_objects(const, helper_names)
    return found


def _unnamed_call(frame) -> dict[str, Any]:
    """Fallback naming for a code object with no recorded `def` header.

    Unreachable while the Validator and the transformer agree on what a function
    is; it exists so that a disagreement costs a vague label rather than a frame
    the player never sees.
    """
    line = frame.f_code.co_firstlineno
    return {
        "source": f"def {frame.f_code.co_name}",
        "location": {"lineno": line, "col_offset": 0, "end_lineno": line, "end_col_offset": 0},
    }


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
        validator = Validator(parameter_names)
        validator.visit(tree)
    except (SyntaxError, ValidationError) as exc:
        return {"status": "syntax", "frames": [], "error": {"message": str(exc), "line": getattr(exc, "line", getattr(exc, "lineno", None)), "kind": "syntax"}}

    frames: list[dict] = []
    active_frame = None
    player_codes: set[CodeType] = set()
    # The error in flight, captured where it was raised rather than where the
    # frame happens to be when it leaves: a `finally` moves the line, and the
    # player needs the statement that broke, not the one that cleaned up.
    unwinding: dict[str, Any] | None = None
    # One record per *live loop instance*, not per source location.
    #
    # The previous counter was keyed by `(lineno, col_offset)` alone and never
    # reset, so an inner `range(3)` inside an outer `range(30)` reported
    # iteration 87 of 3 — invisible on a card, and a marker past the end of its
    # own loop on a track. A loop instance is a location *within one live call
    # frame*: recursion gives every level its own frame, and re-entering the same
    # loop in the same frame clears the record at its `block_exit`.
    loop_instances: dict[tuple[int, int | None, int | None], dict[str, Any]] = {}
    loop_serial = 0
    # An extent measured at the iterable, waiting for the first `repetition` of
    # the instance it belongs to. Keyed by location alone, and that is sound: the
    # loop's own body is the only thing that can run between the measurement and
    # the first repetition, and the body cannot reach this location again without
    # first passing through it.
    pending_extents: dict[tuple[int | None, int | None], int] = {}
    # One record per live player call, innermost last: the frame, that frame's own
    # previously reported locals, and how to name it. `previous` is per call and
    # not per run because a shared one reports every local of the function you
    # just came back to as freshly changed.
    calls: list[dict[str, Any]] = []
    transformer = InstrumentExecution(source)

    def call_stack() -> list[dict[str, Any]]:
        """Outermost first, adjacent identical calls collapsed to one with a count.

        Recursion is a wall of the same line otherwise, and the player needs to
        read the shape of the stack, not count it.
        """
        entries: list[dict[str, Any]] = []
        for record in calls:
            located = record["metadata"]
            if entries and entries[-1].get("source") == located["source"]:
                entries[-1]["count"] = entries[-1].get("count", 1) + 1
                continue
            entries.append({"source": located["source"], "line": located["location"]["lineno"]})
        if len(entries) > MAX_STACK_ENTRIES:
            hidden = len(entries) - (MAX_STACK_ENTRIES - 1)
            entries = [entries[0], {"hidden": hidden}, *entries[-(MAX_STACK_ENTRIES - 2):]]
        return entries

    def emit(kind: str, metadata: dict | None = None, **extra: Any):
        if len(frames) >= max_events:
            raise TraceLimit()
        record = calls[-1] if calls else None
        # CPython 3.14 exposes a FrameLocalsProxy; materialize it before
        # serializing so the debugger receives actual variable bindings.
        # A helper the player defined is a declaration in scope, not a value they
        # are holding — showing it would put an unreadable "not JSON" chip beside
        # every real variable for the whole run. Recognised by its code object
        # rather than its name, so it can never hide a variable that merely
        # shares a name with a helper in another scope.
        held = {
            key: value for key, value in dict(active_frame.f_locals).items()
            if key != "self" and getattr(value, "__code__", None) not in player_codes
        } if active_frame else {}
        locals_snapshot = json_value(held)
        # Sent in full alongside `locals`, not as a delta. A delta would be
        # smaller than a map of short type names but strictly larger than
        # nothing, and it would make the state at step N depend on steps 1..N-1 —
        # which is the one property the scrubber cannot afford.
        types_snapshot = {key: type_name(value) for key, value in held.items()}
        previous = record["previous"] if record else {}
        changed = sorted(key for key, value in locals_snapshot.items() if previous.get(key) != value)
        if record is not None:
            record["previous"] = dict(locals_snapshot)
        located = metadata or (transformer.statement_metadata.get(active_frame.f_lineno) if active_frame else None)
        frame = {
            "sequence": len(frames),
            "kind": kind,
            "line": (located["location"]["lineno"] if located else None) or (active_frame.f_lineno if active_frame else None),
            "locals": locals_snapshot,
            "types": types_snapshot,
            "changed": changed,
            **({"source": located["source"], "location": located["location"]} if located else {}),
            # Only when there is a chain to read. A program that never calls its
            # own helper is not holding a stack the player has to think about.
            **({"stack": call_stack()} if len(calls) > 1 else {}),
            **extra,
        }
        frames.append(frame)
        if on_frame is not None:
            on_frame(frame)

    def tracer(frame, event, arg):
        nonlocal active_frame, unwinding
        if frame.f_code not in player_codes:
            return None
        if event == "call":
            # The one event CPython gives us with no node: name it from the `def`
            # line its code object reports, so going into a helper reads as going
            # in rather than as an unexplained jump to another part of the file.
            located = transformer.function_metadata.get(frame.f_code.co_firstlineno)
            calls.append({"frame": frame, "previous": {}, "metadata": located or _unnamed_call(frame)})
            active_frame = frame
            emit("block_enter", calls[-1]["metadata"])
            return tracer
        active_frame = frame
        if event == "exception":
            # Provisional: an error is in flight. If the player catches it, the
            # next `line` event clears this and the run continues normally.
            unwinding = {
                "error": describe_exception(arg[1]),
                "line": frame.f_lineno,
                "metadata": transformer.statement_metadata.get(frame.f_lineno),
            }
        elif event == "line":
            # Reaching a new line normally means the player caught the error and
            # the run continues. A `finally` is the exception: it runs *because*
            # the error is still in flight, so treating it as recovery reported a
            # broken program as one that returned a value.
            if frame.f_lineno not in transformer.release_lines:
                unwinding = None
        elif event == "return":
            # CPython reports a `return` when a frame is left by an exception too,
            # with arg None. Reporting that as the returned value would tell the
            # player their program returned nothing when it in fact broke.
            if unwinding is None:
                emit("result", value=json_value(arg))
            else:
                # Left deliberately set: the same error is about to surface as an
                # `exception` event in the caller, and each frame it leaves is a
                # step out the player watched happen.
                emit("unwind", unwinding["metadata"], detail={"error": unwinding["error"]})
            # A `return` out of a loop body never reaches that loop's
            # `block_exit` — the exit is emitted as a statement *after* the loop,
            # which a `break` reaches and a `return` does not. Left behind, the
            # instance record outlives its frame, and under recursion a later
            # frame reusing the same `id()` would inherit its count. The frame is
            # leaving, so every loop it was running is over.
            for key in [key for key in loop_instances if key[0] == id(frame)]:
                del loop_instances[key]
            if calls and calls[-1]["frame"] is frame:
                calls.pop()
            # The outermost return leaves nothing to go back to, and this frame's
            # line is the last thing that happened — which is what a terminal
            # error payload has to report.
            active_frame = calls[-1]["frame"] if calls else frame
        return tracer

    def trace_eval(metadata: dict, thunk):
        value = thunk()
        emit("value", metadata, value=json_value(value))
        return value

    def instance_key(metadata: dict) -> tuple[int, int | None, int | None]:
        location = metadata["location"]
        return (id(active_frame), location["lineno"], location["col_offset"])

    def loop_instance(metadata: dict, create: bool) -> dict[str, Any] | None:
        nonlocal loop_serial
        key = instance_key(metadata)
        record = loop_instances.get(key)
        if record is None and create:
            loop_serial += 1
            location = metadata["location"]
            record = {
                "id": loop_serial,
                "count": 0,
                "extent": pending_extents.pop((location["lineno"], location["col_offset"]), None),
            }
            loop_instances[key] = record
        return record

    def trace_extent(metadata: dict, iterable: Any) -> Any:
        """Measure the iterable if it is safe to, then hand it back untouched.

        Safe means: a built-in sized type, whose `len` is a C slot. A player's own
        object with a `__len__` is deliberately *not* asked — running player code
        inside the tracer's own frame is a sandbox change, and an unmeasurable
        loop already has an honest shape on screen.
        """
        # Exact type, not `isinstance`: a subclass may override `__len__`, and
        # that override is player code.
        if type(iterable) in MEASURABLE_TYPES:
            location = metadata["location"]
            pending_extents[(location["lineno"], location["col_offset"])] = len(iterable)
        return iterable

    def trace_event(metadata: dict, kind: str, names: list[str] | None = None):
        nonlocal unwinding
        detail: dict[str, Any] = {}
        if kind == "block_exit" and unwinding is not None:
            # Both facts on one card, adjacent: the thing that broke, and the
            # release that happened anyway. That adjacency is the only reason
            # `finally` exists, and it is what the player is here to learn.
            detail["error"] = unwinding["error"]
        if kind == "repetition":
            instance = loop_instance(metadata, create=True)
            instance["count"] += 1
            detail["iteration"] = instance["count"]
            detail["loop"] = instance["id"]
            if instance["extent"] is not None:
                # Carried on every repetition, not only the first. It is one small
                # integer, and it is what lets the screen draw a track from any
                # step the player drags to without walking the frames before it.
                detail["extent"] = instance["extent"]
        if kind == "block_exit":
            # Only a *loop* block has a record here; a `with` or a `try` at some
            # other location finds nothing and is untouched. This is the same
            # identity the track was opened with, which is what matches a closing
            # block to the right track when loops nest.
            closing = loop_instance(metadata, create=False)
            if closing is not None:
                detail["loop"] = closing["id"]
                loop_instances.pop(instance_key(metadata), None)
        if names:
            detail["bindings"] = {
                name: json_value(active_frame.f_locals[name])
                for name in names
                if active_frame is not None and name in active_frame.f_locals
            }
        emit(kind, metadata, **({"detail": detail} if detail else {}))
        if kind == "unwind":
            # Reaching a handler *is* the player catching it — the precise signal
            # the `line` event only approximates, and the one that survives a
            # `try` nested inside a `finally`, where every line is a release line
            # and so no line event may clear anything.
            unwinding = None

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
        "_lab_extent": trace_extent,
        "_lab_decision": trace_decision,
        "__name__": "__compute_lab__",
    }
    try:
        instrumented = transformer.visit(tree)
        ast.fix_missing_locations(instrumented)
        exec(compile(instrumented, "<compute-lab>", "exec"), namespace)
        solver = namespace["ProblemSolver"]()
        player_codes = player_code_objects(solver.solution.__code__, validator.helper_names)
        sys.settrace(tracer)
        value = solver.solution(**params)
        sys.settrace(None)
        return {"status": "trace_ready", "frames": frames, "returnValue": json_value(value)}
    except TraceLimit:
        sys.settrace(None)
        return {"status": "limit", "frames": frames, "error": {"message": "Trace event limit reached", "line": active_frame.f_lineno if active_frame else None, "kind": "limit"}}
    except Exception as exc:
        sys.settrace(None)
        # The line the error was raised on, not the one a `finally` left the
        # frame sitting on; the outcome panel and the landing card must name the
        # same statement.
        line = unwinding["line"] if unwinding else (active_frame.f_lineno if active_frame else None)
        return {"status": "runtime", "frames": frames, "error": {"message": describe_exception(exc), "line": line, "kind": type(exc).__name__}}


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
