// client/scripts/main-preload.js - Main preload script for secure API bridge
const { contextBridge, ipcRenderer } = require('electron');

// Expose secure API to renderer process
contextBridge.exposeInMainWorld('queMusicAPI', {
  // ============================================================================
  // APPLICATION INFORMATION
  // ============================================================================
  app: {
    getName: () => ipcRenderer.invoke('app:get-name'),
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    rendererReady: () => ipcRenderer.invoke('app:renderer-ready'),
  },

  // ============================================================================
  // SYSTEM INFORMATION
  // ============================================================================
  system: {
    platform: process.platform,
    isDev: process.argv.includes('--dev'),
    versions: {
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
    },
  },

  // ============================================================================
  // FILE SYSTEM OPERATIONS
  // ============================================================================
  files: {
    selectMusicFolder: () => ipcRenderer.invoke('files:select-music-folder'),
    getFolderTree: (folderPath) => ipcRenderer.invoke('files:get-folder-tree', folderPath),
    getSongsInFolder: (folderPath) => ipcRenderer.invoke('files:get-songs-in-folder', folderPath),
  },

  // ============================================================================
  // SETTINGS MANAGEMENT
  // ============================================================================
  settings: {
    getMusicFolder: () => ipcRenderer.invoke('settings:get-music-folder'),
    setMusicFolder: (path) => ipcRenderer.invoke('settings:set-music-folder', path),

    getPlayerState: () => ipcRenderer.invoke('settings:get-player-state'),
    setPlayerState: (state) => ipcRenderer.invoke('settings:set-player-state', state),
  },

  // ============================================================================
  // WINDOW CONTROLS
  // ============================================================================
  window: {
    minimize: () => {
      // console.log('📤 Calling window:minimize');
      return ipcRenderer.invoke('window:minimize');
    },
    maximize: () => {
      // console.log('📤 Calling window:maximize');
      return ipcRenderer.invoke('window:maximize');
    },
    close: () => {
      // console.log('📤 Calling window:close');
      return ipcRenderer.invoke('window:close');
    },
    isMaximized: () => {
      // console.log('📤 Calling window:is-maximized');
      return ipcRenderer.invoke('window:is-maximized');
    },
    getState: () => {
      // console.log('📤 Calling window:get-state');
      return ipcRenderer.invoke('window:get-state');
    },
  },

  // ============================================================================
  // PLAYLIST MANAGEMENT
  // ============================================================================
  playlists: {
    create: (playlistData) => ipcRenderer.invoke('playlist:create', playlistData),
    getAll: () => ipcRenderer.invoke('playlist:get-all'),
    getById: (playlistId) => ipcRenderer.invoke('playlist:get-by-id', playlistId),
    addTrack: (playlistId, trackId) =>
      ipcRenderer.invoke('playlist:add-track', { playlistId, trackId }),
    removeTrack: (playlistId, trackId) =>
      ipcRenderer.invoke('playlist:remove-track', { playlistId, trackId }),
    reorderTracks: (playlistId, trackId, newPosition) =>
      ipcRenderer.invoke('playlist:reorder-tracks', { playlistId, trackId, newPosition }),
    update: (playlistData) => ipcRenderer.invoke('playlist:update', playlistData),
    delete: (playlistId) => ipcRenderer.invoke('playlist:delete', playlistId),
    //  M3U file management methods
    setFolder: (musicFolderPath) => ipcRenderer.invoke('playlist:set-folder', musicFolderPath),
    getFolder: () => ipcRenderer.invoke('playlist:get-folder'),
    importM3U: (m3uFilePath) => ipcRenderer.invoke('playlist:import-m3u', m3uFilePath),
    exportM3U: (playlistId) => ipcRenderer.invoke('playlist:export-m3u', playlistId),
    forceReimportM3U: () => ipcRenderer.invoke('playlist:force-reimport-m3u'),
  },

  // ============================================================================
  // DATABASE OPERATIONS
  // ============================================================================
  database: {
    getStats: () => ipcRenderer.invoke('database:get-stats'),
    searchTracks: (query) => ipcRenderer.invoke('database:search-tracks', query),
    getAllTracks: () => ipcRenderer.invoke('database:get-all-tracks'),

    getAllArtists: () => ipcRenderer.invoke('database:get-all-artists'),
    getAllAlbums: () => ipcRenderer.invoke('database:get-all-albums'),
    getTracksByArtist: (artist) => ipcRenderer.invoke('database:get-tracks-by-artist', artist),
    getTracksByAlbum: (album, artist) =>
      ipcRenderer.invoke('database:get-tracks-by-album', album, artist),

    getTrackByPath: (path) => ipcRenderer.invoke('database:getTrackByPath', path),
    getGenreStats: () => ipcRenderer.invoke('database:get-genre-stats'),
    getYearStats: () => ipcRenderer.invoke('database:get-year-stats'),
    checkDuplicates: () => ipcRenderer.invoke('database:check-duplicates'),
    updateDurations: () => ipcRenderer.invoke('database:updateDurations'),
    populateFromTracks: () => ipcRenderer.invoke('database:populateFromTracks'),
    getRecentlyPlayed: (limit) => ipcRenderer.invoke('database:get-recently-played', limit || 50),
    migratePlaylistsToUsePaths: () => ipcRenderer.invoke('database-migrate-playlists'),
    cleanupOrphanedPlaylistTracks: () => ipcRenderer.invoke('database-cleanup-orphaned-playlists'),

    // Database cleanup and validation
    cleanup: () => ipcRenderer.invoke('database:cleanup'),
    validatePaths: () => ipcRenderer.invoke('database:validate-paths'),
  },

  // ============================================================================
  // MUSIC SCANNER
  // ============================================================================
  scanner: {
    scanLibrary: (folderPath) => ipcRenderer.invoke('scanner:scan-library', folderPath),
    onProgress: (callback) => {
      // Remove any existing progress listeners to prevent duplicates
      ipcRenderer.removeAllListeners('scanner:progress');
      ipcRenderer.on('scanner:progress', (event, progress) => callback(progress));
    },
  },

  // ============================================================================
  // FAVORITES SYSTEM
  // ============================================================================
  favorites: {
    /**
     * Add track to favorites
     */
    add: (trackPath) => ipcRenderer.invoke('favorites:add', trackPath),

    /**
     * Remove track from favorites
     */
    remove: (trackPath) => ipcRenderer.invoke('favorites:remove', trackPath),

    /**
     * Toggle favorite status of a track
     */
    toggle: (trackPath) => ipcRenderer.invoke('favorites:toggle', trackPath),

    /**
     * Get all favorite tracks
     */
    getAll: (options = {}) => ipcRenderer.invoke('favorites:get-all', options),

    /**
     * Check if a track is in favorites
     */
    isFavorite: (trackPath) => ipcRenderer.invoke('favorites:is-favorite', trackPath),

    /**
     * Get total count of favorite tracks
     */
    getCount: () => ipcRenderer.invoke('favorites:get-count'),

    /**
     * Clear all favorites
     */
    clear: () => ipcRenderer.invoke('favorites:clear'),
  },

  // ============================================================================
  // RECENTLY PLAYED SYSTEM
  // ============================================================================
  recentlyPlayed: {
    /**
     * Add track to recently played
     */
    add: (trackPath) => ipcRenderer.invoke('recently-played:add', trackPath),

    /**
     * Get recently played tracks
     */

    // getAll: (limit = 100) => ipcRenderer.invoke('recently-played:get-all', limit),
    getAll: (limit = 100) => {
      console.log(`🌐 API: Getting recently played (limit: ${limit})`);
      return ipcRenderer.invoke('recently-played:get-all', limit);
    },
    /**
     * Get count of recently played tracks
     */
    getCount: () => ipcRenderer.invoke('recently-played:get-count'),

    /**
     * Clear recently played history
     */
    clear: () => ipcRenderer.invoke('recently-played:clear'),
  },

  // ============================================================================
  // TRACK STATISTICS
  // ============================================================================
  track: {
    /**
     * Get track statistics (play count, favorite status, etc.)
     */
    getStats: (trackPath) => ipcRenderer.invoke('track:get-stats', trackPath),
  },

  // ============================================================================
  // ALBUM ART SYSTEM
  // ============================================================================
  albumArt: {
    /**
     * Get album art for a specific track
     */
    getForTrack: (trackPath, album, artist) =>
      ipcRenderer.invoke('albumArt:get-for-track', trackPath, album, artist),

    /**
     * Get embedded artwork from audio file
     */
    getEmbedded: (filePath) => ipcRenderer.invoke('albumArt:get-embedded', filePath),

    /**
     * Find local cover art in covers directory
     */
    findLocalCover: (album, artist) =>
      ipcRenderer.invoke('albumArt:find-local-cover', album, artist),

    /**
     * Get sample cover fallback
     */
    getSampleCover: () => ipcRenderer.invoke('albumArt:get-sample-cover'),

    /**
     * Clear album art cache
     */
    clearCache: () => ipcRenderer.invoke('albumArt:clear-cache'),

    /**
     * Get album art cache statistics
     */
    getCacheStats: () => ipcRenderer.invoke('albumArt:get-cache-stats'),
  },

  // ============================================================================
  // DEBUG UTILITIES
  // ============================================================================
  debug: {
    playlistTables: (playlistId) => ipcRenderer.invoke('api:debug:playlist-tracks', playlistId),
    cleanup: () => ipcRenderer.invoke('api:cleanup:orphaned-playlist-tracks'),
  },

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================
  log: (message) => console.log('[Renderer]:', message),
});

console.log('🔒 Preload script loaded - API bridge ready');
