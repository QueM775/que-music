// client/scripts/window-controls.js - Window control button management

/**
 * Window Controls Handler
 * Manages minimize, maximize, and close button functionality
 */
class WindowControls {
  constructor() {
    this.initialized = false;
    console.log('🪟 WindowControls class created');
  }

  /**
   * Initialize window control event listeners
   */
  async init() {
    if (this.initialized) {
      console.warn('⚠️ Window controls already initialized');
      return;
    }

    try {
      // Wait for DOM to be ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.setupControls());
      } else {
        await this.setupControls();
      }

      this.initialized = true;
      console.log('✅ Window controls initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize window controls:', error);
    }
  }

  /**
   * Setup event listeners for control buttons
   */
  async setupControls() {
    const minimizeBtn = document.querySelector('.control-btn.minimize');
    const maximizeBtn = document.querySelector('.control-btn.maximize');
    const closeBtn = document.querySelector('.control-btn.close');

    if (!minimizeBtn || !maximizeBtn || !closeBtn) {
      // Expected as of 2026-09-16 — the custom minimize/maximize/close dots
      // were removed from the title bar (replaced with the EGQ logo). The
      // real OS titlebar still provides these on Windows (main.js uses
      // frame: true), so this is a no-op, not an error.
      console.log('🪟 Custom window control buttons not in DOM (removed by design) — skipping');
      return;
    }

    // Minimize button
    minimizeBtn.addEventListener('click', async (event) => {
      event.preventDefault();
      await this.handleMinimize();
    });

    // Maximize/Restore button
    maximizeBtn.addEventListener('click', async (event) => {
      event.preventDefault();
      await this.handleMaximize();
    });

    // Close button
    closeBtn.addEventListener('click', async (event) => {
      event.preventDefault();
      await this.handleClose();
    });

    // Update button states on load
    await this.updateButtonStates();

    // Optional: Listen for window state changes
    this.setupStateUpdates();

    console.log('🖱️ Window control event listeners attached');
  }

  /**
   * Handle minimize button click
   */
  async handleMinimize() {
    try {
      console.log('🔽 Minimize button clicked');

      const result = await window.queMusicAPI.window.minimize();

      if (result && !result.success) {
        console.error('❌ Failed to minimize:', result.error);
        this.showError('Failed to minimize window');
      }
    } catch (error) {
      console.error('❌ Error minimizing window:', error);
      this.showError('Error minimizing window');
    }
  }

  /**
   * Handle maximize/restore button click
   */
  async handleMaximize() {
    try {
      console.log('🔼 Maximize/restore button clicked');

      const result = await window.queMusicAPI.window.maximize();

      if (result && result.success) {
        await this.updateButtonStates();
        console.log(`🪟 Window ${result.maximized ? 'maximized' : 'restored'}`);
      } else {
        console.error('❌ Failed to toggle maximize:', result?.error);
        this.showError('Failed to toggle window size');
      }
    } catch (error) {
      console.error('❌ Error toggling maximize:', error);
      this.showError('Error changing window size');
    }
  }

  /**
   * Handle close button click
   */
  async handleClose() {
    try {
      console.log('❌ Close button clicked');

      // Optional: Add confirmation dialog for unsaved changes
      const shouldClose = await this.confirmClose();

      if (shouldClose) {
        const result = await window.queMusicAPI.window.close();

        if (result && !result.success) {
          console.error('❌ Failed to close:', result.error);
          this.showError('Failed to close window');
        }
      }
    } catch (error) {
      console.error('❌ Error closing window:', error);
      this.showError('Error closing window');
    }
  }

  /**
   * Update button appearances based on window state
   */
  async updateButtonStates() {
    try {
      const maximizeBtn = document.querySelector('.control-btn.maximize');
      if (!maximizeBtn) return;

      const isMaximized = await window.queMusicAPI.window.isMaximized();

      // Update tooltip
      maximizeBtn.title = isMaximized ? 'Restore' : 'Maximize';

      // Update visual state (optional)
      if (isMaximized) {
        maximizeBtn.classList.add('maximized');
      } else {
        maximizeBtn.classList.remove('maximized');
      }

      console.log(`🪟 Button states updated - maximized: ${isMaximized}`);
    } catch (error) {
      console.error('❌ Error updating button states:', error);
    }
  }

  /**
   * Setup periodic state updates (optional)
   */
  setupStateUpdates() {
    // Update button states every few seconds to catch external window changes
    setInterval(() => {
      this.updateButtonStates();
    }, 5000);
  }

  /**
   * Confirm window close (optional - implement based on your needs)
   */
  async confirmClose() {
    // You can add logic here to check for unsaved changes
    // For now, always allow close
    return true;

    // Example implementation:
    // const hasUnsavedChanges = window.app?.hasUnsavedChanges?.() || false;
    // if (hasUnsavedChanges) {
    //   return confirm('You have unsaved changes. Are you sure you want to close?');
    // }
    // return true;
  }

  /**
   * Show error message to user
   */
  showError(message) {
    // Use your app's notification system if available
    if (window.app?.showNotification) {
      window.app.showNotification(message, 'error');
    } else {
      console.error('🚨', message);
      // Fallback to alert if no notification system
      // alert(message);
    }
  }

  /**
   * Add keyboard shortcuts for window controls (optional)
   */
  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (event) => {
      // Ctrl/Cmd + M for minimize
      if ((event.ctrlKey || event.metaKey) && event.key === 'm') {
        event.preventDefault();
        this.handleMinimize();
      }

      // Ctrl/Cmd + W for close
      if ((event.ctrlKey || event.metaKey) && event.key === 'w') {
        event.preventDefault();
        this.handleClose();
      }
    });

    console.log('⌨️ Window control keyboard shortcuts enabled');
  }
}

// Initialize window controls when script loads
const windowControls = new WindowControls();

// Auto-initialize
windowControls.init();

// Optional: Setup keyboard shortcuts
// windowControls.setupKeyboardShortcuts();

// Export for global access if needed
if (typeof window !== 'undefined') {
  window.windowControls = windowControls;
}

console.log('🪟 Window controls script loaded');
