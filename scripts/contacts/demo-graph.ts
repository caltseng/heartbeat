import path from 'node:path';
import { writeDemo, period } from './demo.ts';
import { collect } from './collect.ts';
import { review } from './identity-review.ts';
import { run as summary } from './summary.ts';
import { run as graph } from './graph.ts';
import { outputLocation, readJSON, requireValue, runCLI, publishText } from './lib.ts';

function demoGraph(output: string) {
  const folder = outputLocation(path.resolve(output));
  const demo = writeDemo(folder, { partial: true });
  const collected = collect(demo.request, folder);
  const request = { schemaVersion: 1, dataClass: 'synthetic', collection: collected.file,
    output: 'mapping', reason: 'Register separate synthetic source identities; names are not merge evidence.' };
  const inspected = review(request, folder, true);
  const mapping = review({ ...request, expectedRevision: 0, collectionDigest: inspected.collectionDigest,
    operations: [] }, folder);
  const files = [];
  for (const [name, channels] of [
    ['all-channels', ['email', 'sms', 'messenger', 'whatsapp']],
    ['covered-email', ['email']]
  ] as const) {
    const report = summary({ schemaVersion: 1, dataClass: 'synthetic', collection: collected.file,
      mapping: mapping.file, identityMappingRevision: 1, period, channels: [...channels],
      output: `${name}-report` }, folder);
    const rendered = graph({ schemaVersion: 1, dataClass: 'synthetic', report: report.file,
      reportDigest: readJSON(report.file).digest, output: name }, folder);
    files.push(rendered.file);
  }
  const file = path.join(folder, 'index.html');
  publishText(file, `<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>Heartbeat synthetic demo</title><style>body{max-width:48rem;margin:2rem auto;padding:1rem;font:18px/1.6 system-ui}a{display:block;padding:1rem;border:1px solid;margin:1rem 0}a:focus-visible{outline:3px solid #8a3600}</style>
<h1>Heartbeat · synthetic demo</h1><p>37 separate synthetic peers across five source families.
No accounts, real contacts, live data or network access. Matching display names stay separate.</p>
<a href="all-channels/graph.html">Explore all four communication channels · incomplete history</a>
<p>Frequent, regular, occasional and group-only observations, plus unknown coverage.
WhatsApp is intentionally partial: positive counts are lower bounds; no observed activity is not proven inactivity.</p>
<a href="covered-email/graph.html">Explore email-only · declared complete email coverage</a>
<p>This separate frozen report demonstrates inactive <em>within email only</em>, not inactivity across other channels.
Both graphs bind the same unchanged collection and mapping; each shows its own filters and exact report digest.
Browser controls navigate saved people and sheets, never regenerate the data.</p></html>\n`);
  return { dataClass: 'synthetic', file, graphs: files, exitCode: 2,
    limitation: 'Intentionally partial synthetic history; no real source is connected.' };
}
if (require.main === module) runCLI(() => {
  const args = process.argv.slice(2);
  requireValue(args.length === 2 && args[0] === '--output',
    'Usage: npm run contacts:demo -- --output <fresh ignored directory>', 'invalid_arguments');
  const result = demoGraph(args[1]);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  return result.exitCode;
}, error => {
  process.stderr.write(`Demo failed [${error.code || 'unexpected_error'}]: ${error.message}\n`);
  return 1;
});
export { demoGraph };
