// main-app.js - Main application class that coordinates all modules

class QueMusicApp {
  constructor() {
    // Basic state
    this.currentView = 'library';

    // Initialize modules
    this.coreAudio = new CoreAudio(this);
    this.libraryManager = new LibraryManager(this);
    this.uiController = new UIController(this);
    this.playlistRenderer = new PlaylistRenderer(this);
    this.helpManager = new HelpManager(this);

    // Initialize context menus
    this.uiController.initializeContextMenus();

    // Development debugging functions
    if (window.queMusicAPI?.system?.isDev) {
      window.manualSearchToggle = () => this.manualSearchToggle();
      window.forceSearchFocus = () => this.forceSearchFocus();
      window.testSearch = () => this.testSearch();
    }


    // Initialize
    this.init();
  }

  // ============================================================================
  // INITIALIZATION METHODS
  // ============================================================================

  async init() {
    // Setup global error handlers to prevent crashes
    this.setupGlobalErrorHandlers();

    await this.testAPI();
    this.setupEventListeners();

    this.coreAudio.initAudioEngine();
    this.uiController.initializeContextMenus();
    this.coreAudio.initializeVisualizer();

    this.initializeUI();

    await this.libraryManager.initializeSearch();

    // Initialize search fix
    this.initializeSearchFix();

    this.setupKeyboardShortcuts();

    await this.coreAudio.loadPlayerState();

    await this.playlistRenderer.initializePlaylists();

    // Initialize help system
    this.helpManager.init();

    await this.libraryManager.checkSavedMusicFolder();

    if (this.uiController.initializeContextMenus) {
      this.uiController.initializeContextMenus();
    }

    
    // Signal to main process that renderer is fully loaded and ready
    await this.signalRendererReady();
  }

  initializeUI() {
    // Set initial theme
    document.documentElement.setAttribute('data-theme', this.uiController.currentTheme);

    // Set active nav item
    this.updateActiveNavItem('library');
  }

  // Setup global error handlers to prevent crashes during playlist playback
  setupGlobalErrorHandlers() {
    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      console.error('🚨 Unhandled promise rejection:', event.reason);

      // Try to continue playing if it was an audio-related error
      if (this.coreAudio && this.coreAudio.isPlaying) {
        console.log('🎵 Attempting to recover from error...');
        try {
          // Perform emergency cleanup
          this.coreAudio.performPeriodicCleanup();
        } catch (cleanupError) {
          console.error('❌ Cleanup failed:', cleanupError);
        }
      }

      // Prevent the default unhandled rejection behavior
      event.preventDefault();
    });

    // Handle uncaught errors
    window.addEventListener('error', (event) => {
      console.error('🚨 Uncaught error:', event.error);

      // If it's an audio-related error, try to recover
      if (event.error && event.error.message &&
          (event.error.message.includes('audio') ||
           event.error.message.includes('media') ||
           event.error.message.includes('context'))) {
        console.log('🎵 Audio error detected, attempting recovery...');

        try {
          if (this.coreAudio) {
            this.coreAudio.cleanupVisualizer();
            // Try to continue with next track if we have a playlist
            if (this.coreAudio.playlist && this.coreAudio.playlist.length > 1) {
              setTimeout(() => {
                this.coreAudio.nextTrack();
              }, 1000);
            }
          }
        } catch (recoveryError) {
          console.error('❌ Recovery failed:', recoveryError);
        }
      }
    });

    // Set up memory pressure monitoring
    this.setupMemoryMonitoring();

    console.log('🛡️ Global error handlers and memory monitoring established');
  }

  // Monitor memory usage and perform cleanup when needed
  setupMemoryMonitoring() {
    // Check memory usage every 5 minutes during playback
    setInterval(() => {
      if (this.coreAudio && this.coreAudio.isPlaying) {
        try {
          // Check if performance.memory is available (Chromium-based)
          if (performance.memory) {
            const used = performance.memory.usedJSHeapSize;
            const limit = performance.memory.jsHeapSizeLimit;
            const percentage = (used / limit) * 100;

            console.log(`💾 Memory usage: ${(used / 1048576).toFixed(2)}MB (${percentage.toFixed(1)}%)`);

            // If memory usage is high, perform cleanup
            if (percentage > 75) {
              console.log('🧹 High memory usage detected, performing cleanup...');
              this.coreAudio.performPeriodicCleanup();
            }
          }
        } catch (error) {
          // Memory monitoring failed, continue silently
          console.warn('⚠️ Memory monitoring failed:', error);
        }
      }
    }, 300000); // 5 minutes
  }

  async testAPI() {
    try {
      if (window.queMusicAPI) {
        const appName = await window.queMusicAPI.app.getName();
        const version = await window.queMusicAPI.app.getVersion();
      } else {
        console.warn('⚠️ API not available - check preload script');
      }
    } catch (error) {
      console.error('❌ API test failed:', error);
    }
  }

  // ============================================================================
  // EVENT LISTENERS SETUP
  // ============================================================================

  setupEventListeners() {
    // Theme toggle
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
      themeToggle.addEventListener('click', () => this.uiController.toggleTheme());
    }

    // Navigation items
    document.querySelectorAll('.nav-item[data-view]').forEach((item) => {
      item.addEventListener('click', () => {
        const view = item.dataset.view;
        this.switchView(view);
      });
    });

    // Action items (Tools section)
    document.querySelectorAll('.nav-item[data-action]').forEach((item) => {
      item.addEventListener('click', () => {
        const action = item.dataset.action;
        this.handleAction(action);
      });
    });

    // Welcome screen button - remove duplicate handler since button has onclick
    const selectFolderBtn = document.getElementById('selectFolderBtn');
    if (selectFolderBtn && !selectFolderBtn.hasAttribute('onclick')) {
      selectFolderBtn.addEventListener('click', () => this.libraryManager.selectMusicFolder());
    }

    // Audio control buttons
    const playPauseBtn = document.getElementById('playPauseBtn');
    if (playPauseBtn) {
      playPauseBtn.addEventListener('click', () => this.coreAudio.togglePlayPause());
    }

    const nextBtn = document.getElementById('nextBtn');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => this.coreAudio.nextTrack());
    }

    const prevBtn = document.getElementById('prevBtn');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => this.coreAudio.previousTrack());
    }

    const shuffleBtn = document.getElementById('shuffleBtn');
    if (shuffleBtn) {
      shuffleBtn.addEventListener('click', () => this.coreAudio.toggleShuffle());
    }

    const repeatBtn = document.getElementById('repeatBtn');
    if (repeatBtn) {
      repeatBtn.addEventListener('click', () => this.coreAudio.toggleRepeat());
    }

    // Progress slider (for seeking)
    const progressSlider = document.getElementById('progressSlider');
    if (progressSlider) {
      progressSlider.addEventListener('input', (e) => {
        this.coreAudio.seek(parseFloat(e.target.value));
      });
    }

    // Volume slider
    const volumeSlider = document.getElementById('volumeSlider');
    if (volumeSlider) {
      volumeSlider.addEventListener('input', (e) => {
        this.coreAudio.setVolume(parseFloat(e.target.value));
      });
    }

    // Basic keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }

      if (e.code === 'KeyT' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.uiController.toggleTheme();
      }
    });

    const sortSelect = document.getElementById('sortBy');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        this.libraryManager.sortCurrentView(e.target.value);
      });
    }

    // Help button
    const helpBtn = document.getElementById('helpBtn');
    if (helpBtn) {
      helpBtn.addEventListener('click', () => {
        this.helpManager.showHelp();
      });
    }

    // Settings button
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        this.uiController.showSettingsModal();
      });
    }
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Only handle shortcuts when not typing in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          this.coreAudio.togglePlayPause();
          break;

        case 'ArrowRight':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            this.coreAudio.nextTrack();
          } else {
            e.preventDefault();
            this.coreAudio.seekForward();
          }
          break;

        case 'ArrowLeft':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            this.coreAudio.previousTrack();
          } else {
            e.preventDefault();
            this.coreAudio.seekBackward();
          }
          break;

        case 'ArrowUp':
          e.preventDefault();
          this.coreAudio.volumeUp();
          break;

        case 'ArrowDown':
          e.preventDefault();
          this.coreAudio.volumeDown();
          break;

        case 'KeyS':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            this.coreAudio.toggleShuffle();
          }
          break;

        case 'KeyR':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            this.coreAudio.toggleRepeat();
          }
          break;

        case 'KeyV':
          if (e.shiftKey) {
            e.preventDefault();
            if (this.coreAudio.visualizerEnabled) {
              this.coreAudio.cycleVisualizerType();
            }
          } else if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            this.coreAudio.restartVisualizer();
          } else {
            e.preventDefault();
            this.coreAudio.toggleVisualizer();
          }
          break;
      }
    });

  }

  // ============================================================================
  // SEARCH FUNCTIONALITY
  // ============================================================================

  initializeSearchFix() {

    // Wait for DOM to be fully ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.initializeSearchFix());
      return;
    }

    // Wait a bit more to ensure all components are loaded
    setTimeout(() => {
      // Ensure search is properly initialized
      if (this.libraryManager) {
        // Search initialization already handled in main init sequence
      }

      // Add global click handler to close search when clicking outside
      document.addEventListener('click', (e) => {
        const searchContainer = document.getElementById('searchContainer');
        const searchBtn = document.getElementById('searchBtn');

        if (searchContainer && !searchContainer.classList.contains('hidden')) {
          // If click is outside search container and not on search button
          if (!searchContainer.contains(e.target) && e.target !== searchBtn) {
            if (this.libraryManager) {
              this.libraryManager.closeSearch();
            }
          }
        }
      });

      if (window.queMusicAPI?.system?.isDev) {
        this.setupSearchInputDebug();
      }
    }, 1000);
  }

  setupSearchInputDebug() {
    const debugSearchInput = () => {
      const searchInput = document.getElementById('searchInput');
      if (searchInput) {
      }
    };

    // Add debugging command to console
    window.debugSearch = debugSearchInput;
  }

  // ============================================================================
  // NAVIGATION AND VIEW MANAGEMENT
  // ============================================================================

  handleAction(action) {
    switch (action) {
      case 'select-folder':
        this.libraryManager.selectMusicFolder();
        break;
      case 'database':
        this.libraryManager.openDatabaseManager();
        break;
      default:
        this.showNotification(`${action} - Coming soon!`);
    }
  }

  switchView(view) {
    this.uiController.switchView(view);
  }

  updateActiveNavItem(view) {
    this.uiController.updateActiveNavItem(view);
  }

  updateContentHeader(view) {
    this.uiController.updateContentHeader(view);
  }

  // ============================================================================
  // AUDIO PLAYBACK DELEGATION
  // ============================================================================

  async playSong(songPath, addToPlaylist = true) {
    return this.coreAudio.playSong(songPath, addToPlaylist);
  }

  async loadTrack(trackPath) {
    return this.coreAudio.loadTrack(trackPath);
  }

  togglePlayPause() {
    return this.coreAudio.togglePlayPause();
  }

  nextTrack() {
    return this.coreAudio.nextTrack();
  }

  previousTrack() {
    return this.coreAudio.previousTrack();
  }

  toggleShuffle() {
    return this.coreAudio.toggleShuffle();
  }

  toggleRepeat() {
    return this.coreAudio.toggleRepeat();
  }

  setVolume(value) {
    return this.coreAudio.setVolume(value);
  }

  seek(percent) {
    return this.coreAudio.seek(percent);
  }

  updatePlayPauseButton() {
    return this.coreAudio.updatePlayPauseButton();
  }

  updateVolumeIcon() {
    return this.coreAudio.updateVolumeIcon();
  }

  updateTimeDisplay() {
    return this.coreAudio.updateTimeDisplay();
  }

  updateProgressBar() {
    return this.coreAudio.updateProgressBar();
  }

  updateShuffleButton() {
    return this.coreAudio.updateShuffleButton();
  }

  shufflePlaylist() {
    return this.coreAudio.shufflePlaylist();
  }

  // Visualizer methods
  toggleVisualizer() {
    return this.coreAudio.toggleVisualizer();
  }

  cycleVisualizerType() {
    return this.coreAudio.cycleVisualizerType();
  }

  restartVisualizer() {
    return this.coreAudio.restartVisualizer();
  }

  // ============================================================================
  // PLAYLIST MANAGEMENT DELEGATION
  // ============================================================================

  selectPlaylist(playlistId) {
    return this.playlistRenderer.selectPlaylist(playlistId);
  }

  loadPlaylistTracks(playlistId) {
    return this.playlistRenderer.loadPlaylistTracks(playlistId);
  }

  async playPlaylist(startIndex = 0) {

    if (this.playlistRenderer && this.playlistRenderer.playPlaylist) {
      return this.playlistRenderer.playPlaylist(startIndex);
    } else {
      console.error('❌ PlaylistRenderer or playPlaylist method not available');
    }
  }

  shuffleAndPlay() {
    if (!this.coreAudio.playlist || this.coreAudio.playlist.length === 0) {
      console.warn('⚠️ No tracks in playlist to shuffle');
      return;
    }

    // Enable shuffle mode
    this.coreAudio.shuffle = true;
    this.coreAudio.updateShuffleButton();

    // Shuffle the playlist
    this.coreAudio.originalPlaylist = [...this.coreAudio.playlist];
    this.coreAudio.shufflePlaylist();

    // Play from first track of shuffled playlist
    this.playPlaylist(0);

  }

  updatePlaylistTrackHighlight() {
    // Remove all previous highlights
    const trackItems = document.querySelectorAll('.track-item');
    trackItems.forEach((item) => {
      item.classList.remove('playing', 'selected');
    });

    // Highlight current playing track
    if (this.coreAudio.currentTrackIndex >= 0) {
      const currentTrackItem = document.querySelector(
        `[data-track-index="${this.coreAudio.currentTrackIndex}"]`
      );
      if (currentTrackItem) {
        if (this.coreAudio.isPlaying) {
          currentTrackItem.classList.add('playing');
        } else {
          currentTrackItem.classList.add('selected');
        }
      }
    }
  }

  async removeTrackFromCurrentPlaylist(trackIndex) {
    return this.playlistRenderer.removeTrackFromCurrentPlaylist(trackIndex);
  }

  selectPlaylistTrack(trackIndex) {
    return this.playlistRenderer.selectPlaylistTrack(trackIndex);
  }

  async updateNowPlayingInfo(track) {
    return this.playlistRenderer.updateNowPlayingInfo(track);
  }

  // ============================================================================
  // UI DELEGATION
  // ============================================================================

  loadAlbumArt(track) {
    return this.uiController.loadAlbumArt(track);
  }

  toggleTheme() {
    return this.uiController.toggleTheme();
  }

  showSettingsModal() {
    return this.uiController.showSettingsModal();
  }

  showTrackContextMenu(event, track) {
    return this.uiController.showTrackContextMenu(event, track);
  }

  addTrackToPlaylistFromContext(playlistId) {
    return this.uiController.addTrackToPlaylistFromContext(playlistId);
  }

  clearMainContent() {
    return this.uiController.clearMainContent();
  }

  // ============================================================================
  // LIBRARY MANAGEMENT DELEGATION
  // ============================================================================

  selectMusicFolder() {
    return this.libraryManager.selectMusicFolder();
  }

  openDatabaseManager() {
    return this.libraryManager.openDatabaseManager();
  }

  toggleSearch() {
    return this.libraryManager.toggleSearch();
  }

  closeSearch() {
    return this.libraryManager.closeSearch();
  }

  displaySearchResults(results, query) {
    return this.libraryManager.displaySearchResults(results, query);
  }

  showEmptyLibraryState() {
    return this.libraryManager.showEmptyLibraryState();
  }

  hideWelcomeScreen() {
    return this.libraryManager.hideWelcomeScreen();
  }

  // ============================================================================
  // MODULE ACCESS PROPERTIES
  // ============================================================================

  // Current view state
  get currentView() {
    return this._currentView;
  }

  set currentView(value) {
    this._currentView = value;
  }

  // Playlist state (accessed by multiple modules)
  get playlist() {
    return this.coreAudio.playlist;
  }

  set playlist(value) {
    // Clear existing playlist before setting new one
    this.coreAudio.clearPlaylist();
    this.coreAudio.playlist = value;
  }

  get currentTrackIndex() {
    return this.coreAudio.currentTrackIndex;
  }

  set currentTrackIndex(value) {
    this.coreAudio.currentTrackIndex = value;
  }

  get currentTrack() {
    return this.coreAudio.currentTrack;
  }

  set currentTrack(value) {
    this.coreAudio.currentTrack = value;
  }

  get isPlaying() {
    return this.coreAudio.isPlaying;
  }

  set isPlaying(value) {
    this.coreAudio.isPlaying = value;
  }

  get audioPlayer() {
    return this.coreAudio.audioPlayer;
  }

  // ============================================================================
  // ALBUM ART INTEGRATION
  // ============================================================================

  async initAlbumArtIntegration() {

    // Just show placeholder initially
    this.uiController.showAlbumArtPlaceholder();

  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  async signalRendererReady() {
    try {
      if (window.queMusicAPI?.app?.rendererReady) {
        await window.queMusicAPI.app.rendererReady();
      } else {
        console.warn('⚠️ Renderer ready API not available');
      }
    } catch (error) {
      console.error('❌ Error signaling renderer ready:', error);
    }
  }

  getBasename(filepath) {
    if (!filepath) return '';
    return filepath.split(/[/\\]/).pop();
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  showNotification(message, type = 'info', duration = 4000) {
    // Ensure notification container exists
    let container = document.getElementById('notification-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'notification-container';
      container.className = 'notification-container top-center';
      container.style.zIndex = '9998'; // Just below modals
      container.style.position = 'fixed';
      container.style.top = '20px';
      container.style.left = '50%';
      container.style.transform = 'translateX(-50%)';
      container.style.pointerEvents = 'none'; // Allow clicks through container
      document.body.appendChild(container);
    }

    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.style.pointerEvents = 'auto'; // Make notification clickable

    // Create notification content with proper structure
    const content = document.createElement('div');
    content.className = 'notification-content';

    const messageEl = document.createElement('div');
    messageEl.className = 'notification-message';
    messageEl.textContent = message;

    // Add close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'notification-close';
    closeBtn.innerHTML = '×';
    closeBtn.setAttribute('aria-label', 'Close notification');

    content.appendChild(messageEl);
    notification.appendChild(content);
    notification.appendChild(closeBtn);

    // Add to container (at the top)
    container.insertBefore(notification, container.firstChild);

    // Auto-show after a brief delay for animation
    setTimeout(() => {
      notification.classList.add('show');
    }, 10);

    // Auto-dismiss functionality
    const dismiss = () => {
      if (notification.parentNode) {
        notification.classList.remove('show');
        notification.classList.add('hide');
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
        }, 300);
      }
    };

    // Auto-dismiss after duration
    const dismissTimer = setTimeout(dismiss, duration);

    // Manual dismiss on close button
    closeBtn.addEventListener('click', () => {
      clearTimeout(dismissTimer);
      dismiss();
    });

    // Pause auto-dismiss on hover
    notification.addEventListener('mouseenter', () => {
      clearTimeout(dismissTimer);
    });

    // Resume auto-dismiss on mouse leave (with remaining time)
    notification.addEventListener('mouseleave', () => {
      setTimeout(dismiss, 1000); // Give 1 second before dismissing
    });

    return notification;
  }

  // ============================================================================
  // ERROR HANDLING
  // ============================================================================

  handleError(error, context = 'Unknown') {
    console.error(`❌ Error in ${context}:`, error);
    this.showNotification(`Error: ${error.message || 'Unknown error'}`, 'error');

    // Log additional debug info
    if (typeof error === 'object') {
      console.error('Error details:', {
        stack: error.stack,
        context,
        appState: this.getDebugInfo(),
      });
    }
  }

  // ============================================================================
  // DEVELOPMENT METHODS
  // ============================================================================

  // Alternative manual search toggle for debugging
  manualSearchToggle() {

    const searchContainer = document.getElementById('searchContainer');
    const searchInput = document.getElementById('searchInput');

    if (!searchContainer) {
      console.error('❌ Search container not found');
      return;
    }

    if (searchContainer.classList.contains('hidden')) {
      searchContainer.classList.remove('hidden');

      if (searchInput) {
        searchInput.focus();
        searchInput.click();

        // Force cursor visibility
        searchInput.style.caretColor = 'auto';
        searchInput.style.cursor = 'text';

      }
    } else {
      searchContainer.classList.add('hidden');
    }
  }

  // Force focus function for debugging
  forceSearchFocus() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      // Remove and re-add to DOM to reset any stuck states
      const parent = searchInput.parentNode;
      const clone = searchInput.cloneNode(true);
      parent.replaceChild(clone, searchInput);

      // Re-setup events
      if (this.libraryManager) {
        this.libraryManager.setupSearchInputEvents(clone.closest('.search-container'));
      }

      // Focus the new element
      setTimeout(() => {
        clone.focus();
        clone.click();
      }, 10);
    }
  }

  testSearch() {
    // Test if search input is focusable and functional
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      // Try to focus and set a test value
      searchInput.focus();
      searchInput.value = 'test-search';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    if (this.libraryManager && this.libraryManager.toggleSearch) {
      try {
        this.libraryManager.toggleSearch();
      } catch (error) {
        console.error('❌ Error in direct toggleSearch:', error);
      }
    } else {
      console.error('❌ LibraryManager or toggleSearch method not found');
    }
  }

  getDebugInfo() {
    return {
      currentView: this.currentView,
      playlist: this.playlist,
      currentTrackIndex: this.currentTrackIndex,
      currentTrack: this.currentTrack,
      isPlaying: this.isPlaying,
      volume: this.coreAudio.volume,
      shuffle: this.coreAudio.shuffle,
      repeat: this.coreAudio.repeat,
      visualizerEnabled: this.coreAudio.visualizerEnabled,
      theme: this.uiController.currentTheme,
    };
  }

  debugVisualizer() {
    return this.coreAudio.debugVisualizerStatus();
  }

  testVisualizer() {
    return this.coreAudio.testVisualizerWithCurrentAudio();
  }

  checkModuleStatus() {
    const status = {
      coreAudio: !!this.coreAudio,
      libraryManager: !!this.libraryManager,
      uiController: !!this.uiController,
      playlistRenderer: !!this.playlistRenderer,
      audioPlayerReady: !!this.coreAudio?.audioPlayer,
      visualizerReady: !!this.coreAudio?.canvas,
    };

    return status;
  }

  verifyInitialization() {
    const checks = [
      { name: 'Core Audio', status: !!this.coreAudio && !!this.coreAudio.audioPlayer },
      { name: 'Library Manager', status: !!this.libraryManager },
      { name: 'UI Controller', status: !!this.uiController },
      { name: 'Playlist Renderer', status: !!this.playlistRenderer },
      { name: 'API Connection', status: !!window.queMusicAPI },
      { name: 'Theme System', status: document.documentElement.hasAttribute('data-theme') },
    ];

    checks.forEach((check) => {
      const icon = check.status ? '✅' : '❌';
    });

    const allPassed = checks.every((check) => check.status);
    if (allPassed) {
    } else {
      console.warn('⚠️ Some systems failed initialization');
    }

    return allPassed;
  }

  // ============================================================================
  // CLEANUP AND SHUTDOWN
  // ============================================================================

  cleanup() {

    // Cleanup all modules
    this.coreAudio.cleanup();

    // Additional cleanup
    document.removeEventListener('keydown', this.keyboardHandler);

  }
}

// ============================================================================
// GLOBAL DOM PROTECTION FUNCTIONS
// ============================================================================

// Global DOM protection function
window.ensureCorrectDOMStructure = function () {
  const mainContent = document.getElementById('mainContent');

  // Check if the required elements exist
  const welcomeScreen = document.getElementById('welcomeScreen');
  const dualPaneLayout = document.getElementById('dualPaneLayout');

  if (!welcomeScreen || !dualPaneLayout) {

    mainContent.innerHTML = `
      <!-- Welcome Screen (show when no music folder selected) -->
      <div class="welcome-screen" id="welcomeScreen">
        <div class="welcome-content">
          <div class="welcome-icon">🎵</div>
          <h2>Welcome to Que-Music</h2>
          <p>Your modern music library manager</p>
          <button class="primary-btn" id="selectFolderBtn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"></path>
            </svg>
            Select Your Music Folder
          </button>
        </div>
      </div>

      <!-- Dual Pane Layout (show when music folder is selected) -->
      <div class="dual-pane-layout hidden" id="dualPaneLayout">
        <!-- Left Pane - Library/Playlists Browser -->
        <div class="left-pane" id="leftPane">
          <div class="pane-header">
            <h3 id="leftPaneTitle">Music Library</h3>
            <div class="pane-actions" id="leftPaneActions">
              <!-- Action buttons will be added dynamically -->
            </div>
          </div>
          <div class="pane-content" id="leftPaneContent">
            <!-- Library folders, playlists, or other browser content -->
          </div>
        </div>

        <!-- Right Pane - Song List/Playing Queue -->
        <div class="right-pane" id="rightPane">
          <div class="pane-header">
            <h3 id="rightPaneTitle">Select a folder or playlist</h3>
            <div class="pane-actions" id="rightPaneActions">
              <!-- Play controls, sort options, etc. -->
            </div>
          </div>
          <div class="pane-content" id="rightPaneContent">
            <!-- Song list from selected folder/playlist -->
            <div class="empty-pane">
              <div class="empty-pane-icon">🎵</div>
              <p>Select a folder or playlist to view songs</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Single Pane Layout (for search results, settings, etc.) -->
      <div class="single-pane-layout hidden" id="singlePaneLayout">
        <div class="single-pane-content" id="singlePaneContent">
          <!-- Search results, database manager, etc. -->
        </div>
      </div>
    `;

    // Re-setup welcome button
    const selectFolderBtn = document.getElementById('selectFolderBtn');
    if (selectFolderBtn) {
      selectFolderBtn.addEventListener('click', () => {
        if (window.app && window.app.libraryManager) {
          window.app.libraryManager.selectMusicFolder();
        }
      });
    }

    return true;
  }
  return false;
};

// Protect against methods that might destroy the DOM
window.protectDOMFromDestruction = function () {
  if (!window.app || !window.app.libraryManager) return;

  // Override any methods that try to replace mainContent.innerHTML completely
  const originalCreateFolderBrowser = window.app.libraryManager.createFolderBrowser;
  if (originalCreateFolderBrowser) {
    window.app.libraryManager.createFolderBrowser = function (folderTree, songs, currentPath) {

      // Ensure structure exists
      window.ensureCorrectDOMStructure();

      // Show dual pane and populate it safely
      const dualPaneLayout = document.getElementById('dualPaneLayout');
      const welcomeScreen = document.getElementById('welcomeScreen');

      if (welcomeScreen) welcomeScreen.classList.add('hidden');
      if (dualPaneLayout) dualPaneLayout.classList.remove('hidden');

      // Use the safe showLibraryView method instead
      this.showLibraryView();

      return; // Don't execute original method that destroys DOM
    };
  }

};

// ============================================================================
// INITIALIZATION
// ============================================================================

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {

  try {
    window.app = new QueMusicApp();

    // Verify initialization after a short delay
    setTimeout(() => {
      if (window.app) {
        window.app.verifyInitialization();

        // Development debugging helpers
        if (window.queMusicAPI?.system?.isDev && typeof window !== 'undefined') {
          window.debugApp = () => window.app.getDebugInfo();
          window.debugModules = () => window.app.checkModuleStatus();
          window.debugVisualizer = () => window.app.debugVisualizer();
          window.testVisualizer = () => window.app.testVisualizer();
        }
      }
    }, 1000);
  } catch (error) {
    console.error('💥 Failed to initialize Que-Music:', error);

    // Show user-friendly error
    document.body.innerHTML = `
      <div style="
        display: flex; 
        justify-content: center; 
        align-items: center; 
        height: 100vh; 
        flex-direction: column;
        font-family: system-ui;
        text-align: center;
        padding: 20px;
      ">
        <h1 style="color: #ff4444; margin-bottom: 20px;">⚠️ Initialization Failed</h1>
        <p style="margin-bottom: 20px;">Que-Music failed to start properly.</p>
        <button onclick="location.reload()" style="
          padding: 10px 20px; 
          font-size: 16px; 
          background: #007acc; 
          color: white; 
          border: none; 
          border-radius: 5px; 
          cursor: pointer;
        ">
          Reload Application
        </button>
        <details style="margin-top: 20px; text-align: left;">
          <summary style="cursor: pointer;">Show Error Details</summary>
          <pre style="
            background: #f5f5f5; 
            padding: 10px; 
            border-radius: 5px; 
            overflow: auto; 
            margin-top: 10px;
          ">${error.stack || error.message}</pre>
        </details>
      </div>
    `;
  }
});

window.protectDOMFromDestruction();

// Export for potential use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = QueMusicApp;
} else if (typeof window !== 'undefined') {
  window.QueMusicApp = QueMusicApp;
}
