const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { review } = require('./identity-review.cjs');

function tempFolder(t, prefix) {
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

module.exports = { tempFolder, mappingFixture };
