// ui-controller.js - UI management, themes, navigation, context menus, and settings

class UIController {
  constructor(app) {
    this.app = app;
    this.currentTheme = 'dark';
    this.currentContextTrack = null;
    this.selectedTracks = []; // Track multiple selected tracks for batch operations
    this.albumArtCache = new Map();
    this.contextMenuInitialized = false;

    // Setup global click handler for context menu closing
    this.setupGlobalContextMenuCloseHandler();

    console.log('🎨 UIController initialized');
  }

  // Setup multiple approaches to ensure context menus close
  setupGlobalContextMenuCloseHandler() {
    // Approach 1: Standard event listeners (capture phase)
    const handleClick = (event) => {
      this.checkAndCloseContextMenus(event);
    };

    const handleRightClick = (event) => {
      this.checkAndCloseContextMenus(event);
    };

    document.addEventListener('click', handleClick, true);
    document.addEventListener('contextmenu', handleRightClick, true);

    // Approach 2: Use multiple event phases
    document.addEventListener('click', handleClick, false); // Bubble phase too
    
    // Approach 3: MouseDown events (these are harder to stop)
    document.addEventListener('mousedown', (event) => {
      // Only handle left clicks (button 0)
      if (event.button === 0) {
        // Small delay to let other handlers run first
        setTimeout(() => {
          this.checkAndCloseContextMenus(event);
        }, 1);
      }
    }, true);

    // Approach 4: Focus events (when clicking on other elements)
    document.addEventListener('focusin', (event) => {
      setTimeout(() => {
        this.checkAndCloseContextMenus(event);
      }, 1);
    }, true);

    // Approach 5: Keyboard events (Escape, zoom shortcuts, etc.)
    document.addEventListener('keydown', (event) => {
      // Close on Escape key
      if (event.key === 'Escape') {
        this.checkAndCloseContextMenus(event);
      }
      
      // Close on zoom shortcuts (Ctrl+Plus, Ctrl+Minus, Ctrl+0)
      if (event.ctrlKey && (event.key === '+' || event.key === '-' || event.key === '=' || event.key === '0')) {
        setTimeout(() => {
          this.checkAndCloseContextMenus(event);
        }, 10);
      }
    }, true);

    // Approach 6: All wheel events (any mouse wheel interaction)
    document.addEventListener('wheel', (event) => {
      // Close context menu on ANY wheel event, not just Ctrl+wheel
      setTimeout(() => {
        this.checkAndCloseContextMenus(event);
      }, 10);
    }, true);

    // Approach 7: All mouse button events
    document.addEventListener('mouseup', (event) => {
      // Catch middle mouse button, back/forward buttons, etc.
      if (event.button !== 0 && event.button !== 2) { // Not left or right click
        setTimeout(() => {
          this.checkAndCloseContextMenus(event);
        }, 10);
      }
    }, true);

    // Approach 8: Window events (resize, blur, etc.)
    window.addEventListener('resize', () => {
      this.checkAndCloseContextMenus({ target: document.body });
    });

    window.addEventListener('blur', () => {
      this.checkAndCloseContextMenus({ target: document.body });
    });

    // Approach 9: Monitor for viewport/zoom changes
    let lastZoom = window.devicePixelRatio;
    let lastViewportWidth = window.innerWidth;
    let lastViewportHeight = window.innerHeight;
    
    const checkViewportChanges = () => {
      const currentZoom = window.devicePixelRatio;
      const currentWidth = window.innerWidth;
      const currentHeight = window.innerHeight;
      
      if (currentZoom !== lastZoom) {
        this.checkAndCloseContextMenus({ target: document.body });
        lastZoom = currentZoom;
      }
      
      if (currentWidth !== lastViewportWidth || currentHeight !== lastViewportHeight) {
        this.checkAndCloseContextMenus({ target: document.body });
        lastViewportWidth = currentWidth;
        lastViewportHeight = currentHeight;
      }
    };

    // Check every 100ms for viewport changes (zoom, resize, etc.)
    setInterval(checkViewportChanges, 100);

    // Approach 10: Document visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        // When user comes back to the page, close context menus
        this.checkAndCloseContextMenus({ target: document.body });
      }
    });
  }

  // Centralized method to check if context menus should close
  checkAndCloseContextMenus(event) {
    const contextMenu = document.getElementById('songContextMenu');
    const playlistSubmenu = document.getElementById('playlistSubmenu');
    const customPlaylistMenu = document.getElementById('playlistTrackContextMenu');
    
    // Check if any context menu is currently visible
    const contextMenuVisible = contextMenu && contextMenu.style.display === 'block';
    const submenuVisible = playlistSubmenu && playlistSubmenu.style.display === 'block';
    const customMenuVisible = customPlaylistMenu && customPlaylistMenu.parentNode;
    
    if (contextMenuVisible || submenuVisible || customMenuVisible) {
      // Check if click was inside any context menu
      const clickedInContextMenu = contextMenu && contextMenu.contains(event.target);
      const clickedInSubmenu = playlistSubmenu && playlistSubmenu.contains(event.target);
      const clickedInCustomMenu = customPlaylistMenu && customPlaylistMenu.contains(event.target);
      
      // If click was outside all context menus, close them
      if (!clickedInContextMenu && !clickedInSubmenu && !clickedInCustomMenu) {
        this.app.logger.debug(' Closing context menu - outside click detected');
        this.hideAllContextMenus();
        // Also remove custom playlist menu if it exists
        if (customPlaylistMenu && customPlaylistMenu.parentNode) {
          customPlaylistMenu.remove();
        }
        return true; // Indicate that menus were closed
      }
    }
    return false; // No menus were closed
  }

  // ========================================
  // THEME SYSTEM
  // ========================================

  async toggleTheme() {
    this.currentTheme = this.currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', this.currentTheme);

    // Smooth transition
    document.body.classList.add('theme-transitioning');
    setTimeout(() => {
      document.body.classList.remove('theme-transitioning');
    }, 300);

    console.log(`🎨 Theme: ${this.currentTheme}`);
    this.app.showNotification(`Theme: ${this.currentTheme}`);

    // Reload header logo for new theme
    if (this.app.loadHeaderLogo) {
      await this.app.loadHeaderLogo();
    }
  }

  showThemeDropdown(event) {
    // Remove existing dropdown if any
    const existingDropdown = document.getElementById('themeDropdown');
    if (existingDropdown) {
      existingDropdown.remove();
      return;
    }

    // Create dropdown
    const dropdown = document.createElement('div');
    dropdown.id = 'themeDropdown';
    dropdown.className = 'theme-dropdown';
    dropdown.innerHTML = `
  <div class="dropdown-item ${this.currentTheme === 'light' ? 'active' : ''}" data-theme="light">
    <span class="theme-icon">☀️</span>
    Light
  </div>
  <div class="dropdown-item ${this.currentTheme === 'dark' ? 'active' : ''}" data-theme="dark">
    <span class="theme-icon">🌙</span>
    Dark
  </div>
  <div class="dropdown-item" data-theme="auto">
    <span class="theme-icon">🔄</span>
    Auto
  </div>
`;

    // Position dropdown
    const button = event.target.closest('button');
    const rect = button.getBoundingClientRect();
    dropdown.style.cssText = `
      position: fixed;
      top: ${rect.bottom + 5}px;
      left: ${rect.left}px;
      background: var(--background);
      border: 1px solid var(--border);
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 1000;
      min-width: 80px;
    `;

    // Add to page
    document.body.appendChild(dropdown);

    // Add click handlers
    dropdown.querySelectorAll('.dropdown-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        const theme = e.currentTarget.dataset.theme;
        this.applyTheme(theme);
        dropdown.remove();
      });
    });

    // Close on outside click
    setTimeout(() => {
      document.addEventListener(
        'click',
        (e) => {
          if (!dropdown.contains(e.target)) {
            dropdown.remove();
          }
        },
        { once: true }
      );
    }, 0);
  }

  applyTheme(theme) {
    if (theme === 'auto') {
      // Detect system theme
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.currentTheme = systemDark ? 'dark' : 'light';
    } else {
      this.currentTheme = theme;
    }

    document.documentElement.setAttribute('data-theme', this.currentTheme);

    // Smooth transition
    document.body.classList.add('theme-transitioning');
    setTimeout(() => {
      document.body.classList.remove('theme-transitioning');
    }, 300);

    console.log(`🎨 Theme: ${this.currentTheme}`);
    this.app.showNotification(`Theme: ${this.currentTheme}`);
  }

  // ========================================
  // NAVIGATION SYSTEM
  // ========================================

  switchView(view) {
    this.ensureCorrectDOMStructure();
    const previousView = this.app.currentView;
    console.log(`🔄 Switching from ${previousView} to ${view}`);

    // Store context when navigating away while music is playing
    if (
      this.app.coreAudio?.audio &&
      !this.app.coreAudio.audio.paused &&
      view !== 'now-playing' &&
      this.app.currentView
    ) {
      const currentTrack = this.app.coreAudio?.currentTrack || this.app.currentTrack?.path;

      if (currentTrack) {
        this.app.playbackContext = {
          view: this.app.currentView,
          playlist: this.app.playlist ? [...this.app.playlist] : null,
          playlistData: this.app.playlistRenderer?.currentPlaylistData || null,
          selectedFolder: this.app.libraryManager?.selectedFolder || null,
        };
        console.log(`💾 Stored playback context: ${this.app.currentView}`);
      }
    }
    // Handle discover view specially
    if (view === 'discover') {
      this.app.currentView = view;
      this.updateActiveNavItem(view);
      this.updateContentHeader(view);

      // Show single pane layout properly
      const welcomeScreen = document.getElementById('welcomeScreen');
      const dualPaneLayout = document.getElementById('dualPaneLayout');
      const singlePaneLayout = document.getElementById('singlePaneLayout');

      if (welcomeScreen) welcomeScreen.classList.add('hidden');
      if (dualPaneLayout) dualPaneLayout.classList.add('hidden');
      if (singlePaneLayout) singlePaneLayout.classList.remove('hidden');

      console.log('📱 Single pane layout shown for discover');

      // Add discover content to single pane
      const singlePaneContent = document.getElementById('singlePaneContent');
      if (singlePaneContent) {
        singlePaneContent.innerHTML = `
          <div class="discover-view" style="padding: 40px;">
            <div class="discover-header">
              <h2>🔍 Discover Your Music</h2>
              <p>Use advanced filters to explore your music collection</p>
            </div>
            
            <div class="discover-sections" style="margin-top: 30px;">
              <div class="discover-section">
                <h3>🎵 Browse by Genre</h3>
                <button class="btn-primary" onclick="window.app.libraryManager.showAdvancedFilters()" style="margin: 10px 0;">
                  Open Genre Browser
                </button>
              </div>
              
              <div class="discover-section" style="margin-top: 20px;">
                <h3>📅 Browse by Year</h3>
                <p>Explore music by decade or specific years</p>
              </div>
              
              <div class="discover-section" style="margin-top: 20px;">
                <h3>🎧 Browse by Format</h3>
                <p>Filter by audio format (MP3, FLAC, etc.)</p>
              </div>
            </div>
            
            <div style="margin-top: 40px; text-align: center;">
              <button class="btn-secondary" onclick="window.app.uiController.switchView('library')">
                ← Back to Library
              </button>
            </div>
          </div>
        `;
      }

      console.log(`📍 Discover view loaded successfully`);
      return;
    }

    this.app.currentView = view;
    this.updateActiveNavItem(view);
    this.updateContentHeader(view);

    // Clear search when switching views
    this.app.libraryManager.closeSearch();

    // Ensure correct DOM structure exists
    this.ensureCorrectDOMStructure();

    // ALWAYS show dual pane layout and hide welcome screen first
    this.showDualPaneView();

    // Handle different view types
    switch (view) {
      case 'artists':
        this.loadArtistsInLeftPane();
        this.clearRightPane('Select an artist to view their tracks');
        break;
      case 'albums':
        this.loadAlbumsInLeftPane();
        this.clearRightPane('Select an album to view its tracks');
        break;
      case 'library':
        this.showLibraryView();
        break;
      case 'playlists':
        this.showPlaylistsView();
        break;
      case 'favorites':
        this.showFavoritesInLeftPane();
        this.clearRightPane('Your favorite tracks will appear here');
        break;
      case 'recently-played':
        this.showRecentlyPlayedInLeftPane();
        this.clearRightPane('Your recently played tracks will appear here');
        break;
      case 'now-playing':
        this.switchToNowPlaying();
        break;
      default:
        this.showLibraryView();
    }

    setTimeout(() => {
      this.ensureContextMenuSystem();
    }, 200);
  }

  updateActiveNavItem(view) {
    document.querySelectorAll('.nav-item').forEach((item) => {
      item.classList.remove('active');
    });

    const activeItem = document.querySelector(`.nav-item[data-view="${view}"]`);
    if (activeItem) {
      activeItem.classList.add('active');
    }
  }

  updateContentHeader(view) {
    const title = document.getElementById('currentViewTitle');
    const subtitle = document.getElementById('currentViewSubtitle');

    const viewInfo = {
      library: { title: 'Music Library', subtitle: 'Browse your music collection' },
      favorites: { title: 'Favorites', subtitle: 'Your favorite tracks' },
      'recently-played': { title: 'Recently Played', subtitle: 'Recently listened tracks' },
      discover: { title: 'Discover', subtitle: 'Find new music recommendations' },
      artists: { title: 'Artists', subtitle: 'Browse by artist' },
      albums: { title: 'Albums', subtitle: 'Browse by album' },
      playlists: { title: 'Playlists', subtitle: 'Your custom playlists' },
      search: { title: 'Search Results', subtitle: 'Search results' },
    };

    const info = viewInfo[view] || viewInfo.library;
    if (title) title.textContent = info.title;
    if (subtitle) subtitle.textContent = info.subtitle;

    console.log(`📝 Header updated: ${info.title}`);
  }

  // REMOVED: Grid/List view toggle functionality
  // The app now uses list view by default (no toggle needed)

  showDualPaneView() {
    const welcomeScreen = document.getElementById('welcomeScreen');
    const dualPaneLayout = document.getElementById('dualPaneLayout');
    const singlePaneLayout = document.getElementById('singlePaneLayout');

    if (welcomeScreen) {
      welcomeScreen.classList.add('hidden');
      console.log('👋 Welcome screen hidden');
    }
    if (dualPaneLayout) {
      dualPaneLayout.classList.remove('hidden');
      console.log('📱 Dual pane layout shown');
    }
    if (singlePaneLayout) {
      singlePaneLayout.classList.add('hidden');
      console.log('📱 Single pane layout hidden');
    }
  }

  // Generic modal-overlay open/close (same fade pattern as HelpManager's
  // showModal/hideHelp) — for modals like Database Manager that sit on top
  // of whatever view is active instead of swapping it out.
  showModal(modal) {
    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.classList.add('show'));
    const modalContent = modal.querySelector('.modal-content');
    if (modalContent) modalContent.focus();
  }

  hideModal(modal) {
    modal.classList.remove('show');
    setTimeout(() => {
      modal.style.display = 'none';
    }, 300);
  }

  showSinglePaneView() {
    const welcomeScreen = document.getElementById('welcomeScreen');
    const dualPaneLayout = document.getElementById('dualPaneLayout');
    const singlePaneLayout = document.getElementById('singlePaneLayout');

    if (welcomeScreen) welcomeScreen.classList.add('hidden');
    if (dualPaneLayout) dualPaneLayout.classList.add('hidden');
    if (singlePaneLayout) singlePaneLayout.classList.remove('hidden');

    console.log('📱 Single pane layout shown');
  }

  clearRightPane(message = 'Select an item from the left to view details') {
    const rightPaneTitle = document.getElementById('rightPaneTitle');
    const rightPaneContent = document.getElementById('rightPaneContent');
    const rightPaneActions = document.getElementById('rightPaneActions');

    if (rightPaneTitle) rightPaneTitle.textContent = 'Details';
    if (rightPaneActions) rightPaneActions.innerHTML = '';

    if (rightPaneContent) {
      rightPaneContent.innerHTML = `
        <div class="empty-pane">
          <div class="empty-pane-icon">📂</div>
          <p>${message}</p>
        </div>
      `;
    }

    console.log(`🧹 Right pane cleared: ${message}`);
  }

  // ========================================
  // VIEW IMPLEMENTATIONS
  // ========================================

  async showLibraryView() {
    this.app.logger.info(' Loading library view...');

    const leftPaneTitle = document.getElementById('leftPaneTitle');
    const leftPaneActions = document.getElementById('leftPaneActions');

    if (leftPaneTitle) leftPaneTitle.textContent = 'Music Folders';
    if (leftPaneActions) leftPaneActions.innerHTML = '';

    // Clear any existing search results when returning to library view
    if (this.app.libraryManager && this.app.libraryManager.clearSearchResults) {
      this.app.libraryManager.clearSearchResults();
    }

    try {
      // Use the existing library manager method
      await this.app.libraryManager.showLibraryView();
    } catch (error) {
      this.app.logger.error('❌ Error loading library view:', error);
      this.showErrorInLeftPane('Failed to load music library');
    }
  }

  async showPlaylistsView() {
    console.log('📋 Loading playlists view...');

    const leftPaneTitle = document.getElementById('leftPaneTitle');
    const leftPaneContent = document.getElementById('leftPaneContent');
    const leftPaneActions = document.getElementById('leftPaneActions');

    if (leftPaneTitle) leftPaneTitle.textContent = 'All Playlists';

    // Add create playlist button to left pane actions
    if (leftPaneActions) {
      leftPaneActions.innerHTML = `
        <button class="btn-primary btn-sm" id="createPlaylistBtn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Create Playlist
        </button>
      `;

      // Add event listener
      const createBtn = document.getElementById('createPlaylistBtn');
      if (createBtn) {
        createBtn.addEventListener('click', () => {
          this.app.playlistRenderer.showPlaylistModal();
        });
        console.log('➕ Create playlist button added');
      }
    }

    // Load playlists in left pane
    if (leftPaneContent) {
      try {
        await this.loadPlaylistBrowser(leftPaneContent);
      } catch (error) {
        this.app.logger.error('❌ Error loading playlists:', error);
        this.showErrorInLeftPane('Failed to load playlists');
      }
    }

    // Clear right pane
    this.clearRightPane('Select a playlist to view its tracks');

    // Reconcile the database against the Playlists folder right when the
    // user actually looks at the list — not on every app launch, and not
    // silently in the background (Erich, 2026-09-17). Runs after the view
    // is already rendered so it never blocks getting to the playlist list.
    this.checkPlaylistFileSync();
  }

  // Neither the database nor the Playlists folder is trusted blindly — this
  // just surfaces where they disagree and lets Erich pick which one is right,
  // per playlist. "Not now" is remembered for the rest of the session so
  // re-opening the Playlists view doesn't re-nag about the same playlist;
  // regenerating or deleting actually resolves it so it won't come up again.
  async checkPlaylistFileSync() {
    if (!this._dismissedPlaylistSyncIds) this._dismissedPlaylistSyncIds = new Set();

    try {
      const { missingFiles } = await window.queMusicAPI.playlists.checkFileSync();
      if (!missingFiles || missingFiles.length === 0) return;

      const toAsk = missingFiles.filter((p) => !this._dismissedPlaylistSyncIds.has(p.id));
      if (toAsk.length === 0) return;

      let deletedAny = false;
      for (const p of toAsk) {
        const regenerate = confirm(
          `"${p.name}" has ${p.trackCount} track${p.trackCount === 1 ? '' : 's'} in the database, ` +
            `but its playlist file is missing from your Playlists folder.\n\n` +
            `Click OK to regenerate the file (keeps the playlist), or Cancel to decide whether to remove it from the app instead.`
        );

        if (regenerate) {
          try {
            await window.queMusicAPI.playlists.exportM3U(p.id);
            this.app.showNotification(`Regenerated "${p.name}".m3u`, 'success');
          } catch (err) {
            this.app.logger.error('Failed to regenerate playlist file', { error: err.message });
            this.app.showNotification(`Couldn't regenerate "${p.name}"`, 'error');
          }
          continue;
        }

        const remove = confirm(
          `Remove "${p.name}" from the app? This deletes it from the database only — ` +
            `the actual music files are never touched. This cannot be undone.`
        );

        if (remove) {
          try {
            await window.queMusicAPI.playlists.delete(p.id);
            deletedAny = true;
          } catch (err) {
            this.app.logger.error('Failed to delete playlist', { error: err.message });
            this.app.showNotification(`Couldn't remove "${p.name}"`, 'error');
          }
        } else {
          // Skipped both options — don't ask about this one again this session.
          this._dismissedPlaylistSyncIds.add(p.id);
        }
      }

      if (deletedAny) {
        const leftPaneContent = document.getElementById('leftPaneContent');
        if (leftPaneContent) await this.loadPlaylistBrowser(leftPaneContent);
      }
    } catch (err) {
      this.app.logger.error('Playlist file sync check failed', { error: err.message });
    }
  }

  async loadPlaylistBrowser(container) {
    try {
      // Show loading state
      container.innerHTML = `
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <p>Loading playlists...</p>
      </div>
    `;

      const playlists = await window.queMusicAPI.playlists.getAll();

      if (playlists.length === 0) {
        container.innerHTML = `
        <div class="empty-pane">
          <div class="empty-pane-icon">📋</div>
          <h4>No Playlists Yet</h4>
          <p>Create your first playlist to get started</p>
          <button class="btn-primary" onclick="window.app.playlistRenderer.showPlaylistModal()">
            Create Playlist
          </button>
        </div>
      `;
        return;
      }

      const playlistsHTML = `
      <div class="playlist-browser">
        ${playlists
          .map(
            (playlist) => `
          <div class="playlist-item-card" data-playlist-id="${playlist.id}">
            <div class="playlist-item-header">
              <div class="playlist-item-name">${playlist.type === 'smart' ? '<span class="playlist-type-badge smart" title="Smart Playlist">✦</span>' : ''}${this.escapeHtml(playlist.name)}</div>
              <button class="playlist-item-menu btn-icon" title="Playlist options" data-playlist-id="${playlist.id}">⋮</button>
            </div>
            <div class="playlist-item-stats">
              <span>${playlist.track_count || 0} tracks</span>
              ${playlist.total_duration ? `<span>${this.formatDuration(playlist.total_duration)}</span>` : ''}
            </div>
          </div>
        `
          )
          .join('')}
      </div>
    `;

      container.innerHTML = playlistsHTML;

      // Add event listeners for playlist cards
      container.querySelectorAll('.playlist-item-card').forEach((card) => {
        const playlistId = card.dataset.playlistId;
        const playlist = playlists.find((p) => p.id == playlistId);

        // Click on card (but not menu button) to select playlist
        card.addEventListener('click', (e) => {
          if (!e.target.closest('.playlist-item-menu')) {
            this.selectPlaylistInBrowser(playlistId);
          }
        });

        // Right-click context menu for the entire card
        card.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          this.app.playlistRenderer.showPlaylistContextMenu(e, playlist);
        });

        // Drop target for dragging songs out of the library/search results onto
        // this playlist to add them (see LibraryManager.setupLibrarySelectionEvents
        // and setupSearchResultEvents for the drag side).
        card.addEventListener('dragover', (e) => {
          if (!e.dataTransfer.types.includes('application/x-que-track-paths')) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          card.classList.add('drag-target-active');
        });

        card.addEventListener('dragleave', () => {
          card.classList.remove('drag-target-active');
        });

        card.addEventListener('drop', async (e) => {
          card.classList.remove('drag-target-active');
          const raw = e.dataTransfer.getData('application/x-que-track-paths');
          if (!raw) return;
          e.preventDefault();

          let trackPaths;
          try {
            trackPaths = JSON.parse(raw);
          } catch {
            return;
          }
          if (!Array.isArray(trackPaths) || trackPaths.length === 0) return;

          await this.app.playlistRenderer.addTrackPathsToPlaylist(playlistId, trackPaths);
        });
      });

      // FIXED: Add click handlers for 3-dot menu buttons
      container.querySelectorAll('.playlist-item-menu').forEach((menuButton) => {
        menuButton.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation(); // Prevent card click

          const playlistId = menuButton.dataset.playlistId;
          const playlist = playlists.find((p) => p.id == playlistId);

          if (!playlist) {
            this.app.logger.error('❌ Playlist not found for ID:', playlistId);
            return;
          }

          if (!this.app.playlistRenderer.showPlaylistContextMenu) {
            this.app.logger.error('❌ showPlaylistContextMenu method not found!');
            return;
          }

          // Show context menu at button position
          try {
            this.app.playlistRenderer.showPlaylistContextMenu(e, playlist);
            // Refresh context menu system after loading dynamic content
            setTimeout(() => {
              this.refreshContextMenuSystem();
            }, 100);
          } catch (error) {
            this.app.logger.error('❌ Error showing context menu:', error);
          }
        });
      });
    } catch (error) {
      this.app.logger.error('❌ Error loading playlist browser:', error);
      container.innerHTML = `
      <div class="empty-pane">
        <div class="empty-pane-icon">❌</div>
        <h4>Error Loading Playlists</h4>
        <p>Please try refreshing the application</p>
      </div>
    `;
    }
  }

  async selectPlaylistInBrowser(playlistId) {
    console.log(`📋 Selecting playlist in browser: ${playlistId}`);

    // Remove previous selection
    document.querySelectorAll('.playlist-item-card').forEach((card) => {
      card.classList.remove('active');
    });

    // Add selection to clicked playlist
    const selectedCard = document.querySelector(`[data-playlist-id="${playlistId}"]`);
    if (selectedCard) {
      selectedCard.classList.add('active');
    }

    // Load playlist tracks in right pane
    console.log(`🔧 About to load playlist in right pane: ${playlistId}`);
    await this.loadPlaylistInRightPane(playlistId);
    console.log(`✅ Finished loading playlist in right pane: ${playlistId}`);
  }

  // ========================================
  // UPDATED PLAYLIST LOADING METHOD
  // ========================================

  async loadPlaylistInRightPane(playlistId) {
    const rightPaneTitle = document.getElementById('rightPaneTitle');
    const rightPaneContent = document.getElementById('rightPaneContent');
    const rightPaneActions = document.getElementById('rightPaneActions');

    try {
      if (rightPaneContent) {
        rightPaneContent.innerHTML = `
        <div class="loading-state">
          <div class="loading-spinner"></div>
          <p>Loading playlist tracks...</p>
        </div>
      `;
      }

      const playlist = await window.queMusicAPI.playlists.getById(playlistId);
      console.log(`Loaded playlist: ${playlist.name} with ${playlist.tracks?.length || 0} tracks`);

      if (rightPaneTitle) {
        rightPaneTitle.textContent = `Playlist: ${playlist.name}`;
      }

      // No Play All / Shuffle buttons here — removed 2026-09-16 (see
      // docs/issues/issues_track.md). They didn't feed the real Up Next
      // queue. Whole-playlist playback is a double-click or a track's own
      // play button; renderQueuePane() now shows the rest of whatever's
      // loaded (this playlist included) under "Up Next" automatically.
      if (rightPaneActions) {
        rightPaneActions.innerHTML = '';
      }

      if (rightPaneContent) {
        if (!playlist.tracks || playlist.tracks.length === 0) {
          rightPaneContent.innerHTML = `
          <div class="empty-pane">
            <div class="empty-pane-icon">Empty Playlist</div>
            <h4>Empty Playlist</h4>
            <p>This playlist doesn't have any tracks yet.</p>
            <button class="btn-primary" onclick="window.app.uiController.switchView('library')">
              Add Tracks from Library
            </button>
          </div>
        `;
        } else {
          // Use library manager's selection-enabled track list with playlist context menu
          const tracksHTML = this.app.libraryManager.generateTrackListWithSelection(
            playlist.tracks
          );
          rightPaneContent.innerHTML = tracksHTML;
          this.app.libraryManager.setupLibrarySelectionEvents();

          // Set current playlist data for context menus
          this.app.playlistRenderer.currentPlaylistData = playlist;

          // setupLibrarySelectionEvents() wires a generic single-click-to-play
          // handler that rebuilds CoreAudio.playlist from the clicked track's
          // *disk folder* (buildPlaylistFromCurrentFolder) — wrong here, since
          // a playlist can span many folders. Override with a capture-phase
          // listener per track so playback (and therefore Next/Prev and the
          // Up Next pane) reflects the actual playlist instead. No Play All
          // button anymore (removed 2026-09-16) — clicking any track is now
          // the way to start the whole playlist from that point.
          rightPaneContent.querySelectorAll('.song-card').forEach((card) => {
            card.addEventListener(
              'click',
              (e) => {
                if (e.target.closest('.song-checkbox')) return;
                e.stopImmediatePropagation();
                const index = parseInt(card.dataset.trackIndex, 10);
                this.app.playlistRenderer.currentPlaylistData = playlist;
                this.app.playlistRenderer.playPlaylist(index);
              },
              true
            );
          });

          // Add right-click context menu to tracks
          console.log('🔧 About to setup playlist context menus');
          this.setupPlaylistTrackContextMenus();
          
          this.app.logger.info(' Playlist tracks loaded with context menu support');
        }
      }
    } catch (error) {
      this.app.logger.error('Error loading playlist in right pane:', error);
      if (rightPaneContent) {
        rightPaneContent.innerHTML = `
        <div class="empty-pane">
          <div class="empty-pane-icon">Error</div>
          <h4>Error Loading Playlist</h4>
          <p>Please try again: ${error.message}</p>
          <button class="btn-secondary" onclick="location.reload()">Refresh App</button>
        </div>
      `;
      }
    }
  }

  // Setup right-click context menus for playlist tracks
  setupPlaylistTrackContextMenus() {
    const trackCards = document.querySelectorAll('.track-card-right');
    console.log(`🔧 Setting up playlist context menus for ${trackCards.length} track cards`);
    
    trackCards.forEach((card) => {
      // Add right-click event listener with higher priority
      card.addEventListener('contextmenu', (e) => {
        this.app.logger.debug(' Playlist-specific context menu triggered');
        e.preventDefault();
        e.stopPropagation();
        
        // Extract track data from the card
        const trackData = this.extractSongDataFromAnyCard(card);
        console.log('🗑️ Playlist track data:', trackData);
        
        if (trackData && this.app.playlistRenderer && this.app.playlistRenderer.currentPlaylistData) {
          // Show playlist-specific context menu
          this.showPlaylistTrackContextMenu(e, trackData, card);
        } else {
          console.log('❌ Missing data for playlist context menu:', {
            trackData: !!trackData,
            playlistRenderer: !!this.app.playlistRenderer,
            currentPlaylistData: !!this.app.playlistRenderer?.currentPlaylistData
          });
        }
      }, true); // Use capture phase to run before global handler
    });
  }

  // Show context menu for playlist tracks with remove option
  showPlaylistTrackContextMenu(event, trackData, trackElement) {
    // Create context menu
    const contextMenu = document.createElement('div');
    contextMenu.id = 'playlistTrackContextMenu';
    contextMenu.className = 'track-context-menu';
    contextMenu.innerHTML = `
      <div class="context-item" data-action="play">
        <span class="context-icon">▶</span>
        Play Track
      </div>
      <div class="context-separator"></div>
      <div class="context-item danger" data-action="remove">
        <span class="context-icon">🗑️</span>
        Remove from Playlist
      </div>
    `;

    // Position and show menu
    document.body.appendChild(contextMenu);
    this.positionContextMenu(contextMenu, event.clientX, event.clientY);

    // Add event listeners
    contextMenu.querySelectorAll('.context-item').forEach((item) => {
      item.addEventListener('click', async (e) => {
        e.stopPropagation();
        const action = item.dataset.action;
        contextMenu.remove();

        if (action === 'play') {
          // Play the track
          await this.app.coreAudio.playSong(trackData.path, false);
        } else if (action === 'remove') {
          console.log('🗑️ Attempting to remove track:', trackData);
          console.log('🗑️ Track element:', trackElement);
          // Remove from playlist
          await this.app.playlistRenderer.removeTrackFromCurrentPlaylistByData(trackData, trackElement);
        }
      });
    });

    // The global context menu close handler will take care of closing this menu
  }

  // ========================================
  // FAVORITES VIEW IMPLEMENTATION
  // ========================================

  async showFavoritesView() {
    console.log('⭐ Loading favorites view...');

    const leftPaneTitle = document.getElementById('leftPaneTitle');
    const leftPaneContent = document.getElementById('leftPaneContent');
    const leftPaneActions = document.getElementById('leftPaneActions');

    if (leftPaneTitle) leftPaneTitle.textContent = 'Favorite Tracks';

    // Add clear favorites button to left pane actions
    if (leftPaneActions) {
      leftPaneActions.innerHTML = `
      <button class="btn-primary btn-sm" id="playAllFavoritesBtn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5,3 19,12 5,21"></polygon>
        </svg>
        Play All
      </button>
      <button class="btn-secondary btn-sm" id="clearFavoritesBtn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3,6 5,6 21,6"></polyline>
          <path d="M19,6V20a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6M8,6V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2V6"></path>
        </svg>
        Clear All
      </button>
    `;

      // Add event listeners
      const playAllBtn = document.getElementById('playAllFavoritesBtn');
      const clearBtn = document.getElementById('clearFavoritesBtn');

      if (playAllBtn) {
        playAllBtn.addEventListener('click', () => {
          this.playAllFavorites();
        });
      }

      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          this.clearAllFavorites();
        });
      }
    }

    // Load favorites in left pane
    if (leftPaneContent) {
      try {
        await this.loadFavoritesList(leftPaneContent);
      } catch (error) {
        this.app.logger.error('❌ Error loading favorites:', error);
        this.showErrorInLeftPane('Failed to load favorites');
      }
    }

    // Clear right pane
    this.clearRightPane('Select a favorite track to view details');
  }

  async loadFavoritesList(container) {
    try {
      // Show loading state
      container.innerHTML = `
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <p>Loading favorites...</p>
      </div>
    `;

      let favorites;
      try {
        favorites = await window.queMusicAPI.favorites.getAll({
          limit: 1000,
          sortBy: 'added_at',
          sortOrder: 'DESC',
        });

        // FIXED: Ensure favorites is always an array
        if (!Array.isArray(favorites)) {
          this.app.logger.warn('⚠️ Favorites API returned non-array:', favorites);
          favorites = [];
        }
      } catch (apiError) {
        this.app.logger.error('❌ Favorites API call failed:', apiError);
        favorites = [];
      }

      if (favorites.length === 0) {
        container.innerHTML = `
        <div class="empty-pane">
          <div class="empty-pane-icon">⭐</div>
          <h4>No Favorites Yet</h4>
          <p>Heart tracks while playing to add them to your favorites!</p>
          <button class="btn-primary" onclick="window.app.uiController.switchView('library')">
            Browse Music Library
          </button>
        </div>
      `;
        return;
      }

      const favoritesHTML = `
      <div class="favorites-browser">
        <div class="favorites-header">
          <span class="favorites-count">${favorites.length} favorite tracks</span>
          <div class="favorites-sort">
            <select id="favoritesSortSelect" class="sort-select">
              <option value="added_at_DESC">Recently Added</option>
              <option value="added_at_ASC">Oldest First</option>
              <option value="title_ASC">Title A-Z</option>
              <option value="title_DESC">Title Z-A</option>
              <option value="artist_ASC">Artist A-Z</option>
              <option value="artist_DESC">Artist Z-A</option>
            </select>
          </div>
        </div>
        <div class="favorites-list">
          ${favorites
            .map(
              (track, index) => `
            <div class="favorite-item-card" data-track-index="${index}" data-track-id="${track.id}" data-path="${track.path}">
              <div class="favorite-item-info">
                <div class="favorite-item-title">${this.escapeHtml(track.title || track.filename || 'Unknown')}</div>
                <div class="favorite-item-artist">${this.escapeHtml(track.artist || 'Unknown Artist')}</div>
                <div class="favorite-item-album">${this.escapeHtml(track.album || 'Unknown Album')}</div>
              </div>
              <div class="favorite-item-meta">
                <span class="favorite-added-date">${this.formatRelativeDate(track.favorited_at)}</span>
                <span class="favorite-duration">${track.duration ? this.app.formatTime(track.duration) : '--:--'}</span>
              </div>
              <div class="favorite-item-actions">
                <button class="btn-icon favorite-play-btn" title="Play Track">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="5,3 19,12 5,21"></polygon>
                  </svg>
                </button>
                <button class="btn-icon favorite-remove-btn" title="Remove from Favorites">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" fill="currentColor"></polygon>
                  </svg>
                </button>
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    `;

      container.innerHTML = favoritesHTML;

      // Add event listeners
      this.setupFavoritesEventListeners(container, favorites);
    } catch (error) {
      this.app.logger.error('❌ Error loading favorites list:', error);
      container.innerHTML = `
      <div class="empty-pane">
        <div class="empty-pane-icon">❌</div>
        <h4>Error Loading Favorites</h4>
        <p>Please try refreshing the application</p>
      </div>
    `;
    }
  }

  setupFavoritesEventListeners(container, favorites) {
    // Sort dropdown
    const sortSelect = container.querySelector('#favoritesSortSelect');
    if (sortSelect) {
      sortSelect.addEventListener('change', async (e) => {
        const [sortBy, sortOrder] = e.target.value.split('_');
        await this.reloadFavorites(sortBy, sortOrder);
      });
    }

    // Favorite item cards
    container.querySelectorAll('.favorite-item-card').forEach((card, index) => {
      const track = favorites[index];

      // Click to select and show in right pane
      card.addEventListener('click', (e) => {
        if (!e.target.closest('.favorite-item-actions')) {
          this.selectFavoriteInBrowser(track, card);
        }
      });

      // Play button
      const playBtn = card.querySelector('.favorite-play-btn');
      if (playBtn) {
        playBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.playFavoriteTrack(track);
        });
      }

      // Remove button
      const removeBtn = card.querySelector('.favorite-remove-btn');
      if (removeBtn) {
        removeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.removeFavoriteTrack(track, card);
        });
      }

      // Context menu
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const songData = this.extractSongDataFromCard(card);
        this.showTrackContextMenu(e, songData);
      });
    });
  }

  async selectFavoriteInBrowser(track, cardElement) {
    console.log(`⭐ Selecting favorite: ${track.title}`);

    // Visual selection
    document.querySelectorAll('.favorite-item-card').forEach((card) => {
      card.classList.remove('active');
    });
    cardElement.classList.add('active');

    // Load track details in right pane
    await this.loadFavoriteInRightPane(track);
  }

  async loadFavoriteInRightPane(track) {
    const rightPaneTitle = document.getElementById('rightPaneTitle');
    const rightPaneContent = document.getElementById('rightPaneContent');
    const rightPaneActions = document.getElementById('rightPaneActions');

    if (rightPaneTitle) {
      rightPaneTitle.textContent = `⭐ ${track.title}`;
    }

    if (rightPaneActions) {
      rightPaneActions.innerHTML = `
      <button class="btn-primary btn-sm" onclick="window.app.coreAudio.playSong('${track.path}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5,3 19,12 5,21"></polygon>
        </svg>
        Play Track
      </button>
      <button class="btn-secondary btn-sm" onclick="window.app.uiController.removeFavoriteFromRightPane('${track.path}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" fill="currentColor"></polygon>
        </svg>
        Remove from Favorites
      </button>
    `;
    }

    if (rightPaneContent) {
      rightPaneContent.innerHTML = `
      <div class="track-details-card">
        <div class="track-details-header">
          <h3>${this.escapeHtml(track.title || 'Unknown Track')}</h3>
          <p class="track-subtitle">by ${this.escapeHtml(track.artist || 'Unknown Artist')}</p>
        </div>
        
        <div class="track-details-info">
          <div class="detail-row">
            <span class="detail-label">Album:</span>
            <span class="detail-value">${this.escapeHtml(track.album || 'Unknown Album')}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Year:</span>
            <span class="detail-value">${track.year || 'Unknown'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Genre:</span>
            <span class="detail-value">${this.escapeHtml(track.genre || 'Unknown')}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Duration:</span>
            <span class="detail-value">${track.duration ? this.app.formatTime(track.duration) : 'Unknown'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Format:</span>
            <span class="detail-value">${track.format || 'Unknown'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Added to Favorites:</span>
            <span class="detail-value">${this.formatFullDate(track.favorited_at)}</span>
          </div>
        </div>
        
        <div class="track-details-actions">
          <button class="btn-primary" onclick="window.app.coreAudio.playSong('${track.path}')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="5,3 19,12 5,21"></polygon>
            </svg>
            Play Now
          </button>
        </div>
      </div>
    `;
    }
  }

  async playFavoriteTrack(track) {
    console.log(`⭐ Playing favorite track: ${track.title}`);

    // Set up playlist from all favorites
    const favorites = await window.queMusicAPI.favorites.getAll();
    this.app.coreAudio.clearPlaylist();
    this.app.playlist = favorites;

    // Find the index of this track
    const trackIndex = favorites.findIndex((t) => t.path === track.path);
    this.app.currentTrackIndex = trackIndex >= 0 ? trackIndex : 0;

    // Play the track
    this.app.coreAudio.playSong(track.path);
  }

  async removeFavoriteTrack(track, cardElement) {
    const confirmed = confirm(`Remove "${track.title}" from favorites?`);

    if (confirmed) {
      try {
        await window.queMusicAPI.favorites.remove(track.path);

        // Remove from UI
        cardElement.remove();

        // Update favorites count
        const remainingCards = document.querySelectorAll('.favorite-item-card');
        const countElement = document.querySelector('.favorites-count');
        if (countElement) {
          countElement.textContent = `${remainingCards.length} favorite tracks`;
        }

        // If no favorites left, show empty state
        if (remainingCards.length === 0) {
          const container = document.getElementById('leftPaneContent');
          if (container) {
            await this.loadFavoritesList(container);
          }
        }

        // Update favorite button in player if this is the current track
        if (this.app.currentTrack?.path === track.path) {
          this.app.updateFavoriteButton(false);
        }

        this.app.showNotification(`Removed "${track.title}" from favorites`, 'success');
        console.log(`💔 Removed from favorites: ${track.title}`);
      } catch (error) {
        this.app.logger.error('❌ Error removing favorite:', error);
        this.app.showNotification('Failed to remove from favorites', 'error');
      }
    }
  }

  async removeFavoriteFromRightPane(trackPath) {
    try {
      const confirmed = confirm('Remove this track from favorites?');

      if (confirmed) {
        await window.queMusicAPI.favorites.remove(trackPath);

        // Refresh the favorites view
        await this.showFavoritesView();

        // Update favorite button in player if this is the current track
        if (this.app.currentTrack?.path === trackPath) {
          this.app.updateFavoriteButton(false);
        }

        this.app.showNotification('Removed from favorites', 'success');
      }
    } catch (error) {
      this.app.logger.error('❌ Error removing favorite from right pane:', error);
      this.app.showNotification('Failed to remove from favorites', 'error');
    }
  }

  async playAllFavorites() {
    try {
      const favorites = await window.queMusicAPI.favorites.getAll();

      if (favorites.length === 0) {
        this.app.showNotification('No favorites to play', 'info');
        return;
      }

      this.app.coreAudio.clearPlaylist();
      this.app.playlist = favorites;
      this.app.currentTrackIndex = 0;
      this.app.coreAudio.playSong(favorites[0].path);

      this.app.showNotification(`Playing ${favorites.length} favorite tracks`, 'success');
      console.log(`⭐ Playing all ${favorites.length} favorites`);
    } catch (error) {
      this.app.logger.error('❌ Error playing all favorites:', error);
      this.app.showNotification('Failed to play favorites', 'error');
    }
  }

  async clearAllFavorites() {
    const confirmed = confirm('Remove ALL tracks from favorites?\n\nThis cannot be undone.');

    if (confirmed) {
      try {
        const result = await window.queMusicAPI.favorites.clear();

        // Refresh the view
        await this.showFavoritesView();

        // Update favorite button in player
        this.app.updateFavoriteButton(false);

        this.app.showNotification(`Cleared ${result.cleared} favorites`, 'success');
        console.log(`🧹 Cleared all favorites: ${result.cleared} tracks`);
      } catch (error) {
        this.app.logger.error('❌ Error clearing favorites:', error);
        this.app.showNotification('Failed to clear favorites', 'error');
      }
    }
  }

  async reloadFavorites(sortBy, sortOrder) {
    const container = document.getElementById('leftPaneContent');
    if (container) {
      try {
        // Show loading
        container.innerHTML = `
        <div class="loading-state">
          <div class="loading-spinner"></div>
          <p>Reloading favorites...</p>
        </div>
      `;

        // Reload with new sort
        await this.loadFavoritesList(container);
      } catch (error) {
        this.app.logger.error('❌ Error reloading favorites:', error);
      }
    }
  }

  // ========================================
  // RECENTLY PLAYED VIEW IMPLEMENTATION
  // ========================================

  async showRecentlyPlayedView() {
    console.log('🕒 Loading recently played view...');

    const leftPaneTitle = document.getElementById('leftPaneTitle');
    const leftPaneContent = document.getElementById('leftPaneContent');
    const leftPaneActions = document.getElementById('leftPaneActions');

    if (leftPaneTitle) leftPaneTitle.textContent = 'Recently Played';

    // Add clear history button to left pane actions
    if (leftPaneActions) {
      leftPaneActions.innerHTML = `
      <button class="btn-primary btn-sm" id="playRecentBtn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5,3 19,12 5,21"></polygon>
        </svg>
        Play Recent
      </button>
      <button class="btn-secondary btn-sm" id="clearHistoryBtn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3,6 5,6 21,6"></polyline>
          <path d="M19,6V20a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6M8,6V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2V6"></path>
        </svg>
        Clear History
      </button>
    `;

      // Add event listeners
      const playRecentBtn = document.getElementById('playRecentBtn');
      const clearBtn = document.getElementById('clearHistoryBtn');

      if (playRecentBtn) {
        playRecentBtn.addEventListener('click', () => {
          this.playRecentTracks();
        });
      }

      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          this.clearRecentlyPlayed();
        });
      }
    }

    // Load recently played in left pane
    if (leftPaneContent) {
      try {
        await this.loadRecentlyPlayedList(leftPaneContent);
      } catch (error) {
        this.app.logger.error('❌ Error loading recently played:', error);
        this.showErrorInLeftPane('Failed to load recently played tracks');
      }
    }

    // Clear right pane
    this.clearRightPane('Select a recently played track to view details');
  }

  async loadRecentlyPlayedList(container) {
    try {
      // Show loading state
      container.innerHTML = `
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <p>Loading recently played...</p>
      </div>
    `;

      console.log('🕒 Calling recentlyPlayed.getAll API...');

      let recentTracks;
      try {
        recentTracks = await window.queMusicAPI.recentlyPlayed.getAll(100);

        // FIXED: Better validation of API response
        if (recentTracks === undefined || recentTracks === null || !Array.isArray(recentTracks)) {
          this.app.logger.warn('⚠️ Invalid recentTracks response, using empty array');
          console.log('🕒 Raw API response:', recentTracks);
          console.log('🕒 Response type:', typeof recentTracks);
          recentTracks = [];
        }
      } catch (apiError) {
        this.app.logger.error('❌ API call failed:', apiError);
        recentTracks = [];
      }

      if (recentTracks.length === 0) {
        container.innerHTML = `
        <div class="empty-pane">
          <div class="empty-pane-icon">🕒</div>
          <h4>No Recent Tracks</h4>
          <p>Start playing music to see your recently played tracks here!</p>
          <button class="btn-primary" onclick="window.app.uiController.switchView('library')">
            Browse Music Library
          </button>
        </div>
      `;
        return;
      }

      const recentHTML = `
      <div class="recent-browser">
        <div class="recent-header">
          <span class="recent-count">${recentTracks.length} recently played tracks</span>
        </div>
        <div class="recent-list">
          ${recentTracks
            .map(
              (track, index) => `
            <div class="recent-item-card" data-track-index="${index}" data-track-id="${track.id}" data-path="${track.path}">
              <div class="recent-item-info">
                <div class="recent-item-title">${this.escapeHtml(track.title || track.filename || 'Unknown')}</div>
                <div class="recent-item-artist">${this.escapeHtml(track.artist || 'Unknown Artist')}</div>
                <div class="recent-item-album">${this.escapeHtml(track.album || 'Unknown Album')}</div>
              </div>
              <div class="recent-item-meta">
                <span class="recent-played-time">${this.formatRelativeDate(track.played_at)}</span>
                <span class="recent-play-count">${track.play_count} ${track.play_count === 1 ? 'play' : 'plays'}</span>
                <span class="recent-duration">${track.duration ? this.app.formatTime(track.duration) : '--:--'}</span>
              </div>
              <div class="recent-item-actions">
                <button class="btn-icon recent-play-btn" title="Play Track">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="5,3 19,12 5,21"></polygon>
                  </svg>
                </button>
                <button class="btn-icon recent-favorite-btn" title="Add to Favorites">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"></polygon>
                  </svg>
                </button>
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    `;

      container.innerHTML = recentHTML;

      // Add event listeners
      this.setupRecentlyPlayedEventListeners(container, recentTracks);
    } catch (error) {
      this.app.logger.error('❌ Error loading recently played list:', error);
      container.innerHTML = `
      <div class="empty-pane">
        <div class="empty-pane-icon">❌</div>
        <h4>Error Loading Recently Played</h4>
        <p>Please try refreshing the application</p>
        <button class="btn-secondary" onclick="location.reload()">Refresh App</button>
      </div>
    `;
    }
  }

  setupRecentlyPlayedEventListeners(container, recentTracks) {
    // Recent track item cards
    container.querySelectorAll('.recent-item-card').forEach((card, index) => {
      const track = recentTracks[index];

      // Click to select and show in right pane
      card.addEventListener('click', (e) => {
        if (!e.target.closest('.recent-item-actions')) {
          this.selectRecentTrackInBrowser(track, card);
        }
      });

      // Play button
      const playBtn = card.querySelector('.recent-play-btn');
      if (playBtn) {
        playBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.playRecentTrack(track);
        });
      }

      // Favorite button
      const favoriteBtn = card.querySelector('.recent-favorite-btn');
      if (favoriteBtn) {
        favoriteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleFavoriteFromRecent(track, favoriteBtn);
        });

        // Check if already favorited and update button
        this.updateRecentFavoriteButton(favoriteBtn, track.path);
      }

      // Context menu
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const songData = this.extractSongDataFromCard(card);
        this.showTrackContextMenu(e, songData);
      });
    });
  }

  async selectRecentTrackInBrowser(track, cardElement) {
    console.log(`🕒 Selecting recent track: ${track.title}`);

    // Visual selection
    document.querySelectorAll('.recent-item-card').forEach((card) => {
      card.classList.remove('active');
    });
    cardElement.classList.add('active');

    // Load track details in right pane
    await this.loadRecentTrackInRightPane(track);
  }

  async loadRecentTrackInRightPane(track) {
    const rightPaneTitle = document.getElementById('rightPaneTitle');
    const rightPaneContent = document.getElementById('rightPaneContent');
    const rightPaneActions = document.getElementById('rightPaneActions');

    if (rightPaneTitle) {
      rightPaneTitle.textContent = `🕒 ${track.title}`;
    }

    if (rightPaneActions) {
      rightPaneActions.innerHTML = `
      <button class="btn-primary btn-sm" onclick="window.app.coreAudio.playSong('${track.path}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5,3 19,12 5,21"></polygon>
        </svg>
        Play Again
      </button>
      <button class="btn-secondary btn-sm" onclick="window.app.uiController.toggleFavoriteFromRightPane('${track.path}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"></polygon>
        </svg>
        Add to Favorites
      </button>
    `;
    }

    if (rightPaneContent) {
      rightPaneContent.innerHTML = `
      <div class="track-details-card">
        <div class="track-details-header">
          <h3>${this.escapeHtml(track.title || 'Unknown Track')}</h3>
          <p class="track-subtitle">by ${this.escapeHtml(track.artist || 'Unknown Artist')}</p>
        </div>
        
        <div class="track-details-info">
          <div class="detail-row">
            <span class="detail-label">Album:</span>
            <span class="detail-value">${this.escapeHtml(track.album || 'Unknown Album')}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Year:</span>
            <span class="detail-value">${track.year || 'Unknown'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Genre:</span>
            <span class="detail-value">${this.escapeHtml(track.genre || 'Unknown')}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Duration:</span>
            <span class="detail-value">${track.duration ? this.app.formatTime(track.duration) : 'Unknown'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Format:</span>
            <span class="detail-value">${track.format || 'Unknown'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Last Played:</span>
            <span class="detail-value">${this.formatFullDate(track.played_at)}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Play Count:</span>
            <span class="detail-value">${track.play_count} ${track.play_count === 1 ? 'time' : 'times'}</span>
          </div>
        </div>
        
        <div class="track-details-actions">
          <button class="btn-primary" onclick="window.app.coreAudio.playSong('${track.path}')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="5,3 19,12 5,21"></polygon>
            </svg>
            Play Again
          </button>
        </div>
      </div>
    `;
    }
  }

  async playRecentTrack(track) {
    console.log(`🕒 Playing recent track: ${track.title}`);

    try {
      // Set up playlist from recent tracks
      const recentTracks = await window.queMusicAPI.recentlyPlayed.getAll();

      // Convert recent tracks to proper playlist format for core audio
      const playlistTracks = recentTracks.map((t) => ({
        path: t.path,
        name: t.title || this.app.getBasename(t.path),
        title: t.title,
        artist: t.artist,
        album: t.album,
      }));

      // Clear existing playlist and set up new one from recent tracks
      this.app.coreAudio.clearPlaylist();
      this.app.coreAudio.playlist = playlistTracks;

      // Find the index of this track
      const trackIndex = recentTracks.findIndex((t) => t.path === track.path);
      this.app.coreAudio.currentTrackIndex = trackIndex >= 0 ? trackIndex : 0;

      console.log(
        `🕒 Set up recent playlist with ${playlistTracks.length} tracks, starting at index ${this.app.coreAudio.currentTrackIndex}`
      );

      // Play the track
      await this.app.coreAudio.playSong(track.path, false); // false to not rebuild playlist
    } catch (error) {
      this.app.logger.error('❌ Error playing recent track:', error);
      this.app.showNotification(`Failed to play: ${track.title}`, 'error');
    }
  }

  async playRecentTracks() {
    try {
      const recentTracks = await window.queMusicAPI.recentlyPlayed.getAll();

      if (recentTracks.length === 0) {
        this.app.showNotification('No recent tracks to play', 'info');
        return;
      }

      // Convert recent tracks to proper playlist format for core audio
      const playlistTracks = recentTracks.map((t) => ({
        path: t.path,
        name: t.title || this.app.getBasename(t.path),
        title: t.title,
        artist: t.artist,
        album: t.album,
      }));

      // Check if a track is currently selected in left pane
      const selectedCard = document.querySelector('.recent-item-card.active');
      let startIndex = 0;

      if (selectedCard) {
        // Find the selected track's index in the recent tracks
        const selectedTrackPath = selectedCard.dataset.path;
        const selectedIndex = recentTracks.findIndex((t) => t.path === selectedTrackPath);
        if (selectedIndex >= 0) {
          startIndex = selectedIndex;
          console.log(`🕒 Starting from selected track at index ${startIndex}`);
        }
      }

      // Clear existing playlist and set up new one from recent tracks
      this.app.coreAudio.clearPlaylist();
      this.app.coreAudio.playlist = playlistTracks;
      this.app.coreAudio.currentTrackIndex = startIndex;

      console.log(
        `🕒 Set up recent playlist with ${playlistTracks.length} tracks, starting at index ${startIndex}`
      );

      // Play the track (false to not rebuild playlist since we just set it)
      await this.app.coreAudio.playSong(recentTracks[startIndex].path, false);

      this.app.showNotification(`Playing ${recentTracks.length} recent tracks`, 'success');
      console.log(`🕒 Playing ${recentTracks.length} recent tracks from index ${startIndex}`);
    } catch (error) {
      this.app.logger.error('❌ Error playing recent tracks:', error);
      this.app.showNotification('Failed to play recent tracks', 'error');
    }
  }

  async clearRecentlyPlayed() {
    const confirmed = confirm('Clear ALL recently played history?\n\nThis cannot be undone.');

    if (confirmed) {
      try {
        const result = await window.queMusicAPI.recentlyPlayed.clear();

        // Refresh the view
        await this.showRecentlyPlayedView();

        this.app.showNotification(`Cleared ${result.cleared} recently played tracks`, 'success');
        console.log(`🧹 Cleared recently played history: ${result.cleared} tracks`);
      } catch (error) {
        this.app.logger.error('❌ Error clearing recently played:', error);
        this.app.showNotification('Failed to clear history', 'error');
      }
    }
  }

  async toggleFavoriteFromRecent(track, buttonElement) {
    try {
      const result = await window.queMusicAPI.favorites.toggle(track.path);

      // Update button appearance
      this.updateRecentFavoriteButtonState(buttonElement, result.added || !result.removed);

      const message = result.added
        ? `Added "${track.title}" to favorites`
        : `Removed "${track.title}" from favorites`;

      this.app.showNotification(message, 'success');

      // Update favorite button in player if this is the current track
      if (this.app.currentTrack?.path === track.path) {
        this.app.updateFavoriteButton(result.added || !result.removed);
      }
    } catch (error) {
      this.app.logger.error('❌ Error toggling favorite from recent:', error);
      this.app.showNotification('Failed to update favorites', 'error');
    }
  }

  async toggleFavoriteFromRightPane(trackPath) {
    try {
      const result = await window.queMusicAPI.favorites.toggle(trackPath);

      const message = result.added ? 'Added to favorites' : 'Removed from favorites';

      this.app.showNotification(message, 'success');

      // Update favorite button in player if this is the current track
      if (this.app.currentTrack?.path === trackPath) {
        this.app.updateFavoriteButton(result.added || !result.removed);
      }

      // Update the button text in right pane
      const favoriteBtn = document.querySelector('#rightPaneActions .btn-secondary');
      if (favoriteBtn) {
        const isNowFavorite = result.added || !result.removed;
        favoriteBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"${isNowFavorite ? ' fill="currentColor"' : ''}></polygon>
        </svg>
        ${isNowFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
      `;
      }
    } catch (error) {
      this.app.logger.error('❌ Error toggling favorite from right pane:', error);
      this.app.showNotification('Failed to update favorites', 'error');
    }
  }

  async updateRecentFavoriteButton(buttonElement, trackPath) {
    try {
      const isFavorite = await window.queMusicAPI.favorites.isFavorite(trackPath);
      this.updateRecentFavoriteButtonState(buttonElement, isFavorite);
    } catch (error) {
      this.app.logger.error('❌ Error checking favorite status:', error);
    }
  }

  updateRecentFavoriteButtonState(buttonElement, isFavorite) {
    const svg = buttonElement.querySelector('svg polygon');
    if (svg) {
      if (isFavorite) {
        svg.setAttribute('fill', 'currentColor');
        buttonElement.style.color = 'var(--accent)';
        buttonElement.title = 'Remove from Favorites';
      } else {
        svg.removeAttribute('fill');
        buttonElement.style.color = '';
        buttonElement.title = 'Add to Favorites';
      }
    }
  }

  // ========================================
  // UTILITY METHODS FOR FAVORITES & RECENT
  // ========================================

  formatRelativeDate(dateString) {
    if (!dateString) return 'Unknown';

    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffMinutes < 1) {
      return 'Just now';
    } else if (diffMinutes < 60) {
      return `${diffMinutes}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
    } else if (diffDays < 365) {
      const months = Math.floor(diffDays / 30);
      return `${months} month${months > 1 ? 's' : ''} ago`;
    } else {
      const years = Math.floor(diffDays / 365);
      return `${years} year${years > 1 ? 's' : ''} ago`;
    }
  }

  formatFullDate(dateString) {
    if (!dateString) return 'Unknown';

    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  showFavoritesInLeftPane() {
    console.log('⭐ Redirecting to full favorites view...');
    this.showFavoritesView();
  }

  showRecentlyPlayedInLeftPane() {
    console.log('🕒 Redirecting to full recently played view...');
    this.showRecentlyPlayedView();
  }

  async loadArtistsInLeftPane() {
    const leftPaneTitle = document.getElementById('leftPaneTitle');
    const leftPaneContent = document.getElementById('leftPaneContent');

    if (leftPaneTitle) leftPaneTitle.textContent = 'All Artists';

    try {
      // Show loading
      if (leftPaneContent) {
        leftPaneContent.innerHTML = `
          <div class="loading-state">
            <div class="loading-spinner"></div>
            <p>Loading artists...</p>
          </div>
        `;
      }

      const artists = await window.queMusicAPI.database.getAllArtists();
      console.log(`🔍 DEBUG: Fetched ${artists.length} artists from database`);

      if (artists.length === 0) {
        leftPaneContent.innerHTML = `
          <div class="empty-pane">
            <div class="empty-pane-icon">🎤</div>
            <h4>No Artists Found</h4>
            <p>Your music library appears to be empty</p>
          </div>
        `;
        return;
      }

      const artistsHTML = `
        <div class="artist-browser">
          ${artists
            .map(
              (artist) => `
            <div class="artist-item-card" data-artist="${this.escapeHtml(artist.artist)}">
              <div class="artist-item-name">${this.escapeHtml(artist.artist || 'Unknown Artist')}</div>
              <div class="artist-item-stats">${artist.track_count} tracks</div>
            </div>
          `
            )
            .join('')}
        </div>
      `;

      console.log(`🔍 DEBUG: Generated HTML for ${artists.length} artists`);

      leftPaneContent.innerHTML = artistsHTML;

      // Add click handlers
      leftPaneContent.querySelectorAll('.artist-item-card').forEach((card) => {
        card.addEventListener('click', () => {
          const artist = card.dataset.artist;
          this.selectArtistInBrowser(artist);
        });
      });
    } catch (error) {
      this.app.logger.error('❌ Error loading artists:', error);
      this.showErrorInLeftPane('Failed to load artists');
    }
  }

  async loadAlbumsInLeftPane() {
    const leftPaneTitle = document.getElementById('leftPaneTitle');
    const leftPaneContent = document.getElementById('leftPaneContent');

    if (leftPaneTitle) leftPaneTitle.textContent = 'All Albums';

    try {
      // Show loading
      if (leftPaneContent) {
        leftPaneContent.innerHTML = `
          <div class="loading-state">
            <div class="loading-spinner"></div>
            <p>Loading albums...</p>
          </div>
        `;
      }

      const albums = await window.queMusicAPI.database.getAllAlbums();
      console.log(`🔍 DEBUG: Fetched ${albums.length} albums from database`);

      if (albums.length === 0) {
        leftPaneContent.innerHTML = `
          <div class="empty-pane">
            <div class="empty-pane-icon">💿</div>
            <h4>No Albums Found</h4>
            <p>Your music library appears to be empty</p>
          </div>
        `;
        return;
      }

      const albumsHTML = `
        <div class="album-browser">
          ${albums
            .map(
              (album) => `
            <div class="album-item-card" data-album="${this.escapeHtml(album.album)}" data-artist="${this.escapeHtml(album.artist)}">
              <div class="album-item-name">${this.escapeHtml(album.album || 'Unknown Album')}</div>
              <div class="album-item-artist">${this.escapeHtml(album.artist || 'Unknown Artist')}</div>
              <div class="album-item-stats">${album.track_count} tracks</div>
            </div>
          `
            )
            .join('')}
        </div>
      `;

      console.log(`🔍 DEBUG: Generated HTML for ${albums.length} albums`);

      leftPaneContent.innerHTML = albumsHTML;

      // Add click handlers
      leftPaneContent.querySelectorAll('.album-item-card').forEach((card) => {
        card.addEventListener('click', () => {
          const album = card.dataset.album;
          const artist = card.dataset.artist;
          this.selectAlbumInBrowser(album, artist);
        });
      });
    } catch (error) {
      this.app.logger.error('❌ Error loading albums:', error);
      this.showErrorInLeftPane('Failed to load albums');
    }
  }

  async selectArtistInBrowser(artist) {
    console.log(`🎤 Selecting artist: ${artist}`);

    // Visual selection
    document.querySelectorAll('.artist-item-card').forEach((card) => {
      card.classList.remove('active');
    });
    const selectedCard = document.querySelector(`[data-artist="${artist}"]`);
    if (selectedCard) selectedCard.classList.add('active');

    // Load artist tracks in right pane
    try {
      const tracks = await window.queMusicAPI.database.getTracksByArtist(artist);
      this.displayTracksInRightPane(tracks, `🎤 ${artist}`, `${tracks.length} tracks`);
    } catch (error) {
      this.app.logger.error('❌ Error loading artist tracks:', error);
    }
  }

  async selectAlbumInBrowser(album, artist) {
    console.log(`💿 Selecting album: ${album} by ${artist}`);

    // Visual selection
    document.querySelectorAll('.album-item-card').forEach((card) => {
      card.classList.remove('active');
    });
    const selectedCard = document.querySelector(`[data-album="${album}"][data-artist="${artist}"]`);
    if (selectedCard) selectedCard.classList.add('active');

    // Load album tracks in right pane
    try {
      const tracks = await window.queMusicAPI.database.getTracksByAlbum(album, artist);
      this.displayTracksInRightPane(
        tracks,
        `💿 ${album}`,
        `by ${artist} • ${tracks.length} tracks`
      );
    } catch (error) {
      this.app.logger.error('❌ Error loading album tracks:', error);
    }
  }

  displayTracksInRightPane(tracks, title, subtitle) {
    const rightPaneTitle = document.getElementById('rightPaneTitle');
    const rightPaneContent = document.getElementById('rightPaneContent');
    const rightPaneActions = document.getElementById('rightPaneActions');

    if (rightPaneTitle) rightPaneTitle.textContent = title;

    // Handle empty tracks array (no selection)
    if (!tracks || tracks.length === 0) {
      if (rightPaneActions) rightPaneActions.innerHTML = '';
      if (rightPaneContent) {
        rightPaneContent.innerHTML = `
        <div class="empty-pane">
          <div class="empty-pane-icon">🎵</div>
          <h4>No Selection</h4>
          <p>Select an artist, album, or playlist to view tracks.</p>
        </div>
        `;
      }
      return;
    }

    // Validate tracks before processing
    const validTracks = tracks.filter((track) => {
      if (!track.path) return false;
      return track.path.includes('\\') || track.path.includes('/');
    });

    if (rightPaneActions) {
      if (validTracks.length > 0) {
        rightPaneActions.innerHTML = `
        <button class="btn-primary btn-sm" id="playAllTracksBtn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="5,3 19,12 5,21"></polygon>
          </svg>
          Play All
        </button>
      `;

        const playAllBtn = document.getElementById('playAllTracksBtn');
        if (playAllBtn) {
          playAllBtn.addEventListener('click', () => {
            this.handlePlayAllTracks(validTracks);
          });
        }
      } else {
        rightPaneActions.innerHTML = '';
      }
    }

    if (rightPaneContent) {
      if (validTracks.length === 0) {
        rightPaneContent.innerHTML = `
        <div class="empty-pane">
          <div class="empty-pane-icon">⚠️</div>
          <h4>Invalid File Paths</h4>
          <p>All tracks have malformed paths. Please rescan your library.</p>
        </div>
      `;
      } else {
        // Use library manager's method for consistency
        const tracksHTML = this.app.libraryManager.generateTrackListWithSelection(validTracks);
        rightPaneContent.innerHTML = tracksHTML;

        // Setup library selection events
        this.app.libraryManager.setupLibrarySelectionEvents();
      }
    }

    setTimeout(() => {
      this.refreshContextMenuSystem();
    }, 100);

    console.log(`Displayed ${validTracks.length} valid tracks out of ${tracks.length} total`);
  }

  handlePlayAllTracks(tracks) {
    if (tracks.length === 0) {
      this.app.showNotification('No tracks to play', 'warning');
      return;
    }

    const firstTrack = tracks[0];

    // Validate first track path
    if (!firstTrack.path || (!firstTrack.path.includes('\\') && !firstTrack.path.includes('/'))) {
      this.app.logger.error('Invalid first track path:', firstTrack.path);
      this.app.showNotification('Invalid file path detected', 'error');
      return;
    }

    // Clear existing playlist and set up new one from favorites
    this.app.coreAudio.clearPlaylist();
    this.app.coreAudio.playlist = tracks.map((track) => ({
      path: track.path,
      name: track.title || track.name || this.app.getBasename(track.path),
      title: track.title || track.name,
      artist: track.artist || 'Unknown Artist',
    }));

    this.app.coreAudio.currentTrackIndex = 0;
    this.app.coreAudio.playSong(firstTrack.path, false);
    this.app.showNotification(`Playing ${tracks.length} tracks`, 'success');
  }

  async showDiscoverView() {
    const singlePaneContent = document.getElementById('singlePaneContent');
    if (singlePaneContent) {
      // Show loading state
      singlePaneContent.innerHTML = `
        <div class="loading-state">
          <div class="loading-spinner"></div>
          <p>Loading discovery options...</p>
        </div>
      `;

      try {
        // Call your existing advanced filters method
        await this.app.libraryManager.showAdvancedFilters();
      } catch (error) {
        this.app.logger.error('❌ Error loading discover view:', error);
        singlePaneContent.innerHTML = `
          <div class="error-state">
            <div class="error-icon">⚠️</div>
            <h3>Error Loading Discover</h3>
            <p>Please try refreshing the application</p>
          </div>
        `;
      }
    }
  }

  showErrorInLeftPane(message) {
    const leftPaneContent = document.getElementById('leftPaneContent');
    if (leftPaneContent) {
      leftPaneContent.innerHTML = `
        <div class="empty-pane">
          <div class="empty-pane-icon">❌</div>
          <h4>Error</h4>
          <p>${message}</p>
        </div>
      `;
    }
  }

  // ========================================
  // HELPER METHODS FOR TRACK LISTS
  // ========================================

  extractSongDataFromCard(card) {
    const songPath = card.dataset.path;
    const titleElement = card.querySelector('.song-title');
    const artistElement = card.querySelector('.song-artist');

    return {
      path: songPath,
      name: titleElement?.textContent || 'Unknown',
      title: titleElement?.textContent || 'Unknown',
      artist: artistElement?.textContent || 'Unknown Artist',
      filename: this.app.getBasename(songPath),
    };
  }

  formatDuration(seconds) {
    if (!seconds) return '';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m`;
    } else {
      return '< 1m';
    }
  }

  // ========================================
  // CONTEXT MENU SYSTEM
  // ========================================

  // Initialize context menu system
  initializeContextMenus() {
    try {
      this.ensureContextMenuSystem();
      this.setupGlobalEventDelegation(); // NEW: Global event delegation
    } catch (error) {
      this.app.logger.error('❌ Error initializing context menus:', error);
      // Retry after a delay
      setTimeout(() => {
        this.initializeContextMenus();
      }, 1000);
    }
  }

  // ENHANCED: Ensure context menu system is always available
  ensureContextMenuSystem() {
    // Check if system is already properly initialized
    if (this.contextMenuInitialized && document.getElementById('songContextMenu')) {
      return;
    }

    // Remove any existing context menus to prevent duplicates
    const existingMenu = document.getElementById('songContextMenu');
    const existingSubmenu = document.getElementById('playlistSubmenu');
    if (existingMenu) existingMenu.remove();
    if (existingSubmenu) existingSubmenu.remove();

    // Create fresh context menu HTML
    this.createContextMenuHTML();

    // Setup global event delegation
    this.setupGlobalContextMenuListeners();
    this.setupGlobalEventDelegation();

    // Setup individual menu item listeners
    this.setupContextMenuItemListeners();

    this.contextMenuInitialized = true;
  }
  // Create context menu HTML structure
  createContextMenuHTML() {
    // Remove existing context menu if it exists
    const existingMenu = document.getElementById('songContextMenu');
    const existingSubmenu = document.getElementById('playlistSubmenu');

    if (existingMenu) existingMenu.remove();
    if (existingSubmenu) existingSubmenu.remove();

    // Create context menu HTML
    const contextMenuHTML = `
    <div class="song-context-menu" id="songContextMenu" style="display: none;">
      <div class="context-item" id="playTrackContext">
        <span class="context-icon">▶️</span>
        <span>Play Track</span>
      </div>
      <div class="context-item" id="addToQueueContext">
        <span class="context-icon">⏭️</span>
        <span>Add to Queue</span>
      </div>
      <div class="context-separator"></div>
      <div class="context-item" id="addToPlaylistContext">
        <span class="context-icon">📋</span>
        <span>Add to Playlist</span>
        <span class="context-arrow">▶</span>
      </div>
      <div class="context-separator"></div>
      <div class="context-item" id="showInFolderContext">
        <span class="context-icon">📁</span>
        <span>Show in Folder</span>
      </div>
      <div class="context-item" id="trackInfoContext">
        <span class="context-icon">ℹ️</span>
        <span>Track Info</span>
      </div>
    </div>

    <!-- Playlist submenu -->
    <div class="playlist-submenu" id="playlistSubmenu" style="display: none;">
      <div class="submenu-header">
        <span>Add to Playlist</span>
      </div>
      <div class="submenu-content" id="playlistSubmenuContent">
        <!-- Playlist options will be populated dynamically -->
      </div>
      <div class="context-separator"></div>
      <div class="context-item" id="createNewPlaylistContext">
        <span class="context-icon">➕</span>
        <span>Create New Playlist</span>
      </div>
    </div>
  `;

    // Add to document body
    document.body.insertAdjacentHTML('beforeend', contextMenuHTML);
  }

  // Global event delegation for context menus
  setupGlobalEventDelegation() {
    // Remove existing global listeners to prevent duplicates
    if (this.globalContextMenuHandler) {
      document.removeEventListener('contextmenu', this.globalContextMenuHandler);
    }

    // Create bound handler so we can remove it later
    this.globalContextMenuHandler = (event) => {
      // FIXED: More comprehensive selector for song cards
      const songCard = event.target.closest(
        [
          '.song-card',
          '.search-result-card',
          '.track-item',
          '.favorite-item-card',
          '.recent-item-card',
          '.track-card-right',
          '.playlist-item-card', // Added playlist cards
          '.playlist-track', // Added playlist track items
        ].join(', ')
      );

      // FIXED: Better validation of song card data
      if (songCard && (songCard.dataset.path || songCard.dataset.trackPath || songCard.dataset.playlistId)) {
        event.preventDefault();
        event.stopPropagation();

        console.log(
          'Global context menu triggered for:',
          songCard.dataset.path || songCard.dataset.trackPath || songCard.dataset.playlistId
        );

        // Handle different card types
        if (songCard.dataset.path || songCard.dataset.trackPath) {
          // Song/track card (library or playlist)
          const songData = this.extractSongDataFromAnyCard(songCard);
          this.showTrackContextMenu(event, songData);
        } else if (songCard.dataset.playlistId) {
          // Playlist card - delegate to playlist renderer
          const playlistId = songCard.dataset.playlistId;
          if (this.app.playlistRenderer && this.app.playlistRenderer.showPlaylistContextMenu) {
            // Find playlist data
            const playlists = document.querySelectorAll('.playlist-item-card');
            let playlistData = null;

            playlists.forEach((card) => {
              if (card.dataset.playlistId === playlistId) {
                playlistData = {
                  id: playlistId,
                  name: card.querySelector('.playlist-item-name')?.textContent || 'Unknown',
                };
              }
            });

            if (playlistData) {
              this.app.playlistRenderer.showPlaylistContextMenu(event, playlistData);
            }
          }
        }
      }
    };

    // Add the global listener
    document.addEventListener('contextmenu', this.globalContextMenuHandler);
  }

  //this method to ensure context menus work after dynamic content loading
  refreshContextMenuSystem() {
    // Force reinitialization
    this.contextMenuInitialized = false;

    // Remove existing handlers
    if (this.globalContextMenuHandler) {
      document.removeEventListener('contextmenu', this.globalContextMenuHandler);
      this.globalContextMenuHandler = null;
    }

    // Reinitialize
    this.ensureContextMenuSystem();
  }

  // ENHANCED: Universal song data extraction
  extractSongDataFromAnyCard(card) {
    const songPath = card.dataset.path || card.dataset.trackPath;

    if (!songPath) {
      this.app.logger.warn('No song path found in card data', card);
      return null;
    }

    // Define selector patterns for different card types
    const selectors = {
      title: [
        '.song-title',
        '.track-title',
        '.favorite-item-title',
        '.recent-item-title',
        '.track-name',
        '.track-title-right',
        '.card-title',
      ],
      artist: [
        '.song-artist',
        '.track-artist',
        '.favorite-item-artist',
        '.recent-item-artist',
        '.track-artist-right',
        '.card-subtitle',
      ],
      album: [
        '.song-album',
        '.track-album',
        '.favorite-item-album',
        '.recent-item-album',
        '.track-album-right',
      ],
    };

    // Helper to get first matching element text
    const getData = (selectorArray) => {
      for (const selector of selectorArray) {
        const element = card.querySelector(selector);
        if (element && element.textContent) {
          return element.textContent.trim();
        }
      }
      return null;
    };

    const title = getData(selectors.title) || 'Unknown';
    const artist = getData(selectors.artist) || 'Unknown Artist';
    const album = getData(selectors.album) || 'Unknown Album';

    const songData = {
      path: songPath,
      name: title,
      title: title,
      artist: artist,
      album: album,
      filename: this.app.getBasename ? this.app.getBasename(songPath) : songPath.split('/').pop(),
    };

    console.log('Extracted song data:', songData);
    return songData;
  }

  // Setup global context menu event listeners
  setupGlobalContextMenuListeners() {
    // Hide context menus when clicking elsewhere
    document.addEventListener('click', (event) => {
      if (
        !event.target.closest('.song-context-menu') &&
        !event.target.closest('.playlist-submenu')
      ) {
        this.hideAllContextMenus();
      }
    });

    // Hide on escape key
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.hideAllContextMenus();
      }
    });

    // Setup context menu item listeners with better error handling
    this.setupContextMenuItemListeners();
  }

  // Setup individual context menu item listeners
  setupContextMenuItemListeners() {
    // Wait for DOM to be ready
    setTimeout(() => {
      const playTrackContext = document.getElementById('playTrackContext');
      const addToQueueContext = document.getElementById('addToQueueContext');
      const addToPlaylistContext = document.getElementById('addToPlaylistContext');
      const showInFolderContext = document.getElementById('showInFolderContext');
      const trackInfoContext = document.getElementById('trackInfoContext');
      const createNewPlaylistContext = document.getElementById('createNewPlaylistContext');

      // Play Track
      if (playTrackContext) {
        playTrackContext.addEventListener('click', () => {
          if (this.currentContextTrack) {
            console.log('▶️ Playing track from context menu:', this.currentContextTrack.title);
            this.app.coreAudio.playSong(this.currentContextTrack.path);
            this.hideAllContextMenus();
          }
        });
      }

      // Add to Queue
      if (addToQueueContext) {
        addToQueueContext.addEventListener('click', () => {
          if (this.currentContextTrack) {
            // Get track path
            const trackPath = this.currentContextTrack.path || this.currentContextTrack.dataset.path;
            if (trackPath) {
              // Pass the full track object (title/artist/album/duration) so the
              // queue entry has real metadata, not just a bare filename.
              this.app.coreAudio.addToQueue(this.currentContextTrack);
              this.app.logger.debug(' Added track to queue via context menu:', trackPath);
            } else {
              this.app.logger.error('❌ No track path found for context menu item');
              this.app.showNotification('Unable to add track to queue', 'error');
            }
            this.hideAllContextMenus();
          }
        });
      }

      // Add to Playlist (show submenu)
      if (addToPlaylistContext) {
        addToPlaylistContext.addEventListener('click', (event) => {
          event.stopPropagation();
          this.showPlaylistSubmenu(event);
        });
      }

      // Show in Folder
      if (showInFolderContext) {
        showInFolderContext.addEventListener('click', () => {
          if (this.currentContextTrack) {
            this.app.showNotification(`File: ${this.currentContextTrack.filename}`, 'info');
            this.hideAllContextMenus();
          }
        });
      }

      // Track Info
      if (trackInfoContext) {
        trackInfoContext.addEventListener('click', () => {
          if (this.currentContextTrack) {
            this.showTrackInfo(this.currentContextTrack);
            this.hideAllContextMenus();
          }
        });
      }

      // Create New Playlist
      if (createNewPlaylistContext) {
        createNewPlaylistContext.addEventListener('click', () => {
          this.hideAllContextMenus();
          if (this.app.playlistRenderer && this.selectedTracks.length > 0) {
            // Pass all selected tracks to create playlist with them included
            if (this.selectedTracks.length === 1) {
              this.app.playlistRenderer.showPlaylistModalWithTrack(this.selectedTracks[0]);
            } else {
              this.app.playlistRenderer.showPlaylistModalWithTracks(this.selectedTracks);
            }
          } else if (this.app.playlistRenderer) {
            this.app.playlistRenderer.showPlaylistModal();
          }
        });
      }
    }, 100);
  }

  // Show context menu for a track
  showTrackContextMenu(event, track) {
    event.preventDefault();
    event.stopPropagation();

    this.currentContextTrack = track;

    // Check if the clicked track is already selected
    const clickedCard = event.target.closest('.song-card, .search-result-card, .track-item, .favorite-item-card, .recent-item-card, .track-card-right');
    const isClickedTrackSelected = clickedCard?.classList.contains('selected');

    // If right-clicking on an unselected track, collect all selected tracks
    if (!isClickedTrackSelected) {
      // Clear previous selection and select only this track
      this.selectedTracks = [track];
    } else {
      // Collect all currently selected tracks
      const selectedCards = document.querySelectorAll('.song-card.selected, .search-result-card.selected, .track-item.selected, .favorite-item-card.selected, .recent-item-card.selected, .track-card-right.selected');
      this.selectedTracks = Array.from(selectedCards).map(card => this.extractSongDataFromAnyCard(card));

      // If no tracks selected, use the clicked track
      if (this.selectedTracks.length === 0) {
        this.selectedTracks = [track];
      }
    }

    console.log(`🎵 Context menu for ${this.selectedTracks.length} track(s)`);

    const contextMenu = document.getElementById('songContextMenu');

    if (!contextMenu) {
      this.app.logger.error('Context menu not found');
      return;
    }

    // Check if we're currently viewing a playlist and update menu accordingly
    this.updateContextMenuForCurrentView();

    // Update menu text for multiple selections
    this.updateContextMenuForMultiSelect();

    // Position the context menu
    this.positionContextMenu(contextMenu, event.clientX, event.clientY);

    // Show the menu
    contextMenu.style.display = 'block';

  }

  // Update context menu text for multiple track selections
  updateContextMenuForMultiSelect() {
    const contextMenu = document.getElementById('songContextMenu');
    if (!contextMenu) return;

    const trackCount = this.selectedTracks.length;

    // Update "Add to Playlist" text
    const addToPlaylistContext = document.getElementById('addToPlaylistContext');
    if (addToPlaylistContext && trackCount > 1) {
      const textSpan = addToPlaylistContext.querySelector('span:not(.context-icon):not(.context-arrow)');
      if (textSpan) {
        textSpan.textContent = `Add ${trackCount} Tracks to Playlist`;
      }
    } else if (addToPlaylistContext) {
      const textSpan = addToPlaylistContext.querySelector('span:not(.context-icon):not(.context-arrow)');
      if (textSpan) {
        textSpan.textContent = 'Add to Playlist';
      }
    }

    // Update submenu header
    const playlistSubmenu = document.getElementById('playlistSubmenu');
    if (playlistSubmenu) {
      const submenuHeader = playlistSubmenu.querySelector('.submenu-header span');
      if (submenuHeader && trackCount > 1) {
        submenuHeader.textContent = `Add ${trackCount} Tracks to Playlist`;
      } else if (submenuHeader) {
        submenuHeader.textContent = 'Add to Playlist';
      }
    }

    // Update "Create New Playlist" text in submenu
    const createNewPlaylistContext = document.getElementById('createNewPlaylistContext');
    if (createNewPlaylistContext && trackCount > 1) {
      const textSpan = createNewPlaylistContext.querySelector('span:not(.context-icon)');
      if (textSpan) {
        textSpan.textContent = `Create Playlist with ${trackCount} Tracks`;
      }
    } else if (createNewPlaylistContext) {
      const textSpan = createNewPlaylistContext.querySelector('span:not(.context-icon)');
      if (textSpan) {
        textSpan.textContent = 'Create New Playlist';
      }
    }
  }

  // Update context menu based on current view (playlist vs library)
  updateContextMenuForCurrentView() {
    const contextMenu = document.getElementById('songContextMenu');
    if (!contextMenu) return;

    // Check if we're currently viewing a playlist
    const isInPlaylistView = this.app.playlistRenderer && this.app.playlistRenderer.currentPlaylistData;

    // Look for existing remove option
    let removeFromPlaylistItem = document.getElementById('removeFromPlaylistContext');

    if (isInPlaylistView) {
      // Add "Remove from playlist" option if not already present
      if (!removeFromPlaylistItem) {
        // Find the separator before "Show in Folder" to insert before it
        const separator = contextMenu.querySelector('.context-separator');
        if (separator) {
          const removeItemHTML = `
            <div class="context-item" id="removeFromPlaylistContext">
              <span class="context-icon">🗑️</span>
              <span>Remove from Playlist</span>
            </div>`;
          
          separator.insertAdjacentHTML('beforebegin', removeItemHTML);
          
          // Add event listener for the new option
          removeFromPlaylistItem = document.getElementById('removeFromPlaylistContext');
          if (removeFromPlaylistItem) {
            removeFromPlaylistItem.addEventListener('click', () => {
              this.removeTrackFromPlaylistFromContext();
            });
          }
        }
      }
    } else {
      // Remove "Remove from playlist" option if present and we're not in playlist view
      if (removeFromPlaylistItem) {
        removeFromPlaylistItem.remove();
      }
    }
  }

  // Remove track from current playlist via context menu
  async removeTrackFromPlaylistFromContext() {
    console.log('🗑️ removeTrackFromPlaylistFromContext called');
    console.log('🗑️ Current context track:', this.currentContextTrack);
    console.log('🗑️ Playlist renderer exists:', !!this.app.playlistRenderer);
    console.log('🗑️ Current playlist data:', this.app.playlistRenderer?.currentPlaylistData);
    
    if (!this.currentContextTrack || !this.app.playlistRenderer || !this.app.playlistRenderer.currentPlaylistData) {
      this.app.logger.error('❌ Cannot remove track: missing context track or playlist data');
      return;
    }

    try {
      // Find the track element in the UI - try multiple selectors
      const trackSelectors = [
        '.track-card-right',
        '.playlist-track', 
        '.song-card',
        '.track-item',
        '[data-path]'
      ];
      
      let trackElement = null;
      this.app.logger.debug(' Looking for track with path:', this.currentContextTrack.path);

      for (const selector of trackSelectors) {
        const elements = document.querySelectorAll(selector);
        console.log(`🔍 Found ${elements.length} elements with selector: ${selector}`);
        
        for (const element of elements) {
          const elementPath = element.dataset.path || element.dataset.trackPath;
          if (elementPath === this.currentContextTrack.path) {
            trackElement = element;
            this.app.logger.info(' Found matching track element:', element);
            
            // Extract the track ID from the DOM element if available
            if (element.dataset.trackId) {
              console.log('🔧 Adding track ID to track data:', element.dataset.trackId);
              this.currentContextTrack.id = parseInt(element.dataset.trackId);
            }
            break;
          }
        }
        
        if (trackElement) break;
      }

      if (trackElement) {
        await this.app.playlistRenderer.removeTrackFromCurrentPlaylistByData(this.currentContextTrack, trackElement);
      } else {
        this.app.logger.error('❌ Could not find track element in DOM');
        this.app.showNotification('Failed to remove track from playlist', 'error');
      }
    } catch (error) {
      this.app.logger.error('❌ Error removing track from playlist via context menu:', error);
      this.app.showNotification('Failed to remove track from playlist', 'error');
    }

    // Hide context menu
    this.hideAllContextMenus();
  }

  // Show playlist submenu
  async showPlaylistSubmenu(event) {
    const submenu = document.getElementById('playlistSubmenu');
    const submenuContent = document.getElementById('playlistSubmenuContent');

    if (!submenu || !submenuContent) {
      this.app.logger.error('❌ Playlist submenu elements not found');
      this.ensureContextMenuSystem(); // Try to recreate
      return;
    }

    try {
      console.log('📋 Loading playlists for submenu...');

      // Show loading state
      submenuContent.innerHTML =
        '<div class="context-item disabled"><span class="context-icon">⏳</span><span>Loading playlists...</span></div>';

      // Load current playlists
      const playlists = await window.queMusicAPI.playlists.getAll();

      // Generate playlist options
      submenuContent.innerHTML =
        playlists.length > 0
          ? playlists
              .map(
                (playlist) => `
          <div class="context-item playlist-option" data-playlist-id="${playlist.id}">
            <span class="context-icon">📋</span>
            <span>${this.escapeHtml(playlist.name)}</span>
            <span class="playlist-track-count">${playlist.track_count || 0}</span>
          </div>
        `
              )
              .join('')
          : '<div class="context-item disabled"><span class="context-icon">📭</span><span>No playlists yet</span></div>';

      // Add event listeners to playlist options
      submenuContent.querySelectorAll('.playlist-option').forEach((option) => {
        option.addEventListener('click', () => {
          const playlistId = option.dataset.playlistId;
          console.log('📋 Selected playlist:', playlistId);
          this.addTrackToPlaylistFromContext(playlistId);
        });
      });

      // Position submenu next to the main context menu
      const mainMenu = document.getElementById('songContextMenu');
      if (mainMenu) {
        const mainRect = mainMenu.getBoundingClientRect();

        submenu.style.left = `${mainRect.right + 5}px`;
        submenu.style.top = `${mainRect.top}px`;

        // Ensure submenu stays within viewport
        const submenuRect = submenu.getBoundingClientRect();
        if (submenuRect.right > window.innerWidth) {
          submenu.style.left = `${mainRect.left - submenuRect.width - 5}px`;
        }
        if (submenuRect.bottom > window.innerHeight) {
          submenu.style.top = `${window.innerHeight - submenuRect.height - 10}px`;
        }

        submenu.style.display = 'block';
      }
    } catch (error) {
      this.app.logger.error('❌ Error loading playlists for submenu:', error);
      submenuContent.innerHTML =
        '<div class="context-item disabled"><span class="context-icon">❌</span><span>Error loading playlists</span></div>';
      submenu.style.display = 'block';
    }
  }

  // Add track(s) to playlist from context menu
  async addTrackToPlaylistFromContext(playlistId) {
    const tracksToAdd = this.selectedTracks.length > 0 ? this.selectedTracks : [this.currentContextTrack];

    if (!tracksToAdd[0] || !playlistId) {
      this.app.logger.error('❌ Missing track or playlist ID');
      return;
    }

    try {
      // Get playlist name for notification
      const playlist = await window.queMusicAPI.playlists.getById(playlistId);

      if (tracksToAdd.length === 1) {
        // Single track - use original logic
        console.log(`📋 Adding track "${tracksToAdd[0].title}" to playlist ${playlistId}`);

        // Get track from database
        const dbTrack = await window.queMusicAPI.database.getTrackByPath(tracksToAdd[0].path);

        if (!dbTrack) {
          this.app.logger.error('❌ Track not found in database:', tracksToAdd[0].path);
          this.app.showNotification('Track not found in database', 'error');
          this.hideAllContextMenus();
          return;
        }

        // Add track to playlist
        await window.queMusicAPI.playlists.addTrack(playlistId, dbTrack.id);

        this.app.showNotification(
          `Added "${tracksToAdd[0].title}" to "${playlist.name}"`,
          'success'
        );
      } else {
        // Multiple tracks
        console.log(`📋 Adding ${tracksToAdd.length} tracks to playlist ${playlistId}`);

        let successCount = 0;
        let failCount = 0;
        let duplicateCount = 0;

        for (const track of tracksToAdd) {
          try {
            const dbTrack = await window.queMusicAPI.database.getTrackByPath(track.path);

            if (dbTrack && dbTrack.id) {
              await window.queMusicAPI.playlists.addTrack(playlistId, dbTrack.id);
              successCount++;
            } else {
              this.app.logger.warn('⚠️ Track not found in database:', track.path);
              failCount++;
            }
          } catch (error) {
            if (error.message && error.message.includes('already in this playlist')) {
              duplicateCount++;
            } else {
              this.app.logger.error('❌ Error adding track:', error);
              failCount++;
            }
          }
        }

        // Show summary notification
        const messages = [];
        if (successCount > 0) {
          messages.push(`Added ${successCount} track${successCount !== 1 ? 's' : ''} to "${playlist.name}"`);
        }
        if (duplicateCount > 0) {
          messages.push(`${duplicateCount} already in playlist`);
        }
        if (failCount > 0) {
          messages.push(`${failCount} failed`);
        }

        this.app.showNotification(messages.join(', '), successCount > 0 ? 'success' : 'warning');
      }
    } catch (error) {
      this.app.logger.error('❌ Error adding track(s) to playlist:', error);

      if (error.message && error.message.includes('already in this playlist')) {
        this.app.showNotification('Track is already in this playlist', 'warning');
      } else {
        this.app.showNotification('Failed to add track(s) to playlist', 'error');
      }
    }

    this.hideAllContextMenus();
  }

  // Position context menu within viewport
  positionContextMenu(menu, x, y) {
    // Show menu temporarily to get dimensions
    menu.style.display = 'block';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    const rect = menu.getBoundingClientRect();

    // Adjust if menu goes outside viewport
    if (rect.right > window.innerWidth) {
      menu.style.left = `${x - rect.width}px`;
    }

    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${y - rect.height}px`;
    }

    // Ensure menu doesn't go above or left of viewport
    if (parseInt(menu.style.left) < 0) {
      menu.style.left = '10px';
    }

    if (parseInt(menu.style.top) < 0) {
      menu.style.top = '10px';
    }
  }

  // Hide all context menus
  hideAllContextMenus() {
    const songContextMenu = document.getElementById('songContextMenu');
    const playlistSubmenu = document.getElementById('playlistSubmenu');

    if (songContextMenu) songContextMenu.style.display = 'none';
    if (playlistSubmenu) playlistSubmenu.style.display = 'none';

    this.currentContextTrack = null;
  }

  // Enhanced track information display using alert
  showTrackInfo(track) {
    console.log('📋 Showing track info for:', track);

    const info = `TRACK INFORMATION
━━━━━━━━━━━━━━━━━━━━

Title: ${track.title || 'Unknown'}
Artist: ${track.artist || 'Unknown Artist'}
Album: ${track.album || 'Unknown Album'}
Year: ${track.year || 'Unknown'}

Format: ${track.format || 'Unknown'}
Size: ${track.sizeText || 'Unknown'}
Filename: ${track.filename || this.app.getBasename(track.path)}

Path: ${track.path}`;

    alert(info);
  }

  // ========================================
  // SETTINGS MANAGEMENT
  // ========================================

  showSettingsModal() {
    this.app.logger.info('Opening settings...');

    // Load current settings
    this.loadSettingsIntoModal();

    // Show modal with proper CSS classes
    const modal = document.getElementById('settingsModal');
    if (modal) {
      // First set display to flex
      modal.style.display = 'flex';

      // Force a reflow to ensure display change is applied
      modal.offsetHeight;

      // Then add the show class for animation
      setTimeout(() => {
        modal.classList.add('show');
      }, 10);

      // Set up event listeners
      this.setupSettingsEventListeners();

      // Add escape key listener
      this.addModalEscapeListener();
    } else {
      this.app.logger.error('❌ Settings modal element not found');
    }
  }

  hideSettingsModal() {
    const modal = document.getElementById('settingsModal');
    if (modal) {
      // Remove show class for animation
      modal.classList.remove('show');

      // Wait for animation to complete, then hide
      setTimeout(() => {
        modal.style.display = 'none';
      }, 300); // Match your CSS transition duration

      // Remove escape key listener
      this.removeModalEscapeListener();
    }
  }

  // Add these helper methods to your UIController class:

  addModalEscapeListener() {
    // Guard against leaking a stale listener if this is ever called twice
    // without an intervening hideSettingsModal() (e.g. a stray double-open)
    // — same leaked-listener shape already found and fixed in the playlist
    // context menu (commit d965d99).
    this.removeModalEscapeListener();
    this.modalEscapeHandler = (e) => {
      if (e.key === 'Escape') {
        this.hideSettingsModal();
      }
    };
    document.addEventListener('keydown', this.modalEscapeHandler);
  }

  removeModalEscapeListener() {
    if (this.modalEscapeHandler) {
      document.removeEventListener('keydown', this.modalEscapeHandler);
      this.modalEscapeHandler = null;
    }
  }

  // Enhanced setupSettingsEventListeners method:
  setupSettingsEventListeners() {
    // Remove any existing listeners by cloning elements
    this.removeSettingsEventListeners();

    // Close modal handlers
    const closeBtn = document.getElementById('closeSettingsModal');
    const cancelBtn = document.getElementById('cancelSettings');
    const modal = document.getElementById('settingsModal');

    // Close button
    if (closeBtn) {
      this.closeSettingsHandler = () => this.hideSettingsModal();
      closeBtn.addEventListener('click', this.closeSettingsHandler);
    }

    // Cancel button
    if (cancelBtn) {
      this.cancelSettingsHandler = () => this.hideSettingsModal();
      cancelBtn.addEventListener('click', this.cancelSettingsHandler);
    }

    // Click outside to close
    if (modal) {
      this.modalBackdropHandler = (e) => {
        if (e.target === modal) {
          this.hideSettingsModal();
        }
      };
      modal.addEventListener('click', this.modalBackdropHandler);
    }

    // Save settings
    const saveBtn = document.getElementById('saveSettings');
    if (saveBtn) {
      this.saveSettingsHandler = () => this.saveSettings();
      saveBtn.addEventListener('click', this.saveSettingsHandler);
    }

    // Reset settings
    const resetBtn = document.getElementById('resetSettings');
    if (resetBtn) {
      this.resetSettingsHandler = () => this.resetSettings();
      resetBtn.addEventListener('click', this.resetSettingsHandler);
    }

    // Change music folder
    const changeFolderBtn = document.getElementById('changeMusicFolder');
    if (changeFolderBtn) {
      this.changeFolderHandler = () => this.app.libraryManager.selectMusicFolder();
      changeFolderBtn.addEventListener('click', this.changeFolderHandler);
    }

    // Volume slider real-time update
    const volumeSlider = document.getElementById('defaultVolume');
    const volumeValue = document.getElementById('volumeValue');
    if (volumeSlider && volumeValue) {
      this.volumeSliderHandler = (e) => {
        volumeValue.textContent = `${e.target.value}%`;
      };
      volumeSlider.addEventListener('input', this.volumeSliderHandler);
    }

    // Theme change real-time preview
    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) {
      this.themeSelectHandler = (e) => this.previewTheme(e.target.value);
      themeSelect.addEventListener('change', this.themeSelectHandler);
    }
  }

  // clean up event listeners
  removeSettingsEventListeners() {
    // Clean up all stored handlers
    const handlers = [
      'closeSettingsHandler',
      'cancelSettingsHandler',
      'modalBackdropHandler',
      'saveSettingsHandler',
      'resetSettingsHandler',
      'changeFolderHandler',
      'volumeSliderHandler',
      'themeSelectHandler',
    ];

    handlers.forEach((handlerName) => {
      if (this[handlerName]) {
        // Remove from elements if they exist
        const elements = {
          closeSettingsModal: this.closeSettingsHandler,
          cancelSettings: this.cancelSettingsHandler,
          settingsModal: this.modalBackdropHandler,
          saveSettings: this.saveSettingsHandler,
          resetSettings: this.resetSettingsHandler,
          changeMusicFolder: this.changeFolderHandler,
          defaultVolume: this.volumeSliderHandler,
          themeSelect: this.themeSelectHandler,
        };

        Object.entries(elements).forEach(([id, handler]) => {
          const element = document.getElementById(id);
          if (element && handler) {
            element.removeEventListener('click', handler);
            element.removeEventListener('input', handler);
            element.removeEventListener('change', handler);
          }
        });

        this[handlerName] = null;
      }
    });
  }

  async loadSettingsIntoModal() {
    try {
      // Load current settings from storage or use defaults
      const settings = await this.getSettings();

      // Theme
      const themeSelect = document.getElementById('themeSelect');
      if (themeSelect) themeSelect.value = settings.theme || 'dark';

      // Volume
      const volumeSlider = document.getElementById('defaultVolume');
      const volumeValue = document.getElementById('volumeValue');
      if (volumeSlider && volumeValue) {
        const volume = Math.round((settings.volume || 0.5) * 100);
        volumeSlider.value = volume;
        volumeValue.textContent = `${volume}%`;
      }

      // Music folder
      const musicFolderPath = document.getElementById('musicFolderPath');
      if (musicFolderPath) {
        const musicFolder = await window.queMusicAPI.settings.getMusicFolder();
        musicFolderPath.value = musicFolder || 'No folder selected';
      }

      // Checkboxes
      this.setCheckboxValue('autoScan', settings.autoScan !== false);
      this.setCheckboxValue('watchFolders', settings.watchFolders !== false);
      this.setCheckboxValue('resumePlayback', settings.resumePlayback !== false);
      this.setCheckboxValue('rememberPosition', settings.rememberPosition !== false);
      this.setCheckboxValue('showAlbumArt', settings.showAlbumArt !== false);
      this.setCheckboxValue('showNotifications', settings.showNotifications !== false);
      this.setCheckboxValue('compactMode', settings.compactMode === true);
      this.setCheckboxValue('enableLogging', settings.enableLogging === true);

      // Selects
      this.setSelectValue('crossfade', settings.crossfade || '0');
      this.setSelectValue('skipShortTracks', settings.skipShortTracks || '0');
      this.setSelectValue('bufferSize', settings.bufferSize || '4096');
      this.setSelectValue('loggerLevel', settings.loggerLevel || 'HIGH');
    } catch (error) {
      this.app.logger.error('Error loading settings', { error: error.message });
    }
  }

  async saveSettings() {
    try {
      // Collect settings from form
      const settings = {
        theme: document.getElementById('themeSelect')?.value || 'dark',
        volume: parseFloat(document.getElementById('defaultVolume')?.value || 50) / 100,
        crossfade: parseInt(document.getElementById('crossfade')?.value || 0),
        autoScan: document.getElementById('autoScan')?.checked || false,
        watchFolders: document.getElementById('watchFolders')?.checked || false,
        resumePlayback: document.getElementById('resumePlayback')?.checked || false,
        rememberPosition: document.getElementById('rememberPosition')?.checked || false,
        skipShortTracks: parseInt(document.getElementById('skipShortTracks')?.value || 0),
        showAlbumArt: document.getElementById('showAlbumArt')?.checked || false,
        showNotifications: document.getElementById('showNotifications')?.checked || false,
        compactMode: document.getElementById('compactMode')?.checked || false,
        bufferSize: parseInt(document.getElementById('bufferSize')?.value || 4096),
        enableLogging: document.getElementById('enableLogging')?.checked || false,
        loggerLevel: document.getElementById('loggerLevel')?.value || 'HIGH',
      };

      // Save settings
      await this.setSettings(settings);

      // Apply settings immediately
      this.applySettings(settings);

      this.app.showNotification('Settings saved successfully!', 'success');
      this.hideSettingsModal();
    } catch (error) {
      this.app.logger.error('Error saving settings', { error: error.message });
      this.app.showNotification('Failed to save settings', 'error');
    }
  }

  async resetSettings() {
    const confirmed = confirm('Reset all settings to default values?\n\nThis cannot be undone.');

    if (confirmed) {
      try {
        // Reset to defaults
        const defaultSettings = {
          theme: 'dark',
          volume: 0.5,
          crossfade: 0,
          autoScan: true,
          watchFolders: true,
          resumePlayback: true,
          rememberPosition: true,
          skipShortTracks: 0,
          showAlbumArt: true,
          showNotifications: true,
          compactMode: false,
          bufferSize: 4096,
          enableLogging: false,
          loggerLevel: 'HIGH',
        };

        await this.setSettings(defaultSettings);
        this.applySettings(defaultSettings);
        this.loadSettingsIntoModal(); // Refresh the form

        this.app.showNotification('Settings reset to defaults', 'success');
      } catch (error) {
        this.app.logger.error('Error resetting settings', { error: error.message });
        this.app.showNotification('Failed to reset settings', 'error');
      }
    }
  }

  previewTheme(theme) {
    // Apply theme immediately for preview
    if (theme === 'auto') {
      // Detect system theme
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      theme = systemDark ? 'dark' : 'light';
    }

    document.documentElement.setAttribute('data-theme', theme);
    this.currentTheme = theme;
  }

  applySettings(settings) {
    // Apply theme
    this.previewTheme(settings.theme);

    // Apply volume
    if (this.app.coreAudio.audioPlayer) {
      this.app.coreAudio.audioPlayer.volume = settings.volume;
      this.app.coreAudio.volume = settings.volume;
      this.app.coreAudio.updateVolumeIcon();

      // Update volume slider in player
      const volumeSlider = document.getElementById('volumeSlider');
      if (volumeSlider) volumeSlider.value = settings.volume;
    }

    // Apply compact mode
    if (settings.compactMode) {
      document.body.classList.add('compact-mode');
    } else {
      document.body.classList.remove('compact-mode');
    }

    // Apply logger level
    if (settings.loggerLevel && this.app.logger) {
      this.app.logger.setLevel(settings.loggerLevel);
    }

    this.app.logger.info('Settings applied', settings);
  }

  // Helper methods
  setCheckboxValue(id, value) {
    const checkbox = document.getElementById(id);
    if (checkbox) checkbox.checked = value;
  }

  setSelectValue(id, value) {
    const select = document.getElementById(id);
    if (select) select.value = value;
  }

  async getSettings() {
    // You can implement this to load from your settings system
    // For now, return default settings
    return {
      theme: this.currentTheme || 'dark',
      volume: this.app.coreAudio.volume || 0.5,
      loggerLevel: this.app.logger?.getLevel() || 'HIGH',
    };
  }

  async setSettings(settings) {
    // You can implement this to save to your settings system
    // For now, just store in memory
    this.appSettings = settings;
    this.app.logger.info('Settings saved', settings);
  }

  // ============================================================================
  // QUEUE PANE (4th column, persistent) — the real playback queue
  // (this.app.coreAudio.queue), NOT a saved playlist. See docs/application/
  // roadmap.md priority #1 and layout-redesign.md. This is the single place
  // the queue gets rendered — there is no separate copy in the Now Playing view.
  // ============================================================================

  renderQueuePane() {
    const titleEl = document.getElementById('queuePaneTitle');
    const contentEl = document.getElementById('queuePaneContent');
    if (!titleEl || !contentEl) return;

    const queue = this.app.coreAudio?.getQueue ? this.app.coreAudio.getQueue() : [];

    // This pane is now the persistent Current Playlist: the manually-queued
    // "play next" tracks jump the line at top (unchanged), then the FULL
    // loaded playlist renders underneath — every track that was ever loaded,
    // not just what's left to play. Nothing drops out of the list as it
    // plays; the current track is highlighted and everything before it is
    // just dimmed to show where you are. (Converted from the old "Up Next"
    // preview-only pane 2026-09-18 — Erich: songs should never disappear
    // from the list, and the whole thing should be drag-reorderable.)
    const playlist = this.app.coreAudio?.playlist || [];
    const currentIndex = this.app.coreAudio?.currentTrackIndex ?? -1;

    // Clear only empties the manually-queued tracks (see CoreAudio.clearQueue),
    // it can't touch the Current Playlist below — so disable it whenever
    // there's nothing manual to clear, instead of leaving it clickable and
    // silently doing nothing (Erich caught this 2026-09-17).
    const clearBtn = document.getElementById('clearQueuePaneBtn');
    if (clearBtn) {
      clearBtn.disabled = queue.length === 0;
      clearBtn.title = clearBtn.disabled
        ? 'Nothing manually queued to clear (the list below is the current playlist, not the queue)'
        : 'Clear queue';
    }

    if (queue.length === 0 && playlist.length === 0) {
      titleEl.textContent = 'Current Playlist';
      contentEl.innerHTML = `
        <div class="empty-pane">
          <div class="empty-pane-icon">🎧</div>
          <p>Nothing playing. Drag a track here to add it to what's playing next.</p>
        </div>
      `;
      return;
    }

    titleEl.textContent = `Current Playlist (${playlist.length})`;
    contentEl.innerHTML = `
      <div class="queue-track-list">
        ${
          queue.length > 0
            ? `
        <div class="queue-track-section-label">Playing Next</div>
        ${queue
          .map(
            (track, index) => `
          <div class="queue-track-item" draggable="true" data-queue-index="${index}" data-path="${this.escapeHtml(track.path || '')}">
            <span class="queue-track-text">
              ${index + 1}. ${this.escapeHtml(track.title || track.name || '')}
              ${track.artist ? ` — <span class="queue-track-artist">${this.escapeHtml(track.artist)}</span>` : ''}
            </span>
            <button class="icon-btn remove-from-queue-btn" data-queue-index="${index}" title="Remove from queue">&times;</button>
          </div>
        `
          )
          .join('')}
        <div class="queue-track-section-label">Current Playlist</div>
        `
            : ''
        }
        ${playlist
          .map((track, index) => {
            const isCurrent = index === currentIndex;
            const isPlayed = currentIndex >= 0 && index < currentIndex;
            return `
          <div
            class="queue-track-item playlist-track-item${isCurrent ? ' now-playing' : ''}${isPlayed ? ' already-played' : ''}"
            draggable="true"
            data-playlist-index="${index}"
            data-path="${this.escapeHtml(track.path || '')}"
          >
            <span class="queue-track-text">
              ${index + 1}. ${isCurrent ? '♪ ' : ''}${this.escapeHtml(track.title || track.name || '')}
              ${track.artist ? ` — <span class="queue-track-artist">${this.escapeHtml(track.artist)}</span>` : ''}
            </span>
          </div>
        `;
          })
          .join('')}
      </div>
    `;

    this.attachQueuePaneHandlers();
  }

  // Wires up the queue pane's remove buttons, drag-to-reorder, and double-click-
  // to-play. Called every time renderQueuePane()'s HTML is (re)inserted. Scoped
  // to #queuePaneContent so it never touches unrelated elements elsewhere.
  attachQueuePaneHandlers() {
    const container = document.getElementById('queuePaneContent');
    if (!container) return;

    container.querySelectorAll('.remove-from-queue-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.app.coreAudio.removeFromQueue(parseInt(btn.dataset.queueIndex, 10));
      });
    });

    // Manually-queued rows (data-queue-index) and Current Playlist rows
    // (data-playlist-index) drag-reorder independently — dragging a queue
    // row only ever calls reorderQueue, a playlist row only ever calls
    // reorderPlaylistTrack. Track which list the drag started in so a drag
    // over the other section's rows is a no-op instead of reordering the
    // wrong array.
    let dragSource = null; // { kind: 'queue' | 'playlist', index: number }
    container.querySelectorAll('.queue-track-item').forEach((item) => {
      const isPlaylistRow = item.dataset.playlistIndex !== undefined;
      const kind = isPlaylistRow ? 'playlist' : 'queue';
      const getIndex = () =>
        parseInt(isPlaylistRow ? item.dataset.playlistIndex : item.dataset.queueIndex, 10);

      item.addEventListener('dragstart', (e) => {
        dragSource = { kind, index: getIndex() };
        e.dataTransfer.effectAllowed = 'move';
      });
      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });
      item.addEventListener('drop', (e) => {
        e.preventDefault();
        if (!dragSource || dragSource.kind !== kind) {
          dragSource = null;
          return;
        }
        const targetIndex = getIndex();
        if (dragSource.index !== targetIndex) {
          if (kind === 'queue') {
            this.app.coreAudio.reorderQueue(dragSource.index, targetIndex);
          } else {
            this.app.coreAudio.reorderPlaylistTrack(dragSource.index, targetIndex);
          }
        }
        dragSource = null;
      });
      item.addEventListener('dblclick', () => {
        const path = item.dataset.path;
        if (path) this.app.coreAudio.playSong(path);
      });
    });
  }

  // Makes the queue pane a live drop target, reusing the exact same
  // application/x-que-track-paths payload as playlist cards and the folder
  // view's drag source — no new drag-and-drop implementation. Looks up each
  // dropped path's real metadata before queueing so the pane shows title/artist,
  // not just a bare filename. Also wires the header's Clear button — it has
  // no listener until this runs.
  setupQueuePaneDropTarget() {
    const pane = document.getElementById('queuePane');
    if (!pane) return;

    const clearBtn = document.getElementById('clearQueuePaneBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.app.coreAudio.clearQueue());
    }

    pane.addEventListener('dragover', (e) => {
      if (!e.dataTransfer.types.includes('application/x-que-track-paths')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      pane.classList.add('drag-over');
    });

    pane.addEventListener('dragleave', (e) => {
      if (e.target === pane) pane.classList.remove('drag-over');
    });

    pane.addEventListener('drop', async (e) => {
      pane.classList.remove('drag-over');
      const raw = e.dataTransfer.getData('application/x-que-track-paths');
      if (!raw) return;
      e.preventDefault();

      let trackPaths;
      try {
        trackPaths = JSON.parse(raw);
      } catch {
        return;
      }
      if (!Array.isArray(trackPaths) || trackPaths.length === 0) return;

      // Figure out if the drop was in the queue section or the playlist section.
      // Check the Y coordinate: if it's below the "Current Playlist" label, or if there
      // are any playlist items visible, add to playlist. Otherwise add to queue.
      const contentEl = document.getElementById('queuePaneContent');
      const playlistLabel = contentEl?.querySelector('.queue-track-section-label:last-of-type');
      const isPlaylistDrop =
        playlistLabel && e.clientY >= playlistLabel.getBoundingClientRect().bottom;

      if (isPlaylistDrop) {
        // Drop was in the Current Playlist section — add to playlist, not queue
        for (const trackPath of trackPaths) {
          let trackData = { path: trackPath };
          try {
            const dbTrack = await window.queMusicAPI.database.getTrackByPath(trackPath);
            if (dbTrack) trackData = dbTrack;
          } catch (err) {
            // Fall back to the bare path
          }
          // Add to the end of the playlist
          if (this.app.coreAudio.playlist && !this.app.coreAudio.playlist.find((t) => t.path === trackPath)) {
            this.app.coreAudio.playlist.push(trackData);
          }
        }
        this.app.coreAudio.notifyQueueChanged();
      } else {
        // Drop was in the Playing Next (queue) section — add to queue as before
        let insertIndex = this.getQueueDropIndex(e.clientY);
        for (const trackPath of trackPaths) {
          let trackData = { path: trackPath };
          try {
            const dbTrack = await window.queMusicAPI.database.getTrackByPath(trackPath);
            if (dbTrack) trackData = dbTrack;
          } catch (err) {
            // Fall back to the bare path — addToQueue() handles missing metadata fine
          }
          this.app.coreAudio.addToQueue(trackData, insertIndex);
          insertIndex++; // keep multi-track drops in dropped order, right after each other
        }
      }
    });
  }

  // Figures out which queue slot a drop landed on/between, by comparing the
  // pointer's Y position to each rendered queue row's vertical midpoint.
  // Returns the index to insert at (queue.length if dropped below the last row
  // or the pane is empty) — matches how data-queue-index numbers the rows.
  getQueueDropIndex(clientY) {
    const container = document.getElementById('queuePaneContent');
    if (!container) return this.app.coreAudio.getQueue().length;

    const items = [...container.querySelectorAll('.queue-track-item')];
    for (const item of items) {
      const rect = item.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      if (clientY < midpoint) {
        return parseInt(item.dataset.queueIndex, 10);
      }
    }
    return items.length;
  }

  async switchToNowPlaying() {
    this.app.logger.debug(' Loading Now Playing view...');

    const currentTrackPath = this.app.coreAudio?.currentTrack || this.app.currentTrack?.path;
    const playlist = this.app.playlist || [];
    const currentIndex = this.app.currentTrackIndex;

    // Find current track data
    let currentTrackData = null;
    if (currentIndex >= 0 && currentIndex < playlist.length) {
      currentTrackData = playlist[currentIndex];
    } else if (currentTrackPath) {
      currentTrackData = playlist.find((t) => t.path === currentTrackPath);
    }

    // If we have basic track data but it's missing metadata, try to get full track info from database
    if (
      currentTrackData &&
      currentTrackPath &&
      (!currentTrackData.artist || !currentTrackData.duration)
    ) {
      try {
        const fullTrackData = await window.queMusicAPI.database.getTrackByPath(currentTrackPath);
        if (fullTrackData) {
          currentTrackData = { ...currentTrackData, ...fullTrackData };
        }
      } catch (error) {
        this.app.logger.warn('⚠️ Could not fetch full track data:', error);
      }
    }

    // The line above awaits a DB call. If the user has already navigated to a
    // different view while it was in flight, writing Now Playing's content into
    // leftPane/rightPane now would stomp whatever that other view just rendered
    // (the same stale-async-overwrite race caught in library-manager.js's
    // createEmptyFolderBrowser). Bail out silently — the view the user is
    // actually looking at already owns those panes.
    if (this.app.currentView !== 'now-playing') {
      this.app.logger.debug(' Aborting stale Now Playing render — view changed during load');
      return;
    }

    // If we have a current track but small playlist, try to get more context
    if (currentTrackPath && playlist.length < 10) {
      const context = this.app.playbackContext;
      if (context && context.playlist && context.playlist.length > playlist.length) {
        console.log(`🔄 Using stored playlist with ${context.playlist.length} tracks`);
        playlist.splice(0, playlist.length, ...context.playlist);
      }
    }

    // Check if we have any music to display
    if (!currentTrackPath && playlist.length === 0) {
      this.app.showNotification('No music loaded', 'info');
      return;
    }

    const context = this.app.playbackContext;

    // Update header
    this.updateContentHeader('now-playing');
    const title = document.getElementById('currentViewTitle');
    const subtitle = document.getElementById('currentViewSubtitle');
    if (title) title.textContent = 'Now Playing';
    if (subtitle) subtitle.textContent = `Playlist • ${playlist.length} tracks • Up Next: ${this.app.coreAudio?.queue?.length || 0}`;

    // LEFT PANE
    const leftPaneTitle = document.getElementById('leftPaneTitle');
    const leftPaneContent = document.getElementById('leftPaneContent');
    const leftPaneActions = document.getElementById('leftPaneActions');

    if (leftPaneTitle) leftPaneTitle.textContent = 'Now Playing';

    // Smart back button
    if (leftPaneActions) {
      let backButton = '';

      if (context && context.view) {
        const backLabel =
          context.view === 'playlists' && context.playlistData
            ? `← Back to "${context.playlistData.name}"`
            : `← Back to ${context.view.charAt(0).toUpperCase() + context.view.slice(1)}`;
        backButton = `
        <button class="btn-secondary btn-sm" onclick="window.app.uiController.returnToPreviousContext()">
            ${backLabel}
        </button>
      `;
      } else {
        backButton = `
        <button class="btn-secondary btn-sm" onclick="window.app.uiController.switchView('playlists')">
            ← Back to Playlists
        </button>
        <button class="btn-secondary btn-sm" onclick="window.app.uiController.switchView('library')" style="margin-left: 10px;">
            ← Back to Library
        </button>
      `;
      }

      leftPaneActions.innerHTML = backButton;
    }

    // Current track information
    if (leftPaneContent) {
      // Better duration handling - prefer track metadata over audio player
      let durationText = 'Unknown';
      if (currentTrackData?.duration && currentTrackData.duration > 0) {
        durationText = this.app.formatTime(currentTrackData.duration);
      } else {
        const currentDuration =
          this.app.coreAudio?.duration || this.app.coreAudio?.audioPlayer?.duration || 0;
        if (currentDuration > 0) {
          durationText = this.app.formatTime(currentDuration);
        }
      }

      leftPaneContent.innerHTML = `
      <div class="current-track-display">
          <h4>Current Track:</h4>
          <div class="track-info">
              <div class="track-title" style="font-weight: bold; font-size: 1.1em; margin-bottom: 8px;">
                ${currentTrackData?.title || currentTrackData?.name || 'Unknown Track'}
              </div>
              <div class="track-artist" style="margin-bottom: 4px;">
                <strong>Artist:</strong> ${currentTrackData?.artist || 'Unknown Artist'}
              </div>
              <div class="track-album" style="margin-bottom: 4px;">
                <strong>Album:</strong> ${currentTrackData?.album || 'Unknown Album'}
              </div>
              <div class="track-duration" style="margin-bottom: 4px;">
                <strong>Duration:</strong> ${durationText}
              </div>
              ${
                currentTrackData?.year
                  ? `
                <div class="track-year" style="margin-bottom: 4px;">
                  <strong>Year:</strong> ${currentTrackData.year}
                </div>
              `
                  : ''
              }
              ${
                currentTrackData?.genre
                  ? `
                <div class="track-genre" style="margin-bottom: 4px;">
                  <strong>Genre:</strong> ${currentTrackData.genre}
                </div>
              `
                  : ''
              }
          </div>
          <div style="margin-top: 15px; font-size: 0.9em; color: #666; padding-top: 10px; border-top: 1px solid #333;">
              Track ${currentIndex + 1} of ${playlist.length}
          </div>
      </div>
    `;
    }

    // RIGHT PANE - the loaded playlist/folder context. The real "up next" queue
    // lives in the persistent queue pane (4th column, always visible) — not
    // duplicated here. See docs/application/roadmap.md, priority #1.
    const rightPaneTitle = document.getElementById('rightPaneTitle');
    const rightPaneContent = document.getElementById('rightPaneContent');

    if (rightPaneTitle) rightPaneTitle.textContent = `Playlist (${playlist.length} tracks)`;

    if (rightPaneContent) {
      if (playlist.length === 0) {
        rightPaneContent.innerHTML = '<div class="empty-pane"><p>No queue available</p></div>';
      } else {
        rightPaneContent.innerHTML = `
        <div class="song-list-header">
          <span>#</span>
          <span>Title</span>
          <span>Album</span>
          <span>Time</span>
        </div>
        <div class="song-list">
          ${playlist
            .map((track, index) => {
              const isCurrentTrack = index === currentIndex || track.path === currentTrackPath;

              // FIX: Better duration handling
              let durationDisplay = '--:--';
              if (track.duration && track.duration > 0) {
                durationDisplay = this.app.formatTime(track.duration);
              } else if (isCurrentTrack && this.app.coreAudio?.duration > 0) {
                durationDisplay = this.app.formatTime(this.app.coreAudio.duration);
              } else if (track.path) {
                // Try to get duration from database asynchronously and update later
                this.getTrackDurationAsync(track.path, index);
              }

              return `
                <div
                  class="song-card${isCurrentTrack ? ' current-track active playing' : ''}"
                  data-track-index="${index}"
                  data-track-id="${track.id || ''}"
                  data-path="${track.path}"
                  style="display: grid; grid-template-columns: 40px 1fr 200px 60px; align-items: center; gap: 10px;"
                >
                  <!-- Column 1: Number -->
                  <div class="song-number">${index + 1}</div>

                  <!-- Column 2: Title + Artist -->
                  <div style="display: flex; flex-direction: column;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <span class="song-title" style="font-weight: bold;">${track.title || track.name}</span>
                      ${isCurrentTrack ? `<span class="now-playing-indicator" style="font-weight: bold; color: green;">♪ PLAYING</span>` : ''}
                    </div>
                    <span class="song-artist" style="font-size: 0.9em;">
                      ${track.artist || 'Unknown Artist'}
                    </span>
                  </div>

                  <!-- Column 3: Album -->
                  <div class="song-album" style="font-size: 0.9em; color: #888;">
                    ${track.album || 'Unknown Album'}
                  </div>

                  <!-- Column 4: Duration -->
                  <div class="song-metadata" style="text-align: right; font-size: 0.9em;">
                    ${durationDisplay}
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>
      `;

        // Add click handlers
        rightPaneContent.querySelectorAll('.song-card').forEach((item, index) => {
          item.addEventListener('click', (e) => {
            const track = playlist[index];

            // Handle multi-selection with Ctrl/Cmd key
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault();
              item.classList.toggle('selected');
              console.log(`🎵 Multi-select toggled for "${track.name}"`);
              return;
            }

            // Handle range selection with Shift key
            if (e.shiftKey) {
              e.preventDefault();
              const allCards = Array.from(rightPaneContent.querySelectorAll('.song-card'));
              const lastSelectedIndex = allCards.findIndex(card => card.classList.contains('selected'));

              if (lastSelectedIndex !== -1) {
                const start = Math.min(lastSelectedIndex, index);
                const end = Math.max(lastSelectedIndex, index);

                // Clear previous selection
                allCards.forEach(card => card.classList.remove('selected'));

                // Select range
                for (let i = start; i <= end; i++) {
                  allCards[i].classList.add('selected');
                }
                console.log(`🎵 Range selection: ${end - start + 1} tracks`);
                return;
              }
            }

            // Normal click - clear selection and play track
            rightPaneContent.querySelectorAll('.song-card').forEach(card => card.classList.remove('selected'));
            console.log(`🎵 Playing track ${index + 1}: "${track.name}"`);

            if (track.path) {
              this.app.currentTrackIndex = index;
              this.app.coreAudio.playSong(track.path).then(() => {
                setTimeout(() => {
                  this.switchToNowPlaying();
                }, 300);
              });
            }
          });
        });

        // Auto-scroll to current track
        setTimeout(() => {
          const playingTrack = rightPaneContent.querySelector('.song-card.current-track');
          if (playingTrack) {
            playingTrack.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 100);
      }
    }
  }

  async getTrackDurationAsync(trackPath, trackIndex) {
    try {
      const fullTrackData = await window.queMusicAPI.database.getTrackByPath(trackPath);
      if (fullTrackData && fullTrackData.duration) {
        // Update the duration display for this specific track
        const trackElement = document.querySelector(
          `[data-track-index="${trackIndex}"] .song-metadata`
        );
        if (trackElement && this.app.currentView === 'now-playing') {
          trackElement.textContent = this.app.formatTime(fullTrackData.duration);
        }
      }
    } catch (error) {
      console.warn(`⚠️ Could not fetch duration for track at index ${trackIndex}:`, error);
    }
  }

  returnToPreviousContext() {
    const context = this.app.playbackContext;

    if (!context) {
      this.switchView('library');
      return;
    }

    console.log(`📍 Returning to: ${context.view}`);

    if (context.view === 'playlists' && context.playlistData) {
      this.switchView('playlists');
      setTimeout(() => {
        if (this.app.playlistRenderer && context.playlistData.id) {
          this.app.playlistRenderer.loadPlaylistTracks(context.playlistData.id);
        }
      }, 500);
    } else if (context.view === 'library' && context.selectedFolder) {
      this.switchView('library');
      setTimeout(() => {
        if (this.app.libraryManager && context.selectedFolder) {
          this.app.libraryManager.loadSongsFromFolderForRightPane(context.selectedFolder);
        }
      }, 500);
    } else {
      this.switchView(context.view || 'library');
    }
  }

  // ========================================
  // ALBUM ART METHODS
  // ========================================

  /**
   * Load and display album art for a track
   */
  async loadAlbumArt(track) {
    if (!track) {
      this.app.logger.warn('⚠️ No track provided to loadAlbumArt');
      this.showAlbumArtPlaceholder();
      return;
    }

    console.log(`🎨 Loading album art for: ${track.title} by ${track.artist}`);

    try {
      // Show loading state
      this.showAlbumArtLoading();

      // Request album art from backend (returns data URL)
      const artDataUrl = await window.queMusicAPI.albumArt.getForTrack(
        track.path,
        track.album || 'Unknown Album',
        track.artist || 'Unknown Artist'
      );

      if (artDataUrl && artDataUrl.length > 50) {
        const isValid = await this.validateDataUrl(artDataUrl);
        if (isValid) {
          await this.updateAlbumArtDisplay(artDataUrl);
        } else {
          console.error(`❌ Data URL validation failed`);
          this.showAlbumArtPlaceholder();
        }
      } else {
        console.log(`🎨 No album art found for: ${track.title}`);
        this.showAlbumArtPlaceholder();
      }
    } catch (error) {
      this.app.logger.error('❌ Error loading album art:', error);
      this.showAlbumArtPlaceholder();
    }
  }

  /**
   * Update the album art display in the UI
   */
  async updateAlbumArtDisplay(artDataUrl) {
    const container = document.querySelector('.album-art');
    if (!container) {
      this.app.logger.error('❌ Album art container not found');
      return;
    }

    let albumArtImg = container.querySelector('.album-image');
    let placeholder = container.querySelector('.album-placeholder');

    // Create image element if missing
    if (!albumArtImg) {
      albumArtImg = document.createElement('img');
      albumArtImg.className = 'album-image';
      albumArtImg.id = 'currentAlbumArt';
      container.appendChild(albumArtImg);
      console.log('📷 Created missing album image element');
    }

    // Create placeholder if missing
    if (!placeholder) {
      placeholder = document.createElement('div');
      placeholder.className = 'album-placeholder';
      placeholder.innerHTML = `
        <span>🎵</span>
        <small>No Image</small>
      `;
      container.appendChild(placeholder);
      console.log('📷 Created missing placeholder element');
    }

    // CRITICAL FIX: Clear the src first to prevent browser caching issues
    // This forces the browser to reload the image even if it looks similar
    albumArtImg.src = '';
    albumArtImg.removeAttribute('src');

    // Clear existing handlers
    albumArtImg.onload = null;
    albumArtImg.onerror = null;

    if (artDataUrl && artDataUrl.length > 50) {
      console.log(`🎨 Attempting to display album art: ${artDataUrl.substring(0, 50)}...`);

      // Validate data URL format
      if (!artDataUrl.startsWith('data:image/')) {
        this.app.logger.error('❌ Invalid data URL format - does not start with data:image/');
        this.showAlbumArtPlaceholder();
        return;
      }

      // Set up success handler
      albumArtImg.onload = () => {
        albumArtImg.style.display = 'block';
        albumArtImg.style.opacity = '1';
        albumArtImg.classList.add('album-art-loaded');
        placeholder.style.display = 'none';
        console.log('✅ Album art loaded successfully');
      };

      // Set up error handler with detailed logging
      albumArtImg.onerror = (event) => {
        this.app.logger.error('❌ Album art failed to load');
        this.app.logger.error('❌ Error event:', event);
        this.app.logger.error('❌ Data URL preview:', artDataUrl.substring(0, 100) + '...');

        // Show the base64 data for debugging
        const base64Part = artDataUrl.split(',')[1];
        if (base64Part) {
          this.app.logger.error('❌ Base64 data length:', base64Part.length);
          this.app.logger.error('❌ Base64 preview:', base64Part.substring(0, 100) + '...');
        }

        this.showAlbumArtPlaceholder();
      };

      // Set the source - this will trigger onload or onerror
      // Use a small delay to ensure the clear took effect
      setTimeout(() => {
        albumArtImg.src = artDataUrl;
      }, 10);
    } else {
      console.log('📷 No album art provided, showing placeholder');
      this.showAlbumArtPlaceholder();
    }
  }

  /**
   * Show album art loading state
   */
  showAlbumArtLoading() {
    const albumArtImg = document.getElementById('currentAlbumArt');
    const albumPlaceholder = document.querySelector('.album-placeholder');

    if (albumArtImg) {
      albumArtImg.style.display = 'none';
    }

    if (albumPlaceholder) {
      albumPlaceholder.style.display = 'flex';
      albumPlaceholder.innerHTML = `
        <div style="
          width: 20px; 
          height: 20px; 
          border: 2px solid var(--text-secondary); 
          border-top: 2px solid var(--primary); 
          border-radius: 50%; 
          animation: spin 1s linear infinite;
          margin-bottom: 5px;
        "></div>
        <small>Loading...</small>
      `;
    }
  }

  /**
   * Show placeholder when image fails or is missing
   */
  async showAlbumArtPlaceholder() {
    const albumArtImg = document.getElementById('currentAlbumArt');
    const albumPlaceholder = document.querySelector('.album-placeholder');

    if (albumArtImg) {
      try {
        // Request sample cover from main process (works in both dev and production)
        const sampleCoverDataUrl = await window.queMusicAPI.albumArt.getSampleCover();

        if (sampleCoverDataUrl) {
          // CRITICAL FIX: Clear src first to prevent caching issues
          albumArtImg.src = '';
          albumArtImg.removeAttribute('src');

          // Set default cover after a small delay
          setTimeout(() => {
            albumArtImg.src = sampleCoverDataUrl;
            albumArtImg.style.display = 'block';
            albumArtImg.style.opacity = '1';
            albumArtImg.classList.add('album-art-loaded');
            console.log('🎨 Default album cover displayed');
          }, 10);
        } else {
          // If sample cover not available, show the SVG placeholder
          albumArtImg.style.display = 'none';
          if (albumPlaceholder) {
            albumPlaceholder.style.display = 'flex';
          }
        }
      } catch (error) {
        this.app.logger.error('❌ Error loading sample cover:', error);
        // Fall back to showing the SVG placeholder
        albumArtImg.style.display = 'none';
        if (albumPlaceholder) {
          albumPlaceholder.style.display = 'flex';
        }
      }
    }

    if (albumPlaceholder && albumArtImg && albumArtImg.style.display === 'block') {
      albumPlaceholder.style.display = 'none';
    }
  }

  /**
   * VALIDATOR: Test data URL before using it
   */
  async validateDataUrl(dataUrl) {
    return new Promise((resolve) => {
      const testImg = new Image();

      const timeout = setTimeout(() => {
        this.app.logger.warn('⚠️ Data URL validation timeout');
        resolve(false);
      }, 3000); // 3 second timeout

      testImg.onload = () => {
        clearTimeout(timeout);
        resolve(true);
      };

      testImg.onerror = (error) => {
        clearTimeout(timeout);
        this.app.logger.error('❌ Data URL validation failed:', error);
        resolve(false);
      };

      testImg.src = dataUrl;
    });
  }

  /**
   * Clear album art cache
   */
  async clearAlbumArtCache() {
    try {
      // Clear frontend cache
      this.albumArtCache.clear();

      // Clear backend cache
      const result = await window.queMusicAPI.albumArt.clearCache();

      if (result.success) {
        this.app.showNotification('Album art cache cleared', 'success');
        console.log('🧹 Album art cache cleared');
      } else {
        this.app.showNotification('Failed to clear album art cache', 'error');
      }

      // Reset current display
      this.showAlbumArtPlaceholder();
    } catch (error) {
      this.app.logger.error('❌ Error clearing album art cache:', error);
      this.app.showNotification('Failed to clear album art cache', 'error');
    }
  }

  // ========================================
  // DOM STRUCTURE PROTECTION
  // ========================================

  ensureCorrectDOMStructure() {
    const mainContent = document.getElementById('mainContent');

    // Check if the required elements exist
    const welcomeScreen = document.getElementById('welcomeScreen');
    const dualPaneLayout = document.getElementById('dualPaneLayout');

    if (!welcomeScreen || !dualPaneLayout) {
      console.log('🔧 DOM structure missing, restoring...');

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

          <div class="pane-resizer" id="dualPaneResizer" role="separator" aria-orientation="vertical"></div>

          <!-- Right Pane - Song List/Playing Queue -->
          <div class="right-pane" id="rightPane">
            <div class="pane-header">
              <h3 id="rightPaneTitle">Select a folder or playlist</h3>
              <div class="pane-actions" id="rightPaneActions">
                <!-- Play controls, sort options, etc. -->
              </div>
            </div>
            <div class="pane-content list-view" id="rightPaneContent">
              <!-- Song list from selected folder/playlist -->
              <div class="empty-pane">
                <div class="empty-pane-icon">🎵</div>
                <p>Select a folder or playlist to view songs</p>
              </div>
            </div>
          </div>

          <div class="pane-resizer" id="queueResizer" role="separator" aria-orientation="vertical"></div>

          <!-- 4th Pane - Current Playlist (always visible, live drop target).
               This is NOT a saved playlist — that's "Create Playlist" on the left nav.
               Shows the manually-queued "play next" tracks on top, then the FULL
               loaded playlist below (nothing drops off as it plays — see
               CoreAudio.playlist / UIController.renderQueuePane). See
               docs/application/roadmap.md priority #1 and layout-redesign.md. -->
          <div class="queue-pane" id="queuePane">
            <div class="pane-header">
              <div class="queue-pane-title-row" style="display: flex; align-items: center;">
                <h3 id="queuePaneTitle">Current Playlist</h3>
                <button class="control-btn" id="shuffleBtn" title="Shuffle" style="margin-left: 10px;">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <polyline points="16,3 21,3 21,8"></polyline>
                    <line x1="4" y1="20" x2="21" y2="3"></line>
                    <polyline points="21,16 21,21 16,21"></polyline>
                    <line x1="15" y1="15" x2="21" y2="21"></line>
                    <line x1="4" y1="4" x2="9" y2="9"></line>
                  </svg>
                </button>
              </div>
              <div class="pane-actions" id="queuePaneActions">
                <button class="btn-secondary btn-sm" id="clearQueuePaneBtn" title="Clear queue">Clear</button>
              </div>
            </div>
            <div class="pane-content" id="queuePaneContent">
              <div class="empty-pane">
                <div class="empty-pane-icon">🎧</div>
                <p>Nothing queued. Drag a track here to add it to what's playing next.</p>
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
          if (this.app && this.app.libraryManager) {
            this.app.libraryManager.selectMusicFolder();
          }
        });
      }

      // The queue pane was just rebuilt from scratch, so its Clear button and
      // drag/drop handlers (normally wired once at app startup) need rebinding too.
      this.setupQueuePaneDropTarget();
      this.renderQueuePane();

      // shuffleBtn now lives inside the queue pane (moved here from the player
      // bar), so it's destroyed and recreated by this same rebuild — rewire its
      // click handler and restore its active state.
      const shuffleBtn = document.getElementById('shuffleBtn');
      if (shuffleBtn) {
        shuffleBtn.addEventListener('click', () => this.app.coreAudio.toggleShuffle());
        if (this.app.coreAudio?.shuffle) shuffleBtn.classList.add('active');
      }

      return true;
    }
    return false;
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Debug function to test modal display
  debugSettingsModal() {
    console.log('🔧 Debug: Settings Modal State');

    const modal = document.getElementById('settingsModal');
    const settingsBtn = document.getElementById('settingsBtn');

    if (modal) {
      const styles = getComputedStyle(modal);
      console.log('Modal computed styles:', {
        display: styles.display,
        visibility: styles.visibility,
        opacity: styles.opacity,
        zIndex: styles.zIndex,
        position: styles.position,
      });

      console.log('Modal classes:', modal.className);
      console.log('Modal inline styles:', modal.style.cssText);
    } else {
      this.app.logger.error('❌ Modal element not found');
    }

    if (settingsBtn) {
    } else {
      this.app.logger.error('❌ Settings button not found');
    }

    console.log('🚀 Testing direct modal show...');
    this.showSettingsModal();
  }

  // Emergency fallback to force show modal
  forceShowSettingsModal() {
    console.log('🚨 Emergency: Force showing settings modal');

    const modal = document.getElementById('settingsModal');
    if (modal) {
      modal.style.cssText = `
      display: flex !important;
      opacity: 1 !important;
      visibility: visible !important;
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      z-index: 10000 !important;
      background: rgba(0, 0, 0, 0.6) !important;
      align-items: center !important;
      justify-content: center !important;
    `;

      modal.classList.add('show');
      this.setupSettingsEventListeners();
    } else {
      this.app.logger.error('❌ Cannot force show - modal element not found');
    }
  }
}

// Export for use in main app
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UIController;
} else if (typeof window !== 'undefined') {
  window.UIController = UIController;
}
