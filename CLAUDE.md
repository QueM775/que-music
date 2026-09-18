# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Que-Music is an Electron-based desktop music player with advanced library management, playlist functionality, and intelligent search capabilities. The application uses a modular architecture with clear separation between main and renderer processes.

## Common Development Commands

### Essential Commands

```bash
npm start          # Start development server
npm run dev        # Alternative development command
npm run make       # Build distribution packages
npm run format     # Format code with Prettier
npm run rebuild    # Rebuild native modules for Electron
node build-css.js  # Rebuild client/styles/bundled.css from styles/**/*.css
```

**CSS gotcha**: `client/pages/index.html` links only `styles/bundled.css`, a pre-built
concatenation of every file under `client/styles/`. `npm start`/`npm run dev` do **not**
regenerate it — only `npm run dist`/`dist-win` do (they run `build-css.js` first). Any
edit to a source stylesheet (`styles/layout/*.css`, `styles/components/*.css`, etc.) is
invisible in a dev session until you manually run `node build-css.js` and fully restart
the app. Found 2026-09-14 when a sidebar icon color pass silently did nothing for several
rounds of feedback — see `docs/issues/issues_track.md`.

### Logging System

The application uses an integrated logging system with file output and configurable levels:

```bash
# Log files are automatically created in logs/ directory
# View logs: logs/QueMusicMain-YYYY-MM-DD.log (main process)
# Log levels: NONE, LOW, MED, HIGH, DEV
# Configure via Settings → Advanced → Logging level
```

### Database Operations

There are no standalone database-repair scripts in the root directory — all database maintenance (orphan cleanup, path validation, duration backfill, playlist migration) is exposed through IPC handlers in `main.js` and driven from the in-app Database Manager (Tools menu). See `docs/issues/issues_track.md` for the history of database-layer fixes.

### Testing Commands

Since this is a music player, test with diverse file types:

- Use files with Unicode characters (日本語, émojis, etc.)
- Test with spaces and special characters in filenames
- Verify supported formats: MP3, FLAC, WAV, M4A, AAC, OGG, WMA

No test framework is installed (no Jest, no `npm test`). For backend logic
(database/query behavior), the established pattern (see `scripts/dev-verify/`,
started with the smart playlists feature) is a standalone Node script using
an in-memory `MusicDatabase(':memory:')` instance and Node's built-in
`assert` — not a real test runner, just enough to catch regressions before a
live launch. `better-sqlite3` is compiled against Electron's Node ABI, not
system Node, so run these scripts through Electron's bundled runtime:
```bash
ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron.cmd scripts/dev-verify/<name>.js
```
Plain `node scripts/dev-verify/<name>.js` will fail with a NODE_MODULE_VERSION
mismatch error. UI/renderer work still needs an actual `npm start` launch and
click-through — these scripts only cover `server/database.js`-level logic.

## Architecture Overview

### Main Process Architecture

- **Entry Point**: `main.js` - Electron main process with comprehensive IPC handlers
- **Database Layer**: `server/database.js` - SQLite operations with better-sqlite3
- **Music Scanning**: `server/music-scanner.js` - Metadata extraction and file processing
- **Logging System**: `simple-logger.js` - Universal logger with file output and 5 configurable levels

### Renderer Process Architecture (Modular Design)

- **App Controller**: `client/scripts/main-app.js` - Application orchestration and module coordination
- **Audio Engine**: `client/scripts/core-audio.js` - Web Audio API integration and playback management
- **Library Manager**: `client/scripts/library-manager.js` - Music library scanning, search, and filtering
- **UI Controller**: `client/scripts/ui-controller.js` - Theme management and view state control
- **Playlist System**: `client/scripts/playlist-renderer.js` - Playlist CRUD with dual storage (SQLite + M3U)

### CSS Architecture

Organized in `client/styles/` with clear separation:

- `core/` - Base styles, variables, typography, colors
- `layout/` - Grid, header, sidebar, footer layouts
- `components/` - Reusable UI components (buttons, cards, forms)
- `features/` - Feature-specific styles (player, search, modals)

## Key Technical Details

### Database Schema

Uses SQLite with better-sqlite3 for synchronous operations:

- `tracks` - Main music library with metadata
- `artists` and `albums` - Normalized data with track counts
- `playlists` and `playlist_tracks` - Playlist system with foreign keys
- `favorites` and `recently_played` - User interaction tracking

### Playlist System (Dual Storage)

- **Primary**: SQLite database for application queries and operations
- **Backup**: M3U files in `{musicFolder}/Playlists/` for portability
- **Auto-sync**: Changes in SQLite automatically export to M3U files
- **Import**: M3U files can be imported and converted to SQLite playlists

### Logging System Architecture

The application uses a universal logging system with the following features:

- **Dual Output**: Colored console logs for development + clean file logs for analysis
- **5 Log Levels**: NONE, LOW (errors), MED (errors + warnings), HIGH (info + debug), DEV (everything)
- **User Configurable**: Logger level can be changed in Settings → Advanced → Logging level
- **File Rotation**: Daily log files created automatically in `logs/` directory
- **Structured Data**: JSON formatting for complex objects and contextual information
- **Process Identification**: Separate loggers for main process (`QueMusicMain`) and renderer (`QueMusicRenderer`)

**Logger Usage Pattern**:
```javascript
// Main process
logger.info('Database initialized', { dbPath });
logger.error('Database connection failed', { error: error.message });

// Renderer process
this.app.logger.info('Settings applied', settings);
this.app.logger.warn('Feature not available');

// Music scanner (receives logger from main process)
this.logger.info('Starting music library scan', { folderPath });
this.logger.debug('Scan progress', { scanned: 100, total: 500 });
```

**Important**: All modules that log should use the logger system, not console.log:
- ✅ `logger.info()`, `logger.debug()`, `logger.error()`, `logger.warn()`
- ❌ `console.log()`, `console.error()`, `console.warn()`

The music scanner (`server/music-scanner.js`) now fully integrates with the logger system and respects user logging preferences.

### IPC Communication Pattern

Secure preload script (`client/scripts/main-preload.js`) exposes `window.queMusicAPI`:

```javascript
// File operations
await window.queMusicAPI.files.selectMusicFolder();
await window.queMusicAPI.files.getFolderTree(path);

// Database operations
await window.queMusicAPI.database.searchTracks(query);
await window.queMusicAPI.database.getAllTracks();

// Playlist operations
await window.queMusicAPI.playlist.create(data);
await window.queMusicAPI.playlist.getAll();
```

## Development Patterns

### Module Communication

The main app controller (`main-app.js`) acts as a coordinator between modules:

- Each module has a clear responsibility boundary
- Cross-module communication goes through the main app controller
- Shared state is managed centrally but accessed through delegation

### Error Handling

- Database errors are logged with emoji prefixes (❌, ⚠️, ✅)
- File path issues are common - always use proper URL encoding for audio sources
- Search functionality requires careful event delegation for dynamic content

### File Path Handling

Critical for audio playback - files with special characters or Unicode need proper encoding:

```javascript
const normalizedPath = path.normalize(filePath);
const encodedPath = encodeURI(normalizedPath.replace(/\\/g, '/'));
const fileUrl = `file:///${encodedPath}`;
this.audioPlayer.src = fileUrl;
```

### Initial Library Display

After scanning the music library, the application shows a clean dual-pane layout:

- **Left Pane**: Folder tree structure from the music folder
- **Right Pane**: Empty state with instruction "Select a folder from the left to view its tracks"
- **Behavior**: Clicking a folder in the left pane loads only that folder's tracks in the right pane

**Implementation** (`library-manager.js:228-303`):
```javascript
// After scan completes, load library with empty right pane
await this.loadMusicLibrary(folderPath);

// createFolderBrowser called with empty songs array
this.createFolderBrowser(folderTree, [], folderPath);

// Shows empty state message instead of all tracks
```

This prevents overwhelming the user with thousands of tracks and improves initial load performance.

### Library Playback Functionality

The application supports multiple ways to start playback from the library view:

#### Folder/Playlist Details Card
- **No "Play All"/"Shuffle & Play" buttons here** — removed 2026-09-16. Folder view: `LibraryManager.showSongsInRightPane()`. Playlist view: `UIController.loadPlaylistInRightPane()` (called from `selectPlaylistInBrowser()`, wired to the real `.playlist-item-card` elements) — **not** `PlaylistRenderer.generatePlaylistActionsHTML()`, which looks like the right place but is dead code, never invoked by the actual click path. Confirm which function actually renders before editing this area again — round 1 of this fix edited the dead one and the buttons visibly didn't go away.
- **To play a whole folder/playlist**: click any track. For playlists, `loadPlaylistInRightPane()` attaches its own capture-phase click handler per track that calls `PlaylistRenderer.playPlaylist(index)` — this overrides the generic single-click handler from `LibraryManager.setupLibrarySelectionEvents()`, which would otherwise rebuild `CoreAudio.playlist` from the clicked track's *disk folder* (`buildPlaylistFromCurrentFolder()`) instead of the actual playlist (a playlist can span many folders; that generic handler is only correct for folder browsing).
- `handlePlayAllClick()` in `library-manager.js` still exists and is still used by the separate Discover → Advanced Filters "Play All" button, and Favorites/Artists/Albums/search-results each have their own separate Play All too (`ui-controller.js`) — none of those were in scope for the 2026-09-16 fix, don't assume they're gone.

#### Main Play Button
- **Location**: Main player controls
- **Function**: `togglePlayPause()` in `core-audio.js:435` with `playFromVisibleSongs()`
- **Smart Behavior**: 
  - If no playlist exists, creates one from currently visible songs (`.song-card` elements)
  - If playlist exists, toggles play/pause state
  - Always starts from first visible song when creating new playlist

#### Shuffle
- **Location**: Queue pane header, inline with the "Up Next" title (moved 2026-09-16 from the bottom transport bar — see `docs/issues/issues_track.md`).
- **Function**: `#shuffleBtn` → `CoreAudio.toggleShuffle()` → `enableShuffle()`/`disableShuffle()`, shuffles `CoreAudio.playlist` (the loaded folder/playlist context), not the separate Up Next queue.
- Because it now lives inside the DOM region `UIController.ensureCorrectDOMStructure()`'s fallback template can rebuild, that template rebinds `#shuffleBtn`'s click handler and restores its `.active` state after a repair — it used to be safely outside that region when it lived in the transport bar.

#### Track Highlighting System
- **Library View**: `updateLibraryTrackHighlight()` in `library-manager.js:598`
- **CSS Classes**: Uses `playing` and `selected` classes for visual feedback
- **Auto-scroll**: Highlighted tracks scroll into view automatically
- **Track Advancement**: Updates highlighting when songs auto-advance via `nextTrack()`/`previousTrack()`

#### 4th Pane Is "Current Playlist", Not a Disappearing "Up Next" (converted 2026-09-18)
`UIController.renderQueuePane()` renders `CoreAudio.queue` (manual "play next", jumps the line, unchanged) followed by the **entire** `CoreAudio.playlist` array — not a `.slice(currentTrackIndex + 1)` preview. Nothing ever drops out of the list as it plays: the current track gets a `.now-playing` highlight, already-played tracks before it get `.already-played` (dimmed), and everything remains draggable. Both sections drag-reorder independently — queue rows call `CoreAudio.reorderQueue()`, playlist rows call `CoreAudio.reorderPlaylistTrack()` (new method, same splice-and-shift-`currentTrackIndex` pattern as `reorderQueue`) — `attachQueuePaneHandlers()` tells them apart via `data-queue-index` vs `data-playlist-index` so a drag started in one section can't reorder the other. `CoreAudio.playSong()` still calls `notifyQueueChanged()` after every track load so this stays live as playback advances.
- **Growing the list instead of replacing it**: `CoreAudio.buildPlaylistFromCurrentFolder()` and `PlaylistRenderer.playPlaylist()` both check `CoreAudio.currentTrack` — if something's already playing, the newly-selected folder/playlist's tracks get **appended** to `CoreAudio.playlist` (deduped by path) instead of replacing it, so browsing to a different artist/album while music is playing grows the Current Playlist rather than wiping it. A fresh session with nothing loaded yet still builds/replaces from scratch. Selecting a folder/playlist while music is playing no longer wipes the running list, but every *other* "Play All" entry point (Favorites, Artists, Albums, search results — see the Library Playback Functionality section above) still replaces outright; they weren't touched in this pass.

#### Database Manager Is a Modal, Not a View
`LibraryManager.openDatabaseManager()` opens `#databaseManagerModal` (via `UIController.showModal()`/`hideModal()`, added 2026-09-16) instead of swapping `#singlePaneContent`/`currentView`. It renders on top of whatever view is active and never touches `#dualPaneLayout`, so there is no "back" to navigate and nothing underneath can go stale. If you add another full-screen-feeling tool panel (anything that isn't really "a view" — settings, stats, one-off utilities), prefer this modal pattern over the view-swap pattern; the view-swap pattern is what caused three separate "state goes missing" bugs on this exact feature (see the three 2026-09-16 `docs/issues/issues_track.md` entries) before being replaced.

#### Stale-Async View Guard
Several left/right-pane renderers do an `await` (DB/IPC fetch) before writing `leftPaneContent`/`rightPaneContent` — `LibraryManager.createEmptyFolderBrowser()`, `LibraryManager.showLibraryView()`, `UIController.switchToNowPlaying()`. Each checks `this.app.currentView` immediately after its await and bails if the user has since navigated elsewhere, so a slow background load (e.g. the initial library scan on app boot) can't land late and stomp whatever view is actually on screen. Apply the same guard to any new pane-writing async function — see the 2026-09-16 entries in `docs/issues/issues_track.md` for the race this fixed (caught live: switching to Playlists moments after launch got silently overwritten by the startup library scan). Note this guard is a defensive general pattern; it is not what fixed Database Manager specifically — that one is structurally fixed by not being a view-swap anymore (see above).

## Common Issues and Solutions

### Debugging with Logger

The integrated logging system provides powerful debugging capabilities:

- **Set Logger Level**: Go to Settings → Advanced → Logging level → DEV for maximum verbosity
- **View Log Files**: Check `logs/QueMusicMain-YYYY-MM-DD.log` for persistent logs
- **Console Output**: Colored, real-time logs in the development console
- **Structured Data**: All log entries include contextual information and error details

**Debug Commands**:
```javascript
// Check current logger level
this.app.logger.getLevel()

// Change logger level programmatically
this.app.logger.setLevel('DEV')

// Log with structured data
this.app.logger.debug('Debug info', { state: 'processing', data: complexObject })
```

### Audio Playback Issues

- **Problem**: `ERR_FILE_NOT_FOUND` with special characters
- **Solution**: Ensure proper URL encoding in `core-audio.js` loadTrack method
- **Debug**: Set logger to DEV level to see detailed audio loading logs
- **Test with**: Unicode filenames, spaces, apostrophes, accented characters

### Search Input Problems

- **Problem**: Search input not responding to typing
- **Solution**: Check CSS pointer-events and z-index conflicts
- **Debug**: Use browser dev tools to verify input element is focusable

### Context Menu Issues

- **Problem**: Right-click menus not appearing
- **Solution**: Verify global event delegation in `ui-controller.js`
- **Pattern**: Use event delegation for dynamically created track elements

### Multi-Track Selection System

The application supports multi-track selection for batch operations:

#### Selection Methods
- **Ctrl+Click** (or Cmd+Click on Mac): Toggle individual tracks on/off
- **Shift+Click**: Select range from last selected track to clicked track
- **Visual Feedback**: Selected tracks show with `.selected` CSS class (highlighted background)

#### Context Menu Integration
- Right-clicking on selected tracks opens context menu for all selected tracks
- Menu text updates dynamically: "Add 5 Tracks to Playlist", "Create Playlist with 3 Tracks"
- If right-clicking on unselected track, only that track is used (clears other selections)

#### Implementation Details
```javascript
// UIController tracks selections
this.selectedTracks = [];  // Array of selected track objects

// Multi-selection in song card click handler (ui-controller.js:3532-3575)
item.addEventListener('click', (e) => {
  if (e.ctrlKey || e.metaKey) {
    item.classList.toggle('selected');  // Toggle selection
  } else if (e.shiftKey) {
    // Select range between last selected and current
  }
});

// Context menu collects selections (ui-controller.js:2588-2605)
const selectedCards = document.querySelectorAll('.song-card.selected');
this.selectedTracks = Array.from(selectedCards).map(card => extractSongData(card));

// Batch operations
- Create playlist: playlist-renderer.js:422-434 (showPlaylistModalWithTracks)
- Add to existing: ui-controller.js:2858-2946 (addTrackToPlaylistFromContext)
```

#### Batch Operation Features
- Progress feedback: "Added 5 tracks, 2 already in playlist, 1 failed"
- Duplicate detection per playlist
- Handles errors gracefully without breaking batch operation
- Shows summary notification after batch completion

### Playlist Modal Visibility

- **Problem**: Playlist modals not showing despite HTML presence
- **Solution**: Check CSS show/hide classes and modal backdrop z-index
- **Fallback**: Emergency modal creation if existing modal is corrupted

## Code Style Guidelines

### JavaScript Patterns

- Use async/await for asynchronous operations
- Prefer template literals for string interpolation
- Use emoji prefixes in console logs for easy filtering (🎵, 🔍, 📊, etc.)
- Implement proper error boundaries with try/catch blocks

### CSS Organization

- Use CSS custom properties for theming (light/dark mode support)
- Follow BEM-like naming for components
- Maintain responsive design principles for dual-pane layout
- Use CSS Grid for complex layouts, Flexbox for simpler arrangements

### Database Operations

- Always use transactions for multi-step operations
- Implement proper error handling for SQLite constraints
- Use prepared statements to prevent SQL injection
- Maintain referential integrity with proper foreign key constraints

## Testing Approach

### File Compatibility Testing

Always test with challenging filenames:

- `Test - Song (2024).mp3` - Spaces and parentheses
- `Café_Música.flac` - Accented characters
- `アニメ_OST.wav` - Unicode characters
- `Artist's Best Song.mp4` - Apostrophes

### Database Testing

- Test with large libraries (1000+ tracks)
- Verify search performance with complex queries
- Test playlist operations with many tracks
- Verify M3U export/import functionality

### UI Testing

- Test theme switching (light/dark/system)
- Verify dual-pane layout responsiveness
- Test context menu positioning
- Validate modal behavior and accessibility

## Performance Considerations

### Large Library Optimization

- Database uses indexes on commonly queried columns (artist, album, genre, year)
- Search results are limited and paginated when necessary
- Album art is cached with size limits and expiry times
- Virtual scrolling should be implemented for very large track lists

### Memory Management

- Audio objects are properly cleaned up on track changes
- Album art cache has automatic cleanup of expired entries
- DOM manipulation is batched to avoid excessive reflows
- Event listeners are properly removed when components unmount

## Security Considerations

- No direct filesystem access from renderer process
- All file operations go through secure IPC channels
- User data is stored in Electron's userData directory
- No execution of user-provided code or unsafe operations

## Deployment Notes

### Native Module Dependencies

- `better-sqlite3` requires rebuilding for Electron
- `sharp` for image processing needs native compilation
- Run `npm run rebuild` after installing dependencies
- Windows may require Python and Visual Studio Build Tools

### Distribution

- Uses Electron Builder for packaging (Electron Forge was removed — see `docs/application/packaging-guide.md`)
- Supports multiple platforms (Windows, macOS, Linux)
- Icons are located in `assets/icons/` directory
- Build configuration is in `package.json` under the `build` key; `npm run make` is an alias for `npm run build-win`
- Asset files (logos, sample covers) are copied to `resources/` during build via `extraResources`

### Asset Path Resolution (Production vs Development)

The `server/path-manager.js` module handles dynamic path resolution for assets:

- **Development**: Assets loaded from `assets/images/`, `assets/covers/`, etc.
- **Production**: Assets copied to `resources/images/`, `resources/covers/` (not `resources/assets/...`)
- **PathManager**: Checks multiple locations with fallback for both environments
- **Key Insight**: `extraResources` in package.json copies to `resources/{type}/` directly

## Recent Updates (Version 3.2.5)

### Album Cover Display Fix

Fixed album cover caching issue where covers wouldn't change between tracks:

- **Issue**: Browser was caching album art images, preventing updates when changing tracks
- **Solution**: Clear image `src` before setting new cover (`ui-controller.js:3840-3888`)
- **Behavior**: Album covers now update properly, including default covers when no art exists
- **Also Fixed**: Default cover display uses same cache-clearing approach

### Sort Dropdown Functionality

The sort dropdown was already implemented but users didn't understand its purpose:

- **Handler**: `main-app.js:355-360` - Listens to sort select changes
- **Sort Logic**: `library-manager.js:4180-4193` - `sortCurrentView()` determines current view and sorts
- **Sorts**: Title (A-Z), Artist (A-Z), Album (A-Z), Year (oldest-newest), Duration (shortest-longest)
- **Context-Aware**: Sorts whatever is currently displayed (library folder, search results, playlists)

### Search Results Navigation

Added "Clear Results" button to return to library from search view:

- **Button**: `library-manager.js:2609` - Inline button in search results subtitle
- **Function**: `library-manager.js:2876-2885` - `clearSearchResultsAndReturnToLibrary()`
- **Behavior**: Clears search input and switches back to library view

### Asset Loading Fix

Fixed issue where logo and default album art weren't loading in production builds:

- **Problem**: PathManager was checking `resources/assets/{type}/` but extraResources copies to `resources/{type}/`
- **Solution**: Added `path.join(this.roots.resources, assetType, fileName)` as first production path check
- **File**: `server/path-manager.js:96` - Now checks correct production path first

### Header Logo Display Fix

Fixed logo appearing as "half an image" due to incorrect CSS sizing:

- **Issue**: Logo PNG is 1536x1024 with large padding, fixed width/height was cropping it
- **Solution**: Changed to `object-fit: cover` with `width: 200px; height: 50px`
- **File**: `client/styles/layout/header.css:44-51`
- **Result**: Full logo displays properly without being cut off
