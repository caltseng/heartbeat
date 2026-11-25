import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { review } from './identity-review.ts';
import type { TestContext } from 'node:test';

function tempFolder(t: TestContext, prefix: string): string {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  return folder;
}

function mappingFixture(folder, collection, output, reason) {
  const request = { schemaVersion: 1, dataClass: 'synthetic', collection, output, reason };
  const inspect = () => review(request, folder, true);
  const apply = operations => {
    const current = inspect();
    return review({ ...request, expectedRevision: current.revision,
      collectionDigest: current.collectionDigest, operations }, folder);
  };
  return { inspect, apply };
}

export { tempFolder, mappingFixture };
