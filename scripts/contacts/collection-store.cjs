const { isDeepStrictEqual } = require('node:util');
const { requireValue, persistText, readJSON } = require('./lib.cjs');

const STORAGE = 'revision-references-v1';
const versions = entry => entry.revisions ||
  [{ id: '$initial', supersedes: null, record: entry.record, provenance: entry.provenance }];

function expandCollection(state) {
  if (state.recordStorage === undefined) return state;
  requireValue(state.recordStorage === STORAGE, 'Unsupported collection record storage.', 'invalid_store');
  const { recordStorage, ...expanded } = state;
  expanded.records = {};
  for (const [key, entry] of Object.entries(state.records)) {
    const rows = entry.revisions;
    requireValue(Array.isArray(rows) && rows.length > 0 &&
      new Set(rows.map(row => row.id)).size === rows.length &&
      rows.every(row => row.record && Array.isArray(row.provenance)),
    'Invalid stored record revisions.', 'invalid_store');
    const provenance = [];
    for (const row of rows) {
      for (const evidence of row.provenance) {
        if (!provenance.some(saved => isDeepStrictEqual(saved, evidence))) provenance.push(evidence);
      }
    }
    expanded.records[key] = { record: rows[0].record, provenance, revisions: rows };
  }
  if (state.reconciliation) {
    expanded.reconciliation = { ...state.reconciliation, records: {} };
    for (const [key, entry] of Object.entries(state.reconciliation.records)) {
      const version = expanded.records[key]?.revisions.find(row => row.id === entry.revision);
      requireValue(version, 'Reconciliation references a missing record revision.', 'invalid_store');
      expanded.reconciliation.records[key] = { ...entry, record: structuredClone(version.record) };
    }
  }
  return expanded;
}

function compactCollection(state) {
  return { ...state, recordStorage: STORAGE,
    records: Object.fromEntries(Object.entries(state.records).map(([key, entry]) =>
      [key, { revisions: versions(entry) }])),
    reconciliation: { ...state.reconciliation,
      records: Object.fromEntries(Object.entries(state.reconciliation.records).map(([key, entry]) => {
        const { record, ...reference } = entry;
        return [key, reference];
      })) } };
}

function readCollection(file) {
  const input = readJSON(file);
  return { ...input, value: expandCollection(input.value) };
}

function persistCollection(file, state) {
  persistText(file, JSON.stringify(compactCollection(state)) + '\n');
}

module.exports = { expandCollection, compactCollection, readCollection, persistCollection };
