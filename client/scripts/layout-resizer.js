// client/scripts/layout-resizer.js
// Collapsible sidebar + resizable pane splitters for the 4-column layout
// (nav rail | folder tree | file list | up-next queue).
// See docs/application/layout-redesign.md.

class LayoutResizer {
  constructor(app) {
    this.app = app;

    this.sidebar = document.getElementById('sidebar');
    this.appMain = document.querySelector('.app-main');
    this.dualPane = document.querySelector('.dual-pane-layout');
    this.sidebarToggle = document.getElementById('sidebarToggle');

    // In-memory mirror of what's persisted — updated as the user drags/toggles,
    // written to disk on mouseup/click rather than on every mousemove.
    this.prefs = {
      sidebarCollapsed: false,
      sidebarWidth: null,
      dualPaneLeftWidth: null,
      queuePaneWidth: null,
    };

    this.init();
  }

  async init() {
    await this.loadPrefs();
    this.applyPrefs();
    this.setupToggle();
    this.setupResizer({
      resizer: document.getElementById('sidebarResizer'),
      pane: this.sidebar,
      cssVar: '--sidebar-width',
      varOwner: document.documentElement,
      min: 180,
      max: 400,
      direction: 'grow-right',
      onSave: (px) => (this.prefs.sidebarWidth = px),
    });
    this.setupResizer({
      resizer: document.getElementById('dualPaneResizer'),
      pane: document.getElementById('leftPane'),
      cssVar: '--dual-pane-left-width',
      varOwner: this.dualPane,
      min: 220,
      max: 500,
      direction: 'grow-right',
      onSave: (px) => (this.prefs.dualPaneLeftWidth = px),
    });
    this.setupResizer({
      resizer: document.getElementById('queueResizer'),
      pane: document.getElementById('queuePane'),
      cssVar: '--queue-pane-width',
      varOwner: this.dualPane,
      min: 200,
      max: 450,
      direction: 'grow-left',
      onSave: (px) => (this.prefs.queuePaneWidth = px),
    });
  }

  async loadPrefs() {
    try {
      const saved = await window.queMusicAPI.settings.getLayout();
      if (saved) {
        this.prefs = { ...this.prefs, ...saved };
      }
    } catch (error) {
      this.app.logger?.warn('Could not load layout prefs', error);
    }
  }

  async savePrefs() {
    try {
      await window.queMusicAPI.settings.setLayout(this.prefs);
    } catch (error) {
      this.app.logger?.warn('Could not save layout prefs', error);
    }
  }

  applyPrefs() {
    if (this.prefs.sidebarCollapsed) {
      this.sidebar?.classList.add('collapsed');
      this.appMain?.classList.add('sidebar-collapsed');
      if (this.sidebarToggle) this.sidebarToggle.title = 'Expand sidebar';
    }
    if (this.prefs.sidebarWidth) {
      document.documentElement.style.setProperty('--sidebar-width', `${this.prefs.sidebarWidth}px`);
    }
    if (this.dualPane) {
      if (this.prefs.dualPaneLeftWidth) {
        this.dualPane.style.setProperty('--dual-pane-left-width', `${this.prefs.dualPaneLeftWidth}px`);
      }
      if (this.prefs.queuePaneWidth) {
        this.dualPane.style.setProperty('--queue-pane-width', `${this.prefs.queuePaneWidth}px`);
      }
    }
  }

  setupToggle() {
    if (!this.sidebarToggle || !this.sidebar || !this.appMain) return;

    this.sidebarToggle.addEventListener('click', () => {
      const collapsed = this.sidebar.classList.toggle('collapsed');
      this.appMain.classList.toggle('sidebar-collapsed', collapsed);
      this.sidebarToggle.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
      this.prefs.sidebarCollapsed = collapsed;
      this.savePrefs();
    });
  }

  // Generic drag-to-resize: `direction` is which way the pane grows relative
  // to mouse movement — 'grow-right' for a pane to the left of its handle
  // (sidebar, folder tree), 'grow-left' for a pane to the right of its handle
  // (the queue pane, resized from its left edge per the spec).
  setupResizer({ resizer, pane, cssVar, varOwner, min, max, direction, onSave }) {
    if (!resizer || !pane || !varOwner) return;

    let startX = 0;
    let startWidth = 0;

    const onMouseMove = (e) => {
      const delta = e.clientX - startX;
      const raw = direction === 'grow-left' ? startWidth - delta : startWidth + delta;
      const newWidth = Math.max(min, Math.min(max, raw));
      varOwner.style.setProperty(cssVar, `${newWidth}px`);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      resizer.classList.remove('resizing');

      const finalWidth = parseInt(varOwner.style.getPropertyValue(cssVar), 10);
      if (!Number.isNaN(finalWidth)) {
        onSave(finalWidth);
        this.savePrefs();
      }
    };

    resizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startX = e.clientX;
      startWidth = pane.getBoundingClientRect().width;
      resizer.classList.add('resizing');
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }
}

// Initialize when main app is ready — same pattern as cover-fetcher-ui.js / lyrics-ui.js
window.addEventListener('DOMContentLoaded', () => {
  const initLayoutResizer = () => {
    if (window.app && window.app.logger) {
      window.app.layoutResizer = new LayoutResizer(window.app);
    } else {
      setTimeout(initLayoutResizer, 100);
    }
  };
  initLayoutResizer();
});
