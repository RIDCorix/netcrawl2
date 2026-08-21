import { isSafeProblemRelativePath, uriIsInside } from './pathSecurity';

export type ProblemUri = {
  scheme: string;
  authority: string;
  path: string;
  toString(): string;
};

export type ProblemFileServices<Uri extends ProblemUri, Document> = {
  joinPath(root: Uri, ...segments: string[]): Uri;
  stat(uri: Uri): PromiseLike<{ type: number }>;
  createDirectory(uri: Uri): PromiseLike<void>;
  readFile(uri: Uri): PromiseLike<Uint8Array>;
  writeFile(uri: Uri, content: Uint8Array): PromiseLike<void>;
  openTextDocument(uri: Uri): PromiseLike<Document>;
  isFileNotFound(error: unknown): boolean;
  chooseSource(): PromiseLike<'keep' | 'replace' | 'cancel'>;
};

const FILE = 1;
const DIRECTORY = 2;
const SYMBOLIC_LINK = 64;

async function statIfPresent<Uri extends ProblemUri, Document>(uri: Uri, services: ProblemFileServices<Uri, Document>) {
  try {
    return await services.stat(uri);
  } catch (error) {
    if (services.isFileNotFound(error)) return undefined;
    throw error;
  }
}

function requireSafeType(stat: { type: number }, expected: 'directory' | 'file', relativePath: string) {
  if ((stat.type & SYMBOLIC_LINK) !== 0)
    throw new Error(`NetCrawl refused a symbolic link inside the workspace: ${relativePath}`);
  const expectedType = expected === 'directory' ? DIRECTORY : FILE;
  if ((stat.type & expectedType) === 0)
    throw new Error(`NetCrawl refused an unknown or non-${expected} workspace path: ${relativePath}`);
}

async function verifyProblemPath<Uri extends ProblemUri, Document>(
  root: Uri,
  segments: string[],
  services: ProblemFileServices<Uri, Document>,
  createParents: boolean,
) {
  for (let index = 1; index < segments.length; index += 1) {
    const relativePath = segments.slice(0, index).join('/');
    const uri = services.joinPath(root, ...segments.slice(0, index));
    if (!uriIsInside(root, uri)) throw new Error('NetCrawl refused a path outside the selected workspace');
    let stat = await statIfPresent(uri, services);
    if (!stat && createParents) {
      await services.createDirectory(uri);
      stat = await statIfPresent(uri, services);
    }
    if (!stat) throw new Error(`NetCrawl could not verify workspace directory: ${relativePath}`);
    requireSafeType(stat, 'directory', relativePath);
  }

  const candidate = services.joinPath(root, ...segments);
  if (!uriIsInside(root, candidate)) throw new Error('NetCrawl refused a path outside the selected workspace');
  const candidateStat = await statIfPresent(candidate, services);
  if (candidateStat) requireSafeType(candidateStat, 'file', segments.join('/'));
  return candidate;
}

export async function assertProblemFileSafe<Uri extends ProblemUri, Document>(
  root: Uri,
  relativePath: unknown,
  services: ProblemFileServices<Uri, Document>,
) {
  if (!isSafeProblemRelativePath(relativePath)) throw new Error('NetCrawl refused a path outside netcrawl/problems');
  return verifyProblemPath(root, relativePath.split('/'), services, false);
}

export async function openProblemFile<Uri extends ProblemUri, Document>(
  root: Uri,
  relativePath: unknown,
  source: string,
  services: ProblemFileServices<Uri, Document>,
) {
  if (!isSafeProblemRelativePath(relativePath)) throw new Error('NetCrawl refused a path outside netcrawl/problems');
  const segments = relativePath.split('/');
  let candidate = await verifyProblemPath(root, segments, services, true);
  let wroteBrowserSource = true;
  try {
    candidate = await verifyProblemPath(root, segments, services, false);
    const existing = new TextDecoder().decode(await services.readFile(candidate));
    if (existing !== source) {
      const choice = await services.chooseSource();
      if (choice === 'cancel') throw new Error('Open cancelled; the workspace file was not changed');
      wroteBrowserSource = choice === 'replace';
    }
  } catch (error) {
    if (services.isFileNotFound(error)) {
      wroteBrowserSource = true;
    } else {
      throw error;
    }
  }
  if (wroteBrowserSource) {
    candidate = await verifyProblemPath(root, segments, services, false);
    await services.writeFile(candidate, new TextEncoder().encode(source));
  }
  candidate = await verifyProblemPath(root, segments, services, false);
  const document = await services.openTextDocument(candidate);
  return { candidate, document, wroteBrowserSource };
}
