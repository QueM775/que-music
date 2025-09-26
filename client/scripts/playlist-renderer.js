// playlist-renderer.js - Playlist management and UI rendering

class PlaylistRenderer {
  constructor(app) {
    this.app = app;
    this.currentEditingPlaylist = null;
    this.currentContextPlaylist = null;
    this.currentPlaylistData = null;
    this._modalListenersSetup = false;

  }

  // ============================================================================
  // INITIALIZATION METHODS
  // ============================================================================

  async initializePlaylists() {

    await this.initializePlaylistFolder();

    // Only load playlists if we're using the old sidebar layout
    const playlistList = document.getElementById('playlistList');
    if (playlistList) {
      await this.loadPlaylists();
      this.setupPlaylistEventListeners();
    } else {
    }

  }

  async initializePlaylistFolder() {
    try {
      const musicFolder = await window.queMusicAPI.settings.getMusicFolder();

      if (musicFolder) {
        await window.queMusicAPI.playlists.setFolder(musicFolder);
        const playlistFolder = await window.queMusicAPI.playlists.getFolder();
      }
    } catch (error) {
      console.error('❌ Failed to initialize playlist folder:', error);
    }
  }

  // ============================================================================
  // PLAYLIST UI MANAGEMENT
  // ============================================================================

  async loadPlaylists() {
    try {
      const playlistList = document.getElementById('playlistList');
      const loadingElement = document.getElementById('playlistLoading');

      if (!playlistList) {
        return;
      }

      if (loadingElement) {
        loadingElement.style.display = 'block';
      }

      const playlists = await window.queMusicAPI.playlists.getAll();

      if (loadingElement) {
        loadingElement.style.display = 'none';
      }

      // Clear existing items
      const existingItems = playlistList.querySelectorAll('.playlist-item');
      existingItems.forEach((item) => item.remove());
      const emptyStates = playlistList.querySelectorAll('.playlist-empty');
      emptyStates.forEach((item) => item.remove());

      if (playlists.length === 0) {
        const emptyElement = document.createElement('div');
        emptyElement.className = 'playlist-empty';
        emptyElement.innerHTML = `
          <p>No playlists yet</p>
          <small>Click the + button to create your first playlist</small>
        `;
        playlistList.appendChild(emptyElement);
      } else {
        playlists.forEach((playlist) => {
          const playlistElement = this.createPlaylistElement(playlist);
          playlistList.appendChild(playlistElement);
        });
      }

    } catch (error) {
      console.error('❌ Error loading playlists:', error);
      this.showErrorState('Failed to load playlists');
    }
  }

  createPlaylistElement(playlist) {
    const element = document.createElement('div');
    element.className = 'playlist-item';
    element.dataset.playlistId = playlist.id;
    element.innerHTML = `
      <div class="playlist-info">
        <h4>${this.escapeHtml(playlist.name)}</h4>
        <span class="track-count">${playlist.track_count || 0} tracks</span>
      </div>
      <div class="playlist-actions">
        <button class="btn-small play-playlist" title="Play playlist">▶</button>
        <button class="btn-small playlist-menu" title="Playlist options">⋮</button>
      </div>
    `;
    return element;
  }

  async refreshPlaylistsView() {
    await this.loadPlaylists();
  }

  // ============================================================================
  // PLAYLIST SELECTION AND PLAYBACK
  // ============================================================================

  async selectPlaylist(playlistId) {

    try {
      const playlist = await this.loadPlaylistTracks(playlistId);
      if (playlist) {
        this.displayPlaylistTracks(playlist);
        this.currentPlaylistData = playlist;
      }
    } catch (error) {
      console.error('❌ Error selecting playlist:', error);
      this.showErrorState('Failed to load playlist');
    }
  }

  async loadPlaylistTracks(playlistId) {

    try {
      this.showLoadingState('Loading playlist...');

      const playlist = await window.queMusicAPI.playlists.getById(playlistId);

      if (!playlist) {
        throw new Error(`Playlist with ID ${playlistId} not found`);
      }

      console.log(
        `📋 Loaded playlist "${playlist.name}" with ${playlist.tracks?.length || 0} tracks`
      );
      return playlist;
    } catch (error) {
      console.error('❌ Error loading playlist tracks:', error);
      this.showErrorState('Failed to load playlist tracks');
      return null;
    } finally {
      this.hideLoadingState();
    }
  }

  displayPlaylistTracks(playlist) {

    const rightPaneTitle = document.getElementById('rightPaneTitle');
    const rightPaneContent = document.getElementById('rightPaneContent');
    const rightPaneActions = document.getElementById('rightPaneActions');

    if (!rightPaneTitle || !rightPaneContent) {
      console.error('❌ Right pane elements not found');
      return;
    }

    // Update header
    rightPaneTitle.textContent = playlist.name;

    // Update actions
    if (rightPaneActions) {
      rightPaneActions.innerHTML = this.generatePlaylistActionsHTML(playlist);
      this.setupPlaylistActionListeners(playlist);
    }

    // Update content
    if (playlist.tracks && playlist.tracks.length > 0) {
      rightPaneContent.innerHTML = this.generatePlaylistTrackListHTML(playlist.tracks);
      this.setupPlaylistTrackListeners();
    } else {
      rightPaneContent.innerHTML = `
        <div class="empty-pane">
          <div class="empty-pane-icon">📋</div>
          <p>This playlist is empty</p>
          <button class="btn-primary add-tracks-btn">Add Tracks</button>
        </div>
      `;
    }
  }

  generatePlaylistActionsHTML(playlist) {
    return `
      <button class="btn-primary play-all-btn" data-playlist-id="${playlist.id}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z"/>
        </svg>
        Play All
      </button>
      <button class="btn-secondary shuffle-play-btn" data-playlist-id="${playlist.id}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/>
        </svg>
        Shuffle & Play
      </button>
      <button class="btn-secondary playlist-options-btn" data-playlist-id="${playlist.id}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
        </svg>
      </button>
    `;
  }

  generatePlaylistTrackListHTML(tracks) {
    return `
      <div class="track-list playlist-tracks">
        ${tracks
          .map(
            (track, index) => `
          <div class="track-item playlist-track" data-track-index="${index}" data-track-path="${this.escapeHtml(track.path)}">
            <div class="track-info">
              <div class="track-title">${this.escapeHtml(track.title || track.filename)}</div>
              <div class="track-meta">
                ${this.escapeHtml(track.artist || 'Unknown Artist')} • 
                ${this.escapeHtml(track.album || 'Unknown Album')}
                ${track.duration ? ` • ${this.formatDuration(track.duration)}` : ''}
              </div>
            </div>
            <div class="track-actions">
              <button class="btn-small play-track" title="Play track">▶</button>
              <button class="btn-small track-menu" title="Track options">⋮</button>
            </div>
          </div>
        `
          )
          .join('')}
      </div>
    `;
  }

  async playPlaylist(startIndex = 0) {

    if (!this.currentPlaylistData || !this.currentPlaylistData.tracks) {
      console.warn('⚠️ No playlist data available');
      return;
    }

    const tracks = this.currentPlaylistData.tracks;

    if (tracks.length === 0) {
      this.app.showNotification('No tracks in playlist', 'warning');
      return;
    }


    // Clear existing playlist and set up new one from playlist
    this.app.coreAudio.clearPlaylist();
    this.app.coreAudio.playlist = tracks.map((track) => ({
      path: track.path,
      name: this.app.getBasename(track.path),
      title: track.title || track.name,
      artist: track.artist || 'Unknown Artist',
    }));
    this.app.coreAudio.currentTrackIndex = startIndex;

    // Play the first track (match folder view implementation)
    const startTrack = tracks[startIndex];

    this.app.coreAudio.playSong(startTrack.path, false);
    this.app.showNotification(`Playing ${tracks.length} tracks from playlist`, 'success');

    this.updatePlaylistTrackHighlight();
  }

  shuffleAndPlay() {
    if (!this.currentPlaylistData || !this.currentPlaylistData.tracks) {
      console.warn('⚠️ No playlist data available for shuffle');
      return;
    }

    const tracks = [...this.currentPlaylistData.tracks];

    // Fisher-Yates shuffle
    for (let i = tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
    }

    // Note: playPlaylist will handle setting the coreAudio properties
    this.app.coreAudio.shuffle = true;

    this.playPlaylist(0);
  }

  updatePlaylistTrackHighlight() {
    const trackItems = document.querySelectorAll('.playlist-track');
    trackItems.forEach((item) => {
      item.classList.remove('playing', 'selected');
    });

    if (this.app.coreAudio.currentTrackIndex >= 0) {
      const currentTrackItem = document.querySelector(
        `.playlist-track[data-track-index="${this.app.coreAudio.currentTrackIndex}"]`
      );
      if (currentTrackItem) {
        if (this.app.coreAudio.isPlaying) {
          currentTrackItem.classList.add('playing');
        } else {
          currentTrackItem.classList.add('selected');
        }
      }
    }
  }

  async removeTrackFromCurrentPlaylist(trackIndex) {
    if (!this.currentPlaylistData) {
      console.warn('⚠️ No current playlist to remove track from');
      return;
    }

    try {
      const track = this.currentPlaylistData.tracks[trackIndex];
      if (!track) {
        console.warn('⚠️ Track not found at index', trackIndex);
        return;
      }

      await window.queMusicAPI.playlists.removeTrack(this.currentPlaylistData.id, track.id);

      // Reload the playlist to show updated tracks
      await this.selectPlaylist(this.currentPlaylistData.id);

      this.app.showNotification('Track removed from playlist', 'success');
    } catch (error) {
      console.error('❌ Error removing track:', error);
      this.app.showNotification('Failed to remove track', 'error');
    }
  }

  selectPlaylistTrack(trackIndex) {
    const trackItems = document.querySelectorAll('.playlist-track');
    trackItems.forEach((item) => item.classList.remove('selected'));

    const selectedTrack = document.querySelector(
      `.playlist-track[data-track-index="${trackIndex}"]`
    );
    if (selectedTrack) {
      selectedTrack.classList.add('selected');
    }
  }

  async updateNowPlayingInfo(track) {
    // Update any now playing displays with current track info
    console.log('🎵 Now playing:', track.title || track.filename);
  }

  // ============================================================================
  // PLAYLIST MODAL MANAGEMENT
  // ============================================================================

  showPlaylistModal(playlist = null) {
    console.log('📋 Opening playlist modal...');

    const modal = document.getElementById('playlistModal');

    if (!modal) {
      console.warn('⚠️ Modal not found, creating emergency modal');
      this.createEmergencyModal(playlist);
      return;
    }

    this.currentEditingPlaylist = playlist;

    // Update modal title and fields
    const modalTitle = document.getElementById('modalTitle');
    const nameInput = document.getElementById('playlistName');
    const descInput = document.getElementById('playlistDescription');

    if (playlist) {
      modalTitle.textContent = 'Edit Playlist';
      nameInput.value = playlist.name || '';
      descInput.value = playlist.description || '';
    } else {
      modalTitle.textContent = 'Create New Playlist';
      nameInput.value = '';
      descInput.value = '';
    }

    // Set up event listeners
    this.setupModalEventListeners();

    // Show modal
    modal.style.display = 'flex';
    modal.classList.add('show');

    // Focus name input after CSS transition completes
    setTimeout(() => {
      try {
        nameInput.focus();
        nameInput.select();
        console.log('✅ Input focused and selected');
      } catch (error) {
        console.error('❌ Error focusing input:', error);
      }
    }, 350); // Wait for CSS transition
  }

  // Show playlist modal with a specific track to be added
  async showPlaylistModalWithTrack(track) {
    console.log('📋 Opening playlist modal with track to add:', track);

    // Store the track to be added after playlist creation
    this.trackToAddAfterCreation = track;

    // Show the modal normally (for creating a new playlist)
    this.showPlaylistModal();

    // Note: The track will be added to the playlist in savePlaylistFromModal
  }

  createEmergencyModal(playlist = null) {
    console.log('📋 Creating emergency modal...');

    // Remove any existing emergency modal
    const existingModal = document.getElementById('emergencyPlaylistModal');
    if (existingModal) {
      existingModal.remove();
    }

    const isEdit = playlist !== null;

    const modalHTML = `
      <div id="emergencyPlaylistModal" class="modal-overlay" style="display: flex; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 10000; align-items: center; justify-content: center;">
        <div class="modal-content" style="background: var(--bg-secondary, #2a2a2a); padding: 2rem; border-radius: 8px; width: 90%; max-width: 500px; color: var(--text-primary, #fff);">
          <h2>${isEdit ? 'Edit Playlist' : 'Create New Playlist'}</h2>
          <form id="emergencyPlaylistForm">
            <div class="form-group" style="margin-bottom: 1rem;">
              <label for="emergencyPlaylistName">Name:</label>
              <input type="text" id="emergencyPlaylistName" value="${isEdit ? this.escapeHtml(playlist.name) : ''}" style="width: 100%; padding: 0.5rem; margin-top: 0.5rem; border: 1px solid #444; background: var(--bg-primary, #1a1a1a); color: var(--text-primary, #fff); border-radius: 4px;" required>
            </div>
            <div class="form-group" style="margin-bottom: 1rem;">
              <label for="emergencyPlaylistDesc">Description:</label>
              <textarea id="emergencyPlaylistDesc" style="width: 100%; padding: 0.5rem; margin-top: 0.5rem; border: 1px solid #444; background: var(--bg-primary, #1a1a1a); color: var(--text-primary, #fff); border-radius: 4px; min-height: 80px;">${isEdit ? this.escapeHtml(playlist.description || '') : ''}</textarea>
            </div>
            <div class="modal-actions" style="display: flex; gap: 1rem; justify-content: flex-end;">
              <button type="button" id="emergencyCancel" style="padding: 0.5rem 1rem; background: transparent; border: 1px solid #666; color: var(--text-primary, #fff); border-radius: 4px; cursor: pointer;">Cancel</button>
              <button type="submit" id="emergencySave" style="padding: 0.5rem 1rem; background: var(--accent-color, #007acc); border: none; color: white; border-radius: 4px; cursor: pointer;">${isEdit ? 'Save Changes' : 'Create Playlist'}</button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const modal = document.getElementById('emergencyPlaylistModal');
    const form = document.getElementById('emergencyPlaylistForm');
    const nameInput = document.getElementById('emergencyPlaylistName');
    const cancelBtn = document.getElementById('emergencyCancel');
    const saveBtn = document.getElementById('emergencySave');

    // Event listeners
    cancelBtn.addEventListener('click', () => modal.remove());

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name = nameInput.value.trim();
      if (!name) {
        nameInput.focus();
        return;
      }

      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';

      try {
        const playlistData = {
          name: name,
          description: document.getElementById('emergencyPlaylistDesc').value.trim(),
        };

        let newPlaylist = null;
        if (isEdit) {
          playlistData.id = playlist.id;
          newPlaylist = await window.queMusicAPI.playlists.update(playlistData);
        } else {
          newPlaylist = await window.queMusicAPI.playlists.create(playlistData);

          // If we have a track to add after creation (from right-click context menu)
          if (this.trackToAddAfterCreation && newPlaylist && newPlaylist.id) {
            try {
              console.log('📋 Adding track to newly created emergency playlist:', this.trackToAddAfterCreation);

              // Get track ID from the database using the path
              const dbTrack = await window.queMusicAPI.database.getTrackByPath(this.trackToAddAfterCreation.path);
              if (dbTrack && dbTrack.id) {
                await window.queMusicAPI.playlists.addTrack(newPlaylist.id, dbTrack.id);
                this.app.showNotification(`Added "${this.trackToAddAfterCreation.title || this.trackToAddAfterCreation.name}" to playlist`, 'success');
              } else {
                console.warn('⚠️ Could not find track in database:', this.trackToAddAfterCreation.path);
              }
            } catch (error) {
              console.error('❌ Error adding track to new emergency playlist:', error);
            }

            // Clear the track to add
            this.trackToAddAfterCreation = null;
          }
        }

        modal.remove();

        // Refresh both old sidebar and new dual-pane layout
        await this.refreshPlaylistsView();

        // Also refresh the UI controller's playlist view for dual-pane layout
        if (this.app.uiController && this.app.uiController.switchView) {
          await this.app.uiController.switchView('playlists');
        }

        this.app.showNotification(`Playlist ${isEdit ? 'updated' : 'created'}`, 'success');
      } catch (error) {
        console.error('❌ Error saving playlist:', error);
        this.app.showNotification('Failed to save playlist', 'error');
        saveBtn.disabled = false;
        saveBtn.textContent = isEdit ? 'Save Changes' : 'Create Playlist';
      }
    });

    // Focus name input after modal is rendered
    setTimeout(() => {
      try {
        nameInput.focus();
        nameInput.select();
        console.log('✅ Emergency modal input focused and selected');
      } catch (error) {
        console.error('❌ Error focusing emergency modal input:', error);
      }
    }, 100);
  }

  setupModalEventListeners() {
    if (this._modalListenersSetup) return;

    const modal = document.getElementById('playlistModal');
    const closeModal = document.getElementById('closeModal');
    const cancelPlaylist = document.getElementById('cancelPlaylist');
    const savePlaylist = document.getElementById('savePlaylist');

    if (!modal) return;

    // Close modal events
    if (closeModal) {
      closeModal.addEventListener('click', () => this.hidePlaylistModal());
    }

    if (cancelPlaylist) {
      cancelPlaylist.addEventListener('click', () => this.hidePlaylistModal());
    }

    // Save playlist event
    if (savePlaylist) {
      savePlaylist.addEventListener('click', () => this.savePlaylistFromModal());
    }

    // Click outside to close
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.hidePlaylistModal();
      }
    });

    // Escape key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
        this.hidePlaylistModal();
      }
    });

    this._modalListenersSetup = true;
  }

  hidePlaylistModal() {
    const modal = document.getElementById('playlistModal');
    if (modal) {
      modal.style.display = 'none';
      modal.classList.remove('show');
    }

    this.currentEditingPlaylist = null;
  }

  validatePlaylistForm() {
    const nameInput = document.getElementById('playlistName');
    return nameInput && nameInput.value.trim().length > 0;
  }

  async savePlaylistFromModal() {
    if (!this.validatePlaylistForm()) {
      this.app.showNotification('Please enter a playlist name', 'warning');
      return;
    }

    const nameInput = document.getElementById('playlistName');
    const descInput = document.getElementById('playlistDescription');
    const saveBtn = document.getElementById('savePlaylist');

    try {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';

      const playlistData = {
        name: nameInput.value.trim(),
        description: descInput.value.trim(),
      };

      let newPlaylist = null;
      if (this.currentEditingPlaylist) {
        playlistData.id = this.currentEditingPlaylist.id;
        newPlaylist = await window.queMusicAPI.playlists.update(playlistData);
        this.app.showNotification('Playlist updated', 'success');
      } else {
        newPlaylist = await window.queMusicAPI.playlists.create(playlistData);
        this.app.showNotification('Playlist created', 'success');

        // If we have a track to add after creation (from right-click context menu)
        if (this.trackToAddAfterCreation && newPlaylist && newPlaylist.id) {
          try {
            console.log('📋 Adding track to newly created playlist:', this.trackToAddAfterCreation);

            // Get track ID from the database using the path
            const dbTrack = await window.queMusicAPI.database.getTrackByPath(this.trackToAddAfterCreation.path);
            if (dbTrack && dbTrack.id) {
              await window.queMusicAPI.playlists.addTrack(newPlaylist.id, dbTrack.id);
              this.app.showNotification(`Added "${this.trackToAddAfterCreation.title || this.trackToAddAfterCreation.name}" to playlist`, 'success');
            } else {
              console.warn('⚠️ Could not find track in database:', this.trackToAddAfterCreation.path);
              this.app.showNotification('Playlist created but could not add the selected track', 'warning');
            }
          } catch (error) {
            console.error('❌ Error adding track to new playlist:', error);
            this.app.showNotification('Playlist created but could not add the selected track', 'warning');
          }

          // Clear the track to add
          this.trackToAddAfterCreation = null;
        }
      }

      this.hidePlaylistModal();

      // Refresh both old sidebar and new dual-pane layout
      await this.refreshPlaylistsView();

      // Also refresh the UI controller's playlist view for dual-pane layout
      if (this.app.uiController && this.app.uiController.switchView) {
        await this.app.uiController.switchView('playlists');
      }
    } catch (error) {
      console.error('❌ Error saving playlist:', error);
      this.app.showNotification('Failed to save playlist', 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = this.currentEditingPlaylist ? 'Save Changes' : 'Create Playlist';
    }
  }

  // ============================================================================
  // CONTEXT MENU MANAGEMENT
  // ============================================================================

  showPlaylistContextMenu(event, playlist) {
    event.preventDefault();
    event.stopPropagation();

    this.currentContextPlaylist = playlist;
    this.hidePlaylistContextMenu();

    const contextMenu = this.createPlaylistContextMenu(playlist);
    document.body.appendChild(contextMenu);

    this.positionContextMenu(contextMenu, event.clientX, event.clientY);
    this.setupPlaylistContextMenuListeners(contextMenu, playlist);

    // Global click listener to close menu
    setTimeout(() => {
      document.addEventListener('click', this.hidePlaylistContextMenu.bind(this), { once: true });
    }, 0);
  }

  createPlaylistContextMenu(playlist) {
    const menu = document.createElement('div');
    menu.id = 'playlistContextMenu';
    menu.className = 'playlist-context-menu';
    menu.innerHTML = `
      <div class="context-item" data-action="play">
        <span class="context-icon">▶</span>
        Play
      </div>
      <div class="context-item" data-action="shuffle">
        <span class="context-icon">🔀</span>
        Shuffle & Play
      </div>
      <div class="context-separator"></div>
      <div class="context-item" data-action="edit">
        <span class="context-icon">✏️</span>
        Edit
      </div>
      <div class="context-item" data-action="duplicate">
        <span class="context-icon">📋</span>
        Duplicate
      </div>
      <div class="context-item" data-action="export">
        <span class="context-icon">💾</span>
        Export to M3U
      </div>
      <div class="context-separator"></div>
      <div class="context-item" data-action="clear">
        <span class="context-icon">🗑️</span>
        Clear Tracks
      </div>
      <div class="context-item danger" data-action="delete">
        <span class="context-icon">❌</span>
        Delete Playlist
      </div>
    `;

    return menu;
  }

  setupPlaylistContextMenuListeners(contextMenu, playlist) {
    const items = contextMenu.querySelectorAll('.context-item');

    items.forEach((item) => {
      item.addEventListener('click', async (e) => {
        e.stopPropagation();
        const action = item.dataset.action;

        this.hidePlaylistContextMenu();

        switch (action) {
          case 'play':
            await this.playCurrentPlaylist();
            break;
          case 'shuffle':
            await this.shuffleAndPlayCurrentPlaylist();
            break;
          case 'edit':
            this.editCurrentPlaylist();
            break;
          case 'duplicate':
            await this.duplicateCurrentPlaylist();
            break;
          case 'export':
            await this.exportPlaylistToM3U(playlist.id);
            break;
          case 'clear':
            await this.clearCurrentPlaylist();
            break;
          case 'delete':
            await this.deleteCurrentPlaylist();
            break;
        }
      });
    });
  }

  positionContextMenu(menu, x, y) {
    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let posX = x;
    let posY = y;

    if (x + rect.width > viewportWidth) {
      posX = x - rect.width;
    }

    if (y + rect.height > viewportHeight) {
      posY = y - rect.height;
    }

    menu.style.left = `${Math.max(0, posX)}px`;
    menu.style.top = `${Math.max(0, posY)}px`;
  }

  hidePlaylistContextMenu() {
    const existingMenu = document.getElementById('playlistContextMenu');
    if (existingMenu) {
      existingMenu.remove();
    }
  }

  // ============================================================================
  // CONTEXT MENU ACTIONS
  // ============================================================================

  async playCurrentPlaylist() {
    if (!this.currentContextPlaylist) return;

    await this.selectPlaylist(this.currentContextPlaylist.id);
    await this.playPlaylist(0);
  }

  async shuffleAndPlayCurrentPlaylist() {
    if (!this.currentContextPlaylist) return;

    await this.selectPlaylist(this.currentContextPlaylist.id);
    this.shuffleAndPlay();
  }

  editCurrentPlaylist() {
    if (!this.currentContextPlaylist) return;

    this.showPlaylistModal(this.currentContextPlaylist);
  }

  async duplicateCurrentPlaylist() {
    if (!this.currentContextPlaylist) return;

    try {
      const originalPlaylist = await this.loadPlaylistTracks(this.currentContextPlaylist.id);

      if (!originalPlaylist) {
        throw new Error('Failed to load original playlist');
      }

      const newPlaylistData = {
        name: `${originalPlaylist.name} (Copy)`,
        description: originalPlaylist.description || '',
      };

      const newPlaylist = await window.queMusicAPI.playlists.create(newPlaylistData);

      // Add all tracks from original playlist
      if (originalPlaylist.tracks && originalPlaylist.tracks.length > 0) {
        for (const track of originalPlaylist.tracks) {
          await window.queMusicAPI.playlists.addTrack(newPlaylist.id, track.id);
        }
      }

      // Refresh both old sidebar and new dual-pane layout
      await this.refreshPlaylistsView();

      // Also refresh the UI controller's playlist view for dual-pane layout
      if (this.app.uiController && this.app.uiController.switchView) {
        await this.app.uiController.switchView('playlists');
      }

      this.app.showNotification(`Duplicated playlist: ${newPlaylist.name}`, 'success');
    } catch (error) {
      console.error('❌ Error duplicating playlist:', error);
      this.app.showNotification('Failed to duplicate playlist', 'error');
    }
  }

  async clearCurrentPlaylist() {
    if (!this.currentContextPlaylist) return;

    if (!confirm(`Clear all tracks from "${this.currentContextPlaylist.name}"?`)) {
      return;
    }

    try {
      const playlist = await this.loadPlaylistTracks(this.currentContextPlaylist.id);

      if (playlist && playlist.tracks) {
        for (const track of playlist.tracks) {
          await window.queMusicAPI.playlists.removeTrack(playlist.id, track.id);
        }
      }

      // Refresh both old sidebar and new dual-pane layout
      await this.refreshPlaylistsView();

      // Also refresh the UI controller's playlist view for dual-pane layout
      if (this.app.uiController && this.app.uiController.switchView) {
        await this.app.uiController.switchView('playlists');
      }

      this.app.showNotification('Playlist cleared', 'success');
    } catch (error) {
      console.error('❌ Error clearing playlist:', error);
      this.app.showNotification('Failed to clear playlist', 'error');
    }
  }

  async deleteCurrentPlaylist() {
    if (!this.currentContextPlaylist) return;

    if (!confirm(`Delete playlist "${this.currentContextPlaylist.name}"? This cannot be undone.`)) {
      return;
    }

    try {
      await window.queMusicAPI.playlists.delete(this.currentContextPlaylist.id);

      // Refresh both old sidebar and new dual-pane layout
      await this.refreshPlaylistsView();

      // Also refresh the UI controller's playlist view for dual-pane layout
      if (this.app.uiController && this.app.uiController.switchView) {
        // Refresh the current playlists view
        await this.app.uiController.switchView('playlists');
      }

      this.app.showNotification('Playlist deleted', 'success');

      // Clear right pane if this playlist was selected
      if (
        this.currentPlaylistData &&
        this.currentPlaylistData.id === this.currentContextPlaylist.id
      ) {
        const rightPaneContent = document.getElementById('rightPaneContent');
        const rightPaneTitle = document.getElementById('rightPaneTitle');

        if (rightPaneTitle) {
          rightPaneTitle.textContent = 'Select a playlist';
        }

        if (rightPaneContent) {
          rightPaneContent.innerHTML = `
            <div class="empty-pane">
              <div class="empty-pane-icon">📋</div>
              <p>Select a playlist to view its tracks</p>
            </div>
          `;
        }

        this.currentPlaylistData = null;
      }
    } catch (error) {
      console.error('❌ Error deleting playlist:', error);
      this.app.showNotification('Failed to delete playlist', 'error');
    }
  }

  // ============================================================================
  // TRACK CONTEXT MENU MANAGEMENT
  // ============================================================================

  extractTrackDataFromItem(item) {
    // Extract track data from the playlist item element
    const trackId = item.dataset.trackId;
    const titleElement = item.querySelector('.track-title');
    const artistElement = item.querySelector('.track-artist');
    const albumElement = item.querySelector('.track-album');
    
    return {
      id: trackId,
      title: titleElement ? titleElement.textContent : '',
      artist: artistElement ? artistElement.textContent : '',
      album: albumElement ? albumElement.textContent : ''
    };
  }

  showTrackContextMenu(event, trackData, trackElement) {
    event.preventDefault();
    event.stopPropagation();

    this.currentContextTrack = trackData;
    this.currentContextTrackElement = trackElement;
    this.hideTrackContextMenu();

    const contextMenu = this.createTrackContextMenu(trackData);
    document.body.appendChild(contextMenu);

    this.positionContextMenu(contextMenu, event.clientX, event.clientY);
    this.setupTrackContextMenuListeners(contextMenu, trackData, trackElement);

    // Global click listener to close menu
    setTimeout(() => {
      document.addEventListener('click', this.hideTrackContextMenu.bind(this), { once: true });
    }, 0);
  }

  createTrackContextMenu(trackData) {
    const menu = document.createElement('div');
    menu.id = 'trackContextMenu';
    menu.className = 'track-context-menu';
    menu.innerHTML = `
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

    return menu;
  }

  setupTrackContextMenuListeners(contextMenu, trackData, trackElement) {
    const items = contextMenu.querySelectorAll('.context-item');

    items.forEach((item) => {
      item.addEventListener('click', async (e) => {
        e.stopPropagation();
        const action = item.dataset.action;

        this.hideTrackContextMenu();

        switch (action) {
          case 'play':
            await this.playTrackFromPlaylist(trackData, trackElement);
            break;
          case 'remove':
            await this.removeTrackFromCurrentPlaylist(trackData, trackElement);
            break;
        }
      });
    });
  }

  hideTrackContextMenu() {
    const existingMenu = document.getElementById('trackContextMenu');
    if (existingMenu) {
      existingMenu.remove();
    }
  }

  async playTrackFromPlaylist(trackData, trackElement) {
    // Find the index of this track in the current playlist
    const trackItems = Array.from(trackElement.parentElement.children);
    const trackIndex = trackItems.indexOf(trackElement);
    
    if (trackIndex !== -1) {
      await this.playPlaylist(trackIndex);
    }
  }

  async removeTrackFromCurrentPlaylist(trackData, trackElement) {
    console.log('🗑️ removeTrackFromCurrentPlaylist called with:', trackData);
    console.log('🗑️ currentPlaylistData exists:', !!this.currentPlaylistData);
    console.log('🗑️ trackData.id:', trackData.id);
    
    if (!this.currentPlaylistData || !trackData.id) {
      console.error('❌ Cannot remove track: missing playlist data or track ID');
      return;
    }

    try {
      // Remove from database
      await window.queMusicAPI.playlists.removeTrack(this.currentPlaylistData.id, trackData.id);
      
      // Remove from UI
      trackElement.remove();
      
      // Update track count in the header
      await this.updatePlaylistTrackCount();
      
      this.app.showNotification(`Removed "${trackData.title}" from playlist`, 'success');
      
      console.log(`🗑️ Removed track "${trackData.title}" from playlist "${this.currentPlaylistData.name}"`);
      
    } catch (error) {
      console.error('❌ Error removing track from playlist:', error);
      this.app.showNotification('Failed to remove track from playlist', 'error');
    }
  }

  async updatePlaylistTrackCount() {
    if (!this.currentPlaylistData) return;
    
    try {
      // Get updated playlist data
      const updatedPlaylist = await window.queMusicAPI.playlists.getById(this.currentPlaylistData.id);
      if (updatedPlaylist) {
        this.currentPlaylistData = updatedPlaylist;
        
        // Update the track count display in the right pane
        const trackCountElement = document.querySelector('.playlist-info .track-count');
        if (trackCountElement) {
          const trackCount = updatedPlaylist.trackCount || 0;
          trackCountElement.textContent = `${trackCount} track${trackCount !== 1 ? 's' : ''}`;
        }
      }
    } catch (error) {
      console.error('❌ Error updating playlist track count:', error);
    }
  }

  // ============================================================================
  // EVENT LISTENERS SETUP
  // ============================================================================

  setupPlaylistEventListeners() {
    // Playlist creation button
    const createPlaylistBtn = document.getElementById('createPlaylistBtn');
    if (createPlaylistBtn) {
      createPlaylistBtn.addEventListener('click', () => this.showPlaylistModal());
    }
  }

  setupPlaylistActionListeners(playlist) {
    // Play All button
    const playAllBtn = document.querySelector('.play-all-btn');
    console.log('🔧 DEBUG: Play All button found:', !!playAllBtn);
    if (playAllBtn) {
      playAllBtn.addEventListener('click', () => {
        console.log('🔧 DEBUG: Play All button clicked!');
        this.playPlaylist(0);
      });
    }

    // Shuffle & Play button
    const shufflePlayBtn = document.querySelector('.shuffle-play-btn');
    if (shufflePlayBtn) {
      shufflePlayBtn.addEventListener('click', () => this.shuffleAndPlay());
    }

    // Playlist options button
    const optionsBtn = document.querySelector('.playlist-options-btn');
    if (optionsBtn) {
      optionsBtn.addEventListener('click', (e) => {
        this.showPlaylistContextMenu(e, playlist);
      });
    }
  }

  setupPlaylistTrackListeners() {
    const trackItems = document.querySelectorAll('.playlist-track');

    trackItems.forEach((item, index) => {
      // Double-click to play
      item.addEventListener('dblclick', () => {
        this.playPlaylist(index);
      });

      // Single click to select
      item.addEventListener('click', () => {
        this.selectPlaylistTrack(index);
      });

      // Right-click context menu
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const trackData = this.extractTrackDataFromItem(item);
        this.showTrackContextMenu(e, trackData, item);
      });

      // Play button
      const playBtn = item.querySelector('.play-track');
      if (playBtn) {
        playBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.playPlaylist(index);
        });
      }

      // Track menu button
      const menuBtn = item.querySelector('.track-menu');
      if (menuBtn) {
        menuBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const trackData = this.extractTrackDataFromItem(item);
          this.showTrackContextMenu(e, trackData, item);
        });
      }
    });
  }

  // ============================================================================
  // M3U EXPORT
  // ============================================================================

  async exportPlaylistToM3U(playlistId) {
    try {
      await window.queMusicAPI.playlists.exportM3U(playlistId);
      this.updatePlaylistStatus('Playlist exported to M3U file', 'success');
    } catch (error) {
      console.error('❌ Error exporting playlist:', error);
      this.updatePlaylistStatus('Failed to export playlist', 'error');
    }
  }

  // ============================================================================
  // INTEGRATION METHODS
  // ============================================================================

  async addTrackToPlaylistFromContext(playlistId, trackData) {
    try {
      console.log(`📋 Adding track to playlist ${playlistId}:`, trackData);

      // Get track ID by path first
      const track = await window.queMusicAPI.database.getTrackByPath(trackData.path);

      if (!track) {
        throw new Error('Track not found in database');
      }

      await window.queMusicAPI.playlists.addTrack(playlistId, track.id);
      this.app.showNotification('Track added to playlist', 'success');

      // Refresh current playlist view if it's the same playlist
      if (this.currentPlaylistData && this.currentPlaylistData.id === playlistId) {
        await this.selectPlaylist(playlistId);
      }
    } catch (error) {
      console.error('❌ Error adding track to playlist:', error);
      this.app.showNotification('Failed to add track to playlist', 'error');
    }
  }

  async onMusicFolderChanged(newMusicFolder) {
    console.log('📋 Music folder changed, reinitializing playlists...');
    await this.initializePlaylistFolder();
    await this.refreshPlaylistsView();
  }

  async checkPlaylistBackupStatus() {
    try {
      const playlistFolder = await window.queMusicAPI.playlists.getFolder();
      if (playlistFolder) {
        console.log('📁 Playlist backup folder:', playlistFolder);
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ Error checking playlist backup status:', error);
      return false;
    }
  }

  async showPlaylistFolder() {
    try {
      const playlistFolder = await window.queMusicAPI.playlists.getFolder();
      if (playlistFolder) {
        // This would require additional IPC to show folder in file explorer
        this.app.showNotification(`Playlist folder: ${playlistFolder}`, 'info');
      }
    } catch (error) {
      console.error('❌ Error showing playlist folder:', error);
    }
  }

  // ============================================================================
  // UI STATE MANAGEMENT
  // ============================================================================

  updateViewHeader(title, subtitle) {
    const rightPaneTitle = document.getElementById('rightPaneTitle');
    if (rightPaneTitle) {
      rightPaneTitle.textContent = title;
    }
  }

  showLoadingState(message = 'Loading...') {
    const rightPaneContent = document.getElementById('rightPaneContent');
    if (rightPaneContent) {
      rightPaneContent.innerHTML = `
        <div class="loading-state">
          <div class="spinner"></div>
          <p>${message}</p>
        </div>
      `;
    }
  }

  hideLoadingState() {
    // Loading state is automatically replaced when content is updated
  }

  showErrorState(message = 'An error occurred') {
    const rightPaneContent = document.getElementById('rightPaneContent');
    if (rightPaneContent) {
      rightPaneContent.innerHTML = `
        <div class="error-state">
          <div class="error-icon">⚠️</div>
          <p>${message}</p>
          <button class="btn-secondary retry-btn">Retry</button>
        </div>
      `;

      const retryBtn = rightPaneContent.querySelector('.retry-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => {
          if (this.currentPlaylistData) {
            this.selectPlaylist(this.currentPlaylistData.id);
          }
        });
      }
    }
  }

  updatePlaylistStatus(message, type = 'info') {
    console.log(`📋 ${message}`);
    this.app.showNotification(message, type);
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  formatDuration(seconds) {
    if (isNaN(seconds) || seconds < 0) return '';

    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  escapeHtml(text) {
    if (!text) return '';

    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Development methods (remove in production)
  debugModalStructure() {
    const modal = document.getElementById('playlistModal');
    console.log('🔍 Modal debug:', {
      exists: !!modal,
      display: modal?.style.display,
      classes: modal?.className,
      children: modal?.children.length,
    });
  }

  testShowModal() {
    console.log('🧪 Testing modal show...');
    this.showPlaylistModal();
  }
}

// Export for use in main window
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PlaylistRenderer;
} else if (typeof window !== 'undefined') {
  window.PlaylistRenderer = PlaylistRenderer;
}
