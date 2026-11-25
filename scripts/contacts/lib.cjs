const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const PRIVATE = path.join(ROOT, '.private', 'contacts');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const hashJSON = value => hash(JSON.stringify(value));
const stripBOM = value => value.replace(/^\uFEFF/, '');
const parseJSON = value => JSON.parse(stripBOM(value));
const hasUnsupportedTextControls = value => /\r(?!\n)|[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFEFF]/.test(value);

class CollectionError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
function requireValue(condition, message, code = 'invalid_input') {
  if (!condition) throw new CollectionError(code, message);
}
function createGuard(defaultCode) {
  return (condition, message, code = defaultCode) => {
    if (!condition) throw Object.assign(new Error(message), { code });
  };
}
function object(value, allowed, label) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object.`);
  requireValue(Object.keys(value).every(key => allowed.includes(key)), `${label} has unsupported fields; message bodies and credentials are not accepted.`);
}
function text(value, label) {
  requireValue(typeof value === 'string' && value.trim().length > 0, `${label} must be nonempty text.`);
  return value;
}
function array(value, label) {
  requireValue(Array.isArray(value), `${label} must be an array.`);
  return value;
}
function instant(value, label) {
  requireValue(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value) &&
    Number.isFinite(Date.parse(value)), `${label} must be an ISO timestamp with an offset.`);
  const date = value.slice(0, 10);
  requireValue(new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date, `${label} has an invalid calendar date.`);
  return new Date(value).toISOString();
}
function readJSONValue(file) {
  return parseJSON(fs.readFileSync(file, 'utf8'));
}
function readJSONWithDigest(file) {
  const raw = fs.readFileSync(file, 'utf8');
  return { value: parseJSON(raw), digest: hash(raw) };
}
function readJSON(file) {
  let data;
  try { data = fs.readFileSync(file, 'utf8'); }
  catch (error) {
    if (['ENOENT', 'EACCES', 'EISDIR'].includes(error.code)) throw new CollectionError('input_unreadable', 'A requested JSON input cannot be read.');
    throw error;
  }
  try { return { value: parseJSON(data), digest: hash(data) }; }
  catch (error) {
    if (error instanceof SyntaxError) throw new CollectionError('invalid_json', 'A requested input is not valid JSON.');
    throw error;
  }
}
function within(folder, file) {
  const relative = path.relative(folder, file);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}
function realLocation(file) {
  if (fs.existsSync(file)) return fs.realpathSync(file);
  const parent = path.dirname(file);
  requireValue(parent !== file, 'Cannot resolve output location.');
  return path.join(realLocation(parent), path.basename(file));
}
function outputLocation(value) {
  const target = path.resolve(text(value, 'output'));
  const resolved = realLocation(target);
  const root = fs.realpathSync(ROOT);
  const privateRoot = path.join(root, '.private', 'contacts');
  requireValue(!within(root, resolved) || (within(privateRoot, resolved) && within(PRIVATE, target)),
    'Output inside this checkout is allowed only under .private\\contacts, never in website or tracked data folders.', 'unsafe_output');
  requireValue(target === resolved || !within(root, resolved), 'Private output must not use a redirected directory.', 'unsafe_output');
  return target;
}
function openLock(lock, lockedError) {
  try { return fs.openSync(lock, 'wx', 0o600); }
  catch (error) {
    if (error.code === 'EEXIST') throw lockedError();
    throw error;
  }
}
function releaseLock(lock, fd) {
  if (fd !== undefined) { fs.closeSync(fd); fs.unlinkSync(lock); }
}
function writeExclusive(file, contents) {
  const fd = fs.openSync(file, 'wx', 0o600);
  writeAndClose(fd, contents);
}
function writeAndClose(fd, contents) {
  try { fs.writeFileSync(fd, contents); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
}
function writeTemporary(file, contents, temporary, commit) {
  // Open before the cleanup scope: a collision belongs to another writer.
  const fd = fs.openSync(temporary, 'wx', 0o600);
  try {
    writeAndClose(fd, contents);
    commit(temporary, file);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
function persistText(file, contents, temporary = `${file}.${process.pid}.tmp`) {
  writeTemporary(file, contents, temporary, fs.renameSync);
}
function persist(file, state) {
  persistText(file, JSON.stringify(state, null, 2) + '\n');
}
function publish(file, state) {
  publishText(file, JSON.stringify(state, null, 2) + '\n');
}
function publishText(file, contents) {
  const temporary = `${file.replace(/\.json$/i, '')}.${crypto.randomUUID()}.tmp`;
  // A hard link publishes atomically without replacing an existing file or symlink.
  writeTemporary(file, contents, temporary, fs.linkSync);
}
async function runCLI(action, onError) {
  try { process.exitCode = await action(); }
  catch (error) { process.exitCode = onError(error); }
}

module.exports = {
  hash, hashJSON, stripBOM, parseJSON, hasUnsupportedTextControls,
  CollectionError, requireValue, createGuard, object, text, array, instant,
  readJSONValue, readJSONWithDigest, readJSON, within, outputLocation,
  openLock, releaseLock, writeExclusive, persistText, persist, publish, publishText, runCLI
};
