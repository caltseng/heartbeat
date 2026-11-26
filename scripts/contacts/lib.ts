import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { RecordEntry, StoredRevision } from './types.ts';

const SOURCES = ['google-contacts', 'email', 'text-messages', 'messenger', 'whatsapp'];
const CHANNELS = {
  email: ['email'], 'text-messages': ['sms', 'mms', 'rcs', 'imessage'],
  messenger: ['messenger'], whatsapp: ['whatsapp'], 'google-contacts': []
};
const versions = (entry: RecordEntry): StoredRevision[] => entry.revisions ||
  [{ id: '$initial', supersedes: null, record: entry.record, provenance: entry.provenance }];

const ROOT = path.resolve(__dirname, '..', '..');
const PRIVATE = path.join(ROOT, '.private', 'contacts');
const hash = (value: crypto.BinaryLike): string => crypto.createHash('sha256').update(value).digest('hex');
const hashJSON = (value: unknown): string => hash(JSON.stringify(value));
const stripBOM = (value: string): string => value.replace(/^\uFEFF/, '');
const parseJSON = (value: string) => JSON.parse(stripBOM(value));
const hasUnsupportedTextControls = (value: string): boolean => /\r(?!\n)|[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFEFF]/.test(value);

class CollectionError extends Error {
  constructor(public readonly code: string, message = code,
    public readonly status = 'failed', public readonly retryable = false,
    public readonly domain = 'collection') { super(message); }
}
function requireValue(condition: unknown, message: string, code = 'invalid_input'): asserts condition {
  if (!condition) throw new CollectionError(code, message);
}
type Guard = (condition: unknown, message: string, code?: string) => void;
function createGuard(defaultCode: string): Guard {
  return (condition, message, code = defaultCode) => {
    if (!condition) throw new CollectionError(code, message);
  };
}
function createError(domain: string, message: (code: string) => string = code => code) {
  return (code: string, status = 'failed', retryable = false) =>
    new CollectionError(code, message(code), status, retryable, domain);
}
function isError(error: unknown, domain: string): error is CollectionError {
  return error instanceof CollectionError && error.domain === domain;
}
function createConversionError(domain: string) {
  // Keep the exported (code, status) constructors without adding error subclasses.
  return new Proxy(CollectionError, {
    construct(target, [code, status = 'failed'], newTarget) {
      return Reflect.construct(target, [code, code, status, false, domain], newTarget);
    },
    get(target, property, receiver) {
      if (property === Symbol.hasInstance) return function (error: unknown) {
        return isError(error, domain) && Function.prototype[Symbol.hasInstance].call(this, error);
      };
      return Reflect.get(target, property, receiver);
    }
  });
}
function need(condition: unknown, code: string, status = 'failed',
  failure = createError('conversion')): void {
  if (!condition) throw failure(code, status);
}
function createCodeGuard(defaultCode: string, failure: ReturnType<typeof createError>) {
  return (condition: unknown, code = defaultCode, status?: string) => need(condition, code, status, failure);
}
function createCodeValidators(guard: ReturnType<typeof createCodeGuard>, defaultCode: string) {
  return {
    object: (value: unknown, fields: readonly string[], code = defaultCode) => shape(value, fields, guard, code),
    instant: (value: unknown) => instant(value, undefined, (condition) => guard(condition), {
      canonicalInstant: true, fourDigitYear: true
    })
  };
}
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
type ValidationMessage = string | ((label: string) => string);
interface ValidationOptions {
  objectMessage?: ValidationMessage;
  fieldsMessage?: ValidationMessage;
  textMessage?: ValidationMessage;
  identifierMessage?: string;
  instantMessage?: string;
  canonicalInstant?: boolean;
  fourDigitYear?: boolean;
}
const validationMessage = (message: ValidationMessage, label: string): string =>
  typeof message === 'function' ? message(label) : message;
function object<T>(value: T, allowed: readonly string[], label: string,
  guard: Guard = requireValue, options: ValidationOptions = {}): asserts value is T & Record<string, unknown> {
  const valid = value && typeof value === 'object' && !Array.isArray(value);
  const fieldsMessage = validationMessage(options.fieldsMessage ??
    (label => `${label} has unsupported fields; message bodies and credentials are not accepted.`), label);
  guard(valid, options.objectMessage ? validationMessage(options.objectMessage, label) :
    options.fieldsMessage ? fieldsMessage : `${label} must be an object.`);
  guard(Object.keys(value).every(key => allowed.includes(key)), fieldsMessage);
}
function text(value: unknown, label: string, guard: Guard = requireValue,
  message: ValidationMessage = label => `${label} must be nonempty text.`): string {
  guard(isText(value), validationMessage(message, label));
  return value as string;
}
function identifier(value: unknown, guard: Guard, message: string): string {
  guard(typeof value === 'string' && /^[a-z][a-z0-9-]{0,95}$/.test(value), message);
  return value as string;
}
function sourceIdentifier(record, fields: string[], label: string): void {
  object(record, ['id', 'idKind', 'revision', ...fields], label);
  text(record.id, `${label}.id`);
  requireValue(['provider', 'local'].includes(record.idKind), `${label}.idKind must distinguish provider and local IDs.`);
}
function shape(value: unknown, fields: readonly string[], guard: (condition: unknown, code: string) => void = need,
  code = 'invalid_manifest'): void {
  object(value, fields, undefined, condition => guard(condition, code));
}
function createValidators(guard: Guard, options: ValidationOptions = {}) {
  return {
    object: (value: unknown, fields: readonly string[], label?: string) => object(value, fields, label, guard, options),
    text: (value: unknown, label?: string) => text(value, label, guard, options.textMessage),
    identifier: (value: unknown) => identifier(value, guard, options.identifierMessage ?? 'Invalid identifier.'),
    instant: (value: unknown, label?: string) => instant(value, label, guard, options)
  };
}
function array(value: unknown, label: string) {
  requireValue(Array.isArray(value), `${label} must be an array.`);
  return value;
}
function instant(value: unknown, label: string, guard: Guard = requireValue, options: ValidationOptions = {}): string {
  if (options.canonicalInstant) {
    guard(typeof value === 'string' && (!options.fourDigitYear || /^\d{4}-/.test(value)) &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString() === value, options.instantMessage);
    return value as string;
  }
  guard(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value) &&
    Number.isFinite(Date.parse(value)), `${label} must be an ISO timestamp with an offset.`);
  const timestamp = value as string, date = timestamp.slice(0, 10);
  guard(new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date, `${label} has an invalid calendar date.`);
  return new Date(timestamp).toISOString();
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
  CollectionError, requireValue, createGuard, createError, createConversionError, isError, need, shape, isText,
  createCodeGuard, createCodeValidators,
  createValidators, object, text, identifier, sourceIdentifier, array, instant, SOURCES, CHANNELS, versions,
  readJSONValue, readJSONWithDigest, readJSON, within, outputLocation,
  openLock, releaseLock, writeExclusive, persistText, persist, publish, publishText, runCLI
};
