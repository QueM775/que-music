// main.js - Clean Electron main process

const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');
const mm = require('music-metadata'); // Works with both v7 and v8

const MusicDatabase = require('./server/database');
const MusicScanner = require('./server/music-scanner');
const PathManager = require('./server/path-manager');

// Initialize logger
const SimpleLogger = require('./simple-logger.js');
const logger = new SimpleLogger({
  appName: 'QueMusicMain',
  level: 'NONE', // Default to NONE - will be set from user settings
  compactMode: false,
  enableColors: true
});

// Enable console interception to route all console.* calls through logger
logger.enableConsoleReplacement();

// These will be initialized after app is ready
let pathManager = null;
let settingsPath;
let dbPath;
let musicDB = null;
let musicScanner = null;

// Cache for album art paths
let albumArtCache = new Map();
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Keep a global reference of the window object
let mainWindow;

// Single instance lock - TEMPORARILY DISABLED DUE TO MODULE RESOLUTION ISSUE
// TODO: Re-enable once electron module issue is resolved
// const gotTheLock = app.requestSingleInstanceLock();

// if (!gotTheLock) {
//   logger.warn('Another instance of Que-Music is already running. Exiting...');
//   app.quit();
// } else {
//   app.on('second-instance', (event, commandLine, workingDirectory) => {
//     logger.info('Second instance attempted to start - focusing existing window');
//     // Someone tried to run a second instance, we should focus our window instead
//     if (mainWindow) {
//       if (mainWindow.isMinimized()) mainWindow.restore();
//       mainWindow.focus();
//     }
//   });
// }

function createMenu() {
  const isDevelopment = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');

  const viewSubmenu = [
    { role: 'resetZoom' },
    { role: 'zoomIn' },
    { role: 'zoomOut' },
    { type: 'separator' },
    { role: 'togglefullscreen' },
  ];

  // Add dev tools in development, or toggle option in production
  if (isDevelopment) {
    viewSubmenu.unshift(
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' }
    );
  } else {
    // Add dev tools toggle in production (useful for debugging)
    viewSubmenu.unshift(
      {
        label: 'Developer Tools',
        accelerator: 'F12',
        click: () => {
          if (mainWindow) {
            mainWindow.webContents.toggleDevTools();
          }
        },
      },
      { type: 'separator' }
    );
  }

  const template = [
    {
      label: 'View',
      submenu: viewSubmenu,
    },
    {
      label: 'Tools',
      submenu: [
        {
          label: 'Fetch Missing Album Covers',
          accelerator: 'CmdOrCtrl+Shift+C',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('show-cover-fetcher-modal');
            }
          }
        }
      ]
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'close' }],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Que-Music',
          click: () => {
            if (mainWindow) {
              const { dialog } = require('electron');
              dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'About Que-Music',
                message: `Que-Music v${app.getVersion()}`,
                detail: `A Modern Desktop Music Player & Library Manager\n\n` +
                        `Built with Electron ${process.versions.electron}\n` +
                        `Node.js ${process.versions.node}\n` +
                        `Chromium ${process.versions.chrome}\n\n` +
                        `© 2025 Erich Quade\n` +
                        `Licensed under MIT License`,
                buttons: ['OK'],
                icon: path.join(__dirname, 'assets/icons/icon.png')
              });
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Open Help',
          accelerator: 'F1',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('show-help');
            }
          }
        }
      ]
    }
  ];

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

async function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    frame: true,
    show: false, // Start hidden to prevent flash
    backgroundColor: '#1a1a1a', // Set background color to match our dark theme
    webPreferences: {
      // contextIsolation + a preload bridge (main-preload.js) means the renderer never
      // needs direct Node/Electron access — nodeIntegration was dead weight and a live
      // hole if contextIsolation is ever accidentally turned off later.
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: pathManager.getPreloadPath(),
    },
  });
  
  // Handle ready-to-show to prevent flash
  mainWindow.once('ready-to-show', () => {
    logger.info('Window ready to show - basic DOM loaded');
    // Don't show yet - wait for renderer to signal it's fully loaded
  });

  await mainWindow.loadFile('./client/pages/index.html');
  logger.info('Que-Music window loaded HTML file');

  // Open DevTools in development
  const isDevelopment = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');
  if (isDevelopment) {
    mainWindow.webContents.openDevTools();
  }
}

// App event handlers
app.whenReady().then(async () => {
  // Initialize Path Manager
  pathManager = new PathManager(app, logger);

  // Initialize paths using Path Manager
  settingsPath = pathManager.getSettingsPath();
  dbPath = pathManager.getDatabasePath();

  // Load logging level from settings and apply to logger
  const logLevel = await getSetting('logLevel', 'NONE');
  logger.setLevel(logLevel);
  logger.info('App paths initialized', { settingsPath, dbPath, logLevel });

  // Log path diagnostics in DEV mode
  if (logLevel === 'DEV') {
    pathManager.logDiagnostics();
  }

  // Initialize database
  try {
    logger.info('Initializing music database and scanner...');
    musicDB = new MusicDatabase(dbPath);
    logger.info('Database initialized successfully');
    musicScanner = new MusicScanner(musicDB, logger);
    logger.info('Scanner initialized successfully');
    logger.info('Music database ready');

    // Validate database schema (tables are already initialized by the new consolidated schema)
    try {
      const schemaValidation = await musicDB.validateSchema();
      if (!schemaValidation.valid) {
        logger.warn('Database schema validation warnings', { missingTables: schemaValidation.missingTables });
      }
    } catch (error) {
      logger.error('Error validating database schema', { error: error.message });
    }

    // Initialize playlist folder if music folder is already set
    const savedMusicFolder = await getSetting('musicFolder', null);
    if (savedMusicFolder && musicDB) {
      await musicDB.setPlaylistFolder(savedMusicFolder);
    }
  } catch (error) {
    logger.error('Database initialization failed', { error: error.message });
  }
  logger.info('Album art system initialized');

  // Clean up expired cache entries on startup (after 5 seconds)
  setTimeout(() => {
    const now = Date.now();
    let removedEntries = 0;

    for (const [key, entry] of albumArtCache.entries()) {
      if (!isCacheValid(entry)) {
        albumArtCache.delete(key);
        removedEntries++;
      }
    }

    if (removedEntries > 0) {
      logger.info('Cleaned up expired cache entries', { removedEntries });
    }
  }, 5000);

  createMenu();
  createWindow();
});

app.on('before-quit', () => {
  if (musicDB) {
    musicDB.close();
    logger.info('Database closed');
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createWindow();
  }
});

// ============================================================================
// IPC HANDLERS - APPLICATION INFORMATION
// ============================================================================
ipcMain.handle('app:get-name', () => {
  return app.getName();
});

ipcMain.handle('app:get-version', () => {
  return app.getVersion();
});

// Handle renderer fully loaded signal
ipcMain.handle('app:show-about', () => {
  if (mainWindow) {
    const { dialog } = require('electron');
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'About Que-Music',
      message: `Que-Music v${app.getVersion()}`,
      detail: `A Modern Desktop Music Player & Library Manager\n\n` +
              `Built with Electron ${process.versions.electron}\n` +
              `Node.js ${process.versions.node}\n` +
              `Chromium ${process.versions.chrome}\n\n` +
              `© 2025 Erich Quade\n` +
              `Licensed under MIT License`,
      buttons: ['OK'],
      icon: path.join(__dirname, 'assets/icons/icon.png')
    });
  }
});

ipcMain.handle('app:renderer-ready', () => {
  logger.info('Renderer fully loaded - showing window');
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
  }
});

// ============================================================================
// IPC HANDLERS - FILE OPERATIONS
// ============================================================================

// Select music folder and initialize playlists
ipcMain.handle('files:select-music-folder', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Your Music Folder',
      buttonLabel: 'Select Folder',
      properties: ['openDirectory', 'createDirectory'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const folderPath = result.filePaths[0];

    // Save the selected folder
    await saveSetting('musicFolder', folderPath);

    //  Initialize playlist folder
    if (musicDB) {
      await musicDB.setPlaylistFolder(folderPath);
    }

    // Scan folder for basic info
    const folderInfo = await scanMusicFolder(folderPath);

    return {
      path: folderPath,
      name: path.basename(folderPath),
      totalFiles: folderInfo.totalFiles,
      supportedFormats: ['MP3', 'WAV', 'FLAC', 'M4A', 'OGG', 'WMA'],
      lastScanned: new Date().toISOString(),
    };
  } catch (error) {
    logger.error('Error selecting music folder', { error: error.message });
    throw error;
  }
});

ipcMain.handle('files:get-folder-tree', async (event, folderPath) => {
  try {
    return await buildFolderTree(folderPath);
  } catch (error) {
    logger.error('Error building folder tree', { error: error.message });
    throw error;
  }
});

ipcMain.handle('files:get-songs-in-folder', async (event, folderPath) => {
  try {
    return await getSongsInFolder(folderPath);
  } catch (error) {
    logger.error('Error getting songs', { error: error.message });
    throw error;
  }
});

// ============================================================================
// IPC HANDLERS - SETTINGS MANAGEMENT
// ============================================================================
ipcMain.handle('settings:get-music-folder', async () => {
  return await getSetting('musicFolder', null);
});

ipcMain.handle('settings:set-music-folder', async (event, folderPath) => {
  return await saveSetting('musicFolder', folderPath);
});

// ============================================================================
// IPC HANDLERS - DATABASE OPERATIONS
// ============================================================================
ipcMain.handle('database:get-stats', async () => {
  if (!musicDB) return { tracks: 0, artists: 0, albums: 0 };
  const stats = await musicDB.getStats();

  // Add actual database file size
  try {
    const dbPath = path.join(app.getPath('userData'), 'music-library.db');
    const dbStats = fs.statSync(dbPath);
    stats.dbFileSize = dbStats.size;
  } catch (error) {
    logger.warn('Could not get database file size', { error: error.message });
    stats.dbFileSize = 0;
  }

  return stats;
});

ipcMain.handle('database:search-tracks', async (event, query) => {
  if (!musicDB) return [];
  return musicDB.searchTracks(query);
});

ipcMain.handle('database:get-all-tracks', async () => {
  if (!musicDB) return [];
  return musicDB.getAllTracks();
});

ipcMain.handle('database:getTrackByPath', async (event, trackPath) => {
  try {
    if (!musicDB) return null;
    return await musicDB.getTrackByPath(trackPath);
  } catch (error) {
    logger.error('Error getting track by path', { error: error.message });
    throw error;
  }
});

ipcMain.handle('database:get-all-artists', async () => {
  if (!musicDB) return [];
  return musicDB.getAllArtists();
});

ipcMain.handle('database:get-all-albums', async () => {
  if (!musicDB) return [];
  return musicDB.getAllAlbums();
});

ipcMain.handle('database:get-tracks-by-artist', async (event, artist) => {
  if (!musicDB) return [];
  return musicDB.getTracksByArtist(artist);
});

ipcMain.handle('database:get-tracks-by-album', async (event, album, artist) => {
  if (!musicDB) return [];
  return musicDB.getTracksByAlbum(album, artist);
});

ipcMain.handle('database:get-genre-stats', async () => {
  if (!musicDB) return [];
  return musicDB.getGenreStats();
});

ipcMain.handle('database:get-year-stats', async () => {
  if (!musicDB) return [];
  return musicDB.getYearStats();
});

ipcMain.handle('database:check-duplicates', async () => {
  if (!musicDB) return [];
  return musicDB.checkForDuplicates();
});

ipcMain.handle('database:populateFromTracks', async () => {
  try {
    return await musicDB.populateArtistsAndAlbumsFromTracks();
  } catch (error) {
    logger.error('Error populating artists/albums', { error: error.message });
    throw error;
  }
});

ipcMain.handle('database:get-recently-played', async (event, limit) => {
  if (!musicDB) return [];
  return musicDB.getRecentlyPlayed(limit);
});

ipcMain.handle('database:updateDurations', async () => {
  try {
    return await musicDB.updateMissingDurations();
  } catch (error) {
    logger.error('Error updating durations', { error: error.message });
    throw error;
  }
});

// Database cleanup and validation
ipcMain.handle('database:cleanup', async () => {
  try {
    console.log('🧹 Starting database cleanup from IPC...');
    return await musicDB.cleanupDatabase();
  } catch (error) {
    console.error('❌ Error during database cleanup:', error);
    throw error;
  }
});

ipcMain.handle('database:validate-paths', async () => {
  try {
    console.log('🔍 Validating database paths from IPC...');
    return await musicDB.validateAllPaths();
  } catch (error) {
    console.error('❌ Error validating paths:', error);
    throw error;
  }
});

// Playlist migration (should be moved to database class in future refactor)
ipcMain.handle('database-migrate-playlists', async () => {
  try {
    if (!musicDB) {
      throw new Error('Database not initialized');
    }
    return await performPlaylistMigration();
  } catch (error) {
    console.error('❌ Error in playlist migration:', error);
    throw error;
  }
});

//cleanup handler
ipcMain.handle('database-cleanup-orphaned-playlists', async () => {
  try {
    if (!musicDB) {
      throw new Error('Database not initialized');
    }

    console.log('🧹 Cleaning up orphaned playlist tracks...');

    const result = musicDB.db
      .prepare(`DELETE FROM playlist_tracks WHERE track_id IS NOT NULL AND track_id NOT IN (SELECT id FROM tracks)`)
      .run();
    console.log(`🧹 Cleaned up ${result.changes} orphaned playlist track references`);
    return { success: true, cleaned: result.changes };
  } catch (error) {
    console.error('❌ Error cleaning up orphaned playlists:', error);
    throw error;
  }
});

// ============================================================================
// IPC HANDLERS - MUSIC SCANNER
// ============================================================================
ipcMain.handle('scanner:scan-library', async (event, folderPath) => {
  console.log('🎯 IPC: scanner:scan-library called with folder:', folderPath);
  if (!musicScanner) return 0;

  try {
    const trackCount = await musicScanner.scanAndSaveToDatabase(folderPath, (progress) => {
      // Send progress updates to renderer
      console.log('🚀 IPC: Forwarding progress to renderer:', progress);
      mainWindow.webContents.send('scanner:progress', progress);
    });

    return trackCount;
  } catch (error) {
    console.error('❌ Library scan failed:', error);
    throw error;
  }
});

ipcMain.handle('scanner:get-progress', async () => {
  // For future use
  return { current: 0, total: 0 };
});

ipcMain.handle('settings:get-player-state', async () => {
  return await getSetting('playerState', null);
});

ipcMain.handle('settings:set-player-state', async (event, state) => {
  return await saveSetting('playerState', state);
});

// Layout prefs (sidebar collapsed state, resizable pane widths) — see
// docs/application/layout-redesign.md. Same generic getSetting/saveSetting
// store as playerState/logLevel above, just a different key.
ipcMain.handle('settings:get-layout', async () => {
  return await getSetting('layoutPrefs', null);
});

ipcMain.handle('settings:set-layout', async (event, layoutPrefs) => {
  return await saveSetting('layoutPrefs', layoutPrefs);
});

// Logging level handlers
ipcMain.handle('settings:get-log-level', async () => {
  return await getSetting('logLevel', 'NONE');
});

ipcMain.handle('settings:set-log-level', async (event, level) => {
  // Update logger level immediately
  logger.setLevel(level);

  // Save to settings
  const result = await saveSetting('logLevel', level);

  // Notify renderer to update its logger level
  if (mainWindow) {
    mainWindow.webContents.send('logger:level-changed', level);
  }

  return result;
});

// ============================================================================
// IPC HANDLERS - PLAYLIST MANAGEMENT
// ============================================================================

// Initialize playlist folder when music folder is set
ipcMain.handle('playlist:set-folder', async (event, musicFolderPath) => {
  try {
    if (musicDB) {
      await musicDB.setPlaylistFolder(musicFolderPath);
      console.log(`📁 Playlist folder initialized for: ${musicFolderPath}`);
      return { success: true };
    } else {
      throw new Error('Database not initialized');
    }
  } catch (error) {
    console.error('❌ Error setting playlist folder:', error);
    throw error;
  }
});

// Get playlist folder path
ipcMain.handle('playlist:get-folder', async () => {
  try {
    if (musicDB && musicDB.playlistFolder) {
      return musicDB.playlistFolder;
    }
    return null;
  } catch (error) {
    console.error('❌ Error getting playlist folder:', error);
    throw error;
  }
});

// Import M3U files manually
ipcMain.handle('playlist:import-m3u', async (event, m3uFilePath) => {
  try {
    if (musicDB) {
      await musicDB.importM3UFile(m3uFilePath);
      console.log(`📂 Imported M3U file: ${m3uFilePath}`);
      return { success: true };
    } else {
      throw new Error('Database not initialized');
    }
  } catch (error) {
    console.error('❌ Error importing M3U file:', error);
    throw error;
  }
});

//  Export playlist to M3U manually
ipcMain.handle('playlist:export-m3u', async (event, playlistId) => {
  try {
    if (musicDB) {
      await musicDB.exportPlaylistToM3U(playlistId);
      console.log(`📂 Exported playlist ${playlistId} to M3U`);
      return { success: true };
    } else {
      throw new Error('Database not initialized');
    }
  } catch (error) {
    console.error('❌ Error exporting playlist to M3U:', error);
    throw error;
  }
});

// CREATE PLAYLIST
ipcMain.handle('playlist:create', async (event, playlistData) => {
  try {
    const playlist = await musicDB.createPlaylist(playlistData);
    return playlist;
  } catch (error) {
    console.error('❌ Error creating playlist:', error);
    throw error;
  }
});

// GET ALL PLAYLISTS
ipcMain.handle('playlist:get-all', async () => {
  try {
    if (!musicDB) return [];
    const playlists = await musicDB.getAllPlaylists();
    return playlists;
  } catch (error) {
    logger.error('Error getting playlists', { error: error.message });
    throw error;
  }
});

// GET PLAYLIST BY ID (with tracks)
ipcMain.handle('playlist:get-by-id', async (event, playlistId) => {
  try {
    const playlist = await musicDB.getPlaylistById(playlistId);
    return playlist;
  } catch (error) {
    console.error('❌ Error getting playlist:', error);
    throw error;
  }
});

// ADD TRACK TO PLAYLIST
ipcMain.handle('playlist:add-track', async (event, { playlistId, trackId }) => {
  try {
    const result = await musicDB.addTrackToPlaylist(playlistId, trackId);
    return result;
  } catch (error) {
    console.error('❌ Error adding track to playlist:', error);
    throw error;
  }
});

// REMOVE TRACK FROM PLAYLIST
ipcMain.handle('playlist:remove-track', async (event, { playlistId, trackId }) => {
  try {
    const result = await musicDB.removeTrackFromPlaylist(playlistId, trackId);
    return result;
  } catch (error) {
    console.error('❌ Error removing track from playlist:', error);
    throw error;
  }
});

// REORDER TRACKS IN PLAYLIST
ipcMain.handle('playlist:reorder-tracks', async (event, { playlistId, trackId, newPosition }) => {
  try {
    const result = await musicDB.reorderTracksInPlaylist(playlistId, trackId, newPosition);
    return result;
  } catch (error) {
    console.error('❌ Error reordering tracks:', error);
    throw error;
  }
});

// UPDATE PLAYLIST INFO
ipcMain.handle('playlist:update', async (event, playlistData) => {
  try {
    const playlist = await musicDB.updatePlaylist(playlistData);
    return playlist;
  } catch (error) {
    console.error('❌ Error updating playlist:', error);
    throw error;
  }
});

// DELETE PLAYLIST
ipcMain.handle('playlist:delete', async (event, playlistId) => {
  try {
    const result = await musicDB.deletePlaylist(playlistId);
    return result;
  } catch (error) {
    console.error('❌ Error deleting playlist:', error);
    throw error;
  }
});

// SAVE A SMART PLAYLIST'S CURRENT MATCHES AS A NEW STATIC PLAYLIST
ipcMain.handle('playlist:save-smart-as-static', async (event, { playlistId, name }) => {
  try {
    const snapshot = await musicDB.saveSmartPlaylistAsStatic(playlistId, name);
    return snapshot;
  } catch (error) {
    console.error('❌ Error saving smart playlist as static:', error);
    throw error;
  }
});

// REPLACE A SMART PLAYLIST'S RULES (used by the rule builder's edit flow)
ipcMain.handle('playlist:set-smart-rules', async (event, { playlistId, rules }) => {
  try {
    const result = musicDB.addSmartPlaylistRules(playlistId, rules);
    return result;
  } catch (error) {
    console.error('❌ Error setting smart playlist rules:', error);
    throw error;
  }
});

// GET A SMART PLAYLIST'S RULES (used by the rule builder's edit flow)
ipcMain.handle('playlist:get-smart-rules', async (event, playlistId) => {
  try {
    const rules = musicDB.getSmartPlaylistRules(playlistId);
    return rules;
  } catch (error) {
    console.error('❌ Error getting smart playlist rules:', error);
    throw error;
  }
});

// Database debug IPC handler
ipcMain.handle('debug:playlist-tables', async (event, playlistId) => {
  try {
    console.log(`🧪 Debugging playlist tables for ID: ${playlistId}`);

    if (!musicDB) {
      return { error: 'Database not available' };
    }

    // Check 1: Playlist exists
    const playlist = musicDB.db.prepare('SELECT * FROM playlists WHERE id = ?').get(playlistId);

    // Check 2: Playlist tracks entries
    const playlistTracksEntries = musicDB.db
      .prepare('SELECT * FROM playlist_tracks WHERE playlist_id = ?')
      .all(playlistId);

    // Check 3: Sample tracks in tracks table
    const sampleTracks = musicDB.db.prepare('SELECT id, path, title FROM tracks LIMIT 10').all();

    // Check 4: Join query that should work (playlist_tracks now keys on track_path, not track_id)
    const joinResults = musicDB.db
      .prepare(
        `
        SELECT
          pt.playlist_id,
          pt.track_id,
          pt.track_path,
          pt.position,
          t.id as actual_track_id,
          t.path,
          t.title,
          t.artist
        FROM playlist_tracks pt
        LEFT JOIN tracks t ON pt.track_path = t.path
        WHERE pt.playlist_id = ?
        ORDER BY pt.position ASC
      `
      )
      .all(playlistId);

    // Check 5: Count total tracks and playlist_tracks
    const counts = musicDB.db
      .prepare(
        `
        SELECT
          (SELECT COUNT(*) FROM tracks) as total_tracks,
          (SELECT COUNT(*) FROM playlist_tracks) as total_playlist_tracks,
          (SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id = ?) as this_playlist_tracks
      `
      )
      .get(playlistId);

    const result = {
      playlistId,
      playlist,
      playlistTracksEntries,
      playlistTracksCount: playlistTracksEntries.length,
      sampleTracks: sampleTracks.slice(0, 5),
      joinResults,
      joinResultsCount: joinResults.length,
      counts,
      diagnosis: {
        playlistExists: !!playlist,
        hasPlaylistTrackEntries: playlistTracksEntries.length > 0,
        joinWorking: joinResults.length > 0,
        missingTracks: joinResults.filter((r) => !r.actual_track_id).length,
      },
    };

    console.log('🧪 Playlist debug result:', result);
    return result;
  } catch (error) {
    console.error('❌ Playlist debug error:', error);
    return { error: error.message };
  }
});

// Force re-import M3U files handler — rebuilds every playlist from its .m3u on disk
ipcMain.handle('playlist:force-reimport-m3u', async () => {
  try {
    if (!musicDB) {
      return { success: false, error: 'Database not available' };
    }

    const savedMusicFolder = await getSetting('musicFolder', null);
    if (!savedMusicFolder) {
      return { success: false, error: 'No music folder set' };
    }

    if (!musicDB.playlistFolder) {
      musicDB.playlistFolder = path.join(savedMusicFolder, 'Playlists');
    }
    if (!(await fs.pathExists(musicDB.playlistFolder))) {
      return { success: false, error: `Playlist folder not found: ${musicDB.playlistFolder}` };
    }

    const result = await musicDB.importExistingM3UFiles({ replace: true });
    console.log('🔄 M3U force re-import complete:', {
      processed: result.processed,
      matched: (result.playlists || []).reduce((n, r) => n + (r.matched || 0), 0),
    });
    return { success: true, ...result };
  } catch (error) {
    console.error('❌ Error in force M3U re-import:', error);
    return { success: false, error: error.message };
  }
});

// ============================================================================
// IPC HANDLERS - WINDOW CONTROLS
// ============================================================================

ipcMain.handle('window:minimize', () => {
  if (mainWindow) {
    mainWindow.minimize();
    console.log('✅ Window minimized');
    return { success: true };
  }
  console.error('❌ No main window available');
  return { success: false, error: 'No main window available' };
});

ipcMain.handle('window:maximize', () => {
  if (mainWindow) {
    const wasMaximized = mainWindow.isMaximized();

    if (wasMaximized) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }

    return {
      success: true,
      maximized: !wasMaximized,
    };
  }
  console.error('❌ No main window available');
  return { success: false, error: 'No main window available' };
});

ipcMain.handle('window:close', () => {
  if (mainWindow) {
    mainWindow.close();
    console.log('✅ Window closed');
    return { success: true };
  }
  console.error('❌ No main window available');
  return { success: false, error: 'No main window available' };
});

ipcMain.handle('window:is-maximized', () => {
  const result = mainWindow ? mainWindow.isMaximized() : false;
  return result;
});

ipcMain.handle('window:get-state', () => {
  if (mainWindow) {
    const state = {
      isMaximized: mainWindow.isMaximized(),
      isMinimized: mainWindow.isMinimized(),
      isFullScreen: mainWindow.isFullScreen(),
      bounds: mainWindow.getBounds(),
    };
    return state;
  }
  return null;
});

// ============================================================================
// IPC HANDLERS - ALBUM ART SYSTEM
// ============================================================================
async function imageToDataUrl(imagePath) {
  try {
    console.log(`🎨 Converting image to data URL: ${imagePath}`);

    // FIXED: Check if file exists first
    if (!(await fs.pathExists(imagePath))) {
      console.error(`❌ Image file does not exist: ${imagePath}`);
      return null;
    }

    // FIXED: Get file stats to check if it's actually a file
    const stats = await fs.stat(imagePath);
    if (!stats.isFile()) {
      console.error(`❌ Path is not a file: ${imagePath}`);
      return null;
    }

    console.log(`🎨 File exists and is valid: ${imagePath} (${stats.size} bytes)`);

    // Read the image file as buffer
    const imageBuffer = await fs.readFile(imagePath);

    // FIXED: Validate that we actually got image data
    if (!imageBuffer || imageBuffer.length === 0) {
      console.error(`❌ Empty or invalid image buffer for: ${imagePath}`);
      return null;
    }

    console.log(`🎨 Read image buffer: ${imageBuffer.length} bytes`);

    // Determine MIME type from file extension
    const ext = path.extname(imagePath).toLowerCase();
    let mimeType = 'image/jpeg'; // default

    switch (ext) {
      case '.png':
        mimeType = 'image/png';
        break;
      case '.webp':
        mimeType = 'image/webp';
        break;
      case '.gif':
        mimeType = 'image/gif';
        break;
      case '.bmp':
        mimeType = 'image/bmp';
        break;
      case '.jpg':
      case '.jpeg':
      default:
        mimeType = 'image/jpeg';
    }

    // FIXED: Validate image buffer starts with proper image magic bytes
    const isValidImage = validateImageBuffer(imageBuffer, ext);
    if (!isValidImage) {
      console.error(`❌ Invalid image format for: ${imagePath}`);
      return null;
    }

    // Convert to base64 data URL
    const base64Data = imageBuffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64Data}`;

    console.log(
      `✅ Successfully converted to data URL: ${path.basename(imagePath)} (${base64Data.length} base64 chars)`
    );
    console.log(`🎨 Data URL preview: ${dataUrl.substring(0, 100)}...`);

    return dataUrl;
  } catch (error) {
    console.error(`❌ Error converting image to data URL: ${error.message}`);
    console.error(`❌ Image path: ${imagePath}`);
    return null;
  }
}

// image validation function
function validateImageBuffer(buffer, fileExtension) {
  if (!buffer || buffer.length < 4) {
    return false;
  }

  // Check magic bytes for different image formats
  const firstBytes = buffer.subarray(0, 4);

  switch (fileExtension.toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      // JPEG magic bytes: FF D8 FF
      return firstBytes[0] === 0xff && firstBytes[1] === 0xd8 && firstBytes[2] === 0xff;

    case '.png':
      // PNG magic bytes: 89 50 4E 47
      return (
        firstBytes[0] === 0x89 &&
        firstBytes[1] === 0x50 &&
        firstBytes[2] === 0x4e &&
        firstBytes[3] === 0x47
      );

    case '.gif':
      // GIF magic bytes: 47 49 46 38
      return (
        firstBytes[0] === 0x47 &&
        firstBytes[1] === 0x49 &&
        firstBytes[2] === 0x46 &&
        firstBytes[3] === 0x38
      );

    case '.bmp':
      // BMP magic bytes: 42 4D
      return firstBytes[0] === 0x42 && firstBytes[1] === 0x4d;

    case '.webp':
      // WEBP is more complex, just check if it's not obviously wrong
      return buffer.length > 12;

    default:
      // For unknown formats, assume it's okay if it has some content
      return buffer.length > 10;
  }
}

// Get album art for a specific track
ipcMain.handle('albumArt:get-for-track', async (event, trackPath, album, artist) => {
  try {
    const musicFolder = await getSetting('musicFolder', null);
    const artPath = await resolveAlbumArt(trackPath, album, artist, musicFolder);

    if (artPath && (await fs.pathExists(artPath))) {
      console.log(`🎨 Converting art to data URL: ${path.basename(artPath)}`);

      // FIXED: Convert file to data URL instead of file:// URL
      const dataUrl = await imageToDataUrl(artPath);

      if (dataUrl) {
        console.log(`✅ Album art data URL created successfully`);
        return dataUrl;
      } else {
        console.warn(`⚠️ Failed to create data URL for: ${artPath}`);
        return null;
      }
    }

    console.log(`🎨 No album art file found`);
    return null;
  } catch (error) {
    console.error('❌ Error getting album art for track:', error);
    return null;
  }
});

// Get embedded artwork - returns data URL
ipcMain.handle('albumArt:get-embedded', async (event, filePath) => {
  try {
    const artPath = await extractEmbeddedArt(filePath);
    if (artPath && (await fs.pathExists(artPath))) {
      const dataUrl = await imageToDataUrl(artPath);
      return dataUrl;
    }
    return null;
  } catch (error) {
    console.error('❌ Error getting embedded artwork:', error);
    return null;
  }
});

// Find local cover in covers directory returns data URL
ipcMain.handle('albumArt:find-local-cover', async (event, album, artist) => {
  try {
    const musicFolder = await getSetting('musicFolder', null);
    if (!musicFolder) return null;

    const artPath = await findLocalCoverArt(musicFolder, album, artist);
    if (artPath && (await fs.pathExists(artPath))) {
      const dataUrl = await imageToDataUrl(artPath);
      return dataUrl;
    }
    return null;
  } catch (error) {
    console.error('❌ Error finding local cover:', error);
    return null;
  }
});

// Get sample cover fallback
ipcMain.handle('albumArt:get-sample-cover', async () => {
  try {
    const artPath = await pathManager.getCover('sample-cover.jpg');
    if (artPath && (await fs.pathExists(artPath))) {
      const dataUrl = await imageToDataUrl(artPath);
      return dataUrl;
    }
    return null;
  } catch (error) {
    logger.error('❌ Error getting sample cover:', error);
    return null;
  }
});

// Get asset image (for logos, icons, etc.)
ipcMain.handle('assets:get-image', async (event, imageName) => {
  try {
    const imagePath = await pathManager.getImage(imageName);
    if (imagePath) {
      const dataUrl = await imageToDataUrl(imagePath);
      if (dataUrl) {
        logger.debug(`🎨 Loaded asset image: ${imageName}`);
        return dataUrl;
      }
    }

    logger.warn(`⚠️ Asset image not found: ${imageName}`);
    return null;
  } catch (error) {
    logger.error(`❌ Error getting asset image ${imageName}:`, error.message);
    return null;
  }
});

// Get asset icon (for window icons, file type icons, etc.)
ipcMain.handle('assets:get-icon', async (event, iconName) => {
  try {
    const iconPath = await pathManager.getIcon(iconName);
    if (iconPath) {
      const dataUrl = await imageToDataUrl(iconPath);
      if (dataUrl) {
        logger.debug(`🎨 Loaded asset icon: ${iconName}`);
        return dataUrl;
      }
    }

    logger.warn(`⚠️ Asset icon not found: ${iconName}`);
    return null;
  } catch (error) {
    logger.error(`❌ Error getting asset icon ${iconName}:`, error.message);
    return null;
  }
});

// Get asset cover (for default album covers, placeholders, etc.)
ipcMain.handle('assets:get-cover', async (event, coverName) => {
  try {
    const coverPath = await pathManager.getCover(coverName);
    if (coverPath) {
      const dataUrl = await imageToDataUrl(coverPath);
      if (dataUrl) {
        logger.debug(`🎨 Loaded asset cover: ${coverName}`);
        return dataUrl;
      }
    }

    logger.warn(`⚠️ Asset cover not found: ${coverName}`);
    return null;
  } catch (error) {
    logger.error(`❌ Error getting asset cover ${coverName}:`, error.message);
    return null;
  }
});

// Clear album art cache
ipcMain.handle('albumArt:clear-cache', async () => {
  try {
    albumArtCache.clear();

    // Also clean up cached files
    const cacheDir = pathManager.getAlbumArtCachePath();
    if (await fs.pathExists(cacheDir)) {
      await fs.emptyDir(cacheDir);
    }

    logger.info('🧹 Album art cache cleared');
    return { success: true };
  } catch (error) {
    logger.error('❌ Error clearing album art cache:', error);
    return { success: false, error: error.message };
  }
});

// Get album art cache statistics
ipcMain.handle('albumArt:get-cache-stats', async () => {
  try {
    const cacheDir = pathManager.getAlbumArtCachePath();
    let cacheSize = 0;
    let fileCount = 0;

    if (await fs.pathExists(cacheDir)) {
      try {
        const files = await fs.readdir(cacheDir);
        fileCount = files.length;

        for (const file of files) {
          try {
            const filePath = path.join(cacheDir, file);
            const stats = await fs.stat(filePath);
            cacheSize += stats.size;
          } catch (error) {
            // Skip files we can't stat
            continue;
          }
        }
      } catch (error) {
        console.warn(`⚠️ Could not read cache directory: ${error.message}`);
      }
    }

    return {
      memoryEntries: albumArtCache.size,
      cachedFiles: fileCount,
      cacheSize: cacheSize,
      cacheSizeMB: (cacheSize / (1024 * 1024)).toFixed(2),
    };
  } catch (error) {
    console.error('❌ Error getting cache stats:', error);
    return {
      memoryEntries: 0,
      cachedFiles: 0,
      cacheSize: 0,
      cacheSizeMB: '0.00',
    };
  }
});

// ============================================================================
// IPC HANDLERS - FAVORITES SYSTEM
// ============================================================================

// Add track to favorites
ipcMain.handle('favorites:add', async (event, trackPath) => {
  try {
    console.log(`🌐 Main: Adding to favorites: ${trackPath}`);

    if (!musicDB) {
      return { success: false, error: 'Database not available' };
    }

    if (!trackPath) {
      return { success: false, error: 'No track path provided' };
    }

    const result = await musicDB.addToFavoritesByPath(trackPath);
    console.log(`🌐 Main: Add to favorites result:`, result);
    return result;
  } catch (error) {
    console.error('❌ Main: Error adding to favorites:', error);
    return { success: false, error: error.message };
  }
});

// Remove track from favorites
ipcMain.handle('favorites:remove', async (event, trackPath) => {
  try {
    console.log(`🌐 Main: Removing from favorites: ${trackPath}`);

    if (!musicDB) {
      return { success: false, error: 'Database not available' };
    }

    if (!trackPath) {
      return { success: false, error: 'No track path provided' };
    }

    const result = await musicDB.removeFromFavoritesByPath(trackPath);
    console.log(`🌐 Main: Remove from favorites result:`, result);
    return result;
  } catch (error) {
    console.error('❌ Main: Error removing from favorites:', error);
    return { success: false, error: error.message };
  }
});

// Toggle favorite status
ipcMain.handle('favorites:toggle', async (event, trackPath) => {
  try {
    console.log(`🌐 Main: Toggling favorite for: ${trackPath}`);

    if (!musicDB) {
      return { success: false, error: 'Database not available' };
    }

    if (!trackPath) {
      return { success: false, error: 'No track path provided' };
    }

    // CRITICAL FIX: Get fresh database state before deciding what to do
    console.log(`🌐 Main: Checking current database state...`);
    const currentlyFavorited = await musicDB.isFavoriteByPath(trackPath);
    console.log(
      `🌐 Main: Current state in database: ${currentlyFavorited ? 'favorited' : 'not favorited'}`
    );

    let result;
    if (currentlyFavorited) {
      // Track is favorited, remove it
      console.log(`🌐 Main: Removing from favorites...`);
      result = await musicDB.removeFromFavoritesByPath(trackPath);
      result.removed = result.success && (result.removed || result.changes > 0);
      result.added = false;
      console.log(`💔 Main: Remove operation result:`, result);
    } else {
      // Track is not favorited, add it
      console.log(`🌐 Main: Adding to favorites...`);
      result = await musicDB.addToFavoritesByPath(trackPath);
      result.added = result.success && result.added !== false;
      result.removed = false;
      console.log(`⭐ Main: Add operation result:`, result);
    }

    // VERIFICATION: Double-check the final state
    if (result.success) {
      setTimeout(async () => {
        const verifyState = await musicDB.isFavoriteByPath(trackPath);
        const expectedState = result.added || !result.removed;
        console.log(`🌐 Main: VERIFICATION - Expected: ${expectedState}, Actual: ${verifyState}`);

        if (verifyState !== expectedState) {
          console.error(
            `❌ Main: STATE MISMATCH DETECTED! Expected ${expectedState}, got ${verifyState}`
          );
        }
      }, 50);
    }

    console.log(`🌐 Main: Final toggle result:`, result);
    return result;
  } catch (error) {
    console.error('❌ Main: Error toggling favorite:', error);
    return { success: false, error: error.message };
  }
});

// Get all favorite tracks
ipcMain.handle('favorites:get-all', async (event, options = {}) => {
  try {
    if (!musicDB) {
      console.warn('⚠️ Database not available for favorites');
      return []; // Always return array
    }

    const favorites = await musicDB.getFavorites(
      options.limit || 1000,
      options.sortBy || 'added_at',
      options.sortOrder || 'DESC'
    );

    //Ensure we always return an array
    const result = Array.isArray(favorites) ? favorites : [];
    console.log(`🌐 Main: Retrieved ${result.length} favorite tracks`);
    return result;
  } catch (error) {
    console.error('❌ Main: Error getting favorites:', error);
    return []; // Always return array on error
  }
});

// Check if track is favorite
ipcMain.handle('favorites:is-favorite', async (event, trackPath) => {
  try {
    console.log(`🌐 Main: Checking if track is favorite: ${trackPath}`);

    if (!musicDB) {
      console.log(`🌐 Main: Database not available`);
      return false;
    }

    if (!trackPath) {
      console.log(`🌐 Main: No track path provided`);
      return false;
    }

    const isFav = await musicDB.isFavoriteByPath(trackPath);
    console.log(`🌐 Main: Track favorite status: ${isFav}`);
    return isFav;
  } catch (error) {
    console.error('❌ Main: Error checking favorite status:', error);
    return false;
  }
});

// Get favorites count
ipcMain.handle('favorites:get-count', async (event) => {
  try {
    if (!musicDB) {
      return 0;
    }

    const count = await musicDB.getFavoritesCount();
    return count;
  } catch (error) {
    console.error('❌ Main: Error getting favorites count:', error);
    return 0;
  }
});

// Clear all favorites
ipcMain.handle('favorites:clear', async (event) => {
  try {
    if (!musicDB) {
      return { success: false, error: 'Database not available' };
    }

    const result = await musicDB.clearFavorites();
    return result;
  } catch (error) {
    console.error('❌ Main: Error clearing favorites:', error);
    return { success: false, error: error.message };
  }
});

// ============================================================================
// IPC HANDLERS - RECENTLY PLAYED SYSTEM
// ============================================================================

// Add track to recently played
ipcMain.handle('recently-played:add', async (event, trackPath) => {
  try {
    console.log(`🌐 Main: Adding to recently played: ${trackPath}`);
    const result = await musicDB.addToRecentlyPlayedByPath(trackPath); // ✅ Correct variable name
    console.log(`🌐 Main: Recently played result:`, result);
    return result;
  } catch (error) {
    console.error('❌ Main: Error adding to recently played:', error);
    return { success: false, error: error.message };
  }
});

// In main.js, check this handler:
ipcMain.handle('recently-played:get-all', async (event, limit = 100) => {
  try {
    console.log(`🌐 Main: Getting recently played (limit: ${limit})`);
    const tracks = await musicDB.getRecentlyPlayed(limit); // ✅ Correct variable name
    console.log(`🌐 Main: Retrieved ${tracks.length} recently played tracks`);
    return tracks;
  } catch (error) {
    console.error('❌ Main: Error getting recently played:', error);
    return [];
  }
});

// Get recently played count
ipcMain.handle('recently-played:get-count', async (event) => {
  try {
    if (!musicDB) {
      return 0;
    }
    const count = await musicDB.getRecentlyPlayedCount();
    console.log(`🌐 Main: Recently played count: ${count}`);
    return count;
  } catch (error) {
    console.error('❌ Main: Error getting recently played count:', error);
    return 0;
  }
});

// Clear recently played history
ipcMain.handle('recently-played:clear', async (event) => {
  try {
    if (!musicDB) {
      return { success: false, error: 'Database not available' };
    }

    const result = await musicDB.clearRecentlyPlayed();
    console.log(`🌐 Main: Recently played cleared:`, result);
    return result;
  } catch (error) {
    console.error('❌ Main: Error clearing recently played:', error);
    return { success: false, error: error.message };
  }
});

// Get track statistics
ipcMain.handle('track:get-stats', async (event, trackPath) => {
  try {
    if (!musicDB) {
      return null;
    }

    const trackId = await musicDB.getTrackIdByPath(trackPath);
    if (!trackId) {
      return null;
    }

    const stats = await musicDB.getTrackStats(trackId);
    return stats;
  } catch (error) {
    console.error('❌ Main: Error getting track stats:', error);
    return null;
  }
});

// Debug API for playlist troubleshooting
ipcMain.handle('api:debug:playlist-tracks', async (event, playlistId) => {
  try {
    console.log(`🔍 Debugging playlist ${playlistId}...`);

    if (!musicDB) {
      return { error: 'Database not available' };
    }

    // Check playlist_tracks entries with LEFT JOIN to see missing tracks
    // (playlist_tracks keys on track_path since the M3U-backed rewrite — see Issue #17)
    const debugQuery = `
      SELECT
        pt.id as playlist_track_id,
        pt.playlist_id,
        pt.track_id,
        pt.track_path,
        pt.position,
        t.id as track_exists,
        t.path,
        t.title,
        t.artist
      FROM playlist_tracks pt
      LEFT JOIN tracks t ON pt.track_path = t.path
      WHERE pt.playlist_id = ?
      ORDER BY pt.position ASC
    `;

    const debugResult = musicDB.db.prepare(debugQuery).all(playlistId) || [];

    const validTracks = debugResult.filter((r) => r.track_exists);
    const missingTracks = debugResult.filter((r) => !r.track_exists);

    const diagnosis = {
      hasPlaylistTrackEntries: debugResult.length > 0,
      totalEntries: debugResult.length,
      validTracks: validTracks.length,
      missingTracks: missingTracks.length,
      missingTrackIds: missingTracks.map((m) => m.track_id),
      missingTrackPaths: missingTracks.map((m) => m.track_path),
    };

    console.log(
      `🔍 Main: Found ${debugResult.length} playlist entries, ${validTracks.length} valid, ${missingTracks.length} missing`
    );

    return {
      playlistId,
      playlistTracksCount: debugResult.length,
      validTracksCount: validTracks.length,
      missingTracksCount: missingTracks.length,
      sampleEntries: debugResult.slice(0, 5),
      diagnosis,
      solution:
        missingTracks.length > 0
          ? 'Clean up orphaned playlist_tracks entries or re-import M3U files'
          : 'Playlist structure looks correct',
    };
  } catch (error) {
    console.error('❌ Debug API error:', error);
    return { error: error.message };
  }
});

// Cleanup orphaned playlist tracks
ipcMain.handle('api:cleanup:orphaned-playlist-tracks', async (event) => {
  try {
    if (!musicDB) {
      return { error: 'Database not available' };
    }

    // Orphaned by legacy numeric FK (rows still carrying a track_id that no longer exists)...
    const byId = musicDB.db
      .prepare(`DELETE FROM playlist_tracks WHERE track_id IS NOT NULL AND track_id NOT IN (SELECT id FROM tracks)`)
      .run();
    // ...and orphaned by path (current FK — a track_path that matches no track on disk anymore)
    const byPath = musicDB.db
      .prepare(`DELETE FROM playlist_tracks WHERE track_path IS NOT NULL AND track_path NOT IN (SELECT path FROM tracks)`)
      .run();

    const result = { changes: byId.changes + byPath.changes };
    console.log(`🧹 Main: Cleaned up ${result.changes} orphaned playlist_tracks entries`);
    return { success: true, cleaned: result.changes };
  } catch (error) {
    console.error('❌ Main: Cleanup error:', error);
    return { error: error.message };
  }
});

// ============================================================================
// COVER FETCHER IPC HANDLERS
// ============================================================================

const coverFetcher = require('./server/cover-fetcher');

// Start cover fetching scan
ipcMain.handle('cover-fetcher:start-scan', async (event, options) => {
  try {
    logger.info('Cover fetcher scan started', options);

    // Get music folder from settings
    const musicFolder = await getSetting('musicFolder');
    if (!musicFolder) {
      logger.error('No music folder configured');
      return { success: false, error: 'No music folder configured. Please select a music folder in settings.' };
    }

    // Prepare covers path
    const coversPath = path.join(musicFolder, 'assets', 'covers');
    await fs.ensureDir(coversPath);

    // Progress callback to send updates to renderer
    const progressCallback = (data) => {
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('cover-fetcher:progress', data);
      }
    };

    // Run the scan with options
    const scanOptions = {
      musicDB,
      musicFolder,
      coversPath,
      downloadMissing: options.downloadMissing !== false,
      validateExisting: options.validateExisting !== false,
      batchSize: 5,
      requestDelay: 1000
    };

    const summary = await coverFetcher.scanAndFetchCovers(scanOptions, logger, progressCallback);

    logger.info('Cover fetcher scan completed', summary);
    return { success: true, summary };
  } catch (error) {
    logger.error('Cover fetcher scan error', { error: error.message });
    return { success: false, error: error.message };
  }
});

// ============================================================================
// LYRICS IPC HANDLERS
// ============================================================================

const { fetchLyricsFromLRCLIB } = require('./server/lyrics-fetcher');

// Returns { lyrics, source } for a track, plain text only (see
// docs/application/lyrics-feature.md). Order of preference:
//   1. Already in the DB (embedded tag found at scan time, or a prior LRCLIB hit) — no network call.
//   2. Already checked LRCLIB before and it came up empty (lyrics_fetched_at set, lyrics NULL) —
//      trust that answer, don't hit the API again every time the modal opens.
//   3. Never checked — fetch from LRCLIB now, cache the result (hit or miss) either way.
ipcMain.handle('lyrics:get-for-track', async (event, trackPath) => {
  if (!musicDB) {
    return { lyrics: null, source: null, error: 'Database not ready' };
  }

  try {
    const track = musicDB.getTrackByPath(trackPath);
    if (!track) {
      return { lyrics: null, source: null, error: 'Track not found' };
    }

    if (track.lyrics) {
      return { lyrics: track.lyrics, source: track.lyrics_source };
    }

    if (track.lyrics_fetched_at) {
      return { lyrics: null, source: null };
    }

    logger.info('Fetching lyrics from LRCLIB', { title: track.title, artist: track.artist });

    const fetched = await fetchLyricsFromLRCLIB({
      title: track.title,
      artist: track.artist,
      album: track.album,
      duration: track.duration,
    });

    musicDB.updateTrackLyrics(trackPath, { lyrics: fetched, source: fetched ? 'lrclib' : null });

    return { lyrics: fetched, source: fetched ? 'lrclib' : null };
  } catch (error) {
    logger.error('Error fetching lyrics for track', { error: error.message, trackPath });
    return { lyrics: null, source: null, error: error.message };
  }
});

// ============================================================================
// UTILITY FUNCTIONS - DATABASE HELPERS
// ============================================================================

// Backfill playlist_tracks.track_path for any legacy rows that still only carry a numeric
// track_id (the schema has shipped track_path as a first-class column since Issue #17's
// M3U-backed rewrite — this just heals rows written before that). Safe to run repeatedly.
async function performPlaylistMigration() {
  console.log('🔄 Backfilling playlist_tracks.track_path from track_id where missing...');

  // The column already exists in CREATE TABLE (server/database.js), but guard the ALTER
  // anyway in case this runs against an old on-disk DB file that predates it.
  try {
    musicDB.db.prepare('ALTER TABLE playlist_tracks ADD COLUMN track_path TEXT').run();
  } catch (alterErr) {
    // Expected once the column already exists: "duplicate column name: track_path"
    if (!/duplicate column/i.test(alterErr.message)) {
      throw alterErr;
    }
  }

  const backfill = musicDB.db.transaction(() => {
    return musicDB.db
      .prepare(
        `UPDATE playlist_tracks
         SET track_path = (
           SELECT path FROM tracks WHERE tracks.id = playlist_tracks.track_id
         )
         WHERE track_id IS NOT NULL AND track_path IS NULL`
      )
      .run();
  });

  const result = backfill();
  console.log(`✅ Playlist migration complete — backfilled ${result.changes} row(s)`);
  return { success: true, message: 'Playlists migrated to use file paths', backfilled: result.changes };
}

// ============================================================================
// UTILITY FUNCTIONS - SETTINGS MANAGEMENT
// ============================================================================
async function getSettings() {
  try {
    const data = await fs.readFile(settingsPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

async function saveSetting(key, value) {
  try {
    const settings = await getSettings();
    settings[key] = value;
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving setting:', error);
    return false;
  }
}

async function getSetting(key, defaultValue = null) {
  const settings = await getSettings();
  return settings[key] || defaultValue;
}

// ============================================================================
// UTILITY FUNCTIONS - MUSIC FOLDER SCANNING
// ============================================================================
async function scanMusicFolder(folderPath) {
  let totalFiles = 0;

  async function countFiles(dirPath) {
    try {
      const items = await fs.readdir(dirPath, { withFileTypes: true });

      for (const item of items) {
        const fullPath = path.join(dirPath, item.name);

        if (item.isDirectory()) {
          await countFiles(fullPath);
        } else if (item.isFile() && isSupportedAudioFile(item.name)) {
          totalFiles++;
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
  }

  await countFiles(folderPath);

  return { totalFiles };
}

async function buildFolderTree(rootPath, maxDepth = 8, currentDepth = 0) {
  if (currentDepth >= maxDepth) return [];

  try {
    const items = await fs.readdir(rootPath, { withFileTypes: true });
    const folders = [];

    for (const item of items) {
      if (item.isDirectory() && !item.name.startsWith('.')) {
        const folderPath = path.join(rootPath, item.name);

        try {
          // Count songs in this folder
          const songs = await getSongsInFolder(folderPath);
          const songCount = songs.length;

          // Get subfolders
          const children = await buildFolderTree(folderPath, maxDepth, currentDepth + 1);

          // Add total count from children
          const totalSongCount =
            songCount + children.reduce((total, child) => total + child.songCount, 0);

          folders.push({
            name: item.name,
            path: folderPath,
            songCount: totalSongCount,
            children: children,
          });
        } catch (error) {
          // Skip folders we can't access
        }
      }
    }

    // Sort folders alphabetically
    return folders.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    logger.error('Error building folder tree', { error: error.message });
    return [];
  }
}

async function getSongsInFolder(folderPath) {
  try {
    const items = await fs.readdir(folderPath, { withFileTypes: true });
    const songs = [];

    const audioFiles = items.filter((item) => item.isFile() && isSupportedAudioFile(item.name));

    for (const item of items) {
      if (item.isFile() && isSupportedAudioFile(item.name)) {
        const filePath = path.join(folderPath, item.name);

        try {
          const stats = await fs.stat(filePath);

          songs.push({
            name: item.name,
            path: filePath,
            size: stats.size,
            format: path.extname(item.name).slice(1).toUpperCase(),
            modified: stats.mtime,
          });
        } catch (error) {
          // Skip files we can't access
        }
      }
    }

    // Sort songs alphabetically
    return songs.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error('Error getting songs in folder:', error);
    return [];
  }
}

// Find local cover art in the covers directory
async function findLocalCoverArt(musicFolder, album, artist) {
  try {
    const coversDir = path.join(musicFolder, 'assets', 'covers');

    if (!(await fs.pathExists(coversDir))) {
      return null;
    }

    const supportedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif'];
    const possibleNames = [];

    if (album && album !== 'Unknown Album') {
      possibleNames.push(
        sanitizeFilename(album),
        sanitizeFilename(`${artist} - ${album}`),
        sanitizeFilename(`${album} (${artist})`),
        sanitizeFilename(`${album} - ${artist}`)
      );
    }

    if (artist && artist !== 'Unknown Artist') {
      possibleNames.push(sanitizeFilename(artist));
    }

    console.log(`🎨 Possible cover names to search:`, possibleNames);

    for (const baseName of possibleNames) {
      if (!baseName) continue;

      console.log(`🎨 Searching for base name: "${baseName}"`);

      for (const ext of supportedExtensions) {
        const coverPath = path.join(coversDir, `${baseName}${ext}`);

        console.log(`🎨 Checking: ${coverPath}`);

        try {
          if (await fs.pathExists(coverPath)) {
            const stats = await fs.stat(coverPath);
            if (stats.isFile() && stats.size > 0) {
              console.log(
                `✅ Found local cover: ${path.basename(coverPath)} (${stats.size} bytes)`
              );
              return coverPath;
            } else {
              console.log(
                `⚠️ File exists but is invalid: ${coverPath} (size: ${stats.size}, isFile: ${stats.isFile()})`
              );
            }
          }
        } catch (error) {
          console.log(`⚠️ Error checking ${coverPath}: ${error.message}`);
          continue;
        }
      }
    }

    // ALSO: List what files actually exist in the covers directory
    try {
      const existingFiles = await fs.readdir(coversDir);
      console.log(`🎨 Files that DO exist in covers directory:`, existingFiles);
    } catch (error) {
      console.log(`⚠️ Could not list covers directory: ${error.message}`);
    }

    console.log(`🎨 No local cover found for: "${album}" by "${artist}"`);
    return null;
  } catch (error) {
    console.error(`❌ Error finding local cover art:`, error.message);
    return null;
  }
}

// Note: getSampleCover() function removed - now using pathManager.getCover()

// Main function to resolve album art for a track
async function resolveAlbumArt(trackPath, album, artist, musicFolder) {
  try {
    const cacheKey = generateArtCacheKey(album, artist);

    if (albumArtCache.has(cacheKey)) {
      const cachedEntry = albumArtCache.get(cacheKey);
      if (isCacheValid(cachedEntry)) {
        try {
          // FIXED: Use proper fs-extra method
          if (await fs.pathExists(cachedEntry.path)) {
            console.log(`🎨 Using cached art: ${path.basename(cachedEntry.path)}`);
            return cachedEntry.path;
          }
        } catch (error) {
          albumArtCache.delete(cacheKey);
        }
      } else {
        albumArtCache.delete(cacheKey);
      }
    }

    let artPath = null;

    // FIXED: Use proper fs-extra method
    if (trackPath && (await fs.pathExists(trackPath))) {
      try {
        artPath = await extractEmbeddedArt(trackPath);
      } catch (error) {
        console.warn(`⚠️ Could not extract embedded art: ${error.message}`);
      }
    }

    if (!artPath && musicFolder) {
      try {
        artPath = await findLocalCoverArt(musicFolder, album, artist);
      } catch (error) {
        console.warn(`⚠️ Could not find local cover art: ${error.message}`);
      }
    }

    if (!artPath) {
      try {
        artPath = await pathManager.getCover('sample-cover.jpg');
      } catch (error) {
        console.warn(`⚠️ Could not get sample cover: ${error.message}`);
      }
    }

    if (artPath) {
      albumArtCache.set(cacheKey, {
        path: artPath,
        timestamp: Date.now(),
        source: artPath.includes('album-art-cache')
          ? 'embedded'
          : artPath.includes('covers')
            ? 'local'
            : 'sample',
      });

      console.log(`🎨 Album art resolved for "${album}" by "${artist}": ${path.basename(artPath)}`);
    }

    return artPath;
  } catch (error) {
    console.error(`❌ Error resolving album art:`, error.message);
    return null;
  }
}

function isSupportedAudioFile(filename) {
  const audioExtensions = ['.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg', '.wma'];
  const ext = path.extname(filename).toLowerCase();
  return audioExtensions.includes(ext);
}

// ============================================================================
// UTILITY FUNCTIONS - ALBUM ART HELPERS
// ============================================================================

// Sanitize filename for safe file system operations
function sanitizeFilename(filename) {
  if (!filename) return '';
  return filename
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 200);
}

// Generate cache key for album art
function generateArtCacheKey(album, artist) {
  const key = `${album || 'unknown'}-${artist || 'unknown'}`.toLowerCase();
  return crypto.createHash('md5').update(key).digest('hex');
}

// Check if album art cache entry is still valid
function isCacheValid(cacheEntry) {
  if (!cacheEntry || !cacheEntry.timestamp) return false;
  return Date.now() - cacheEntry.timestamp < CACHE_EXPIRY;
}

// ============================================================================
// ALBUM ART CORE FUNCTIONS
// ============================================================================

// Extract embedded artwork from audio file
async function extractEmbeddedArt(filePath) {
  try {
    console.log(`🎨 Extracting embedded art from: ${path.basename(filePath)}`);

    const mm = require('music-metadata');
    const metadata = await mm.parseFile(filePath);
    const picture = metadata.common.picture;

    if (picture && picture.length > 0) {
      const artData = picture[0];

      console.log(`🖼️ Found embedded art:`, {
        format: artData.format,
        dataSize: artData.data?.length || 'unknown',
        description: artData.description,
      });

      // FIXED: Validate image data before processing
      if (!artData.data || artData.data.length < 100) {
        console.error(`❌ Invalid or too small image data: ${artData.data?.length || 0} bytes`);
        return null;
      }

      // FIXED: Validate image format
      if (!artData.format || !artData.format.startsWith('image/')) {
        console.error(`❌ Invalid image format: ${artData.format}`);
        return null;
      }

      const cacheDir = await pathManager.ensureUserDataDir('album-art-cache');

      const fileHash = crypto.createHash('md5').update(filePath).digest('hex');

      let extension = 'jpg';
      if (artData.format) {
        if (artData.format.includes('png')) extension = 'png';
        else if (artData.format.includes('webp')) extension = 'webp';
        else if (artData.format.includes('gif')) extension = 'gif';
      }

      const cachedArtPath = path.join(cacheDir, `${fileHash}.${extension}`);

      // FIXED: Always write fresh data and validate the write
      try {
        await fs.writeFile(cachedArtPath, artData.data);
        console.log(
          `🎨 Embedded art cached: ${path.basename(cachedArtPath)} (${artData.data.length} bytes)`
        );

        // FIXED: Verify the cached file was written correctly
        const stats = await fs.stat(cachedArtPath);
        if (stats.size !== artData.data.length) {
          console.error(
            `❌ Cache write failed: expected ${artData.data.length} bytes, got ${stats.size} bytes`
          );
          return null;
        }

        console.log(`✅ Cache verification passed: ${stats.size} bytes`);
        return cachedArtPath;
      } catch (writeError) {
        console.error(`❌ Failed to write cached art: ${writeError.message}`);
        return null;
      }
    }

    console.log(`📷 No embedded art found in: ${path.basename(filePath)}`);
    return null;
  } catch (error) {
    console.error(`❌ Error extracting embedded art from ${filePath}:`, error.message);
    return null;
  }
}

logger.info('Que-Music main process loaded');
