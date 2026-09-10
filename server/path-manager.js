/**
 * Path Manager Module
 *
 * Centralized path resolution for all application resources.
 * Handles dynamic path resolution for both development and production environments.
 *
 * This module solves the problem of hardcoded paths by providing a single source
 * of truth for all file locations in the application.
 *
 * @module PathManager
 * @version 1.0.0
 * @date 2025-10-03
 */

const path = require('path');
const fs = require('fs-extra');

/**
 * PathManager Class
 *
 * Provides centralized, dynamic path resolution for all application resources.
 * Works in both development and production (packaged) environments.
 */
class PathManager {
  /**
   * Initialize the Path Manager
   * @param {Electron.App} app - Electron app instance
   * @param {Object} logger - Logger instance
   */
  constructor(app, logger = console) {
    this.app = app;
    this.logger = logger;
    this.isDevelopment = !app.isPackaged;
    this.isProduction = app.isPackaged;

    // Cache resolved paths for performance
    this._pathCache = new Map();

    // Initialize path roots
    this._initializeRoots();

    this.logger.info('🗂️ Path Manager initialized', {
      isDevelopment: this.isDevelopment,
      isProduction: this.isProduction,
      appPath: this.roots.app,
      userData: this.roots.userData
    });
  }

  /**
   * Initialize root directory paths
   * @private
   */
  _initializeRoots() {
    this.roots = {
      // Application installation directory (read-only in production)
      app: this.app.getAppPath(),

      // User data directory (writable)
      userData: this.app.getPath('userData'),

      // Temp directory
      temp: this.app.getPath('temp'),

      // Documents directory
      documents: this.app.getPath('documents'),

      // Desktop directory
      desktop: this.app.getPath('desktop'),

      // Resources directory (for packaged apps)
      resources: process.resourcesPath || this.app.getAppPath(),
    };
  }

  /**
   * Resolve asset path with multi-location fallback
   * @param {string} assetType - Type of asset (images, icons, covers)
   * @param {string} fileName - Name of the file
   * @returns {Promise<string|null>} Resolved path or null if not found
   */
  async resolveAsset(assetType, fileName) {
    const cacheKey = `asset:${assetType}:${fileName}`;

    // Check cache first
    if (this._pathCache.has(cacheKey)) {
      return this._pathCache.get(cacheKey);
    }

    // Define possible locations to check (in order of preference)
    const possiblePaths = [
      // Development paths
      path.join(__dirname, '..', 'assets', assetType, fileName),

      // Production paths (extraResources copies to resources/{assetType} directly)
      path.join(this.roots.resources, assetType, fileName),
      path.join(this.roots.resources, 'assets', assetType, fileName),
      path.join(this.roots.app, 'assets', assetType, fileName),
      path.join(__dirname, 'assets', assetType, fileName),

      // Alternative locations
      path.join(process.cwd(), 'assets', assetType, fileName),
    ];

    // Try each possible path
    for (const assetPath of possiblePaths) {
      try {
        if (await fs.pathExists(assetPath)) {
          const stats = await fs.stat(assetPath);
          if (stats.isFile()) {
            this._pathCache.set(cacheKey, assetPath);
            this.logger.debug(`✓ Asset resolved: ${assetType}/${fileName} -> ${assetPath}`);
            return assetPath;
          }
        }
      } catch (error) {
        // Continue to next path
        continue;
      }
    }

    this.logger.warn(`⚠️ Asset not found: ${assetType}/${fileName}`, {
      searchedPaths: possiblePaths.length
    });

    return null;
  }

  /**
   * Get path to an image asset
   * @param {string} imageName - Name of the image file
   * @returns {Promise<string|null>} Resolved path or null
   */
  async getImage(imageName) {
    return this.resolveAsset('images', imageName);
  }

  /**
   * Get path to an icon asset
   * @param {string} iconName - Name of the icon file
   * @returns {Promise<string|null>} Resolved path or null
   */
  async getIcon(iconName) {
    return this.resolveAsset('icons', iconName);
  }

  /**
   * Get path to a cover image asset
   * @param {string} coverName - Name of the cover file
   * @returns {Promise<string|null>} Resolved path or null
   */
  async getCover(coverName) {
    return this.resolveAsset('covers', coverName);
  }

  /**
   * Get path in user data directory
   * @param {...string} pathSegments - Path segments to join
   * @returns {string} Full path in userData directory
   */
  getUserDataPath(...pathSegments) {
    return path.join(this.roots.userData, ...pathSegments);
  }

  /**
   * Get database path
   * @param {string} dbName - Database filename (default: music-library.db)
   * @returns {string} Full database path
   */
  getDatabasePath(dbName = 'music-library.db') {
    return this.getUserDataPath(dbName);
  }

  /**
   * Get settings file path
   * @param {string} settingsName - Settings filename (default: settings.json)
   * @returns {string} Full settings path
   */
  getSettingsPath(settingsName = 'settings.json') {
    return this.getUserDataPath(settingsName);
  }

  /**
   * Get album art cache directory path
   * @returns {string} Album art cache directory path
   */
  getAlbumArtCachePath() {
    return this.getUserDataPath('album-art-cache');
  }

  /**
   * Get logs directory path
   * @returns {string} Logs directory path
   */
  getLogsPath() {
    return this.getUserDataPath('logs');
  }

  /**
   * Get preload script path
   * @returns {string} Preload script path
   */
  getPreloadPath() {
    const possiblePaths = [
      path.join(__dirname, '..', 'client', 'scripts', 'main-preload.js'),
      path.join(this.roots.app, 'client', 'scripts', 'main-preload.js'),
      path.join(this.roots.resources, 'client', 'scripts', 'main-preload.js'),
    ];

    // Return first existing path (sync for window creation)
    for (const preloadPath of possiblePaths) {
      try {
        if (fs.pathExistsSync(preloadPath)) {
          return preloadPath;
        }
      } catch (error) {
        continue;
      }
    }

    // Fallback to first path if none found
    return possiblePaths[0];
  }

  /**
   * Ensure directory exists, create if necessary
   * @param {...string} pathSegments - Path segments
   * @returns {Promise<string>} Full path to directory
   */
  async ensureUserDataDir(...pathSegments) {
    const dirPath = this.getUserDataPath(...pathSegments);
    await fs.ensureDir(dirPath);
    return dirPath;
  }

  /**
   * Clear path cache (useful after app updates)
   */
  clearCache() {
    this._pathCache.clear();
    this.logger.debug('🧹 Path cache cleared');
  }

  /**
   * Get diagnostic information about paths
   * @returns {Object} Path diagnostics
   */
  getDiagnostics() {
    return {
      environment: {
        isDevelopment: this.isDevelopment,
        isProduction: this.isProduction,
        platform: process.platform,
        cwd: process.cwd(),
        __dirname: __dirname,
      },
      roots: this.roots,
      cache: {
        size: this._pathCache.size,
        keys: Array.from(this._pathCache.keys()),
      },
      paths: {
        database: this.getDatabasePath(),
        settings: this.getSettingsPath(),
        albumArtCache: this.getAlbumArtCachePath(),
        logs: this.getLogsPath(),
        preload: this.getPreloadPath(),
      }
    };
  }

  /**
   * Log path diagnostics (useful for debugging)
   */
  logDiagnostics() {
    const diagnostics = this.getDiagnostics();
    this.logger.info('🔍 Path Manager Diagnostics:', diagnostics);
  }
}

module.exports = PathManager;
