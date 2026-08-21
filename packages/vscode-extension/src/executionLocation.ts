export type ExecutionSourceLocation = {
  lineno: number;
  col_offset: number;
  end_lineno: number;
  end_col_offset: number;
};

const TERMINAL_STATUSES = new Set(['trace_ready', 'syntax', 'runtime', 'timeout', 'limit', 'disconnected']);

function validLocation(value: unknown): value is ExecutionSourceLocation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const location = value as Record<string, unknown>;
  const { lineno, col_offset, end_lineno, end_col_offset } = location;
  return (
    Object.keys(location).every(key => ['lineno', 'col_offset', 'end_lineno', 'end_col_offset'].includes(key)) &&
    Number.isInteger(lineno) &&
    Number.isInteger(col_offset) &&
    Number.isInteger(end_lineno) &&
    Number.isInteger(end_col_offset) &&
    (lineno as number) >= 1 &&
    (col_offset as number) >= 0 &&
    (end_lineno as number) >= (lineno as number) &&
    (end_col_offset as number) >= 0 &&
    ((end_lineno as number) !== (lineno as number) || (end_col_offset as number) >= (col_offset as number))
  );
}

export function latestLiveExecutionLocation(
  status: string,
  frames: ReadonlyArray<{ location?: unknown }> | undefined,
): ExecutionSourceLocation | undefined {
  if (TERMINAL_STATUSES.has(status)) return undefined;
  for (let index = (frames?.length || 0) - 1; index >= 0; index -= 1) {
    const location = frames?.[index]?.location;
    if (validLocation(location)) return location;
  }
  return undefined;
}
