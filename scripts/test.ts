import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function tests(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(entry => {
      const file = path.join(directory, entry.name);
      return entry.isDirectory() ? tests(file) : entry.name.endsWith('.test.ts') ? [file] : [];
    });
}

const [directory = 'scripts', ...options] = process.argv.slice(2);
const files = tests(directory);
if (files.length === 0) throw new Error(`No TypeScript tests found under ${directory}.`);
const env = { ...process.env };
delete env.NODE_TEST_CONTEXT;
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...options, ...files],
  { stdio: 'inherit', env });
if (result.error) throw result.error;
if (result.status === null) throw new Error(`Test run interrupted: ${result.signal}`);
process.exitCode = result.status;
