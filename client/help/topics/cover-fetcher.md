# 🖼️ Album Cover Fetcher

## Overview

The Album Cover Fetcher is a powerful tool that automatically scans your entire music library to find, validate, and download missing album artwork. It combines embedded art extraction with online fetching from professional music databases.

---

## Accessing the Cover Fetcher

**Method 1:** Menu Bar
- Click **Tools → Fetch Missing Album Covers**

**Method 2:** Keyboard Shortcut
- Press **Ctrl+Shift+C** (Windows/Linux)
- Press **Cmd+Shift+C** (macOS)

---

## Features

### 🔍 Comprehensive Scanning
- Scans your entire music library in batches
- Processes thousands of tracks efficiently
- Real-time progress tracking with statistics

### 🎨 Multiple Cover Sources
1. **Embedded Art Extraction**
   - Extracts album art from MP3/FLAC file metadata
   - No internet connection required
   - Preserves existing embedded artwork

2. **Online Downloads**
   - Searches **MusicBrainz** database for album information
   - Downloads high-quality covers from **Cover Art Archive**
   - Professional metadata matching

3. **Cover Validation**
   - Verifies existing covers with magic byte verification
   - Checks JPEG (FF D8 FF) and PNG (89 50 4E 47) formats
   - Removes corrupted or invalid image files

### 🔒 Smart Deduplication
- **SHA256 hash checking** prevents duplicate downloads
- Automatically reuses existing covers when albums share artwork
- Saves bandwidth and storage space

### 📊 Progress Tracking
- Real-time progress bar and percentage
- Live statistics:
  - **Scanned**: Total tracks processed
  - **Embedded**: Covers extracted from files
  - **Downloaded**: Covers fetched from online
  - **Validated**: Existing covers verified as valid
  - **Cleaned**: Corrupted files removed
  - **Failed**: Tracks that couldn't be processed
- Scrolling status log with detailed messages
- Current file being processed display

---

## Using the Cover Fetcher

### Step 1: Open the Tool
1. Click **Tools → Fetch Missing Album Covers**
2. The Cover Fetcher modal will appear

### Step 2: Configure Options

**Download missing covers from online sources**
- ✅ **Enabled** (default): Fetches covers from Cover Art Archive when not found locally
- ⚠️ **Requires internet connection** for online downloads
- ℹ️ Uses MusicBrainz API with rate limiting (1 request/second)

**Validate existing covers (remove corrupted files)**
- ✅ **Enabled** (default): Checks all existing cover images for corruption
- Removes files that fail magic byte verification
- Ensures your cover art library is clean and valid

### Step 3: Start Scanning
1. Click **Start Scan** button
2. Progress bar will show scan progress
3. Statistics update in real-time
4. Status log shows detailed activity

### Step 4: Monitor Progress
- **Progress Bar**: Visual indication of completion
- **Statistics Grid**: Live counters for all operations
- **Currently processing**: Shows the track being scanned
- **Status Log**: Scrollable list of actions taken

### Step 5: Review Results
- Scan completes automatically when all tracks are processed
- Notification appears with summary statistics
- Status log shows final counts and any failures

---

## Understanding the Results

### Statistics Explained

**Scanned: 4717**
- Total number of tracks processed from your library

**Embedded: 45**
- Covers extracted from MP3/FLAC file metadata
- These covers were inside your audio files

**Downloaded: 12**
- Covers fetched from Cover Art Archive
- Required internet connection and MusicBrainz lookup

**Validated: 4650**
- Existing covers that passed validation checks
- These covers were already present and valid

**Cleaned: 3**
- Corrupted or invalid cover files removed
- These files failed magic byte verification

**Failed: 14**
- Tracks that couldn't be processed
- Common reasons:
  - Missing artist/album metadata
  - Album not found in MusicBrainz database
  - No cover art available online
  - Network connectivity issues

---

## How Cover Fetching Works

### Process Flow

1. **Track Selection**
   - Retrieves all tracks from your music database
   - Groups tracks by artist and album

2. **Existing Cover Check**
   - Checks if cover already exists: `artist-album.jpg`
   - If exists and validation enabled, verifies image integrity

3. **Embedded Art Extraction**
   - If no valid cover exists, reads MP3/FLAC metadata
   - Extracts embedded album art if present
   - Validates extracted image before saving

4. **Online Search** (if enabled)
   - Searches MusicBrainz for artist + album
   - Retrieves MusicBrainz ID (MBID)
   - Downloads cover from Cover Art Archive using MBID

5. **Duplicate Detection**
   - Calculates SHA256 hash of downloaded image
   - Compares with existing covers
   - Reuses existing file if duplicate found

6. **Save and Validate**
   - Saves cover to covers directory
   - Validates image format with magic bytes
   - Removes file if validation fails

---

## Troubleshooting

### No Covers Downloaded (Downloaded: 0)

**Possible Causes:**
- ✅ **Your library already has covers** - Check "Validated" count
- 🌐 **No internet connection** - Online downloads require connectivity
- 📝 **Missing metadata** - Tracks need artist/album tags
- 🔍 **Not in database** - Obscure albums may not be in MusicBrainz

**Solutions:**
- Enable logging (Settings → Advanced → Logging Level → HIGH)
- Check status log for specific error messages
- Verify internet connection
- Check MP3 tags for artist/album information

### High Failed Count

**Common Reasons:**
- **Missing Metadata**: Tracks without artist or album names
- **Rare Albums**: Not present in MusicBrainz database
- **Network Issues**: Timeouts or connection problems
- **No Cover Available**: Album exists in database but no cover art

**Solutions:**
- Review status log for specific failures
- Update MP3 tags with proper artist/album information
- Manually add covers for obscure albums

### Covers Not Appearing in Player

**Solutions:**
- Restart the application to reload cover cache
- Check covers directory: `assets/covers/`
- Verify cover file naming: `artist-album.jpg`
- Check logging for cover resolution errors

---

## Technical Details

### Cover Storage Location
- **Path**: `assets/covers/`
- **Format**: `artist-album.jpg`
- **Naming**: Lowercase, sanitized (special characters replaced with `-`)
- **Example**: `pink-floyd-dark-side-of-the-moon.jpg`

### Image Validation

**Magic Bytes Checked:**
- **JPEG**: `FF D8 FF` (first 3 bytes)
- **PNG**: `89 50 4E 47` (first 4 bytes)

**File Size Limits:**
- **Minimum**: 1 KB
- **Maximum**: 10 MB

**Supported Formats:**
- JPEG (.jpg, .jpeg)
- PNG (.png)

### API Integration

**MusicBrainz API:**
- Search endpoint for album metadata
- Rate limit: 1 request per second
- Free public API (no authentication required)

**Cover Art Archive:**
- Official MusicBrainz cover art repository
- High-quality artwork
- Direct download by MBID

### Batch Processing

**Settings:**
- **Batch Size**: 5 tracks processed concurrently
- **Request Delay**: 1000ms between API calls
- **Network Limit**: 3 requests per batch maximum

---

## Logging Integration

The Cover Fetcher fully integrates with Que-Music's logging system.

### Log Levels

**HIGH or DEV recommended for troubleshooting**

**Log Messages Include:**
- `logger.info()` - Scan start, covers extracted/downloaded
- `logger.debug()` - Validation checks, duplicate detection, MusicBrainz searches
- `logger.warn()` - Invalid covers, API errors, missing covers
- `logger.error()` - Failures, network errors, processing errors

### View Cover Fetcher Logs

1. **Set Logging Level**: Settings → Advanced → Logging Level → HIGH
2. **Run Cover Fetcher**: Tools → Fetch Missing Album Covers
3. **Check Log File**: `logs/QueMusicMain-YYYY-MM-DD.log`
4. **Search for**: "cover fetch", "MusicBrainz", "Cover Art Archive"

---

## Best Practices

### Before Running

✅ **Ensure Internet Connection** - Required for online downloads
✅ **Check Disk Space** - Large libraries need adequate storage
✅ **Enable Logging** - Helpful for troubleshooting
✅ **Backup Database** - Optional but recommended

### During Scanning

✅ **Let It Complete** - Don't close the modal during scanning
✅ **Monitor Status Log** - Watch for errors or issues
✅ **Note Failed Tracks** - Can be manually corrected later

### After Scanning

✅ **Review Statistics** - Understand what was processed
✅ **Check Failed Count** - Investigate if high
✅ **Restart If Needed** - Reload covers in player
✅ **Run Periodically** - When adding new music to library

---

## Known Limitations

⚠️ **No Internet Connection Detection**
- Cover Fetcher does not check for active internet before attempting downloads
- Downloads will silently fail if offline
- **Workaround**: Disable "Download missing covers" option when offline

⚠️ **MusicBrainz Coverage**
- Not all albums are in the MusicBrainz database
- Very new or obscure releases may not have covers
- Unofficial releases often lack artwork

⚠️ **Rate Limiting**
- MusicBrainz API limits requests to 1 per second
- Large libraries take time to process
- Patience required for 1000+ track libraries

---

## Related Topics

- **🎵 Music Library Management** - Scanning and organizing your library
- **🎨 Settings & Themes** - Configuring logging levels
- **🔧 Troubleshooting** - Debugging with logger system

---

## Quick Reference

| Action | Method |
|--------|--------|
| Open Cover Fetcher | Tools → Fetch Missing Album Covers |
| Keyboard Shortcut | Ctrl+Shift+C (Cmd+Shift+C on Mac) |
| Enable Logging | Settings → Advanced → Logging → HIGH |
| View Logs | `logs/QueMusicMain-YYYY-MM-DD.log` |
| Cover Location | `assets/covers/artist-album.jpg` |
| Cancel Scan | Click "Cancel" button during scan |
| Close Modal | Click "Close" or "X" button |

---

**Need more help?** Check the **🔧 Troubleshooting** section for common issues and solutions.
