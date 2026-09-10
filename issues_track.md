# Que-Music Issues Tracker

## Version History & Bug Fixes

### Version 3.2.4 - 2025-10-07

#### Issues Fixed ✅

**Issue #14: Header Logo Not Loading in Production Build**
- **Description**: When running the built executable, the header logo image (QueMusicDark.png/QueMusicLight.png) was not loading and appeared as a broken image icon
- **Root Cause**: The `toggleTheme()` method in ui-controller.js did not reload the header logo after theme changes, and there was no fallback mechanism
- **Solution**:
  - Made `toggleTheme()` method async and added call to `this.app.loadHeaderLogo()` after theme change
  - Logo now reloads automatically when switching between light and dark themes
  - Ensures proper logo display both on startup and after theme changes
- **Files Modified**:
  - `client/scripts/ui-controller.js:164-181` - Made toggleTheme async and added logo reload
- **Benefits**:
  - Header logo displays correctly in both dev and production builds
  - Theme-appropriate logo (dark/light) loads automatically on theme switch
  - No more broken image icons in header

**Issue #15: Missing Default Album Cover Images in Song Cards**
- **Description**: When songs didn't have album art or when album art failed to load, song cards showed broken image icons instead of the default sample cover
- **Root Cause**: No error handling for failed album art loads - images didn't have fallback mechanism when `src` was invalid or empty
- **Solution**:
  - Added `onerror` handler to all album art images in song cards
  - Handler attempts to load `defaultAlbumArt` when primary image fails
  - Prevents infinite error loops by checking if already showing default
  - Applied to both library view song cards and search result cards
- **Files Modified**:
  - `client/scripts/library-manager.js:386-389` - Added onerror to song card images
  - `client/scripts/library-manager.js:2735-2738` - Added onerror to search result images
- **Benefits**:
  - Graceful fallback to default album art when covers are missing
  - No more broken image icons in song cards
  - Better visual consistency across the application
  - Works in both development and production builds

---

### Version 3.2.3 - 2025-10-06

#### Issues Fixed ✅

**Issue #13: Database Statistics SQLITE_ERROR on Startup**
- **Description**: Application throwing "SQLITE_ERROR: no such column: "" - should this be a string literal in single-quotes?" when attempting to retrieve database statistics. This prevented statistics display in library view and advanced filters.
- **Root Cause**: The `getStats()` method was using double quotes (`""`) for empty string comparison in SQL WHERE clauses. In SQLite, double quotes denote column identifiers, not string literals, so `artist != ""` was interpreted as comparing to a column named "" (empty string) rather than an empty string value.
- **Affected Queries**:
  - `SELECT COUNT(DISTINCT artist) as count FROM tracks WHERE artist IS NOT NULL AND artist != ""`
  - `SELECT COUNT(DISTINCT album) as count FROM tracks WHERE album IS NOT NULL AND album != ""`
  - `SELECT COUNT(DISTINCT genre) as count FROM tracks WHERE genre IS NOT NULL AND genre != ""`
- **Solution**:
  - Changed all empty string comparisons from double quotes to single quotes: `!= ""` → `!= ''`
  - Added defensive table existence check before querying to prevent errors if schema initialization fails
  - Enhanced error logging to include detailed message, error code, and stack trace for easier debugging
- **Files Modified**:
  - `server/database.js:572-574` - Fixed SQL string literals in getStats() method
  - `server/database.js:543-556` - Added table existence verification
  - `server/database.js:577-582` - Enhanced error logging with full details
- **Technical Note**: SQLite uses different quote types for different purposes:
  - Single quotes (`'...'`) = String literals
  - Double quotes (`"..."`) = Column/table identifiers
  - Backticks (`` `...` ``) = Alternative identifier quotes (MySQL-style)
- **Benefits**:
  - Database statistics now load correctly without errors
  - Advanced filters display proper track/artist/album counts
  - Library view statistics panel works as expected
  - Better error messages for future database debugging

**Issue #12: Critical Database API Mismatch - Playlists and Tracks Not Loading**
- **Description**: Application was unable to load playlists or display tracks when clicking folders. Console showed errors "this.db.all is not a function" and "this.db.get is not a function"
- **Root Cause**: The entire `server/database.js` file was written using node-sqlite3's callback-based async API, but the project uses better-sqlite3's synchronous API. All 37 database methods were using incompatible API calls:
  - Using `this.db.all(sql, params, callback)` instead of `this.db.prepare(sql).all(params)`
  - Using `this.db.get(sql, params, callback)` instead of `this.db.prepare(sql).get(params)`
  - Using `this.db.run(sql, params, callback)` instead of `this.db.prepare(sql).run(params)`
  - Wrapping everything in Promises even though better-sqlite3 is synchronous
- **Solution**:
  - Converted all 37 database methods from callback-based async to better-sqlite3 synchronous API
  - Replaced `this.db.all()` with `this.db.prepare().all()`
  - Replaced `this.db.get()` with `this.db.prepare().get()`
  - Replaced `this.db.run()` with `this.db.prepare().run()`
  - Removed unnecessary Promise wrappers since better-sqlite3 is synchronous
  - Updated transaction handling to use `.prepare('BEGIN').run()` pattern
  - Changed result handling from `this.lastID` to `result.lastInsertRowid`
  - Replaced callback error handling with try-catch blocks
- **Files Modified**:
  - `server/database.js` - Complete rewrite of all 37 methods to use correct better-sqlite3 API
  - `main.js` - Added null checks for `musicDB` in IPC handlers (lines 440, 701)
  - `main.js` - Removed problematic `app.disableHardwareAcceleration()` call that was causing timing errors
- **Methods Converted**:
  - Track Management: `addTracks`, `getAllTracks`, `getTracksByArtist`, `getTracksByAlbum`, `getTrackByPath`, `searchTracks`, `getTrackIdByPath`
  - Artist & Album: `getAllArtists`, `getAllAlbums`
  - Recently Played: `getRecentlyPlayed`, `addToRecentlyPlayedByPath`, `getRecentlyPlayedCount`, `clearRecentlyPlayed`
  - Favorites: `getFavorites`, `getFavoritesCount`, `addToFavoritesByPath`, `removeFromFavoritesByPath`, `isFavoriteByPath`, `clearFavorites`
  - Statistics: `getStats`, `checkForDuplicates`, `getGenreStats`, `getYearStats`
  - Playlists: `getAllPlaylists`, `createPlaylist`, `getPlaylistById`, `addTrackToPlaylist`, `removeTrackFromPlaylist`, `deletePlaylist`, `updatePlaylist`
  - Import/Utility: `importM3UFile`, `updateMissingDurations`
  - Database Maintenance: `populateArtistsAndAlbumsFromTracks`, `validateAllPaths`, `updateCorrectedPaths`, `removeOrphanedRecords`
  - Connection: `close`
- **Benefits**:
  - Playlists now load and display correctly
  - Clicking folders now shows tracks in right pane
  - Music folder changes work without errors
  - Cleaner code without nested callbacks
  - Better performance with synchronous operations
  - Proper error handling with try-catch instead of callbacks
  - Correct use of better-sqlite3 API throughout

**Issue #11: Album Art Still Not Displaying (Incomplete Fix from 3.2.1)**
- **Description**: Despite previous fix in 3.2.1, default album art was still not showing on app startup
- **Root Cause**: The `initAlbumArtIntegration()` method was defined in main-app.js but never called during app initialization, so `showAlbumArtPlaceholder()` was never executed
- **Solution**:
  - Added call to `await this.initAlbumArtIntegration()` in the initialization sequence
  - Placed after help system initialization and before library folder check
- **Files Modified**:
  - `client/scripts/main-app.js` - Added `initAlbumArtIntegration()` call to initialization (line 78)
- **Benefits**:
  - Default album art now displays correctly on startup
  - Sample cover shows when no track is playing
  - Consistent with original 3.2.1 fix that added IPC album art loading

---

### Version 3.2.1 - 2025-10-02

#### Issues Fixed ✅

**Issue #11: Album Art and Header Logo Not Displayed in Built Executable**
- **Description**: After building the app with `npm run make`, the default album art and header logo (QueMusicDark.png) were not displaying in the packaged executable
- **Root Cause**: Renderer process was using hardcoded relative file paths (`../../assets/covers/sample-cover.jpg`, `../../assets/images/QueMusicDark.png`) which don't work in packaged Electron apps due to different file structure
- **Solution**:
  - Created new IPC handler `assets:get-image` in main process to load asset images with proper path resolution
  - Updated `showAlbumArtPlaceholder()` to request sample cover via IPC instead of using relative path
  - Added `loadHeaderLogo()` method to dynamically load logo based on current theme
  - Exposed assets API in preload script: `window.queMusicAPI.assets.getImage()`
  - Updated HTML to use empty `src` attributes, populated at runtime via IPC
  - All asset loading now uses data URLs passed through secure IPC channel
- **Files Modified**:
  - `main.js` - Added `assets:get-image` IPC handler with multi-path resolution (lines 1281-1314)
  - `client/scripts/ui-controller.js` - Updated `showAlbumArtPlaceholder()` to async IPC call (lines 3887-3921)
  - `client/scripts/main-app.js` - Added `loadHeaderLogo()` method and integration (lines 96, 110-127)
  - `client/scripts/main-preload.js` - Exposed assets API (lines 279-287)
  - `client/pages/index.html` - Removed hardcoded asset paths (lines 103, 465)
- **Path Resolution Strategy**:
  - Checks multiple locations: `__dirname/assets`, `../assets`, `process.resourcesPath/assets`, `app.getAppPath()/assets`
  - Works in both development and production environments
  - Handles ASAR packaging and extracted resource scenarios
- **Benefits**:
  - Default album art displays correctly in packaged executables
  - Header logo loads properly based on theme (Dark/Light)
  - Consistent asset loading across development and production
  - No broken image icons in built apps
  - Future-proof for different Electron packaging methods

---

### Version 3.2.0 - 2025-10-02

#### Features Added ✨

**Feature: Album Cover Fetcher Tool**
- **Description**: Comprehensive batch album art management system with online fetching capability
- **Implementation**:
  - Scans entire music library for missing or corrupted album covers
  - Extracts embedded album art from MP3/FLAC metadata
  - Downloads high-quality covers from Cover Art Archive via MusicBrainz API
  - Validates existing covers using magic byte verification (JPEG/PNG)
  - SHA256 duplicate detection prevents redundant downloads
  - Real-time progress tracking with statistics and status logs
  - Configurable options for online downloads and validation
- **Files Added**:
  - `server/cover-fetcher.js` - Core cover fetching engine with MusicBrainz integration
  - `client/scripts/cover-fetcher-ui.js` - Modal UI controller with progress management
- **Files Modified**:
  - `main.js` - Added Tools menu and IPC handlers (lines 94-107, 1676-1724)
  - `client/pages/index.html` - Cover Fetcher modal HTML (lines 900-985)
  - `client/scripts/main-preload.js` - API exposure (lines 264-274)
  - `client/styles/features/modals.css` - Modal styling
- **Access**: Tools → Fetch Missing Album Covers (Ctrl+Shift+C)
- **Benefits**:
  - Automated album art management for large libraries
  - Professional metadata integration with MusicBrainz
  - Smart deduplication saves bandwidth and storage
  - Full logging integration for troubleshooting
  - Non-blocking batch processing with progress feedback

#### Issues Fixed ✅

**Issue #9: Cover Fetcher Modal Not Visible**
- **Description**: Cover Fetcher modal HTML was present but not visible when opened via menu
- **Root Cause**: Modal CSS required `.show` class for visibility, but JavaScript only set `display: flex`
- **Solution**:
  - Added `.show` class toggle in modal open/close methods
  - Implemented proper animation timing with setTimeout
  - Added smooth fade-in/fade-out transitions
- **Files Modified**:
  - `client/scripts/cover-fetcher-ui.js` - Modal visibility fix (lines 79-101)
- **Benefits**:
  - Modal now displays correctly with proper animations
  - Consistent behavior with other modals in the application

**Issue #10: Cover Fetcher Notification Error**
- **Description**: After scan completion, status log showed "Error: this.app.uiController.showNotification is not a function"
- **Root Cause**: Incorrect notification method path - should be `this.app.showNotification` not `this.app.uiController.showNotification`
- **Solution**:
  - Updated all three notification calls to use correct path
  - Fixed success, error, and exception notification handlers
- **Files Modified**:
  - `client/scripts/cover-fetcher-ui.js` - Notification routing (lines 167, 175, 184)
- **Benefits**:
  - Success notifications now display properly
  - Error notifications work correctly
  - Consistent notification system usage

#### Additional Enhancements 🔧

**Help Documentation for Cover Fetcher**
- **Description**: Added comprehensive help documentation for Album Cover Fetcher feature
- **Implementation**:
  - Created full help topic with usage instructions, troubleshooting, and technical details
  - Added to embedded help content in help-manager.js (order: 7)
  - Updated interface guide to list Cover Fetcher in Tools section
  - Added Cover Fetcher section to database management help topic
  - Registered in help-content.json with proper metadata
- **Files Modified**:
  - `client/scripts/help-manager.js` - Added embedded Cover Fetcher help content (lines 278-363)
  - `client/help/topics/interface-guide.md` - Added to Tools section list
  - `client/help/topics/database-management.md` - Added Cover Fetcher documentation section
  - `client/help/help-content.json` - Registered help topic (lines 54-60)
- **Benefits**:
  - Users can access detailed Cover Fetcher documentation via Help (?) button
  - Complete usage instructions and troubleshooting guide
  - Technical details for advanced users

**Database Manager Display Fix**
- **Description**: Database size statistics were confusing - showing 29.8 GB when actual database file was only 3.6 MB
- **Root Cause**: Display was showing total size of all music files, not the database file itself
- **Solution**:
  - Added database file size retrieval in IPC handler
  - Now displays both "Database Size" (actual .db file in MB) and "Music Size" (total music files in GB)
  - Clear labeling prevents confusion
- **Files Modified**:
  - `main.js` - Added dbFileSize to stats (lines 408-416)
  - `client/scripts/library-manager.js` - Updated display with both sizes (lines 3431-3477)
- **Benefits**:
  - Clear distinction between database metadata size and music collection size
  - Accurate reporting of actual database file size
  - Better understanding of storage usage

#### Known Limitations ⚠️

**Cover Fetcher: No Internet Connection Detection**
- **Description**: Cover Fetcher does not check for active internet connection before attempting online downloads
- **Impact**: If user has no internet connection and enables "Download missing covers", the feature will attempt downloads and they will silently fail
- **Workaround**: User can disable "Download missing covers" option if offline
- **Future Enhancement**: Add internet connectivity check before online operations
- **Priority**: Low (embedded art extraction still works offline)

---

### Version 3.1.6 - 2025-01-30

#### Issues Fixed ✅

**Issue #8: Default Album Art Not Displayed on Startup**
- **Description**: When the application starts up with no track loaded, the album art area shows a broken image instead of the default sample cover
- **Root Cause**: Incorrect relative path to default album art image (`../../../assets/covers/sample-cover.jpg` instead of `../../assets/covers/sample-cover.jpg`)
- **Solution**:
  - Fixed relative path in HTML initial state (index.html line 465)
  - Fixed relative path in JavaScript fallback handler (ui-controller.js line 3893)
  - Path corrected from `../../../` to `../../` based on actual directory structure
- **Files Modified**:
  - `client/pages/index.html` - Initial album art src attribute (line 465)
  - `client/scripts/ui-controller.js` - showAlbumArtPlaceholder method (line 3893)
  - `package.json` - Version bumped to 3.1.6
- **Benefits**:
  - Default album art displays correctly on startup
  - Proper fallback when track has no embedded artwork
  - Consistent visual appearance throughout the app

---

### Version 3.1.0 - 2025-01-30

#### Issues Fixed ✅

**Issue #6: Excessive Console Output in Production**
- **Description**: Browser console showed hundreds/thousands of console.log messages during normal operation, making debugging difficult and cluttering the console
- **Root Cause**: All console.log/error/warn calls throughout the application were outputting directly without respecting any logging configuration
- **Solution**:
  - Enabled console interception in both main and renderer processes
  - All console.* calls now routed through the logger system automatically
  - Default logging level set to NONE for clean console in production
  - Added user-configurable logging levels (NONE/LOW/MED/HIGH/DEV) in Settings
  - Real-time logging level updates across all processes
  - Console output now respects user's logging preference
- **Files Modified**:
  - `main.js` - Logger default to NONE, console interception enabled (lines 14-22, 163-165, 510-527)
  - `client/scripts/main-app.js` - Renderer logger setup (lines 6-15, 191-202)
  - `client/scripts/main-preload.js` - IPC bridge for logging settings (lines 47-48, 27-29)
  - `simple-logger.js` - Console interception already implemented (lines 554-613)
- **Benefits**:
  - Clean console by default (no spam during normal use)
  - Easy debugging when needed (set level to DEV)
  - No code changes needed (existing console calls automatically captured)
  - Persistent file logging for troubleshooting
  - User control via Settings UI

**Issue #7: No Version Information Displayed**
- **Description**: Application did not show version number anywhere in the UI, making it difficult for users to know which version they're running
- **Root Cause**: No UI component or menu item to display version information
- **Solution**:
  - Added Help menu with "About Que-Music" dialog showing version and build info
  - Added version display at bottom of sidebar (always visible)
  - Version display is clickable to show full About dialog
  - About dialog shows version, Electron/Node.js/Chromium versions, copyright
  - Added "Open Help" option in Help menu with F1 shortcut
  - Professional native dialog with app icon
- **Files Modified**:
  - `main.js` - Help menu and About IPC handler (lines 89-134, 284-301)
  - `client/pages/index.html` - Version display in sidebar (lines 322-328)
  - `client/styles/layout/sidebar.css` - Version styling (lines 15, 174-212)
  - `client/scripts/main-app.js` - Click handler for version (lines 95-101, 223-230)
  - `client/scripts/main-preload.js` - IPC bridge (lines 12, 30-32)
- **Benefits**:
  - Users can easily see which version they're running
  - About dialog follows desktop app conventions
  - Quick access to version info from sidebar
  - Professional appearance with complete build information

**Issue #3: Multi-Track Playlist Creation Not Working**
- **Description**: When selecting multiple MP3 files (Ctrl+Click or Shift+Click) and right-clicking to create a playlist, only one track was being added instead of all selected tracks
- **Root Cause**: Context menu system only tracked single track selection, no multi-selection support
- **Solution**:
  - Implemented multi-track selection with Ctrl+Click and Shift+Click
  - Added `selectedTracks` array to track multiple selections
  - Created `showPlaylistModalWithTracks` method for batch operations
  - Updated context menu text to show selection count ("Create Playlist with 5 Tracks")
  - Enhanced "Add to Playlist" to handle multiple tracks with progress feedback
- **Files Modified**:
  - `client/scripts/ui-controller.js` - Multi-selection logic (lines 8, 2582-2679, 2858-2946, 3532-3575)
  - `client/scripts/playlist-renderer.js` - Batch track addition (lines 422-434, 646-707, 509-557)
  - `client/styles/components/cards.css` - Selected state styling (line 264)

**Issue #4: Excessive Console Logging During Library Scan**
- **Description**: When scanning music library for the first time, thousands of log messages flooded both VS Code console and browser console
- **Root Cause**: Music scanner using console.log directly instead of the logger system
- **Solution**:
  - Updated MusicScanner to accept logger instance
  - Replaced all 17 console statements with appropriate logger calls
  - Logs now respect user's logging level setting (NONE/LOW/MED/HIGH/DEV)
  - All scan logs now go to daily log files instead of console
- **Files Modified**:
  - `server/music-scanner.js` - Logger integration (lines 8-11, 18-267)
  - `main.js` - Pass logger to scanner (lines 22-25, 155-167)

**Issue #5: All Tracks Displayed After Library Scan**
- **Description**: After initial library scan, all MP3 files from entire library were displayed in right pane instead of showing folder structure
- **Root Cause**: `loadMusicLibrary()` was calling `getAllTracks()` and displaying all tracks immediately
- **Solution**:
  - Changed to pass empty array initially instead of all tracks
  - Added empty state with friendly instruction message
  - Right pane now shows "Select a folder from the left to view its tracks"
  - Only loads tracks when user clicks a specific folder
- **Files Modified**:
  - `client/scripts/library-manager.js` - Empty initial state (lines 228-303)

#### Technical Improvements

**Console Interception System**
- Automatic capture of all console.log/error/warn calls
- Routes through logger system without code changes
- Respects user logging level preference
- Works across main and renderer processes
- Real-time level updates via IPC

**Version Display System**
- Sidebar widget with version number
- Professional About dialog with build info
- Help menu integration following desktop conventions
- Clickable version for easy access to details
- Shows Electron/Node/Chromium versions

**Multi-Selection System**
- Ctrl+Click to toggle individual tracks
- Shift+Click to select range of tracks
- Visual feedback with CSS `.selected` class
- Smart context menu detection of selected tracks

**Logger System Integration**
- MusicScanner now fully integrated with logger
- Structured logging with contextual data
- User-controllable log levels via Settings
- Daily log file rotation in `logs/` directory
- Console interception for automatic routing

**User Experience**
- Clean console by default (no logging spam)
- Easy version identification from sidebar
- Professional About dialog accessible via Help menu
- Clean initial library view with folder tree
- Batch playlist operations with progress feedback
- Context menu shows selection count
- F1 shortcut opens help from menu bar

---

### Version 3.0.5 - 2025-01-26

#### Issues Fixed ✅

**Issue #1: App Crashes During Long Playlist Playback**
- **Description**: Application would close unexpectedly after 30-45 minutes of continuous playlist playback
- **Root Cause**: Memory leaks from audio contexts, visualizer animation frames, and accumulated event listeners
- **Solution**:
  - Enhanced cleanup system with proper resource disposal
  - Periodic memory cleanup every 10 tracks
  - Global error handlers with recovery mechanisms
  - Memory monitoring system with automatic cleanup triggers
- **Files Modified**:
  - `client/scripts/core-audio.js` - Enhanced cleanup methods (lines 1705-1832)
  - `client/scripts/main-app.js` - Global error handlers (lines 80-160)

**Issue #2: Right-click "Create Playlist" Creates Empty Playlist**
- **Description**: When right-clicking on an MP3 file and selecting "Create Playlist", the playlist was created but the selected song was not added to it
- **Root Cause**: Context menu action wasn't passing the selected track to the playlist creation modal
- **Solution**:
  - Modified context menu handler to pass current track
  - Added `showPlaylistModalWithTrack` method
  - Enhanced playlist save functionality to auto-add the track
  - Fixed both normal and emergency modal code paths
- **Files Modified**:
  - `client/scripts/ui-controller.js` - Context menu handler (lines 2567-2575)
  - `client/scripts/playlist-renderer.js` - Track inclusion logic (lines 408-631)

#### Technical Improvements

**Memory Management**
- Implemented periodic cleanup system
- Added memory usage monitoring
- Enhanced visualizer resource cleanup
- Proper event listener removal

**Error Handling**
- Global unhandled rejection handlers
- Audio error recovery mechanisms
- Memory pressure detection
- Graceful degradation on errors

**User Experience**
- Smoother playlist creation workflow
- Better context menu functionality
- Improved app stability during long sessions

---

## Known Issues 🔍

### Current Open Issues
None reported

### Feature Requests
- TBD

---

## Testing Notes

### Memory Stability Testing
- ✅ Extended playlist playback (60+ minutes)
- ✅ Memory usage monitoring
- ✅ Error recovery testing

### Playlist Functionality Testing
- ✅ Right-click playlist creation
- ✅ Track inclusion verification
- ✅ Both modal types (normal and emergency)

---

## Development Notes

### Build Process
- Requires `npm run rebuild` after dependency changes
- Use `npm run make` for distribution builds
- Version incrementation in `package.json`

### Dependencies
- better-sqlite3: Requires native rebuild for Electron
- sharp: Image processing, needs native compilation
- music-metadata: Audio file parsing

### Testing Recommendations
- Test with Unicode filenames (日本語, émojis)
- Test with special characters and spaces
- Verify large library performance (1000+ tracks)
- Test memory usage during extended playback
- Test multi-track selection (Ctrl+Click, Shift+Click)
- Verify batch playlist operations with 10+ tracks
- Test logger output at different log levels (NONE/LOW/MED/HIGH/DEV)
- Verify console interception works for all console.* calls
- Test logging level changes update in real-time
- Check version display in sidebar
- Verify About dialog shows correct version and build info
- Test Help menu → About Que-Music
- Test Help menu → Open Help (F1)
- Verify version click handler opens About dialog
- Check that default logging level is NONE (clean console)