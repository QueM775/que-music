# Que-Music Issues Tracker

## Version History & Bug Fixes

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