// client/scripts/main-window.js - Main window initialization and event handling

console.log('📄 Loading Que-Music main window...');

// ============================================================================
// MODULE LOADING VERIFICATION
// ============================================================================
const requiredModules = [
  'QueMusicApp',
  'CoreAudio',
  'LibraryManager',
  'UIController',
  'PlaylistRenderer',
  'HelpManager',
];

let allModulesLoaded = false;

// ============================================================================
// MODULE LOADING FUNCTIONS
// ============================================================================

// Check if all modules are loaded
function checkModules() {
  const loadedModules = requiredModules.filter((module) => window[module]);

  if (loadedModules.length === requiredModules.length) {
    allModulesLoaded = true;
    console.log('✅ All required modules loaded successfully');
    console.log('📦 Loaded modules:', loadedModules);
    return true;
  } else {
    const missing = requiredModules.filter((module) => !window[module]);
    console.log('⏳ Still loading modules...');
    console.log('📦 Loaded:', loadedModules);
    console.log('❌ Missing:', missing);
    return false;
  }
}

// Module loading checker with timeout
let moduleCheckAttempts = 0;
const maxAttempts = 50; // 5 seconds max wait

function waitForModules() {
  moduleCheckAttempts++;

  if (checkModules()) {
    initializeApp();
  } else if (moduleCheckAttempts < maxAttempts) {
    setTimeout(waitForModules, 100);
  } else {
    console.error('❌ Timeout waiting for modules to load');
    console.error('📊 Final module status:');
    requiredModules.forEach((module) => {
      console.error(`  ${module}: ${window[module] ? '✅' : '❌'}`);
    });
  }
}

// ============================================================================
// APPLICATION INITIALIZATION
// ============================================================================

// Initialize application
function initializeApp() {
  console.log('🚀 Starting Que-Music initialization...');

  try {
    // Create global app instance
    window.app = new QueMusicApp();
    console.log('✅ QueMusicApp instance created');

    // Initialize the app
    window.app
      .initialize()
      .then(() => {
        console.log('✅ App initialization complete');
        setupNavigationEvents();
      })
      .catch((error) => {
        console.error('❌ App initialization failed:', error);
      });
  } catch (error) {
    console.error('❌ Failed to create app instance:', error);
  }
}

// ============================================================================
// EVENT HANDLING SETUP
// ============================================================================

// Setup navigation and UI event handlers
function setupNavigationEvents() {
  console.log('🔗 Setting up navigation events...');

  // Navigation item clicks
  document.querySelectorAll('.nav-item[data-view]').forEach((item) => {
    item.addEventListener('click', () => {
      const view = item.dataset.view;
      console.log(`📍 Navigation clicked: ${view}`);

      if (window.app && window.app.uiController) {
        window.app.uiController.switchView(view);
      } else {
        console.error('❌ App or UIController not available');
      }
    });
  });

  // Action item clicks (non-view navigation)
  document.querySelectorAll('.nav-item[data-action]').forEach((item) => {
    item.addEventListener('click', () => {
      const action = item.dataset.action;
      console.log(`🔧 Action clicked: ${action}`);

      handleNavigationAction(action);
    });
  });

  // Header button events
  setupHeaderButtons();

  console.log('✅ Navigation events setup complete');
}

// Handle navigation actions (non-view items)
function handleNavigationAction(action) {
  if (!window.app) {
    console.error('❌ App not available for action:', action);
    return;
  }

  switch (action) {
    case 'create-playlist':
      console.log('📋 Creating new playlist...');
      if (window.app.playlistRenderer) {
        window.app.playlistRenderer.showPlaylistModal();
      }
      break;

    case 'select-folder':
      console.log('📁 Selecting music folder...');
      if (window.app.libraryManager) {
        window.app.libraryManager.selectMusicFolder();
      }
      break;

    case 'database':
      console.log('🗄️ Opening database manager...');
      if (window.app.libraryManager) {
        window.app.libraryManager.openDatabaseManager();
      }
      break;

    default:
      console.warn(`⚠️ Unknown action: ${action}`);
  }
}

// Setup header button events
function setupHeaderButtons() {
  // Theme dropdown
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', (e) => {
      console.log('🎨 Theme dropdown clicked');
      if (window.app && window.app.uiController) {
        window.app.uiController.showThemeDropdown(e);
      }
    });
  }

  // Settings button
  const settingsBtn = document.getElementById('settingsBtn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      console.log('⚙️ Settings button clicked');
      if (window.app && window.app.uiController) {
        window.app.uiController.showSettingsModal();
      }
    });
  }

  // Search button - DISABLED (handled in library manager to avoid duplicates)
  // const searchBtn = document.getElementById('searchBtn');
  // if (searchBtn) {
  //   searchBtn.addEventListener('click', () => {
  //     console.log('🔍 Search button clicked');
  //     if (window.app && window.app.libraryManager) {
  //       window.app.libraryManager.toggleSearch();
  //     }
  //   });
  // }

  // Welcome screen button
  const selectFolderBtn = document.getElementById('selectFolderBtn');
  if (selectFolderBtn) {
    selectFolderBtn.addEventListener('click', () => {
      console.log('📁 Welcome screen folder button clicked');
      if (window.app && window.app.libraryManager) {
        window.app.libraryManager.selectMusicFolder();
      }
    });
  }

  console.log('✅ Header buttons setup complete');
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

// Global error handler
window.addEventListener('error', (event) => {
  console.error('🚨 Global error:', event.error);
  console.error('📄 File:', event.filename);
  console.error('📍 Line:', event.lineno);
});

// Unhandled promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
  console.error('🚨 Unhandled promise rejection:', event.reason);
});

console.log('📄 Main window script loaded and ready');

// ============================================================================
// DOM INITIALIZATION
// ============================================================================

// DOM Content Loaded Event
document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 DOM loaded, initializing Que-Music...');

  // Check if app is already initialized (might happen in development)
  if (window.app) {
    console.log('✅ App already initialized');
    setupNavigationEvents();
  } else {
    // Start module loading check
    waitForModules();
  }
});

// ============================================================================
// DEBUG UTILITIES
// ============================================================================

// Debugging utilities
window.debugNavigation = function () {
  console.log('🔍 Navigation Debug Info:');
  console.log('📍 Current View:', window.app?.currentView);
  console.log('🎵 Current Track:', window.app?.currentTrack);
  console.log('📋 Playlist Length:', window.app?.playlist?.length);

  // Check if navigation elements exist
  const navItems = document.querySelectorAll('.nav-item');
  console.log('🔗 Navigation Items:', navItems.length);
  navItems.forEach((item) => {
    console.log(
      `  - ${item.textContent.trim()} (view: ${item.dataset.view}, action: ${item.dataset.action})`
    );
  });

  // Check pane visibility
  const leftPane = document.getElementById('leftPane');
  const rightPane = document.getElementById('rightPane');
  const welcomeScreen = document.getElementById('welcomeScreen');
  const dualPaneLayout = document.getElementById('dualPaneLayout');

  console.log('📱 UI State:');
  console.log(
    '  - Welcome Screen:',
    welcomeScreen?.classList.contains('hidden') ? 'Hidden' : 'Visible'
  );
  console.log(
    '  - Dual Pane Layout:',
    dualPaneLayout?.classList.contains('hidden') ? 'Hidden' : 'Visible'
  );
  console.log('  - Left Pane Content:', leftPane?.innerHTML.length || 0, 'characters');
  console.log('  - Right Pane Content:', rightPane?.innerHTML.length || 0, 'characters');
};

// Export debug function globally
window.debugApp = window.debugNavigation;
