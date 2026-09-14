// client/scripts/lyrics-ui.js
// UI controller for the Lyrics modal — plain text only, no sync/karaoke
// (see docs/application/lyrics-feature.md). Fetches via window.queMusicAPI.lyrics,
// which checks the DB (embedded tag or prior LRCLIB hit) before ever hitting the network.

class LyricsUI {
  constructor(app) {
    this.app = app;

    this.modal = document.getElementById('lyricsModal');
    this.closeBtn = document.getElementById('closeLyricsModal');
    this.closeFooterBtn = document.getElementById('lyricsClose');
    this.backdrop = document.getElementById('lyricsModalBackdrop');

    this.trackTitleEl = document.getElementById('lyricsTrackTitle');
    this.trackArtistEl = document.getElementById('lyricsTrackArtist');

    this.loadingState = document.getElementById('lyricsLoadingState');
    this.textEl = document.getElementById('lyricsText');
    this.notFoundState = document.getElementById('lyricsNotFoundState');
    this.errorState = document.getElementById('lyricsErrorState');

    this.setupEventListeners();
    this.app.logger.info('Lyrics UI initialized');
  }

  setupEventListeners() {
    this.closeBtn.addEventListener('click', () => this.close());
    this.closeFooterBtn.addEventListener('click', () => this.close());

    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.close();
      }
    });

    const lyricsBtn = document.getElementById('lyricsBtn');
    if (lyricsBtn) {
      lyricsBtn.addEventListener('click', () => this.openForCurrentTrack());
    }
  }

  async openForCurrentTrack() {
    const trackPath = this.app.coreAudio && this.app.coreAudio.currentTrack;

    if (!trackPath) {
      this.app.showNotification('No track currently selected', 'info');
      return;
    }

    this.open();

    // Track info + faded album art backdrop, both already sitting in the player bar
    const currentTitle = document.getElementById('currentTitle');
    const currentArtist = document.getElementById('currentArtist');
    const currentAlbumArt = document.getElementById('currentAlbumArt');

    this.trackTitleEl.textContent = currentTitle ? currentTitle.textContent : 'Unknown Title';
    this.trackArtistEl.textContent = currentArtist ? currentArtist.textContent : 'Unknown Artist';

    if (currentAlbumArt && currentAlbumArt.src && currentAlbumArt.style.display !== 'none') {
      this.backdrop.style.backgroundImage = `url("${currentAlbumArt.src}")`;
    } else {
      this.backdrop.style.backgroundImage = '';
    }

    this.showState('loading');

    try {
      const result = await window.queMusicAPI.lyrics.getForTrack(trackPath);

      if (result.error) {
        this.app.logger.warn('Lyrics fetch returned an error', { error: result.error });
        this.showState('error');
        return;
      }

      if (result.lyrics) {
        this.textEl.textContent = result.lyrics;
        this.showState('text');
      } else {
        this.showState('notFound');
      }
    } catch (error) {
      this.app.logger.error('Error fetching lyrics', error);
      this.showState('error');
    }
  }

  showState(state) {
    this.loadingState.style.display = state === 'loading' ? 'block' : 'none';
    this.textEl.style.display = state === 'text' ? 'block' : 'none';
    this.notFoundState.style.display = state === 'notFound' ? 'block' : 'none';
    this.errorState.style.display = state === 'error' ? 'block' : 'none';
  }

  open() {
    this.modal.style.display = 'flex';
    setTimeout(() => {
      this.modal.classList.add('show');
    }, 10);
  }

  close() {
    this.modal.classList.remove('show');
    setTimeout(() => {
      this.modal.style.display = 'none';
    }, 300); // Match CSS transition duration
  }
}

// Initialize when main app is ready — same pattern as cover-fetcher-ui.js
window.addEventListener('DOMContentLoaded', () => {
  const initLyricsUI = () => {
    if (window.app && window.app.logger) {
      window.app.lyricsUI = new LyricsUI(window.app);
    } else {
      setTimeout(initLyricsUI, 100);
    }
  };
  initLyricsUI();
});
