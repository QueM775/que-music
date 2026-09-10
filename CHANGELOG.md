# Changelog

All notable changes to Que-Music will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 2026-09-10

### Fixed

- **Folder tree hid nothing**: the left-pane folder browser listed every subfolder, including non-music scaffolding (`_Docs`, `_Inbox`) and the app's own empty `Playlists/` folder.
  - **Root Cause**: `LibraryManager.filterSystemFolders()` only dimmed a hardcoded name list; it never hid folders with no audio in them.
  - **Solution**: `filterSystemFolders()` now removes any folder that is a known system folder or has a total `songCount` of 0 (children included). Artist folders that only contain album subfolders still appear.
  - **Files Modified**: `client/scripts/library-manager.js`

- **M3U playlists never imported**: `.m3u` files in `{musicFolder}/Playlists/` were ignored; the playlists table stayed empty and the manual re-import handler threw.
  - **Root Cause**: `MusicDatabase.importM3UFile()` was a stub (parsed and inserted nothing). The `playlist:force-reimport-m3u` handler used the old `sqlite3` callback API against a `better-sqlite3` connection.
  - **Solution**: rewrote `importM3UFile()` / `importExistingM3UFiles()` to parse each M3U, resolve entries against `tracks.path` through a normalized-path index (separators, BOM, `file://`, case, relative paths), and create-or-rebuild the playlist + `playlist_tracks` in one transaction. Startup import is non-destructive (`replace: false`); the force handler passes `replace: true` and is now a thin delegate.
  - **Files Modified**: `server/database.js`, `main.js`
  - **Result**: all 19 existing playlists import on launch. Track resolution also falls back to a unique-filename match, so entries left stale by an earlier library reorganize still resolve (350/352 matched; the last 2 are the same entry pointing at a file that no longer exists anywhere).

## [3.2.3] - 2025-10-06

### Fixed

- **Album Playback Progression**: Fixed album playback looping on first track instead of advancing
  - **Issue**: When using "Select All" to play an album, playback would repeat the first song instead of advancing through all tracks
  - **Root Cause**: Method naming conflict - `handlePlayAllClick` was calling `this.app.coreAudio.playPlaylist(0)`, but `this.app.playPlaylist` actually pointed to the playlist-renderer's method (for saved playlists) instead of core audio playback
  - **Impact**: Users could not play through complete albums from library view
  - **Solution**:
    - Changed `handlePlayAllClick` to directly call core audio methods (`loadTrack`, `updateNowPlayingInfo`, `audioPlayer.play()`)
    - Fixed `currentTrack` variable type inconsistency in `playPlaylist` method (was setting to track object instead of path string)
    - Added debug logging to trace playlist progression
  - **Files Modified**: `client/scripts/library-manager.js:583-637`, `client/scripts/core-audio.js:1048-1050`
  - **Result**: Album playback now correctly advances through all tracks sequentially

- **Progress Bar Interactivity**: Fixed non-responsive progress bar that prevented seeking
  - **Issue**: Progress bar slider was not responding to clicks or drags, preventing users from seeking through songs
  - **Root Cause**: The `.progress-track` and `.progress-fill` div elements were positioned over the progress slider input, blocking mouse events from reaching it
  - **Impact**: Users could not seek to different positions in playing tracks
  - **Solution**:
    - Added `pointer-events: none` to `.progress-track` and `.progress-fill` CSS rules
    - Rebuilt bundled CSS to include the fix
  - **Files Modified**: `client/styles/layout/footer.css:289,298`, `client/styles/bundled.css`
  - **Result**: Progress bar now responds to clicks and drags for seeking through tracks

- **Database Statistics Error**: Fixed SQLITE_ERROR when retrieving database statistics
  - **Issue**: Application throwing "SQLITE_ERROR: no such column: "" - should this be a string literal in single-quotes?" when calling `getStats()`
  - **Root Cause**: SQL queries using double quotes (`""`) for empty string comparison instead of single quotes (`''`)
  - **Impact**: Prevented statistics display in library view and advanced filters
  - **Solution**:
    - Changed string literals from double quotes to single quotes in WHERE clauses
    - Added table existence verification before querying
    - Enhanced error logging with detailed message, code, and stack trace
  - **Files Modified**: `server/database.js:572-574`
  - **Technical Note**: In SQLite, double quotes denote column identifiers while single quotes denote string literals

## [3.2.2] - 2025-10-05

### Fixed

- **Electron Startup Failure**: Resolved critical issue preventing application from starting
  - **Issue**: Application failed to start with error "Cannot read properties of undefined (reading 'whenReady')"
  - **Root Cause #1**: `ELECTRON_RUN_AS_NODE=1` environment variable causing Electron to run as Node.js instead of full Electron app
  - **Root Cause #2**: `app.disableHardwareAcceleration()` called after `app.whenReady()` instead of before, causing unhandled promise rejection
  - **Root Cause #3**: Incorrect rebuild script preventing native modules from being properly compiled for Electron
  - **Solution**:
    - Created `start-electron.js` wrapper to ensure `ELECTRON_RUN_AS_NODE` is always removed before startup
    - Moved `app.disableHardwareAcceleration()` call to before `app.whenReady()` (line 210 in main.js)
    - Fixed rebuild script: `"rebuild": "electron-rebuild -f -w better-sqlite3"`
    - Updated npm scripts to use wrapper: `"start": "node start-electron.js"`
  - **Files Modified**: `main.js`, `package.json`
  - **Files Created**: `start-electron.js`, `ELECTRON-TROUBLESHOOTING.md`
  - **Dependencies Added**: `cross-env` for cross-platform environment handling
  - **Documentation**: Comprehensive troubleshooting guide created with detailed resolution steps and commands

### Removed

- **Cleanup of Temporary Files**: Removed unnecessary test and migration files
  - `test-electron.js` - Temporary test file
  - `test-require.js` - Temporary test file
  - `migrate-to-fresh.bat` - Migration script no longer needed
  - `MIGRATION-GUIDE.md` - Migration documentation no longer needed
  - `PATH-MANAGER-STATUS.md` - Status document no longer needed
  - `QUICK-START.txt` - Redundant with README.md

### Changed

- **README.md**: Added developer setup instructions and reference to troubleshooting guide
- **package.json**: Updated scripts to use wrapper and fixed rebuild command

### Technical

- **Environment Handling**: Wrapper script creates clean environment without `ELECTRON_RUN_AS_NODE`
- **Hardware Acceleration**: Properly disabled before app initialization to prevent GPU crashes
- **Native Modules**: Correct rebuild process ensures better-sqlite3 works in Electron context
- **Error Prevention**: Eliminates silent failures during app initialization

### References

- See [ELECTRON-TROUBLESHOOTING.md](ELECTRON-TROUBLESHOOTING.md) for complete resolution details and debugging commands
- Issue affected fresh installations after `npm install` and `npm run rebuild`
- Common on Windows systems using Git Bash / MinGW terminals

---

## [3.2.1] - 2025-10-02

### Fixed

- **Asset Loading in Built Executables**: Fixed album art and header logo not displaying in packaged apps
  - **Issue**: Default album art and header logo (QueMusicDark.png) were not displaying in executables built with `npm run make`
  - **Root Cause**: Hardcoded relative file paths in renderer process don't work in packaged Electron apps
  - **Solution**:
    - Created new IPC handler `assets:get-image` for secure asset loading with multi-path resolution
    - Updated `showAlbumArtPlaceholder()` to use async IPC call instead of relative path
    - Added `loadHeaderLogo()` method to dynamically load logo based on current theme
    - Assets now loaded as data URLs via IPC, working in both dev and production
  - **Path Resolution**: Checks `__dirname/assets`, `../assets`, `process.resourcesPath/assets`, `app.getAppPath()/assets`
  - **Files Modified**: `main.js`, `ui-controller.js`, `main-app.js`, `main-preload.js`, `index.html`, `package.json`
  - **Benefits**: Default album art and header logos now display correctly in all packaging scenarios

### Changed

- **Build Configuration**: Added `assets/images` to `extraResources` in electron-builder config
  - Ensures header logo images are included in packaged executables

---

## [3.2.0] - 2025-10-02

### Added

- **Cover Fetcher Tool**: Comprehensive album art management system
  - **Batch Scanning**: Scans entire music library for missing or corrupted album covers
  - **Embedded Art Extraction**: Extracts album art from MP3/FLAC file metadata
  - **Online Downloads**: Fetches high-quality covers from Cover Art Archive via MusicBrainz API
  - **Smart Validation**: Validates existing covers with magic byte verification (JPEG/PNG)
  - **Duplicate Detection**: SHA256 hashing prevents redundant downloads
  - **Progress Tracking**: Real-time progress bars, statistics, and status logs
  - **Menu Access**: Tools → Fetch Missing Album Covers (Ctrl+Shift+C)
  - **Configurable Options**: Toggle online downloads and cover validation
  - **Logging Integration**: Full integration with application logger system

- **Help Documentation**: Complete Cover Fetcher documentation
  - Added comprehensive help topic for Album Cover Fetcher
  - Updated interface guide to include Cover Fetcher in Tools section
  - Added Cover Fetcher section to database management documentation

### Enhanced

- **Modal System**: Added `.show` class support for proper modal animations
- **UI Controller**: Fixed notification routing for system-wide notifications
- **Error Handling**: Improved error reporting in Cover Fetcher with detailed status logs

### Fixed

- **Database Manager Display**: Corrected size statistics display
  - Now shows "Database Size" (actual .db file size in MB)
  - Shows "Music Size" (total music files size in GB)
  - Added `dbFileSize` to stats returned by IPC handler
  - Fixed confusing 29.8 GB display that was showing music files total, not database size

### Technical

- **Server Module**: `server/cover-fetcher.js` - Core cover fetching logic with MusicBrainz integration
- **UI Module**: `client/scripts/cover-fetcher-ui.js` - Modal controller with progress management
- **IPC Handlers**: Added `cover-fetcher:start-scan` handler in main process
- **API Integration**: MusicBrainz search and Cover Art Archive downloads with rate limiting
- **Image Processing**: Magic byte validation for JPEG (FF D8 FF) and PNG (89 50 4E 47) formats

### Files Added

- `server/cover-fetcher.js` - Cover fetching engine
- `client/scripts/cover-fetcher-ui.js` - UI controller
- `client/help/topics/cover-fetcher.md` - Comprehensive help documentation

### Files Modified

- `main.js` - Added Tools menu, IPC handlers for Cover Fetcher, and database file size to stats
- `client/pages/index.html` - Added Cover Fetcher modal HTML
- `client/scripts/main-preload.js` - Exposed Cover Fetcher API
- `client/scripts/help-manager.js` - Added embedded Cover Fetcher help content
- `client/scripts/library-manager.js` - Fixed database size display with separate DB and music size stats
- `client/styles/features/modals.css` - Cover Fetcher modal styling
- `client/styles/bundled.css` - Rebuilt with new styles
- `client/help/topics/interface-guide.md` - Added Cover Fetcher to Tools section
- `client/help/topics/database-management.md` - Added Cover Fetcher documentation section
- `client/help/help-content.json` - Registered Cover Fetcher help topic

## [3.1.0] - 2025-09-26

### Added

- **Integrated Logging System**: Complete logging solution with 5 configurable levels
  - **Logging Levels**: NONE, LOW (errors), MED (errors + warnings), HIGH (info + debug), DEV (everything)
  - **File Logging**: Automatic daily log files in `logs/` directory with clean text output
  - **Console Logging**: Colored console output with timestamps and structured data
  - **User Control**: Logger level configurable via Settings → Advanced → Logging level
  - **Dual Output**: Simultaneous console and file logging with different formatting
  - **Process Identification**: Separate loggers for main process and renderer with clear identification
  - **Structured Data**: JSON formatting for complex objects and error details
  - **Daily Rotation**: Automatic log file rotation with date-based naming

### Enhanced

- **Settings Modal**: Added new logging level dropdown in Advanced settings section
- **Error Handling**: Improved error reporting with structured logging throughout the application
- **Debug Capabilities**: Enhanced debugging with persistent log files and detailed console output
- **Documentation**: Updated help files and CLAUDE.md with logging system information

### Technical

- **Main Process**: Integrated `simple-logger.js` with structured data logging
- **Renderer Process**: Browser-compatible logger instance with settings integration
- **UI Integration**: Logger level setting persisted and applied in real-time
- **File Management**: Automatic creation of logs directory and daily file management

### Files Modified

- `main.js` - Main process logger integration and console.log replacement
- `client/pages/index.html` - Added logger script and settings UI components
- `client/scripts/main-app.js` - Renderer logger integration
- `client/scripts/ui-controller.js` - Settings management and logger level control
- `simple-logger.js` - Universal logger (pre-existing, now integrated)
- Documentation files updated with logging information

## [3.0.5] - Previous Release

### Features
- Music library management
- Playlist system with M3U export
- Audio visualization
- Theme support (Dark, Light, Auto)
- Database management tools
- Advanced search capabilities
- Favorites and recently played tracking