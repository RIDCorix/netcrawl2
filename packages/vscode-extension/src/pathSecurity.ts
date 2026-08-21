export function isSafeProblemRelativePath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 260) return false;
  if (value.startsWith('/') || value.startsWith('\\') || value.includes('\\') || value.includes('\0')) return false;
  const segments = value.split('/');
  return (
    segments.length >= 3 &&
    segments[0] === 'netcrawl' &&
    segments[1] === 'problems' &&
    segments.every(
      segment => segment !== '' && segment !== '.' && segment !== '..' && /^[a-zA-Z0-9._-]+$/.test(segment),
    ) &&
    value.endsWith('.py')
  );
}

export function uriIsInside(root: { scheme: string; authority: string; path: string }, candidate: typeof root) {
  const prefix = root.path.endsWith('/') ? root.path : `${root.path}/`;
  return (
    candidate.scheme === root.scheme && candidate.authority === root.authority && candidate.path.startsWith(prefix)
  );
}

export function byteColumnToCodeUnit(line: string, byteColumn: number) {
  let bytes = 0;
  let codeUnits = 0;
  for (const character of line) {
    if (bytes >= byteColumn) break;
    bytes += new TextEncoder().encode(character).length;
    codeUnits += character.length;
  }
  return bytes === byteColumn ? codeUnits : undefined;
}
