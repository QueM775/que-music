# Que-Music Issues Tracker

## Version History & Bug Fixes

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