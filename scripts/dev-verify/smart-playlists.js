// scripts/dev-verify/smart-playlists.js
// Standalone verification for the smart playlists feature. No test framework
// in this repo — run directly with `node scripts/dev-verify/smart-playlists.js`.
// Uses an in-memory better-sqlite3 DB via MusicDatabase so it never touches
// Erich's real library.
const assert = require('assert');
const MusicDatabase = require('../../server/database.js');

async function run() {
  const db = new MusicDatabase(':memory:');

  // --- Task 1: schema ---
  const playlistCols = db.db.prepare('PRAGMA table_info(playlists)').all().map((c) => c.name);
  assert(playlistCols.includes('type'), 'playlists.type column missing');
  assert(playlistCols.includes('match_mode'), 'playlists.match_mode column missing');

  const tables = db.db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((t) => t.name);
  assert(tables.includes('smart_playlist_rules'), 'smart_playlist_rules table missing');

  const ruleCols = db.db.prepare('PRAGMA table_info(smart_playlist_rules)').all().map((c) => c.name);
  ['id', 'playlist_id', 'field', 'operator', 'value', 'sort_order'].forEach((col) =>
    assert(ruleCols.includes(col), `smart_playlist_rules.${col} column missing`)
  );

  console.log('✅ Task 1: schema checks passed');

  db.db.close();
}

run().catch((err) => {
  console.error('❌ Verification failed:', err.message);
  process.exit(1);
});
