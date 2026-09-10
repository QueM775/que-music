// server/cover-fetcher.js
// Album cover fetching functionality for Que-Music
// Adapted from Album Art Fetcher with Que-Music integration

const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const mm = require('music-metadata');

// Lazy load fetch to handle native fetch vs node-fetch
async function getFetch() {
  if (typeof fetch === 'undefined') {
    const { default: nodeFetch } = await import('node-fetch');
    return nodeFetch;
  }
  return fetch;
}

// Sanitize filenames for safe saving
function safeFilename(str) {
  if (!str) return 'unknown';
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/(^-|-$)/g, '')
    .trim();
}

// Calculate file hash for duplicate detection
async function calculateFileHash(filePath) {
  try {
    const fileBuffer = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  } catch (err) {
    throw new Error(`Failed to calculate hash for ${path.basename(filePath)}: ${err.message}`);
  }
}

// Validate image file with magic byte verification
async function validateImageFile(filePath) {
  try {
    const stats = await fs.stat(filePath);

    // Check file size (must be at least 1KB, less than 10MB)
    if (stats.size < 1024) {
      return { valid: false, reason: 'File too small (< 1KB)' };
    }
    if (stats.size > 10 * 1024 * 1024) {
      return { valid: false, reason: 'File too large (> 10MB)' };
    }

    // Check file extension
    const ext = path.extname(filePath).toLowerCase();
    if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
      return { valid: false, reason: 'Invalid file extension' };
    }

    // Read first few bytes to verify image format (magic bytes)
    const buffer = await fs.readFile(filePath, { encoding: null, start: 0, end: 10 });

    // JPEG magic bytes: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      return { valid: true, format: 'JPEG', size: stats.size };
    }

    // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      return { valid: true, format: 'PNG', size: stats.size };
    }

    return { valid: false, reason: 'Invalid image format (corrupted magic bytes)' };
  } catch (err) {
    return { valid: false, reason: `Validation error: ${err.message}` };
  }
}

// Check for existing cover with same content (duplicate detection)
async function findDuplicateCover(imageBuffer, coversDirectory) {
  try {
    const newImageHash = crypto.createHash('sha256').update(imageBuffer).digest('hex');
    const existingFiles = await fs.readdir(coversDirectory);

    for (const file of existingFiles) {
      const ext = path.extname(file).toLowerCase();
      if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
        continue;
      }

      const filePath = path.join(coversDirectory, file);
      try {
        const existingHash = await calculateFileHash(filePath);
        if (existingHash === newImageHash) {
          const validation = await validateImageFile(filePath);
          if (validation.valid) {
            return {
              isDuplicate: true,
              existingFile: filePath,
              fileName: file,
              format: validation.format,
              size: validation.size
            };
          }
        }
      } catch (err) {
        // Continue checking other files if one fails
        continue;
      }
    }

    return { isDuplicate: false };
  } catch (err) {
    // If duplicate detection fails, continue without it
    return { isDuplicate: false };
  }
}

// Sleep function for rate limiting
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Cache to prevent duplicate API requests for the same MBID
const mbidCache = new Map();
const coverArtCache = new Map();

// Search MusicBrainz for album MBID
async function searchMusicBrainzReleaseGroup(artist, album, logger) {
  const cacheKey = `${artist}-${album}`.toLowerCase();

  // Check cache first
  if (mbidCache.has(cacheKey)) {
    return mbidCache.get(cacheKey);
  }

  const query = `https://musicbrainz.org/ws/2/release-group/?query=artist:${encodeURIComponent(
    artist
  )}%20AND%20release:${encodeURIComponent(album)}&fmt=json`;

  try {
    const fetchFn = await getFetch();
    const res = await fetchFn(query, {
      headers: {
        'User-Agent': 'Que-Music/3.1.6 (cover-fetcher)',
      },
      timeout: 10000, // 10 second timeout
    });

    if (!res.ok) {
      logger.warn(`MusicBrainz API error: ${res.status} for ${artist} - ${album}`);
      mbidCache.set(cacheKey, null);
      return null;
    }

    const data = await res.json();
    const mbid = data['release-groups']?.[0]?.id || null;

    // Cache result (even if null)
    mbidCache.set(cacheKey, mbid);
    return mbid;
  } catch (err) {
    logger.error(`MusicBrainz search failed for ${artist} - ${album}`, { error: err.message });
    mbidCache.set(cacheKey, null);
    return null;
  }
}

// Get cover image from Cover Art Archive
async function fetchCoverArtArchiveImage(mbid, logger) {
  // Check cache first to avoid duplicate requests
  if (coverArtCache.has(mbid)) {
    return coverArtCache.get(mbid);
  }

  const url = `https://coverartarchive.org/release-group/${mbid}/front-500.jpg`;

  try {
    const fetchFn = await getFetch();
    const res = await fetchFn(url, {
      timeout: 15000, // 15 second timeout for images
    });

    if (!res.ok) {
      if (res.status === 404) {
        // 404 is expected for missing covers - cache and return null
        coverArtCache.set(mbid, null);
        return null;
      }
      logger.warn(`Cover Art Archive error: ${res.status} for MBID ${mbid}`);
      coverArtCache.set(mbid, null);
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Validate that we got a real image
    if (!buffer || buffer.length < 1024) {
      logger.warn(`Downloaded cover art is too small for MBID ${mbid}`);
      coverArtCache.set(mbid, null);
      return null;
    }

    // Cache successful result
    coverArtCache.set(mbid, buffer);
    return buffer;
  } catch (err) {
    // Cache null result for any fetch error
    coverArtCache.set(mbid, null);

    // Only log non-404 errors to reduce console noise
    if (!err.message?.includes('404')) {
      logger.error(`Cover Art Archive fetch failed for MBID ${mbid}`, { error: err.message });
    }
    return null;
  }
}

// Main function to scan and fetch covers for music library
async function scanAndFetchCovers(options, logger, progressCallback) {
  const {
    musicDB,
    musicFolder,
    coversPath,
    downloadMissing = true,
    validateExisting = true,
    batchSize = 5,
    requestDelay = 1000,
  } = options;

  logger.info('Starting cover fetch scan', { musicFolder, downloadMissing, validateExisting });

  // Get all tracks from database
  const tracks = await musicDB.getAllTracks();
  if (!tracks || tracks.length === 0) {
    logger.warn('No tracks found in database');
    return {
      totalTracks: 0,
      processed: 0,
      embedded: 0,
      downloaded: 0,
      validated: 0,
      cleaned: 0,
      duplicates: 0,
      failed: 0
    };
  }

  logger.info(`Found ${tracks.length} tracks to process`);

  // Ensure covers directory exists
  await fs.ensureDir(coversPath);

  let countEmbedded = 0;
  let countDownloaded = 0;
  let countValidated = 0;
  let countCleaned = 0;
  let countDuplicates = 0;
  let countFailed = 0;

  // Notify initial progress
  if (progressCallback) {
    progressCallback({
      type: 'init',
      totalFiles: tracks.length
    });
  }

  // Process tracks in batches
  const batches = [];
  for (let i = 0; i < tracks.length; i += batchSize) {
    batches.push(tracks.slice(i, i + batchSize));
  }

  logger.info(`Processing ${tracks.length} tracks in ${batches.length} batches`);

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    logger.debug(`Starting batch ${batchIndex + 1}/${batches.length}`);

    let networkRequestsInBatch = 0;

    for (let i = 0; i < batch.length; i++) {
      const track = batch[i];
      const fileIndex = batchIndex * batchSize + i;

      if (progressCallback) {
        progressCallback({
          type: 'file-start',
          fileIndex,
          fileName: path.basename(track.path),
          artist: track.artist,
          album: track.album
        });
      }

      try {
        const artist = safeFilename(track.artist || 'unknown');
        const album = safeFilename(track.album || 'unknown-album');
        const coverName = `${artist}-${album}.jpg`;
        const coverPath = path.join(coversPath, coverName);

        let success = false;
        let source = '';

        // Check if cover already exists and validate it
        if (await fs.pathExists(coverPath)) {
          if (validateExisting) {
            const validation = await validateImageFile(coverPath);
            if (validation.valid) {
              countValidated++;
              logger.debug(`Valid cover exists: ${coverName}`);
              success = true;
              source = 'validated';
            } else {
              // Remove invalid cover
              await fs.remove(coverPath);
              countCleaned++;
              logger.info(`Removed invalid cover: ${coverName} - ${validation.reason}`);
            }
          } else {
            // Assume existing cover is valid
            countValidated++;
            success = true;
            source = 'existing';
          }
        }

        // If no valid cover exists, try to get one
        if (!success) {
          // Try to extract embedded art
          try {
            const metadata = await mm.parseFile(track.path);
            const picture = metadata.common.picture?.[0];

            if (picture && Buffer.isBuffer(picture.data) && picture.data.length > 1024) {
              // Check for duplicates
              const duplicateCheck = await findDuplicateCover(picture.data, coversPath);

              if (duplicateCheck.isDuplicate) {
                await fs.copy(duplicateCheck.existingFile, coverPath);
                countDuplicates++;
                countEmbedded++;
                success = true;
                source = 'embedded-duplicate';
                logger.debug(`Duplicate embedded art: ${coverName}`);
              } else {
                await fs.writeFile(coverPath, picture.data);
                const validation = await validateImageFile(coverPath);
                if (validation.valid) {
                  countEmbedded++;
                  success = true;
                  source = 'embedded';
                  logger.info(`Extracted embedded art: ${coverName}`);
                } else {
                  await fs.remove(coverPath);
                  logger.warn(`Invalid embedded art: ${coverName}`);
                }
              }
            }
          } catch (err) {
            logger.error(`Failed to extract embedded art for ${track.path}`, { error: err.message });
          }
        }

        // Try online download if still no success
        if (!success && downloadMissing && track.artist && track.album) {
          // Rate limiting
          if (networkRequestsInBatch >= 3) {
            await sleep(requestDelay);
            networkRequestsInBatch = 0;
          }

          networkRequestsInBatch++;
          logger.debug(`Searching online for: ${track.artist} - ${track.album}`);

          const mbid = await searchMusicBrainzReleaseGroup(track.artist, track.album, logger);
          if (mbid) {
            const imageBuffer = await fetchCoverArtArchiveImage(mbid, logger);
            if (imageBuffer) {
              // Check for duplicates
              const duplicateCheck = await findDuplicateCover(imageBuffer, coversPath);

              if (duplicateCheck.isDuplicate) {
                await fs.copy(duplicateCheck.existingFile, coverPath);
                countDuplicates++;
                countDownloaded++;
                success = true;
                source = 'downloaded-duplicate';
                logger.debug(`Duplicate online art: ${coverName}`);
              } else {
                await fs.writeFile(coverPath, imageBuffer);
                const validation = await validateImageFile(coverPath);
                if (validation.valid) {
                  countDownloaded++;
                  success = true;
                  source = 'downloaded';
                  logger.info(`Downloaded cover: ${coverName}`);
                } else {
                  await fs.remove(coverPath);
                  logger.warn(`Invalid downloaded art: ${coverName}`);
                }
              }
            }
          }
        }

        if (!success) {
          countFailed++;
        }

        if (progressCallback) {
          progressCallback({
            type: 'file-complete',
            result: source || 'failed'
          });
        }
      } catch (err) {
        logger.error(`Error processing track: ${track.path}`, { error: err.message });
        countFailed++;
        if (progressCallback) {
          progressCallback({
            type: 'file-complete',
            result: 'failed'
          });
        }
      }
    }

    // Delay between batches if there were network requests
    if (networkRequestsInBatch > 0 && batchIndex < batches.length - 1) {
      await sleep(requestDelay);
    }
  }

  const summary = {
    totalTracks: tracks.length,
    processed: tracks.length,
    embedded: countEmbedded,
    downloaded: countDownloaded,
    validated: countValidated,
    cleaned: countCleaned,
    duplicates: countDuplicates,
    failed: countFailed
  };

  logger.info('Cover fetch scan complete', summary);

  if (progressCallback) {
    progressCallback({
      type: 'complete',
      summary
    });
  }

  return summary;
}

module.exports = {
  scanAndFetchCovers,
  validateImageFile,
  safeFilename
};
