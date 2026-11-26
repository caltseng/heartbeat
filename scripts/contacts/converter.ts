import fs from 'node:fs';
import path from 'node:path';
import type { Handoff } from './types.ts';
import type { PeriodRequest } from './period.ts';
import { outputLocation, openLock, releaseLock, writeExclusive, publishImmutable,
  runCLI, isError } from './lib.ts';

interface BundleOptions {
  period: PeriodRequest;
  report: unknown;
  output?: string;
  handoffName?: 'handoff.json' | 'text.synthetic.json' | 'whatsapp.synthetic.json';
  checkpoint?: unknown;
  mode?: 'new' | 'empty' | 'replay';
  failure: (code: string) => Error;
}
export function writeHandoffBundle(folder: string, handoff: Handoff | null, options: BundleOptions): void {
  if (handoff && handoff.dataClass !== 'synthetic') throw options.failure('private_collection_disabled');
  folder = outputLocation(folder);
  const mode = options.mode ?? 'new';
  const handoffName = options.handoffName ?? 'handoff.json';
  const files: Record<string, unknown> = {};
  if (handoff) {
    // Legacy source filenames remain aliases; consumers may use the common handoff.
    files[handoffName] = handoff;
    files['handoff.json'] = handoff;
  }
  files['report.json'] = options.report;
  if (options.checkpoint !== undefined) files['checkpoint.json'] = options.checkpoint;
  if (handoff) files['request.synthetic.json'] = {
    schemaVersion: 1, dataClass: handoff.dataClass, period: options.period,
    output: options.output ?? '.', resume: false,
    sources: [{ source: handoff.source, account: handoff.account, connector: handoff.connector,
      mode: 'metadata-import', input: handoffName }]
  };
  fs.mkdirSync(path.dirname(folder), { recursive: true, mode: 0o700 });
  const lock = `${folder}.bundle.lock`;
  const fd = openLock(lock, () => options.failure('output_locked'));
  try {
    if (fs.existsSync(folder)) {
      if (mode === 'new') throw options.failure('output_exists');
      if (fs.lstatSync(folder).isSymbolicLink() || !fs.statSync(folder).isDirectory()) throw options.failure('unsafe_output');
      if (mode === 'empty' && fs.readdirSync(folder).length) throw options.failure('output_not_empty');
    }
    if (mode === 'replay') {
      fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
      for (const [name, value] of Object.entries(files)) {
        publishImmutable(path.join(folder, name), value, () => options.failure('output_conflict'));
      }
      return;
    }
    const staging = fs.mkdtempSync(path.join(path.dirname(folder), '.converter-staging-'));
    try {
      fs.chmodSync(staging, 0o700);
      for (const [name, value] of Object.entries(files)) {
        writeExclusive(path.join(staging, name), JSON.stringify(value, null, 2) + '\n');
      }
      if (fs.existsSync(folder)) {
        if (mode === 'new') throw options.failure('output_exists');
        // Windows cannot rename over an existing empty directory.
        fs.rmdirSync(folder);
      }
      fs.renameSync(staging, folder);
    } finally {
      if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true });
    }
  } finally { releaseLock(lock, fd); }
}

interface ConverterCLI {
  domain: string;
  fallback: string;
  label?: string;
}
export function runConverter(action: () => number | Promise<number>, options: ConverterCLI): Promise<void> {
  return runCLI(action, error => {
    const known = isError(error, options.domain);
    const code = known ? error.code : options.fallback;
    if (options.label) {
      process.stderr.write(`${options.label} failed [${code}].\n`);
      return 1;
    }
    process.stderr.write(JSON.stringify({ status: known ? error.status : 'failed', code }) + '\n');
    return known && error.status !== 'failed' ? 2 : 1;
  });
}
