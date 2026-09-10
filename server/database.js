// server/database.js - Comprehensive Music Database with better-sqlite3
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs').promises;

class MusicDatabase {
  constructor(dbPath) {
    try {
      this.db = new Database(dbPath);
      console.log('🗄️ Database initialized:', dbPath);
    } catch (err) {
      console.error('❌ Database connection failed:', err.message);
      throw err;
    }

    // Property for M3U playlist management
    this.playlistFolder = null;

    // Initialize all database tables and indexes
    this.initializeCompleteSchema();
  }

  // ============================================================================
  // COMPLETE SCHEMA INITIALIZATION
  // ============================================================================
  initializeCompleteSchema() {
    console.log('📋 Initializing complete database schema...');

    // Enable foreign key constraints
    this.db.pragma('foreign_keys = ON');

    const schemaSQL = `
    -- ==============================================================================
    -- QUE-MUSIC DATABASE SCHEMA v2.0
    -- ==============================================================================

    CREATE TABLE IF NOT EXISTS tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT UNIQUE NOT NULL,
      filename TEXT NOT NULL,
      title TEXT,
      artist TEXT,
      album TEXT,
      year INTEGER,
      genre TEXT,
      duration INTEGER,
      filesize INTEGER DEFAULT 0,
      format TEXT,
      bitrate INTEGER,
      last_played DATETIME,
      play_count INTEGER DEFAULT 0,
      date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS artists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      track_count INTEGER DEFAULT 0,
      album_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS albums (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      artist TEXT,
      year INTEGER,
      track_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(title, artist)
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      track_count INTEGER DEFAULT 0,
      total_duration INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS playlist_tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      playlist_id INTEGER NOT NULL,
      track_id INTEGER,
      track_path TEXT,
      position INTEGER NOT NULL,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
      FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
      UNIQUE(playlist_id, track_path)
    );

    CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      track_id INTEGER NOT NULL,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
      UNIQUE(track_id)
    );

    CREATE TABLE IF NOT EXISTS recently_played (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      track_id INTEGER NOT NULL,
      played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      play_count INTEGER DEFAULT 1,
      FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_tracks_path ON tracks(path);
    CREATE INDEX IF NOT EXISTS idx_tracks_title ON tracks(title);
    CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
    CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album);
    CREATE INDEX IF NOT EXISTS idx_tracks_genre ON tracks(genre);
    CREATE INDEX IF NOT EXISTS idx_tracks_year ON tracks(year);
    CREATE INDEX IF NOT EXISTS idx_tracks_last_played ON tracks(last_played);
    CREATE INDEX IF NOT EXISTS idx_tracks_play_count ON tracks(play_count);
    CREATE INDEX IF NOT EXISTS idx_artists_name ON artists(name);
    CREATE INDEX IF NOT EXISTS idx_albums_title ON albums(title);
    CREATE INDEX IF NOT EXISTS idx_albums_artist ON albums(artist);
    CREATE INDEX IF NOT EXISTS idx_albums_year ON albums(year);
    CREATE INDEX IF NOT EXISTS idx_playlists_name ON playlists(name);
    CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist_id ON playlist_tracks(playlist_id);
    CREATE INDEX IF NOT EXISTS idx_playlist_tracks_track_id ON playlist_tracks(track_id);
    CREATE INDEX IF NOT EXISTS idx_playlist_tracks_path ON playlist_tracks(track_path);
    CREATE INDEX IF NOT EXISTS idx_playlist_tracks_position ON playlist_tracks(playlist_id, position);
    CREATE INDEX IF NOT EXISTS idx_favorites_track_id ON favorites(track_id);
    CREATE INDEX IF NOT EXISTS idx_recently_played_track_id ON recently_played(track_id);

    -- Triggers
    CREATE TRIGGER IF NOT EXISTS update_playlist_track_count_insert
    AFTER INSERT ON playlist_tracks
    BEGIN
      UPDATE playlists 
      SET track_count = (SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id = NEW.playlist_id),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = NEW.playlist_id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_playlist_track_count_delete
    AFTER DELETE ON playlist_tracks
    BEGIN
      UPDATE playlists 
      SET track_count = (SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id = OLD.playlist_id),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = OLD.playlist_id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_track_play_count
    AFTER INSERT ON recently_played
    BEGIN
      UPDATE tracks 
      SET play_count = play_count + NEW.play_count,
          last_played = NEW.played_at,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = NEW.track_id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_artist_track_count_insert
    AFTER INSERT ON tracks
    WHEN NEW.artist IS NOT NULL
    BEGIN
      INSERT OR IGNORE INTO artists (name) VALUES (NEW.artist);
      UPDATE artists 
      SET track_count = (SELECT COUNT(*) FROM tracks WHERE artist = NEW.artist)
      WHERE name = NEW.artist;
    END;

    CREATE TRIGGER IF NOT EXISTS update_artist_track_count_update
    AFTER UPDATE OF artist ON tracks
    BEGIN
      UPDATE artists SET track_count = (SELECT COUNT(*) FROM tracks WHERE artist = OLD.artist)
      WHERE name = OLD.artist;
      INSERT OR IGNORE INTO artists (name) VALUES (NEW.artist);
      UPDATE artists SET track_count = (SELECT COUNT(*) FROM tracks WHERE artist = NEW.artist)
      WHERE name = NEW.artist;
    END;

    CREATE TRIGGER IF NOT EXISTS update_album_track_count_insert
    AFTER INSERT ON tracks
    WHEN NEW.album IS NOT NULL
    BEGIN
      INSERT OR IGNORE INTO albums (title, artist, year) VALUES (NEW.album, NEW.artist, NEW.year);
      UPDATE albums 
      SET track_count = (SELECT COUNT(*) FROM tracks WHERE album = NEW.album AND artist = NEW.artist)
      WHERE title = NEW.album AND artist = NEW.artist;
    END;

    -- Views
    CREATE VIEW IF NOT EXISTS tracks_detailed AS
    SELECT 
      t.*,
      f.added_at as favorited_at,
      (f.track_id IS NOT NULL) as is_favorite,
      COALESCE(rp.recent_play_count, 0) as recent_plays,
      rp.last_recent_play
    FROM tracks t
    LEFT JOIN favorites f ON t.id = f.track_id
    LEFT JOIN (
      SELECT track_id, COUNT(*) as recent_play_count, MAX(played_at) as last_recent_play
      FROM recently_played 
      WHERE played_at > datetime('now', '-30 days')
      GROUP BY track_id
    ) rp ON t.id = rp.track_id;

    CREATE VIEW IF NOT EXISTS playlists_summary AS
    SELECT 
      p.*,
      COALESCE(SUM(t.duration), 0) as calculated_duration,
      COUNT(pt.id) as calculated_track_count
    FROM playlists p
    LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
    LEFT JOIN tracks t ON pt.track_id = t.id
    GROUP BY p.id;
    `;

    try {
      this.db.exec(schemaSQL);

      // Verify schema was created successfully
      const tables = this.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all();
      console.log('✅ Database schema initialized successfully');
      console.log('📋 Tables created:', tables.map((t) => t.name).join(', '));

      // Verify critical tables exist
      const criticalTables = ['tracks', 'playlists', 'playlist_tracks', 'artists', 'albums'];
      const missingTables = criticalTables.filter((name) => !tables.find((t) => t.name === name));

      if (missingTables.length > 0) {
        throw new Error(
          `Critical tables missing after schema initialization: ${missingTables.join(', ')}`
        );
      }
    } catch (err) {
      console.error('❌ Error creating database schema:', err.message);
      console.error('Full error:', err);
      throw err;
    }
  }

  // ============================================================================
  // SCHEMA VALIDATION AND MIGRATION
  // ============================================================================

  async validateSchema() {
    try {
      const expectedTables = [
        'tracks',
        'artists',
        'albums',
        'playlists',
        'playlist_tracks',
        'favorites',
        'recently_played',
      ];

      const tables = this.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        .all();

      const actualTables = tables.map((t) => t.name);
      const missingTables = expectedTables.filter((t) => !actualTables.includes(t));

      if (missingTables.length > 0) {
        console.warn('⚠️ Missing database tables:', missingTables);
        return { valid: false, missingTables };
      } else {
        console.log('✅ Database schema validation passed');
        return { valid: true, missingTables: [] };
      }
    } catch (err) {
      throw err;
    }
  }

  // ============================================================================
  // TRACKS MANAGEMENT
  // ============================================================================
  addTracks(tracksArray) {
    console.log(`🗄️ addTracks called with ${tracksArray.length} tracks`);

    if (tracksArray.length === 0) {
      console.log('ℹ️ No tracks to add to database');
      return 0;
    }

    console.log(`💾 Starting database transaction for ${tracksArray.length} tracks...`);
    console.log('📝 Sample track:', JSON.stringify(tracksArray[0], null, 2));

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO tracks
      (path, filename, title, artist, album, year, genre, duration, filesize, format, bitrate, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    try {
      const startTime = Date.now();
      this.db.prepare('BEGIN').run();

      for (let i = 0; i < tracksArray.length; i++) {
        const track = tracksArray[i];
        stmt.run(
          track.path,
          track.filename,
          track.title || null,
          track.artist || null,
          track.album || null,
          track.year || null,
          track.genre || null,
          track.duration || null,
          track.filesize || 0,
          track.format || null,
          track.bitrate || null
        );

        if ((i + 1) % 100 === 0 || i + 1 === tracksArray.length) {
          console.log(`💾 Database progress: ${i + 1}/${tracksArray.length} tracks processed`);
        }
      }

      this.db.prepare('COMMIT').run();
      const duration = Date.now() - startTime;
      console.log(
        `✅ Database update complete: ${tracksArray.length} tracks processed (${duration}ms)`
      );
      return tracksArray.length;
    } catch (err) {
      console.error('❌ Database error during track insertion:', err.message);
      try {
        this.db.prepare('ROLLBACK').run();
      } catch (rollbackErr) {
        console.error('❌ Failed to rollback transaction:', rollbackErr.message);
      }
      throw err;
    }
  }

  // Basic track query methods
  getAllTracks(orderBy = 'artist, album, title') {
    try {
      const rows = this.db.prepare(`SELECT * FROM tracks ORDER BY ${orderBy}`).all();
      console.log(`🎵 Retrieved ${rows.length} tracks`);
      return rows || [];
    } catch (err) {
      console.error('❌ Error getting all tracks:', err);
      throw err;
    }
  }

  getTracksByArtist(artist) {
    try {
      const rows = this.db
        .prepare('SELECT * FROM tracks WHERE artist = ? ORDER BY album, title')
        .all(artist);
      console.log(`🎤 Retrieved ${rows.length} tracks for artist: ${artist}`);
      return rows || [];
    } catch (err) {
      console.error('❌ Error getting tracks by artist:', err);
      throw err;
    }
  }

  getTracksByAlbum(album, artist = null) {
    try {
      let rows;
      if (artist) {
        rows = this.db
          .prepare('SELECT * FROM tracks WHERE album = ? AND artist = ? ORDER BY title')
          .all(album, artist);
        console.log(`💿 Retrieved ${rows.length} tracks for album: ${album} by ${artist}`);
      } else {
        rows = this.db.prepare('SELECT * FROM tracks WHERE album = ? ORDER BY title').all(album);
        console.log(`💿 Retrieved ${rows.length} tracks for album: ${album}`);
      }
      return rows || [];
    } catch (err) {
      console.error('❌ Error getting tracks by album:', err);
      throw err;
    }
  }

  getTrackByPath(trackPath) {
    try {
      const row = this.db.prepare('SELECT * FROM tracks WHERE path = ?').get(trackPath);
      return row || null;
    } catch (err) {
      console.error('❌ Error getting track by path:', err);
      throw err;
    }
  }

  searchTracks(query, limit = 100) {
    try {
      const searchQuery = `%${query.toLowerCase()}%`;
      const rows = this.db
        .prepare(
          `
        SELECT * FROM tracks
        WHERE LOWER(title) LIKE ?
           OR LOWER(artist) LIKE ?
           OR LOWER(album) LIKE ?
           OR LOWER(genre) LIKE ?
        ORDER BY artist, album, title
        LIMIT ?
      `
        )
        .all(searchQuery, searchQuery, searchQuery, searchQuery, limit);
      console.log(`🔍 Search found ${rows.length} tracks for query: ${query}`);
      return rows || [];
    } catch (err) {
      console.error('❌ Error searching tracks:', err);
      throw err;
    }
  }

  // Artist and album query methods
  getAllArtists() {
    try {
      const rows = this.db
        .prepare(
          `
        SELECT DISTINCT artist, COUNT(*) as track_count
        FROM tracks
        WHERE artist IS NOT NULL AND artist != ''
        GROUP BY artist
        ORDER BY artist
      `
        )
        .all();
      console.log(`🎤 Retrieved ${rows.length} artists`);
      return rows || [];
    } catch (err) {
      console.error('❌ Error getting all artists:', err);
      throw err;
    }
  }

  getAllAlbums() {
    try {
      const rows = this.db
        .prepare(
          `
        SELECT DISTINCT album, artist, COUNT(*) as track_count, MIN(year) as year
        FROM tracks
        WHERE album IS NOT NULL AND album != ''
        GROUP BY album, artist
        ORDER BY artist, album
      `
        )
        .all();
      console.log(`💿 Retrieved ${rows.length} albums`);
      return rows || [];
    } catch (err) {
      console.error('❌ Error getting all albums:', err);
      throw err;
    }
  }

  // Recently played methods
  getRecentlyPlayed(limit = 50) {
    try {
      const rows = this.db
        .prepare(
          'SELECT * FROM tracks WHERE last_played IS NOT NULL ORDER BY last_played DESC LIMIT ?'
        )
        .all(limit);
      console.log(`🕒 Retrieved ${rows.length} recently played tracks`);
      return rows || [];
    } catch (err) {
      console.error('❌ Error getting recently played:', err);
      throw err;
    }
  }

  // ============================================================================
  // PLAYLIST FOLDER MANAGEMENT
  // ============================================================================
  async setPlaylistFolder(musicFolderPath) {
    try {
      this.playlistFolder = path.join(musicFolderPath, 'Playlists');

      // Ensure playlist folder exists
      await fs.mkdir(this.playlistFolder, { recursive: true });
      console.log(`📁 Playlist folder ready: ${this.playlistFolder}`);

      // Import any existing M3U files
      await this.importExistingM3UFiles();
    } catch (error) {
      console.error('❌ Error setting up playlist folder:', error);
      throw error;
    }
  }

  // Normalized key for matching an M3U entry against tracks.path.
  // Handles separator style, BOM, surrounding whitespace, file:// URLs and case.
  _normalizePathKey(p) {
    if (!p) return '';
    let s = String(p).replace(/^\uFEFF/, '').trim();
    if (/^file:\/\//i.test(s)) {
      try {
        s = decodeURI(s.replace(/^file:\/+/i, ''));
      } catch (e) {
        /* leave as-is */
      }
    }
    s = s.replace(/\//g, '\\').replace(/\\{2,}/g, '\\');
    return s.toLowerCase();
  }

  // One-shot lookup of every known track: by normalized path, and by filename
  // as a fallback for entries whose files were moved within the library.
  // A filename shared by more than one track is stored as null (ambiguous).
  _buildTrackIndex() {
    const byPath = new Map();
    const byName = new Map();
    for (const row of this.db.prepare('SELECT id, path, filename FROM tracks').all()) {
      byPath.set(this._normalizePathKey(row.path), row);
      const nameKey = String(row.filename || path.basename(row.path)).toLowerCase();
      byName.set(nameKey, byName.has(nameKey) ? null : row);
    }
    return { byPath, byName };
  }

  // Resolve one M3U entry to a track row, or null. Tries the exact (normalized)
  // path first, then a unique-filename match.
  _resolveTrackEntry(entry, baseDir, index) {
    const abs = path.isAbsolute(entry) ? entry : path.resolve(baseDir, entry);
    const exact = index.byPath.get(this._normalizePathKey(abs));
    if (exact) return exact;
    return index.byName.get(path.basename(abs).toLowerCase()) || null;
  }

  async importExistingM3UFiles(options = {}) {
    if (!this.playlistFolder) return { processed: 0, playlists: [] };

    try {
      const files = await fs.readdir(this.playlistFolder);
      const m3uFiles = files.filter((file) => file.toLowerCase().endsWith('.m3u'));
      console.log(`📂 Found ${m3uFiles.length} M3U file(s) in ${this.playlistFolder}`);
      if (m3uFiles.length === 0) return { processed: 0, playlists: [] };

      // Build the track index once and reuse it for every file.
      const trackIndex = this._buildTrackIndex();
      const results = [];
      for (const m3uFile of m3uFiles) {
        results.push(
          await this.importM3UFile(path.join(this.playlistFolder, m3uFile), {
            ...options,
            trackIndex,
          })
        );
      }

      const matched = results.reduce((n, r) => n + (r.matched || 0), 0);
      const missing = results.reduce((n, r) => n + (r.missing || 0), 0);
      console.log(
        `📂 M3U import complete: ${results.length} file(s), ${matched} track(s) matched, ${missing} unmatched`
      );
      return { processed: results.length, playlists: results };
    } catch (error) {
      console.warn('⚠️ Could not read playlist folder:', error.message);
      return { processed: 0, playlists: [], error: error.message };
    }
  }

  // Import a single .m3u into the database.
  //   replace = false (default): skip if a playlist with this name already exists.
  //   replace = true: rebuild the existing playlist's tracks from the file.
  async importM3UFile(m3uFilePath, options = {}) {
    const { replace = false, trackIndex = null } = options;
    const name = path.basename(m3uFilePath, path.extname(m3uFilePath));

    try {
      const existing = this.db.prepare('SELECT * FROM playlists WHERE name = ?').get(name);
      if (existing && !replace) {
        console.log(`📋 Playlist "${name}" already in database — skipping (use force re-import to replace)`);
        return { name, playlistId: existing.id, matched: 0, missing: 0, skipped: true };
      }

      const raw = await fs.readFile(m3uFilePath, 'utf8');
      const index = trackIndex || this._buildTrackIndex();
      const m3uDir = path.dirname(m3uFilePath);

      // Resolve every entry to a known track, preserving order and dropping dupes.
      const resolved = [];
      const missingPaths = [];
      const seen = new Set();
      for (const entry of this.parseM3UContent(raw)) {
        const hit = this._resolveTrackEntry(entry, m3uDir, index);
        if (!hit) {
          missingPaths.push(entry);
          continue;
        }
        if (seen.has(hit.path)) continue;
        seen.add(hit.path);
        resolved.push(hit);
      }

      const runImport = this.db.transaction(() => {
        let playlistId;
        if (existing) {
          playlistId = existing.id;
          this.db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?').run(playlistId);
        } else {
          const res = this.db
            .prepare('INSERT INTO playlists (name, description) VALUES (?, ?)')
            .run(name, `Imported from ${path.basename(m3uFilePath)}`);
          playlistId = res.lastInsertRowid;
        }
        const insert = this.db.prepare(
          'INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, track_path, position) VALUES (?, ?, ?, ?)'
        );
        resolved.forEach((track, i) => insert.run(playlistId, track.id, track.path, i + 1));
        return playlistId;
      });
      const playlistId = runImport();

      console.log(
        `📋 Imported "${name}": ${resolved.length} track(s) matched, ${missingPaths.length} unmatched`
      );
      return {
        name,
        playlistId,
        matched: resolved.length,
        missing: missingPaths.length,
        missingPaths,
      };
    } catch (error) {
      console.error(`❌ Error importing M3U file ${m3uFilePath}:`, error);
      return { name, playlistId: null, matched: 0, missing: 0, error: error.message };
    }
  }

  // ============================================================================
  // EXPORT PLAYLIST TO M3U (FINAL WORKING VERSION)
  // ============================================================================
  // async exportPlaylistToM3U(playlistId) {
  //   try {
  //     if (!this.playlistFolder) {
  //       throw new Error('Playlist folder not set');
  //     }

  //     // 1. Load playlist metadata
  //     const playlist = this.getPlaylistById(playlistId);
  //     if (!playlist) throw new Error(`Playlist ${playlistId} not found`);

  //     // 2. Load tracks using JOIN query
  //     const tracks = this.db
  //       .prepare(
  //         `
  //     SELECT t.path
  //     FROM playlist_tracks pt
  //     JOIN tracks t ON t.id = pt.track_id
  //     WHERE pt.playlist_id = ?
  //     ORDER BY pt.position ASC
  //   `
  //       )
  //       .all(playlistId);

  //     if (!tracks || tracks.length === 0) {
  //       throw new Error(`Playlist "${playlist.name}" has no tracks`);
  //     }

  //     // 3. Build file path
  //     const safeName = playlist.name.replace(/[<>:"/\\|?*]/g, '_');
  //     const filePath = path.join(this.playlistFolder, safeName + '.m3u');

  //     // 4. Build content
  //     const m3uContent = tracks.map((t) => t.path).join('\n');

  //     // 5. Write file
  //     await fs.writeFile(filePath, m3uContent, 'utf8');

  //     console.log(`💾 Exported ${tracks.length} tracks → ${filePath}`);

  //     return { success: true, filePath };
  //   } catch (err) {
  //     console.error('❌ EXPORT FAILED:', err);
  //     throw err;
  //   }
  // }
  async exportPlaylistToM3U(playlistId) {
    console.log('🟦 EXPORT REQUEST RECEIVED:', playlistId);

    try {
      if (!this.playlistFolder) {
        console.log('❌ Playlist folder is NOT set');
        throw new Error('Playlist folder not set');
      }
      console.log('📁 Playlist folder:', this.playlistFolder);

      // 1. Load playlist metadata
      const playlist = this.getPlaylistById(playlistId);
      console.log('📋 PLAYLIST OBJECT:', playlist);

      if (!playlist) {
        console.log('❌ Playlist not found');
        throw new Error(`Playlist ${playlistId} not found`);
      }

      // 2. Load tracks using JOIN query
      console.log('🔍 RUNNING TRACK QUERY…');

      const tracks = this.db
        .prepare(
          `
      SELECT t.path
      FROM playlist_tracks pt
      JOIN tracks t ON t.id = pt.track_id
      WHERE pt.playlist_id = ?
      ORDER BY pt.position ASC
    `
        )
        .all(playlistId);

      console.log('🎵 TRACK RESULT:', tracks);

      if (!tracks || tracks.length === 0) {
        console.log('❌ NO TRACKS FOUND FOR THIS PLAYLIST');
        throw new Error(`Playlist "${playlist.name}" has no tracks`);
      }

      // 3. Build file path
      const safeName = playlist.name.replace(/[<>:"/\\|?*]/g, '_');
      const filePath = path.join(this.playlistFolder, safeName + '.m3u');

      console.log('📄 EXPORT PATH:', filePath);

      // 4. Build content
      const m3uContent = tracks.map((t) => t.path).join('\n');
      console.log('📝 M3U CONTENT PREVIEW:', m3uContent.substring(0, 200));

      // 5. Write file
      await fs.writeFile(filePath, m3uContent, 'utf8');

      console.log('✅ EXPORT SUCCESS!', filePath);

      return { success: true, filePath };
    } catch (err) {
      console.log('🔥 DIAGNOSTIC EXPORT ERROR:', err);
      throw err;
    }
  }

  // ============================================================================
  // FAVORITES MANAGEMENT
  // ============================================================================
  async getFavorites(limit = 1000, sortBy = 'added_at', sortOrder = 'DESC') {
    try {
      const validSortFields = ['added_at', 'title', 'artist', 'album', 'year'];
      const validSortOrders = ['ASC', 'DESC'];

      if (!validSortFields.includes(sortBy)) sortBy = 'added_at';
      if (!validSortOrders.includes(sortOrder.toUpperCase())) sortOrder = 'DESC';

      const query = `
      SELECT
        t.*,
        f.added_at as favorited_at,
        f.id as favorite_id
      FROM favorites f
      JOIN tracks t ON f.track_id = t.id
      ORDER BY ${sortBy === 'added_at' ? 'f.added_at' : 't.' + sortBy} ${sortOrder}
      LIMIT ?
    `;

      const favorites = this.db.prepare(query).all(limit);
      console.log(`⭐ Retrieved ${favorites.length} favorites`);
      return favorites;
    } catch (error) {
      console.error('❌ Error getting favorites:', error);
      return [];
    }
  }

  async getFavoritesCount() {
    try {
      const row = this.db.prepare('SELECT COUNT(*) as count FROM favorites').get();
      return row.count;
    } catch (error) {
      console.error('❌ Error getting favorites count:', error);
      return 0;
    }
  }

  // ============================================================================
  // DATABASE STATISTICS
  // ============================================================================
  getStats() {
    try {
      // First verify the tracks table exists
      const tableCheck = this.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tracks'")
        .get();

      if (!tableCheck) {
        console.error('❌ tracks table does not exist - schema may not be initialized');
        return {
          tracks: 0,
          artists: 0,
          albums: 0,
          genres: 0,
          totalDuration: 0,
          totalSize: 0,
        };
      }

      const tracksRow = this.db.prepare('SELECT COUNT(*) as count FROM tracks').get();
      const artistsRow = this.db
        .prepare(
          "SELECT COUNT(DISTINCT artist) as count FROM tracks WHERE artist IS NOT NULL AND artist != ''"
        )
        .get();
      const albumsRow = this.db
        .prepare(
          "SELECT COUNT(DISTINCT album) as count FROM tracks WHERE album IS NOT NULL AND album != ''"
        )
        .get();
      const genresRow = this.db
        .prepare(
          "SELECT COUNT(DISTINCT genre) as count FROM tracks WHERE genre IS NOT NULL AND genre != ''"
        )
        .get();
      const durationRow = this.db
        .prepare('SELECT SUM(duration) as total FROM tracks WHERE duration IS NOT NULL')
        .get();
      const sizeRow = this.db
        .prepare('SELECT SUM(filesize) as total FROM tracks WHERE filesize IS NOT NULL')
        .get();

      const results = {
        tracks: tracksRow.count,
        artists: artistsRow.count,
        albums: albumsRow.count,
        genres: genresRow.count,
        totalDuration: durationRow.total || 0,
        totalSize: sizeRow.total || 0,
      };

      console.log('📊 Database stats retrieved:', results);
      return results;
    } catch (err) {
      console.error('❌ Error getting stats:', err);
      console.error('Error details:', {
        message: err.message,
        code: err.code,
        stack: err.stack,
      });
      throw err;
    }
  }

  // Debug method to check for duplicate entries
  checkForDuplicates() {
    try {
      const duplicates = this.db
        .prepare(
          `
        SELECT path, COUNT(*) as count, GROUP_CONCAT(id) as ids
        FROM tracks
        GROUP BY path
        HAVING COUNT(*) > 1
        ORDER BY count DESC
      `
        )
        .all();

      if (duplicates.length > 0) {
        console.log(`🚨 Found ${duplicates.length} duplicate paths in database:`);
        duplicates.slice(0, 10).forEach((dup) => {
          console.log(`  - Path: ${dup.path}`);
          console.log(`  - Count: ${dup.count}`);
          console.log(`  - IDs: ${dup.ids}`);
        });
      } else {
        console.log(`✅ No duplicate paths found in database`);
      }

      return duplicates;
    } catch (err) {
      console.error('❌ Error checking for duplicates:', err);
      throw err;
    }
  }

  getGenreStats() {
    try {
      const rows = this.db
        .prepare(
          `
        SELECT DISTINCT TRIM(genre) as genre, COUNT(DISTINCT id) as count
        FROM tracks
        WHERE genre IS NOT NULL AND TRIM(genre) != ''
        GROUP BY TRIM(genre)
        ORDER BY count DESC
      `
        )
        .all();
      console.log(`📊 Retrieved genre stats for ${rows.length} unique genres`);
      return rows;
    } catch (err) {
      console.error('❌ Error getting genre stats:', err);
      throw err;
    }
  }

  getYearStats() {
    try {
      const rows = this.db
        .prepare(
          `
        SELECT year, COUNT(*) as count
        FROM tracks
        WHERE year IS NOT NULL
        GROUP BY year
        ORDER BY year DESC
      `
        )
        .all();
      console.log(`📊 Retrieved year stats for ${rows.length} years`);
      return rows;
    } catch (err) {
      console.error('❌ Error getting year stats:', err);
      throw err;
    }
  }

  // ============================================================================
  // PLAYLIST MANAGEMENT
  // ============================================================================
  getAllPlaylists() {
    try {
      const rows = this.db
        .prepare(
          `
        SELECT p.*, COUNT(pt.id) as track_count
        FROM playlists p
        LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
        LEFT JOIN tracks t ON pt.track_path = t.path
        GROUP BY p.id
        ORDER BY p.created_at DESC
      `
        )
        .all();
      console.log(`📋 Retrieved ${rows.length} playlists`);
      return rows || [];
    } catch (err) {
      console.error('❌ Error getting playlists:', err);
      throw err;
    }
  }

  createPlaylist(playlistData) {
    try {
      const { name, description = '' } = playlistData;

      const stmt = this.db.prepare('INSERT INTO playlists (name, description) VALUES (?, ?)');
      const result = stmt.run(name, description);
      const playlistId = result.lastInsertRowid;

      // Get the created playlist
      const row = this.db.prepare('SELECT * FROM playlists WHERE id = ?').get(playlistId);
      console.log(`📋 Created playlist: ${name}`);
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

  // ============================================================================
  // FAVORITES MANAGEMENT
  // ============================================================================
  async addToFavoritesByPath(trackPath) {
    try {
      console.log(`⭐ Adding to favorites by path: ${trackPath}`);

      if (!trackPath) {
        return { success: false, error: 'No track path provided' };
      }

      // Get track ID by path
      const track = this.db.prepare('SELECT id FROM tracks WHERE path = ?').get(trackPath);

      if (!track) {
        return { success: false, error: 'Track not found' };
      }

      // Check if already in favorites
      const existing = this.db.prepare('SELECT id FROM favorites WHERE track_id = ?').get(track.id);

      if (existing) {
        return { success: true, added: false, trackId: track.id };
      }

      // Add to favorites
      this.db.prepare('INSERT INTO favorites (track_id) VALUES (?)').run(track.id);
      console.log(`⭐ Added to favorites: ${trackPath}`);
      return { success: true, added: true, trackId: track.id };
    } catch (error) {
      console.error('❌ Error adding to favorites:', error);
      return { success: false, error: error.message };
    }
  }

  async removeFromFavoritesByPath(trackPath) {
    try {
      console.log(`💔 Removing from favorites by path: ${trackPath}`);

      if (!trackPath) {
        return { success: false, error: 'No track path provided' };
      }

      // Get track ID by path
      const track = this.db.prepare('SELECT id FROM tracks WHERE path = ?').get(trackPath);

      if (!track) {
        return { success: false, error: 'Track not found' };
      }

      // Remove from favorites
      const result = this.db.prepare('DELETE FROM favorites WHERE track_id = ?').run(track.id);
      console.log(`💔 Removed from favorites: ${trackPath}`);
      return { success: true, removed: result.changes > 0, trackId: track.id };
    } catch (error) {
      console.error('❌ Error removing from favorites:', error);
      return { success: false, error: error.message };
    }
  }

  async isFavoriteByPath(trackPath) {
    try {
      if (!trackPath) {
        return false;
      }

      const row = this.db
        .prepare(
          `
        SELECT f.id FROM favorites f
        JOIN tracks t ON f.track_id = t.id
        WHERE t.path = ?
      `
        )
        .get(trackPath);

      return !!row;
    } catch (error) {
      console.error('❌ Error checking favorite status:', error);
      return false;
    }
  }

  async clearFavorites() {
    try {
      const result = this.db.prepare('DELETE FROM favorites').run();
      console.log(`💔 Cleared ${result.changes} favorites`);
      return { success: true, cleared: result.changes };
    } catch (error) {
      console.error('❌ Error clearing favorites:', error);
      return { success: false, error: error.message };
    }
  }

  async getPlaylistById(playlistId) {
    try {
      // Get playlist info first
      const playlist = this.db.prepare('SELECT * FROM playlists WHERE id = ?').get(playlistId);

      if (!playlist) {
        throw new Error(`Playlist with ID ${playlistId} not found`);
      }

      // Get tracks in playlist
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

  async addTrackToPlaylist(playlistId, trackId) {
    try {
      // Get track path first
      const track = this.db.prepare('SELECT path FROM tracks WHERE id = ?').get(trackId);

      if (!track) {
        throw new Error(`Track with ID ${trackId} not found`);
      }

      // Get next position
      const result = this.db
        .prepare(
          'SELECT COALESCE(MAX(position), 0) + 1 as next_position FROM playlist_tracks WHERE playlist_id = ?'
        )
        .get(playlistId);
      const position = result.next_position;

      // Add track to playlist
      try {
        this.db
          .prepare(
            'INSERT INTO playlist_tracks (playlist_id, track_path, position) VALUES (?, ?, ?)'
          )
          .run(playlistId, track.path, position);
        console.log(`📋 Added track ${trackId} to playlist ${playlistId} at position ${position}`);
        return { success: true, position };
      } catch (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return { success: false, error: 'Track already in playlist' };
        }
        throw err;
      }
    } catch (err) {
      console.error('❌ Error adding track to playlist:', err);
      throw err;
    }
  }

  async removeTrackFromPlaylist(playlistId, trackId) {
    try {
      // Get track path first
      const track = this.db.prepare('SELECT path FROM tracks WHERE id = ?').get(trackId);

      if (!track) {
        throw new Error(`Track with ID ${trackId} not found`);
      }

      // Remove track from playlist
      const result = this.db
        .prepare('DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_path = ?')
        .run(playlistId, track.path);
      console.log(`📋 Removed track ${trackId} from playlist ${playlistId}`);
      return { success: true, removed: result.changes > 0 };
    } catch (err) {
      console.error('❌ Error removing track from playlist:', err);
      throw err;
    }
  }

  async deletePlaylist(playlistId) {
    try {
      this.db.prepare('BEGIN').run();

      // Delete playlist tracks first
      this.db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?').run(playlistId);

      // Delete playlist
      const result = this.db.prepare('DELETE FROM playlists WHERE id = ?').run(playlistId);

      this.db.prepare('COMMIT').run();
      console.log(`📋 Deleted playlist ${playlistId}`);
      return { success: true, deleted: result.changes > 0 };
    } catch (err) {
      try {
        this.db.prepare('ROLLBACK').run();
      } catch (rollbackErr) {
        console.error('❌ Rollback failed:', rollbackErr);
      }
      console.error('❌ Error deleting playlist:', err);
      throw err;
    }
  }

  async updatePlaylist(playlistData) {
    try {
      const { id, name, description = '' } = playlistData;

      this.db
        .prepare(
          'UPDATE playlists SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        )
        .run(name, description, id);

      const playlist = this.db.prepare('SELECT * FROM playlists WHERE id = ?').get(id);
      console.log(`📋 Updated playlist: ${name}`);
      return playlist;
    } catch (err) {
      console.error('❌ Error updating playlist:', err);
      throw err;
    }
  }

  // ============================================================================
  // RECENTLY PLAYED MANAGEMENT
  // ============================================================================
  async addToRecentlyPlayedByPath(trackPath) {
    try {
      if (!trackPath) {
        return { success: false, error: 'No track path provided' };
      }

      // Update last_played timestamp
      const result = this.db
        .prepare(
          'UPDATE tracks SET last_played = CURRENT_TIMESTAMP, play_count = COALESCE(play_count, 0) + 1 WHERE path = ?'
        )
        .run(trackPath);
      console.log(`🕒 Added to recently played: ${trackPath}`);
      return { success: true, updated: result.changes > 0 };
    } catch (error) {
      console.error('❌ Error adding to recently played:', error);
      return { success: false, error: error.message };
    }
  }

  async getRecentlyPlayedCount() {
    try {
      const row = this.db
        .prepare('SELECT COUNT(*) as count FROM tracks WHERE last_played IS NOT NULL')
        .get();
      return row.count;
    } catch (err) {
      console.error('❌ Error getting recently played count:', err);
      throw err;
    }
  }

  async clearRecentlyPlayed() {
    try {
      const result = this.db
        .prepare('UPDATE tracks SET last_played = NULL WHERE last_played IS NOT NULL')
        .run();
      console.log(`🕒 Cleared recently played for ${result.changes} tracks`);
      return { success: true, cleared: result.changes };
    } catch (err) {
      console.error('❌ Error clearing recently played:', err);
      throw err;
    }
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================
  async updateMissingDurations() {
    try {
      console.log('🔄 Updating missing durations...');

      // Find tracks with missing or zero durations
      const tracks = this.db
        .prepare('SELECT id, path FROM tracks WHERE duration IS NULL OR duration = 0')
        .all();

      if (tracks.length === 0) {
        console.log('✅ No tracks with missing durations found');
        return { updated: 0, total: 0 };
      }

      console.log(`🔍 Found ${tracks.length} tracks with missing durations`);

      // For now, we'll just update the database to mark that we checked
      // In a real implementation, you'd use a media library like node-ffmpeg
      // to extract actual duration from audio files
      let updated = 0;
      const stmt = this.db.prepare('UPDATE tracks SET duration = ? WHERE id = ?');

      for (const track of tracks) {
        try {
          // This is a placeholder - in reality you'd extract duration from the audio file
          // For now, we'll set a default duration to prevent the error
          stmt.run(0, track.id); // Setting to 0 as placeholder
          updated++;
        } catch (updateErr) {
          console.error(`❌ Error updating duration for track ${track.id}:`, updateErr);
        }
      }

      console.log(`✅ Updated durations for ${updated}/${tracks.length} tracks`);
      return { updated, total: tracks.length };
    } catch (err) {
      console.error('❌ Error updating missing durations:', err);
      throw err;
    }
  }

  async getTrackIdByPath(trackPath) {
    try {
      const row = this.db.prepare('SELECT id FROM tracks WHERE path = ?').get(trackPath);
      return row ? row.id : null;
    } catch (err) {
      console.error('❌ Error getting track ID by path:', err);
      throw err;
    }
  }

  parseM3UContent(content) {
    try {
      const lines = content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line);
      const trackPaths = [];

      for (const line of lines) {
        if (!line.startsWith('#') && line.length > 0) {
          // Convert file:// URLs and normalize paths
          let trackPath = line;
          if (trackPath.startsWith('file://')) {
            trackPath = decodeURI(trackPath.substring(7));
          }
          trackPaths.push(trackPath);
        }
      }

      console.log(`📂 Parsed M3U content: ${trackPaths.length} tracks`);
      return trackPaths;
    } catch (error) {
      console.error('❌ Error parsing M3U content:', error);
      return [];
    }
  }

  async populateArtistsAndAlbumsFromTracks() {
    try {
      console.log('🔄 Populating artists and albums from existing tracks...');

      this.db.prepare('BEGIN').run();

      // Clear existing data
      this.db.prepare('DELETE FROM artists').run();
      this.db.prepare('DELETE FROM albums').run();

      // Populate artists from tracks
      this.db
        .prepare(
          `
        INSERT INTO artists (name, track_count)
        SELECT
          artist,
          COUNT(*) as track_count
        FROM tracks
        WHERE artist IS NOT NULL
          AND artist != ''
          AND artist != 'Unknown Artist'
        GROUP BY artist
      `
        )
        .run();

      // Populate albums from tracks
      this.db
        .prepare(
          `
        INSERT INTO albums (title, artist, track_count, year)
        SELECT
          album,
          artist,
          COUNT(*) as track_count,
          MIN(year) as year
        FROM tracks
        WHERE album IS NOT NULL
          AND album != ''
          AND album != 'Unknown Album'
        GROUP BY album, artist
      `
        )
        .run();

      this.db.prepare('COMMIT').run();

      // Get counts of what was added
      const artistCount = this.db.prepare('SELECT COUNT(*) as artists FROM artists').get();
      const albumCount = this.db.prepare('SELECT COUNT(*) as albums FROM albums').get();

      const result = {
        artists: artistCount.artists,
        albums: albumCount.albums,
      };
      console.log('✅ Artists and albums populated successfully:', result);
      return result;
    } catch (err) {
      try {
        this.db.prepare('ROLLBACK').run();
      } catch (rollbackErr) {
        console.error('❌ Rollback failed:', rollbackErr);
      }
      console.error('❌ Error populating artists and albums:', err);
      throw err;
    }
  }

  // ============================================================================
  // DATABASE CLEANUP AND VALIDATION METHODS
  // ============================================================================

  /**
   * Validate all file paths in the database and return missing files
   */
  async validateAllPaths() {
    try {
      console.log('🔍 Validating all file paths in database...');

      const tracks = this.db.prepare('SELECT id, path, title, artist FROM tracks').all();
      const fs = require('fs');
      const validTracks = [];
      const invalidTracks = [];

      if (tracks.length === 0) {
        console.log('ℹ️ No tracks in database to validate');
        return { valid: [], invalid: [], total: 0 };
      }

      for (const track of tracks) {
        try {
          if (fs.existsSync(track.path)) {
            validTracks.push(track);
          } else {
            console.log(`❌ Missing file: ${track.path}`);
            invalidTracks.push(track);
          }
        } catch (error) {
          console.log(`❌ Error checking file: ${track.path} - ${error.message}`);
          invalidTracks.push(track);
        }
      }

      console.log(
        `✅ Path validation complete: ${validTracks.length} valid, ${invalidTracks.length} invalid`
      );
      return {
        valid: validTracks,
        invalid: invalidTracks,
        total: tracks.length,
      };
    } catch (err) {
      console.error('❌ Error validating paths:', err);
      throw err;
    }
  }

  /**
   * Find and attempt to correct invalid file paths
   */
  async findAlternativePaths(invalidTracks) {
    return new Promise((resolve, reject) => {
      console.log('🔍 Searching for alternative paths for missing files...');

      const fs = require('fs');
      const path = require('path');
      const correctionResults = [];

      if (invalidTracks.length === 0) {
        resolve([]);
        return;
      }

      let processed = 0;
      invalidTracks.forEach((track) => {
        const filename = path.basename(track.path);

        // Common path corrections to try
        const pathVariations = [
          track.path.replace('/EQ_Genre/', '/'),
          track.path.replace('\\EQ_Genre\\', '\\'),
          track.path.replace('/Albums/EQ_Genre/', '/Albums/'),
          track.path.replace('\\Albums\\EQ_Genre\\', '\\Albums\\'),
          track.path.replace('/Genre/', '/Albums/'),
          track.path.replace('\\Genre\\', '\\Albums\\'),
        ];

        let foundAlternative = false;
        for (const altPath of pathVariations) {
          if (altPath !== track.path && fs.existsSync(altPath)) {
            console.log(`✅ Found alternative path: ${altPath}`);
            correctionResults.push({
              originalTrack: track,
              newPath: altPath,
              correctionType: 'path_variation',
            });
            foundAlternative = true;
            break;
          }
        }

        if (!foundAlternative) {
          correctionResults.push({
            originalTrack: track,
            newPath: null,
            correctionType: 'not_found',
          });
        }

        processed++;
        if (processed === invalidTracks.length) {
          const corrected = correctionResults.filter((r) => r.newPath !== null);
          const stillMissing = correctionResults.filter((r) => r.newPath === null);

          console.log(
            `🔄 Path correction results: ${corrected.length} corrected, ${stillMissing.length} still missing`
          );
          resolve(correctionResults);
        }
      });
    });
  }

  /**
   * Update database with corrected paths, handling duplicates
   */
  async updateCorrectedPaths(corrections) {
    try {
      const validCorrections = corrections.filter((c) => c.newPath !== null);

      if (validCorrections.length === 0) {
        console.log('ℹ️ No path corrections to apply');
        return { updated: 0, duplicatesRemoved: 0 };
      }

      console.log(`🔄 Processing ${validCorrections.length} path corrections...`);

      // Group corrections by target path to handle duplicates
      const pathGroups = {};
      validCorrections.forEach((correction) => {
        if (!pathGroups[correction.newPath]) {
          pathGroups[correction.newPath] = [];
        }
        pathGroups[correction.newPath].push(correction);
      });

      let updated = 0;
      let duplicatesRemoved = 0;

      this.db.prepare('BEGIN').run();

      for (const targetPath of Object.keys(pathGroups)) {
        const group = pathGroups[targetPath];

        // Check if target path already exists in database
        const existingTrack = this.db
          .prepare('SELECT id FROM tracks WHERE path = ?')
          .get(targetPath);

        if (existingTrack) {
          // Target path already exists, remove all duplicates
          console.log(`🔄 Target path already exists: ${targetPath}`);
          console.log(`🧹 Removing ${group.length} duplicate records`);

          const duplicateIds = group.map((g) => g.originalTrack.id);
          const placeholders = duplicateIds.map(() => '?').join(',');

          const delResult = this.db
            .prepare(`DELETE FROM tracks WHERE id IN (${placeholders})`)
            .run(...duplicateIds);
          duplicatesRemoved += delResult.changes;
          console.log(`🧹 Removed ${delResult.changes} duplicate records for ${targetPath}`);
        } else {
          // Target path doesn't exist, update the first record and remove the rest
          const firstCorrection = group[0];
          const otherCorrections = group.slice(1);

          this.db
            .prepare('UPDATE tracks SET path = ? WHERE id = ?')
            .run(targetPath, firstCorrection.originalTrack.id);
          updated++;
          console.log(`✅ Updated path: ${firstCorrection.originalTrack.path} -> ${targetPath}`);

          // Remove any additional duplicates
          if (otherCorrections.length > 0) {
            const duplicateIds = otherCorrections.map((g) => g.originalTrack.id);
            const placeholders = duplicateIds.map(() => '?').join(',');

            const delResult = this.db
              .prepare(`DELETE FROM tracks WHERE id IN (${placeholders})`)
              .run(...duplicateIds);
            duplicatesRemoved += delResult.changes;
            console.log(`🧹 Removed ${delResult.changes} additional duplicates for ${targetPath}`);
          }
        }
      }

      this.db.prepare('COMMIT').run();
      console.log(
        `✅ Path correction completed: ${updated} updated, ${duplicatesRemoved} duplicates removed`
      );
      return { updated, duplicatesRemoved, errors: 0 };
    } catch (err) {
      try {
        this.db.prepare('ROLLBACK').run();
      } catch (rollbackErr) {
        console.error('❌ Rollback failed:', rollbackErr);
      }
      console.error('❌ Error updating corrected paths:', err);
      throw err;
    }
  }

  /**
   * Remove orphaned records from database
   */
  async removeOrphanedRecords(missingTrackIds) {
    try {
      if (missingTrackIds.length === 0) {
        console.log('ℹ️ No orphaned records to remove');
        return {
          tracks: 0,
          favorites: 0,
          recentlyPlayed: 0,
          playlistTracks: 0,
        };
      }

      console.log(`🧹 Removing orphaned records for ${missingTrackIds.length} missing tracks...`);

      const placeholders = missingTrackIds.map(() => '?').join(',');
      const results = {
        tracks: 0,
        favorites: 0,
        recentlyPlayed: 0,
        playlistTracks: 0,
      };

      this.db.prepare('BEGIN').run();

      // Remove from recently_played
      const recentlyPlayedResult = this.db
        .prepare(`DELETE FROM recently_played WHERE track_id IN (${placeholders})`)
        .run(...missingTrackIds);
      results.recentlyPlayed = recentlyPlayedResult.changes;
      console.log(`🧹 Removed ${recentlyPlayedResult.changes} recently played records`);

      // Remove from favorites
      const favoritesResult = this.db
        .prepare(`DELETE FROM favorites WHERE track_id IN (${placeholders})`)
        .run(...missingTrackIds);
      results.favorites = favoritesResult.changes;
      console.log(`🧹 Removed ${favoritesResult.changes} favorite records`);

      // Remove from playlist_tracks
      const playlistTracksResult = this.db
        .prepare(`DELETE FROM playlist_tracks WHERE track_id IN (${placeholders})`)
        .run(...missingTrackIds);
      results.playlistTracks = playlistTracksResult.changes;
      console.log(`🧹 Removed ${playlistTracksResult.changes} playlist track records`);

      // Finally, remove the tracks themselves
      const tracksResult = this.db
        .prepare(`DELETE FROM tracks WHERE id IN (${placeholders})`)
        .run(...missingTrackIds);
      results.tracks = tracksResult.changes;
      console.log(`🧹 Removed ${tracksResult.changes} track records`);

      this.db.prepare('COMMIT').run();
      console.log('✅ Orphaned record cleanup complete');
      return results;
    } catch (err) {
      try {
        this.db.prepare('ROLLBACK').run();
      } catch (rollbackErr) {
        console.error('❌ Rollback failed:', rollbackErr);
      }
      console.error('❌ Error removing orphaned records:', err);
      throw err;
    }
  }

  /**
   * Comprehensive database cleanup - validates paths, fixes what can be fixed, removes orphaned records
   */
  async cleanupDatabase() {
    console.log('🧹 Starting comprehensive database cleanup...');

    try {
      // Step 1: Validate all paths
      const pathValidation = await this.validateAllPaths();
      console.log(
        `📊 Path validation results: ${pathValidation.valid.length} valid, ${pathValidation.invalid.length} invalid`
      );

      if (pathValidation.invalid.length === 0) {
        console.log('✅ No invalid paths found - database is clean!');
        return {
          success: true,
          pathsValidated: pathValidation.total,
          pathsCorrected: 0,
          recordsRemoved: {
            tracks: 0,
            favorites: 0,
            recentlyPlayed: 0,
            playlistTracks: 0,
          },
        };
      }

      // Step 2: Try to find alternative paths for missing files
      const corrections = await this.findAlternativePaths(pathValidation.invalid);
      const correctable = corrections.filter((c) => c.newPath !== null);
      const uncorrectable = corrections.filter((c) => c.newPath === null);

      console.log(
        `🔄 Path correction analysis: ${correctable.length} can be corrected, ${uncorrectable.length} cannot be found`
      );

      // Step 3: Apply path corrections
      let pathsCorrected = 0;
      let duplicatesRemoved = 0;
      if (correctable.length > 0) {
        const updateResult = await this.updateCorrectedPaths(corrections);
        pathsCorrected = updateResult.updated;
        duplicatesRemoved = updateResult.duplicatesRemoved || 0;
      }

      // Step 4: Remove orphaned records for files that couldn't be found
      let recordsRemoved = {
        tracks: 0,
        favorites: 0,
        recentlyPlayed: 0,
        playlistTracks: 0,
      };

      if (uncorrectable.length > 0) {
        const orphanedIds = uncorrectable.map((u) => u.originalTrack.id);
        recordsRemoved = await this.removeOrphanedRecords(orphanedIds);
      }

      // Step 5: Rebuild artists and albums tables
      await this.populateArtistsAndAlbumsFromTracks();

      const summary = {
        success: true,
        pathsValidated: pathValidation.total,
        pathsCorrected: pathsCorrected,
        duplicatesRemoved: duplicatesRemoved,
        recordsRemoved: recordsRemoved,
        summary: `Validated ${pathValidation.total} paths, corrected ${pathsCorrected}, removed ${duplicatesRemoved} duplicates, cleaned ${recordsRemoved.tracks} orphaned tracks`,
      };

      console.log('✅ Database cleanup completed successfully');
      console.log('📊 Cleanup summary:', summary.summary);

      return summary;
    } catch (error) {
      console.error('❌ Database cleanup failed:', error);
      throw error;
    }
  }

  // ============================================================================
  // DATABASE CONNECTION MANAGEMENT
  // ============================================================================
  close() {
    if (this.db) {
      try {
        this.db.close();
        console.log('🗄️ Database connection closed successfully');
      } catch (err) {
        console.error('❌ Error closing database:', err.message);
      }
    }
  }
}

module.exports = MusicDatabase;
