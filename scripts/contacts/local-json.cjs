const fs = require('node:fs');
const crypto = require('node:crypto');

function persist(file, state) {
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    const fd = fs.openSync(temporary, 'wx', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(state, null, 2) + '\n'); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    fs.renameSync(temporary, file);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

function publish(file, state) {
  publishText(file, JSON.stringify(state, null, 2) + '\n');
}

function publishText(file, contents) {
  const temporary = `${file.replace(/\.json$/i, '')}.${crypto.randomUUID()}.tmp`;
  try {
    const fd = fs.openSync(temporary, 'wx', 0o600);
    try { fs.writeFileSync(fd, contents); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    // A hard link publishes atomically without replacing an existing file or symlink.
    fs.linkSync(temporary, file);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

module.exports = { persist, publish, publishText };
