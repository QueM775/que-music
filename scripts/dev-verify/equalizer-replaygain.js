// scripts/dev-verify/equalizer-replaygain.js
// Standalone verification for the ReplayGain persistence half of the equalizer +
// loudness normalization feature. No test framework in this repo — run directly
// with the Electron-bundled Node runtime (better-sqlite3 is compiled against
// Electron's ABI, not system Node — see CLAUDE.md "Testing Commands"):
//   ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron.cmd scripts/dev-verify/equalizer-replaygain.js
// Uses an in-memory better-sqlite3 DB via MusicDatabase so it never touches
// Erich's real library. See docs/superpowers/specs/2026-09-15-equalizer-design.md.
const assert = require('assert');
const MusicDatabase = require('../../server/database.js');

async function run() {
  const db = new MusicDatabase(':memory:');

  // --- Task 1: schema ---
  const trackCols = db.db.prepare('PRAGMA table_info(tracks)').all().map((c) => c.name);
  assert(trackCols.includes('replaygain_gain'), 'tracks.replaygain_gain column missing');
  console.log('✅ Task 1: schema check passed');

  // --- Task 2: addTracks() upsert — tag-based value set on first scan ---
  db.addTracks([
    {
      path: '/tagged.mp3',
      filename: 'tagged.mp3',
      title: 'Tagged Track',
      artist: 'Artist A',
      replaygainGain: -3.2,
    },
  ]);
  let row = db.getTrackByPath('/tagged.mp3');
  assert.strictEqual(row.replaygain_gain, -3.2, 'tagged replaygain_gain not stored on insert');
  console.log('✅ Task 2: tag-based value stored on insert');

  // --- Task 3: rescan with no tag this time doesn't blow away the cached value ---
  db.addTracks([
    {
      path: '/tagged.mp3',
      filename: 'tagged.mp3',
      title: 'Tagged Track (rescanned)',
      artist: 'Artist A',
      // no replaygainGain this time — simulates a rescan where the tag read failed
    },
  ]);
  row = db.getTrackByPath('/tagged.mp3');
  assert.strictEqual(row.replaygain_gain, -3.2, 'rescan with no tag wrongly cleared cached replaygain_gain');
  assert.strictEqual(row.title, 'Tagged Track (rescanned)', 'rescan should still update other fields');
  console.log('✅ Task 3: COALESCE preserved cached value across a tag-less rescan');

  // --- Task 4: rescan WITH a new tag value overwrites the old one ---
  db.addTracks([
    {
      path: '/tagged.mp3',
      filename: 'tagged.mp3',
      title: 'Tagged Track (rescanned)',
      artist: 'Artist A',
      replaygainGain: -5.0,
    },
  ]);
  row = db.getTrackByPath('/tagged.mp3');
  assert.strictEqual(row.replaygain_gain, -5.0, 'rescan with a new tag value should overwrite the old one');
  console.log('✅ Task 4: new tag value on rescan overwrites the old one');

  // --- Task 5: tag-less track starts with a null value, lazy-compute path fills it in ---
  db.addTracks([{ path: '/untagged.mp3', filename: 'untagged.mp3', title: 'Untagged Track' }]);
  row = db.getTrackByPath('/untagged.mp3');
  assert.strictEqual(row.replaygain_gain, null, 'untagged track should start with a null replaygain_gain');

  const updateResult = db.updateTrackReplayGain('/untagged.mp3', -6.4);
  assert(updateResult.success, 'updateTrackReplayGain should report success');
  row = db.getTrackByPath('/untagged.mp3');
  assert.strictEqual(row.replaygain_gain, -6.4, 'lazily-computed value not persisted');
  console.log('✅ Task 5: lazy-compute path persists via updateTrackReplayGain()');

  // --- Task 6: a later rescan of a lazily-computed (no-tag) track keeps the cached value ---
  db.addTracks([{ path: '/untagged.mp3', filename: 'untagged.mp3', title: 'Untagged Track (rescanned)' }]);
  row = db.getTrackByPath('/untagged.mp3');
  assert.strictEqual(row.replaygain_gain, -6.4, 'rescan should not clear a lazily-computed value');
  console.log('✅ Task 6: rescan preserves the lazily-computed value too');

  console.log('\n✅ All equalizer/ReplayGain persistence checks passed');
}

run().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
