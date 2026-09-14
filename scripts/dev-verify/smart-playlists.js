// scripts/dev-verify/smart-playlists.js
// Standalone verification for the smart playlists feature. No test framework
// in this repo — run directly with `node scripts/dev-verify/smart-playlists.js`.
// Uses an in-memory better-sqlite3 DB via MusicDatabase so it never touches
// Erich's real library.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
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

  // --- Task 2: evaluation engine ---
  const now = new Date().toISOString();
  const insertTrack = db.db.prepare(`
    INSERT INTO tracks (path, filename, title, artist, album, year, genre, play_count, date_added)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const rockOld = insertTrack.run('/a.mp3', 'a.mp3', 'A', 'Artist A', 'Album A', 1990, 'Rock', 2, now);
  const rockNew = insertTrack.run('/b.mp3', 'b.mp3', 'B', 'Artist B', 'Album B', 2020, 'Rock', 20, now);
  const jazz = insertTrack.run('/c.mp3', 'c.mp3', 'C', 'Artist C', 'Album C', 2020, 'Jazz', 20, now);
  db.db.prepare('INSERT INTO favorites (track_id) VALUES (?)').run(rockNew.lastInsertRowid);

  const smartAll = db.createPlaylist({ name: 'Rock AND Popular', type: 'smart', match_mode: 'all' });
  db.addSmartPlaylistRules(smartAll.id, [
    { field: 'genre', operator: 'is', value: 'Rock' },
    { field: 'play_count', operator: 'greater than', value: '10' },
  ]);
  const allResult = (await db.getSmartPlaylistTracks(smartAll.id)).map((t) => t.path).sort();
  assert.deepStrictEqual(allResult, ['/b.mp3'], `match_mode 'all' returned ${JSON.stringify(allResult)}`);

  const smartAny = db.createPlaylist({ name: 'Rock OR Favorite', type: 'smart', match_mode: 'any' });
  db.addSmartPlaylistRules(smartAny.id, [
    { field: 'genre', operator: 'is', value: 'Rock' },
    { field: 'favorite', operator: 'is', value: 'true' },
  ]);
  const anyResult = (await db.getSmartPlaylistTracks(smartAny.id)).map((t) => t.path).sort();
  assert.deepStrictEqual(anyResult, ['/a.mp3', '/b.mp3'], `match_mode 'any' returned ${JSON.stringify(anyResult)}`);

  const smartContains = db.createPlaylist({ name: 'Artist contains B', type: 'smart', match_mode: 'all' });
  db.addSmartPlaylistRules(smartContains.id, [{ field: 'artist', operator: 'contains', value: 'B' }]);
  const containsResult = (await db.getSmartPlaylistTracks(smartContains.id)).map((t) => t.path);
  assert.deepStrictEqual(containsResult, ['/b.mp3']);

  console.log('✅ Task 2: evaluation engine checks passed');

  // --- Task 3: getPlaylistById / getAllPlaylists branch on type ---
  const viaGetById = await db.getPlaylistById(smartAll.id);
  assert.deepStrictEqual(viaGetById.tracks.map((t) => t.path), ['/b.mp3']);
  assert.strictEqual(viaGetById.type, 'smart');

  const allPlaylists = db.getAllPlaylists();
  const smartAllRow = allPlaylists.find((p) => p.id === smartAll.id);
  assert.strictEqual(smartAllRow.track_count, 1, `expected live count 1, got ${smartAllRow.track_count}`);

  console.log('✅ Task 3: getPlaylistById/getAllPlaylists branching checks passed');

  // --- Task 4: save-as-static snapshot ---
  const snapshot = await db.saveSmartPlaylistAsStatic(smartAll.id);
  assert.strictEqual(snapshot.type, 'static');
  assert.strictEqual(snapshot.name, 'Rock AND Popular (Snapshot)');
  const snapshotTracks = (await db.getPlaylistById(snapshot.id)).tracks.map((t) => t.path);
  assert.deepStrictEqual(snapshotTracks, ['/b.mp3']);

  // Editing the source smart playlist's rules must not touch the snapshot.
  db.addSmartPlaylistRules(smartAll.id, [{ field: 'genre', operator: 'is', value: 'Jazz' }]);
  const snapshotAfterEdit = (await db.getPlaylistById(snapshot.id)).tracks.map((t) => t.path);
  assert.deepStrictEqual(
    snapshotAfterEdit,
    ['/b.mp3'],
    'snapshot changed after editing source smart playlist rules'
  );

  console.log('✅ Task 4: save-as-static checks passed');

  // --- updatePlaylist() must persist match_mode changes on edit ---
  await db.updatePlaylist({ id: smartAny.id, name: 'Rock OR Favorite', description: '', match_mode: 'all' });
  const updated = db.db.prepare('SELECT match_mode FROM playlists WHERE id = ?').get(smartAny.id);
  assert.strictEqual(updated.match_mode, 'all', 'updatePlaylist did not persist match_mode change');

  console.log('✅ updatePlaylist match_mode persistence check passed');

  // --- text field "is" must be case-insensitive (real bug found live: typing
  // "classical" didn't match a track tagged "Classical") ---
  insertTrack.run('/d.mp3', 'd.mp3', 'D', 'Artist D', 'Album D', 2000, 'Classical', 0, now);
  const caseTest = db.createPlaylist({ name: 'Case Insensitive Genre', type: 'smart', match_mode: 'all' });
  db.addSmartPlaylistRules(caseTest.id, [{ field: 'genre', operator: 'is', value: 'classical' }]);
  const caseResult = (await db.getSmartPlaylistTracks(caseTest.id)).map((t) => t.path);
  assert.deepStrictEqual(caseResult, ['/d.mp3'], `case-insensitive "is" returned ${JSON.stringify(caseResult)}`);

  console.log('✅ case-insensitive text match check passed');

  // --- auto-export to M3U: exportPlaylistToM3U() itself, plus the auto-call
  // wired into addTrackToPlaylist/removeTrackFromPlaylist/reorderTracksInPlaylist ---
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'que-music-verify-'));
  db.playlistFolder = tmpDir;

  const manual = db.createPlaylist({ name: 'Manual Export Test' });
  const trackRow = db.db.prepare('SELECT id FROM tracks WHERE path = ?').get('/a.mp3');
  await db.addTrackToPlaylist(manual.id, trackRow.id); // should auto-export

  const m3uPath = path.join(tmpDir, 'Manual Export Test.m3u');
  assert(fs.existsSync(m3uPath), `expected auto-exported M3U file at ${m3uPath}`);
  const m3uContent = fs.readFileSync(m3uPath, 'utf8');
  assert(m3uContent.includes('/a.mp3'), `M3U content missing track path: ${m3uContent}`);

  console.log('✅ auto-export to M3U check passed');

  db.db.close();
}

run().catch((err) => {
  console.error('❌ Verification failed:', err.message);
  process.exit(1);
});
