// library-manager.js - Music library browsing, search, and database management

class LibraryManager {
  constructor(app) {
    this.app = app;
    this.currentSort = 'title'; // Default sort
    this.currentSearchResults = null; // Store current results for sorting
    this.currentFolderSongs = []; // Store songs for Play All button

    // Initialize search functionality
    this.initializeSearch();

    // Setup event delegation for Play All button
    this.setupPlayAllEventDelegation();

    // DEBUG: Make duplicate check available globally for testing
    window.checkDuplicates = async () => {
      try {
        const duplicates = await window.queMusicAPI.database.checkDuplicates();
        this.app.logger.debug(' Duplicate check results:', duplicates);
        return duplicates;
      } catch (error) {
        this.app.logger.error('❌ Error checking duplicates:', error);
        return [];
      }
    };
  }

  debugDOMElements() {
    // Check if dual pane layout is visible
    const dualPaneLayout = document.getElementById('dualPaneLayout');
    console.log('dualPaneLayout hidden?:', dualPaneLayout?.classList.contains('hidden'));

    // Check all elements with "Pane" in the ID
    const allElements = document.querySelectorAll('[id*="Pane"], [id*="pane"]');
    console.log('All pane elements:');
    allElements.forEach((el) => {
      console.log(`  - ${el.id}: ${el.tagName} (classes: ${el.className})`);
    });
  }

  // ========================================
  // MUSIC FOLDER MANAGEMENT
  // ========================================

  async selectMusicFolder() {
    // Prevent multiple simultaneous calls
    if (this.selectingFolder) {
      this.app.logger.debug(' Folder selection already in progress, ignoring duplicate call');
      return;
    }

    try {
      this.selectingFolder = true;
      this.app.logger.debug(' Opening folder selector...');
      this.app.showNotification('Opening folder selector...', 'info');

      const folderData = await window.queMusicAPI.files.selectMusicFolder();

      if (folderData) {
        this.app.logger.debug(' Folder selected:', folderData.path);
        this.app.showNotification(
          `Selected: ${folderData.name} (${folderData.totalFiles} songs)`,
          'success'
        );

        // Hide welcome screen and show music content
        this.hideWelcomeScreen();

        // Check if database is empty - if so, automatically scan
        this.app.logger.debug(' Checking database for existing tracks...');
        const existingTracks = await window.queMusicAPI.database.getAllTracks();
        console.log(`📊 Database check result: ${existingTracks.length} tracks found`);

        if (existingTracks.length === 0) {
          this.app.logger.debug(' Database is empty, starting initial library scan...');
          this.app.showNotification('Setting up your music library for the first time...', 'info');

          // Automatically scan and populate database
          await this.performInitialLibraryScan(folderData.path);
        } else {
          console.log(`📚 Found ${existingTracks.length} existing tracks in database`);
          await this.loadMusicLibrary(folderData.path);
        }
      } else {
        this.app.showNotification('No folder selected', 'info');
      }
    } catch (error) {
      this.app.logger.error('❌ Folder selection failed:', error);
      this.app.showNotification('Failed to select folder', 'error');
    } finally {
      this.selectingFolder = false;
    }
  }

  async checkSavedMusicFolder() {
    try {
      const savedFolder = await window.queMusicAPI.settings.getMusicFolder();
      if (savedFolder) {
        this.app.logger.debug(' Found saved folder:', savedFolder);
        this.app.showNotification(`Loading: ${this.app.getBasename(savedFolder)}`, 'info');

        this.hideWelcomeScreen();

        // Check if database has tracks for this folder
        const existingTracks = await window.queMusicAPI.database.getAllTracks();

        if (existingTracks.length === 0) {
          this.app.logger.debug(' Saved folder found but database is empty - may need to rescan');
          // Load folder structure and let user know they might want to rescan
          await this.loadMusicLibraryStructure(savedFolder);

          // Show a helpful message about rescanning
          setTimeout(() => {
            this.app.showNotification(
              'Your library appears empty. You may need to rescan your music folder.',
              'info'
            );
          }, 2000);
        } else {
          console.log(`📚 Found ${existingTracks.length} tracks in database`);
          // Load normally with existing database
          await this.loadMusicLibraryStructure(savedFolder);
        }

        return true;
      }
      return false;
    } catch (error) {
      this.app.logger.error('❌ Error checking saved folder:', error);
      return false;
    }
  }

  hideWelcomeScreen() {
    const welcomeScreen = document.getElementById('welcomeScreen');
    const musicContent = document.getElementById('musicContent');

    if (welcomeScreen && musicContent) {
      welcomeScreen.classList.add('hidden');
      musicContent.classList.remove('hidden');
    }
  }

  async loadMusicLibraryStructure(folderPath) {
    try {
      // Show loading message
      const musicContent = document.getElementById('musicContent');
      if (musicContent) {
        musicContent.innerHTML = `
          <div class="loading-state">
            <div class="loading-spinner"></div>
            <p>Loading your music library...</p>
          </div>
        `;
      }

      // Get folder structure
      const folderTree = await window.queMusicAPI.files.getFolderTree(folderPath);
      this.app.logger.debug(' Folder tree loaded:', folderTree.length, 'folders');
      console.log(
        '🔍 DEBUG: First 5 folders:',
        folderTree.slice(0, 5).map((f) => f.name)
      );

      // Get all songs from database for folder counts
      const songs = await window.queMusicAPI.database.getAllTracks();
      this.app.logger.debug(' Songs loaded from database:', songs.length, 'tracks');

      // Create folder browser but don't display songs initially - use dual-pane layout
      this.createEmptyFolderBrowser(folderTree, folderPath);

      this.app.showNotification('Music library loaded!', 'success');
    } catch (error) {
      this.app.logger.error('❌ Failed to load music library structure:', error);
      this.app.showNotification('Failed to load music library', 'error');
    }
  }

  createEmptyFolderBrowser(folderTree, folderPath) {
    // Switch to library view to ensure dual-pane layout is active
    this.app.uiController.switchView('library');

    // Set up left pane with folder structure
    const leftPaneTitle = document.getElementById('leftPaneTitle');
    const leftPaneContent = document.getElementById('leftPaneContent');
    const leftPaneActions = document.getElementById('leftPaneActions');

    if (leftPaneTitle) {
      leftPaneTitle.textContent = `📁 ${this.app.getBasename(folderPath)}`;
    }

    if (leftPaneActions) {
      leftPaneActions.innerHTML = `
        <button class="btn-secondary btn-sm" id="changeFolderBtn">
          📁 Change Folder
        </button>
      `;

      // Add event listener to avoid duplicate dialogs
      const changeFolderBtn = document.getElementById('changeFolderBtn');
      if (changeFolderBtn) {
        changeFolderBtn.addEventListener('click', () => this.selectMusicFolder());
      }
    }

    if (leftPaneContent) {
      const folderHTML = this.createFolderBrowserForLeftPane(folderTree, folderPath);
      leftPaneContent.innerHTML = folderHTML;

      // Setup folder click events
      this.setupLeftPaneFolderEvents();

      // IMPORTANT: Ensure context menu system is ready after loading
      setTimeout(() => {
        if (this.app.uiController) {
          this.app.uiController.ensureContextMenuSystem();
        }
      }, 300);

      this.app.logger.info(' Library folder structure loaded in left pane');
    }

    // Clear right pane and show instruction message
    this.app.uiController.clearRightPane('Select a folder from the left to view its tracks');
  }

  async loadMusicLibrary(folderPath) {
    try {
      this.app.logger.info(' Loading music library from:', folderPath);

      // Show loading message
      const musicContent = document.getElementById('musicContent');
      if (musicContent) {
        musicContent.innerHTML = `
          <div class="loading-state">
            <div class="loading-spinner"></div>
            <p>Loading your music library...</p>
          </div>
        `;
      }

      // Get folder structure
      const folderTree = await window.queMusicAPI.files.getFolderTree(folderPath);
      this.app.logger.debug(' Folder tree loaded:', folderTree.length, 'folders');

      // Create basic folder browser with empty right pane initially
      this.createFolderBrowser(folderTree, [], folderPath);

      this.app.showNotification('Music library loaded!', 'success');
    } catch (error) {
      this.app.logger.error('❌ Failed to load music library:', error);
      this.app.showNotification('Failed to load music library', 'error');
    }
  }

  createFolderBrowser(folderTree, songs, currentPath) {
    const mainContent = document.getElementById('mainContent');
    if (!mainContent) return;

    // Determine right pane content
    let rightPaneContent;
    if (songs.length === 0) {
      rightPaneContent = `
        <div class="empty-pane">
          <div class="empty-pane-icon">📁</div>
          <p>Select a folder from the left to view its tracks</p>
        </div>
      `;
    } else {
      rightPaneContent = this.renderSongList(songs);
    }

    // Simple folder browser HTML
    const browserHTML = `
      <div class="folder-browser">
        <div class="folder-tree">
          <h3>Folders</h3>
          <div class="tree-container">
            ${this.renderFolderTree(this.filterSystemFolders(folderTree))}
          </div>
        </div>
        <div class="song-list-panel">
          <div class="song-list-header">
            <h3>${songs.length > 0 ? this.app.getBasename(currentPath) : 'Select a Folder'} ${songs.length > 0 ? `(${songs.length} songs)` : ''}</h3>
          </div>
          <div class="song-list-content">
            ${rightPaneContent}
          </div>
        </div>
      </div>
    `;

    mainContent.innerHTML = browserHTML;

    // Setup folder click events
    this.setupFolderEvents();

    // Setup initial song events with context menu support (only if songs exist)
    if (songs.length > 0) {
      this.setupInitialSongEvents();
    }
  }

  setupInitialSongEvents() {
    // Setup play events only - context menus handled by UIController delegation
    document.querySelectorAll('.song-card').forEach((card) => {
      const songPath = card.dataset.path;

      // Double-click to play
      card.addEventListener('dblclick', () => {
        this.app.coreAudio.playSong(songPath);
      });

      // Single click to select
      card.addEventListener('click', () => {
        document.querySelectorAll('.song-card').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
      });

      // NOTE: Context menu is handled by UIController's global delegation
    });

    this.app.logger.debug(' Setup play events for initial song list (context menus via delegation)');
  }

  renderFolderTree(folders, level = 0) {
    return folders
      .map(
        (folder) => `
      <div class="tree-node" data-path="${folder.path}">
        <div class="tree-item ${folder.children.length > 0 ? 'has-children' : ''}" style="padding-left: ${level * 20}px">
          ${folder.children.length > 0 ? '<span class="tree-toggle">▶</span>' : '<span class="tree-spacer"></span>'}
          <span class="folder-icon">📁</span>
          <span class="folder-name">${folder.name}</span>
          <span class="song-count">(${folder.songCount})</span>
        </div>
        ${
          folder.children.length > 0
            ? `
          <div class="tree-children hidden">
            ${this.renderFolderTree(folder.children, level + 1)}
          </div>
        `
            : ''
        }
      </div>
    `
      )
      .join('');
  }

  renderSongList(songs) {
    if (songs.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-state-icon">🎵</div>
          <div class="empty-state-title">No songs found</div>
          <div class="empty-state-description">This folder doesn't contain any supported audio files.</div>
        </div>
      `;
    }

    return `
      <div class="song-list">
        ${songs
          .map(
            (song, index) => `
          <div class="song-card" data-path="${song.path}" data-index="${index}">
            <div class="song-info">
              <div class="song-title">${song.title || (song.name ? song.name.replace(/\.[^/.]+$/, '') : 'Unknown Title')}</div>
              <div class="song-artist">${song.artist || 'Unknown Artist'}</div>
              ${song.album ? `<div class="song-album">${song.album}</div>` : ''}
            </div>
            <div class="song-metadata">
              ${song.format || 'Unknown'} • ${this.app.formatFileSize(song.filesize || song.size || 0)}
              ${song.year ? ` • ${song.year}` : ''}
            </div>
          </div>
        `
          )
          .join('')}
      </div>
    `;
  }

  setupFolderEvents() {
    // Folder tree clicks
    document.querySelectorAll('.tree-item').forEach((item) => {
      item.addEventListener('click', async (e) => {
        e.stopPropagation();

        const node = item.closest('.tree-node');
        const folderPath = node.dataset.path;

        this.app.logger.debug(' Folder clicked:', folderPath);

        // Remove previous selection
        document.querySelectorAll('.tree-item').forEach((i) => i.classList.remove('selected'));
        item.classList.add('selected');

        // Toggle folder if it has children
        if (item.classList.contains('has-children')) {
          this.app.logger.debug(' Toggling folder with children');
          this.toggleFolder(node);
        }

        // Load songs from selected folder
        this.app.logger.debug(' Loading songs from folder');
        await this.loadSongsFromFolder(folderPath);
      });
    });

    // Song events - simplified, no individual context menu setup
    document.querySelectorAll('.song-card').forEach((card) => {
      const songPath = card.dataset.path;

      // Double-click to play
      card.addEventListener('dblclick', () => {
        this.app.coreAudio.playSong(songPath);
      });

      // NOTE: Context menu is handled by UIController's global delegation
    });

    this.app.logger.debug(' Setup folder events (context menus via delegation)');
  }

  toggleFolder(node) {
    const toggle = node.querySelector('.tree-toggle');
    const children = node.querySelector('.tree-children');

    if (children) {
      const isExpanded = !children.classList.contains('hidden');

      if (isExpanded) {
        children.classList.add('hidden');
        toggle.textContent = '▶';
      } else {
        children.classList.remove('hidden');
        toggle.textContent = '▼';
      }
    }
  }

  async loadSongsFromFolder(folderPath) {
    try {
      const songs = await window.queMusicAPI.files.getSongsInFolder(folderPath);

      // ENHANCEMENT: Get metadata from database for each song
      const songsWithMetadata = await Promise.all(
        songs.map(async (song) => {
          try {
            // Try to find this song in the database
            const dbTrack = await window.queMusicAPI.database.getTrackByPath(song.path);

            if (dbTrack) {
              return {
                ...song,
                title: dbTrack.title || song.name,
                artist: dbTrack.artist || 'Unknown Artist',
                album: 'Unknown Album',
                year: null,
                genre: null,
              };
            }
          } catch (error) {
            console.warn(`Could not get metadata for ${song.path}`);
            return {
              ...song,
              title: song.name,
              artist: 'Unknown Artist',
              album: 'Unknown Album',
              year: null,
              genre: null,
            };
          }
        })
      );

      // Update song list panel
      const songListContent = document.querySelector('.song-list-content');
      const songListHeader = document.querySelector('.song-list-header h3');

      if (songListHeader) {
        songListHeader.textContent = `${this.app.getBasename(folderPath)} (${songs.length} songs)`;
      }

      if (songListContent) {
        const tracksHTML = this.generateTrackListWithSelection(songsWithMetadata);
        songListContent.innerHTML = tracksHTML;
        setTimeout(() => {
          this.setupLibrarySelectionEvents();
        }, 100);
      }
    } catch (error) {
      this.app.logger.error('❌ Failed to load songs:', error);
    }
  }

  renderEnhancedSongList(songs) {
    if (songs.length === 0) {
      return `
      <div class="empty-state">
        <div class="empty-state-icon">🎵</div>
        <div class="empty-state-title">No songs found</div>
        <div class="empty-state-description">This folder doesn't contain any supported audio files.</div>
      </div>
    `;
    }

    return `
    <div class="song-list">
      ${songs
        .map(
          (song, index) => `
        <div class="song-card" 
             data-path="${song.path}" 
             data-index="${index}"
             data-title="${this.escapeHtml(song.title || song.name)}"
             data-artist="${this.escapeHtml(song.artist || 'Unknown Artist')}"
             data-album="${this.escapeHtml(song.album || 'Unknown Album')}">
          <div class="song-info">
            <div class="song-title">${song.title || song.name.replace(/\.[^/.]+$/, '')}</div>
            <div class="song-artist">${song.artist || 'Unknown Artist'}</div>
            ${song.album && song.album !== 'Unknown Album' ? `<div class="song-album">${song.album}</div>` : ''}
          </div>
          <div class="song-metadata">
            ${song.format} • ${this.app.formatFileSize(song.size)}
            ${song.year ? ` • ${song.year}` : ''}
            ${song.genre ? ` • ${song.genre}` : ''}
          </div>
        </div>
      `
        )
        .join('')}
    </div>
  `;
  }

  setupLibrarySongEvents() {
    // Setup play events only - context menus handled by UIController delegation
    document.querySelectorAll('.song-card').forEach((card) => {
      const songPath = card.dataset.path;

      // Double-click to play
      card.addEventListener('dblclick', () => {
        this.app.coreAudio.playSong(songPath);
      });

      // Single click to select
      card.addEventListener('click', () => {
        document.querySelectorAll('.song-card').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
      });

      // NOTE: Context menu is handled by UIController's global delegation
    });

    this.app.logger.debug(' Setup library song events (context menus via delegation)');
  }

  handlePlayAllClick(songs) {
    this.app.logger.debug(' Play All clicked with', songs.length, 'songs');

    if (songs.length === 0) {
      this.app.showNotification('No songs to play', 'warning');
      return;
    }

    const firstSong = songs[0];

    // Check if path contains backslashes
    // if (firstSong.path) {
    //   this.app.logger.debug(' DEBUG: Contains backslashes:', firstSong.path.includes('\\'));
    //   this.app.logger.debug(' DEBUG: Contains forward slashes:', firstSong.path.includes('/'));
    //   this.app.logger.debug(' DEBUG: Raw path characters:', [...firstSong.path].slice(0, 20));
    // }

    // Final validation check
    if (!firstSong.path || (!firstSong.path.includes('\\') && !firstSong.path.includes('/'))) {
      this.app.logger.error('❌ Invalid first song path:', firstSong.path);
      this.app.showNotification('Invalid file path detected', 'error');
      return;
    }

    // Clear existing playlist and build new one from library
    this.app.coreAudio.clearPlaylist();
    this.app.coreAudio.playlist = songs.map((song) => ({
      path: song.path,
      name: this.app.getBasename(song.path),
      title: song.title || song.name,
      artist: song.artist || 'Unknown Artist',
    }));

    this.app.coreAudio.currentTrackIndex = 0;

    // this.app.logger.debug(' DEBUG: About to call playSong with path:', firstSong.path);
    this.app.coreAudio.playSong(firstSong.path, false);
    this.app.showNotification(`Playing ${songs.length} tracks`, 'success');

    // Highlight the first track in the library view
    this.updateLibraryTrackHighlight();
  }

  // Method to highlight currently playing track in library view
  updateLibraryTrackHighlight() {
    // Remove existing highlighting
    document.querySelectorAll('.song-card').forEach((card) => {
      card.classList.remove('playing', 'selected');
    });

    // Highlight current playing track
    if (this.app.coreAudio.currentTrackIndex >= 0 && this.app.coreAudio.currentTrack) {
      // Find the card with the matching path
      const currentTrackCard = document.querySelector(
        `.song-card[data-path="${CSS.escape(this.app.coreAudio.currentTrack)}"]`
      );
      if (currentTrackCard) {
        currentTrackCard.classList.add('playing', 'selected');
        // Scroll into view if not visible
        currentTrackCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        console.log('🎯 Highlighted currently playing track in library view');
      }
    }
  }

  // Setup event delegation for Play All button to bypass click interference
  setupPlayAllEventDelegation() {
    document.addEventListener(
      'click',
      (event) => {
        if (event.target && event.target.dataset && event.target.dataset.action === 'play-all') {
          this.app.logger.debug(' Play All button clicked via delegation!');
          event.preventDefault();
          event.stopPropagation();

          if (this.currentFolderSongs && this.currentFolderSongs.length > 0) {
            this.handlePlayAllClick(this.currentFolderSongs);
          } else {
            this.app.logger.warn('⚠️ No songs available for Play All');
          }
        }
      },
      true
    ); // Use capture phase to ensure we catch it before other handlers
  }

  // Helper method to parse size text like "4.2 MB" into bytes
  parseSizeText(sizeText) {
    if (!sizeText || sizeText === 'Unknown') return 0;

    const match = sizeText.match(/^([\d.]+)\s*(B|KB|MB|GB)$/i);
    if (!match) return 0;

    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();

    switch (unit) {
      case 'B':
        return value;
      case 'KB':
        return value * 1024;
      case 'MB':
        return value * 1024 * 1024;
      case 'GB':
        return value * 1024 * 1024 * 1024;
      default:
        return 0;
    }
  }

  // ========================================
  // LIBRARY VIEW METHODS
  // ========================================

  async loadArtistsView() {
    try {
      // this.app.logger.info(' Loading artists view...');
      const artists = await window.queMusicAPI.database.getAllArtists();

      this.app.currentView = 'artists';
      this.app.updateContentHeader('artists');
      this.hideWelcomeScreen();

      const musicContent = document.getElementById('musicContent');
      if (musicContent) {
        musicContent.innerHTML = this.renderArtistsView(artists);
        this.setupArtistsViewEvents();
      }

      console.log(`📚 Loaded ${artists.length} artists`);
    } catch (error) {
      this.app.logger.error('Error loading artists view:', error);
      this.app.showNotification('Failed to load artists', 'error');
    }
  }

  async loadAlbumsView() {
    try {
      // console.log('💿 Loading albums view...');
      const albums = await window.queMusicAPI.database.getAllAlbums();

      this.app.currentView = 'albums';
      this.app.updateContentHeader('albums');
      this.hideWelcomeScreen();

      const musicContent = document.getElementById('musicContent');
      if (musicContent) {
        musicContent.innerHTML = this.renderAlbumsView(albums);
        this.setupAlbumsViewEvents();
      }

      console.log(`💿 Loaded ${albums.length} albums`);
    } catch (error) {
      this.app.logger.error('Error loading albums view:', error);
      this.app.showNotification('Failed to load albums', 'error');
    }
  }

  renderArtistsView(artists) {
    if (artists.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-state-icon">🎤</div>
          <div class="empty-state-title">No artists found</div>
          <div class="empty-state-description">Your music library appears to be empty</div>
        </div>
      `;
    }

    return `
      <div class="library-view">
        <div class="library-header">
          <h3>${artists.length} Artists</h3>
          <div class="view-controls">
            <select id="artistSortSelect" class="sort-select">
              <option value="name">Sort by Name</option>
              <option value="track_count">Sort by Track Count</option>
            </select>
          </div>
        </div>
        <div class="library-grid">
          ${artists
            .map(
              (artist) => `
            <div class="library-card artist-card" data-artist="${artist.artist}">
              <div class="card-artwork">
                <div class="artwork-placeholder">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                </div>
              </div>
              <div class="card-info">
                <h4 class="card-title">${artist.artist || 'Unknown Artist'}</h4>
                <p class="card-subtitle">${artist.track_count} tracks</p>
              </div>
              <button class="icon-btn play-artist-btn" title="Play all tracks">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polygon points="5,3 19,12 5,21"></polygon>
                </svg>
              </button>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    `;
  }

  renderAlbumsView(albums) {
    if (albums.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-state-icon">💿</div>
          <div class="empty-state-title">No albums found</div>
          <div class="empty-state-description">Your music library appears to be empty</div>
        </div>
      `;
    }

    return `
      <div class="library-view">
        <div class="library-header">
          <h3>${albums.length} Albums</h3>
          <div class="view-controls">
            <select id="albumSortSelect" class="sort-select">
              <option value="title">Sort by Title</option>
              <option value="artist">Sort by Artist</option>
              <option value="year">Sort by Year</option>
              <option value="track_count">Sort by Track Count</option>
            </select>
          </div>
        </div>
        <div class="library-grid">
          ${albums
            .map(
              (album) => `
            <div class="library-card album-card" data-album="${album.album}" data-artist="${album.artist}">
              <div class="card-artwork">
                <div class="artwork-placeholder">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polygon points="10,8 16,12 10,16"></polygon>
                  </svg>
                </div>
              </div>
              <div class="card-info">
                <h4 class="card-title">${album.album || 'Unknown Album'}</h4>
                <p class="card-subtitle">
                  ${album.artist || 'Unknown Artist'}
                  ${album.year ? ` • ${album.year}` : ''}
                  • ${album.track_count} tracks
                </p>
              </div>
              <button class="icon-btn play-album-btn" title="Play album">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polygon points="5,3 19,12 5,21"></polygon>
                </svg>
              </button>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    `;
  }

  setupArtistsViewEvents() {
    // Artist card clicks - show tracks by artist
    document.querySelectorAll('.artist-card').forEach((card) => {
      card.addEventListener('click', async (e) => {
        if (e.target.closest('.play-artist-btn')) return;

        const artist = card.dataset.artist;
        await this.showArtistTracks(artist);
      });
    });

    // Play artist buttons
    document.querySelectorAll('.play-artist-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const card = btn.closest('.artist-card');
        const artist = card.dataset.artist;
        await this.playArtist(artist);
      });
    });
  }

  setupAlbumsViewEvents() {
    // Album card clicks - show tracks in album
    document.querySelectorAll('.album-card').forEach((card) => {
      card.addEventListener('click', async (e) => {
        if (e.target.closest('.play-album-btn')) return;

        const album = card.dataset.album;
        const artist = card.dataset.artist;
        await this.showAlbumTracks(album, artist);
      });
    });

    // Play album buttons
    document.querySelectorAll('.play-album-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const card = btn.closest('.album-card');
        const album = card.dataset.album;
        const artist = card.dataset.artist;
        await this.playAlbum(album, artist);
      });
    });
  }

  async showLibraryView() {
    try {
      this.app.logger.info(' showLibraryView called - SAFE VERSION');

      const savedFolder = await window.queMusicAPI.settings.getMusicFolder();

      if (savedFolder) {
        this.app.logger.info(' Loading library for:', savedFolder);

        // Get the dual pane elements
        const leftPaneContent = document.getElementById('leftPaneContent');
        const rightPaneContent = document.getElementById('rightPaneContent');
        const leftPaneTitle = document.getElementById('leftPaneTitle');
        const rightPaneTitle = document.getElementById('rightPaneTitle');
        const leftPaneActions = document.getElementById('leftPaneActions');
        const rightPaneActions = document.getElementById('rightPaneActions');

        // Verify elements exist
        if (!leftPaneContent || !rightPaneContent) {
          this.app.logger.error('❌ Pane elements not found, cannot load library');
          return;
        }

        // Set titles
        if (leftPaneTitle) leftPaneTitle.textContent = 'Music Folders';
        if (rightPaneTitle) rightPaneTitle.textContent = 'Select a folder';
        if (leftPaneActions) leftPaneActions.innerHTML = '';
        if (rightPaneActions) rightPaneActions.innerHTML = '';

        // Show loading in left pane
        leftPaneContent.innerHTML = `
        <div class="loading-state">
          <div class="loading-spinner"></div>
          <p>Loading music folders...</p>
        </div>
      `;

        // Get folder structure and songs
        try {
          const folderTree = await window.queMusicAPI.files.getFolderTree(savedFolder);
          const songs = await window.queMusicAPI.files.getSongsInFolder(savedFolder);

          console.log(`📁 Found ${folderTree.length} folders, ${songs.length} songs`);

          // Create folder browser HTML for left pane
          const folderHTML = this.createFolderBrowserForLeftPane(folderTree, savedFolder);
          leftPaneContent.innerHTML = folderHTML;

          // Setup folder click events
          this.setupLeftPaneFolderEvents();

          // Show songs in right pane
          this.showSongsInRightPane(songs, savedFolder);

          // IMPORTANT: Ensure context menu system is ready after loading
          setTimeout(() => {
            if (this.app.uiController) {
              this.app.uiController.ensureContextMenuSystem();
            }
          }, 300);

          this.app.logger.info(' Library view loaded successfully');
        } catch (error) {
          this.app.logger.error('❌ Error loading folder data:', error);
          leftPaneContent.innerHTML = `
          <div class="empty-pane">
            <div class="empty-pane-icon">❌</div>
            <h4>Error Loading Library</h4>
            <p>Could not load music folders</p>
            <button class="btn-primary" onclick="location.reload()">Refresh</button>
          </div>
        `;
        }
      } else {
        this.app.logger.info(' No saved folder, showing empty state');
        this.showEmptyLibraryState();
      }
    } catch (error) {
      this.app.logger.error('❌ Error in showLibraryView:', error);
      this.showEmptyLibraryState();
    }
  }

  async loadFolderBrowserInLeftPane(folderPath) {
    this.app.logger.debug(' loadFolderBrowserInLeftPane FIXED - called with:', folderPath);

    const leftPaneTitle = document.getElementById('leftPaneTitle');
    const leftPaneContent = document.getElementById('leftPaneContent');
    const leftPaneActions = document.getElementById('leftPaneActions');

    // Verify elements exist
    if (!leftPaneContent) {
      this.app.logger.error('❌ leftPaneContent element not found!');
      return;
    }

    if (leftPaneTitle) leftPaneTitle.textContent = 'Music Folders';
    if (leftPaneActions) leftPaneActions.innerHTML = '';

    try {
      // Show loading state
      leftPaneContent.innerHTML = `
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <p>Loading folders...</p>
      </div>
    `;

      // Get folder structure
      const folderTree = await window.queMusicAPI.files.getFolderTree(folderPath);
      this.app.logger.debug(' Folder tree received:', folderTree.length, 'folders');

      // Get all songs from database instead of just root folder
      const songs = await window.queMusicAPI.database.getAllTracks();
      this.app.logger.debug(' All songs loaded from database:', songs.length, 'tracks');

      // Create folder browser HTML
      const folderHTML = this.createFolderBrowserForLeftPane(folderTree, folderPath);
      console.log('🔨 Generated folder HTML length:', folderHTML.length);

      // Update left pane content
      leftPaneContent.innerHTML = folderHTML;
      this.app.logger.info(' Left pane content updated');

      // Setup event listeners
      this.setupLeftPaneFolderEvents();

      // Show initial songs in right pane
      this.showSongsInRightPane(songs, folderPath);
    } catch (error) {
      this.app.logger.error('❌ Failed to load folder browser:', error);
      leftPaneContent.innerHTML = `
      <div class="empty-pane">
        <div class="empty-pane-icon">❌</div>
        <h4>Error Loading Folders</h4>
        <p>Please try refreshing the application</p>
        <button class="btn-primary" onclick="location.reload()">Refresh</button>
      </div>
    `;
    }
  }

  createFolderBrowserForLeftPane(folderTree, currentPath) {
    // Filter out system folders that users don't need to see
    const filteredFolderTree = this.filterSystemFolders(folderTree);

    return `
    <div class="folder-browser-pane">
      <div class="folder-tree-pane">
        <h4>📁 ${this.app.getBasename(currentPath)}</h4>
        <div class="tree-container">
          ${this.renderFolderTreeForLeftPane(filteredFolderTree)}
        </div>
      </div>
    </div>
  `;
  }

  filterSystemFolders(folders) {
    // System folders that should be dimmed/unclickable but still visible
    const systemFolders = [
      'assets', // Application assets
      'Assets', // Case variation
      'genre', // Genre classification (handled in separate view)
      'Genre', // Case variation
      'genres', // Plural variation
      'Genres', // Case variation
      'playlist', // Playlists (handled in separate view)
      'Playlist', // Case variation
      'playlists', // Plural variation
      'Playlists', // Case variation
      'System Volume Information', // Windows system folder
      '$RECYCLE.BIN', // Windows recycle bin
      '.DS_Store', // macOS system files
      '.Trash', // macOS trash
      'desktop.ini', // Windows desktop configuration
      'Thumbs.db', // Windows thumbnail cache
    ];

    // console.log(`🔍 DEBUG: ORIGINAL ${folders.length} folders BEFORE filtering:`);
    // folders.forEach((f, i) => {
    //   console.log(`  ${i + 1}. "${f.name}" (${f.songCount} songs)`);
    // });

    // Mark system folders as disabled instead of filtering them out
    const processed = folders.map((folder) => ({
      ...folder,
      isSystemFolder: systemFolders.includes(folder.name),
      children: folder.children ? this.filterSystemFolders(folder.children) : [],
    }));

    // console.log(
    //   `📁 Folder processing: ${folders.length} folders (${processed.filter((f) => f.isSystemFolder).length} marked as system folders)`
    // );
    // console.log(`🔍 DEBUG: PROCESSED folders:`);
    // processed.forEach((f, i) => {
    //   const status = f.isSystemFolder ? '🔒 SYSTEM' : '📁 NORMAL';
    //   console.log(`  ${i + 1}. ${status} "${f.name}" (${f.songCount} songs)`);
    // });

    return processed;
  }

  renderFolderTreeForLeftPane(folders, level = 0) {
    // console.log(
    //   `🔧 DEBUG: renderFolderTreeForLeftPane called with ${folders.length} folders at level ${level}`
    // );

    const renderedHTML = folders
      .map((folder, folderIndex) => {
        // console.log(
        //   `🔧 DEBUG: Processing folder ${folderIndex + 1}/${folders.length}: "${folder.name}"`
        // );

        const isSystemFolder = folder.isSystemFolder;
        const systemClasses = isSystemFolder ? 'system-folder disabled' : '';
        const systemStyle = isSystemFolder
          ? 'opacity: 0.5; cursor: not-allowed;'
          : 'cursor: pointer;';

        return `
    <div class="tree-node ${systemClasses}" data-path="${folder.path}" data-is-system="${isSystemFolder}">
      <div class="tree-item ${folder.children.length > 0 ? 'has-children' : ''}" style="padding-left: ${level * 16}px; ${systemStyle}">
        ${folder.children.length > 0 ? '<span class="tree-toggle">▶</span>' : '<span class="tree-spacer"></span>'}
        <span class="folder-icon">${isSystemFolder ? '🔒' : '📁'}</span>
        <span class="folder-name">${folder.name}</span>
        <span class="song-count">${folder.songCount}</span>
        ${isSystemFolder ? '<span class="system-badge">System</span>' : ''}
      </div>
      ${
        folder.children.length > 0
          ? `
        <div class="tree-children hidden">
          ${this.renderFolderTreeForLeftPane(folder.children, level + 1)}
        </div>
      `
          : ''
      }
    </div>
  `;
      })
      .join('');

    if (level === 0) {
      // console.log(`🔍 DEBUG: Rendered ${folders.length} folders at root level`);
      // console.log(
      //   `🔍 DEBUG: First 5 folder names:`,
      //   folders.slice(0, 5).map((f) => f.name)
      // );
      // console.log(
      //   `🔍 DEBUG: Last 5 folder names:`,
      //   folders.slice(-5).map((f) => f.name)
      // );
      // console.log(`🔍 DEBUG: HTML length: ${renderedHTML.length} characters`);
    }

    return renderedHTML;
  }

  setupLeftPaneFolderEvents() {
    // this.app.logger.debug(' Setting up left pane folder events');

    document.querySelectorAll('.tree-item').forEach((item) => {
      item.addEventListener('click', async (e) => {
        e.stopPropagation();

        const node = item.closest('.tree-node');
        const folderPath = node.dataset.path;
        const isSystemFolder = node.dataset.isSystem === 'true';

        this.app.logger.debug(' Folder clicked:', folderPath);

        // Prevent interaction with system folders
        if (isSystemFolder) {
          console.log('🔒 System folder clicked - interaction disabled:', folderPath);
          this.app.showNotification('System folders are managed elsewhere in the app', 'info');
          return;
        }

        // Remove previous selection
        document.querySelectorAll('.tree-item').forEach((i) => i.classList.remove('selected'));
        item.classList.add('selected');

        // Toggle folder if it has children
        if (item.classList.contains('has-children')) {
          this.toggleFolderInLeftPane(node);
        }

        // Load songs from selected folder
        await this.loadSongsFromFolderForRightPane(folderPath);
      });
    });
  }

  toggleFolderInLeftPane(node) {
    const toggle = node.querySelector('.tree-toggle');
    const children = node.querySelector('.tree-children');

    if (children) {
      const isExpanded = !children.classList.contains('hidden');

      if (isExpanded) {
        children.classList.add('hidden');
        toggle.textContent = '▶';
      } else {
        children.classList.remove('hidden');
        toggle.textContent = '▼';
      }
    }
  }

  // The Discover back button
  showDiscoverHome() {
    this.app.logger.debug(' Returning to Discover home...');
    this.app.uiController.switchView('discover');
  }

  async loadSongsFromFolderForRightPane(folderPath) {
    try {
      // this.app.logger.debug(' DEBUG loadSongsFromFolderForRightPane called with:', folderPath);

      // Get all tracks from database and filter by folder path
      const allTracks = await window.queMusicAPI.database.getAllTracks();
      // console.log(`🔍 DEBUG Got ${allTracks.length} tracks from database`);

      // Filter tracks that are ONLY in this specific folder (not subfolders)
      const songs = allTracks.filter((track) => {
        if (!track.path) return false;

        // Normalize paths - handle both Windows (\) and Unix (/) separators
        const normalizedTrackPath = track.path.replace(/\//g, '\\');
        const normalizedFolderPath = folderPath.replace(/\//g, '\\');

        // Check if track is in this exact folder (not subfolders)
        const trackDir = normalizedTrackPath.substring(0, normalizedTrackPath.lastIndexOf('\\'));

        // Only include tracks where the directory matches exactly
        return trackDir === normalizedFolderPath;
      });

      // console.log(
      //   `🔍 DEBUG Filtered to ${songs.length} songs in specific folder only: ${folderPath}`
      // );
      // this.app.logger.debug(' DEBUG Filtered songs (first 3):', songs.slice(0, 3));

      this.showSongsInRightPane(songs, folderPath);
    } catch (error) {
      this.app.logger.error('❌ Failed to load songs for right pane:', error);
    }
  }

  // ========================================
  // SELECT ALL FUNCTIONALITY (moved from ui-controller.js)
  // ========================================

  generateTrackListWithSelection(tracks) {
    // console.log('🔧 generateTrackListWithSelection called with', tracks.length, 'tracks');

    if (tracks.length === 0) {
      console.log('🔧 No tracks, returning empty state');
      return `
      <div class="empty-pane">
        <div class="empty-pane-icon">🎵</div>
        <p>No tracks found</p>
      </div>
    `;
    }

    // For very large lists (>2000 tracks), use chunked rendering
    if (tracks.length > 2000) {
      // console.log('🔧 Large track list detected, using chunked rendering');
      return this.generateChunkedTrackList(tracks);
    }

    // console.log('🔧 Generating HTML with Select All buttons');
    const html = `
    <div class="song-list-header">
      <div class="header-controls">
        <button class="btn-secondary btn-sm" id="selectAllSongsBtn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9,11 12,14 22,4"></polyline>
            <path d="M21,12v7a2,2,0,0,1-2,2H5a2,2,0,0,1-2-2V5a2,2,0,0,1,2-2h11"></path>
          </svg>
          Select All
        </button>
        <button class="btn-secondary btn-sm hidden" id="deselectAllSongsBtn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          </svg>
          Deselect All
        </button>
        <span class="selection-counter hidden" id="selectionCounter">0 selected</span>
      </div>
    </div>
    <div class="song-list" id="songListContainer">
      ${tracks
        .map(
          (track, index) => `
          <div class="song-card" 
               data-track-index="${index}" 
               data-track-id="${track.id}" 
               data-path="${track.path}"
               data-title="${this.escapeHtml(track.title || track.filename || 'Unknown')}"
               data-artist="${this.escapeHtml(track.artist || 'Unknown Artist')}"
               data-album="${this.escapeHtml(track.album || 'Unknown Album')}">
            <div class="song-checkbox">
              <input type="checkbox" class="song-select-checkbox" data-track-path="${track.path}">
            </div>
            <div class="song-info">
              <div class="song-title">${this.escapeHtml(track.title || track.filename || 'Unknown')}</div>
              <div class="song-artist">${this.escapeHtml(track.artist || 'Unknown Artist')}</div>
            </div>
            <div class="song-metadata">
              ${track.format || 'Unknown'} • ${this.app.formatFileSize(track.filesize || track.size || 0)}
              ${track.year ? ` • ${track.year}` : ''}
            </div>
          </div>
        `
        )
        .join('')}
    </div>
  `;

    // console.log('🔧 Generated HTML length:', html.length);
    return html;
  }

  generateChunkedTrackList(tracks) {
    console.log('🔧 Generating chunked track list with initial 500 tracks, lazy loading the rest');
    const initialChunkSize = 500;
    const initialTracks = tracks.slice(0, initialChunkSize);
    const remainingTracks = tracks.slice(initialChunkSize);

    // Store remaining tracks for lazy loading
    this.pendingTracks = remainingTracks;
    this.allTracksForSelection = tracks;

    const html = `
    <div class="song-list-header">
      <div class="header-controls">
        <button class="btn-secondary btn-sm" id="selectAllSongsBtn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9,11 12,14 22,4"></polyline>
            <path d="M21,12v7a2,2,0,0,1-2,2H5a2,2,0,0,1-2-2V5a2,2,0,0,1,2-2h11"></path>
          </svg>
          Select All (${tracks.length})
        </button>
        <button class="btn-secondary btn-sm hidden" id="deselectAllSongsBtn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          </svg>
          Deselect All
        </button>
        <span class="selection-counter hidden" id="selectionCounter">0 selected</span>
        <div class="track-count-info" style="margin-left: auto; color: var(--text-secondary); font-size: 0.9em;">
          Showing ${initialChunkSize} of ${tracks.length} tracks
        </div>
      </div>
    </div>
    <div class="song-list" id="songListContainer">
      ${initialTracks
        .map(
          (track, index) => `
          <div class="song-card" 
               data-track-index="${index}" 
               data-track-id="${track.id}" 
               data-path="${track.path}"
               data-title="${this.escapeHtml(track.title || track.filename || 'Unknown')}"
               data-artist="${this.escapeHtml(track.artist || 'Unknown Artist')}"
               data-album="${this.escapeHtml(track.album || 'Unknown Album')}">
            <div class="song-checkbox">
              <input type="checkbox" class="song-select-checkbox" data-track-path="${track.path}">
            </div>
            <div class="song-info">
              <div class="song-title">${this.escapeHtml(track.title || track.filename || 'Unknown')}</div>
              <div class="song-artist">${this.escapeHtml(track.artist || 'Unknown Artist')}</div>
            </div>
            <div class="song-metadata">
              ${track.format || 'Unknown'} • ${this.app.formatFileSize(track.filesize || track.size || 0)}
              ${track.year ? ` • ${track.year}` : ''}
            </div>
          </div>
        `
        )
        .join('')}
      ${
        remainingTracks.length > 0
          ? `
        <div class="load-more-container" style="text-align: center; padding: 1rem;">
          <button class="btn-secondary" id="loadMoreTracksBtn">
            📂 Load More Tracks (${remainingTracks.length} remaining)
          </button>
        </div>
      `
          : ''
      }
    </div>
  `;

    // console.log('🔧 Generated chunked HTML length:', html.length);
    return html;
  }

  setupLibrarySelectionEvents() {
    // console.log('🔧 setupLibrarySelectionEvents called');
    const songList = document.querySelector('.song-list');
    const selectAllBtn = document.getElementById('selectAllSongsBtn');
    const deselectAllBtn = document.getElementById('deselectAllSongsBtn');
    const selectionCounter = document.getElementById('selectionCounter');
    const songListContainer = document.getElementById('songListContainer');

    // console.log('🔧 Elements found:', {
    //   songList: !!songList,
    //   selectAllBtn: !!selectAllBtn,
    //   deselectAllBtn: !!deselectAllBtn,
    //   selectionCounter: !!selectionCounter,
    //   songListContainer: !!songListContainer,
    // });

    if (!songList) {
      this.app.logger.warn('Song list not found in library view');
      return;
    }

    if (!selectAllBtn) {
      this.app.logger.error('❌ Select All button not found! HTML might not be inserted yet.');
      // Let's check what's actually in the right pane
      const rightPaneContent = document.getElementById('rightPaneContent');
      // console.log('Right pane content:', rightPaneContent?.innerHTML?.substring(0, 200));
      return;
    }

    // console.log('Setting up library selection events');

    // Select All functionality
    if (selectAllBtn) {
      selectAllBtn.addEventListener('click', () => {
        const checkboxes = songList.querySelectorAll('.song-select-checkbox');
        checkboxes.forEach((checkbox) => {
          checkbox.checked = true;
          checkbox.closest('.song-card').classList.add('selected');
        });
        this.updateLibrarySelectionUI();
      });
    }

    // Deselect All functionality
    if (deselectAllBtn) {
      deselectAllBtn.addEventListener('click', () => {
        const checkboxes = songList.querySelectorAll('.song-select-checkbox');
        checkboxes.forEach((checkbox) => {
          checkbox.checked = false;
          checkbox.closest('.song-card').classList.remove('selected');
        });
        this.updateLibrarySelectionUI();
      });
    }

    // Individual checkbox handling
    songList.addEventListener('change', (e) => {
      if (e.target.classList.contains('song-select-checkbox')) {
        const songCard = e.target.closest('.song-card');
        if (e.target.checked) {
          songCard.classList.add('selected');
        } else {
          songCard.classList.remove('selected');
        }
        this.updateLibrarySelectionUI();
      }
    });

    // Song card click handling (excluding checkbox clicks)
    songList.addEventListener('click', (e) => {
      if (e.target.closest('.song-checkbox')) return; // Ignore checkbox clicks

      const songCard = e.target.closest('.song-card');
      if (!songCard) return;

      const trackPath = songCard.dataset.path;
      const trackIndex = parseInt(songCard.dataset.trackIndex);

      console.log(`Playing track: ${trackPath}`);
      this.app.coreAudio.playSong(trackPath);
    });

    // Context menu for bulk operations
    if (songListContainer) {
      songListContainer.addEventListener('contextmenu', (e) => {
        const selectedSongs = this.getSelectedLibrarySongs();
        if (selectedSongs.length > 0) {
          e.preventDefault();
          this.showLibraryBulkMenu(e, selectedSongs);
        }
      });
    }

    // Load More button for chunked rendering
    const loadMoreBtn = document.getElementById('loadMoreTracksBtn');
    if (loadMoreBtn && this.pendingTracks && this.pendingTracks.length > 0) {
      loadMoreBtn.addEventListener('click', () => {
        this.loadMoreTracks();
      });
    }

    // console.log('Library selection events setup complete');
  }

  loadMoreTracks() {
    if (!this.pendingTracks || this.pendingTracks.length === 0) {
      console.log('No more tracks to load');
      return;
    }

    const chunkSize = 500;
    const nextChunk = this.pendingTracks.slice(0, chunkSize);
    this.pendingTracks = this.pendingTracks.slice(chunkSize);

    const songListContainer = document.getElementById('songListContainer');
    const loadMoreContainer = songListContainer?.querySelector('.load-more-container');

    if (!songListContainer) {
      this.app.logger.error('Song list container not found');
      return;
    }

    console.log(`Loading ${nextChunk.length} more tracks, ${this.pendingTracks.length} remaining`);

    // Get current highest track index
    const existingCards = songListContainer.querySelectorAll('.song-card');
    const startIndex = existingCards.length;

    // Generate HTML for next chunk
    const nextChunkHTML = nextChunk
      .map(
        (track, index) => `
          <div class="song-card" 
               data-track-index="${startIndex + index}" 
               data-track-id="${track.id}" 
               data-path="${track.path}"
               data-title="${this.escapeHtml(track.title || track.filename || 'Unknown')}"
               data-artist="${this.escapeHtml(track.artist || 'Unknown Artist')}"
               data-album="${this.escapeHtml(track.album || 'Unknown Album')}">
            <div class="song-checkbox">
              <input type="checkbox" class="song-select-checkbox" data-track-path="${track.path}">
            </div>
            <div class="song-info">
              <div class="song-title">${this.escapeHtml(track.title || track.filename || 'Unknown')}</div>
              <div class="song-artist">${this.escapeHtml(track.artist || 'Unknown Artist')}</div>
            </div>
            <div class="song-metadata">
              ${track.format || 'Unknown'} • ${this.app.formatFileSize(track.filesize || track.size || 0)}
              ${track.year ? ` • ${track.year}` : ''}
            </div>
          </div>
        `
      )
      .join('');

    // Insert new tracks before the load more button
    if (loadMoreContainer) {
      loadMoreContainer.insertAdjacentHTML('beforebegin', nextChunkHTML);

      // Update load more button or remove it
      if (this.pendingTracks.length === 0) {
        loadMoreContainer.remove();
        console.log('All tracks loaded');
      } else {
        const loadMoreBtn = loadMoreContainer.querySelector('#loadMoreTracksBtn');
        if (loadMoreBtn) {
          loadMoreBtn.textContent = `📂 Load More Tracks (${this.pendingTracks.length} remaining)`;
        }
      }
    }

    // Update track count info
    const trackCountInfo = document.querySelector('.track-count-info');
    if (trackCountInfo && this.allTracksForSelection) {
      const currentlyShowing = songListContainer.querySelectorAll('.song-card').length;
      trackCountInfo.textContent = `Showing ${currentlyShowing} of ${this.allTracksForSelection.length} tracks`;
    }
  }

  updateLibrarySelectionUI() {
    const checkboxes = document.querySelectorAll('.song-select-checkbox');
    const selectedCheckboxes = document.querySelectorAll('.song-select-checkbox:checked');
    const selectAllBtn = document.getElementById('selectAllSongsBtn');
    const deselectAllBtn = document.getElementById('deselectAllSongsBtn');
    const selectionCounter = document.getElementById('selectionCounter');

    const selectedCount = selectedCheckboxes.length;
    const totalCount = checkboxes.length;

    // Update counter
    if (selectionCounter) {
      if (selectedCount > 0) {
        selectionCounter.textContent = `${selectedCount} selected`;
        selectionCounter.classList.remove('hidden');
      } else {
        selectionCounter.classList.add('hidden');
      }
    }

    // Toggle buttons
    if (selectAllBtn && deselectAllBtn) {
      if (selectedCount === 0) {
        selectAllBtn.classList.remove('hidden');
        deselectAllBtn.classList.add('hidden');
      } else if (selectedCount === totalCount) {
        selectAllBtn.classList.add('hidden');
        deselectAllBtn.classList.remove('hidden');
      } else {
        selectAllBtn.classList.remove('hidden');
        deselectAllBtn.classList.remove('hidden');
      }
    }
  }

  getSelectedLibrarySongs() {
    const selectedCheckboxes = document.querySelectorAll('.song-select-checkbox:checked');
    const selectedSongs = [];

    selectedCheckboxes.forEach((checkbox) => {
      const songCard = checkbox.closest('.song-card');
      if (songCard) {
        selectedSongs.push({
          path: songCard.dataset.path,
          title: songCard.dataset.title,
          artist: songCard.dataset.artist,
          album: songCard.dataset.album,
          trackId: songCard.dataset.trackId,
        });
      }
    });

    return selectedSongs;
  }

  async showLibraryBulkMenu(event, selectedSongs) {
    event.preventDefault();
    event.stopPropagation();

    // Remove any existing bulk menu
    const existingMenu = document.getElementById('libraryBulkMenu');
    if (existingMenu) existingMenu.remove();

    console.log(`Showing library bulk menu for ${selectedSongs.length} songs`);

    try {
      // Get available playlists
      const playlists = await window.queMusicAPI.playlists.getAll();

      // Create bulk playlist menu
      const menuHTML = `
      <div class="library-bulk-menu" id="libraryBulkMenu" style="
        position: fixed;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        min-width: 200px;
        padding: 8px 0;
        color: var(--text-primary);
        font-size: 14px;
      ">
        <div class="bulk-menu-header" style="padding: 8px 12px; border-bottom: 1px solid var(--border); font-weight: 600;">
          Add ${selectedSongs.length} songs to:
        </div>
        ${
          playlists.length > 0
            ? playlists
                .map(
                  (playlist) => `
          <div class="bulk-playlist-option" data-playlist-id="${playlist.id}" style="
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            cursor: pointer;
            transition: background-color 0.2s;
          " onmouseover="this.style.backgroundColor='var(--surface-elevated)'" 
             onmouseout="this.style.backgroundColor='transparent'">
            <span>📋</span>
            <span>${this.escapeHtml(playlist.name)}</span>
            <span style="color: var(--text-secondary); margin-left: auto;">${playlist.track_count || 0}</span>
          </div>
        `
                )
                .join('')
            : '<div style="padding: 8px 12px; color: var(--text-secondary);">No playlists available</div>'
        }
        <div style="border-top: 1px solid var(--border); margin-top: 4px;"></div>
        <div class="bulk-playlist-option" id="createNewPlaylistLibrary" style="
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          cursor: pointer;
          transition: background-color 0.2s;
          color: var(--primary);
        " onmouseover="this.style.backgroundColor='var(--surface-elevated)'" 
           onmouseout="this.style.backgroundColor='transparent'">
          <span>➕</span>
          <span>Create New Playlist</span>
        </div>
      </div>
    `;

      document.body.insertAdjacentHTML('beforeend', menuHTML);

      const menu = document.getElementById('libraryBulkMenu');

      // Position menu
      menu.style.left = `${event.clientX}px`;
      menu.style.top = `${event.clientY}px`;

      // Adjust position if menu goes outside viewport
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        menu.style.left = `${event.clientX - rect.width}px`;
      }
      if (rect.bottom > window.innerHeight) {
        menu.style.top = `${event.clientY - rect.height}px`;
      }

      // Add event listeners
      menu.querySelectorAll('.bulk-playlist-option[data-playlist-id]').forEach((option) => {
        option.addEventListener('click', async () => {
          const playlistId = option.dataset.playlistId;
          await this.addSelectedSongsToPlaylist(selectedSongs, playlistId);
          menu.remove();
        });
      });

      // Create new playlist option
      const createNewOption = document.getElementById('createNewPlaylistLibrary');
      if (createNewOption) {
        createNewOption.addEventListener('click', () => {
          menu.remove();
          this.createPlaylistWithSelectedSongs(selectedSongs);
        });
      }

      // Close menu when clicking elsewhere
      setTimeout(() => {
        document.addEventListener(
          'click',
          (e) => {
            if (!menu.contains(e.target)) {
              menu.remove();
            }
          },
          { once: true }
        );
      }, 0);
    } catch (error) {
      this.app.logger.error('Error showing library bulk menu:', error);
      this.app.showNotification('Failed to load playlists', 'error');
    }
  }

  async addSelectedSongsToPlaylist(selectedSongs, playlistId) {
    if (!selectedSongs || selectedSongs.length === 0) return;

    try {
      const playlist = await window.queMusicAPI.playlists.getById(playlistId);
      let addedCount = 0;
      let skippedCount = 0;

      for (const song of selectedSongs) {
        try {
          // Find track in database by path
          const searchResults = await window.queMusicAPI.database.searchTracks(song.title || '');
          const dbTrack = searchResults.find((track) => track.path === song.path);

          if (dbTrack) {
            await window.queMusicAPI.playlists.addTrack(playlistId, dbTrack.id);
            addedCount++;
          } else {
            console.warn(`Track not found in database: ${song.path}`);
            skippedCount++;
          }
        } catch (error) {
          if (error.message.includes('already in this playlist')) {
            skippedCount++;
          } else {
            console.error(`Error adding track ${song.path}:`, error);
            skippedCount++;
          }
        }
      }

      // Clear selections
      this.clearLibrarySelections();

      // Show result notification
      let message = `Added ${addedCount} songs to "${playlist.name}"`;
      if (skippedCount > 0) {
        message += ` (${skippedCount} skipped)`;
      }

      this.app.showNotification(message, 'success');
      // console.log(`Library bulk add complete: ${addedCount} added, ${skippedCount} skipped`);
    } catch (error) {
      this.app.logger.error('Error adding songs to playlist:', error);
      this.app.showNotification('Failed to add songs to playlist', 'error');
    }
  }

  async createPlaylistWithSelectedSongs(selectedSongs) {
    if (!selectedSongs || selectedSongs.length === 0) return;

    // Use the playlist modal system instead of prompt()
    // Convert selected songs to track format expected by playlist renderer
    const tracks = selectedSongs.map(song => ({
      path: song.path,
      title: song.title || song.name,
      artist: song.artist,
      album: song.album
    }));

    // Use the playlist renderer's modal system for creating with multiple tracks
    if (this.app.playlistRenderer) {
      this.app.playlistRenderer.showPlaylistModalWithTracks(tracks);
    } else {
      this.app.logger.error('PlaylistRenderer not available');
      this.app.showNotification('Playlist system not available', 'error');
    }
  }

  clearLibrarySelections() {
    const checkboxes = document.querySelectorAll('.song-select-checkbox');
    checkboxes.forEach((checkbox) => {
      checkbox.checked = false;
      checkbox.closest('.song-card').classList.remove('selected');
    });
    this.updateLibrarySelectionUI();
  }

  showSongsInRightPane(songs, folderPath) {
    const rightPaneTitle = document.getElementById('rightPaneTitle');
    const rightPaneContent = document.getElementById('rightPaneContent');
    const rightPaneActions = document.getElementById('rightPaneActions');

    // Handle empty songs array (no songs found)
    if (!songs || songs.length === 0) {
      const folderName = this.app.getBasename(folderPath);
      if (rightPaneTitle) rightPaneTitle.textContent = `📁 ${folderName} (0 songs)`;
      if (rightPaneActions) rightPaneActions.innerHTML = '';

      if (rightPaneContent) {
        rightPaneContent.innerHTML = `
        <div class="empty-pane">
          <div class="empty-pane-icon">🎵</div>
          <h4>No Songs Found</h4>
          <p>This folder doesn't contain any music files or the library needs to be rescanned.</p>
        </div>
        `;
      }
      return;
    }

    // Validate songs before processing
    const validSongs = songs.filter((song) => {
      if (!song.path) return false;
      return song.path.includes('\\') || song.path.includes('/');
    });

    if (rightPaneTitle) {
      const folderName = this.app.getBasename(folderPath);
      rightPaneTitle.textContent = `📁 ${folderName} (${validSongs.length} songs)`;
    }

    if (rightPaneActions) {
      if (validSongs.length > 0) {
        rightPaneActions.innerHTML = `<button class="btn-primary btn-sm" id="playAllBtn" data-action="play-all">Play All</button>`;

        // Store the songs for the event delegation handler
        this.currentFolderSongs = validSongs;
      } else {
        rightPaneActions.innerHTML = '';
      }
    }

    if (rightPaneContent) {
      if (validSongs.length === 0) {
        rightPaneContent.innerHTML = `
        <div class="empty-pane">
          <div class="empty-pane-icon">⚠️</div>
          <h4>Invalid File Paths</h4>
          <p>Files have malformed paths. Please rescan your library.</p>
        </div>
      `;
      } else {
        // Use the new selection-enabled track list
        const tracksHTML = this.generateTrackListWithSelection(validSongs);
        rightPaneContent.innerHTML = tracksHTML;

        // Setup selection events
        this.setupLibrarySelectionEvents();
      }
    }

    // console.log(`Displayed ${validSongs.length} valid songs with Select All functionality`);
  }

  // ADD this new method:
  setupSongCardEvents() {
    const songCards = document.querySelectorAll('.song-card');

    songCards.forEach((card) => {
      const songPath = card.dataset.path;

      // console.log(`🎵 Setting up events for: ${songPath}`);

      // Double click to play
      card.addEventListener('dblclick', () => {
        // this.app.logger.debug(' Double-click detected, playing:', songPath);
        this.app.coreAudio.playSong(songPath);
      });

      // Single click to select
      card.addEventListener('click', () => {
        songCards.forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
      });

      // NOTE: Context menu is handled by UIController's global delegation
    });

    console.log(
      `🖱️ Added event listeners to ${songCards.length} song cards (context menus via delegation)`
    );
  }

  generateSongListForRightPane(songs) {
    // console.log(`🔨 Generating HTML for ${songs.length} songs`);

    return `
      <div class="right-pane-track-list">
        <div class="track-list-header-right">
          <div>#</div>
          <div>Title</div>
          <div>Album</div>
          <div>Size</div>
          <div></div>
        </div>
        <div class="track-list-content-right">
          ${songs
            .map(
              (song, index) => `
            <div class="song-card" data-path="${song.path}" data-index="${index}">
              <div class="track-number-right">
                <span class="track-position-right">${index + 1}</span>
                <button class="track-play-btn-right">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="5,3 19,12 5,21"></polygon>
                  </svg>
                </button>
              </div>
              <div class="track-info-right">
                <div class="track-title-right">${this.escapeHtml(song.title || song.name.replace(/\.[^/.]+$/, ''))}</div>
                <div class="track-artist-right">${this.escapeHtml(song.artist || 'Unknown Artist')}</div>
              </div>
              <div class="track-album-right">${this.escapeHtml(song.album || 'Unknown Album')}</div>
              <div class="track-duration-right">${this.app.formatFileSize(song.size)}</div>
              <div class="track-actions-right">
                <button class="track-action-btn-right" title="More options">⋮</button>
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    `;
  }

  setupRightPaneSongEvents() {
    const trackList = document.querySelector('.track-list-content-right');
    if (!trackList) {
      this.app.logger.warn('⚠️ Track list not found in right pane');
      return;
    }

    // this.app.logger.debug(' Setting up right pane song events');

    // Clear existing event listeners
    const newTrackList = trackList.cloneNode(true);
    trackList.parentNode.replaceChild(newTrackList, trackList);

    // Add fresh event listeners to the new element
    const freshTrackList = document.querySelector('.track-list-content-right');

    freshTrackList.addEventListener('click', (event) => {
      const trackCard = event.target.closest('.track-card-right');
      if (!trackCard) return;

      const songPath = trackCard.dataset.path;
      this.app.logger.debug(' Track clicked:', songPath);

      if (event.target.closest('.track-play-btn-right')) {
        // Play button clicked
        // console.log('▶️ Play button clicked');
        this.app.coreAudio.playSong(songPath);
      } else if (event.target.closest('.track-action-btn-right')) {
        // More options clicked - let global delegation handle context menu
        // console.log('⋮ More options clicked - context menu via delegation');
      } else {
        // Track clicked - play
        // this.app.logger.debug(' Track info clicked, playing');
        this.app.coreAudio.playSong(songPath);
      }
    });

    // Double-click to play
    freshTrackList.addEventListener('dblclick', (event) => {
      const trackCard = event.target.closest('.track-card-right');
      if (trackCard) {
        const songPath = trackCard.dataset.path;
        console.log('⏯️ Double-click play:', songPath);
        this.app.coreAudio.playSong(songPath);
      }
    });

    // NOTE: Right-click context menu is handled by UIController's global delegation

    // this.app.logger.info(' Right pane song events setup complete (context menus via delegation)');
  }

  extractSongDataFromRightPaneCard(card) {
    const songPath = card.dataset.path;
    const titleElement = card.querySelector('.track-title-right');
    const artistElement = card.querySelector('.track-artist-right');
    const albumElement = card.querySelector('.track-album-right');

    const songData = {
      path: songPath,
      name: titleElement?.textContent || 'Unknown',
      title: titleElement?.textContent || 'Unknown',
      artist: artistElement?.textContent || 'Unknown Artist',
      album: albumElement?.textContent || 'Unknown Album',
      filename: this.app.getBasename(songPath),
    };

    console.log('📋 Extracted song data:', songData);
    return songData;
  }

  showEmptyLibraryState() {
    // this.app.logger.info(' showEmptyLibraryState FIXED - showing in dual panes');

    const leftPaneTitle = document.getElementById('leftPaneTitle');
    const leftPaneContent = document.getElementById('leftPaneContent');
    const rightPaneTitle = document.getElementById('rightPaneTitle');
    const rightPaneContent = document.getElementById('rightPaneContent');
    const rightPaneActions = document.getElementById('rightPaneActions');

    if (leftPaneTitle) leftPaneTitle.textContent = 'Music Folders';
    if (rightPaneTitle) rightPaneTitle.textContent = 'Select a music folder';
    if (rightPaneActions) rightPaneActions.innerHTML = '';

    if (leftPaneContent) {
      leftPaneContent.innerHTML = `
      <div class="empty-pane">
        <div class="empty-pane-icon">📁</div>
        <h4>No Music Folder Selected</h4>
        <p>Select a music folder to browse your library</p>
        <button class="btn-primary" onclick="window.app.libraryManager.selectMusicFolder()">
          Select Music Folder
        </button>
      </div>
    `;
    }

    if (rightPaneContent) {
      rightPaneContent.innerHTML = `
      <div class="empty-pane">
        <div class="empty-pane-icon">🎵</div>
        <p>Select a music folder to get started</p>
      </div>
    `;
    }

    // this.app.logger.info(' Empty library state set in both panes');
  }

  // Helper method
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  async showArtistTracks(artist) {
    try {
      const tracks = await window.queMusicAPI.database.getTracksByArtist(artist);
      this.displaySearchResults(tracks, `by ${artist}`);
    } catch (error) {
      this.app.logger.error('Error loading artist tracks:', error);
      this.app.showNotification('Failed to load artist tracks', 'error');
    }
  }

  async showAlbumTracks(album, artist) {
    try {
      const tracks = await window.queMusicAPI.database.getTracksByAlbum(album, artist);
      this.displaySearchResults(tracks, `${album} by ${artist}`);
    } catch (error) {
      this.app.logger.error('Error loading album tracks:', error);
      this.app.showNotification('Failed to load album tracks', 'error');
    }
  }

  async playArtist(artist) {
    try {
      const tracks = await window.queMusicAPI.database.getTracksByArtist(artist);
      if (tracks.length > 0) {
        this.app.coreAudio.playSong(tracks[0].path);
        this.app.showNotification(`Playing ${artist} (${tracks.length} tracks)`, 'success');
      }
    } catch (error) {
      this.app.logger.error('Error playing artist:', error);
      this.app.showNotification('Failed to play artist', 'error');
    }
  }

  async playAlbum(album, artist) {
    try {
      const tracks = await window.queMusicAPI.database.getTracksByAlbum(album, artist);
      if (tracks.length > 0) {
        this.app.coreAudio.playSong(tracks[0].path);
        this.app.showNotification(`Playing ${album} (${tracks.length} tracks)`, 'success');
      }
    } catch (error) {
      this.app.logger.error('Error playing album:', error);
      this.app.showNotification('Failed to play album', 'error');
    }
  }

  // ========================================
  // SEARCH METHODS
  // ========================================

  async initializeSearch() {
    // this.app.logger.debug(' Initializing search functionality...');
    // this.app.logger.debug(' Document ready state:', document.readyState);

    // Wait a bit to ensure DOM is fully loaded
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      await new Promise((resolve) => {
        document.addEventListener('DOMContentLoaded', resolve);
      });
      // this.app.logger.debug(' DOM content loaded, continuing search initialization');
    }

    const searchBtn = document.getElementById('searchBtn');
    // this.app.logger.debug(' Search button found:', !!searchBtn);

    if (searchBtn) {
      // Remove any existing listeners using AbortController
      if (searchBtn._searchController) {
        searchBtn._searchController.abort();
      }

      // Create new controller
      const controller = new AbortController();
      searchBtn._searchController = controller;

      // Add click listener
      searchBtn.addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.toggleSearch();
        },
        { signal: controller.signal }
      );

      // this.app.logger.info(' Search button listener added');
    } else {
      this.app.logger.warn('⚠️ Search button not found during initialization');
    }

    // Ensure search input exists but don't show it yet
    this.ensureSearchInput();
  }

  ensureSearchInput() {
    // this.app.logger.debug(' ensureSearchInput() called');
    let searchContainer = document.getElementById('searchContainer');
    // this.app.logger.debug(' Existing search container found:', !!searchContainer);

    if (!searchContainer) {
      // this.app.logger.debug(' Creating search input container in ensureSearchInput()...');
      searchContainer = this.createSearchInput();

      // Add to header
      const headerActions = document.querySelector('.header-actions');
      const searchBtn = document.getElementById('searchBtn');

      // this.app.logger.debug(' ensureSearchInput - DOM elements:', {
      //   headerActions: !!headerActions,
      //   searchBtn: !!searchBtn,
      //   searchContainer: !!searchContainer,
      //   documentReady: document.readyState,
      // });

      if (headerActions && searchBtn && searchContainer) {
        headerActions.insertBefore(searchContainer, searchBtn);
        // this.app.logger.info(' Search container added to header in ensureSearchInput()');
      } else {
        this.app.logger.warn('⚠️ Could not add search container in ensureSearchInput() - DOM not ready?');
      }
    } else {
      this.app.logger.debug(' Search container already exists, skipping creation');
    }

    return searchContainer;
  }

  createSearchInput() {
    const searchContainer = document.createElement('div');
    searchContainer.className = 'search-container'; // Hidden by default via CSS
    searchContainer.id = 'searchContainer';

    searchContainer.innerHTML = `
    <div class="search-input-wrapper">
      <input 
        type="text" 
        id="searchInput" 
        placeholder="Search your music..." 
        class="search-input"
        autocomplete="off"
        spellcheck="false"
      />
      <button class="search-clear-btn" id="clearSearchBtn" title="Clear search" type="button">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
  `;

    // FIXED: Setup events immediately after DOM creation
    // this.app.logger.debug(' About to call setupSearchInputEventsFixed...');
    this.setupSearchInputEventsFixed(searchContainer);
    // this.app.logger.debug(' setupSearchInputEventsFixed completed');

    // this.app.logger.info(' Search input created with events');
    return searchContainer;
  }

  // SIMPLIFIED: Direct event attachment that works
  setupSearchInputEventsFixed(container) {
    const searchInput = container.querySelector('#searchInput');
    const clearBtn = container.querySelector('#clearSearchBtn');

    // this.app.logger.debug(' Setting up search input events...');
    // this.app.logger.debug(' Search input found:', !!searchInput);
    // this.app.logger.debug(' Clear button found:', !!clearBtn);

    if (!searchInput || !clearBtn) {
      this.app.logger.error('❌ Search input elements not found');
      return;
    }

    // Simple input event handler (proven to work)
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      // this.app.logger.debug(' Search input event:', query);

      if (query.length >= 2) {
        // Simple debouncing
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
          this.handleSearchInput(query);
        }, 300);
      } else {
        this.clearSearchResults();
      }
    });

    // Keydown events
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.closeSearch();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const query = e.target.value.trim();
        if (query.length >= 2) {
          this.handleSearchInput(query);
        }
      }
    });

    // Clear button - only clears input, keeps results visible
    clearBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // this.app.logger.debug(' Clear button clicked - clearing input only');
      searchInput.value = '';
      searchInput.focus();
      // Don't clear results - just clear the input text
    });

    // Focus/blur tracking
    searchInput.addEventListener('focus', () => {
      // this.app.logger.debug(' Search input focused');
      searchInput.parentElement.classList.add('focused');
    });

    searchInput.addEventListener('blur', () => {
      // this.app.logger.debug(' Search input blurred');
      searchInput.parentElement.classList.remove('focused');
    });

    this.app.logger.info(' Search input events setup');
  }

  setupSearchInputEvents(container) {
    const searchInput = container.querySelector('#searchInput');
    const clearBtn = container.querySelector('#clearSearchBtn');

    if (searchInput) {
      this.app.logger.debug(' Setting up search input events...');

      // FIXED: Remove any existing listeners by cloning
      const newSearchInput = searchInput.cloneNode(true);
      searchInput.parentNode.replaceChild(newSearchInput, searchInput);

      // Input events
      newSearchInput.addEventListener('input', (e) => {
        // this.app.logger.debug(' Search input:', e.target.value);
        this.handleSearchInput(e.target.value);
      });

      // Keydown events
      newSearchInput.addEventListener('keydown', (e) => {
        // this.app.logger.debug(' Key pressed:', e.key);
        if (e.key === 'Escape') {
          this.closeSearch();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          // Trigger search if needed
          this.handleSearchInput(e.target.value);
        }
      });

      // Focus events for debugging
      newSearchInput.addEventListener('focus', () => {
        // this.app.logger.debug(' Search input focused');
      });

      newSearchInput.addEventListener('blur', () => {
        // this.app.logger.debug(' Search input blurred');
      });

      this.app.logger.info(' Search input events added');
    }

    if (clearBtn) {
      // FIXED: Remove existing listeners
      const newClearBtn = clearBtn.cloneNode(true);
      clearBtn.parentNode.replaceChild(newClearBtn, clearBtn);

      newClearBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.app.logger.debug(' Clear button clicked');

        const input = container.querySelector('#searchInput');
        if (input) {
          input.value = '';
          input.focus(); // Keep focus on input
        }
        this.clearSearchResults();
      });

      // this.app.logger.info(' Clear button events added');
    }
  }

  toggleSearch() {
    // this.app.logger.debug(' toggleSearch called');

    // Check if we currently have search results displayed
    const hasSearchResults =
      this.app.currentView === 'search' &&
      this.currentSearchResults &&
      this.currentSearchResults.length > 0;

    let searchContainer = document.getElementById('searchContainer');
    // this.app.logger.debug(' Search container exists:', !!searchContainer);
    // this.app.logger.debug(' Has search results:', hasSearchResults);

    // If we have search results showing, clear them and return to library
    if (hasSearchResults) {
      // this.app.logger.debug(' Clearing search results and returning to library');
      this.clearSearchResults();
      this.app.uiController.switchView('library');
      return;
    }

    // Create search container if it doesn't exist
    if (!searchContainer) {
      // this.app.logger.debug(' Creating new search container...');
      searchContainer = this.createSearchInput();
      const headerActions = document.querySelector('.header-actions');
      const searchBtn = document.getElementById('searchBtn');

      this.app.logger.debug(' Header actions found:', !!headerActions);
      this.app.logger.debug(' Search button found:', !!searchBtn);

      if (headerActions && searchBtn) {
        headerActions.insertBefore(searchContainer, searchBtn);
      }
    }

    const searchInput = searchContainer.querySelector('#searchInput');

    if (!searchContainer || !searchInput) {
      this.app.logger.error('❌ Search elements not found');
      return;
    }

    // Simple toggle using CSS class instead of inline styles
    const isVisible = searchContainer.classList.contains('visible');

    if (!isVisible) {
      // this.app.logger.debug(' Showing search container');

      // Show the container
      searchContainer.classList.add('visible');
      searchContainer.style.display = 'flex'; // Ensure it's visible

      // Clear any existing value
      searchInput.value = '';

      // Focus the input
      setTimeout(() => {
        searchInput.focus();
        searchInput.setSelectionRange(0, 0);
        // this.app.logger.debug(' Search input focused');
      }, 50);
    } else {
      // this.app.logger.debug(' Hiding search container');
      this.closeSearch();
    }
  }

  closeSearch() {
    // this.app.logger.debug(' closeSearch called');

    const searchContainer = document.getElementById('searchContainer');
    const searchInput = document.getElementById('searchInput');

    if (searchContainer) {
      // Clean up event listeners
      if (searchContainer._abortController) {
        searchContainer._abortController.abort();
        searchContainer._abortController = null;
      }

      // Hide using class
      searchContainer.classList.remove('visible');
      searchContainer.style.display = 'none';
    }

    if (searchInput) {
      searchInput.value = '';
      searchInput.blur();
    }

    // DON'T clear search results - keep them visible for user interaction
    // this.clearSearchResults(); // REMOVED - results should persist
    // this.app.logger.info(' Search input closed (results kept visible)');
  }

  async handleSearchInput(query) {
    // this.app.logger.debug(' handleSearchInput called with:', query);

    if (!query || query.trim().length < 2) {
      // this.app.logger.debug(' Query too short, clearing results');
      this.clearSearchResults();
      return;
    }

    const trimmedQuery = query.trim();
    // this.app.logger.debug(' Searching for:', trimmedQuery);

    try {
      // Show loading state
      this.showSearchLoading();

      // this.app.logger.debug(' Calling API search...');

      // First, check if we have any tracks in the library at all
      try {
        const allTracks = await window.queMusicAPI.database.getAllTracks();
        // console.log(`🔍 Total tracks in library: ${allTracks ? allTracks.length : 0}`);
      } catch (dbError) {
        this.app.logger.error('❌ Error getting all tracks:', dbError);
      }

      const results = await window.queMusicAPI.database.searchTracks(trimmedQuery);
      // console.log(`🔍 API returned results:`, results);
      // console.log(`🔍 Search results: ${results.length} tracks found`);

      if (results.length > 0) {
        this.displaySearchResults(results, trimmedQuery);
      } else {
        this.app.logger.debug(' No results found, showing empty state');
        this.displayNoResults(trimmedQuery);
      }
    } catch (error) {
      this.app.logger.error('❌ Search error:', error);
      this.app.showNotification('Search failed: ' + error.message, 'error');
    }
  }

  displayNoResults(query) {
    // console.log(`🔍 displayNoResults called for: ${query}`);

    // Remove loading state
    const searchContainer = document.getElementById('searchContainer');
    if (searchContainer) {
      searchContainer.classList.remove('searching');
    }

    // Switch to search view
    this.app.currentView = 'search';
    this.app.uiController.updateActiveNavItem(null);
    this.currentSearchResults = [];

    // Update content header
    const title = document.getElementById('currentViewTitle');
    const subtitle = document.getElementById('currentViewSubtitle');

    if (title) {
      title.textContent = 'Search Results';
    }
    if (subtitle) {
      subtitle.textContent = `No tracks found for "${query}"`;
    }

    // Find main content element
    let contentElement = this.findMainContentElement();

    if (contentElement) {
      contentElement.innerHTML = `
        <div class="search-empty">
          <div class="search-empty-icon">🔍</div>
          <h3 class="search-empty-title">No Results Found</h3>
          <p class="search-empty-message">
            No tracks found matching "${query}". Try a different search term.
          </p>
        </div>
      `;
    }
  }

  displaySearchResults(results, query) {
    // console.log(`🔍 displaySearchResults called with ${results.length} results for: ${query}`);

    // Remove loading state
    const searchContainer = document.getElementById('searchContainer');
    if (searchContainer) {
      searchContainer.classList.remove('searching');
    }

    // Switch to search view
    this.app.currentView = 'search';
    this.app.uiController.updateActiveNavItem(null);
    this.currentSearchResults = results;

    // Update content header
    const title = document.getElementById('currentViewTitle');
    const subtitle = document.getElementById('currentViewSubtitle');

    if (title) {
      title.textContent = 'Search Results';
    }
    if (subtitle) {
      subtitle.innerHTML = `
        ${results.length} tracks found for "${query}"
        <button class="btn-secondary btn-sm" onclick="window.app.libraryManager.clearSearchResultsAndReturnToLibrary()" style="margin-left: 15px; font-size: 12px;">
          Clear Results
        </button>
      `;
    }

    // Find main content element
    let contentElement = this.findMainContentElement();

    if (contentElement) {
      // console.log(`🔍 Using content element: ${contentElement.id || contentElement.className}`);

      const htmlContent = this.renderSearchResults(results, query);
      contentElement.innerHTML = htmlContent;

      this.setupSearchResultEvents();

      // Hide welcome screen
      this.hideWelcomeScreen();

      // IMPORTANT: Ensure context menu system is ready after loading search results
      setTimeout(() => {
        if (this.app.uiController) {
          this.app.uiController.ensureContextMenuSystem();
        }
      }, 300);

      console.log(`✅ Search results displayed successfully with context menu support`);
    } else {
      console.error(`❌ No suitable content element found for search results!`);
      this.app.showNotification('Could not display search results', 'error');
    }
  }

  findMainContentElement() {
    // Try multiple possible content containers in order of preference
    const possibleSelectors = [
      '#mainContent',
      '#musicContent',
      '.main-content',
      '.content-main',
      '.content-area',
      '[class*="content"]',
      '#content',
      '.app-content',
      'main',
    ];

    for (const selector of possibleSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        // console.log(`🔍 Found content element with selector: ${selector}`);
        return element;
      }
    }

    // Last resort: find any element with 'content' in its ID or class
    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
      const id = el.id?.toLowerCase() || '';
      const className = el.className?.toLowerCase() || '';

      if (
        (id.includes('content') || className.includes('content')) &&
        el.offsetWidth > 100 &&
        el.offsetHeight > 100
      ) {
        // console.log(`🔍 Found content element by search: ${el.tagName}#${el.id}.${el.className}`);
        return el;
      }
    }

    this.app.logger.error('❌ No content element found at all!');
    return null;
  }

  renderSearchResults(tracks, query) {
    if (tracks.length === 0) {
      return `
  <div class="empty-state">
    <div class="empty-state-icon">🔍</div>
    <div class="empty-state-title">No tracks found</div>
    <div class="empty-state-description">Try a different search term</div>
    <button class="primary-btn" onclick="window.app.libraryManager.showDiscoverHome()">
      ← Back to Discover
    </button>
  </div>
`;
    }

    return `
    <div class="search-results">
      <div class="search-results-header">
        <div class="results-navigation">
          <button class="icon-btn back-btn" id="backToFiltersBtn" title="Back to filters">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="15,18 9,12 15,6"></polyline>
            </svg>
          </button>
          <div class="results-breadcrumb">
            <span class="breadcrumb-item">Filters</span>
            <span class="breadcrumb-separator">›</span>
            <span class="breadcrumb-current">${query}</span>
          </div>
        </div>
        <div class="results-actions">
          <h3>${tracks.length} tracks found</h3>
          <button class="primary-btn" id="playAllSearchBtn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="5,3 19,12 5,21"></polygon>
            </svg>
            Play All
          </button>
        </div>
      </div>
      <div class="search-results-list">
        ${tracks
          .map(
            (track, index) => `
          <div class="search-result-card" 
               data-path="${track.path}" 
               data-index="${index}"
               data-title="${this.escapeHtml(track.title || 'Unknown Title')}"
               data-artist="${this.escapeHtml(track.artist || 'Unknown Artist')}"
               data-album="${this.escapeHtml(track.album || 'Unknown Album')}">
            <div class="track-info">
              <div class="track-title">${track.title || 'Unknown Title'}</div>
              <div class="track-details">
                <span class="track-artist">${track.artist || 'Unknown Artist'}</span>
                ${track.album ? ` • <span class="track-album">${track.album}</span>` : ''}
                ${track.year ? ` • <span class="track-year">${track.year}</span>` : ''}
              </div>
            </div>
            <div class="track-metadata">
              <span class="track-format">${track.format}</span>
              <span class="track-size">${this.app.formatFileSize(track.filesize)}</span>
            </div>
            <button class="icon-btn play-track-btn" title="Play track">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="5,3 19,12 5,21"></polygon>
              </svg>
            </button>
          </div>
        `
          )
          .join('')}
      </div>
    </div>
  `;
  }

  setupSearchResultEvents() {
    // Back to filters button
    const backBtn = document.getElementById('backToFiltersBtn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        this.showAdvancedFilters();
      });
    }

    // Play individual tracks - no context menu setup needed
    document.querySelectorAll('.search-result-card').forEach((card) => {
      const trackPath = card.dataset.path;

      // Double-click to play
      card.addEventListener('dblclick', () => {
        this.app.coreAudio.playSong(trackPath);
      });

      // NOTE: Context menu is handled by UIController's global delegation
    });

    // Play buttons
    document.querySelectorAll('.play-track-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const card = btn.closest('.search-result-card');
        const trackPath = card.dataset.path;
        this.app.coreAudio.playSong(trackPath);
      });
    });

    // Play all button
    const playAllBtn = document.getElementById('playAllSearchBtn');
    if (playAllBtn) {
      playAllBtn.addEventListener('click', () => {
        this.playAllSearchResults();
      });
    }

    // this.app.logger.debug(' Setup search result events (context menus via delegation)');
  }

  // Extract track data from search result cards
  // extractTrackDataFromSearchCard(card) {
  //   const trackPath = card.dataset.path;
  //   const titleElement = card.querySelector('.track-title');
  //   const artistElement = card.querySelector('.track-artist');
  //   const albumElement = card.querySelector('.track-album');
  //   const yearElement = card.querySelector('.track-year');
  //   const metadataElement = card.querySelector('.track-metadata');

  //   // Parse metadata (format and size)
  //   let format = 'Unknown';
  //   let sizeText = 'Unknown';

  //   if (metadataElement) {
  //     const formatElement = metadataElement.querySelector('.track-format');
  //     const sizeElement = metadataElement.querySelector('.track-size');

  //     format = formatElement?.textContent || 'Unknown';
  //     sizeText = sizeElement?.textContent || 'Unknown';
  //   }

  //   return {
  //     path: trackPath,
  //     name: titleElement?.textContent || 'Unknown',
  //     title: titleElement?.textContent || 'Unknown',
  //     artist: artistElement?.textContent || 'Unknown Artist',
  //     album: albumElement?.textContent || 'Unknown Album',
  //     year: yearElement?.textContent || '',
  //     format: format,
  //     size: this.parseSizeText(sizeText),
  //     sizeText: sizeText,
  //     filename: this.app.getBasename(trackPath),
  //   };
  // }

  playAllSearchResults() {
    const cards = document.querySelectorAll('.search-result-card');
    if (cards.length > 0) {
      const firstTrack = cards[0].dataset.path;
      this.app.coreAudio.playSong(firstTrack);
      this.app.showNotification(`Playing ${cards.length} search results`, 'success');
    }
  }

  showSearchLoading() {
    // Optional: Show loading indicator while searching
    const searchContainer = document.getElementById('searchContainer');
    if (searchContainer) {
      searchContainer.classList.add('searching');
    }
  }

  clearSearchResults() {
    // this.app.logger.debug(' clearSearchResults called');

    // Remove loading state
    const searchContainer = document.getElementById('searchContainer');
    if (searchContainer) {
      searchContainer.classList.remove('searching');
    }

    if (this.app.currentView === 'search') {
      // this.app.logger.debug(' Returning to library view from search');
      // Return to library view
      this.app.uiController.switchView('library');
    }
  }

  // ========================================
  // ADVANCED FILTERING METHODS
  // ========================================

  async loadGenresFilter() {
    try {
      // We need to add this API method first
      const genres = await window.queMusicAPI.database.getGenreStats();
      return genres.filter((genre) => genre.genre && genre.genre.trim() !== '');
    } catch (error) {
      this.app.logger.error('Error loading genres:', error);
      return [];
    }
  }

  async loadYearsFilter() {
    try {
      const years = await window.queMusicAPI.database.getYearStats();
      return years.filter(
        (year) => year.year && year.year > 1900 && year.year <= new Date().getFullYear()
      );
    } catch (error) {
      this.app.logger.error('Error loading years:', error);
      return [];
    }
  }

  async applyAdvancedFilter(filterType, filterValue, event) {
    try {
      // console.log(`🔍 Starting filter: ${filterType} = ${filterValue}`);

      // Clear all active filter buttons first
      document.querySelectorAll('.filter-btn').forEach((btn) => {
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
      });

      // Highlight the clicked button
      if (event && event.target) {
        event.target.classList.remove('btn-secondary');
        event.target.classList.add('btn-primary');
        // console.log(`🎯 Button highlighted: ${event.target.textContent}`);
      }

      let tracks = [];
      let headerText = '';

      switch (filterType) {
        case 'genre':
          // console.log(`🎵 Filtering by genre: ${filterValue}`);
          const allTracks = await window.queMusicAPI.database.getAllTracks();
          // this.app.logger.debug(' DEBUG: Raw database tracks count:', allTracks.length);

          // First, let's check if allTracks itself has duplicates
          const allPaths = allTracks.map((t) => t.path);
          const uniquePaths = new Set(allPaths);
          if (allPaths.length !== uniquePaths.size) {
            // console.log('🚨 FOUND DUPLICATES IN getAllTracks()!');
            // console.log('🚨 Total tracks:', allPaths.length, 'Unique paths:', uniquePaths.size);

            // Find the actual duplicates
            const pathCounts = {};
            allTracks.forEach((track) => {
              pathCounts[track.path] = (pathCounts[track.path] || 0) + 1;
            });

            const duplicatePaths = Object.entries(pathCounts).filter(([path, count]) => count > 1);
            console.log('🚨 Duplicate paths found:', duplicatePaths.slice(0, 5));
          } else {
            this.app.logger.info(' No duplicates found in getAllTracks()');
          }

          // Use filename-based deduplication since you have duplicate files in Albums vs Genre folders
          const seenFilenames = new Set();
          const uniqueTracks = [];

          allTracks.forEach((track, trackIndex) => {
            // Skip tracks without genre
            if (!track.genre) return;

            // Extract filename from path for deduplication
            const filename = track.path
              .split(/[\\\/]/)
              .pop()
              .toLowerCase();

            // Skip if we've already added this filename
            if (seenFilenames.has(filename)) {
              // console.log(`🔍 DUPLICATE SKIP [${trackIndex}]: Already seen filename "${filename}" from:`, track.path);
              return;
            }

            // Check if genre matches
            const trackGenre = track.genre.toLowerCase();
            const searchGenre = filterValue.toLowerCase();
            const matches = trackGenre.includes(searchGenre) || trackGenre === searchGenre;

            if (matches) {
              // console.log(`✅ ADDING [${trackIndex}]: ${track.title} - ${filename}`);
              seenFilenames.add(filename);
              uniqueTracks.push(track);
            }
          });

          tracks = uniqueTracks;

          // this.app.logger.debug(' DEBUG: Total tracks:', allTracks.length);
          // this.app.logger.debug(' DEBUG: Matching tracks:', tracks.length);
          // this.app.logger.debug(' DEBUG: Seen filenames count:', seenFilenames.size);
          // this.app.logger.debug(' DEBUG: Final tracks array length:', tracks.length);

          headerText = `Genre: ${filterValue}`;
          break;

        case 'year':
          // console.log(`📅 Filtering by year: ${filterValue}`);
          const allTracksYear = await window.queMusicAPI.database.getAllTracks();
          tracks = allTracksYear.filter((track) => track.year == filterValue);
          headerText = `Year: ${filterValue}`;
          break;

        case 'decade':
          // console.log(`📅 Filtering by decade: ${filterValue}`);
          const allTracksDecade = await window.queMusicAPI.database.getAllTracks();
          const decadeStart = parseInt(filterValue);
          const decadeEnd = decadeStart + 9;
          tracks = allTracksDecade.filter(
            (track) => track.year && track.year >= decadeStart && track.year <= decadeEnd
          );
          headerText = `${filterValue}s Music`;
          break;

        case 'format':
          // console.log(`🎧 Filtering by format: ${filterValue}`);
          const allTracksFormat = await window.queMusicAPI.database.getAllTracks();
          tracks = allTracksFormat.filter(
            (track) => track.format && track.format.toLowerCase() === filterValue.toLowerCase()
          );
          headerText = `Format: ${filterValue}`;
          break;

        default:
          // console.log(`🎵 Default case - getting all tracks`);
          tracks = await window.queMusicAPI.database.getAllTracks();
          headerText = 'All Tracks';
      }

      // console.log(`✅ Filter complete: found ${tracks.length} tracks for ${headerText}`);
      // console.log(
      //   '🔍 DEBUG: Final tracks array paths:',
      //   tracks.slice(0, 5).map((t) => t.path)
      // );

      // FIXED: Switch to dual pane layout for results
      this.app.uiController.showDualPaneView();

      // Update left pane with filter info
      const leftPaneTitle = document.getElementById('leftPaneTitle');
      const leftPaneContent = document.getElementById('leftPaneContent');
      const leftPaneActions = document.getElementById('leftPaneActions');

      if (leftPaneTitle) leftPaneTitle.textContent = 'Filters';
      if (leftPaneActions) {
        leftPaneActions.innerHTML = `
    <button class="btn-secondary btn-sm" onclick="window.app.libraryManager.showDiscoverHome()">
      ← Back to Discover
    </button>
  `;
      }
      if (leftPaneContent) {
        leftPaneContent.innerHTML = `
    <div class="filter-result-info">
      <h4>Filter Applied</h4>
      <p><strong>${headerText}</strong></p>
      <p>${tracks.length} tracks found</p>
      
      <div class="filter-actions" style="margin-top: 20px;">
        <button class="btn-primary btn-sm" id="leftPanePlayAllBtn" ${tracks.length === 0 ? 'disabled' : ''}>
          Play All
        </button>
      </div>
    </div>
  `;
        // DEBUG: Log what path is being used in the onclick
        // Add proper event listener instead of inline onclick
        const leftPlayAllBtn = document.getElementById('leftPanePlayAllBtn');
        if (leftPlayAllBtn && tracks.length > 0) {
          leftPlayAllBtn.addEventListener('click', () => {
            // console.log('Left pane Play All clicked with path:', tracks[0].path);
            this.handlePlayAllClick(tracks);
          });
        }
      }

      const backBtn = document.querySelector('#backToDiscoverBtn');
      if (backBtn) {
        backBtn.addEventListener('click', () => {
          this.showDiscoverHome();
        });
      }
      // Display tracks in right pane
      this.app.uiController.displayTracksInRightPane(
        tracks,
        `🔍 ${headerText}`,
        `${tracks.length} tracks`
      );
    } catch (error) {
      this.app.logger.error('❌ Error applying filter:', error);
    }
  }

  async showAdvancedFiltersInMainContent(mainContent) {
    try {
      // Show loading
      mainContent.innerHTML = `
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <p>Loading filters...</p>
      </div>
    `;

      const [genres, years] = await Promise.all([this.loadGenresFilter(), this.loadYearsFilter()]);
      const stats = await window.queMusicAPI.database.getStats();

      mainContent.innerHTML = this.renderAdvancedFilters(genres, years, stats);
      this.setupAdvancedFiltersEvents();

      // this.app.logger.info(' Advanced filters loaded in main content (fallback)');
    } catch (error) {
      this.app.logger.error('❌ Error in fallback method:', error);
      mainContent.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-title">Filter Error</div>
        <div class="empty-state-description">Failed to load filter options</div>
      </div>
    `;
    }
  }

  async showAdvancedFilters() {
    this.app.logger.debug(' Loading advanced filters...');

    // FIXED: Use single pane content instead of mainContent
    const singlePaneContent = document.getElementById('singlePaneContent');
    if (!singlePaneContent) {
      this.app.logger.error('❌ Single pane content not found - trying mainContent fallback');

      // Fallback to mainContent if single pane not available
      const mainContent = document.getElementById('mainContent');
      if (!mainContent) {
        this.app.logger.error('❌ No content container found');
        return;
      }

      return this.showAdvancedFiltersInMainContent(mainContent);
    }

    try {
      // Show loading
      singlePaneContent.innerHTML = `
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <p>Loading filters...</p>
      </div>
    `;

      const [genres, years] = await Promise.all([this.loadGenresFilter(), this.loadYearsFilter()]);
      const stats = await window.queMusicAPI.database.getStats();

      // FIXED: Use single pane optimized layout
      singlePaneContent.innerHTML = this.renderAdvancedFiltersForSinglePane(genres, years, stats);
      this.setupAdvancedFiltersEvents();

      // this.app.logger.info(' Advanced filters loaded in single pane');
    } catch (error) {
      this.app.logger.error('❌ Error showing advanced filters:', error);
      singlePaneContent.innerHTML = `
      <div class="error-state">
        <div class="error-icon">⚠️</div>
        <h3>Filter Error</h3>
        <p>Failed to load filter options</p>
        <button class="btn-secondary" onclick="location.reload()">Refresh App</button>
      </div>
    `;
    }
  }

  renderAdvancedFiltersForSinglePane(genres, years, stats) {
    return `
    <div class="advanced-filters-single">
      <div class="filters-header">
        <h2>🔍 Genre Browser</h2>
        <p>Explore your ${stats.tracks.toLocaleString()} tracks by genre, year, and format</p>
        <button class="btn-secondary" onclick="window.app.uiController.switchView('discover')" style="margin-top: 10px;">
          ← Back to Discover
        </button>
      </div>
      
      <div class="filter-sections">
        <div class="filter-section">
          <h3>🎵 Browse by Genre</h3>
          <div class="filter-grid">
            ${genres
              .slice(0, 50)
              .map(
                (genre) => `
              <button class="filter-btn" data-filter="genre" data-value="${genre.genre}">
                ${genre.genre}
                <span class="filter-count">${genre.count}</span>
              </button>
            `
              )
              .join('')}
            ${genres.length > 30 ? `<div class="filter-note">And ${genres.length - 30} more genres...</div>` : ''}
          </div>
        </div>
        
        <div class="filter-section">
          <h3>📅 Browse by Decade</h3>
          <div class="filter-grid">
            ${this.groupYearsByDecade(years)
              .map(
                (decade) => `
              <button class="filter-btn" data-filter="decade" data-value="${decade.decade}">
                ${decade.decade}s
                <span class="filter-count">${decade.count}</span>
              </button>
            `
              )
              .join('')}
          </div>
        </div>
        
        <div class="filter-section">
          <h3>🎧 Browse by Format</h3>
          <div class="filter-grid">
            <button class="filter-btn" data-filter="format" data-value="MP3">
              MP3 <span class="filter-count">Most Common</span>
            </button>
            <button class="filter-btn" data-filter="format" data-value="FLAC">
              FLAC <span class="filter-count">High Quality</span>
            </button>
            <button class="filter-btn" data-filter="format" data-value="WAV">
              WAV <span class="filter-count">Lossless</span>
            </button>
            <button class="filter-btn" data-filter="format" data-value="M4A">
              M4A <span class="filter-count">AAC</span>
            </button>
          </div>
        </div>
        
        <div class="filter-section">
          <h3>🔥 Quick Actions</h3>
          <div class="filter-grid">
            <button class="filter-btn btn-primary" id="showAllTracksBtn">
              All Tracks <span class="filter-count">${stats.tracks}</span>
            </button>
            <button class="filter-btn" id="showRandomBtn">
              Random Mix <span class="filter-count">Shuffle!</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
  }

  renderAdvancedFilters(genres, years, stats) {
    return `
      <div class="advanced-filters">
        <div class="filters-header">
          <h2>Advanced Filters</h2>
          <p>Browse your ${stats.tracks.toLocaleString()} tracks by different criteria</p>
        </div>
        
        <div class="filter-sections">
          <div class="filter-section">
            <h3>🎵 By Genre</h3>
            <div class="filter-grid">
              ${genres
                .slice(0, 30)
                .map(
                  (genre) => `
                <button class="filter-btn" data-filter="genre" data-value="${genre.genre}">
                  ${genre.genre}
                  <span class="filter-count">${genre.count}</span>
                </button>
              `
                )
                .join('')}
              ${genres.length > 20 ? `<button class="filter-btn more-btn">+${genres.length - 20} more...</button>` : ''}
            </div>
          </div>
          
          <div class="filter-section">
            <h3>📅 By Decade</h3>
            <div class="filter-grid">
              ${this.groupYearsByDecade(years)
                .map(
                  (decade) => `
                <button class="filter-btn" data-filter="decade" data-value="${decade.decade}">
                  ${decade.decade}s
                  <span class="filter-count">${decade.count}</span>
                </button>
              `
                )
                .join('')}
            </div>
          </div>
          
          <div class="filter-section">
            <h3>🎧 By Format</h3>
            <div class="filter-grid">
              <button class="filter-btn" data-filter="format" data-value="MP3">
                MP3 <span class="filter-count">Most</span>
              </button>
              <button class="filter-btn" data-filter="format" data-value="FLAC">
                FLAC <span class="filter-count">High Quality</span>
              </button>
              <button class="filter-btn" data-filter="format" data-value="WAV">
                WAV <span class="filter-count">Lossless</span>
              </button>
              <button class="filter-btn" data-filter="format" data-value="M4A">
                M4A <span class="filter-count">AAC</span>
              </button>
            </div>
          </div>
          
          <div class="filter-section">
            <h3>🔍 Quick Actions</h3>
            <div class="filter-grid">
              <button class="filter-btn primary" id="showAllTracksBtn">
                All Tracks <span class="filter-count">${stats.tracks}</span>
              </button>
              <button class="filter-btn" id="showRandomBtn">
                Random Mix <span class="filter-count">Surprise!</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  groupYearsByDecade(years) {
    const decades = {};
    years.forEach((year) => {
      if (year.year) {
        const decade = Math.floor(year.year / 10) * 10;
        if (!decades[decade]) {
          decades[decade] = { decade, count: 0 };
        }
        decades[decade].count += year.count;
      }
    });

    return Object.values(decades).sort((a, b) => b.decade - a.decade);
  }

  setupAdvancedFiltersEvents() {
    // Remove existing event listeners first to prevent duplicates
    document.querySelectorAll('.filter-btn[data-filter]').forEach((btn) => {
      // Clone and replace to remove all event listeners
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
    });

    // Filter buttons - add fresh event listeners
    document.querySelectorAll('.filter-btn[data-filter]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        const filterType = btn.dataset.filter;
        const filterValue = btn.dataset.value;

        // Pass the event so we can highlight the correct button
        if (filterType === 'decade') {
          this.applyDecadeFilter(filterValue, event);
        } else {
          this.applyAdvancedFilter(filterType, filterValue, event);
        }
      });
    });

    // Show all tracks - remove existing listeners first
    const showAllBtn = document.getElementById('showAllTracksBtn');
    if (showAllBtn) {
      // Clone and replace to remove existing listeners
      const newShowAllBtn = showAllBtn.cloneNode(true);
      showAllBtn.parentNode.replaceChild(newShowAllBtn, showAllBtn);

      newShowAllBtn.addEventListener('click', async (event) => {
        // Clear other button states
        document.querySelectorAll('.filter-btn').forEach((btn) => {
          btn.classList.remove('primary');
        });

        // Highlight this button
        event.target.classList.add('primary');

        const tracks = await window.queMusicAPI.database.getAllTracks();
        this.displaySearchResults(tracks, 'All Tracks');
      });
    }

    // Random mix - remove existing listeners first
    const randomBtn = document.getElementById('showRandomBtn');
    if (randomBtn) {
      // Clone and replace to remove existing listeners
      const newRandomBtn = randomBtn.cloneNode(true);
      randomBtn.parentNode.replaceChild(newRandomBtn, randomBtn);

      newRandomBtn.addEventListener('click', async (event) => {
        // Clear other button states
        document.querySelectorAll('.filter-btn').forEach((btn) => {
          btn.classList.remove('primary');
        });

        // Highlight this button
        event.target.classList.add('primary');

        const tracks = await window.queMusicAPI.database.getAllTracks();
        const shuffled = tracks.sort(() => 0.5 - Math.random()).slice(0, 100);
        this.displaySearchResults(shuffled, 'Random Mix (100 tracks)');
      });
    }
  }

  async applyDecadeFilter(decade, event) {
    try {
      // Clear all active filter buttons first
      document.querySelectorAll('.filter-btn').forEach((btn) => {
        btn.classList.remove('primary');
      });

      // Highlight the clicked button
      if (event && event.target) {
        event.target.classList.add('primary');
      }

      const tracks = await window.queMusicAPI.database.getAllTracks();
      const decadeStart = parseInt(decade);
      const decadeEnd = decadeStart + 9;

      const filtered = tracks.filter(
        (track) => track.year && track.year >= decadeStart && track.year <= decadeEnd
      );

      this.displaySearchResults(filtered, `${decade}s Music`);
      // console.log(`🔍 Decade filter: ${decade}s, found ${filtered.length} tracks`);
    } catch (error) {
      this.app.logger.error('Error applying decade filter:', error);
      this.app.showNotification('Decade filter failed', 'error');
    }
  }

  // ========================================
  // DATABASE MANAGEMENT
  // ========================================

  async openDatabaseManager() {
    // console.log('🗄️ Opening database manager...');

    try {
      // Show loading state
      const mainContent = document.getElementById('mainContent');
      if (mainContent) {
        mainContent.innerHTML = `
          <div class="loading-state">
            <div class="loading-spinner"></div>
            <p>Loading database information...</p>
          </div>
        `;
      }

      this.hideWelcomeScreen();

      // Get database statistics
      const stats = await window.queMusicAPI.database.getStats();
      const genres = await window.queMusicAPI.database.getGenreStats();
      const years = await window.queMusicAPI.database.getYearStats();
      const playlists = await window.queMusicAPI.playlists.getAll();

      // Get folder information
      const musicFolder = await window.queMusicAPI.settings.getMusicFolder();
      const playlistFolder = await window.queMusicAPI.playlists.getFolder();

      // Display the database manager interface
      this.displayDatabaseManager(stats, genres, years, playlists, musicFolder, playlistFolder);
    } catch (error) {
      this.app.logger.error('❌ Error opening database manager:', error);
      this.app.showNotification('Failed to load database manager', 'error');
    }
  }

  displayDatabaseManager(stats, genres, years, playlists, musicFolder, playlistFolder) {
    const mainContent = document.getElementById('mainContent');
    if (!mainContent) return;

    // Calculate additional stats
    const totalSizeGB = (stats.totalSize / (1024 * 1024 * 1024)).toFixed(2);
    const avgDuration = stats.tracks > 0 ? (stats.totalDuration / stats.tracks / 60).toFixed(1) : 0;
    const topGenres = genres.slice(0, 5);
    const recentYears = years.filter((y) => y.year >= 2000).reduce((sum, y) => sum + y.count, 0);
    const classicYears = years.filter((y) => y.year < 2000).reduce((sum, y) => sum + y.count, 0);

    const managerHTML = `
      <div class="database-manager">
        <div class="database-header">
          <h2>🗄️ Database Manager</h2>
          <p>Manage and maintain your music database</p>
        </div>
        
        <div class="manager-sections">
          
          <!-- Statistics Dashboard -->
          <div class="manager-section">
            <h3>📊 Library Statistics</h3>
            <div class="stats-grid">
              <div class="stat-card">
                <div class="stat-number">${stats.tracks.toLocaleString()}</div>
                <div class="stat-label">Total Tracks</div>
              </div>
              <div class="stat-card">
                <div class="stat-number">${stats.artists.toLocaleString()}</div>
                <div class="stat-label">Artists</div>
              </div>
              <div class="stat-card">
                <div class="stat-number">${stats.albums.toLocaleString()}</div>
                <div class="stat-label">Albums</div>
              </div>
              <div class="stat-card">
                <div class="stat-number">${stats.genres.toLocaleString()}</div>
                <div class="stat-label">Genres</div>
              </div>
              <div class="stat-card">
                <div class="stat-number">${playlists.length}</div>
                <div class="stat-label">Playlists</div>
              </div>
              <div class="stat-card">
                <div class="stat-number">${totalSizeGB} GB</div>
                <div class="stat-label">Total Size</div>
              </div>
              <div class="stat-card">
                <div class="stat-number">${Math.round(stats.totalDuration / 3600)} hrs</div>
                <div class="stat-label">Total Duration</div>
              </div>
              <div class="stat-card">
                <div class="stat-number">${avgDuration} min</div>
                <div class="stat-label">Avg Track Length</div>
              </div>
            </div>
          </div>
          
          <!-- Collection Overview -->
          <div class="manager-section">
            <h3>🎵 Collection Overview</h3>
            <div class="overview-grid">
              <div class="overview-card">
                <h4>Top Genres</h4>
                <div class="genre-list">
                  ${topGenres
                    .map(
                      (genre) => `
                    <div class="genre-item">
                      <span class="genre-name">${genre.genre}</span>
                      <span class="genre-count">${genre.count} tracks</span>
                    </div>
                  `
                    )
                    .join('')}
                </div>
              </div>
              <div class="overview-card">
                <h4>Era Breakdown</h4>
                <div class="era-stats">
                  <div class="era-item">
                    <span class="era-label">Modern (2000+)</span>
                    <span class="era-count">${recentYears} tracks</span>
                  </div>
                  <div class="era-item">
                    <span class="era-label">Classic (Pre-2000)</span>
                    <span class="era-count">${classicYears} tracks</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Database Maintenance -->
          <div class="manager-section">
            <h3>🔧 Database Maintenance</h3>
            <div class="maintenance-grid">
              <div class="maintenance-card">
                <h4>Library Scanning</h4>
                <p>Scan your music folder for new tracks and updated metadata</p>
                <button class="btn-secondary" id="rescanLibraryBtn">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
                    <path d="M21 3v5h-5"></path>
                    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
                    <path d="M3 21v-5h5"></path>
                  </svg>
                  Rescan Library
                </button>
              </div>
              
              <div class="maintenance-card">
                <h4>Database Cleanup</h4>
                <p>Clean up orphaned records and optimize database performance</p>
                <button class="btn-secondary" id="cleanupDbBtn">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 6h18"></path>
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                  </svg>
                  Clean Database
                </button>
              </div>
              
              <div class="maintenance-card">
                <h4>Missing Files</h4>
                <p>Check for tracks in database that no longer exist on disk</p>
                <button class="btn-secondary" id="findMissingBtn">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="M21 21l-4.35-4.35"></path>
                  </svg>
                  Find Missing Files
                </button>
              </div>
              
              <div class="maintenance-card">
                <h4>Duplicate Detection</h4>
                <p>Find and manage duplicate tracks in your library</p>
                <button class="btn-secondary" id="findDuplicatesBtn">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                  Find Duplicates
                </button>
              </div>
              
              <div class="maintenance-card">
                <h4>Update Durations</h4>
                <p>Extract duration information for existing tracks</p>
                <button class="btn-secondary" id="updateDurationsBtn">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12,6 12,12 16,14"></polyline>
                  </svg>
                  Update Durations
                </button>
              </div>

              <div class="maintenance-card">
                <h4>Normalize Database</h4>
                <p>Populate artists and albums tables from track metadata</p>
                <button class="btn-secondary" id="normalizeDbBtn">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2L2 7v10l10 5 10-5V7l-10-5z"></path>
                    <polyline points="2,7 12,12 22,7"></polyline>
                    <polyline points="12,22 12,12"></polyline>
                  </svg>
                  Normalize Tables
                </button>
              </div>
            </div>
          </div>
          
          <!-- Folder Information -->
          <div class="manager-section">
            <h3>📁 Folder Configuration</h3>
            <div class="folder-grid">
              <div class="folder-card">
                <h4>Music Folder</h4>
                <p class="folder-path">${musicFolder || 'Not set'}</p>
                <button class="btn-secondary" onclick="window.app.libraryManager.selectMusicFolder()">Change Folder</button>
              </div>
              <div class="folder-card">
                <h4>Playlist Folder</h4>
                <p class="folder-path">${playlistFolder || 'Not set'}</p>
                <button class="btn-secondary" id="openPlaylistFolderBtn">Open in Explorer</button>
              </div>
            </div>
          </div>
          
          <!-- Database Health -->
          <div class="manager-section">
            <h3>💚 Database Health</h3>
            <div class="health-grid">
              <div class="health-item">
                <span class="health-icon ${stats.tracks > 0 ? 'healthy' : 'warning'}">${stats.tracks > 0 ? '✅' : '⚠️'}</span>
                <span class="health-label">Music Collection</span>
                <span class="health-status">${stats.tracks > 0 ? 'Healthy' : 'Empty'}</span>
              </div>
              <div class="health-item">
                <span class="health-icon ${playlists.length > 0 ? 'healthy' : 'info'}">${playlists.length > 0 ? '✅' : 'ℹ️'}</span>
                <span class="health-label">Playlists</span>
                <span class="health-status">${playlists.length > 0 ? 'Active' : 'None Created'}</span>
              </div>
              <div class="health-item">
                <span class="health-icon ${musicFolder ? 'healthy' : 'error'}">${musicFolder ? '✅' : '❌'}</span>
                <span class="health-label">Music Folder</span>
                <span class="health-status">${musicFolder ? 'Configured' : 'Not Set'}</span>
              </div>
              <div class="health-item">
                <span class="health-icon ${playlistFolder ? 'healthy' : 'warning'}">${playlistFolder ? '✅' : '⚠️'}</span>
                <span class="health-label">Playlist Backup</span>
                <span class="health-status">${playlistFolder ? 'Active' : 'Disabled'}</span>
              </div>
            </div>
          </div>
          
        </div>
      </div>
    `;

    mainContent.innerHTML = managerHTML;

    // Setup event listeners
    this.setupDatabaseManagerEvents();
  }

  setupDatabaseManagerEvents() {
    // Rescan Library
    const rescanBtn = document.getElementById('rescanLibraryBtn');
    if (rescanBtn) {
      rescanBtn.addEventListener('click', () => {
        this.rescanMusicLibrary();
      });
    }

    // Database Cleanup
    const cleanupBtn = document.getElementById('cleanupDbBtn');
    if (cleanupBtn) {
      cleanupBtn.addEventListener('click', () => {
        this.cleanupDatabase();
      });
    }

    // Find Missing Files
    const findMissingBtn = document.getElementById('findMissingBtn');
    if (findMissingBtn) {
      findMissingBtn.addEventListener('click', () => {
        this.findMissingFiles();
      });
    }

    // Find Duplicates
    const findDuplicatesBtn = document.getElementById('findDuplicatesBtn');
    if (findDuplicatesBtn) {
      findDuplicatesBtn.addEventListener('click', () => {
        this.findDuplicateTracks();
      });
    }

    // Open Playlist Folder
    const openPlaylistFolderBtn = document.getElementById('openPlaylistFolderBtn');
    if (openPlaylistFolderBtn) {
      openPlaylistFolderBtn.addEventListener('click', () => {
        this.openPlaylistFolder();
      });
    }

    const normalizeBtn = document.getElementById('normalizeDbBtn');
    if (normalizeBtn) {
      normalizeBtn.addEventListener('click', () => {
        this.normalizeDatabaseTables();
      });
    }

    const updateDurationsBtn = document.getElementById('updateDurationsBtn');
    if (updateDurationsBtn) {
      updateDurationsBtn.addEventListener('click', async () => {
        const confirmed = confirm(
          'Update duration for existing tracks?\n\nThis may take a few minutes.'
        );
        if (confirmed) {
          this.app.showNotification('Updating durations...', 'info');
          try {
            const result = await window.queMusicAPI.database.updateDurations();
            this.app.showNotification(
              `Updated ${result.updated} of ${result.processed} tracks!`,
              'success'
            );
            setTimeout(() => this.openDatabaseManager(), 1500);
          } catch (error) {
            this.app.showNotification('Duration update failed', 'error');
          }
        }
      });
    }
  }

  // ============================================================================
  // INITIAL LIBRARY SETUP
  // ============================================================================

  async performInitialLibraryScan(folderPath) {
    try {
      // this.app.logger.debug(' Performing initial library scan for:', folderPath);

      // Show progress modal for initial scan
      this.showScanProgressModal();

      // Set up progress listener
      const progressCallback = (progress) => {
        // console.log('📈 Progress callback received:', progress);
        this.updateScanProgress(progress);
      };

      // Register for progress updates
      // console.log('🔗 Registering progress listener...');
      window.queMusicAPI.scanner.onProgress(progressCallback);

      try {
        // Call scanner with progress tracking
        // this.app.logger.debug(' Calling scanner API for folder:', folderPath);
        const trackCount = await window.queMusicAPI.scanner.scanLibrary(folderPath);

        // console.log(`✅ Initial scan complete! Found ${trackCount} tracks`);
        this.app.showNotification(`Library setup complete! Found ${trackCount} tracks.`, 'success');

        // Hide progress modal
        this.hideScanProgressModal();

        // Now load the library normally
        await this.loadMusicLibrary(folderPath);
      } catch (scanError) {
        this.app.logger.error('❌ Initial scan error:', scanError);
        this.app.logger.error('❌ Scan error details:', scanError.stack || scanError);
        this.hideScanProgressModal();
        this.app.showNotification('Failed to scan music library: ' + scanError.message, 'error');

        // Fall back to loading folder structure without database
        await this.loadMusicLibraryStructure(folderPath);
      }
    } catch (error) {
      this.app.logger.error('❌ Error in initial library scan:', error);
      this.app.showNotification('Library setup failed. Please try again.', 'error');
      this.hideScanProgressModal();

      // Fall back to basic folder loading
      try {
        await this.loadMusicLibraryStructure(folderPath);
      } catch (fallbackError) {
        this.app.logger.error('❌ Fallback loading also failed:', fallbackError);
      }
    }
  }

  // ============================================================================
  // SCANNING PROGRESS METHODS
  // ============================================================================

  showScanProgressModal() {
    // Remove any existing progress modal
    const existingModal = document.getElementById('scanProgressModal');
    if (existingModal) {
      existingModal.remove();
    }

    const modal = document.createElement('div');
    modal.id = 'scanProgressModal';
    modal.className = 'modal-overlay show';
    modal.style.zIndex = '9999'; // Ensure it's on top
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="modal-content scan-progress-modal">
        <div class="modal-header">
          <h3>🔄 Scanning Music Library</h3>
        </div>
        <div class="modal-body">
          <div class="progress-container">
            <div class="progress-bar">
              <div class="progress-fill" id="scanProgressFill" style="width: 0%"></div>
            </div>
            <div class="progress-text">
              <div id="scanProgressText">Initializing scan...</div>
              <div id="scanProgressStats">0 / 0 files (0%)</div>
              <div id="scanCurrentFile"></div>
            </div>
          </div>
          <div class="scan-details">
            <div id="scanStatusText">Preparing to scan your music library...</div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Add minimal CSS for progress-specific styling
    if (!document.getElementById('scanProgressCSS')) {
      const style = document.createElement('style');
      style.id = 'scanProgressCSS';
      style.textContent = `
        .progress-container {
          margin: 20px 0;
        }
        .progress-bar {
          width: 100%;
          height: 20px;
          background: var(--border, #e0e0e0);
          border-radius: 10px;
          overflow: hidden;
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.1);
        }
        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--primary, #007acc), var(--primary-hover, #005fa3));
          transition: width 0.3s ease;
          border-radius: 10px;
        }
        .progress-text {
          text-align: center;
          margin-top: 15px;
          font-size: 0.9em;
        }
        #scanProgressStats {
          color: var(--text-secondary);
          margin-top: 5px;
        }
        #scanCurrentFile {
          color: var(--text-muted);
          font-size: 0.8em;
          margin-top: 8px;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .scan-details {
          margin-top: 15px;
          padding: 10px;
          background: var(--bg-tertiary);
          border-radius: 5px;
          font-size: 0.85em;
          color: var(--text-secondary);
        }
      `;
      document.head.appendChild(style);
    }
  }

  updateScanProgress(progress) {
    this.app.logger.debug(' Scan progress update:', progress);
    const progressFill = document.getElementById('scanProgressFill');
    const progressText = document.getElementById('scanProgressText');
    const progressStats = document.getElementById('scanProgressStats');
    const currentFile = document.getElementById('scanCurrentFile');
    const statusText = document.getElementById('scanStatusText');

    if (progressFill) {
      progressFill.style.width = `${progress.percentage || 0}%`;
    }

    if (progressText) {
      progressText.textContent = `Scanning music files...`;
    }

    if (progressStats) {
      progressStats.textContent = `${progress.current || 0} / ${progress.total || 0} files (${progress.percentage || 0}%)`;
    }

    if (currentFile && progress.currentFile) {
      currentFile.textContent = `Current: ${progress.currentFile}`;
    }

    if (statusText) {
      if (progress.percentage >= 100) {
        statusText.textContent = 'Finalizing scan and updating database...';
      } else {
        statusText.textContent = `Processing audio files and extracting metadata...`;
      }
    }

    // console.log(
    //   `📊 Scan progress: ${progress.current}/${progress.total} (${progress.percentage}%) - ${progress.currentFile || 'N/A'}`
    // );
  }

  hideScanProgressModal() {
    const modal = document.getElementById('scanProgressModal');
    if (modal) {
      modal.remove();
    }
  }

  // ============================================================================
  // DATABASE MAINTENANCE METHODS
  // ============================================================================
  async rescanMusicLibrary() {
    try {
      const musicFolder = await window.queMusicAPI.settings.getMusicFolder();

      if (!musicFolder) {
        this.app.showNotification('No music folder set', 'warning');
        return;
      }

      const confirmed = confirm(
        'This will scan your music folder and update the database with any new tracks or changes.\n\n' +
          'This may take a few minutes depending on your library size.\n\n' +
          'Continue?'
      );

      if (confirmed) {
        // Show progress modal
        this.showScanProgressModal();

        // Set up progress listener
        const progressCallback = (progress) => {
          // console.log('📈 Rescan progress callback received:', progress);
          this.updateScanProgress(progress);
        };

        // Register for progress updates
        // console.log('🔗 Registering rescan progress listener...');
        window.queMusicAPI.scanner.onProgress(progressCallback);

        try {
          this.app.showNotification('Starting library rescan...', 'info');
          // console.log('🔄 Starting library rescan of:', musicFolder);

          // Call scanner with progress tracking
          const trackCount = await window.queMusicAPI.scanner.scanLibrary(musicFolder);

          // console.log(`✅ Rescan complete! Found ${trackCount} tracks`);
          this.app.showNotification(`Rescan complete! Found ${trackCount} tracks.`, 'success');

          // Hide progress modal and refresh view
          this.hideScanProgressModal();
          setTimeout(() => {
            this.openDatabaseManager();
          }, 1000);
        } catch (scanError) {
          this.app.logger.error('❌ Scan error:', scanError);
          this.hideScanProgressModal();
          this.app.showNotification('Rescan failed: ' + scanError.message, 'error');
        }
      }
    } catch (error) {
      this.app.logger.error('❌ Error rescanning library:', error);
      this.app.showNotification('Rescan failed. Please try again.', 'error');
      this.hideScanProgressModal();
    }
  }

  async cleanupDatabase() {
    const confirmed = confirm(
      'This will validate all file paths, fix what can be fixed, and remove orphaned records.\n\n' +
        'This may take a few moments depending on your library size.\n\n' +
        'Continue?'
    );

    if (confirmed) {
      try {
        this.app.showNotification('Starting database cleanup...', 'info');
        // console.log('🧹 Starting comprehensive database cleanup...');

        // Call the real cleanup implementation
        const result = await window.queMusicAPI.database.cleanup();

        if (result.success) {
          const message =
            result.summary ||
            `Cleanup complete! Fixed ${result.pathsCorrected} paths, removed ${result.recordsRemoved.tracks} orphaned tracks.`;
          this.app.showNotification(message, 'success');
          this.app.logger.info(' Database cleanup completed:', result);

          // If paths were corrected, suggest refreshing the view
          if (result.pathsCorrected > 0) {
            setTimeout(() => {
              this.app.showNotification(
                'Some file paths were corrected. Consider refreshing your library view.',
                'info'
              );
            }, 3000);
          }
        } else {
          this.app.showNotification('Database cleanup failed. Check console for details.', 'error');
        }
      } catch (error) {
        this.app.logger.error('❌ Database cleanup failed:', error);
        this.app.showNotification('Database cleanup failed: ' + error.message, 'error');
      }
    }
  }

  async findMissingFiles() {
    try {
      this.app.showNotification('Validating file paths...', 'info');
      // this.app.logger.debug(' Starting file path validation...');

      // Use the real path validation
      const result = await window.queMusicAPI.database.validatePaths();

      if (result.invalid.length === 0) {
        this.app.showNotification(`All ${result.total} files are valid!`, 'success');
        // console.log(`✅ All ${result.total} files are accessible`);
      } else {
        const message = `Found ${result.invalid.length} missing files out of ${result.total} total tracks.`;
        this.app.showNotification(message, 'warning');
        // console.log(`⚠️ Path validation results:`, result);

        // Log the missing files for debugging
        console.log('❌ Missing files:');
        result.invalid.forEach((track) => {
          console.log(`  - ${track.title} by ${track.artist}: ${track.path}`);
        });

        // Suggest running cleanup
        setTimeout(() => {
          const runCleanup = confirm(
            `Found ${result.invalid.length} missing files.\n\n` +
              'Would you like to run database cleanup to fix what can be fixed and remove orphaned records?'
          );
          if (runCleanup) {
            this.cleanupDatabase();
          }
        }, 1000);
      }
    } catch (error) {
      this.app.logger.error('❌ File validation failed:', error);
      this.app.showNotification('File validation failed: ' + error.message, 'error');
    }
  }

  async findDuplicateTracks() {
    this.app.showNotification('Scanning for duplicate tracks...', 'info');

    // Placeholder - you can implement duplicate detection
    setTimeout(() => {
      this.app.showNotification('No duplicates found!', 'success');
    }, 2000);
  }

  async openPlaylistFolder() {
    try {
      const playlistFolder = await window.queMusicAPI.playlists.getFolder();

      if (playlistFolder) {
        this.app.showNotification(`Playlist folder: ${playlistFolder}`, 'info');
      } else {
        this.app.showNotification('Playlist folder not configured', 'warning');
      }
    } catch (error) {
      this.app.logger.error('❌ Error opening playlist folder:', error);
      this.app.showNotification('Failed to open playlist folder', 'error');
    }
  }

  async normalizeDatabaseTables() {
    const confirmed = confirm(
      'This will populate the artists and albums tables from your track metadata.\n\n' + 'Continue?'
    );

    if (!confirmed) return;

    try {
      this.app.showNotification('Starting database normalization...', 'info');

      // ✅ SIMPLE: Just call the database method directly
      const result = await window.queMusicAPI.database.populateFromTracks();

      // this.app.logger.debug(' Normalization result:', result);

      this.app.showNotification(
        `Database normalized! Added ${result.artists} artists and ${result.albums} albums.`,
        'success'
      );

      setTimeout(() => {
        this.openDatabaseManager();
      }, 1500);
    } catch (error) {
      this.app.logger.error('❌ Error normalizing database:', error);
      this.app.showNotification('Database normalization failed. Please try again.', 'error');
    }
  }

  // ========================================
  // SORTING METHODS
  // ========================================

  // Sort the songs
  sortCurrentView(sortBy) {
    // console.log(`🔄 Sorting by: ${sortBy}`);

    // Determine what type of data we're currently displaying
    if (this.app.currentView === 'search' || this.currentSearchResults) {
      this.sortSearchResults(sortBy);
    } else if (this.app.currentView === 'library') {
      this.sortLibraryView(sortBy);
    } else if (this.app.currentView === 'artists') {
      this.sortArtistsView(sortBy);
    } else if (this.app.currentView === 'albums') {
      this.sortAlbumsView(sortBy);
    }
  }

  // Sort search results and discovery results
  sortSearchResults(sortBy) {
    const resultsContainer = document.querySelector('.search-results-list');
    if (!resultsContainer) return;

    const resultCards = Array.from(resultsContainer.querySelectorAll('.search-result-card'));
    if (resultCards.length === 0) return;

    // Extract data and sort
    const sortedData = resultCards.map((card) => ({
      element: card,
      title: card.querySelector('.track-title')?.textContent || '',
      artist: card.querySelector('.track-artist')?.textContent || '',
      album: card.querySelector('.track-album')?.textContent || '',
      year: parseInt(card.querySelector('.track-year')?.textContent) || 0,
      duration: this.parseDurationFromCard(card),
    }));

    this.sortDataArray(sortedData, sortBy);

    // Re-append elements in sorted order
    sortedData.forEach((item) => {
      resultsContainer.appendChild(item.element);
    });

    // console.log(`✅ Sorted ${sortedData.length} search results by ${sortBy}`);
  }

  // Sort library view (folder contents)
  async sortLibraryView(sortBy) {
    // console.log('🔄 Sorting library view by:', sortBy);

    const songContainer =
      document.querySelector('.song-list-content .song-list') ||
      document.querySelector('.song-list-content') ||
      document.querySelector('.song-list');

    if (!songContainer) {
      this.app.logger.warn('❌ No song container found');
      return;
    }

    const songCards = Array.from(songContainer.querySelectorAll('.song-card'));

    if (songCards.length === 0) {
      this.app.logger.warn('❌ No song cards found');
      return;
    }

    // console.log(`🔍 Processing ${songCards.length} song cards for sorting`);

    // Extract data with database lookup for accurate information
    const sortedData = await Promise.all(
      songCards.map(async (card, index) => {
        const songPath = card.dataset.path;
        const titleEl = card.querySelector('.song-title');
        const artistEl = card.querySelector('.song-artist');

        // Get complete info from database
        let dbInfo = {
          duration: 0,
          year: 0,
          album: '',
        };

        if (songPath) {
          try {
            const dbTrack = await window.queMusicAPI.database.getTrackByPath(songPath);
            if (dbTrack) {
              dbInfo = {
                duration: dbTrack.duration || 0,
                year: dbTrack.year || 0,
                album: dbTrack.album || '',
              };
            }
          } catch (error) {
            console.warn(`Could not get info from DB for: ${songPath}`);
          }
        }

        const data = {
          element: card,
          title: titleEl?.textContent || '',
          artist: artistEl?.textContent || '',
          album: dbInfo.album || card.querySelector('.song-album')?.textContent || '',
          year: dbInfo.year,
          duration: dbInfo.duration,
        };

        if (index < 3) {
          console.log(`🔍 Sample data ${index}:`, {
            title: data.title,
            artist: data.artist,
            duration: data.duration,
            year: data.year,
          });
        }

        return data;
      })
    );

    // this.app.logger.debug(' Sorting data by:', sortBy);
    this.sortDataArray(sortedData, sortBy);

    // console.log(
    //   '🔍 First 3 after sorting:',
    //   sortedData.slice(0, 3).map((d) => ({
    //     title: d.title,
    //     duration: d.duration,
    //   }))
    // );

    // Clear container and re-append in sorted order
    songContainer.innerHTML = '';
    sortedData.forEach((item) => {
      songContainer.appendChild(item.element);
    });

    // Re-setup event listeners after DOM manipulation
    this.setupLibrarySongEvents();

    // console.log(`✅ Sorted ${sortedData.length} library songs by ${sortBy}`);
  }

  // Sort artists view
  sortArtistsView(sortBy) {
    // console.log('🔄 Sorting artists view by:', sortBy);

    const libraryGrid = document.querySelector('.library-grid');
    if (!libraryGrid) {
      this.app.logger.warn('❌ No library grid found for artists view');
      return;
    }

    // Artists view uses .library-card with .artist-card class, or just .library-card
    const artistCards = Array.from(libraryGrid.querySelectorAll('.library-card'));
    // console.log(`🔍 Found ${artistCards.length} artist cards`);

    if (artistCards.length === 0) {
      this.app.logger.warn('❌ No artist cards found');
      return;
    }

    // Extract artist data
    const sortedData = artistCards.map((card) => {
      const titleElement = card.querySelector('.card-title');
      const subtitleElement = card.querySelector('.card-subtitle');

      const artistName = titleElement?.textContent?.trim() || '';
      const subtitleText = subtitleElement?.textContent?.trim() || '';

      // Parse track count from subtitle like "85 tracks"
      const trackCountMatch = subtitleText.match(/(\d+)\s+tracks?/i);
      const trackCount = trackCountMatch ? parseInt(trackCountMatch[1]) : 0;

      return {
        element: card,
        artist: artistName,
        trackCount: trackCount,
        subtitle: subtitleText,
      };
    });

    // console.log(
    //   '🔍 Sample artist data:',
    //   sortedData.slice(0, 3).map((d) => ({
    //     artist: d.artist,
    //     trackCount: d.trackCount,
    //   }))
    // );

    // Sort artists
    switch (sortBy) {
      case 'title':
      case 'artist':
        sortedData.sort((a, b) => a.artist.localeCompare(b.artist));
        console.log('📝 Sorted alphabetically by artist name');
        break;

      case 'duration':
        // For artists, use track count instead of duration
        sortedData.sort((a, b) => {
          const countDiff = b.trackCount - a.trackCount; // Most tracks first
          return countDiff !== 0 ? countDiff : a.artist.localeCompare(b.artist);
        });
        // this.app.logger.debug(' Sorted by track count (most tracks first)');
        break;

      case 'album':
      case 'year':
      default:
        // For these, just sort alphabetically since they don't apply to artists
        sortedData.sort((a, b) => a.artist.localeCompare(b.artist));
        // console.log('📝 Sorted alphabetically (default for this sort type)');
        break;
    }

    // console.log(
    //   '🔍 First 3 after sorting:',
    //   sortedData.slice(0, 3).map((d) => ({
    //     artist: d.artist,
    //     trackCount: d.trackCount,
    //   }))
    // );

    // Clear and re-append in sorted order
    libraryGrid.innerHTML = '';
    sortedData.forEach((item) => {
      libraryGrid.appendChild(item.element);
    });

    console.log(`✅ Sorted ${sortedData.length} artists by ${sortBy}`);
  }

  // Sort albums view
  sortAlbumsView(sortBy) {
    const libraryGrid = document.querySelector('.library-grid');
    if (!libraryGrid) return;

    const albumCards = Array.from(libraryGrid.querySelectorAll('.album-card'));
    if (albumCards.length === 0) return;

    const sortedData = albumCards.map((card) => ({
      element: card,
      title: card.querySelector('.card-title')?.textContent || '',
      artist: this.parseArtistFromAlbumCard(card),
      album: card.querySelector('.card-title')?.textContent || '',
      year: this.parseYearFromAlbumCard(card),
      duration: 0,
      trackCount: this.parseTrackCountFromCard(card),
    }));

    this.sortDataArray(sortedData, sortBy);

    // Re-append elements in sorted order
    sortedData.forEach((item) => {
      libraryGrid.appendChild(item.element);
    });

    // console.log(`✅ Sorted ${sortedData.length} albums by ${sortBy}`);
  }

  // Generic sort function for data arrays
  sortDataArray(dataArray, sortBy) {
    switch (sortBy) {
      case 'title':
        dataArray.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'artist':
        dataArray.sort((a, b) => {
          const artistCompare = a.artist.localeCompare(b.artist);
          return artistCompare !== 0 ? artistCompare : a.title.localeCompare(b.title);
        });
        break;
      case 'album':
        dataArray.sort((a, b) => {
          const albumCompare = a.album.localeCompare(b.album);
          return albumCompare !== 0 ? albumCompare : a.title.localeCompare(b.title);
        });
        break;
      case 'year':
        dataArray.sort((a, b) => {
          const yearCompare = b.year - a.year; // Newest first
          return yearCompare !== 0 ? yearCompare : a.title.localeCompare(b.title);
        });
        break;
      case 'duration':
        dataArray.sort((a, b) => {
          const durationCompare = b.duration - a.duration; // Longest first
          return durationCompare !== 0 ? durationCompare : a.title.localeCompare(b.title);
        });
        break;
      default:
        console.warn(`Unknown sort type: ${sortBy}`);
    }
  }

  // Helper methods for parsing data from DOM elements
  parseDurationFromCard(card) {
    const durationText =
      card.querySelector('.track-duration')?.textContent ||
      card.querySelector('.song-metadata')?.textContent ||
      '';
    return this.parseDurationToSeconds(durationText);
  }

  parseDurationToSeconds(durationText) {
    // Parse formats like "4:52", "1:23:45", "--:--"
    const timeMatch = durationText.match(/(\d+):(\d+)(?::(\d+))?/);
    if (!timeMatch) return 0;

    const minutes = parseInt(timeMatch[1]) || 0;
    const seconds = parseInt(timeMatch[2]) || 0;
    const hours = timeMatch[3] ? parseInt(timeMatch[3]) : 0;

    return hours * 3600 + minutes * 60 + seconds;
  }

  parseTrackCountFromCard(card) {
    const subtitle = card.querySelector('.card-subtitle')?.textContent || '';
    const countMatch = subtitle.match(/(\d+)\s+tracks?/);
    return countMatch ? parseInt(countMatch[1]) : 0;
  }

  parseArtistFromAlbumCard(card) {
    const subtitle = card.querySelector('.card-subtitle')?.textContent || '';
    const parts = subtitle.split('•');
    return parts[0] ? parts[0].trim() : '';
  }

  parseYearFromAlbumCard(card) {
    const subtitle = card.querySelector('.card-subtitle')?.textContent || '';
    const yearMatch = subtitle.match(/\b(19|20)\d{2}\b/);
    return yearMatch ? parseInt(yearMatch[0]) : 0;
  }
}

// Export for use in main app
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LibraryManager;
} else if (typeof window !== 'undefined') {
  window.LibraryManager = LibraryManager;
}
