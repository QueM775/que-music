# 🗄️ Database Management

## Database Manager

Access via **Tools** → **Database Manager** to perform maintenance tasks:

### Library Statistics

- Total tracks, artists, albums
- Database file size and location
- Last scan date and duration
- Performance metrics and health status

### Maintenance Operations

- **Refresh Library** - Re-scan music folder for changes
- **Update Track Durations** - Recalculate missing duration information
- **Fix Missing Metadata** - Attempt to repair incomplete track information
- **Clean Database** - Remove orphaned entries and optimize performance
- **Export Database** - Backup your library database

### Troubleshooting Tools

- **Rebuild Database** - Complete database reconstruction
- **Reset Playlists** - Clear all playlist data
- **Clear Cache** - Remove temporary files and thumbnails
- **Verify Integrity** - Check database for corruption

## Data Storage

### Database Location

- **Windows**: `%APPDATA%\que-music\music-library.db`
- **macOS**: `~/Library/Application Support/que-music/music-library.db`
- **Linux**: `~/.config/que-music/music-library.db`

### Playlist Storage

- **Primary**: SQLite database (fast queries)
- **Backup**: M3U files in `{Music Folder}/Playlists/`
- **Sync**: Automatic synchronization between both

## Database Operations

### Regular Maintenance

- **Weekly**: Run "Clean Database" to optimize performance
- **Monthly**: Export database as backup
- **After major changes**: Run "Refresh Library"
- **When experiencing issues**: Try "Rebuild Database"

### Performance Optimization

- Database uses indexes on commonly queried columns
- Regular cleanup removes orphaned entries
- Album art cache has automatic size limits
- Query optimization for large libraries

### Backup and Recovery

- **Automatic**: Daily database backups (configurable)
- **Manual**: Export database from Database Manager
- **Recovery**: Import previous database backup
- **Migration**: Transfer settings between installations

## Advanced Operations

### Database Schema

- **Tracks**: Main music library with metadata
- **Artists and Albums**: Normalized data with track counts
- **Playlists and Playlist_tracks**: Playlist system with foreign keys
- **Favorites and Recently_played**: User interaction tracking

### Bulk Operations

- **Mass metadata updates**: Update multiple tracks at once
- **Folder restructuring**: Handle moved/renamed folders
- **Duplicate detection**: Find and manage duplicate tracks
- **Missing file cleanup**: Remove references to deleted files

### Import/Export

- **Library Export**: Export complete library data
- **Playlist Export**: Batch export all playlists
- **Metadata Export**: Export track information to CSV
- **Settings Export**: Backup all application settings
