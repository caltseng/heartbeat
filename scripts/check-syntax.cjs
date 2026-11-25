const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function check(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      check(file);
    } else if (entry.isFile() && entry.name.endsWith('.cjs')) {
      const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
      if (result.error) throw result.error;
      if (result.status === null) throw new Error(`Syntax check interrupted for ${file}: ${result.signal}`);
      if (result.status !== 0) process.exit(result.status);
    }
  }
}

check(__dirname);
