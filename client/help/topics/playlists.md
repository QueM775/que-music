# 📝 Playlist System

## Creating Playlists

### Method 1: From Sidebar

1. Click **"Create Playlist"** in the Playlists section
2. Enter playlist name and optional description
3. Click "Create Playlist"

### Method 2: From Selected Tracks

1. Select multiple tracks (Ctrl+click or Shift+click)
2. Right-click selection → "Add to Playlist" → "Create New Playlist"
3. Enter playlist details

## Managing Playlists

### Adding Tracks

- Drag and drop tracks onto playlist
- Right-click track → "Add to Playlist" → Select playlist
- Use multi-select to add multiple tracks at once

### Editing Playlists

- Right-click playlist → "Edit" to change name/description
- Right-click playlist → "Clear Tracks" to remove all songs
- Drag tracks within playlist to reorder

### Playlist Context Menu

- **Play** - Start playing the playlist
- **Shuffle & Play** - Play playlist in random order
- **Edit** - Modify playlist details
- **Duplicate** - Create a copy of the playlist
- **Export to M3U** - Save as M3U file for other players
- **Clear Tracks** - Remove all tracks (keeps playlist)
- **Delete Playlist** - Remove playlist completely

## M3U Export/Import

### Automatic Features

- Playlists are automatically saved as M3U files in your music folder
- M3U files in your music folder are automatically detected and imported
- Changes sync between database and M3U files

### Manual Operations

- **Export**: Right-click playlist → "Export to M3U"
- **Import**: Place M3U files in `{Music Folder}/Playlists/`
- **Compatibility**: Works with other music players that support M3U format

## Playlist Storage

### Dual Storage System

- **Primary**: SQLite database for fast app queries
- **Backup**: M3U files for portability and compatibility
- **Auto-sync**: Changes automatically update both storage types

### File Locations

- **Database**: App data folder (managed automatically)
- **M3U Files**: `{Your Music Folder}/Playlists/`
- **Backup**: M3U files can be copied/shared between systems

## Advanced Playlist Features

### Smart Organization

- Playlists maintain track order and metadata
- Supports unlimited tracks per playlist
- Handles missing files gracefully
- Automatic cleanup of broken references

### Collaboration & Sharing

- Export M3U files for sharing with others
- Import playlists from other music apps
- Cross-platform compatibility
- Backup and restore via file copying
