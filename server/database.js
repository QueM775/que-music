// server/database.js - Comprehensive Music Database with SQLite3
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises;

class MusicDatabase {
  constructor(dbPath) {
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('❌ Database connection failed:', err.message);
        throw err;
      }
      console.log('🗄️ Database initialized:', dbPath);
    });

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
    this.db.run('PRAGMA foreign_keys = ON');

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

    this.db.exec(schemaSQL, (err) => {
      if (err) {
        console.error('❌ Error creating database schema:', err.message);
        throw err;
      } else {
        console.log('✅ Database schema initialized successfully');
      }
    });
  }

  // ============================================================================
  // SCHEMA VALIDATION AND MIGRATION
  // ============================================================================

  async validateSchema() {
    return new Promise((resolve, reject) => {
      const expectedTables = [
        'tracks',
        'artists',
        'albums',
        'playlists',
        'playlist_tracks',
        'favorites',
        'recently_played',
      ];

      this.db.all(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        [],
        (err, tables) => {
          if (err) {
            reject(err);
            return;
          }

          const actualTables = tables.map((t) => t.name);
          const missingTables = expectedTables.filter((t) => !actualTables.includes(t));

          if (missingTables.length > 0) {
            console.warn('⚠️ Missing database tables:', missingTables);
            resolve({ valid: false, missingTables });
          } else {
            console.log('✅ Database schema validation passed');
            resolve({ valid: true, missingTables: [] });
          }
        }
      );
    });
  }

  // ============================================================================
  // TRACKS MANAGEMENT
  // ============================================================================
  addTracks(tracksArray) {
    return new Promise((resolve, reject) => {
      console.log(`🗄️ addTracks called with ${tracksArray.length} tracks`);

      if (tracksArray.length === 0) {
        console.log('ℹ️ No tracks to add to database');
        resolve(0);
        return;
      }

      console.log(`💾 Starting database transaction for ${tracksArray.length} tracks...`);
      console.log('📝 Sample track:', JSON.stringify(tracksArray[0], null, 2));

      const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO tracks 
      (path, filename, title, artist, album, year, genre, duration, filesize, format, bitrate, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION', (err) => {
          if (err) {
            console.error('❌ Failed to begin database transaction:', err.message);
            reject(err);
            return;
          }

          let completed = 0;
          let hasError = false;
          const startTime = Date.now();

          const processTrack = (index) => {
            if (index >= tracksArray.length) {
              // All tracks processed successfully
              this.db.run('COMMIT', (commitErr) => {
                stmt.finalize();
                if (commitErr) {
                  console.error('❌ Failed to commit database transaction:', commitErr.message);
                  reject(commitErr);
                } else {
                  const duration = Date.now() - startTime;
                  console.log(
                    `✅ Database update complete: ${tracksArray.length} tracks processed (${duration}ms)`
                  );
                  resolve(tracksArray.length);
                }
              });
              return;
            }

            const track = tracksArray[index];
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
              track.bitrate || null,
              (err) => {
                if (err && !hasError) {
                  hasError = true;
                  console.error(
                    `❌ Database error on track ${completed + 1}/${tracksArray.length}:`,
                    err.message
                  );
                  console.error(`❌ Failed track path: ${track.path}`);
                  this.db.run('ROLLBACK', () => {
                    stmt.finalize();
                    reject(err);
                  });
                  return;
                }

                if (!hasError) {
                  completed++;
                  if (completed % 100 === 0 || completed === tracksArray.length) {
                    console.log(
                      `💾 Database progress: ${completed}/${tracksArray.length} tracks processed`
                    );
                  }
                  processTrack(index + 1);
                }
              }
            );
          };

          processTrack(0);
        });
      });
    });
  }

  // Basic track query methods
  getAllTracks(orderBy = 'artist, album, title') {
    return new Promise((resolve, reject) => {
      this.db.all(`SELECT * FROM tracks ORDER BY ${orderBy}`, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          console.log(`🎵 Retrieved ${rows.length} tracks`);
          resolve(rows || []);
        }
      });
    });
  }

  getTracksByArtist(artist) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM tracks WHERE artist = ? ORDER BY album, title',
        [artist],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            console.log(`🎤 Retrieved ${rows.length} tracks for artist: ${artist}`);
            resolve(rows || []);
          }
        }
      );
    });
  }

  getTracksByAlbum(album, artist = null) {
    return new Promise((resolve, reject) => {
      if (artist) {
        this.db.all(
          'SELECT * FROM tracks WHERE album = ? AND artist = ? ORDER BY title',
          [album, artist],
          (err, rows) => {
            if (err) {
              reject(err);
            } else {
              console.log(`💿 Retrieved ${rows.length} tracks for album: ${album} by ${artist}`);
              resolve(rows || []);
            }
          }
        );
      } else {
        this.db.all('SELECT * FROM tracks WHERE album = ? ORDER BY title', [album], (err, rows) => {
          if (err) {
            reject(err);
          } else {
            console.log(`💿 Retrieved ${rows.length} tracks for album: ${album}`);
            resolve(rows || []);
          }
        });
      }
    });
  }

  getTrackByPath(trackPath) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM tracks WHERE path = ?', [trackPath], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row || null);
        }
      });
    });
  }

  searchTracks(query, limit = 100) {
    return new Promise((resolve, reject) => {
      const searchQuery = `%${query.toLowerCase()}%`;
      this.db.all(
        `SELECT * FROM tracks 
         WHERE LOWER(title) LIKE ? 
            OR LOWER(artist) LIKE ? 
            OR LOWER(album) LIKE ? 
            OR LOWER(genre) LIKE ?
         ORDER BY artist, album, title
         LIMIT ?`,
        [searchQuery, searchQuery, searchQuery, searchQuery, limit],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            console.log(`🔍 Search found ${rows.length} tracks for query: ${query}`);
            resolve(rows || []);
          }
        }
      );
    });
  }

  // Artist and album query methods
  getAllArtists() {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT DISTINCT artist, COUNT(*) as track_count
         FROM tracks 
         WHERE artist IS NOT NULL AND artist != ''
         GROUP BY artist
         ORDER BY artist`,
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            console.log(`🎤 Retrieved ${rows.length} artists`);
            resolve(rows || []);
          }
        }
      );
    });
  }

  getAllAlbums() {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT DISTINCT album, artist, COUNT(*) as track_count, MIN(year) as year
         FROM tracks 
         WHERE album IS NOT NULL AND album != ''
         GROUP BY album, artist
         ORDER BY artist, album`,
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            console.log(`💿 Retrieved ${rows.length} albums`);
            resolve(rows || []);
          }
        }
      );
    });
  }

  // Recently played methods
  getRecentlyPlayed(limit = 50) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM tracks WHERE last_played IS NOT NULL ORDER BY last_played DESC LIMIT ?`,
        [limit],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            console.log(`🕒 Retrieved ${rows.length} recently played tracks`);
            resolve(rows || []);
          }
        }
      );
    });
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

  async importExistingM3UFiles() {
    if (!this.playlistFolder) return;

    try {
      const files = await fs.readdir(this.playlistFolder);
      const m3uFiles = files.filter((file) => file.toLowerCase().endsWith('.m3u'));

      console.log(`📂 Found ${m3uFiles.length} M3U files to import`);

      for (const m3uFile of m3uFiles) {
        await this.importM3UFile(path.join(this.playlistFolder, m3uFile));
      }
    } catch (error) {
      console.warn('⚠️ Could not read playlist folder:', error.message);
    }
  }

  async importM3UFile(m3uFilePath) {
    try {
      const content = await fs.readFile(m3uFilePath, 'utf8');
      const filename = path.basename(m3uFilePath, '.m3u');

      // Check if playlist already exists in database
      const existingPlaylist = await new Promise((resolve, reject) => {
        this.db.get('SELECT id FROM playlists WHERE name = ?', [filename], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (existingPlaylist) {
        console.log(`📋 Playlist "${filename}" already exists in database, skipping import`);
        return;
      }

      console.log(`📂 Importing playlist "${filename}"...`);
    } catch (error) {
      console.error(`❌ Error importing M3U file ${m3uFilePath}:`, error);
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

      const favorites = await new Promise((resolve, reject) => {
        this.db.all(query, [limit], (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows || []);
          }
        });
      });

      console.log(`⭐ Retrieved ${favorites.length} favorites`);
      return favorites;
    } catch (error) {
      console.error('❌ Error getting favorites:', error);
      return [];
    }
  }

  async getFavoritesCount() {
    try {
      const count = await new Promise((resolve, reject) => {
        this.db.get('SELECT COUNT(*) as count FROM favorites', [], (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      });
      return count;
    } catch (error) {
      console.error('❌ Error getting favorites count:', error);
      return 0;
    }
  }

  // ============================================================================
  // DATABASE STATISTICS
  // ============================================================================
  getStats() {
    return new Promise((resolve, reject) => {
      const queries = [
        'SELECT COUNT(*) as count FROM tracks',
        'SELECT COUNT(DISTINCT artist) as count FROM tracks WHERE artist IS NOT NULL AND artist != ""',
        'SELECT COUNT(DISTINCT album) as count FROM tracks WHERE album IS NOT NULL AND album != ""',
        'SELECT COUNT(DISTINCT genre) as count FROM tracks WHERE genre IS NOT NULL AND genre != ""',
        'SELECT SUM(duration) as total FROM tracks WHERE duration IS NOT NULL',
        'SELECT SUM(filesize) as total FROM tracks WHERE filesize IS NOT NULL',
      ];

      let results = {};
      let completed = 0;

      queries.forEach((query, index) => {
        this.db.get(query, (err, row) => {
          if (err) {
            reject(err);
            return;
          }

          switch (index) {
            case 0:
              results.tracks = row.count;
              break;
            case 1:
              results.artists = row.count;
              break;
            case 2:
              results.albums = row.count;
              break;
            case 3:
              results.genres = row.count;
              break;
            case 4:
              results.totalDuration = row.total || 0;
              break;
            case 5:
              results.totalSize = row.total || 0;
              break;
          }

          completed++;
          if (completed === queries.length) {
            console.log('📊 Database stats retrieved:', results);
            resolve(results);
          }
        });
      });
    });
  }

  // Debug method to check for duplicate entries
  checkForDuplicates() {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT path, COUNT(*) as count, GROUP_CONCAT(id) as ids
         FROM tracks 
         GROUP BY path 
         HAVING COUNT(*) > 1
         ORDER BY count DESC`,
        (err, duplicates) => {
          if (err) {
            reject(err);
            return;
          }

          if (duplicates.length > 0) {
            console.log(`🚨 Found ${duplicates.length} duplicate paths in database:`);
            duplicates.slice(0, 10).forEach(dup => {
              console.log(`  - Path: ${dup.path}`);
              console.log(`  - Count: ${dup.count}`);
              console.log(`  - IDs: ${dup.ids}`);
            });
          } else {
            console.log(`✅ No duplicate paths found in database`);
          }

          resolve(duplicates);
        }
      );
    });
  }

  getGenreStats() {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT DISTINCT TRIM(genre) as genre, COUNT(DISTINCT id) as count
         FROM tracks 
         WHERE genre IS NOT NULL AND TRIM(genre) != ''
         GROUP BY TRIM(genre)
         ORDER BY count DESC`,
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            console.log(`📊 Retrieved genre stats for ${rows.length} unique genres`);
            resolve(rows);
          }
        }
      );
    });
  }

  getYearStats() {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT year, COUNT(*) as count
       FROM tracks 
       WHERE year IS NOT NULL
       GROUP BY year
       ORDER BY year DESC`,
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            console.log(`📊 Retrieved year stats for ${rows.length} years`);
            resolve(rows);
          }
        }
      );
    });
  }

  // ============================================================================
  // PLAYLIST MANAGEMENT
  // ============================================================================
  getAllPlaylists() {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT p.*, COUNT(pt.id) as track_count
             FROM playlists p 
             LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id 
             LEFT JOIN tracks t ON pt.track_path = t.path
             GROUP BY p.id 
             ORDER BY p.created_at DESC`,
        [],
        (err, rows) => {
          if (err) {
            console.error('❌ Error getting playlists:', err);
            reject(err);
          } else {
            console.log(`📋 Retrieved ${rows.length} playlists`);
            resolve(rows || []);
          }
        }
      );
    });
  }

  createPlaylist(playlistData) {
    return new Promise((resolve, reject) => {
      const { name, description = '' } = playlistData;
      const db = this.db; // Capture db reference

      const stmt = db.prepare(`
      INSERT INTO playlists (name, description) 
      VALUES (?, ?)
    `);

      stmt.run(name, description, function (err) {
        if (err) {
          stmt.finalize();
          if (err.message.includes('UNIQUE constraint failed')) {
            reject(new Error(`Playlist "${name}" already exists`));
          } else {
            reject(err);
          }
          return;
        }

        const playlistId = this.lastID;

        // Get the created playlist
        stmt.finalize();
        db.get('SELECT * FROM playlists WHERE id = ?', [playlistId], (getErr, row) => {
          if (getErr) {
            reject(getErr);
          } else {
            console.log(`📋 Created playlist: ${name}`);
            resolve(row);
          }
        });
      });
    });
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

      return new Promise((resolve, reject) => {
        this.db.serialize(() => {
          this.db.run('BEGIN TRANSACTION', (err) => {
            if (err) {
              reject(err);
              return;
            }

            // Get track ID by path
            this.db.get('SELECT id FROM tracks WHERE path = ?', [trackPath], (err, track) => {
              if (err) {
                this.db.run('ROLLBACK');
                reject(err);
                return;
              }

              if (!track) {
                this.db.run('ROLLBACK');
                resolve({ success: false, error: 'Track not found' });
                return;
              }

              // Check if already in favorites
              this.db.get(
                'SELECT id FROM favorites WHERE track_id = ?',
                [track.id],
                (err, existing) => {
                  if (err) {
                    this.db.run('ROLLBACK');
                    reject(err);
                    return;
                  }

                  if (existing) {
                    this.db.run('COMMIT');
                    resolve({ success: true, added: false, trackId: track.id });
                    return;
                  }

                  // Add to favorites
                  this.db.run(
                    'INSERT INTO favorites (track_id) VALUES (?)',
                    [track.id],
                    function (err) {
                      if (err) {
                        this.db.run('ROLLBACK');
                        reject(err);
                      } else {
                        this.db.run('COMMIT', (commitErr) => {
                          if (commitErr) {
                            reject(commitErr);
                          } else {
                            console.log(`⭐ Added to favorites: ${trackPath}`);
                            resolve({ success: true, added: true, trackId: track.id });
                          }
                        });
                      }
                    }.bind(this)
                  );
                }
              );
            });
          });
        });
      });
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

      return new Promise((resolve, reject) => {
        // Get track ID by path
        this.db.get('SELECT id FROM tracks WHERE path = ?', [trackPath], (err, track) => {
          if (err) {
            reject(err);
            return;
          }

          if (!track) {
            resolve({ success: false, error: 'Track not found' });
            return;
          }

          // Remove from favorites
          this.db.run('DELETE FROM favorites WHERE track_id = ?', [track.id], function (err) {
            if (err) {
              reject(err);
            } else {
              console.log(`💔 Removed from favorites: ${trackPath}`);
              resolve({ success: true, removed: this.changes > 0, trackId: track.id });
            }
          });
        });
      });
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

      return new Promise((resolve, reject) => {
        this.db.get(
          `SELECT f.id FROM favorites f 
           JOIN tracks t ON f.track_id = t.id 
           WHERE t.path = ?`,
          [trackPath],
          (err, row) => {
            if (err) {
              console.error('❌ Database error in isFavoriteByPath:', err);
              reject(err);
            } else {
              resolve(!!row);
            }
          }
        );
      });
    } catch (error) {
      console.error('❌ Error checking favorite status:', error);
      return false;
    }
  }

  async clearFavorites() {
    try {
      return new Promise((resolve, reject) => {
        this.db.run('DELETE FROM favorites', function (err) {
          if (err) {
            reject(err);
          } else {
            console.log(`💔 Cleared ${this.changes} favorites`);
            resolve({ success: true, cleared: this.changes });
          }
        });
      });
    } catch (error) {
      console.error('❌ Error clearing favorites:', error);
      return { success: false, error: error.message };
    }
  }

  async getPlaylistById(playlistId) {
    return new Promise((resolve, reject) => {
      // Get playlist info first
      this.db.get('SELECT * FROM playlists WHERE id = ?', [playlistId], (err, playlist) => {
        if (err) {
          reject(err);
          return;
        }

        if (!playlist) {
          reject(new Error(`Playlist with ID ${playlistId} not found`));
          return;
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

        this.db.all(tracksQuery, [playlistId], (tracksErr, tracks) => {
          if (tracksErr) {
            reject(tracksErr);
            return;
          }

          playlist.tracks = Array.isArray(tracks) ? tracks : [];
          console.log(
            `📋 Retrieved playlist "${playlist.name}" with ${playlist.tracks.length} tracks`
          );
          resolve(playlist);
        });
      });
    });
  }

  async addTrackToPlaylist(playlistId, trackId) {
    return new Promise((resolve, reject) => {
      // Get track path first
      this.db.get('SELECT path FROM tracks WHERE id = ?', [trackId], (err, track) => {
        if (err) {
          reject(err);
          return;
        }

        if (!track) {
          reject(new Error(`Track with ID ${trackId} not found`));
          return;
        }

        // Get next position
        this.db.get(
          'SELECT COALESCE(MAX(position), 0) + 1 as next_position FROM playlist_tracks WHERE playlist_id = ?',
          [playlistId],
          (err, result) => {
            if (err) {
              reject(err);
              return;
            }

            const position = result.next_position;

            // Add track to playlist
            this.db.run(
              'INSERT INTO playlist_tracks (playlist_id, track_path, position) VALUES (?, ?, ?)',
              [playlistId, track.path, position],
              function (err) {
                if (err) {
                  if (err.message.includes('UNIQUE constraint failed')) {
                    resolve({ success: false, error: 'Track already in playlist' });
                  } else {
                    reject(err);
                  }
                } else {
                  console.log(
                    `📋 Added track ${trackId} to playlist ${playlistId} at position ${position}`
                  );
                  resolve({ success: true, position });
                }
              }
            );
          }
        );
      });
    });
  }

  async removeTrackFromPlaylist(playlistId, trackId) {
    return new Promise((resolve, reject) => {
      // Get track path first
      this.db.get('SELECT path FROM tracks WHERE id = ?', [trackId], (err, track) => {
        if (err) {
          reject(err);
          return;
        }

        if (!track) {
          reject(new Error(`Track with ID ${trackId} not found`));
          return;
        }

        // Remove track from playlist
        this.db.run(
          'DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_path = ?',
          [playlistId, track.path],
          function (err) {
            if (err) {
              reject(err);
            } else {
              console.log(`📋 Removed track ${trackId} from playlist ${playlistId}`);
              resolve({ success: true, removed: this.changes > 0 });
            }
          }
        );
      });
    });
  }

  async deletePlaylist(playlistId) {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION', (err) => {
          if (err) {
            reject(err);
            return;
          }

          // Delete playlist tracks first
          this.db.run('DELETE FROM playlist_tracks WHERE playlist_id = ?', [playlistId], (err) => {
            if (err) {
              this.db.run('ROLLBACK');
              reject(err);
              return;
            }

            // Delete playlist
            this.db.run(
              'DELETE FROM playlists WHERE id = ?',
              [playlistId],
              function (err) {
                if (err) {
                  this.db.run('ROLLBACK');
                  reject(err);
                } else {
                  this.db.run('COMMIT', (commitErr) => {
                    if (commitErr) {
                      reject(commitErr);
                    } else {
                      console.log(`📋 Deleted playlist ${playlistId}`);
                      resolve({ success: true, deleted: this.changes > 0 });
                    }
                  });
                }
              }.bind(this)
            );
          });
        });
      });
    });
  }

  async updatePlaylist(playlistData) {
    return new Promise((resolve, reject) => {
      const { id, name, description = '' } = playlistData;

      this.db.run(
        'UPDATE playlists SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [name, description, id],
        function (err) {
          if (err) {
            reject(err);
          } else {
            this.db.get('SELECT * FROM playlists WHERE id = ?', [id], (getErr, playlist) => {
              if (getErr) {
                reject(getErr);
              } else {
                console.log(`📋 Updated playlist: ${name}`);
                resolve(playlist);
              }
            });
          }
        }.bind(this)
      );
    });
  }

  // ============================================================================
  // RECENTLY PLAYED MANAGEMENT
  // ============================================================================
  async addToRecentlyPlayedByPath(trackPath) {
    try {
      if (!trackPath) {
        return { success: false, error: 'No track path provided' };
      }

      return new Promise((resolve, reject) => {
        // Update last_played timestamp
        this.db.run(
          'UPDATE tracks SET last_played = CURRENT_TIMESTAMP, play_count = COALESCE(play_count, 0) + 1 WHERE path = ?',
          [trackPath],
          function (err) {
            if (err) {
              reject(err);
            } else {
              console.log(`🕒 Added to recently played: ${trackPath}`);
              resolve({ success: true, updated: this.changes > 0 });
            }
          }
        );
      });
    } catch (error) {
      console.error('❌ Error adding to recently played:', error);
      return { success: false, error: error.message };
    }
  }

  async getRecentlyPlayedCount() {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT COUNT(*) as count FROM tracks WHERE last_played IS NOT NULL',
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row.count);
          }
        }
      );
    });
  }

  async clearRecentlyPlayed() {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE tracks SET last_played = NULL WHERE last_played IS NOT NULL',
        function (err) {
          if (err) {
            reject(err);
          } else {
            console.log(`🕒 Cleared recently played for ${this.changes} tracks`);
            resolve({ success: true, cleared: this.changes });
          }
        }
      );
    });
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================
  async updateMissingDurations() {
    return new Promise((resolve, reject) => {
      console.log('🔄 Updating missing durations...');

      // Find tracks with missing or zero durations
      this.db.all(
        'SELECT id, path FROM tracks WHERE duration IS NULL OR duration = 0',
        [],
        (err, tracks) => {
          if (err) {
            reject(err);
            return;
          }

          if (tracks.length === 0) {
            console.log('✅ No tracks with missing durations found');
            resolve({ updated: 0, total: 0 });
            return;
          }

          console.log(`🔍 Found ${tracks.length} tracks with missing durations`);

          // For now, we'll just update the database to mark that we checked
          // In a real implementation, you'd use a media library like node-ffmpeg
          // to extract actual duration from audio files
          let updated = 0;
          let processed = 0;

          tracks.forEach((track) => {
            // This is a placeholder - in reality you'd extract duration from the audio file
            // For now, we'll set a default duration to prevent the error
            this.db.run(
              'UPDATE tracks SET duration = ? WHERE id = ?',
              [0, track.id], // Setting to 0 as placeholder
              (updateErr) => {
                processed++;
                if (!updateErr) {
                  updated++;
                }

                if (processed === tracks.length) {
                  console.log(`✅ Updated durations for ${updated}/${tracks.length} tracks`);
                  resolve({ updated, total: tracks.length });
                }
              }
            );
          });
        }
      );
    });
  }

  async getTrackIdByPath(trackPath) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT id FROM tracks WHERE path = ?', [trackPath], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row ? row.id : null);
        }
      });
    });
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
    return new Promise((resolve, reject) => {
      console.log('🔄 Populating artists and albums from existing tracks...');

      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION', (err) => {
          if (err) {
            reject(err);
            return;
          }

          // Clear existing data
          this.db.run('DELETE FROM artists');
          this.db.run('DELETE FROM albums');

          // Populate artists from tracks
          this.db.run(
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
          `,
            (artistErr) => {
              if (artistErr) {
                this.db.run('ROLLBACK');
                reject(artistErr);
                return;
              }

              // Populate albums from tracks
              this.db.run(
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
              `,
                (albumErr) => {
                  if (albumErr) {
                    this.db.run('ROLLBACK');
                    reject(albumErr);
                    return;
                  }

                  this.db.run('COMMIT', (commitErr) => {
                    if (commitErr) {
                      reject(commitErr);
                    } else {
                      // Get counts of what was added
                      this.db.get(
                        'SELECT COUNT(*) as artists FROM artists',
                        (countErr1, artistCount) => {
                          if (countErr1) {
                            reject(countErr1);
                            return;
                          }

                          this.db.get(
                            'SELECT COUNT(*) as albums FROM albums',
                            (countErr2, albumCount) => {
                              if (countErr2) {
                                reject(countErr2);
                                return;
                              }

                              const result = {
                                artists: artistCount.artists,
                                albums: albumCount.albums,
                              };
                              console.log('✅ Artists and albums populated successfully:', result);
                              resolve(result);
                            }
                          );
                        }
                      );
                    }
                  });
                }
              );
            }
          );
        });
      });
    });
  }

  // ============================================================================
  // DATABASE CLEANUP AND VALIDATION METHODS
  // ============================================================================

  /**
   * Validate all file paths in the database and return missing files
   */
  async validateAllPaths() {
    return new Promise((resolve, reject) => {
      console.log('🔍 Validating all file paths in database...');

      this.db.all('SELECT id, path, title, artist FROM tracks', [], (err, tracks) => {
        if (err) {
          reject(err);
          return;
        }

        const fs = require('fs');
        const validTracks = [];
        const invalidTracks = [];
        let processed = 0;

        if (tracks.length === 0) {
          console.log('ℹ️ No tracks in database to validate');
          resolve({ valid: [], invalid: [], total: 0 });
          return;
        }

        tracks.forEach((track) => {
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

          processed++;
          if (processed === tracks.length) {
            console.log(
              `✅ Path validation complete: ${validTracks.length} valid, ${invalidTracks.length} invalid`
            );
            resolve({
              valid: validTracks,
              invalid: invalidTracks,
              total: tracks.length,
            });
          }
        });
      });
    });
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
    return new Promise((resolve, reject) => {
      const validCorrections = corrections.filter((c) => c.newPath !== null);

      if (validCorrections.length === 0) {
        console.log('ℹ️ No path corrections to apply');
        resolve({ updated: 0, duplicatesRemoved: 0 });
        return;
      }

      console.log(`🔄 Processing ${validCorrections.length} path corrections...`);

      // Group corrections by target path to handle duplicates
      const pathGroups = {};
      validCorrections.forEach(correction => {
        if (!pathGroups[correction.newPath]) {
          pathGroups[correction.newPath] = [];
        }
        pathGroups[correction.newPath].push(correction);
      });

      let updated = 0;
      let duplicatesRemoved = 0;
      let errors = 0;
      let processed = 0;

      const db = this.db; // Store reference to avoid scope issues
      
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        Object.keys(pathGroups).forEach(targetPath => {
          const group = pathGroups[targetPath];
          
          // Check if target path already exists in database
          db.get('SELECT id FROM tracks WHERE path = ?', [targetPath], (err, existingTrack) => {
            if (err) {
              console.error(`❌ Error checking existing path ${targetPath}:`, err);
              errors++;
              processed++;
              checkCompletion();
              return;
            }

            if (existingTrack) {
              // Target path already exists, remove all duplicates
              console.log(`🔄 Target path already exists: ${targetPath}`);
              console.log(`🧹 Removing ${group.length} duplicate records`);
              
              const duplicateIds = group.map(g => g.originalTrack.id);
              const placeholders = duplicateIds.map(() => '?').join(',');
              
              db.run(`DELETE FROM tracks WHERE id IN (${placeholders})`, duplicateIds, function(delErr) {
                if (delErr) {
                  console.error(`❌ Error removing duplicates:`, delErr);
                  errors++;
                } else {
                  duplicatesRemoved += this.changes;
                  console.log(`🧹 Removed ${this.changes} duplicate records for ${targetPath}`);
                }
                processed++;
                checkCompletion();
              });
            } else {
              // Target path doesn't exist, update the first record and remove the rest
              const firstCorrection = group[0];
              const otherCorrections = group.slice(1);
              
              db.run('UPDATE tracks SET path = ? WHERE id = ?', [targetPath, firstCorrection.originalTrack.id], function(updateErr) {
                if (updateErr) {
                  console.error(`❌ Error updating path for track ${firstCorrection.originalTrack.id}:`, updateErr);
                  errors++;
                } else {
                  updated++;
                  console.log(`✅ Updated path: ${firstCorrection.originalTrack.path} -> ${targetPath}`);
                }

                // Remove any additional duplicates
                if (otherCorrections.length > 0) {
                  const duplicateIds = otherCorrections.map(g => g.originalTrack.id);
                  const placeholders = duplicateIds.map(() => '?').join(',');
                  
                  db.run(`DELETE FROM tracks WHERE id IN (${placeholders})`, duplicateIds, function(delErr) {
                    if (delErr) {
                      console.error(`❌ Error removing additional duplicates:`, delErr);
                      errors++;
                    } else {
                      duplicatesRemoved += this.changes;
                      console.log(`🧹 Removed ${this.changes} additional duplicates for ${targetPath}`);
                    }
                    processed++;
                    checkCompletion();
                  });
                } else {
                  processed++;
                  checkCompletion();
                }
              });
            }
          });
        });

        const checkCompletion = () => {
          if (processed === Object.keys(pathGroups).length) {
            if (errors === 0) {
              db.run('COMMIT', (commitErr) => {
                if (commitErr) {
                  reject(commitErr);
                } else {
                  console.log(`✅ Path correction completed: ${updated} updated, ${duplicatesRemoved} duplicates removed`);
                  resolve({ updated, duplicatesRemoved, errors });
                }
              });
            } else {
              db.run('ROLLBACK', (rollbackErr) => {
                if (rollbackErr) {
                  reject(rollbackErr);
                } else {
                  reject(new Error(`Path correction failed: ${errors} errors occurred`));
                }
              });
            }
          }
        };
      });
    });
  }

  /**
   * Remove orphaned records from database
   */
  async removeOrphanedRecords(missingTrackIds) {
    return new Promise((resolve, reject) => {
      if (missingTrackIds.length === 0) {
        console.log('ℹ️ No orphaned records to remove');
        resolve({
          tracks: 0,
          favorites: 0,
          recentlyPlayed: 0,
          playlistTracks: 0,
        });
        return;
      }

      console.log(`🧹 Removing orphaned records for ${missingTrackIds.length} missing tracks...`);

      const placeholders = missingTrackIds.map(() => '?').join(',');
      let results = {
        tracks: 0,
        favorites: 0,
        recentlyPlayed: 0,
        playlistTracks: 0,
      };

      const db = this.db; // Store reference to avoid scope issues
      
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        // Remove from recently_played
        db.run(
          `DELETE FROM recently_played WHERE track_id IN (${placeholders})`,
          missingTrackIds,
          function (err) {
            if (err) {
              console.error('❌ Error removing recently played records:', err);
            } else {
              results.recentlyPlayed = this.changes;
              console.log(`🧹 Removed ${this.changes} recently played records`);
            }
          }
        );

        // Remove from favorites
        db.run(
          `DELETE FROM favorites WHERE track_id IN (${placeholders})`,
          missingTrackIds,
          function (err) {
            if (err) {
              console.error('❌ Error removing favorite records:', err);
            } else {
              results.favorites = this.changes;
              console.log(`🧹 Removed ${this.changes} favorite records`);
            }
          }
        );

        // Remove from playlist_tracks
        db.run(
          `DELETE FROM playlist_tracks WHERE track_id IN (${placeholders})`,
          missingTrackIds,
          function (err) {
            if (err) {
              console.error('❌ Error removing playlist track records:', err);
            } else {
              results.playlistTracks = this.changes;
              console.log(`🧹 Removed ${this.changes} playlist track records`);
            }
          }
        );

        // Finally, remove the tracks themselves
        db.run(
          `DELETE FROM tracks WHERE id IN (${placeholders})`,
          missingTrackIds,
          function (err) {
            if (err) {
              console.error('❌ Error removing track records:', err);
              db.run('ROLLBACK');
              reject(err);
            } else {
              results.tracks = this.changes;
              console.log(`🧹 Removed ${this.changes} track records`);

              db.run('COMMIT', (commitErr) => {
                if (commitErr) {
                  reject(commitErr);
                } else {
                  console.log('✅ Orphaned record cleanup complete');
                  resolve(results);
                }
              });
            }
          }
        );
      });
    });
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
      this.db.close((err) => {
        if (err) {
          console.error('❌ Error closing database:', err.message);
        } else {
          console.log('🗄️ Database connection closed successfully');
        }
      });
    }
  }
}

module.exports = MusicDatabase;
