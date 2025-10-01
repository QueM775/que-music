// main.js - Clean Electron main process

const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');
const mm = require('music-metadata'); // Works with both v7 and v8

const MusicDatabase = require('./server/database');
const MusicScanner = require('./server/music-scanner');

// Initialize logger
const SimpleLogger = require('./simple-logger');
const logger = new SimpleLogger({
  appName: 'QueMusicMain',
  level: 'NONE', // Default to NONE - will be set from user settings
  compactMode: false,
  enableColors: true
});

// Enable console interception to route all console.* calls through logger
logger.enableConsoleReplacement();

// These will be initialized after app is ready
let settingsPath;
let dbPath;
let musicDB = null;
let musicScanner = null;

// Cache for album art paths
let albumArtCache = new Map();
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Keep a global reference of the window object
let mainWindow;

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  logger.warn('Another instance of Que-Music is already running. Exiting...');
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    logger.info('Second instance attempted to start - focusing existing window');
    // Someone tried to run a second instance, we should focus our window instead
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

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
      nodeIntegration: true,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'client', 'scripts', 'main-preload.js'),
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

// Disable hardware acceleration to prevent GPU crashes
app.disableHardwareAcceleration();

// App event handlers
app.whenReady().then(async () => {
  // Initialize paths now that app is ready
  settingsPath = path.join(app.getPath('userData'), 'settings.json');
  dbPath = path.join(app.getPath('userData'), 'music-library.db');

  // Load logging level from settings and apply to logger
  const logLevel = await getSetting('logLevel', 'NONE');
  logger.setLevel(logLevel);
  logger.info('App paths initialized', { settingsPath, dbPath, logLevel });

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
  return musicDB.getStats();
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

    return new Promise((resolve, reject) => {
      musicDB.db.run(
        `DELETE FROM playlist_tracks WHERE track_id NOT IN (SELECT id FROM tracks)`,
        function (err) {
          if (err) {
            reject(err);
          } else {
            console.log(`🧹 Cleaned up ${this.changes} orphaned playlist track references`);
            resolve({ success: true, cleaned: this.changes });
          }
        }
      );
    });
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
    const playlists = await musicDB.getAllPlaylists();
    return playlists;
  } catch (error) {
    console.error('❌ Error getting playlists:', error);
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

// Database debug IPC handler
ipcMain.handle('debug:playlist-tables', async (event, playlistId) => {
  try {
    console.log(`🧪 Debugging playlist tables for ID: ${playlistId}`);

    if (!musicDB) {
      return { error: 'Database not available' };
    }

    // Check 1: Playlist exists
    const playlist = await new Promise((resolve, reject) => {
      musicDB.db.get('SELECT * FROM playlists WHERE id = ?', [playlistId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    // Check 2: Playlist tracks entries
    const playlistTracksEntries = await new Promise((resolve, reject) => {
      musicDB.db.all(
        'SELECT * FROM playlist_tracks WHERE playlist_id = ?',
        [playlistId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    // Check 3: Sample tracks in tracks table
    const sampleTracks = await new Promise((resolve, reject) => {
      musicDB.db.all('SELECT id, path, title FROM tracks LIMIT 10', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    // Check 4: Join query that should work
    const joinResults = await new Promise((resolve, reject) => {
      musicDB.db.all(
        `
        SELECT 
          pt.playlist_id,
          pt.track_id,
          pt.position,
          t.id as actual_track_id,
          t.path,
          t.title,
          t.artist
        FROM playlist_tracks pt
        LEFT JOIN tracks t ON pt.track_id = t.id
        WHERE pt.playlist_id = ?
        ORDER BY pt.position ASC
      `,
        [playlistId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    // Check 5: Count total tracks and playlist_tracks
    const counts = await new Promise((resolve, reject) => {
      musicDB.db.get(
        `
        SELECT 
          (SELECT COUNT(*) FROM tracks) as total_tracks,
          (SELECT COUNT(*) FROM playlist_tracks) as total_playlist_tracks,
          (SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id = ?) as this_playlist_tracks
      `,
        [playlistId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

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

// Force re-import M3U files handler
ipcMain.handle('playlist:force-reimport-m3u', async (event) => {
  try {
    console.log('🔄 Force re-importing M3U files...');

    if (!musicDB) {
      return { error: 'Database not available' };
    }

    // Get music folder
    const savedMusicFolder = await getSetting('musicFolder', null);
    if (!savedMusicFolder) {
      return { error: 'No music folder set' };
    }

    const playlistFolder = path.join(savedMusicFolder, 'Playlists');

    // Check if playlist folder exists
    if (!(await fs.pathExists(playlistFolder))) {
      return { error: `Playlist folder not found: ${playlistFolder}` };
    }

    // Get M3U files
    const files = await fs.readdir(playlistFolder);
    const m3uFiles = files.filter((file) => file.toLowerCase().endsWith('.m3u'));

    console.log(`🔄 Found ${m3uFiles.length} M3U files to process`);

    let imported = 0;
    let errors = [];

    for (const m3uFile of m3uFiles) {
      try {
        const m3uPath = path.join(playlistFolder, m3uFile);
        const content = await fs.readFile(m3uPath, 'utf8');
        const playlistName = path.basename(m3uFile, '.m3u');

        console.log(`🔄 Processing M3U: ${playlistName}`);

        // Parse M3U content to get track paths
        const trackPaths = musicDB.parseM3UContent(content);
        console.log(`🔄 Found ${trackPaths.length} tracks in ${playlistName}`);

        if (trackPaths.length === 0) {
          console.log(`⚠️ No tracks in M3U file: ${playlistName}`);
          continue;
        }

        // Get or create playlist
        let playlist;
        try {
          playlist = await new Promise((resolve, reject) => {
            musicDB.db.get('SELECT * FROM playlists WHERE name = ?', [playlistName], (err, row) => {
              if (err) reject(err);
              else resolve(row);
            });
          });
        } catch (err) {
          errors.push(`Error getting playlist ${playlistName}: ${err.message}`);
          continue;
        }

        if (!playlist) {
          // Create playlist if it doesn't exist
          try {
            playlist = await musicDB.createPlaylist({
              name: playlistName,
              description: `Imported from ${m3uFile}`,
            });
            console.log(`✅ Created playlist: ${playlistName}`);
          } catch (err) {
            errors.push(`Error creating playlist ${playlistName}: ${err.message}`);
            continue;
          }
        } else {
          console.log(`📋 Using existing playlist: ${playlistName} (ID: ${playlist.id})`);

          // Clear existing tracks from playlist
          try {
            await new Promise((resolve, reject) => {
              musicDB.db.run(
                'DELETE FROM playlist_tracks WHERE playlist_id = ?',
                [playlist.id],
                (err) => {
                  if (err) reject(err);
                  else resolve();
                }
              );
            });
            console.log(`🧹 Cleared existing tracks from playlist: ${playlistName}`);
          } catch (err) {
            errors.push(`Error clearing playlist ${playlistName}: ${err.message}`);
            continue;
          }
        }

        // Add tracks to playlist
        let addedCount = 0;
        for (const trackPath of trackPaths) {
          try {
            // Find track in database by path
            const track = await new Promise((resolve, reject) => {
              musicDB.db.get('SELECT id FROM tracks WHERE path = ?', [trackPath], (err, row) => {
                if (err) reject(err);
                else resolve(row);
              });
            });

            if (track) {
              await musicDB.addTrackToPlaylist(playlist.id, track.id);
              addedCount++;
              console.log(`✅ Added track to ${playlistName}: ${path.basename(trackPath)}`);
            } else {
              console.warn(`⚠️ Track not found in database: ${trackPath}`);
            }
          } catch (error) {
            console.warn(`⚠️ Could not add track to playlist: ${trackPath}`, error.message);
          }
        }

        console.log(
          `✅ Successfully imported playlist "${playlistName}" with ${addedCount}/${trackPaths.length} tracks`
        );
        imported++;
      } catch (error) {
        errors.push(`Error processing ${m3uFile}: ${error.message}`);
        console.error(`❌ Error processing M3U file ${m3uFile}:`, error);
      }
    }

    const result = {
      success: true,
      processed: m3uFiles.length,
      imported,
      errors,
    };

    console.log('🔄 M3U re-import complete:', result);
    return result;
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
    const artPath = await getSampleCover();
    if (artPath && (await fs.pathExists(artPath))) {
      const dataUrl = await imageToDataUrl(artPath);
      return dataUrl;
    }
    return null;
  } catch (error) {
    console.error('❌ Error getting sample cover:', error);
    return null;
  }
});

// Clear album art cache
ipcMain.handle('albumArt:clear-cache', async () => {
  try {
    albumArtCache.clear();

    // Also clean up cached files
    const cacheDir = path.join(app.getPath('userData'), 'album-art-cache');
    if (await fs.pathExists(cacheDir)) {
      await fs.emptyDir(cacheDir);
    }

    console.log('🧹 Album art cache cleared');
    return { success: true };
  } catch (error) {
    console.error('❌ Error clearing album art cache:', error);
    return { success: false, error: error.message };
  }
});

// Get album art cache statistics
ipcMain.handle('albumArt:get-cache-stats', async () => {
  try {
    const cacheDir = path.join(app.getPath('userData'), 'album-art-cache');
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
    const debugQuery = `
      SELECT 
        pt.id as playlist_track_id,
        pt.playlist_id,
        pt.track_id,
        pt.position,
        t.id as track_exists,
        t.path,
        t.title,
        t.artist
      FROM playlist_tracks pt
      LEFT JOIN tracks t ON pt.track_id = t.id
      WHERE pt.playlist_id = ?
      ORDER BY pt.position ASC
    `;

    const debugResult = await new Promise((resolve, reject) => {
      musicDB.db.all(debugQuery, [playlistId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    const validTracks = debugResult.filter((r) => r.track_exists);
    const missingTracks = debugResult.filter((r) => !r.track_exists);

    const diagnosis = {
      hasPlaylistTrackEntries: debugResult.length > 0,
      totalEntries: debugResult.length,
      validTracks: validTracks.length,
      missingTracks: missingTracks.length,
      missingTrackIds: missingTracks.map((m) => m.track_id),
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

    const result = await new Promise((resolve, reject) => {
      musicDB.db.run(
        `DELETE FROM playlist_tracks 
         WHERE track_id NOT IN (SELECT id FROM tracks)`,
        function (err) {
          if (err) reject(err);
          else resolve({ changes: this.changes });
        }
      );
    });

    console.log(`🧹 Main: Cleaned up ${result.changes} orphaned playlist_tracks entries`);
    return { success: true, cleaned: result.changes };
  } catch (error) {
    console.error('❌ Main: Cleanup error:', error);
    return { error: error.message };
  }
});

// ============================================================================
// UTILITY FUNCTIONS - DATABASE HELPERS
// ============================================================================

// Perform playlist migration to use file paths (should be moved to database class)
async function performPlaylistMigration() {
  console.log('🔄 Starting playlist migration to use file paths...');

  return new Promise((resolve, reject) => {
    musicDB.db.serialize(() => {
      musicDB.db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          reject(err);
          return;
        }

        // Add track_path column if it doesn't exist
        musicDB.db.run('ALTER TABLE playlist_tracks ADD COLUMN track_path TEXT', (alterErr) => {
          // Ignore error if column already exists

          // Update existing records to use paths
          musicDB.db.run(
            `UPDATE playlist_tracks 
             SET track_path = (
               SELECT path FROM tracks WHERE tracks.id = playlist_tracks.track_id
             )
             WHERE track_id IS NOT NULL AND track_path IS NULL`,
            (updateErr) => {
              if (updateErr) {
                musicDB.db.run('ROLLBACK');
                reject(updateErr);
                return;
              }

              musicDB.db.run('COMMIT', (commitErr) => {
                if (commitErr) {
                  musicDB.db.run('ROLLBACK');
                  reject(commitErr);
                } else {
                  console.log('✅ Playlist migration complete');
                  resolve({ success: true, message: 'Playlists migrated to use file paths' });
                }
              });
            }
          );
        });
      });
    });
  });
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

// Get fallback sample cover
async function getSampleCover() {
  try {
    const possiblePaths = [
      path.join(__dirname, 'assets', 'covers', 'sample-cover.jpg'),
      path.join(__dirname, '..', 'assets', 'covers', 'sample-cover.jpg'),
      path.join(process.resourcesPath, 'assets', 'covers', 'sample-cover.jpg'),
      path.join(app.getAppPath(), 'assets', 'covers', 'sample-cover.jpg'),
    ];

    for (const sampleCoverPath of possiblePaths) {
      try {
        // FIXED: Use proper fs-extra method
        if (await fs.pathExists(sampleCoverPath)) {
          const stats = await fs.stat(sampleCoverPath);
          if (stats.isFile()) {
            console.log(`🎨 Using sample cover: ${sampleCoverPath}`);
            return sampleCoverPath;
          }
        }
      } catch (error) {
        continue;
      }
    }

    console.warn(`⚠️ Sample cover not found - will show placeholder instead`);
    return null;
  } catch (error) {
    console.error(`❌ Error getting sample cover:`, error.message);
    return null;
  }
}

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
        artPath = await getSampleCover();
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

      const cacheDir = path.join(app.getPath('userData'), 'album-art-cache');
      await fs.ensureDir(cacheDir);

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
