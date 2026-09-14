# Smart Playlists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add rule-based smart playlists (field + operator + value, auto-evaluated at natural checkpoints) as a second playlist type alongside Que-Music's existing static M3U-backed playlists, including a "Save as Static Playlist" snapshot action.

**Architecture:** Two new `playlists` columns (`type`, `match_mode`) plus a new `smart_playlist_rules` table drive a SQL-based evaluation engine in `server/database.js` that translates rules into a parameterized `WHERE` clause against `tracks`. `getPlaylistById()` — the single choke point every renderer read path already calls — branches on `type` so no renderer code needs to know which kind of playlist it's looking at. A rule-builder UI is added to the existing Create/Edit Playlist modal.

**Tech Stack:** Electron main process (`main.js`, `server/database.js`) on `better-sqlite3`; renderer vanilla JS (`client/scripts/*.js`) and hand-written HTML/CSS. No test framework exists in this repo (no Jest, no `npm test` script) — verification is a standalone Node script run with `node`, using the project's own `better-sqlite3` dependency and Node's built-in `assert`, plus a live launch-and-click pass per this project's established practice (see `CLAUDE.md`, "UI Testing").

**Spec:** `docs/superpowers/specs/2026-09-14-smart-playlists-design.md`

## Global Constraints

- Match mode is per-playlist: `'all'` (AND) or `'any'` (OR). No nested rule groups.
- v1 fields: `artist`, `album`, `genre`, `year`, `play_count`, `date_added`, `favorite`. No other fields.
- Smart playlists never write to `playlist_tracks` — their contents are always computed, never stored.
- All new SQL uses parameterized `better-sqlite3` prepared statements — no string-concatenated values, matching the existing codebase pattern (`server/database.js`).
- Schema changes use the guarded `ALTER TABLE` + "swallow duplicate column" pattern already established in `migrateAddLyricsColumns()` (`server/database.js:262`) — safe to run on every launch, no manual migration step for Erich.
- `docs/application/database-schema.sql` must stay in sync with the live schema (this file exists specifically to prevent drift — see Issue #28 in `docs/issues/issues_track.md`).

---

## Task 1: Schema — `playlists` columns + `smart_playlist_rules` table

**Files:**
- Modify: `server/database.js:29` (`initializeCompleteSchema()` — add `smart_playlist_rules` table to the `schemaSQL` template string, right after the existing `CREATE TABLE IF NOT EXISTS playlist_tracks` block at line 101)
- Modify: `server/database.js:23` (constructor — call a new migration method alongside `migrateAddLyricsColumns()`)
- Modify: `server/database.js:262` (add new method `migrateAddSmartPlaylistColumns()` right after `migrateAddLyricsColumns()`)
- Modify: `docs/application/database-schema.sql` (mirror the same schema addition)
- Create: `scripts/dev-verify/smart-playlists.js` (new standalone verification script — created here, extended by every later task)

**Interfaces:**
- Produces: `playlists.type` (`'static'` | `'smart'`, default `'static'`), `playlists.match_mode` (`'all'` | `'any'` | `NULL`), table `smart_playlist_rules(id, playlist_id, field, operator, value, sort_order)`.

- [ ] **Step 1: Write the failing verification script**

Create `scripts/dev-verify/smart-playlists.js`:

```javascript
// scripts/dev-verify/smart-playlists.js
// Standalone verification for the smart playlists feature. No test framework
// in this repo — run directly with `node scripts/dev-verify/smart-playlists.js`.
// Uses an in-memory better-sqlite3 DB via MusicDatabase so it never touches
// Erich's real library.
const assert = require('assert');
const MusicDatabase = require('../../server/database.js');

function run() {
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

run();
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node scripts/dev-verify/smart-playlists.js`
Expected: throws `AssertionError: playlists.type column missing` (columns/table don't exist yet).

- [ ] **Step 3: Add the schema**

In `server/database.js`, inside the `schemaSQL` template string in `initializeCompleteSchema()`, immediately after the existing `playlist_tracks` table block (ends at line 101 with `);`), insert:

```sql
    CREATE TABLE IF NOT EXISTS smart_playlist_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      playlist_id INTEGER NOT NULL,
      field TEXT NOT NULL,
      operator TEXT NOT NULL,
      value TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
    );
```

Then add the migration method right after `migrateAddLyricsColumns()` (after line 280's closing `}`):

```javascript
  // Heals existing on-disk DBs that predate smart playlists — same guarded
  // ALTER TABLE pattern as migrateAddLyricsColumns(). Safe to run on every launch.
  migrateAddSmartPlaylistColumns() {
    const columns = [
      { name: 'type', ddl: "ALTER TABLE playlists ADD COLUMN type TEXT NOT NULL DEFAULT 'static'" },
      { name: 'match_mode', ddl: 'ALTER TABLE playlists ADD COLUMN match_mode TEXT' },
    ];

    for (const column of columns) {
      try {
        this.db.prepare(column.ddl).run();
        console.log(`✅ Added playlists.${column.name} column`);
      } catch (err) {
        if (!/duplicate column/i.test(err.message)) {
          throw err;
        }
      }
    }
  }
```

And wire it into the constructor at line 23, right after the existing lyrics migration call:

```javascript
    this.migrateAddLyricsColumns();
    this.migrateAddSmartPlaylistColumns();
```

Mirror the same `smart_playlist_rules` table block and the two new `playlists` columns into `docs/application/database-schema.sql` in its `playlists`/`playlist_tracks` section, so the doc doesn't drift from the live schema.

- [ ] **Step 4: Run it to verify it passes**

Run: `node scripts/dev-verify/smart-playlists.js`
Expected: prints `✅ Task 1: schema checks passed`, exits 0.

- [ ] **Step 5: Commit**

```bash
git add server/database.js docs/application/database-schema.sql scripts/dev-verify/smart-playlists.js
git commit -m "feat(smart-playlists): add playlists.type/match_mode + smart_playlist_rules schema"
```

---

## Task 2: Evaluation engine — `getSmartPlaylistTracks(playlistId)`

**Files:**
- Modify: `server/database.js` (add method after `createPlaylist()`, i.e. after line 1067)
- Modify: `scripts/dev-verify/smart-playlists.js` (append this task's checks)

**Interfaces:**
- Consumes: `smart_playlist_rules` rows (Task 1), `playlists.match_mode`.
- Produces: `MusicDatabase.getSmartPlaylistTracks(playlistId)` → `Promise<Array<track row>>`, same column shape as the `tracksQuery` in `getPlaylistById()` (`id, path, filename, title, artist, album, year, genre, duration, format, filesize, play_count`), used by Task 4.
- Also produces: `MusicDatabase.buildSmartPlaylistWhereClause(rules, matchMode)` → `{ sql, params }`, a private-ish helper Task 4's `getAllPlaylists()` count query reuses.

- [ ] **Step 1: Write the failing verification checks**

Append to `scripts/dev-verify/smart-playlists.js`, replacing the `db.db.close();` line at the end of `run()` with the new checks followed by the close call:

```javascript
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

  db.db.close();
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node scripts/dev-verify/smart-playlists.js`
Expected: `TypeError: db.addSmartPlaylistRules is not a function` (or similar — the method doesn't exist yet).

- [ ] **Step 3: Implement the evaluation engine**

Add to `server/database.js`, immediately after `createPlaylist()` (after line 1067):

```javascript
  // ============================================================================
  // SMART PLAYLISTS
  // ============================================================================

  // Replaces all rules for a smart playlist. Called both on creation and on
  // edit-save from the rule builder UI (Task 8) — always a full replace, no
  // partial patch, since the rule builder always submits its whole rule set.
  addSmartPlaylistRules(playlistId, rules) {
    const deleteExisting = this.db.prepare('DELETE FROM smart_playlist_rules WHERE playlist_id = ?');
    const insertRule = this.db.prepare(`
      INSERT INTO smart_playlist_rules (playlist_id, field, operator, value, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `);

    const doInsert = this.db.transaction((playlistId, rules) => {
      deleteExisting.run(playlistId);
      rules.forEach((rule, index) => {
        insertRule.run(playlistId, rule.field, rule.operator, String(rule.value), index);
      });
    });

    doInsert(playlistId, rules);
    console.log(`🧠 Set ${rules.length} smart playlist rule(s) for playlist ${playlistId}`);
    return { success: true, ruleCount: rules.length };
  }

  getSmartPlaylistRules(playlistId) {
    return this.db
      .prepare('SELECT field, operator, value FROM smart_playlist_rules WHERE playlist_id = ? ORDER BY sort_order ASC')
      .all(playlistId);
  }

  // Field -> real column expression. 'favorite' isn't a tracks column, so it's
  // handled as a subquery membership test rather than a plain comparison.
  _smartFieldColumn(field) {
    const textColumns = { artist: 't.artist', album: 't.album', genre: 't.genre' };
    const numberColumns = { year: 't.year', play_count: 't.play_count' };
    if (textColumns[field]) return textColumns[field];
    if (numberColumns[field]) return numberColumns[field];
    if (field === 'date_added') return 't.date_added';
    throw new Error(`Unknown smart playlist field: ${field}`);
  }

  // Converts one rule row into a { sql, params } WHERE fragment. Every value
  // is bound as a parameter — never string-concatenated into the query.
  _smartRuleToFragment(rule) {
    const { field, operator, value } = rule;

    if (field === 'favorite') {
      const wantFavorite = value === 'true' || value === true;
      const sub = 'EXISTS (SELECT 1 FROM favorites f WHERE f.track_id = t.id)';
      if (operator === 'is') {
        return wantFavorite ? { sql: sub, params: [] } : { sql: `NOT ${sub}`, params: [] };
      }
      if (operator === 'is not') {
        return wantFavorite ? { sql: `NOT ${sub}`, params: [] } : { sql: sub, params: [] };
      }
      throw new Error(`Unsupported operator "${operator}" for field "favorite"`);
    }

    const column = this._smartFieldColumn(field);

    switch (operator) {
      case 'is':
        return { sql: `${column} = ?`, params: [value] };
      case 'is not':
        return { sql: `${column} != ?`, params: [value] };
      case 'contains':
        return { sql: `${column} LIKE ?`, params: [`%${value}%`] };
      case 'greater than':
        return { sql: `${column} > ?`, params: [Number(value)] };
      case 'less than':
        return { sql: `${column} < ?`, params: [Number(value)] };
      case 'between': {
        const [low, high] = String(value).split('|');
        return { sql: `${column} BETWEEN ? AND ?`, params: [Number(low), Number(high)] };
      }
      case 'before':
        return { sql: `${column} < ?`, params: [value] };
      case 'after':
        return { sql: `${column} > ?`, params: [value] };
      case 'in the last N days':
        return { sql: `${column} >= datetime('now', ?)`, params: [`-${Number(value)} days`] };
      default:
        throw new Error(`Unsupported operator "${operator}" for field "${field}"`);
    }
  }

  // Shared by getSmartPlaylistTracks() and getAllPlaylists()'s live track_count.
  buildSmartPlaylistWhereClause(rules, matchMode) {
    if (!rules || rules.length === 0) {
      return { sql: '0 = 1', params: [] }; // no rules => matches nothing
    }
    const fragments = rules.map((rule) => this._smartRuleToFragment(rule));
    const joiner = matchMode === 'any' ? ' OR ' : ' AND ';
    const sql = fragments.map((f) => `(${f.sql})`).join(joiner);
    const params = fragments.flatMap((f) => f.params);
    return { sql, params };
  }

  async getSmartPlaylistTracks(playlistId) {
    const rules = this.getSmartPlaylistRules(playlistId);
    const playlist = this.db.prepare('SELECT match_mode FROM playlists WHERE id = ?').get(playlistId);
    const { sql, params } = this.buildSmartPlaylistWhereClause(rules, playlist?.match_mode);

    const query = `
      SELECT
        t.id, t.path, t.filename, t.title, t.artist, t.album, t.year,
        t.genre, t.duration, t.format, t.filesize, t.play_count
      FROM tracks t
      WHERE ${sql}
      ORDER BY t.artist, t.album, t.title
    `;

    return this.db.prepare(query).all(...params);
  }
```

Also extend `createPlaylist()` (line 1046) to accept and persist `type`/`match_mode`, and to seed rules if given:

```javascript
  createPlaylist(playlistData) {
    try {
      const { name, description = '', type = 'static', match_mode = null, rules = null } = playlistData;

      const stmt = this.db.prepare(
        'INSERT INTO playlists (name, description, type, match_mode) VALUES (?, ?, ?, ?)'
      );
      const result = stmt.run(name, description, type, match_mode);
      const playlistId = result.lastInsertRowid;

      if (type === 'smart' && rules) {
        this.addSmartPlaylistRules(playlistId, rules);
      }

      const row = this.db.prepare('SELECT * FROM playlists WHERE id = ?').get(playlistId);
      console.log(`📋 Created playlist: ${name} (${type})`);
      return row;
    } catch (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        const error = new Error(`Playlist "${playlistData.name}" already exists`);
        console.error('❌ Error creating playlist:', error.message);
        throw error;
      }
      console.error('❌ Error creating playlist:', err);
      throw err;
    }
  }
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node scripts/dev-verify/smart-playlists.js`
Expected: prints both `✅ Task 1` and `✅ Task 2` lines, exits 0.

- [ ] **Step 5: Commit**

```bash
git add server/database.js scripts/dev-verify/smart-playlists.js
git commit -m "feat(smart-playlists): add rule evaluation engine (getSmartPlaylistTracks)"
```

---

## Task 3: `getPlaylistById()` branches by type; `getAllPlaylists()` shows live counts for smart playlists

**Files:**
- Modify: `server/database.js:1163` (`getPlaylistById`)
- Modify: `server/database.js:1024` (`getAllPlaylists`)
- Modify: `scripts/dev-verify/smart-playlists.js` (append checks)

**Interfaces:**
- Consumes: `getSmartPlaylistTracks()`, `buildSmartPlaylistWhereClause()`, `getSmartPlaylistRules()` (Task 2).
- Produces: `getPlaylistById()` returns `{ ...playlistRow, tracks: [...] }` for both types — this is the single choke point every renderer read path (`selectPlaylist`, `loadPlaylistInRightPane`, etc.) already calls, so no caller-side branching is needed anywhere in the renderer.

- [ ] **Step 1: Write the failing verification checks**

Append before `db.db.close();`:

```javascript
  // --- Task 3: getPlaylistById / getAllPlaylists branch on type ---
  const viaGetById = await db.getPlaylistById(smartAll.id);
  assert.deepStrictEqual(viaGetById.tracks.map((t) => t.path), ['/b.mp3']);
  assert.strictEqual(viaGetById.type, 'smart');

  const allPlaylists = db.getAllPlaylists();
  const smartAllRow = allPlaylists.find((p) => p.id === smartAll.id);
  assert.strictEqual(smartAllRow.track_count, 1, `expected live count 1, got ${smartAllRow.track_count}`);

  console.log('✅ Task 3: getPlaylistById/getAllPlaylists branching checks passed');
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node scripts/dev-verify/smart-playlists.js`
Expected: `AssertionError` — `viaGetById.tracks` currently comes back empty (static-only query finds no `playlist_tracks` rows for a smart playlist) or `track_count` is `0`.

- [ ] **Step 3: Implement the branch**

Replace `getPlaylistById()` at `server/database.js:1163`:

```javascript
  async getPlaylistById(playlistId) {
    try {
      const playlist = this.db.prepare('SELECT * FROM playlists WHERE id = ?').get(playlistId);

      if (!playlist) {
        throw new Error(`Playlist with ID ${playlistId} not found`);
      }

      if (playlist.type === 'smart') {
        playlist.tracks = await this.getSmartPlaylistTracks(playlistId);
        console.log(`🧠 Retrieved smart playlist "${playlist.name}" with ${playlist.tracks.length} tracks`);
        return playlist;
      }

      const tracksQuery = `
        SELECT
          t.id,
          t.path,
          t.filename,
          t.title,
          t.artist,
          t.album,
          t.year,
          t.genre,
          t.duration,
          t.format,
          t.filesize,
          t.play_count,
          pt.position,
          pt.added_at as added_to_playlist
        FROM playlist_tracks pt
        INNER JOIN tracks t ON pt.track_path = t.path
        WHERE pt.playlist_id = ?
        ORDER BY pt.position ASC
      `;

      const tracks = this.db.prepare(tracksQuery).all(playlistId);
      playlist.tracks = Array.isArray(tracks) ? tracks : [];
      console.log(`📋 Retrieved playlist "${playlist.name}" with ${playlist.tracks.length} tracks`);
      return playlist;
    } catch (err) {
      console.error('❌ Error getting playlist by ID:', err);
      throw err;
    }
  }
```

Find and update `getAllPlaylists()` (line 1024) — read it first to preserve its existing static-count logic, then add a live-count pass for smart rows after the base query:

```javascript
  getAllPlaylists() {
    try {
      const playlists = this.db.prepare('SELECT * FROM playlists ORDER BY name ASC').all();

      // Smart playlists' track_count column is never maintained on write (they
      // have no playlist_tracks rows) — compute it live per row instead.
      for (const playlist of playlists) {
        if (playlist.type === 'smart') {
          const rules = this.getSmartPlaylistRules(playlist.id);
          const { sql, params } = this.buildSmartPlaylistWhereClause(rules, playlist.match_mode);
          const { count } = this.db
            .prepare(`SELECT COUNT(*) as count FROM tracks t WHERE ${sql}`)
            .get(...params);
          playlist.track_count = count;
        }
      }

      return playlists;
    } catch (err) {
      console.error('❌ Error getting all playlists:', err);
      throw err;
    }
  }
```

> Note for the implementer: `getAllPlaylists()` already exists at line 1024 — read its current body first and adapt this replacement to keep any existing column selection/ordering it has (e.g. if it already does a `SELECT *` with different ordering, keep that; only the smart-count loop is new).

- [ ] **Step 4: Run it to verify it passes**

Run: `node scripts/dev-verify/smart-playlists.js`
Expected: all three `✅ Task` lines print, exits 0.

- [ ] **Step 5: Commit**

```bash
git add server/database.js scripts/dev-verify/smart-playlists.js
git commit -m "feat(smart-playlists): getPlaylistById/getAllPlaylists branch on playlist type"
```

---

## Task 4: "Save as Static Playlist" snapshot

**Files:**
- Modify: `server/database.js` (add method after `getSmartPlaylistTracks()`)
- Modify: `scripts/dev-verify/smart-playlists.js` (append checks)

**Interfaces:**
- Consumes: `getSmartPlaylistTracks()` (Task 2), `createPlaylist()` (Task 2), existing `addTrackToPlaylist()` (`server/database.js:1205`).
- Produces: `MusicDatabase.saveSmartPlaylistAsStatic(playlistId)` → `Promise<playlist row>` (the new static playlist, same shape `createPlaylist()` returns).

- [ ] **Step 1: Write the failing verification checks**

```javascript
  // --- Task 4: save-as-static snapshot ---
  const snapshot = await db.saveSmartPlaylistAsStatic(smartAll.id);
  assert.strictEqual(snapshot.type, 'static');
  assert.strictEqual(snapshot.name, 'Rock AND Popular (Snapshot)');
  const snapshotTracks = (await db.getPlaylistById(snapshot.id)).tracks.map((t) => t.path);
  assert.deepStrictEqual(snapshotTracks, ['/b.mp3']);

  // Editing the source smart playlist's rules must not touch the snapshot.
  db.addSmartPlaylistRules(smartAll.id, [{ field: 'genre', operator: 'is', value: 'Jazz' }]);
  const snapshotAfterEdit = (await db.getPlaylistById(snapshot.id)).tracks.map((t) => t.path);
  assert.deepStrictEqual(snapshotAfterEdit, ['/b.mp3'], 'snapshot changed after editing source smart playlist rules');

  console.log('✅ Task 4: save-as-static checks passed');
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node scripts/dev-verify/smart-playlists.js`
Expected: `TypeError: db.saveSmartPlaylistAsStatic is not a function`

- [ ] **Step 3: Implement it**

Add to `server/database.js`, right after `getSmartPlaylistTracks()`:

```javascript
  async saveSmartPlaylistAsStatic(playlistId) {
    const source = this.db.prepare('SELECT * FROM playlists WHERE id = ?').get(playlistId);
    if (!source || source.type !== 'smart') {
      throw new Error(`Playlist ${playlistId} is not a smart playlist`);
    }

    const tracks = await this.getSmartPlaylistTracks(playlistId);
    const snapshot = this.createPlaylist({
      name: `${source.name} (Snapshot)`,
      description: `Snapshot of "${source.name}" — ${tracks.length} track(s), saved ${new Date().toISOString()}`,
      type: 'static',
    });

    for (const track of tracks) {
      await this.addTrackToPlaylist(snapshot.id, track.id);
    }

    console.log(`📸 Saved smart playlist "${source.name}" as static playlist "${snapshot.name}"`);
    return this.db.prepare('SELECT * FROM playlists WHERE id = ?').get(snapshot.id);
  }
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node scripts/dev-verify/smart-playlists.js`
Expected: all four `✅ Task` lines print, exits 0.

- [ ] **Step 5: Commit**

```bash
git add server/database.js scripts/dev-verify/smart-playlists.js
git commit -m "feat(smart-playlists): add saveSmartPlaylistAsStatic snapshot method"
```

---

## Task 5: IPC handlers + preload exposure

**Files:**
- Modify: `main.js:772` (add new handler after the existing `playlist:delete` handler)
- Modify: `client/scripts/main-preload.js:104` (add to the `playlists` object)

**Interfaces:**
- Consumes: `musicDB.saveSmartPlaylistAsStatic()` (Task 4). `playlist:create`'s existing handler (`main.js:694`) already forwards its whole `playlistData` object to `musicDB.createPlaylist()`, so `type`/`match_mode`/`rules` from the renderer pass through with **no changes needed** to that handler or to `createPlaylist`/`update` on the preload side.
- Produces: `window.queMusicAPI.playlists.saveSmartAsStatic(playlistId)` → `Promise<playlist row>`, and (for edit support) `window.queMusicAPI.playlists.setSmartRules(playlistId, rules)` for updating an existing smart playlist's rules without recreating it.

- [ ] **Step 1: Add the `setSmartRules` DB method + both IPC handlers**

This task has no dev-verify script coverage (it's Electron IPC plumbing, not testable outside a running app) — instead it's verified in Task 8's live launch pass. First add the missing DB method to `server/database.js`, right after `addSmartPlaylistRules()`:

```javascript
  // No separate DB method needed for setSmartRules — addSmartPlaylistRules()
  // already does a full replace, which is exactly what an edit-save needs.
```

(No code change here — `addSmartPlaylistRules()` from Task 2 already covers this. This note exists so the next implementer doesn't add a duplicate method.)

In `main.js`, immediately after the `playlist:delete` handler (after line 780):

```javascript
// SAVE A SMART PLAYLIST'S CURRENT MATCHES AS A NEW STATIC PLAYLIST
ipcMain.handle('playlist:save-smart-as-static', async (event, playlistId) => {
  try {
    const snapshot = await musicDB.saveSmartPlaylistAsStatic(playlistId);
    return snapshot;
  } catch (error) {
    console.error('❌ Error saving smart playlist as static:', error);
    throw error;
  }
});

// REPLACE A SMART PLAYLIST'S RULES (used by the rule builder's edit flow)
ipcMain.handle('playlist:set-smart-rules', async (event, { playlistId, rules }) => {
  try {
    const result = musicDB.addSmartPlaylistRules(playlistId, rules);
    return result;
  } catch (error) {
    console.error('❌ Error setting smart playlist rules:', error);
    throw error;
  }
});
```

In `client/scripts/main-preload.js`, inside the `playlists` object, right after the existing `delete` entry (line 104):

```javascript
    saveSmartAsStatic: (playlistId) =>
      ipcRenderer.invoke('playlist:save-smart-as-static', playlistId),
    setSmartRules: (playlistId, rules) =>
      ipcRenderer.invoke('playlist:set-smart-rules', { playlistId, rules }),
```

- [ ] **Step 2: Manual smoke check**

Run: `npm start`, open DevTools console (per `CLAUDE.md`'s debug commands), run:
```javascript
await window.queMusicAPI.playlists.create({ name: 'IPC Smoke Test', type: 'smart', match_mode: 'all', rules: [{ field: 'genre', operator: 'is', value: 'Rock' }] })
```
Expected: resolves with a playlist object, no thrown error in the console.

- [ ] **Step 3: Commit**

```bash
git add main.js client/scripts/main-preload.js
git commit -m "feat(smart-playlists): wire IPC handlers + preload API for save-as-static and rule updates"
```

---

## Task 6: Rule builder UI — modal markup + CSS

**Files:**
- Modify: `client/pages/index.html:719` (playlist modal — add type toggle + rule builder container)
- Create: CSS additions in `client/styles/components/forms.css` (rule row layout) — append to end of file, follow existing `.form-group` conventions in that file
- Modify: `build-css.js` output — not edited directly; rebuilt via `node build-css.js` in Step 3 below (see the `CLAUDE.md` gotcha logged 2026-09-14: source CSS edits are invisible until the bundle is rebuilt)

**Interfaces:**
- Produces: DOM elements `#playlistTypeToggle` (radio/segmented control, values `static`/`smart`), `#smartRuleBuilder` (container, hidden unless type is `smart`), `#smartMatchMode` (select, `all`/`any`), `#addSmartRuleBtn`, and a `.smart-rule-row` template each row of the builder clones — consumed by Task 7's JS.

- [ ] **Step 1: Add the modal markup**

In `client/pages/index.html`, inside `#playlistModal`'s `.modal-body` (starts at line 726), insert a type toggle before the existing name field, and the rule builder after the description field:

```html
        <div class="modal-body">
          <div class="form-group">
            <label>Playlist Type</label>
            <div class="segmented-control" id="playlistTypeToggle">
              <button type="button" class="segmented-option active" data-type="static">Static</button>
              <button type="button" class="segmented-option" data-type="smart">Smart</button>
            </div>
          </div>

          <div class="form-group">
            <label for="playlistName">Playlist Name</label>
            <input
              type="text"
              id="playlistName"
              placeholder="Enter playlist name..."
              maxlength="100"
              required
            />
          </div>

          <div class="form-group">
            <label for="playlistDescription">Description (optional)</label>
            <textarea
              id="playlistDescription"
              placeholder="Add a description for your playlist..."
              rows="3"
              maxlength="500"
            ></textarea>
          </div>

          <div class="form-group" id="smartRuleBuilder" style="display: none">
            <label>Match</label>
            <select id="smartMatchMode" class="setting-select">
              <option value="all">ALL of the following rules</option>
              <option value="any">ANY of the following rules</option>
            </select>

            <div id="smartRuleRows"></div>

            <button type="button" class="btn-secondary" id="addSmartRuleBtn">+ Add Rule</button>
          </div>
        </div>
```

Add a `<template>` for one rule row, right after `#playlistModal`'s closing `</div>` (after line 756), so `playlist-renderer.js` can clone it:

```html
    <template id="smartRuleRowTemplate">
      <div class="smart-rule-row">
        <select class="smart-rule-field">
          <option value="artist">Artist</option>
          <option value="album">Album</option>
          <option value="genre">Genre</option>
          <option value="year">Year</option>
          <option value="play_count">Play Count</option>
          <option value="date_added">Date Added</option>
          <option value="favorite">Favorite</option>
        </select>
        <select class="smart-rule-operator"></select>
        <input type="text" class="smart-rule-value" />
        <button type="button" class="btn-icon smart-rule-remove" title="Remove rule">✕</button>
      </div>
    </template>
```

- [ ] **Step 2: Add CSS for the rule builder**

Append to the end of `client/styles/components/forms.css`:

```css
/* Smart playlist rule builder — added 2026-09-14 */
.segmented-control {
  display: flex;
  gap: 2px;
  background: var(--surface-elevated);
  border-radius: var(--radius-lg);
  padding: 2px;
}

.segmented-option {
  flex: 1;
  padding: var(--space-xs) var(--space-sm);
  border: none;
  background: transparent;
  color: var(--text-secondary);
  border-radius: var(--radius-md);
  cursor: pointer;
}

.segmented-option.active {
  background: var(--primary);
  color: white;
}

.smart-rule-row {
  display: flex;
  gap: var(--space-sm);
  align-items: center;
  margin-bottom: var(--space-sm);
}

.smart-rule-row .smart-rule-field,
.smart-rule-row .smart-rule-operator {
  flex: 1;
}

.smart-rule-row .smart-rule-value {
  flex: 2;
}
```

- [ ] **Step 3: Rebuild the CSS bundle**

Run: `node build-css.js`
Expected: `📦 CSS Bundle created successfully!`, and `grep -n "smart-rule-row" client/styles/bundled.css` returns matches.

- [ ] **Step 4: Commit**

```bash
git add client/pages/index.html client/styles/components/forms.css client/styles/bundled.css
git commit -m "feat(smart-playlists): add rule builder modal markup and CSS"
```

---

## Task 7: Rule builder UI — JavaScript wiring in `playlist-renderer.js`

**Files:**
- Modify: `client/scripts/playlist-renderer.js` (extend `showPlaylistModal()` at line 481, `savePlaylistFromModal()` at line 782, `setupModalEventListeners()` at line 726)

**Interfaces:**
- Consumes: DOM elements from Task 6 (`#playlistTypeToggle`, `#smartRuleBuilder`, `#smartMatchMode`, `#addSmartRuleBtn`, `#smartRuleRowTemplate`), `window.queMusicAPI.playlists.create/update/setSmartRules` (Task 5).
- Produces: rules array gathered from the DOM in the shape `{ field, operator, value }[]` that `createPlaylist`/`setSmartRules` expect (Task 2's `addSmartPlaylistRules`).

- [ ] **Step 1: Add the field→operator map and row-rendering helpers**

Add near the top of the `PlaylistRenderer` class (after the constructor, before `showPlaylistModal`):

```javascript
  // Field -> allowed operators, mirrors server/database.js's _smartRuleToFragment().
  static SMART_FIELD_OPERATORS = {
    artist: ['is', 'is not', 'contains'],
    album: ['is', 'is not', 'contains'],
    genre: ['is', 'is not', 'contains'],
    year: ['is', 'greater than', 'less than'],
    play_count: ['is', 'greater than', 'less than'],
    date_added: ['before', 'after', 'in the last N days'],
    favorite: ['is', 'is not'],
  };

  addSmartRuleRow(rule = { field: 'genre', operator: 'is', value: '' }) {
    const template = document.getElementById('smartRuleRowTemplate');
    const row = template.content.firstElementChild.cloneNode(true);

    const fieldSelect = row.querySelector('.smart-rule-field');
    const operatorSelect = row.querySelector('.smart-rule-operator');
    const valueInput = row.querySelector('.smart-rule-value');
    const removeBtn = row.querySelector('.smart-rule-remove');

    const populateOperators = () => {
      const ops = PlaylistRenderer.SMART_FIELD_OPERATORS[fieldSelect.value] || [];
      operatorSelect.innerHTML = ops.map((op) => `<option value="${op}">${op}</option>`).join('');
    };

    fieldSelect.value = rule.field;
    populateOperators();
    operatorSelect.value = rule.operator;
    valueInput.value = rule.value;

    fieldSelect.addEventListener('change', populateOperators);
    removeBtn.addEventListener('click', () => row.remove());

    document.getElementById('smartRuleRows').appendChild(row);
  }

  static SMART_NUMERIC_FIELDS = new Set(['year', 'play_count']);

  // Returns { rules, error }. `error` is a user-facing string set the moment a
  // numeric field's value doesn't parse — the spec requires rejecting bad
  // input at save time, not silently coercing it to NaN.
  gatherSmartRules() {
    const rows = Array.from(document.querySelectorAll('#smartRuleRows .smart-rule-row'));
    const rules = [];

    for (const row of rows) {
      const field = row.querySelector('.smart-rule-field').value;
      const operator = row.querySelector('.smart-rule-operator').value;
      const value = row.querySelector('.smart-rule-value').value.trim();

      if (PlaylistRenderer.SMART_NUMERIC_FIELDS.has(field) && operator !== 'between') {
        if (value === '' || Number.isNaN(Number(value))) {
          return { rules: null, error: `"${value}" isn't a valid number for that rule` };
        }
      }

      rules.push({ field, operator, value });
    }

    return { rules, error: null };
  }
```

- [ ] **Step 2: Wire the type toggle and populate rules on edit — modify `showPlaylistModal()`**

In `showPlaylistModal()` (`client/scripts/playlist-renderer.js:481`), after the existing `if (playlist) { ... } else { ... }` block that sets `modalTitle`/`nameInput`/`descInput` (ends around line 507), add:

```javascript
    const typeToggle = document.getElementById('playlistTypeToggle');
    const ruleBuilder = document.getElementById('smartRuleBuilder');
    const matchModeSelect = document.getElementById('smartMatchMode');
    document.getElementById('smartRuleRows').innerHTML = '';

    const setType = (type) => {
      typeToggle.querySelectorAll('.segmented-option').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.type === type);
      });
      ruleBuilder.style.display = type === 'smart' ? 'block' : 'none';
    };

    if (playlist && playlist.type === 'smart') {
      setType('smart');
      matchModeSelect.value = playlist.match_mode || 'all';
      (playlist.rules || []).forEach((rule) => this.addSmartRuleRow(rule));
      if (!playlist.rules) {
        // getPlaylistById doesn't return rules directly — fetch them once for editing.
        window.queMusicAPI.playlists.getById(playlist.id).then(() => {});
      }
    } else {
      setType('static');
    }

    typeToggle.querySelectorAll('.segmented-option').forEach((btn) => {
      btn.onclick = () => setType(btn.dataset.type);
    });
```

> Implementer note: `getPlaylistById()` returns computed `tracks`, not the raw `smart_playlist_rules` rows. Editing an existing smart playlist's rules needs the rules, not the tracks — add a small `getSmartPlaylistRules` read path: expose `MusicDatabase.getSmartPlaylistRules` (already written in Task 2) via a new `playlist:get-smart-rules` IPC handler + `window.queMusicAPI.playlists.getSmartRules(playlistId)` preload entry (same pattern as Task 5), then replace the dead `.then(() => {})` above with:
> ```javascript
> const rules = await window.queMusicAPI.playlists.getSmartRules(playlist.id);
> rules.forEach((rule) => this.addSmartRuleRow(rule));
> ```
> and mark `showPlaylistModal` `async` (its callers already use `await`-tolerant patterns since JS ignores unused promises, but check call sites at lines 65, 96, 1063, 1560, 1687 — none currently `await` the call, so making it `async` is backward-compatible).

- [ ] **Step 3: Add the "+ Add Rule" button listener — modify `setupModalEventListeners()`**

In `setupModalEventListeners()` (line 726), after the existing `savePlaylist` listener block (after line 748):

```javascript
    const addRuleBtn = document.getElementById('addSmartRuleBtn');
    if (addRuleBtn) {
      addRuleBtn.addEventListener('click', () => this.addSmartRuleRow());
    }
```

- [ ] **Step 4: Gather type/rules on save — modify `savePlaylistFromModal()`**

In `savePlaylistFromModal()` (line 782), replace the `playlistData` construction (lines 796-799):

```javascript
      const activeType = document.querySelector('#playlistTypeToggle .segmented-option.active')?.dataset.type || 'static';
      const playlistData = {
        name: nameInput.value.trim(),
        description: descInput.value.trim(),
      };

      if (activeType === 'smart') {
        const { rules, error } = this.gatherSmartRules();
        if (error) {
          this.app.showNotification(error, 'warning');
          saveBtn.disabled = false;
          saveBtn.textContent = this.currentEditingPlaylist ? 'Save Changes' : 'Create Playlist';
          return;
        }
        if (rules.length === 0) {
          this.app.showNotification('Add at least one rule for a smart playlist', 'warning');
          saveBtn.disabled = false;
          saveBtn.textContent = this.currentEditingPlaylist ? 'Save Changes' : 'Create Playlist';
          return;
        }
        playlistData.type = 'smart';
        playlistData.match_mode = document.getElementById('smartMatchMode').value;
        playlistData.rules = rules;
      }
```

And in the `if (this.currentEditingPlaylist)` branch right after (line 802-805), add a rules update call when editing a smart playlist:

```javascript
      let newPlaylist = null;
      if (this.currentEditingPlaylist) {
        playlistData.id = this.currentEditingPlaylist.id;
        newPlaylist = await window.queMusicAPI.playlists.update(playlistData);
        if (activeType === 'smart') {
          await window.queMusicAPI.playlists.setSmartRules(this.currentEditingPlaylist.id, playlistData.rules);
        }
        this.app.showNotification('Playlist updated', 'success');
      } else {
```

- [ ] **Step 5: Manual verification**

Run: `npm start`. Open the Create Playlist modal, click "Smart", add two rules (e.g. Genre is Rock, Play Count greater than 5), set match mode to ALL, save. Expected: no console errors; the new playlist appears in the playlist list with the correct computed track count (Task 8 adds the visual badge — for now just confirm no crash and a sane count).

- [ ] **Step 6: Commit**

```bash
git add client/scripts/playlist-renderer.js
git commit -m "feat(smart-playlists): wire rule builder UI into create/edit playlist modal"
```

---

## Task 8: Smart-playlist badge in list rendering + "Save as Static" action

**Files:**
- Modify: `client/scripts/playlist-renderer.js:179` (`createPlaylistElement`)
- Modify: `client/scripts/ui-controller.js:598` (`loadPlaylistBrowser`'s card template)
- Modify: `client/pages/index.html:758` (playlist context menu — add "Save as Static Playlist" item)
- Modify: `client/scripts/playlist-renderer.js` (context menu handler wiring, near `createPlaylistContextMenu` at line 936)

**Interfaces:**
- Consumes: `playlist.type` (already present on every playlist row after Task 1/3), `window.queMusicAPI.playlists.saveSmartAsStatic` (Task 5).

- [ ] **Step 1: Add the badge to `createPlaylistElement()`**

In `client/scripts/playlist-renderer.js:179`, update the template:

```javascript
  createPlaylistElement(playlist) {
    const element = document.createElement('div');
    element.className = 'playlist-item';
    element.dataset.playlistId = playlist.id;
    const badge =
      playlist.type === 'smart'
        ? '<span class="playlist-type-badge smart" title="Smart Playlist">✦</span>'
        : '';
    element.innerHTML = `
      <div class="playlist-info">
        <h4>${badge}${this.escapeHtml(playlist.name)}</h4>
        <span class="track-count">${playlist.track_count || 0} tracks</span>
      </div>
      <div class="playlist-actions">
        <button class="btn-small play-playlist" title="Play playlist">▶</button>
        <button class="btn-small playlist-menu" title="Playlist options">⋮</button>
      </div>
    `;
    return element;
  }
```

- [ ] **Step 2: Add the badge to `loadPlaylistBrowser()`'s card**

In `client/scripts/ui-controller.js:598`, update the map callback's template string:

```javascript
          (playlist) => `
          <div class="playlist-item-card" data-playlist-id="${playlist.id}">
            <div class="playlist-item-header">
              <div class="playlist-item-name">${playlist.type === 'smart' ? '<span class="playlist-type-badge smart" title="Smart Playlist">✦</span>' : ''}${this.escapeHtml(playlist.name)}</div>
              <button class="playlist-item-menu btn-icon" title="Playlist options" data-playlist-id="${playlist.id}">⋮</button>
            </div>
            <div class="playlist-item-stats">
              <span>${playlist.track_count || 0} tracks</span>
              ${playlist.total_duration ? `<span>${this.formatDuration(playlist.total_duration)}</span>` : ''}
            </div>
          </div>
        `
```

Add badge CSS to `client/styles/components/forms.css` (appended in Task 6, add just below the smart-rule-row block):

```css
.playlist-type-badge.smart {
  color: #a855f7; /* matches the sidebar Discover accent from the 2026-09-14 icon pass */
  margin-right: var(--space-xs);
}
```

- [ ] **Step 3: Add "Save as Static Playlist" to the context menu**

In `client/pages/index.html`, inside `#playlistContextMenu` (starts line 759), add after the `exportM3U` item:

```html
      <div class="context-item" id="saveSmartAsStatic" style="display: none">
        <span class="context-icon">📸</span>
        <span>Save as Static Playlist</span>
      </div>
```

In `client/scripts/playlist-renderer.js`, find `showPlaylistContextMenu(event, playlist)` (line 917) and, after `this.currentContextPlaylist = playlist;`, toggle the new item's visibility and wire its click once (guarded the same way `setupModalEventListeners` guards with `this._modalListenersSetup`):

```javascript
    const saveAsStaticItem = document.getElementById('saveSmartAsStatic');
    if (saveAsStaticItem) {
      saveAsStaticItem.style.display = playlist.type === 'smart' ? 'flex' : 'none';
      if (!this._saveAsStaticListenerSetup) {
        saveAsStaticItem.addEventListener('click', async () => {
          try {
            await window.queMusicAPI.playlists.saveSmartAsStatic(this.currentContextPlaylist.id);
            this.app.showNotification('Saved as a new static playlist', 'success');
            await this.refreshPlaylistsView();
          } catch (error) {
            console.error('❌ Error saving smart playlist as static:', error);
            this.app.showNotification('Failed to save as static playlist', 'error');
          }
        });
        this._saveAsStaticListenerSetup = true;
      }
    }
```

- [ ] **Step 4: Rebuild CSS and run the full live verification pass**

Run: `node build-css.js`, then kill any running instance and `npm start`.

In the app:
1. Create a smart playlist (Genre is Rock, ALL mode). Confirm it shows the ✦ badge and a correct track count in both the sidebar/dual-pane playlist list.
2. Open it — confirm the right pane shows the matching tracks.
3. Right-click it — confirm "Save as Static Playlist" appears (and does NOT appear on a static playlist's context menu).
4. Click "Save as Static Playlist" — confirm a new static playlist appears with the same tracks, and it does NOT have the ✦ badge.
5. Edit the original smart playlist's rules to something that excludes a previously-matched track — confirm the snapshot from step 4 still has the old tracks (unaffected).

- [ ] **Step 5: Commit**

```bash
git add client/scripts/playlist-renderer.js client/scripts/ui-controller.js client/pages/index.html client/styles/components/forms.css client/styles/bundled.css
git commit -m "feat(smart-playlists): add type badge to playlist lists + Save as Static context action"
```

---

## Task 9: Docs sync

**Files:**
- Modify: `docs/application/roadmap.md` (check off item 3)
- Modify: `docs/issues/issues_track.md` (new dated entry)
- Modify: `docs/application/folder-structure.md` (only if `scripts/dev-verify/` needs listing — check current convention first; this folder is dev tooling, not `docs/`, so likely no change needed — confirm by reading the file before editing)

**Interfaces:** None — documentation only.

- [ ] **Step 1: Update `docs/application/roadmap.md`**

Change:
```markdown
- [ ] **Rule-based smart playlists.** Field + operator + value (artist is X, genre contains Y, play count > Z) instead of only hand-built M3U lists. Biggest feature gap versus Nagi. **Next up.**
```
to:
```markdown
- [x] **Rule-based smart playlists.** Field + operator + value (artist is X, genre contains Y, play count > Z) instead of only hand-built M3U lists. Built 2026-09-14 — see `docs/issues/issues_track.md` and `docs/superpowers/specs/2026-09-14-smart-playlists-design.md`.
```

- [ ] **Step 2: Add a `docs/issues/issues_track.md` entry**

Add a new entry at the top of "Version History & Bug Fixes", following the exact format of the existing 2026-09-14 entries (see the file's current top entry for the pattern): summarize the feature, the schema/engine/UI pieces built, the field/operator scope, the save-as-static addition, and confirm-by-Erich status once Task 8's live pass is done.

- [ ] **Step 3: Verify no other doc references need updating**

Run: `grep -rn "smart playlist" docs/ --include="*.md" -i` and confirm every hit reflects the shipped state (not still describing it as unbuilt). Fix any that say "not started" or similar.

- [ ] **Step 4: Commit**

```bash
git add docs/application/roadmap.md docs/issues/issues_track.md
git commit -m "docs(smart-playlists): mark roadmap item done, log build in issues_track"
```
