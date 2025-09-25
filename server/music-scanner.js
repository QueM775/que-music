// server/music-scanner.js - Extract metadata using node-id3 (Electron-compatible)
const NodeID3 = require('node-id3');
const fs = require('fs').promises;
const path = require('path');
const { parseFile } = require('music-metadata');

class MusicScanner {
  constructor(database) {
    console.log('🔧 MusicScanner constructor called with database:', !!database);
    this.db = database;
    this.supportedFormats = ['.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg', '.wma'];
    this.scannedCount = 0;
    this.totalFiles = 0;
  }

  async scanFolder(folderPath, progressCallback = null) {
    console.log('🔍 Starting music library scan:', folderPath);
    console.log('🔍 Progress callback provided:', !!progressCallback);
    this.scannedCount = 0;

    // First, count total files
    this.totalFiles = await this.countAudioFiles(folderPath);
    console.log(`📊 Found ${this.totalFiles} audio files to scan`);

    if (this.totalFiles === 0) {
      console.log('⚠️ No audio files found in directory');
      if (progressCallback) {
        progressCallback({
          current: 0,
          total: 0,
          percentage: 100,
          currentFile: 'No audio files found',
          phase: 'completed',
        });
      }
      return [];
    }

    // Then scan and extract metadata
    const tracks = await this.scanDirectory(folderPath, progressCallback);

    console.log(`✅ Scan complete: ${tracks.length} tracks processed`);
    return tracks;
  }

  async countAudioFiles(dirPath) {
    let count = 0;

    try {
      const items = await fs.readdir(dirPath, { withFileTypes: true });

      for (const item of items) {
        const fullPath = path.join(dirPath, item.name);

        if (item.isDirectory() && !item.name.startsWith('.')) {
          count += await this.countAudioFiles(fullPath);
        } else if (item.isFile() && this.isSupportedAudioFile(item.name)) {
          count++;
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }

    return count;
  }

  async scanDirectory(dirPath, progressCallback = null) {
    const tracks = [];

    try {
      const items = await fs.readdir(dirPath, { withFileTypes: true });

      for (const item of items) {
        const fullPath = path.join(dirPath, item.name);

        if (item.isDirectory() && !item.name.startsWith('.')) {
          // Recursively scan subdirectories
          const subTracks = await this.scanDirectory(fullPath, progressCallback);
          tracks.push(...subTracks);
        } else if (item.isFile() && this.isSupportedAudioFile(item.name)) {
          // Extract metadata from audio file
          const trackData = await this.extractMetadata(fullPath);
          if (trackData) {
            tracks.push(trackData);
          }

          this.scannedCount++;

          // Report progress
          if (progressCallback) {
            const progressData = {
              current: this.scannedCount,
              total: this.totalFiles,
              currentFile: item.name,
              percentage: Math.round((this.scannedCount / this.totalFiles) * 100),
            };
            console.log('📈 Sending progress:', progressData);
            progressCallback(progressData);
          }

          // Log progress every 100 files
          if (this.scannedCount % 100 === 0) {
            console.log(`📄 Scanned ${this.scannedCount}/${this.totalFiles} files...`);
          }
        }
      }
    } catch (error) {
      console.error('Error scanning directory:', dirPath, error.message);
    }

    return tracks;
  }

  async extractMetadata(filePath) {
    try {
      const stats = await fs.stat(filePath);
      let metadata = null;
      let musicMetadata = null;

      // Use music-metadata for comprehensive metadata extraction INCLUDING DURATION
      try {
        musicMetadata = await parseFile(filePath, {
          duration: true, // ← This extracts duration!
          skipCovers: true, // Skip cover art for performance
        });
      } catch (mmError) {
        console.warn(`⚠️ music-metadata error for ${path.basename(filePath)}: ${mmError.message}`);
      }

      // For MP3 files, also use node-id3 as fallback
      if (path.extname(filePath).toLowerCase() === '.mp3') {
        try {
          metadata = NodeID3.read(filePath);
        } catch (id3Error) {
          console.warn(`⚠️ ID3 read error for ${path.basename(filePath)}: ${id3Error.message}`);
        }
      }

      // Extract basic info from filename if no metadata
      const filenameInfo = this.parseFilename(path.basename(filePath));

      const trackData = {
        path: filePath,
        filename: path.basename(filePath),
        title:
          musicMetadata?.common?.title ||
          metadata?.title ||
          filenameInfo.title ||
          this.getNameFromFilename(filePath),
        artist: musicMetadata?.common?.artist || metadata?.artist || filenameInfo.artist || null,
        album: musicMetadata?.common?.album || metadata?.album || null,
        year: musicMetadata?.common?.year || metadata?.year || null,
        genre: musicMetadata?.common?.genre?.[0] || metadata?.genre || null,
        // ✅ FIXED: Now extracts real duration instead of null
        duration: musicMetadata?.format?.duration
          ? Math.round(musicMetadata.format.duration)
          : null,
        filesize: stats.size,
        format: musicMetadata?.format?.container || path.extname(filePath).slice(1).toUpperCase(),
        bitrate: musicMetadata?.format?.bitrate ? Math.round(musicMetadata.format.bitrate) : null,
      };

      return trackData;
    } catch (error) {
      console.warn(`⚠️ Could not process file: ${path.basename(filePath)} - ${error.message}`);

      // Return basic file info if everything fails
      try {
        const stats = await fs.stat(filePath);
        const filenameInfo = this.parseFilename(path.basename(filePath));

        return {
          path: filePath,
          filename: path.basename(filePath),
          title: filenameInfo.title || this.getNameFromFilename(filePath),
          artist: filenameInfo.artist || null,
          album: null,
          year: null,
          genre: null,
          duration: null,
          filesize: stats.size,
          format: path.extname(filePath).slice(1).toUpperCase(),
          bitrate: null,
        };
      } catch (statError) {
        console.error(`❌ Could not read file: ${filePath}`);
        return null;
      }
    }
  }

  parseFilename(filename) {
    // Remove file extension
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');

    // Try to parse "Artist - Title" format
    const parts = nameWithoutExt.split(' - ');
    if (parts.length >= 2) {
      return {
        artist: parts[0].trim(),
        title: parts.slice(1).join(' - ').trim(),
      };
    }

    // Try to parse "Title Artist" format (like "song title artist.mp3")
    const words = nameWithoutExt.split(' ');
    if (words.length >= 2) {
      // Last word might be artist
      const lastWord = words[words.length - 1];
      if (lastWord.length > 2) {
        return {
          title: words.slice(0, -1).join(' ').trim(),
          artist: lastWord.trim(),
        };
      }
    }

    return {
      title: nameWithoutExt,
      artist: null,
    };
  }

  getNameFromFilename(filePath) {
    const filename = path.basename(filePath);
    // Remove file extension
    return filename.replace(/\.[^/.]+$/, '');
  }

  isSupportedAudioFile(filename) {
    const ext = path.extname(filename).toLowerCase();
    return this.supportedFormats.includes(ext);
  }

  async scanAndSaveToDatabase(folderPath, progressCallback = null) {
    console.log('🔍 Starting comprehensive library scan...');
    const tracks = await this.scanFolder(folderPath, progressCallback);

    if (tracks.length > 0) {
      console.log(`💾 Saving ${tracks.length} tracks to database...`);

      // Notify progress callback that we're saving to database
      if (progressCallback) {
        progressCallback({
          current: this.scannedCount,
          total: this.totalFiles,
          percentage: 100,
          currentFile: 'Saving to database...',
          phase: 'database',
        });
      }

      await this.db.addTracks(tracks);
      console.log('✅ Library scan and database update completed successfully');

      // Final completion notification
      if (progressCallback) {
        progressCallback({
          current: this.scannedCount,
          total: this.totalFiles,
          percentage: 100,
          currentFile: 'Scan complete!',
          phase: 'completed',
        });
      }
    } else {
      console.log('⚠️ No audio tracks found in the specified folder');

      if (progressCallback) {
        progressCallback({
          current: 0,
          total: 0,
          percentage: 100,
          currentFile: 'No tracks found',
          phase: 'completed',
        });
      }
    }

    return tracks.length;
  }
}

module.exports = MusicScanner;
