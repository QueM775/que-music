# 🏗️ Que-Music Application Architecture & Execution Flow

**Last Verified**: 2026-09-14 (script load order and startup command checked against `index.html`/`package.json`)  
**Author**: Erich Quade

## Overview

This document provides a comprehensive understanding of how Que-Music starts up and executes, from the initial HTML load through the complete application lifecycle.

---

## 🚀 Application Startup Sequence

### 1. Electron Main Process (main.js)

**File**: `main.js` (root directory)
**Executed By**: Electron when the app starts

```
npm start → node start-electron.js → electron main.js
```

(`start-electron.js` is a thin wrapper that strips `ELECTRON_RUN_AS_NODE` before spawning Electron — see `docs/application/electron-startup-troubleshooting.md`. The project packages with Electron Builder, not Electron Forge — see `docs/application/packaging-guide.md`.)

**Main Process Responsibilities:**

- Creates the main browser window with security configurations
- Sets up comprehensive IPC (Inter-Process Communication) handlers
- Initializes SQLite database connection with better-sqlite3
- Manages file system operations and music scanning
- Sets up security policies and window management
- Handles application lifecycle events and menu creation

### 2. Preload Script Injection

**File**: `client/scripts/main-preload.js`
**Executed By**: Electron before the renderer process loads

**Purpose**: Creates secure bridge between main and renderer processes

- Exposes `window.queMusicAPI` object
- Provides safe IPC communication methods
- Sets up all API endpoints for the frontend

### 3. HTML Document Load

**File**: `client/pages/index.html`
**Executed By**: Electron renderer process

**Load Order (Critical - Scripts load in this exact sequence):**

```html
<!-- Line 814-820: Module loading order -->
<script src="../scripts/window-controls.js"></script>
<!-- 1st -->
<script src="../scripts/core-audio.js"></script>
<!-- 2nd -->
<script src="../scripts/library-manager.js"></script>
<!-- 3rd -->
<script src="../scripts/ui-controller.js"></script>
<!-- 4th -->
<script src="../scripts/playlist-renderer.js"></script>
<!-- 5th -->
<script src="../scripts/main-app.js"></script>
<!-- 6th -->
<script src="../scripts/main-window.js"></script>
<!-- 7th -->
```

### 4. Module Initialization Chain

**Executed By**: Each script file as it loads

**Phase 1: Class Definitions (Lines 814-818)**

- `window-controls.js` - Window control utilities
- `core-audio.js` - Defines `CoreAudio` class
- `library-manager.js` - Defines `LibraryManager` class
- `ui-controller.js` - Defines `UIController` class
- `playlist-renderer.js` - Defines `PlaylistRenderer` class

**Phase 2: Application Assembly (Line 819)**

- `main-app.js` - Defines `QueMusicApp` class and creates instances

**Phase 3: Application Start (Line 820)**

- `main-window.js` - Waits for all modules, then starts the app

---

## 📋 Detailed Script Loading Analysis

### Script Load Order & Dependencies

```mermaid
graph TD
    A[index.html loads] --> B[window-controls.js]
    B --> C[core-audio.js]
    C --> D[library-manager.js]
    D --> E[ui-controller.js]
    E --> F[playlist-renderer.js]
    F --> G[main-app.js]
    G --> H[main-window.js]
    H --> I[App Initialization]
```

### Critical Dependency Chain

1. **window-controls.js** (Independent)
   - No dependencies on other modules
   - Sets up window management utilities

2. **core-audio.js** (Independent)
   - Defines `CoreAudio` class
   - No dependencies on other custom modules

3. **library-manager.js** (Independent)
   - Defines `LibraryManager` class
   - No dependencies on other custom modules

4. **ui-controller.js** (Independent)
   - Defines `UIController` class
   - No dependencies on other custom modules

5. **playlist-renderer.js** (Independent)
   - Defines `PlaylistRenderer` class
   - No dependencies on other custom modules

6. **main-app.js** (Depends on 2-5)
   - Creates instances of all above classes
   - Coordinates between all modules

7. **main-window.js** (Depends on 6)
   - Waits for `QueMusicApp` class to be available
   - Initializes the application instance

---

## 🔄 Application Initialization Flow

### Step-by-Step Execution (main-window.js)

**Phase 1: Module Availability Check**

```javascript
// main-window.js:31-35
const requiredModules = [
  'CoreAudio',
  'LibraryManager',
  'UIController',
  'PlaylistRenderer',
  'QueMusicApp',
];
const missing = requiredModules.filter((module) => !window[module]);
```

**Phase 2: Wait for All Modules**

```javascript
// main-window.js:36-55
// Polling mechanism with 5-second timeout
// Checks every 100ms for all required classes
```

**Phase 3: App Instance Creation**

```javascript
// main-window.js:73-85
try {
  console.log('🚀 Creating main app instance...');
  window.app = new QueMusicApp();
  console.log('✅ App instance created successfully');
} catch (error) {
  console.error('❌ Failed to create app instance:', error);
}
```

### QueMusicApp Initialization (main-app.js)

**Constructor Phase (main-app.js:4-28)**

```javascript
constructor() {
  // 1. Basic state setup
  this.currentView = 'library';

  // 2. Module instantiation (ORDER MATTERS)
  this.coreAudio = new CoreAudio(this);           // Audio engine
  this.libraryManager = new LibraryManager(this); // Music library
  this.uiController = new UIController(this);     // UI management
  this.playlistRenderer = new PlaylistRenderer(this); // Playlists

  // 3. Context menu initialization
  this.uiController.initializeContextMenus();

  // 4. Call async initialization
  this.init();
}
```

**Async Initialization Phase (main-app.js:35-68)**

```javascript
async init() {
  // 1. API connectivity test
  await this.testAPI();

  // 2. Event listener setup
  this.setupEventListeners();

  // 3. Audio system initialization
  this.coreAudio.initAudioEngine();
  this.uiController.initializeContextMenus();
  this.coreAudio.initializeVisualizer();

  // 4. UI setup
  this.initializeUI();

  // 5. Search system
  await this.libraryManager.initializeSearch();
  this.initializeSearchFix();

  // 6. Keyboard shortcuts
  this.setupKeyboardShortcuts();

  // 7. Player state restoration
  await this.coreAudio.loadPlayerState();

  // 8. Playlist system
  await this.playlistRenderer.initializePlaylists();

  // 9. Music library check
  await this.libraryManager.checkSavedMusicFolder();

  // 10. Final context menu setup
  if (this.uiController.initializeContextMenus) {
    this.uiController.initializeContextMenus();
  }
}
```

---

## 🎯 Module Interaction Patterns

### Communication Flow

```mermaid
graph LR
    A[main-app.js<br/>Coordinator] --> B[core-audio.js<br/>Audio Engine]
    A --> C[library-manager.js<br/>Music Library]
    A --> D[ui-controller.js<br/>UI Management]
    A --> E[playlist-renderer.js<br/>Playlists]

    B -.-> A
    C -.-> A
    D -.-> A
    E -.-> A

    F[main-preload.js<br/>IPC Bridge] --> G[server/database.js<br/>Backend]
    F --> H[server/music-scanner.js<br/>File Processing]
```

### Data Flow Architecture

**Frontend → Backend Communication:**

```javascript
// Client side (any .js file)
await window.queMusicAPI.database.getAllTracks()

// Preload script (main-preload.js)
database: {
  getAllTracks: () => ipcRenderer.invoke('database:get-all-tracks')
}

// Main process (main.js)
ipcMain.handle('database:get-all-tracks', async () => {
  return await musicDatabase.getAllTracks();
});

// Backend (server/database.js)
getAllTracks() {
  return this.db.prepare('SELECT * FROM tracks').all();
}
```

---

## 🔧 Error Handling & Recovery

### Module Loading Errors

**Location**: `main-window.js:52-57`

```javascript
// Timeout handling after 5 seconds
console.error('❌ Timeout waiting for modules to load');
console.error('📊 Final module status:');
requiredModules.forEach((module) => {
  console.error(`  ${module}: ${window[module] ? '✅' : '❌'}`);
});
```

### Application Initialization Errors

**Location**: `main-window.js:81-84`

```javascript
catch (error) {
  console.error('❌ App initialization failed:', error);
}
```

### Global Error Handling

**Location**: `main-window.js:214-221`

```javascript
window.addEventListener('error', (event) => {
  console.error('🚨 Global error:', event.error);
  console.error('📄 File:', event.filename);
  console.error('📍 Line:', event.lineno);
  console.error('📍 Column:', event.colno);
  console.error('📚 Stack:', event.error?.stack);
});
```

---

## 📊 Performance Considerations

### Loading Optimization

- **Sequential Loading**: Scripts load in dependency order
- **Module Caching**: Classes are cached on `window` object
- **Lazy Initialization**: Heavy operations deferred to async `init()`

### Memory Management

- **Event Cleanup**: Proper event listener removal
- **Context Menu Cleanup**: Dynamic menu creation/destruction
- **Audio Resource Management**: Proper audio context cleanup

---

## 🔍 Debugging & Development

### Development Tools

**Location**: `main-app.js:18-23`

```javascript
if (window.queMusicAPI?.system?.isDev) {
  window.manualSearchToggle = () => this.manualSearchToggle();
  window.forceSearchFocus = () => this.forceSearchFocus();
  window.testSearch = () => this.testSearch();
  console.log('🔍 Search debugging functions loaded');
}
```

### Console Logging Patterns

- 🎵 - General app messages
- 📁 - File/folder operations
- 🗄️ - Database operations
- 🔍 - Search functionality
- ❌ - Errors
- ✅ - Success messages
- ⚠️ - Warnings

---

## 📝 Summary

The Que-Music application follows a carefully orchestrated startup sequence:

1. **Electron Main Process** sets up backend services
2. **Preload Script** creates secure API bridge
3. **HTML Document** loads with specific script order
4. **Module Classes** are defined sequentially
5. **Main App** coordinates all modules
6. **Window Manager** initializes the application
7. **Async Initialization** completes the startup

This architecture ensures proper dependency resolution, error handling, and maintains separation of concerns between different functional areas of the application.
