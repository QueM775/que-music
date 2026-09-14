-- ==============================================================================
-- QUE-MUSIC COMPLETE DATABASE SCHEMA v2.0
-- Comprehensive SQLite schema for music library management
-- ==============================================================================

-- Enable foreign key constraints for data integrity
PRAGMA foreign_keys = ON;

BEGIN TRANSACTION;

-- =============================================================================
-- CORE MUSIC LIBRARY TABLES
-- =============================================================================

-- Main tracks table - stores all music file metadata and statistics
CREATE TABLE IF NOT EXISTS tracks (
  -- Primary identification
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT UNIQUE NOT NULL,                     -- Full file path (unique identifier)
  filename TEXT NOT NULL,                        -- Filename only (for display)
  
  -- Metadata extracted from audio files
  title TEXT,                                    -- Song title from metadata
  artist TEXT,                                   -- Primary artist name
  album TEXT,                                    -- Album name
  year INTEGER,                                  -- Release year
  genre TEXT,                                    -- Music genre
  duration INTEGER,                              -- Duration in seconds
  
  -- File information
  filesize INTEGER DEFAULT 0,                   -- File size in bytes
  format TEXT,                                   -- Audio format (MP3, FLAC, AAC, etc.)
  bitrate INTEGER,                               -- Audio bitrate in kbps
  
  -- User activity tracking
  last_played DATETIME,                          -- Last time track was played
  play_count INTEGER DEFAULT 0,                 -- Total number of times played
  
  -- System timestamps
  date_added DATETIME DEFAULT CURRENT_TIMESTAMP, -- When track was added to library
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, -- Record creation timestamp
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, -- Last modification timestamp

  -- Lyrics (plain text only, no sync/karaoke — see docs/application/lyrics-feature.md)
  lyrics TEXT,                                   -- Plain-text lyrics, NULL if none found
  lyrics_source TEXT,                            -- 'embedded' | 'lrclib', NULL if never fetched
  lyrics_fetched_at DATETIME                     -- When lyrics were last checked, NULL if never
);

-- Artists table - normalized artist data with statistics
CREATE TABLE IF NOT EXISTS artists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,                     -- Artist name (unique)
  track_count INTEGER DEFAULT 0,                -- Number of tracks by this artist
  album_count INTEGER DEFAULT 0,                -- Number of albums by this artist
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Albums table - normalized album data with statistics
CREATE TABLE IF NOT EXISTS albums (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,                          -- Album title
  artist TEXT,                                  -- Album artist (may differ from track artist)
  year INTEGER,                                 -- Release year
  track_count INTEGER DEFAULT 0,               -- Number of tracks in album
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(title, artist)                         -- Prevent duplicate albums per artist
);

-- =============================================================================
-- PLAYLIST MANAGEMENT TABLES
-- =============================================================================

-- User-created playlists with metadata and statistics
CREATE TABLE IF NOT EXISTS playlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,                    -- Playlist name (must be unique)
  description TEXT,                             -- Optional description
  
  -- Cached statistics (updated when tracks are added/removed)
  track_count INTEGER DEFAULT 0,               -- Number of tracks in playlist
  total_duration INTEGER DEFAULT 0,            -- Total duration in seconds
  
  -- System timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Playlist track associations with ordering and dual path support
CREATE TABLE IF NOT EXISTS playlist_tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id INTEGER NOT NULL,                 -- References playlists.id
  
  -- Dual track identification system for robustness
  track_id INTEGER,                            -- References tracks.id (when available)
  track_path TEXT,                             -- File path (fallback when track_id unavailable)
  
  position INTEGER NOT NULL,                    -- Track position/order in playlist (1-based)
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP, -- When track was added to playlist
  
  -- Foreign key constraints with cascade delete
  FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
  FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
  
  -- Ensure unique track per playlist (using path for flexibility)
  UNIQUE(playlist_id, track_path)
);

-- =============================================================================
-- USER ACTIVITY AND PREFERENCES TABLES
-- =============================================================================

-- User favorites - tracks marked as favorites
CREATE TABLE IF NOT EXISTS favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  track_id INTEGER NOT NULL,                    -- References tracks.id
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP, -- When track was favorited
  
  FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
  UNIQUE(track_id)                              -- One favorite entry per track
);

-- Recently played history - tracks played by user with timestamps
CREATE TABLE IF NOT EXISTS recently_played (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  track_id INTEGER NOT NULL,                    -- References tracks.id
  played_at DATETIME DEFAULT CURRENT_TIMESTAMP, -- Exact timestamp when played
  play_count INTEGER DEFAULT 1,                -- Play count for this session
  
  FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
);

-- =============================================================================
-- PERFORMANCE INDEXES
-- =============================================================================

-- Core track search and lookup indexes
CREATE INDEX IF NOT EXISTS idx_tracks_path ON tracks(path);
CREATE INDEX IF NOT EXISTS idx_tracks_title ON tracks(title);
CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album);
CREATE INDEX IF NOT EXISTS idx_tracks_genre ON tracks(genre);
CREATE INDEX IF NOT EXISTS idx_tracks_year ON tracks(year);
CREATE INDEX IF NOT EXISTS idx_tracks_last_played ON tracks(last_played);
CREATE INDEX IF NOT EXISTS idx_tracks_play_count ON tracks(play_count);

-- Artist and album indexes for browsing
CREATE INDEX IF NOT EXISTS idx_artists_name ON artists(name);
CREATE INDEX IF NOT EXISTS idx_albums_title ON albums(title);
CREATE INDEX IF NOT EXISTS idx_albums_artist ON albums(artist);
CREATE INDEX IF NOT EXISTS idx_albums_year ON albums(year);

-- Playlist performance indexes
CREATE INDEX IF NOT EXISTS idx_playlists_name ON playlists(name);
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist_id ON playlist_tracks(playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_track_id ON playlist_tracks(track_id);
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_path ON playlist_tracks(track_path);
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_position ON playlist_tracks(playlist_id, position);

-- User activity indexes
CREATE INDEX IF NOT EXISTS idx_favorites_track_id ON favorites(track_id);
CREATE INDEX IF NOT EXISTS idx_favorites_added_at ON favorites(added_at);
CREATE INDEX IF NOT EXISTS idx_recently_played_track_id ON recently_played(track_id);
CREATE INDEX IF NOT EXISTS idx_recently_played_played_at ON recently_played(played_at);

-- =============================================================================
-- TRIGGERS FOR DATA CONSISTENCY
-- =============================================================================

-- Update playlist track count when tracks are added
CREATE TRIGGER IF NOT EXISTS update_playlist_track_count_insert
AFTER INSERT ON playlist_tracks
BEGIN
  UPDATE playlists 
  SET track_count = (
    SELECT COUNT(*) FROM playlist_tracks 
    WHERE playlist_id = NEW.playlist_id
  ),
  updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.playlist_id;
END;

-- Update playlist track count when tracks are removed
CREATE TRIGGER IF NOT EXISTS update_playlist_track_count_delete
AFTER DELETE ON playlist_tracks
BEGIN
  UPDATE playlists 
  SET track_count = (
    SELECT COUNT(*) FROM playlist_tracks 
    WHERE playlist_id = OLD.playlist_id
  ),
  updated_at = CURRENT_TIMESTAMP
  WHERE id = OLD.playlist_id;
END;

-- Update track play count when added to recently played
CREATE TRIGGER IF NOT EXISTS update_track_play_count
AFTER INSERT ON recently_played
BEGIN
  UPDATE tracks 
  SET play_count = play_count + NEW.play_count,
      last_played = NEW.played_at,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.track_id;
END;

-- Update artist track count when tracks are added
CREATE TRIGGER IF NOT EXISTS update_artist_track_count_insert
AFTER INSERT ON tracks
WHEN NEW.artist IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO artists (name) VALUES (NEW.artist);
  UPDATE artists 
  SET track_count = (
    SELECT COUNT(*) FROM tracks WHERE artist = NEW.artist
  ) 
  WHERE name = NEW.artist;
END;

-- Update artist track count when tracks are updated
CREATE TRIGGER IF NOT EXISTS update_artist_track_count_update
AFTER UPDATE ON tracks
WHEN OLD.artist != NEW.artist OR (OLD.artist IS NULL AND NEW.artist IS NOT NULL)
BEGIN
  -- Update old artist count if exists
  UPDATE artists 
  SET track_count = (
    SELECT COUNT(*) FROM tracks WHERE artist = OLD.artist
  ) 
  WHERE name = OLD.artist AND OLD.artist IS NOT NULL;
  
  -- Update new artist count
  INSERT OR IGNORE INTO artists (name) VALUES (NEW.artist);
  UPDATE artists 
  SET track_count = (
    SELECT COUNT(*) FROM tracks WHERE artist = NEW.artist
  ) 
  WHERE name = NEW.artist AND NEW.artist IS NOT NULL;
END;

-- Update album track count when tracks are added
CREATE TRIGGER IF NOT EXISTS update_album_track_count_insert
AFTER INSERT ON tracks
WHEN NEW.album IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO albums (title, artist, year) 
  VALUES (NEW.album, NEW.artist, NEW.year);
  
  UPDATE albums 
  SET track_count = (
    SELECT COUNT(*) FROM tracks 
    WHERE album = NEW.album AND artist = NEW.artist
  ) 
  WHERE title = NEW.album AND artist = NEW.artist;
END;

-- =============================================================================
-- VIEWS FOR COMMON QUERIES
-- =============================================================================

-- Comprehensive track view with all related data
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
  SELECT 
    track_id, 
    COUNT(*) as recent_play_count,
    MAX(played_at) as last_recent_play
  FROM recently_played 
  WHERE played_at > datetime('now', '-30 days')
  GROUP BY track_id
) rp ON t.id = rp.track_id;

-- Playlist summary view
CREATE VIEW IF NOT EXISTS playlists_summary AS
SELECT 
  p.*,
  COALESCE(SUM(t.duration), 0) as calculated_duration,
  COUNT(pt.id) as calculated_track_count
FROM playlists p
LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
LEFT JOIN tracks t ON pt.track_id = t.id
GROUP BY p.id;

-- Most played tracks view
CREATE VIEW IF NOT EXISTS tracks_most_played AS
SELECT 
  t.*,
  t.play_count,
  t.last_played
FROM tracks t
WHERE t.play_count > 0
ORDER BY t.play_count DESC, t.last_played DESC;

-- Recently added tracks view
CREATE VIEW IF NOT EXISTS tracks_recently_added AS
SELECT *
FROM tracks
WHERE date_added > datetime('now', '-7 days')
ORDER BY date_added DESC;

COMMIT;

-- =============================================================================
-- SCHEMA INFORMATION QUERIES
-- =============================================================================

-- View all tables in the database
-- SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';

-- View all indexes in the database
-- SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%';

-- View all triggers in the database
-- SELECT name, tbl_name, sql FROM sqlite_master WHERE type='trigger';

-- Get database statistics
-- SELECT 
--   (SELECT COUNT(*) FROM tracks) as total_tracks,
--   (SELECT COUNT(*) FROM artists) as total_artists,
--   (SELECT COUNT(*) FROM albums) as total_albums,
--   (SELECT COUNT(*) FROM playlists) as total_playlists,
--   (SELECT COUNT(*) FROM favorites) as total_favorites;

-- =============================================================================
-- MAINTENANCE QUERIES
-- =============================================================================

-- Clean up orphaned playlist tracks (tracks that no longer exist)
-- DELETE FROM playlist_tracks WHERE track_id NOT IN (SELECT id FROM tracks);

-- Update cached playlist track counts
-- UPDATE playlists SET track_count = (
--   SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id = playlists.id
-- );

-- Clean up old recently played entries (older than 3 months)
-- DELETE FROM recently_played WHERE played_at < datetime('now', '-3 months');

-- Vacuum database for space optimization
-- VACUUM;

-- Analyze database for query optimization
-- ANALYZE;

-- =============================================================================
-- END OF SCHEMA
-- ==============================================================================