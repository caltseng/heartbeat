import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(__dirname, '..', '..');
const PRIVATE = path.join(ROOT, '.private', 'contacts');
const hash = (value: crypto.BinaryLike): string => crypto.createHash('sha256').update(value).digest('hex');
const hashJSON = (value: unknown): string => hash(JSON.stringify(value));
const stripBOM = (value: string): string => value.replace(/^\uFEFF/, '');
const parseJSON = (value: string) => JSON.parse(stripBOM(value));
const hasUnsupportedTextControls = (value: string): boolean => /\r(?!\n)|[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFEFF]/.test(value);

class CollectionError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}
function requireValue(condition: unknown, message: string, code = 'invalid_input'): asserts condition {
  if (!condition) throw new CollectionError(code, message);
}
type Guard = (condition: unknown, message: string, code?: string) => void;
function createGuard(defaultCode: string): Guard {
  return (condition, message, code = defaultCode) => {
    if (!condition) throw Object.assign(new Error(message), { code });
  };
}
function object<T>(value: T, allowed: readonly string[], label: string): asserts value is T & Record<string, unknown> {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object.`);
  requireValue(Object.keys(value).every(key => allowed.includes(key)), `${label} has unsupported fields; message bodies and credentials are not accepted.`);
}
function text(value: unknown, label: string): string {
  requireValue(typeof value === 'string' && value.trim().length > 0, `${label} must be nonempty text.`);
  return value;
}
function array(value: unknown, label: string) {
  requireValue(Array.isArray(value), `${label} must be an array.`);
  return value;
}
function instant(value: unknown, label: string): string {
  requireValue(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value) &&
    Number.isFinite(Date.parse(value)), `${label} must be an ISO timestamp with an offset.`);
  const date = value.slice(0, 10);
  requireValue(new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date, `${label} has an invalid calendar date.`);
  return new Date(value).toISOString();
}
function readJSONValue(file: fs.PathOrFileDescriptor) {
  return parseJSON(fs.readFileSync(file, 'utf8'));
}
function readJSONWithDigest(file: fs.PathOrFileDescriptor) {
  const raw = fs.readFileSync(file, 'utf8');
  return { value: parseJSON(raw), digest: hash(raw) };
}
function errorCode(error: unknown): string | undefined {
  return error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
}
function readJSON(file: fs.PathOrFileDescriptor) {
  let data;
  try { data = fs.readFileSync(file, 'utf8'); }
  catch (error) {
    if (['ENOENT', 'EACCES', 'EISDIR'].includes(errorCode(error) ?? '')) throw new CollectionError('input_unreadable', 'A requested JSON input cannot be read.');
    throw error;
  }
  try { return { value: parseJSON(data), digest: hash(data) }; }
  catch (error) {
    if (error instanceof SyntaxError) throw new CollectionError('invalid_json', 'A requested input is not valid JSON.');
    throw error;
  }
}
function within(folder: string, file: string): boolean {
  const relative = path.relative(folder, file);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}
function realLocation(file: string): string {
  if (fs.existsSync(file)) return fs.realpathSync(file);
  const parent = path.dirname(file);
  requireValue(parent !== file, 'Cannot resolve output location.');
  return path.join(realLocation(parent), path.basename(file));
}
function outputLocation(value: unknown): string {
  const target = path.resolve(text(value, 'output'));
  const resolved = realLocation(target);
  const root = fs.realpathSync(ROOT);
  const privateRoot = path.join(root, '.private', 'contacts');
  requireValue(!within(root, resolved) || (within(privateRoot, resolved) && within(PRIVATE, target)),
    'Output inside this checkout is allowed only under .private\\contacts, never in website or tracked data folders.', 'unsafe_output');
  requireValue(target === resolved || !within(root, resolved), 'Private output must not use a redirected directory.', 'unsafe_output');
  return target;
}
function openLock(lock: fs.PathLike, lockedError: () => Error): number {
  try { return fs.openSync(lock, 'wx', 0o600); }
  catch (error) {
    if (errorCode(error) === 'EEXIST') throw lockedError();
    throw error;
  }
}
function releaseLock(lock: fs.PathLike, fd: number | undefined): void {
  if (fd !== undefined) { fs.closeSync(fd); fs.unlinkSync(lock); }
}
function writeExclusive(file: fs.PathLike, contents: string): void {
  const fd = fs.openSync(file, 'wx', 0o600);
  writeAndClose(fd, contents);
}
function writeAndClose(fd: number, contents: string): void {
  try { fs.writeFileSync(fd, contents); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
}
function writeTemporary(file: string, contents: string, temporary: string, commit: (from: string, to: string) => void): void {
  // Open before the cleanup scope: a collision belongs to another writer.
  const fd = fs.openSync(temporary, 'wx', 0o600);
  try {
    writeAndClose(fd, contents);
    commit(temporary, file);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
function persistText(file: string, contents: string, temporary = `${file}.${process.pid}.tmp`): void {
  writeTemporary(file, contents, temporary, fs.renameSync);
}
function persist(file: string, state: unknown): void {
  persistText(file, JSON.stringify(state, null, 2) + '\n');
}
function publish(file: string, state: unknown): void {
  publishText(file, JSON.stringify(state, null, 2) + '\n');
}
function publishText(file: string, contents: string): void {
  const temporary = `${file.replace(/\.json$/i, '')}.${crypto.randomUUID()}.tmp`;
  // A hard link publishes atomically without replacing an existing file or symlink.
  writeTemporary(file, contents, temporary, fs.linkSync);
}
async function runCLI(action: () => number | Promise<number>, onError: (error: Error & { code?: string; status?: string }) => number): Promise<void> {
  try { process.exitCode = await action(); }
  catch (error) { process.exitCode = onError(error); }
}

export {
  hash, hashJSON, stripBOM, parseJSON, hasUnsupportedTextControls, errorCode,
  CollectionError, requireValue, createGuard, object, text, array, instant,
  readJSONValue, readJSONWithDigest, readJSON, within, outputLocation,
  openLock, releaseLock, writeExclusive, persistText, persist, publish, publishText, runCLI
};
