import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(__dirname, '..');
const OUTPUT_ROOTS = ['public', 'dist', 'build', 'out', '_site', '.output'];
const PRIVATE_FILE = /^(?:(?:collection|identity-review|curated|prayer|audience|reconnection|google-acquisition)\.(?:json(?:\.\d+\.tmp)?|lock)|identity-review\.json\.(?:lock|tmp)|google-handoff-.+\.json(?:\.\d+\.tmp)?|(?:request|operation|aggregate|summary|audience|graph|reconnection|opportunities)(?:\.synthetic)?\.json|(?:aggregates|report)\.[a-f0-9-]+\.tmp|config\.local\.json|(?:handoff|checkpoint|aggregates|report)\.json|graph\.(?:html(?:\.[a-f0-9-]+\.tmp)?|svg))$/i;
const WHATSAPP_FILE = /^(?:(?:whatsapp-registry\.synthetic|whatsapp\.synthetic|request\.synthetic)\.json(?:\.[a-f0-9-]+\.tmp)?|whatsapp-conversion\.lock)$/i;

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
    if (parts.some(part => part.toLowerCase() === '.private' || /^\.email-staging-/i.test(part) ||
        /^acquisition-[a-f0-9]{64}$/i.test(part)) || PRIVATE_FILE.test(name) || WHATSAPP_FILE.test(name) ||
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

export { checkBoundary, OUTPUT_ROOTS };
