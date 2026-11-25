const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT_ROOTS = ['public', 'dist', 'build', 'out', '_site', '.output'];
const PRIVATE_FILE = /^(?:(?:collection|identity-review|google-acquisition)\.(?:json(?:\.\d+\.tmp)?|lock)|identity-review\.json\.(?:lock|tmp)|google-handoff-.+\.json(?:\.\d+\.tmp)?|request(?:\.synthetic)?\.json|config\.local\.json|(?:handoff|checkpoint|aggregates|report)\.json|graph\.(?:html|svg))$/i;

function checkBoundary(root = ROOT, extraOutputs = []) {
  for (const output of [...OUTPUT_ROOTS.map(name => path.join(root, name)), ...extraOutputs]) {
    let stat;
    try { stat = fs.lstatSync(output); }
    catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    if (!stat.isDirectory() || stat.isSymbolicLink() || fs.readdirSync(output).length !== 0) {
      throw new Error('Public output must be absent or an empty directory; Heartbeat has no public publication pipeline.');
    }
  }
  // Include force-added ignored files and untracked, non-ignored delivery candidates.
  const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  for (const file of files) {
    const parts = file.split('/');
    const name = parts[parts.length - 1];
    if (parts.some(part => part.toLowerCase() === '.private' || /^\.email-staging-/i.test(part)) || PRIVATE_FILE.test(name) ||
        /^\.env(?:\.|$)/i.test(name) || /\.(?:pem|key|pfx|p12)$/i.test(name)) {
      throw new Error('Private operational artifact is a Git delivery candidate; move it outside tracked paths.');
    }
  }
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 0 && !(args.length === 2 && args[0] === '--output' && args[1].trim())) {
      throw new Error('Usage: npm run check:private -- [--output <additional-public-directory>]');
    }
    checkBoundary(ROOT, args.length ? [path.resolve(args[1])] : []);
    process.stdout.write('Private boundary: no public output or private Git delivery artifacts.\n');
  } catch (error) {
    process.stderr.write(`Private boundary check failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { checkBoundary, OUTPUT_ROOTS };
