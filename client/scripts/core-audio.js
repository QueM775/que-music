// core-audio.js - Audio engine, playback controls, and visualizer

// Fixed 5-band EQ presets, hardcoded per docs/superpowers/specs/2026-09-15-equalizer-design.md
// (no user-defined/saved custom presets in v1). Band order matches EQ_BAND_FREQUENCIES.
const EQ_PRESETS = {
  Flat: [0, 0, 0, 0, 0],
  Rock: [4, 2, -2, 3, 4],
  Pop: [-1, 2, 4, 2, -1],
  'Bass Boost': [7, 5, 0, 0, 0],
  Vocal: [-2, -1, 4, 4, 1],
};

const EQ_BAND_FREQUENCIES = [60, 250, 1000, 4000, 12000];

class CoreAudio {
  constructor(app) {
    this.app = app;

    // AUDIO ENGINE PROPERTIES
    this.audioPlayer = null;
    this.currentTrack = null;
    this.playlist = [];
    this.currentTrackIndex = -1;

    // REAL PLAYBACK QUEUE — separate from `playlist` (the loaded folder/playlist
    // context used for browsing/highlighting). Tracks explicitly queued by the
    // user via "Add to Queue" play next, ahead of the playlist's own next track,
    // then get consumed. See docs/application/roadmap.md, priority #1.
    this.queue = [];
    this.isPlaying = false;
    this.volume = 1;
    this.duration = 0;
    this.currentTime = 0;

    this.shuffle = false;
    this.repeat = 'none'; // 'none', 'one', 'all'
    this.originalPlaylist = []; // Keep un-shuffled version
    this.saveStateTimeout = null;

    // VISUALIZER PROPERTIES
    this.visualizerEnabled = false;
    this.visualizerType = 'bars'; // 'bars', 'wave', 'circular'
    this.canvas = null;
    this.visualizerContainer = null;
    this.visualizerBtn = null;
    this.canvasContext = null;
    this.audioContext = null;
    this.analyser = null;
    this.audioSource = null;
    this.dataArray = null;
    this.visualizerAnimationId = null;

    // EQUALIZER + LOUDNESS NORMALIZATION (docs/superpowers/specs/2026-09-15-equalizer-design.md)
    // One global EQ curve + normalization toggle, same scope as `volume` above.
    this.eqBands = []; // 5 BiquadFilterNode, built once in setupAudioContext()
    this.eqGains = [0, 0, 0, 0, 0]; // dB per band, -12..12
    this.eqActivePreset = 'Flat';
    this.normalizationGain = null; // GainNode, normalization stage ahead of the EQ chain
    this.normalizationEnabled = true;
    this.currentTrackReplayGainDb = null; // raw dB for the currently loaded track, or null if unknown
    this.eqSaveTimeout = null;

    this.app.logger.debug(' CoreAudio initialized');
  }

  // ========================================
  // AUDIO ENGINE INITIALIZATION
  // ========================================

  initAudioEngine() {
    // Get the hidden audio element from HTML
    this.audioPlayer = document.getElementById('audioPlayer');
    if (!this.audioPlayer) {
      this.app.logger.error('❌ Audio player element not found in HTML');
      return;
    }

    // Set up audio event listeners
    this.setupAudioEvents();

    // Set initial volume
    this.audioPlayer.volume = this.volume;

    this.app.logger.debug(' Audio engine initialized');

    // INITIALIZATION CALL for Favorites
    this.initializeFavoritesTracking();

    // Initialize favorite button state
    // Start with not favorited
    this.updateFavoriteButton(false);

    this.app.logger.info(' Favorites and tracking fully initialized');

    // Build the permanent audio graph now rather than waiting for the visualizer
    // to be toggled on (docs/superpowers/specs/2026-09-15-equalizer-design.md). The
    // context itself may come up 'suspended' under autoplay policy — that's fine,
    // the existing playHandler already resumes it on the audio element's 'play' event.
    this.setupAudioContext().catch((error) => {
      this.app.logger.error('❌ Failed to build permanent audio graph:', error);
    });
  }

  setupAudioEvents() {
    // Guard against double-registration: if this ever runs twice on the same
    // <audio> element (it used to, via cleanupStaleEventListeners), tear down
    // the previous set of listeners first so they never stack.
    this.teardownAudioEvents();

    const audio = this.audioPlayer;

    // Named, stored handlers so cleanup() can actually remove them later.
    this.loadedMetadataHandler = () => {
      this.duration = audio.duration;
      this.updateTimeDisplay();
      console.log(`🎵 Track loaded: ${this.formatTime(this.duration)}`);
    };

    this.timeUpdateHandler = () => {
      this.currentTime = audio.currentTime;
      this.updateTimeDisplay();
      this.updateProgressBar();
    };

    this.endedHandler = () => {
      this.app.logger.debug(' Track ended');
      this.handleTrackEnd();
    };

    this.playHandler = async () => {
      this.isPlaying = true;
      this.updatePlayPauseButton();

      // Resume audio context for visualizer if it exists
      if (this.audioContext && this.audioContext.state === 'suspended') {
        try {
          await this.audioContext.resume();
          console.log('🎨 Audio context resumed for visualizer');
        } catch (error) {
          this.app.logger.error('❌ Failed to resume audio context:', error);
        }
      }

      this.app.logger.debug(' Playback started');
    };

    this.pauseHandler = () => {
      this.isPlaying = false;
      this.updatePlayPauseButton();
      this.app.logger.debug(' Playback paused');
    };

    this.errorHandler = (e) => {
      this.app.logger.error('🎵 Audio error:', e);
      this.app.showNotification('Error playing audio', 'error');
    };

    this.canPlayHandler = () => {
      // If visualizer is enabled, ensure audio context is ready
      if (this.visualizerEnabled && this.audioContext) {
        this.ensureVisualizerConnection();
      }
    };

    audio.addEventListener('loadedmetadata', this.loadedMetadataHandler);
    audio.addEventListener('timeupdate', this.timeUpdateHandler);
    audio.addEventListener('ended', this.endedHandler);
    audio.addEventListener('play', this.playHandler);
    audio.addEventListener('pause', this.pauseHandler);
    audio.addEventListener('error', this.errorHandler);
    audio.addEventListener('canplay', this.canPlayHandler);
  }

  // Removes exactly the listener set setupAudioEvents() installs. Safe to call
  // even if they were never installed (removeEventListener with an
  // undefined handler is a no-op).
  teardownAudioEvents() {
    const audio = this.audioPlayer;
    if (!audio) return;

    audio.removeEventListener('loadedmetadata', this.loadedMetadataHandler);
    audio.removeEventListener('timeupdate', this.timeUpdateHandler);
    audio.removeEventListener('ended', this.endedHandler);
    audio.removeEventListener('play', this.playHandler);
    audio.removeEventListener('pause', this.pauseHandler);
    audio.removeEventListener('error', this.errorHandler);
    audio.removeEventListener('canplay', this.canPlayHandler);
  }

  // ========================================
  // PLAYBACK CONTROLS
  // ========================================

  async playSong(songPath, addToPlaylist = true) {
    try {
      this.app.logger.debug(' Loading track:', this.app.getBasename(songPath));

      // Check if file path exists and is valid
      if (!songPath || songPath.trim() === '') {
        throw new Error('Invalid song path');
      }

      this.app.showNotification(`Loading: ${this.app.getBasename(songPath)}`, 'info');

      // CRITICAL FIX: Set current track FIRST before updating favorite button
      this.currentTrack = songPath;
      console.log(`🎵 Current track set to: ${this.currentTrack}`);

      // CRITICAL FIX: Initialize favorite button with fresh database state
      console.log(`⭐ Initializing favorite button for new track...`);
      await this.updateFavoriteButton(); // This will fetch fresh state from database

      // Add to playlist if requested
      if (addToPlaylist) {
        if (this.playlist.length === 0 || !this.playlist.find((track) => track.path === songPath)) {
          this.app.logger.debug(' Building new playlist...');
          await this.buildPlaylistFromCurrentFolder(songPath);
        }
      }

      // Find the current track index
      const foundIndex = this.playlist.findIndex((track) => track.path === songPath);
      this.app.logger.debug(' Looking for path in playlist:', songPath);
      this.app.logger.debug(' Found index:', foundIndex, 'Current index before update:', this.currentTrackIndex);

      // CRITICAL: Only update the index if we found the track, otherwise keep the current index
      if (foundIndex !== -1) {
        this.currentTrackIndex = foundIndex;
      } else {
        this.app.logger.warn('⚠️ Track not found in playlist, keeping current index:', this.currentTrackIndex);
      }
      this.app.logger.debug(' Current track index after update:', this.currentTrackIndex);

      // Stop current playback
      if (!this.audioPlayer.paused) {
        this.audioPlayer.pause();
      }

      // Load the new track
      await this.loadTrack(songPath);

      // Update now playing info (includes album art)
      await this.updateNowPlaying(songPath);

      // VISUALIZER INTEGRATION: Prepare visualizer for new track
      if (this.visualizerEnabled) {
        await this.prepareVisualizerForNewTrack();
      }

      // Start playback
      await this.audioPlayer.play();

      this.app.showNotification(`Playing: ${this.app.getBasename(songPath)}`, 'success');
    } catch (error) {
      this.app.logger.error('🎵 Error playing song:', error);
      this.app.showNotification(`Failed to play: ${this.app.getBasename(songPath)}`, 'error');

      // Try to recover by playing next track
      if (this.playlist.length > 1) {
        this.app.logger.debug(' Attempting to recover by playing next track...');
        setTimeout(() => {
          this.nextTrack();
        }, 1000);
      }
    }
  }

  async buildPlaylistFromCurrentFolder(songPath) {
    try {
      // Get the folder containing this song
      const folderPath = songPath.substring(0, songPath.lastIndexOf('\\'));

      this.app.logger.debug(' Building playlist from folder:', folderPath);

      // Get all songs in that folder
      const songs = await window.queMusicAPI.files.getSongsInFolder(folderPath);

      this.app.logger.debug(' Found songs in folder:', songs.length);

      // Build playlist
      this.playlist = songs.map((song) => ({
        path: song.path,
        name: this.app.getBasename(song.path),
      }));

      console.log(`🎵 Built playlist: ${this.playlist.length} tracks`);
      this.app.logger.debug(' First track:', this.playlist[0]?.name);
    } catch (error) {
      this.app.logger.error('Error building playlist:', error);
      // Fallback to single song
      this.playlist = [{ path: songPath, name: this.app.getBasename(songPath) }];
      this.app.logger.debug(' Fallback playlist created with 1 track');
    }
  }

  // core-audio.js

  async loadTrack(songPath) {
    return new Promise((resolve, reject) => {
      this.currentTrack = songPath;

      // FIXED: Proper URL encoding for file paths with special characters
      const normalizedPath = songPath.replace(/\\/g, '/');

      // Use a simpler, more reliable approach for file URLs
      // Preserve original spacing to match database paths exactly
      const cleanPath = normalizedPath
        .replace(/\\/g, '/') // Normalize path separators only
        .trim(); // Remove leading/trailing spaces only

      // Create file URL - properly encode all special characters for file URLs
      const fileUrl = `file:///${encodeURI(cleanPath).replace(/\s/g, '%20')}`;
      this.app.logger.debug(' Clean path:', cleanPath);
      this.app.logger.debug(' Original path:', songPath);
      this.app.logger.debug(' Encoded URL:', fileUrl);

      // Clear any existing source first
      this.audioPlayer.src = '';
      this.audioPlayer.load(); // Reset the audio element

      // Set the new source
      this.audioPlayer.src = fileUrl;

      // Wait for the track to be ready
      const onCanPlay = () => {
        this.audioPlayer.removeEventListener('canplay', onCanPlay);
        this.audioPlayer.removeEventListener('error', onError);
        this.audioPlayer.removeEventListener('loadstart', onLoadStart);
        this.app.logger.debug(' Track ready to play');

        // Loudness normalization for the newly loaded track (docs/superpowers/specs/
        // 2026-09-15-equalizer-design.md). Fire-and-forget: doesn't block playback,
        // applies live once resolved.
        this.applyReplayGainForTrack(songPath).catch((error) => {
          this.app.logger.warn('ReplayGain apply failed', { songPath, error: error.message });
        });

        resolve();
      };

      const onError = async (error) => {
        this.audioPlayer.removeEventListener('canplay', onCanPlay);
        this.audioPlayer.removeEventListener('error', onError);
        this.audioPlayer.removeEventListener('loadstart', onLoadStart);
        this.app.logger.debug(' Track load error:', error);
        this.app.logger.debug(' Failed file URL:', fileUrl);
        this.app.logger.debug(' Original path:', songPath);

        // Try to find alternative paths if the original fails
        this.app.logger.debug(' Attempting to find alternative file paths...');
        try {
          // Check if this might be a database path issue (like EQ_Genre in path)
          const filename = songPath.split(/[/\\]/).pop(); // Get just the filename
          this.app.logger.debug(' Searching for file:', filename);

          // Try to find the file using the API
          const searchResults = await window.queMusicAPI.database.searchTracks(filename);
          if (searchResults && searchResults.length > 0) {
            const matchingTrack = searchResults.find((track) => track.filename === filename);
            if (matchingTrack && matchingTrack.path && matchingTrack.path !== songPath) {
              this.app.logger.debug(' Found alternative path:', matchingTrack.path);
              console.log('🔄 Updating current track path to use correct location');

              // Update the current track path
              this.currentTrack = matchingTrack.path;

              // Try loading with the corrected path
              this.loadTrack(matchingTrack.path)
                .then(resolve)
                .catch(() => {
                  reject(new Error(`Failed to load audio file: ${songPath}`));
                });
              return;
            }
          }
        } catch (searchError) {
          this.app.logger.debug(' Alternative path search failed:', searchError);
        }

        reject(new Error(`Failed to load audio file: ${songPath}`));
      };

      // Track when loading starts
      const onLoadStart = () => {
        this.app.logger.debug(' Started loading audio file...');
      };

      this.audioPlayer.addEventListener('canplay', onCanPlay);
      this.audioPlayer.addEventListener('error', onError);
      this.audioPlayer.addEventListener('loadstart', onLoadStart);

      // Start loading
      this.audioPlayer.load();
    });
  }

  async updateNowPlaying(songPath) {
    const titleEl = document.getElementById('currentTitle');
    const artistEl = document.getElementById('currentArtist');

    if (titleEl && artistEl) {
      let trackInfo = {
        title: 'Unknown Title',
        artist: 'Unknown Artist',
        album: 'Unknown Album',
        path: songPath,
      };

      try {
        // Try to get metadata from database first
        const dbTrack = await window.queMusicAPI.database.getTrackByPath(songPath);

        if (dbTrack) {
          trackInfo = {
            title: dbTrack.title || this.extractTitleFromFilename(songPath),
            artist: dbTrack.artist || 'Unknown Artist',
            album: dbTrack.album || 'Unknown Album',
            path: songPath,
          };
        } else {
          // Fall back to filename parsing
          const fileName = this.app.getBasename(songPath);
          const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');

          // Try to parse artist - title format
          const parts = nameWithoutExt.split(' - ');
          if (parts.length >= 2) {
            trackInfo.title = parts[1];
            trackInfo.artist = parts[0];
          } else {
            trackInfo.title = nameWithoutExt;
          }
        }
      } catch (error) {
        this.app.logger.error('Error getting track metadata:', error);
        // Use filename as fallback
        const fileName = this.app.getBasename(songPath);
        trackInfo.title = fileName.replace(/\.[^/.]+$/, '');
      }

      // Update text elements
      titleEl.textContent = trackInfo.title;
      artistEl.textContent = trackInfo.artist;

      // Load and display album art
      await this.app.loadAlbumArt(trackInfo);

      // Highlight current song in lists
      this.highlightCurrentSong(songPath);

      console.log(`🎵 Now playing: ${trackInfo.title} by ${trackInfo.artist}`);
    }
  }

  extractTitleFromFilename(filePath) {
    const fileName = this.app.getBasename(filePath);
    const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');

    // Try to parse different formats
    // Format: "Artist - Title"
    const dashParts = nameWithoutExt.split(' - ');
    if (dashParts.length >= 2) {
      return dashParts[1].trim();
    }

    // Format: "01. Title" or "1. Title"
    const trackNumMatch = nameWithoutExt.match(/^\d+\.?\s*(.+)$/);
    if (trackNumMatch) {
      return trackNumMatch[1].trim();
    }

    // Just return the filename without extension
    return nameWithoutExt;
  }

  highlightCurrentSong(songPath) {
    // Remove previous highlighting from all card types
    document.querySelectorAll('.song-card, .recent-item-card, .track-item').forEach((card) => {
      card.classList.remove('playing', 'active');
    });

    // Find and highlight the current song (try different selector patterns)
    const escapedPath = songPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    let currentSongCard = document.querySelector(`[data-path="${escapedPath}"]`);

    // If not found, try without escaping (for different path formats)
    if (!currentSongCard) {
      currentSongCard = document.querySelector(`[data-path="${songPath}"]`);
    }

    if (currentSongCard) {
      // Add appropriate class based on card type
      if (currentSongCard.classList.contains('recent-item-card')) {
        currentSongCard.classList.add('active');
        this.app.logger.debug(' Highlighted recent song card:', this.app.getBasename(songPath));
      } else {
        currentSongCard.classList.add('playing');
        this.app.logger.debug(' Highlighted song card:', this.app.getBasename(songPath));
      }

      // Scroll the song into view if it's not visible
      currentSongCard.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    } else {
      this.app.logger.debug(' Current song not found in visible list for path:', songPath);
    }
  }

  togglePlayPause() {
    // this.app.logger.debug(' togglePlayPause called');
    // this.app.logger.debug(' Current track:', this.currentTrack);
    // this.app.logger.debug(' Playlist length:', this.playlist?.length || 0);
    // this.app.logger.debug(' Current track index:', this.currentTrackIndex);
    // this.app.logger.debug(' Audio player src:', this.audioPlayer?.src || 'none');
    // this.app.logger.debug(' Audio ready state:', this.audioPlayer?.readyState || 'none');

    // If no track is loaded but we have a playlist, start from selected track
    if (!this.currentTrack && this.playlist && this.playlist.length > 0) {
      this.app.logger.debug(' No track loaded, starting from selected track');
      const startIndex = this.currentTrackIndex >= 0 ? this.currentTrackIndex : 0;
      this.app.logger.debug(' Starting from index:', startIndex);

      // Use the app's playPlaylist method instead of our own
      if (this.app.playPlaylist) {
        this.app.playPlaylist(startIndex);
      } else {
        this.playPlaylist(startIndex);
      }
      return;
    }

    // If we have a current track but no audio source, load it first
    if (this.currentTrack && (!this.audioPlayer.src || this.audioPlayer.src === '')) {
      // this.app.logger.debug(' Track selected but not loaded, loading now...');
      const startIndex = this.currentTrackIndex >= 0 ? this.currentTrackIndex : 0;

      // Use the app's playPlaylist method
      if (this.app.playPlaylist) {
        this.app.playPlaylist(startIndex);
      } else {
        this.playPlaylist(startIndex);
      }
      return;
    }

    // Check if we have a valid audio source
    if (this.audioPlayer && this.audioPlayer.src) {
      // Check if the source is properly loaded
      if (this.audioPlayer.readyState === 0) {
        this.app.logger.debug(' Audio not ready, waiting for load...');

        // Instead of waiting indefinitely, try to reload the current track
        if (this.currentTrack && this.currentTrackIndex >= 0) {
          this.app.logger.debug(' Reloading current track...');
          if (this.app.playPlaylist) {
            this.app.playPlaylist(this.currentTrackIndex);
          } else {
            this.playPlaylist(this.currentTrackIndex);
          }
        } else {
          this.app.logger.debug(' No current track to reload');
        }
        return;
      }

      // Audio is ready, proceed with normal play/pause logic
      if (this.audioPlayer.paused) {
        this.audioPlayer
          .play()
          .then(() => {
            this.isPlaying = true;
            this.updatePlayPauseButton();
            if (this.app.updatePlaylistTrackHighlight) {
              this.app.updatePlaylistTrackHighlight();
            }
            // console.log('▶️ Resumed playback');
          })
          .catch((error) => {
            this.app.logger.error('❌ Play failed:', error);
            console.log('🔄 Attempting to reload track...');
            if (this.app.playPlaylist && this.currentTrackIndex >= 0) {
              this.app.playPlaylist(this.currentTrackIndex);
            }
          });
      } else {
        this.audioPlayer.pause();
        this.isPlaying = false;
        this.updatePlayPauseButton();
        if (this.app.updatePlaylistTrackHighlight) {
          this.app.updatePlaylistTrackHighlight();
        }
        // console.log('⏸️ Paused playback');
      }
    } else {
      this.app.logger.warn('⚠️ No audio source available to play');
      // Try to play from playlist if we have one
      if (this.playlist && this.playlist.length > 0) {
        // console.log('🔄 Attempting to start playlist...');
        const startIndex = this.currentTrackIndex >= 0 ? this.currentTrackIndex : 0;
        if (this.app.playPlaylist) {
          this.app.playPlaylist(startIndex);
        } else {
          this.playPlaylist(startIndex);
        }
      } else {
        // No playlist exists, try to create one from currently visible songs
        this.app.logger.debug(' No playlist exists, trying to play from visible songs...');
        this.playFromVisibleSongs();
      }
    }
  }

  // Try to play from visible songs in the current view
  playFromVisibleSongs() {
    const songCards = document.querySelectorAll('.song-card');
    if (songCards.length === 0) {
      this.app.logger.warn('⚠️ No songs visible to play');
      this.app.showNotification('No songs available to play', 'warning');
      return;
    }

    // console.log(`🎵 Found ${songCards.length} visible songs, creating playlist...`);

    // Create playlist from visible songs
    const visibleSongs = Array.from(songCards)
      .map((card, index) => {
        const path = card.dataset.path;
        const title =
          card.dataset.title || card.querySelector('.song-title')?.textContent || 'Unknown';
        const artist =
          card.dataset.artist ||
          card.querySelector('.song-artist')?.textContent ||
          'Unknown Artist';

        return {
          path: path,
          name: this.app.getBasename(path),
          title: title,
          artist: artist,
        };
      })
      .filter((song) => song.path); // Only include songs with valid paths

    if (visibleSongs.length === 0) {
      this.app.logger.warn('⚠️ No valid song paths found');
      this.app.showNotification('No valid songs to play', 'warning');
      return;
    }

    // Clear existing playlist and set up new one
    this.clearPlaylist();
    this.playlist = visibleSongs;
    this.currentTrackIndex = 0;

    // Start playing first song
    // console.log(`🎵 Starting playback of ${visibleSongs.length} songs from library view`);
    this.playSong(visibleSongs[0].path, false);

    // Highlight the first track in the library view
    if (this.app.libraryManager && this.app.libraryManager.updateLibraryTrackHighlight) {
      setTimeout(() => {
        this.app.libraryManager.updateLibraryTrackHighlight();
      }, 100);
    }

    this.app.showNotification(`Playing ${visibleSongs.length} tracks from library`, 'success');
  }

  seek(percent) {
    if (this.audioPlayer && this.duration > 0) {
      const newTime = (percent / 100) * this.duration;
      this.audioPlayer.currentTime = newTime;
      // console.log(`🎵 Seeked to: ${this.formatTime(newTime)}`);
    }
  }

  setVolume(value) {
    this.volume = parseFloat(value);
    if (this.audioPlayer) {
      this.audioPlayer.volume = this.volume;
    }

    // Update volume slider visual appearance
    this.updateVolumeSlider();
    this.updateVolumeIcon();
    // console.log(`🎵 Volume: ${Math.round(this.volume * 100)}%`);

    this.updatePlayerState();
  }

  nextTrack() {
    // Queued tracks take priority over the playlist's own next track, and are
    // consumed one at a time — this is the actual "up next" list, independent
    // of whatever folder/playlist is loaded.
    if (this.queue.length > 0) {
      const queuedTrack = this.queue.shift();
      this.app.logger.debug(' Playing queued track:', queuedTrack.path);
      this.playSong(queuedTrack.path, false);
      this.notifyQueueChanged();

      if (this.app.currentView === 'now-playing') {
        setTimeout(() => {
          this.app.uiController.switchToNowPlaying();
        }, 100);
      }
      return;
    }

    if (this.playlist.length === 0) {
      this.app.showNotification('No playlist available', 'warning');
      return;
    }

    let nextIndex;

    if (this.shuffle) {
      // Random next track (but not the current one if possible)
      if (this.playlist.length > 1) {
        do {
          nextIndex = Math.floor(Math.random() * this.playlist.length);
        } while (nextIndex === this.currentTrackIndex && this.playlist.length > 1);
      } else {
        nextIndex = 0;
      }
    } else {
      // Sequential next track
      nextIndex = this.currentTrackIndex + 1;
      this.app.logger.debug(' Current index:', this.currentTrackIndex, 'Next index:', nextIndex, 'Playlist length:', this.playlist.length);
      if (nextIndex >= this.playlist.length) {
        if (this.repeat === 'all') {
          nextIndex = 0; // Go to beginning
        } else {
          this.app.showNotification('End of playlist', 'info');
          return;
        }
      }
    }

    this.currentTrackIndex = nextIndex;

    // Perform periodic cleanup every 10 tracks to prevent memory accumulation
    if (this.currentTrackIndex % 10 === 0) {
      this.performPeriodicCleanup();
    }

    this.app.logger.debug(' Playing next track at index:', nextIndex, 'Path:', this.playlist[nextIndex].path);
    this.playSong(this.playlist[nextIndex].path, false);

    // Update library track highlighting if we're in library view
    if (this.app.libraryManager && this.app.libraryManager.updateLibraryTrackHighlight) {
      setTimeout(() => {
        this.app.libraryManager.updateLibraryTrackHighlight();
      }, 100); // Small delay to let the song load
    }

    // Refresh Now Playing view if it's currently active
    if (this.app.currentView === 'now-playing') {
      setTimeout(() => {
        this.app.uiController.switchToNowPlaying();
      }, 100); // Small delay to let the song load
    }
  }

  previousTrack() {
    if (this.playlist.length === 0) {
      this.app.showNotification('No playlist available', 'warning');
      return;
    }

    let prevIndex;

    if (this.shuffle) {
      // Random previous track (but not the current one if possible)
      if (this.playlist.length > 1) {
        do {
          prevIndex = Math.floor(Math.random() * this.playlist.length);
        } while (prevIndex === this.currentTrackIndex && this.playlist.length > 1);
      } else {
        prevIndex = 0;
      }
    } else {
      // Sequential previous track
      prevIndex = this.currentTrackIndex - 1;
      if (prevIndex < 0) {
        if (this.repeat === 'all') {
          prevIndex = this.playlist.length - 1; // Go to end
        } else {
          this.app.showNotification('Start of playlist', 'info');
          return;
        }
      }
    }

    this.currentTrackIndex = prevIndex;
    this.playSong(this.playlist[prevIndex].path, false);

    // Update library track highlighting if we're in library view
    if (this.app.libraryManager && this.app.libraryManager.updateLibraryTrackHighlight) {
      setTimeout(() => {
        this.app.libraryManager.updateLibraryTrackHighlight();
      }, 100); // Small delay to let the song load
    }

    // Refresh Now Playing view if it's currently active
    if (this.app.currentView === 'now-playing') {
      setTimeout(() => {
        this.app.uiController.switchToNowPlaying();
      }, 100); // Small delay to let the song load
    }
  }

  handleTrackEnd() {
    console.log('🎵 ========== TRACK ENDED ==========');
    console.log('🎵 Current track index:', this.currentTrackIndex);
    console.log('🎵 Playlist length:', this.playlist.length);
    console.log('🎵 Repeat mode:', this.repeat);
    console.log('🎵 Current track path:', this.currentTrack);

    if (this.repeat === 'one') {
      // Repeat current track
      this.audioPlayer.currentTime = 0;
      this.audioPlayer.play();
      this.app.showNotification('Repeating track', 'info');
      console.log('🎵 Repeating single track');
    } else if (this.queue.length > 0 || this.playlist.length > 1) {
      // Auto-play next track — queued tracks take priority (see nextTrack()),
      // so this also has to fire when the queue has something waiting even if
      // the loaded playlist itself is empty or down to one track.
      console.log('🎵 Calling nextTrack()...');
      this.nextTrack();
    } else {
      this.app.showNotification('Playlist finished', 'info');
      console.log('🎵 Playlist finished (only 1 track)');
    }
  }

  // ========================================
  // SHUFFLE & REPEAT
  // ========================================

  toggleShuffle() {
    this.shuffle = !this.shuffle;

    // Update button visual state
    const shuffleBtn = document.getElementById('shuffleBtn');
    if (shuffleBtn) {
      if (this.shuffle) {
        shuffleBtn.classList.add('active');
      } else {
        shuffleBtn.classList.remove('active');
      }
    }

    // Apply shuffle to current playlist
    if (this.shuffle) {
      this.enableShuffle();
    } else {
      this.disableShuffle();
    }

    // console.log(`🔀 Shuffle: ${this.shuffle ? 'ON' : 'OFF'}`);
    this.app.showNotification(`Shuffle: ${this.shuffle ? 'On' : 'Off'}`, 'info');

    this.updatePlayerState();
  }

  toggleRepeat() {
    // Cycle through repeat modes: none → all → one → none
    switch (this.repeat) {
      case 'none':
        this.repeat = 'all';
        break;
      case 'all':
        this.repeat = 'one';
        break;
      case 'one':
        this.repeat = 'none';
        break;
    }

    this.updateRepeatButtonState();

    // console.log(`🔁 Repeat: ${this.repeat.toUpperCase()}`);
    this.app.showNotification(
      `Repeat: ${this.repeat === 'none' ? 'Off' : this.repeat === 'all' ? 'All' : 'One'}`,
      'info'
    );
    this.updatePlayerState();
  }

  enableShuffle() {
    if (this.playlist.length <= 1) return;

    // Save original order if not already saved
    if (this.originalPlaylist.length === 0) {
      this.originalPlaylist = [...this.playlist];
    }

    // Find current track in playlist
    const currentTrack = this.playlist[this.currentTrackIndex];

    // Shuffle the playlist
    const shuffled = [...this.playlist];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    this.playlist = shuffled;

    // Find current track's new position
    if (currentTrack) {
      this.currentTrackIndex = this.playlist.findIndex((track) => track.path === currentTrack.path);
    }

    // console.log(`🔀 Playlist shuffled (${this.playlist.length} tracks)`);
  }

  disableShuffle() {
    if (this.originalPlaylist.length === 0) return;

    // Find current track
    const currentTrack = this.playlist[this.currentTrackIndex];

    // Restore original order
    this.playlist = [...this.originalPlaylist];
    this.originalPlaylist = [];

    // Find current track's position in original order
    if (currentTrack) {
      this.currentTrackIndex = this.playlist.findIndex((track) => track.path === currentTrack.path);
    }

    // console.log(`🔀 Playlist order restored`);
  }

  updateRepeatButtonState() {
    const repeatBtn = document.getElementById('repeatBtn');
    if (!repeatBtn) return;

    // Remove all repeat classes
    repeatBtn.classList.remove('active', 'repeat-one', 'repeat-all');

    // Add appropriate class based on repeat mode
    switch (this.repeat) {
      case 'all':
        repeatBtn.classList.add('active', 'repeat-all');
        break;
      case 'one':
        repeatBtn.classList.add('active', 'repeat-one');
        break;
      case 'none':
      default:
        // No additional classes needed
        break;
    }
  }

  // ========================================
  // UI UPDATES
  // ========================================

  updateTimeDisplay() {
    const currentTimeEl = document.getElementById('currentTime');
    const totalTimeEl = document.getElementById('totalTime');

    if (currentTimeEl) currentTimeEl.textContent = this.formatTime(this.currentTime);
    if (totalTimeEl) totalTimeEl.textContent = this.formatTime(this.duration);
  }

  updateProgressBar() {
    if (this.duration > 0) {
      const percent = (this.currentTime / this.duration) * 100;
      const progressSlider = document.getElementById('progressSlider');
      const progressFill = document.getElementById('progressFill');

      if (progressSlider) progressSlider.value = percent;
      if (progressFill) progressFill.style.width = `${percent}%`;
    }
  }

  updatePlayPauseButton() {
    // console.log(`🎵 Updating play/pause button - isPlaying: ${this.isPlaying}`);

    // Get both icon elements using more specific selectors
    const playIcon = document.querySelector('#playPauseBtn .play-icon');
    const pauseIcon = document.querySelector('#playPauseBtn .pause-icon');

    // this.app.logger.debug(' Icon elements found:', {
    //   playIcon: !!playIcon,
    //   pauseIcon: !!pauseIcon,
    // });

    if (!playIcon || !pauseIcon) {
      this.app.logger.error('❌ Play/pause icons not found');
      return;
    }

    if (this.isPlaying) {
      // Hide play icon, show pause icon
      playIcon.classList.add('hidden');
      playIcon.style.display = 'none';

      pauseIcon.classList.remove('hidden');
      pauseIcon.style.display = 'block';

      // console.log('⏸️ Showing pause icon');
      // this.app.logger.debug(' Play icon display:', playIcon.style.display);
      // this.app.logger.debug(' Pause icon display:', pauseIcon.style.display);
    } else {
      // Hide pause icon, show play icon
      pauseIcon.classList.add('hidden');
      pauseIcon.style.display = 'none';

      playIcon.classList.remove('hidden');
      playIcon.style.display = 'block';

      // console.log('▶️ Showing play icon');
      // this.app.logger.debug(' Play icon display:', playIcon.style.display);
      // this.app.logger.debug(' Pause icon display:', pauseIcon.style.display);
    }

    // Also update the button title for accessibility
    const playPauseBtn = document.getElementById('playPauseBtn');
    if (playPauseBtn) {
      playPauseBtn.title = this.isPlaying ? 'Pause' : 'Play';
    }

    // this.app.logger.info(' Play/pause button updated successfully');

    // Verify the final state
    setTimeout(() => {
      const playVisible = window.getComputedStyle(playIcon).display !== 'none';
      const pauseVisible = window.getComputedStyle(pauseIcon).display !== 'none';
      // this.app.logger.debug(' Final visibility check:', {
      //   playVisible,
      //   pauseVisible,
      //   shouldShowPause: this.isPlaying,
      // });
    }, 100);
  }

  updateVolumeIcon() {
    const volumeIcon = document.querySelector('.volume-icon');
    if (!volumeIcon) return;

    if (this.volume === 0) {
      volumeIcon.textContent = '🔇';
    } else if (this.volume < 0.5) {
      volumeIcon.textContent = '🔉';
    } else {
      volumeIcon.textContent = '🔊';
    }
  }

  updateVolumeSlider() {
    const volumeSlider = document.getElementById('volumeSlider');
    if (!volumeSlider) return;

    const volumePercent = Math.round(this.volume * 100);

    // Update slider value
    volumeSlider.value = this.volume;

    // CRITICAL: Update CSS custom property for visual highlight
    volumeSlider.style.setProperty('--volume-percent', `${volumePercent}%`);

    // console.log(`🎚️ Volume slider updated: ${volumePercent}%`);
  }

  updateShuffleButton() {
    const shuffleBtn = document.getElementById('shuffleBtn');
    if (shuffleBtn) {
      if (this.shuffle) {
        shuffleBtn.classList.add('active');
      } else {
        shuffleBtn.classList.remove('active');
      }
    }
  }

  shufflePlaylist() {
    if (this.playlist.length <= 1) return;

    // Find current track in playlist
    const currentTrack = this.playlist[this.currentTrackIndex];

    // Shuffle the playlist using Fisher-Yates algorithm
    const shuffled = [...this.playlist];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    this.playlist = shuffled;

    // Find current track's new position
    if (currentTrack) {
      this.currentTrackIndex = this.playlist.findIndex((track) => track.path === currentTrack.path);
    }

    console.log(`🔀 Playlist shuffled (${this.playlist.length} tracks)`);
  }

  updatePlaylistTrackHighlight() {
    // This method would be called to update highlighting in playlist views
    // Implementation depends on current view context
    console.log('🎯 Update playlist track highlight called');
  }

  /**
   * Clear the current playlist and reset related state
   * This prevents contamination when switching between views
   */
  clearPlaylist() {
    // console.log('🧹 Clearing audio playlist...');

    // Clear playlist arrays
    this.playlist = [];
    this.originalPlaylist = [];

    // Reset playlist index
    this.currentTrackIndex = -1;

    // Note: We don't stop current playback or clear currentTrack
    // The user might still be listening to a song when switching views

    // this.app.logger.info(' Audio playlist cleared');
  }

  // Playlist playback method (stays here because it controls audio)
  async playPlaylist(startIndex = 0) {
    if (!this.playlist || this.playlist.length === 0) {
      this.app.logger.warn('⚠️ No tracks in playlist to play');
      return;
    }

    this.app.logger.debug(' playPlaylist called - startIndex:', startIndex, 'playlist length:', this.playlist.length);

    // Set current track index
    this.currentTrackIndex = startIndex;

    // Get the track object
    const track = this.playlist[startIndex];
    this.app.logger.debug(' Playing track:', track.title || track.name, 'at index:', startIndex);

    try {
      // Load the track and wait for it to be ready
      await this.loadTrack(track.path);

      // CRITICAL FIX: Set currentTrack to the path (string), not the track object
      // This matches the pattern used in playSong and is what other methods expect
      this.currentTrack = track.path;

      // Update UI with track info and album art
      await this.updateNowPlayingInfo(track);

      // Start playback
      await this.audioPlayer.play();

      this.isPlaying = true;
      this.updatePlayPauseButton();

      // Update track highlighting to show playing state
      this.updatePlaylistTrackHighlight();

      console.log(`▶️ Now playing: ${track.title || track.name}`);
    } catch (error) {
      this.app.logger.error('❌ Failed to play playlist track:', error);
      this.app.showNotification('Failed to play track', 'error');
    }
  }

  async updateNowPlayingInfo(track) {
    // Update the player bar with track info
    const currentTitle = document.getElementById('currentTitle');
    const currentArtist = document.getElementById('currentArtist');

    if (currentTitle) {
      currentTitle.textContent = track.title || track.name;
    }

    if (currentArtist) {
      currentArtist.textContent = track.artist || 'Unknown Artist';
    }

    // Load album art for the track
    await this.app.loadAlbumArt({
      path: track.path,
      title: track.title || track.name,
      artist: track.artist || 'Unknown Artist',
      album: track.album || 'Unknown Album',
    });

    // console.log(`📱 Updated now playing info: ${track.title || track.name}`);
  }

  // ========================================
  // STATE PERSISTENCE
  // ========================================

  async savePlayerState() {
    try {
      const state = {
        volume: this.volume,
        shuffle: this.shuffle,
        repeat: this.repeat,
        lastSaved: Date.now(),
      };

      await window.queMusicAPI.settings.setPlayerState(state);
      // console.log('💾 Player state saved');
    } catch (error) {
      this.app.logger.error('Error saving player state:', error);
    }
  }

  async loadPlayerState() {
    try {
      const state = await window.queMusicAPI.settings.getPlayerState();

      if (state) {
        // Restore volume
        // Restore volume
        if (typeof state.volume === 'number') {
          this.volume = state.volume;
          if (this.audioPlayer) {
            this.audioPlayer.volume = this.volume;
          }

          // Update both slider value and visual appearance
          this.updateVolumeSlider();
          this.updateVolumeIcon();
        }

        // Restore shuffle
        if (typeof state.shuffle === 'boolean') {
          this.shuffle = state.shuffle;
          const shuffleBtn = document.getElementById('shuffleBtn');
          if (shuffleBtn && this.shuffle) {
            shuffleBtn.classList.add('active');
          }
        }

        // Restore repeat
        if (state.repeat && ['none', 'one', 'all'].includes(state.repeat)) {
          this.repeat = state.repeat;
          this.updateRepeatButtonState();
        }

        // console.log('📂 Player state restored:', state);
      }
    } catch (error) {
      this.app.logger.error('Error loading player state:', error);
    }
  }

  // Auto-save state when settings change
  updatePlayerState() {
    // Debounced save (don't save too frequently)
    clearTimeout(this.saveStateTimeout);
    this.saveStateTimeout = setTimeout(() => {
      this.savePlayerState();
    }, 1000);
  }

  // ========================================
  // EQUALIZER + LOUDNESS NORMALIZATION
  // See docs/superpowers/specs/2026-09-15-equalizer-design.md
  // ========================================

  // Sets one band's gain (dB, clamped ±12) and switches the active preset to
  // "Custom" — called from equalizer-ui.js when the user drags a slider.
  setBandGain(bandIndex, dB) {
    if (!this.eqBands[bandIndex]) return;
    const clamped = Math.max(-12, Math.min(12, Number(dB) || 0));
    this.eqGains[bandIndex] = clamped;
    this.eqBands[bandIndex].gain.value = clamped;
    this.eqActivePreset = 'Custom';
    this.updateEqualizerState();
  }

  // Applies a named preset from EQ_PRESETS to all 5 bands at once.
  applyPreset(name) {
    const preset = EQ_PRESETS[name];
    if (!preset) return;
    preset.forEach((dB, i) => {
      this.eqGains[i] = dB;
      if (this.eqBands[i]) {
        this.eqBands[i].gain.value = dB;
      }
    });
    this.eqActivePreset = name;
    this.updateEqualizerState();
  }

  // Re-applies the currently stored band gains to the live filter nodes — used
  // when the graph is (re)built after settings were already loaded.
  applyEqGainsToFilters() {
    this.eqGains.forEach((dB, i) => {
      if (this.eqBands[i]) {
        this.eqBands[i].gain.value = dB;
      }
    });
  }

  setNormalizationEnabled(enabled) {
    this.normalizationEnabled = !!enabled;
    this.applyReplayGainGainValue(this.currentTrackReplayGainDb);
    this.updateEqualizerState();
  }

  getEqualizerState() {
    return {
      bands: [...this.eqGains],
      activePreset: this.eqActivePreset,
      normalizationEnabled: this.normalizationEnabled,
    };
  }

  // Converts a dB offset into the normalization GainNode's linear gain value and
  // applies it — no-op (unity gain) if normalization is off or the value is unknown.
  applyReplayGainGainValue(gainDb) {
    this.currentTrackReplayGainDb = gainDb;
    if (!this.normalizationGain) return;

    if (!this.normalizationEnabled || gainDb == null) {
      this.normalizationGain.gain.value = 1;
      return;
    }

    const clampedDb = Math.max(-12, Math.min(12, gainDb));
    this.normalizationGain.gain.value = Math.pow(10, clampedDb / 20);
  }

  // Looks up (or lazily computes) ReplayGain for the track that just loaded and
  // applies it live. Tag-based values come from the scanner (server/music-scanner.js);
  // tag-less tracks get computed here on first play and cached via IPC so this only
  // ever runs once per track.
  async applyReplayGainForTrack(songPath) {
    try {
      const track = await window.queMusicAPI.database.getTrackByPath(songPath);
      const taggedGain =
        track && typeof track.replaygain_gain === 'number' ? track.replaygain_gain : null;

      if (taggedGain != null) {
        this.applyReplayGainGainValue(taggedGain);
        return;
      }

      // No cached value yet — play unnormalized for now, compute in the background.
      this.applyReplayGainGainValue(null);
      const computed = await this.computeReplayGain(songPath);

      // Only apply/persist if the user hasn't already moved on to a different track.
      if (computed != null && this.currentTrack === songPath) {
        this.applyReplayGainGainValue(computed);
        window.queMusicAPI.replaygain.updateTrack(songPath, computed).catch((error) => {
          this.app.logger.warn('Failed to persist computed ReplayGain', { songPath, error: error.message });
        });
      }
    } catch (error) {
      this.app.logger.warn('applyReplayGainForTrack failed', { songPath, error: error.message });
    }
  }

  // Approximate loudness measurement for tracks with no embedded ReplayGain tag:
  // decodes the file, measures average RMS level, and computes the gain needed to
  // bring it to a rough reference level. This is NOT full ITU-R BS.1770 K-weighted
  // LUFS measurement (that's substantially more complex) — a deliberate, documented
  // approximation. Tag-based values (the common case for a tagged library) are exact.
  async computeReplayGain(songPath) {
    try {
      const normalizedPath = songPath.replace(/\\/g, '/').trim();
      const fileUrl = `file:///${encodeURI(normalizedPath).replace(/\s/g, '%20')}`;

      const response = await fetch(fileUrl);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

      let sumSquares = 0;
      let sampleCount = 0;
      const stride = 50; // sampled, not every frame — an average-level estimate doesn't need full resolution
      for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
        const data = audioBuffer.getChannelData(ch);
        for (let i = 0; i < data.length; i += stride) {
          sumSquares += data[i] * data[i];
          sampleCount++;
        }
      }

      const rms = Math.sqrt(sumSquares / Math.max(sampleCount, 1));
      const measuredDb = 20 * Math.log10(rms || 1e-6);
      const targetDb = -14; // rough streaming-loudness reference level

      return Math.max(-12, Math.min(12, targetDb - measuredDb));
    } catch (error) {
      this.app.logger.warn('ReplayGain compute failed', { songPath, error: error.message });
      return null;
    }
  }

  // Debounced persistence, mirroring updatePlayerState() above — called on every
  // slider/preset/toggle change from equalizer-ui.js.
  updateEqualizerState() {
    clearTimeout(this.eqSaveTimeout);
    this.eqSaveTimeout = setTimeout(() => {
      this.saveEqualizerState();
    }, 1000);
  }

  async saveEqualizerState() {
    try {
      await window.queMusicAPI.settings.setEqualizer(this.getEqualizerState());
    } catch (error) {
      this.app.logger.error('Error saving equalizer state:', error);
    }
  }

  async loadEqualizerState() {
    try {
      const state = await window.queMusicAPI.settings.getEqualizer();

      if (state) {
        if (Array.isArray(state.bands) && state.bands.length === 5) {
          this.eqGains = state.bands.map((v) => Math.max(-12, Math.min(12, Number(v) || 0)));
        }
        this.eqActivePreset = state.activePreset || 'Flat';
        this.normalizationEnabled = state.normalizationEnabled !== false;
      }
    } catch (error) {
      this.app.logger.warn('Failed to load equalizer settings, falling back to flat/disabled:', error);
      this.eqGains = [0, 0, 0, 0, 0];
      this.eqActivePreset = 'Flat';
      this.normalizationEnabled = false;
    }

    // Applies regardless of whether the graph exists yet — setupAudioContext() also
    // re-applies once the filter nodes are actually built, so ordering with init doesn't matter.
    this.applyEqGainsToFilters();
    this.applyReplayGainGainValue(this.currentTrackReplayGainDb);
  }

  // ========================================
  // KEYBOARD SHORTCUTS (Audio-related)
  // ========================================

  // Keyboard shortcut helper methods
  seekForward() {
    if (this.audioPlayer && this.duration > 0) {
      const newTime = Math.min(this.audioPlayer.currentTime + 10, this.duration);
      this.audioPlayer.currentTime = newTime;
      this.app.showNotification('⏩ +10s', 'info');
    }
  }

  seekBackward() {
    if (this.audioPlayer) {
      const newTime = Math.max(this.audioPlayer.currentTime - 10, 0);
      this.audioPlayer.currentTime = newTime;
      this.app.showNotification('⏪ -10s', 'info');
    }
  }

  volumeUp() {
    const newVolume = Math.min(this.volume + 0.1, 1);
    this.setVolume(newVolume);
  }

  volumeDown() {
    const newVolume = Math.max(this.volume - 0.1, 0);
    this.setVolume(newVolume);
  }

  // ========================================
  // AUDIO VISUALIZER SYSTEM
  // ========================================

  initializeVisualizer() {
    // console.log('🎨 Initializing real-time audio visualizer...');

    this.canvas = document.getElementById('audioVisualizer');
    this.visualizerContainer = document.getElementById('visualizerContainer');
    this.visualizerBtn = document.getElementById('visualizerBtn');

    if (!this.canvas || !this.visualizerContainer || !this.visualizerBtn) {
      this.app.logger.error('❌ Visualizer elements not found');
      return;
    }

    this.canvasContext = this.canvas.getContext('2d');

    // Setup canvas resize handling
    this.setupCanvasResize();

    // Button click handler for real visualizer toggle
    this.visualizerBtn.addEventListener('click', () => {
      this.toggleVisualizer();
    });

    // Right-click to cycle visualization types
    this.visualizerBtn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.visualizerEnabled) {
        this.cycleVisualizerType();
      }
    });

    // Initial static state
    this.drawStaticState();

    // this.app.logger.info(' Real-time visualizer initialized');
  }

  async setupAudioContext() {
    if (this.audioContext) {
      // this.app.logger.debug(' Audio context already exists');
      return true;
    }

    try {
      // this.app.logger.debug(' Setting up Web Audio Context...');

      // Create audio context
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      // console.log(`🎵 Audio context created, state: ${this.audioContext.state}`);

      // Create analyser node with better settings
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 1024; // Higher resolution for better visualization
      this.analyser.smoothingTimeConstant = 0.85; // Smoother animation
      this.analyser.minDecibels = -90;
      this.analyser.maxDecibels = -10;

      // console.log(
      //   `🎵 Analyser configured: FFT=${this.analyser.fftSize}, Bins=${this.analyser.frequencyBinCount}`
      // );

      // Create data array for frequency data
      const bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(bufferLength);
      // console.log(`🎵 Data array created with ${bufferLength} elements`);

      // Connect audio element to analyser
      if (this.audioPlayer) {
        // Check if already connected
        if (!this.audioSource) {
          this.audioSource = this.audioContext.createMediaElementSource(this.audioPlayer);

          // Permanent chain (docs/superpowers/specs/2026-09-15-equalizer-design.md):
          // source -> normalization gain -> 5 peaking EQ filters -> analyser -> destination.
          // Built once, here, regardless of whether the visualizer is ever toggled on —
          // createMediaElementSource() can only be called once per <audio> element, so
          // the EQ/normalization stage and the visualizer have to share this one graph.
          this.normalizationGain = this.audioContext.createGain();
          this.normalizationGain.gain.value = 1; // unity until a track's ReplayGain value is known

          this.eqBands = EQ_BAND_FREQUENCIES.map((freq) => {
            const filter = this.audioContext.createBiquadFilter();
            filter.type = 'peaking';
            filter.frequency.value = freq;
            filter.Q.value = 1;
            filter.gain.value = 0;
            return filter;
          });

          this.audioSource.connect(this.normalizationGain);
          let node = this.normalizationGain;
          for (const band of this.eqBands) {
            node.connect(band);
            node = band;
          }
          node.connect(this.analyser);
          this.analyser.connect(this.audioContext.destination);

          // Re-apply any EQ/normalization state already loaded before the graph existed
          this.applyEqGainsToFilters();
          this.applyReplayGainGainValue(this.currentTrackReplayGainDb);
          // this.app.logger.info(' Audio player connected to analyser');
        }

        // Resume context if suspended
        if (this.audioContext.state === 'suspended') {
          await this.audioContext.resume();
          console.log('▶️ Audio context resumed');
        }

        return true;
      } else {
        this.app.logger.error('❌ Audio player not found');
        return false;
      }
    } catch (error) {
      this.app.logger.error('❌ Failed to setup audio context:', error);
      return false;
    }
  }

  async toggleVisualizer() {
    // console.log(`🎨 Toggle visualizer (currently ${this.visualizerEnabled ? 'ON' : 'OFF'})`);

    if (!this.visualizerEnabled) {
      // Turn on visualizer. The audio graph itself is now permanent — built once in
      // initAudioEngine() — so this is purely a UI/animation-loop concern and never
      // touches audioContext lifecycle (docs/superpowers/specs/2026-09-15-equalizer-design.md).
      if (!this.analyser) {
        this.app.showNotification('Audio graph not ready yet', 'error');
        return;
      }

      // Resume audio context if suspended (required by browser policy)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
        // console.log('▶️ Audio context resumed for visualizer');
      }

      this.visualizerEnabled = true;
      this.visualizerContainer.classList.remove('hidden');
      this.visualizerBtn.classList.add('active');
      this.startVisualizerAnimation();

      // this.app.logger.info(' Real-time visualizer enabled');
      this.app.showNotification('Visualizer enabled - right-click to change type', 'success');
    } else {
      // Turn off visualizer
      this.visualizerEnabled = false;
      this.visualizerContainer.classList.add('hidden');
      this.visualizerBtn.classList.remove('active');
      this.stopVisualizerAnimation();

      // this.app.logger.info(' Visualizer disabled');
      this.app.showNotification('Visualizer disabled', 'info');
    }
  }

  startVisualizerAnimation() {
    if (!this.visualizerEnabled || !this.analyser || !this.dataArray) {
      this.app.logger.error('❌ Cannot start animation - missing components');
      return;
    }

    // console.log('🎬 Starting visualizer animation loop');

    const animate = () => {
      if (!this.visualizerEnabled) {
        console.log('🛑 Animation stopped - visualizer disabled');
        return;
      }

      try {
        // Get real-time frequency data
        this.analyser.getByteFrequencyData(this.dataArray);

        // Check if we're getting audio data
        const hasAudio = this.dataArray.some((value) => value > 0);

        if (hasAudio) {
          // Draw based on current visualizer type
          switch (this.visualizerType) {
            case 'bars':
              this.drawRealtimeBars();
              break;
            case 'wave':
              this.drawRealtimeWave();
              break;
            case 'circular':
              this.drawRealtimeCircular();
              break;
            default:
              this.drawRealtimeBars();
          }
        } else {
          // Draw minimal animation when no audio
          this.drawIdleAnimation();
        }

        this.visualizerAnimationId = requestAnimationFrame(animate);
      } catch (error) {
        this.app.logger.error('❌ Animation error:', error);
        this.stopVisualizerAnimation();
      }
    };

    animate();
  }

  drawRealtimeBars() {
    const ctx = this.canvasContext;
    const canvas = this.canvas;
    const dataArray = this.dataArray;
    const bufferLength = this.analyser.frequencyBinCount;

    // Clear canvas with fade effect for trails
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Calculate number of bars to display across full width
    const maxBars = Math.floor(canvas.width / 4); // 4px per bar minimum
    const barCount = Math.min(maxBars, Math.floor(bufferLength / 2)); // Use half the frequency data
    const barWidth = Math.floor(canvas.width / barCount) - 1;
    const barSpacing = 1;

    // Create gradient for bars
    const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
    gradient.addColorStop(0, '#007acc'); // Blue at bottom
    gradient.addColorStop(0.4, '#00a8ff'); // Light blue
    gradient.addColorStop(0.7, '#00ff88'); // Green
    gradient.addColorStop(1, '#ffff00'); // Yellow at top

    // Draw bars with real frequency data
    for (let i = 0; i < barCount; i++) {
      // Sample frequency data (use every nth element for better distribution)
      const dataIndex = Math.floor((i * (bufferLength / 2)) / barCount);
      const rawValue = dataArray[dataIndex];

      // Enhance the visualization with some processing
      const normalizedValue = rawValue / 255; // 0 to 1
      const enhancedValue = Math.pow(normalizedValue, 0.7); // Power curve for better visual
      const barHeight = enhancedValue * canvas.height * 0.95;

      // Calculate position
      const x = i * (barWidth + barSpacing);

      // Draw bar with gradient
      ctx.fillStyle = gradient;
      ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

      // Add highlight on top of taller bars
      if (barHeight > canvas.height * 0.7) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fillRect(x, canvas.height - barHeight, barWidth, 2);
      }
    }

    // Draw subtle base line
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(0, canvas.height - 1, canvas.width, 1);
  }

  drawRealtimeWave() {
    const ctx = this.canvasContext;
    const canvas = this.canvas;
    const dataArray = this.dataArray;
    const bufferLength = this.analyser.frequencyBinCount;

    // Clear canvas with fade effect
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw center reference line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, canvas.height / 2);
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();

    // Setup waveform line
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#00a8ff';
    ctx.shadowColor = '#00a8ff';
    ctx.shadowBlur = 5;
    ctx.beginPath();

    // Calculate step size to fit canvas width
    const step = Math.max(1, Math.floor(bufferLength / canvas.width));
    const sliceWidth = canvas.width / (bufferLength / step);
    let x = 0;

    // Draw waveform
    for (let i = 0; i < bufferLength; i += step) {
      const v = dataArray[i] / 255;
      const y = canvas.height / 2 + (v - 0.5) * canvas.height * 0.8;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }

      x += sliceWidth;
    }

    ctx.stroke();
    ctx.shadowBlur = 0; // Reset shadow
  }

  drawRealtimeCircular() {
    const ctx = this.canvasContext;
    const canvas = this.canvas;
    const dataArray = this.dataArray;
    const bufferLength = this.analyser.frequencyBinCount;

    // Clear canvas
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw multiple circles across the width
    const circleCount = Math.floor(canvas.width / 80); // Circle every 80px
    const circleSpacing = canvas.width / circleCount;
    const radius = Math.min(15, canvas.height / 3);

    for (let c = 0; c < circleCount; c++) {
      const centerX = (c + 0.5) * circleSpacing;
      const centerY = canvas.height / 2;

      // Use different frequency ranges for each circle
      const startFreq = Math.floor(c * (bufferLength / circleCount));
      const endFreq = Math.floor((c + 1) * (bufferLength / circleCount));
      const freqRange = endFreq - startFreq;

      // Draw circular bars for this frequency range
      const angleStep = (Math.PI * 2) / freqRange;

      for (let i = 0; i < freqRange; i++) {
        const dataIndex = startFreq + i;
        const angle = i * angleStep - Math.PI / 2; // Start from top
        const value = dataArray[dataIndex] / 255;
        const barHeight = value * radius * 0.8;

        // Calculate positions
        const x1 = centerX + Math.cos(angle) * (radius * 0.3);
        const y1 = centerY + Math.sin(angle) * (radius * 0.3);
        const x2 = centerX + Math.cos(angle) * (radius * 0.3 + barHeight);
        const y2 = centerY + Math.sin(angle) * (radius * 0.3 + barHeight);

        // Color based on frequency and intensity
        const hue = (dataIndex / bufferLength) * 360;
        const intensity = Math.min(1, value * 2);
        ctx.strokeStyle = `hsla(${hue}, 100%, 50%, ${intensity})`;
        ctx.lineWidth = 2;

        // Draw line
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // Draw center dot
      ctx.beginPath();
      ctx.arc(centerX, centerY, 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.fill();
    }
  }

  drawIdleAnimation() {
    const ctx = this.canvasContext;
    const canvas = this.canvas;
    const time = Date.now() * 0.001; // Convert to seconds

    // Clear with subtle fade
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw gentle wave pattern
    const barCount = Math.floor(canvas.width / 6);
    const barWidth = Math.floor(canvas.width / barCount) - 1;

    for (let i = 0; i < barCount; i++) {
      const x = i * (barWidth + 1);

      // Create gentle sine wave animation
      const waveHeight = 3 + Math.sin(time + i * 0.3) * 2;
      const opacity = 0.1 + Math.sin(time * 0.5 + i * 0.2) * 0.05;

      ctx.fillStyle = `rgba(120, 120, 120, ${opacity})`;
      ctx.fillRect(x, canvas.height - waveHeight, barWidth, waveHeight);
    }
  }

  stopVisualizerAnimation() {
    if (this.visualizerAnimationId) {
      cancelAnimationFrame(this.visualizerAnimationId);
      this.visualizerAnimationId = null;
      // console.log('🛑 Visualizer animation stopped');
    }

    // Draw static state when stopped
    this.drawStaticState();
  }

  drawStaticState() {
    if (!this.canvasContext || !this.canvas) return;

    const ctx = this.canvasContext;
    const canvas = this.canvas;

    // Clear canvas
    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw static pattern across full width
    const barCount = Math.floor(canvas.width / 8);
    const barWidth = Math.floor(canvas.width / barCount) - 2;

    for (let i = 0; i < barCount; i++) {
      const x = i * (barWidth + 2);
      const height = 2 + Math.sin(i * 0.5) * 1;

      ctx.fillStyle = `rgba(150, 150, 150, ${0.05 + Math.sin(i * 0.3) * 0.02})`;
      ctx.fillRect(x, canvas.height - height, barWidth, height);
    }
  }

  cycleVisualizerType() {
    if (!this.visualizerEnabled) return;

    const types = ['bars', 'wave', 'circular'];
    const currentIndex = types.indexOf(this.visualizerType);
    const nextIndex = (currentIndex + 1) % types.length;
    this.visualizerType = types[nextIndex];

    // console.log(`🎨 Visualizer type changed to: ${this.visualizerType}`);
    this.app.showNotification(`Visualizer: ${this.visualizerType}`, 'info');
  }

  // Ctrl+V: tear the visualizer all the way down (animation, audio graph, context)
  // and bring it back up from scratch. For when it's gotten into a stuck/silent state.
  async restartVisualizer() {
    console.log('🔄 Restarting visualizer...');
    const wasEnabled = this.visualizerEnabled;

    this.stopVisualizerAnimation();
    this.cleanupVisualizer(); // closes audioContext, clears analyser/audioSource
    this.visualizerEnabled = false;
    if (this.visualizerContainer) this.visualizerContainer.classList.add('hidden');
    if (this.visualizerBtn) this.visualizerBtn.classList.remove('active');

    if (wasEnabled) {
      await this.toggleVisualizer(); // re-runs setupAudioContext + starts animation
      this.app.showNotification('Visualizer restarted', 'success');
    } else {
      this.app.showNotification('Visualizer was off — nothing to restart', 'info');
    }
  }

  // Dev helper (window.debugVisualizer()) — snapshot of visualizer state for troubleshooting.
  debugVisualizerStatus() {
    const status = {
      visualizerEnabled: this.visualizerEnabled,
      visualizerType: this.visualizerType,
      hasCanvas: !!this.canvas,
      hasAudioContext: !!this.audioContext,
      audioContextState: this.audioContext?.state || 'none',
      hasAnalyser: !!this.analyser,
      hasAudioSource: !!this.audioSource,
      hasDataArray: !!this.dataArray,
      animationRunning: !!this.visualizerAnimationId,
      audioPlayerPaused: this.audioPlayer ? this.audioPlayer.paused : 'no audio element',
    };
    console.log('🎨 Visualizer status:', status);
    return status;
  }

  // Dev helper (window.testVisualizer()) — forces the visualizer on against whatever
  // is currently loaded and reports whether the analyser is actually seeing audio data.
  async testVisualizerWithCurrentAudio() {
    if (!this.audioPlayer || !this.currentTrack) {
      const message = 'No track loaded — load a track before testing the visualizer';
      console.warn('🎨', message);
      return { success: false, message };
    }

    if (!this.visualizerEnabled) {
      await this.toggleVisualizer();
    }

    if (!this.analyser || !this.dataArray) {
      const message = 'Visualizer failed to initialize (no analyser/data array)';
      console.error('🎨', message);
      return { success: false, message };
    }

    this.analyser.getByteFrequencyData(this.dataArray);
    const hasAudio = this.dataArray.some((value) => value > 0);
    const result = {
      success: true,
      hasAudioData: hasAudio,
      audioContextState: this.audioContext?.state,
      isPlaying: !this.audioPlayer.paused,
      message: hasAudio
        ? 'Visualizer is receiving audio data'
        : 'Visualizer enabled but not seeing audio data yet — is the track actually playing?',
    };
    console.log('🎨 Visualizer test result:', result);
    return result;
  }

  setupCanvasResize() {
    const resizeCanvas = () => {
      if (!this.canvas) return;

      // Get exact container dimensions
      const containerRect = this.visualizerContainer.getBoundingClientRect();
      const width = Math.floor(containerRect.width);
      const height = Math.floor(containerRect.height);

      // console.log(`🎨 Resizing canvas to: ${width}x${height}`);

      // Set canvas resolution
      this.canvas.width = width;
      this.canvas.height = height;

      // Set CSS size to match
      this.canvas.style.width = width + 'px';
      this.canvas.style.height = height + 'px';

      // Redraw current state
      if (this.visualizerEnabled) {
        // Animation loop will handle redraw
      } else {
        this.drawStaticState();
      }
    };

    // Initial resize
    setTimeout(resizeCanvas, 100);

    // Resize on window resize with debouncing
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(resizeCanvas, 100);
    });

    // Resize when visualizer becomes visible
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          setTimeout(resizeCanvas, 50);
        }
      });
    });

    observer.observe(this.visualizerContainer, { attributes: true });
  }

  async ensureVisualizerConnection() {
    if (!this.audioContext || !this.audioPlayer) return;

    try {
      // Resume audio context if suspended
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
        // console.log('🎨 Audio context resumed for new track');
      }

      // Verify connection exists
      if (!this.audioSource) {
        // console.log('🔗 Reconnecting audio source to visualizer');
        await this.setupAudioContext();
      }

      // this.app.logger.info(' Visualizer connection verified');
    } catch (error) {
      this.app.logger.error('❌ Failed to ensure visualizer connection:', error);
    }
  }

  async prepareVisualizerForNewTrack() {
    try {
      // console.log('🎨 Preparing visualizer for new track...');

      // Ensure audio context is ready
      if (this.audioContext && this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // Reset any visualizer state if needed
      if (this.dataArray) {
        this.dataArray.fill(0); // Clear old frequency data
      }

      // this.app.logger.info(' Visualizer prepared for new track');
    } catch (error) {
      this.app.logger.error('❌ Failed to prepare visualizer:', error);
    }
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // Enhanced cleanup method to prevent memory leaks and crashes
  cleanup() {
    console.log('🧹 Enhanced cleanup starting...');

    try {
      // Clear all timeouts to prevent orphaned operations
      if (this.saveStateTimeout) {
        clearTimeout(this.saveStateTimeout);
        this.saveStateTimeout = null;
      }

      if (this.playTrackingTimeout) {
        clearTimeout(this.playTrackingTimeout);
        this.playTrackingTimeout = null;
      }

      // Stop and cleanup audio player properly
      if (this.audioPlayer) {
        // Remove all event listeners to prevent memory leaks
        this.teardownAudioEvents();

        // Stop playback and clear source
        this.audioPlayer.pause();
        this.audioPlayer.src = '';
        this.audioPlayer.load(); // Force reload to clear any cached data
      }

      // Cleanup visualizer completely
      this.cleanupVisualizer();

      // Clear all arrays and objects to free memory
      this.playlist = [];
      this.originalPlaylist = [];
      this.currentTrack = null;
      this.dataArray = null;

      // Reset state variables
      this.isPlaying = false;
      this.currentTrackIndex = -1;
      this.duration = 0;
      this.currentTime = 0;

      this.app.logger.info(' Enhanced CoreAudio cleanup complete');
    } catch (error) {
      this.app.logger.error('❌ Error during cleanup:', error);
    }
  }

  // Separate visualizer cleanup method
  cleanupVisualizer() {
    try {
      // Stop animation frame
      if (this.visualizerAnimationId) {
        cancelAnimationFrame(this.visualizerAnimationId);
        this.visualizerAnimationId = null;
      }

      // Disconnect audio source if connected
      if (this.audioSource) {
        try {
          this.audioSource.disconnect();
        } catch (e) {
          // Ignore disconnect errors
        }
        this.audioSource = null;
      }

      // Close audio context properly
      if (this.audioContext && this.audioContext.state !== 'closed') {
        try {
          this.audioContext.close();
        } catch (e) {
          this.app.logger.warn('⚠️ Error closing audio context:', e);
        }
        this.audioContext = null;
      }

      // Clear analyser
      this.analyser = null;

      console.log('🎨 Visualizer cleanup complete');
    } catch (error) {
      this.app.logger.error('❌ Error during visualizer cleanup:', error);
    }
  }

  // Periodic memory cleanup method (call every few songs)
  performPeriodicCleanup() {
    try {
      console.log('🧹 Performing periodic memory cleanup...');

      // Force garbage collection if available (for development)
      if (window.gc && typeof window.gc === 'function') {
        window.gc();
      }

      // Restart audio context if it's in a bad state
      if (this.audioContext && this.audioContext.state === 'suspended') {
        console.log('🔄 Restarting suspended audio context...');
        this.setupAudioContext();
      }

      this.app.logger.info(' Periodic cleanup complete');
    } catch (error) {
      this.app.logger.error('❌ Error during periodic cleanup:', error);
    }
  }

  // ========================================
  // FAVORITES & RECENTLY PLAYED INTEGRATION
  // ========================================

  /**
   * Initialize favorites and recently played tracking
   */
  initializeFavoritesTracking() {
    // console.log('⭐ Initializing favorites and recently played tracking...');

    // Set up favorite button
    this.setupFavoriteButton();

    // Track when songs are played
    this.setupPlayTracking();

    // this.app.logger.info(' Favorites tracking initialized');
  }

  /**
   * Set up the favorite button in the player
   */
  setupFavoriteButton() {
    const favoriteBtn = document.getElementById('favoriteBtn');
    if (favoriteBtn) {
      // Remove any existing listeners
      const newBtn = favoriteBtn.cloneNode(true);
      favoriteBtn.parentNode.replaceChild(newBtn, favoriteBtn);

      // Add click listener
      newBtn.addEventListener('click', () => {
        // console.log('⭐ Favorite button clicked');
        this.toggleFavorite();
      });

      // console.log('⭐ Favorite button event listener added');
    } else {
      this.app.logger.warn('⚠️ Favorite button not found during setup');
    }
  }
  /**
   * Set up play tracking for recently played
   */
  setupPlayTracking() {
    // Track when a song starts playing
    this.audioPlayer.addEventListener('play', () => {
      // Clear any existing timeout
      if (this.playTrackingTimeout) {
        clearTimeout(this.playTrackingTimeout);
        this.playTrackingTimeout = null;
      }

      // Record play after 3 seconds instead of 5 for better responsiveness
      this.playTrackingTimeout = setTimeout(async () => {
        if (this.currentTrack) {
          // console.log(`🕒 Recording play for: ${this.currentTrack}`);
          await this.recordTrackPlay(this.currentTrack);
        }
      }, 3000); // Reduced from 5000 to 3000
    });

    // Clear timeout if paused or stopped before 3 seconds
    this.audioPlayer.addEventListener('pause', () => {
      if (this.playTrackingTimeout) {
        clearTimeout(this.playTrackingTimeout);
        this.playTrackingTimeout = null;
      }
    });

    // Also track when song ends naturally (immediate recording)
    this.audioPlayer.addEventListener('ended', async () => {
      // Clear timeout since we're recording immediately
      if (this.playTrackingTimeout) {
        clearTimeout(this.playTrackingTimeout);
        this.playTrackingTimeout = null;
      }

      if (this.currentTrack) {
        // console.log(`🕒 Recording completed play for: ${this.currentTrack}`);
        await this.recordTrackPlay(this.currentTrack);
      }
    });

    // console.log('🕒 Play tracking event listeners added');
  }

  /**
   * Toggle favorite status of the currently playing track
   */
  async toggleCurrentTrackFavorite() {
    if (!this.currentTrack) {
      this.app.showNotification('No track currently selected', 'info');
      return;
    }

    try {
      // console.log(`⭐ Toggling favorite for: ${this.currentTrack}`);

      const result = await window.queMusicAPI.favorites.toggle(this.currentTrack);

      const trackName = this.getTrackDisplayName();
      const message = result.added
        ? `Added "${trackName}" to favorites`
        : `Removed "${trackName}" from favorites`;

      this.app.showNotification(message, 'success');

      // Update the favorite button appearance
      this.updateFavoriteButton(result.added || !result.removed);

      // console.log(`⭐ Favorite toggled: ${result.added ? 'added' : 'removed'}`);
    } catch (error) {
      this.app.logger.error('❌ Error toggling favorite:', error);
      this.app.showNotification('Failed to update favorites', 'error');
    }
  }

  /**
   * Update the favorite button appearance based on favorite status
   */
  async updateFavoriteButton(isFavorite = null) {
    const favoriteBtn = document.getElementById('favoriteBtn');

    if (!favoriteBtn) {
      this.app.logger.warn('⚠️ Favorite button not found');
      return;
    }

    // CRITICAL FIX: If favorite status not provided, get fresh state from database
    if (isFavorite === null && this.currentTrack) {
      try {
        // console.log(`⭐ Getting fresh favorite state for button update...`);
        isFavorite = await window.queMusicAPI.favorites.isFavorite(this.currentTrack);
        // console.log(`⭐ Fresh database state: ${isFavorite ? 'favorited' : 'not favorited'}`);
      } catch (error) {
        this.app.logger.error('❌ Error checking favorite status for button update:', error);
        isFavorite = false;
      }
    }

    // CRITICAL FIX: Default to false if still null
    if (isFavorite === null) {
      isFavorite = false;
    }

    // Update button appearance
    const svg = favoriteBtn.querySelector('svg polygon');

    if (isFavorite) {
      favoriteBtn.classList.add('favorited');
      favoriteBtn.title = 'Remove from Favorites';
      if (svg) {
        svg.setAttribute('fill', 'currentColor');
      }
      // console.log('⭐ Favorite button: favorited state (gold star)');
    } else {
      favoriteBtn.classList.remove('favorited');
      favoriteBtn.title = 'Add to Favorites';
      if (svg) {
        svg.removeAttribute('fill');
      }
      // console.log('💔 Favorite button: not favorited state (transparent star)');
    }
  }

  /**
   * Toggle favorite status of current track
   */
  async toggleFavorite() {
    if (!this.currentTrack) {
      // this.app.logger.warn('⚠️ No current track to favorite');
      this.app.showNotification('No track selected', 'warning');
      return;
    }

    // console.log(`⭐ Toggling favorite for: ${this.currentTrack}`);

    try {
      // CRITICAL FIX: Always check fresh database state before toggling
      // console.log(`⭐ Checking current database state...`);
      const currentlyFavorited = await window.queMusicAPI.favorites.isFavorite(this.currentTrack);
      // console.log(
      //   `⭐ Current database state: ${currentlyFavorited ? 'IS favorited' : 'NOT favorited'}`
      // );

      // CRITICAL FIX: Use fresh database state, not UI state
      let result;
      if (currentlyFavorited) {
        // Track is currently favorited, so remove it
        // console.log(`💔 Removing from favorites...`);
        result = await window.queMusicAPI.favorites.remove(this.currentTrack);
        result.removed = true;
        result.added = false;
      } else {
        // Track is not favorited, so add it
        // console.log(`⭐ Adding to favorites...`);
        result = await window.queMusicAPI.favorites.add(this.currentTrack);
        result.added = true;
        result.removed = false;
      }

      // console.log(`⭐ API result:`, result);

      if (result.success) {
        // CRITICAL FIX: Update UI based on what actually happened
        const newState = result.added || !result.removed;
        // console.log(`⭐ Updating UI to state: ${newState ? 'favorited' : 'not favorited'}`);

        // Update the favorite button state
        await this.updateFavoriteButton(newState);

        // Show user notification
        const message = result.added ? 'Added to favorites' : 'Removed from favorites';
        // console.log(`⭐ Operation completed: ${message}`);
        this.app.showNotification(message, 'success');

        // VERIFICATION: Double-check the database state after operation
        setTimeout(async () => {
          const verifyState = await window.queMusicAPI.favorites.isFavorite(this.currentTrack);
          // console.log(
          //   `⭐ VERIFICATION: Database state after operation: ${verifyState ? 'favorited' : 'not favorited'}`
          // );
          if (verifyState !== newState) {
            console.error(`❌ STATE MISMATCH! UI shows ${newState}, DB shows ${verifyState}`);
            // Fix the mismatch
            await this.updateFavoriteButton(verifyState);
          }
        }, 100);
      } else {
        this.app.logger.error('❌ Failed to toggle favorite:', result.error);
        this.app.showNotification('Failed to update favorites', 'error');
      }
    } catch (error) {
      this.app.logger.error('❌ Error toggling favorite:', error);
      this.app.showNotification('Failed to update favorites', 'error');
    }
  }

  /**
   * Record a track play in recently played
   */
  async recordTrackPlay(trackPath) {
    if (!trackPath) {
      this.app.logger.warn('⚠️ No track path provided for play recording');
      return;
    }

    try {
      // console.log(`🕒 Recording play for: ${trackPath}`);

      const result = await window.queMusicAPI.recentlyPlayed.add(trackPath);

      if (result.success) {
        console.log(`✅ Play recorded successfully for: ${trackPath}`);
      } else {
        console.error(`❌ Failed to record play: ${result.error}`);
      }
    } catch (error) {
      this.app.logger.error('❌ Error recording track play:', error);
      // Don't show user notification for this error as it's background functionality
    }
  }

  /**
   * Get display name for current track
   */
  getTrackDisplayName() {
    if (!this.currentTrack) return 'Unknown Track';

    // Try to get from current track metadata
    const titleElement = document.getElementById('currentTitle');
    if (titleElement && titleElement.textContent !== 'No track selected') {
      return titleElement.textContent;
    }

    // Fallback to filename
    const fileName = this.currentTrack.split('/').pop();
    return fileName.replace(/\.[^/.]+$/, ''); // Remove extension
  }

  /**
   * Enhanced loadTrack method that updates favorite button
   */
  async loadTrackWithFavoriteUpdate(trackPath) {
    // Call existing loadTrack logic if it exists, or implement basic loading
    this.currentTrack = trackPath;

    // Update favorite button for this track
    await this.updateFavoriteButton();

    // console.log(`🎵 Track loaded with favorite update: ${trackPath}`);
  }

  // ========================================
  // INTEGRATION WITH EXISTING METHODS
  // ========================================

  /**
   * Override or enhance existing playSong method
   * Add this logic to your existing playSong method in core-audio.js
   */
  async enhancePlaySongForTracking(songPath) {
    // Clear any existing play tracking timeout
    if (this.playTrackingTimeout) {
      clearTimeout(this.playTrackingTimeout);
      this.playTrackingTimeout = null;
    }

    // Set current track
    this.currentTrack = songPath;

    // Update favorite button for new track
    await this.updateFavoriteButton();

    // console.log(`🎵 Enhanced play song with tracking: ${songPath}`);
  }

  /**
   * Method to be called when track metadata is loaded
   */
  async onTrackMetadataLoaded(trackData) {
    // Update UI with track info
    this.updateNowPlayingDisplay(trackData);

    // Update favorite button
    await this.updateFavoriteButton();

    // console.log(`📊 Track metadata loaded:`, trackData);
  }

  /**
   * Update now playing display with track information
   */
  updateNowPlayingDisplay(trackData) {
    const titleElement = document.getElementById('currentTitle');
    const artistElement = document.getElementById('currentArtist');

    if (titleElement) {
      titleElement.textContent = trackData.title || trackData.name || 'Unknown Track';
    }

    if (artistElement) {
      artistElement.textContent = trackData.artist || 'Unknown Artist';
    }

    // console.log(`📺 Now playing display updated`);
  }

  /**
   * Clean up method for favorites tracking
   */
  cleanupFavoritesTracking() {
    // Clear any pending play tracking timeout
    if (this.playTrackingTimeout) {
      clearTimeout(this.playTrackingTimeout);
      this.playTrackingTimeout = null;
    }

    // console.log('🧹 Favorites tracking cleaned up');
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  /**
   * Check if current track is in favorites
   */
  async isCurrentTrackFavorite() {
    if (!this.currentTrack) return false;

    try {
      return await window.queMusicAPI.favorites.isFavorite(this.currentTrack);
    } catch (error) {
      this.app.logger.error('❌ Error checking if current track is favorite:', error);
      return false;
    }
  }

  /**
   * Get statistics for current track
   */
  async getCurrentTrackStats() {
    if (!this.currentTrack) return null;

    try {
      return await window.queMusicAPI.track.getStats(this.currentTrack);
    } catch (error) {
      this.app.logger.error('❌ Error getting current track stats:', error);
      return null;
    }
  }

  /**
   * Add a track to the real playback queue (up next, ahead of the playlist's
   * own next track). Distinct from `this.playlist`, which is the loaded
   * folder/playlist context — see the constructor comment on `this.queue`.
   * @param {string|Object} trackOrPath - Track path, or a track object (title/artist/album/duration/path)
   * @param {number} [index] - Position to insert at; defaults to the end of the queue
   */
  addToQueue(trackOrPath, index = this.queue.length) {
    try {
      const trackObject =
        typeof trackOrPath === 'string'
          ? { path: trackOrPath, name: this.app.getBasename(trackOrPath) }
          : {
              ...trackOrPath,
              name: trackOrPath.title || trackOrPath.name || this.app.getBasename(trackOrPath.path),
            };

      if (!trackObject.path) {
        throw new Error('No track path provided');
      }

      const existingIndex = this.queue.findIndex((track) => track.path === trackObject.path);
      if (existingIndex !== -1) {
        this.app.showNotification('Track already in queue', 'info');
        return;
      }

      const clampedIndex = Math.max(0, Math.min(index, this.queue.length));
      this.queue.splice(clampedIndex, 0, trackObject);
      this.app.showNotification(`Added "${trackObject.name}" to queue`, 'success');
      this.notifyQueueChanged();
    } catch (error) {
      this.app.logger.error('❌ Error adding track to queue:', error);
      this.app.showNotification('Failed to add track to queue', 'error');
    }
  }

  /**
   * Remove a track from the queue by its position.
   * @param {number} index
   */
  removeFromQueue(index) {
    if (index < 0 || index >= this.queue.length) return;
    const [removed] = this.queue.splice(index, 1);
    this.app.logger.debug(' Removed from queue:', removed?.path);
    this.notifyQueueChanged();
  }

  /**
   * Move a queued track from one position to another (drag-to-reorder).
   * @param {number} fromIndex
   * @param {number} toIndex
   */
  reorderQueue(fromIndex, toIndex) {
    if (
      fromIndex < 0 ||
      fromIndex >= this.queue.length ||
      toIndex < 0 ||
      toIndex >= this.queue.length
    ) {
      return;
    }
    const [moved] = this.queue.splice(fromIndex, 1);
    this.queue.splice(toIndex, 0, moved);
    this.notifyQueueChanged();
  }

  /**
   * Empty the queue without touching the loaded playlist or current playback.
   */
  clearQueue() {
    this.queue = [];
    this.notifyQueueChanged();
  }

  /**
   * @returns {Array} A shallow copy of the current queue, safe for a renderer to display.
   */
  getQueue() {
    return [...this.queue];
  }

  // Refreshes the persistent queue pane (4th column, always in the DOM) so
  // queue edits — add/remove/reorder/clear, or a queued track getting
  // consumed by nextTrack() — show up immediately.
  notifyQueueChanged() {
    if (this.app.uiController?.renderQueuePane) {
      this.app.uiController.renderQueuePane();
    }
  }
}

// Export for use in main app
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CoreAudio;
} else if (typeof window !== 'undefined') {
  window.CoreAudio = CoreAudio;
}
