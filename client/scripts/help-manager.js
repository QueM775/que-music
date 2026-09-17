console.log('📚 help-manager.js script is loading...');

class HelpManager {
  constructor(app) {
    this.app = app;
    this.helpContent = null;
    this.currentTopic = null;
    this.searchIndex = new Map();
    this.isModalOpen = false;

    console.log('📚 HelpManager constructor called');
    console.log('📚 HelpManager initialized successfully');
    this.loadHelpContent();
  }

  async loadHelpContent() {
    console.log('📚 Loading embedded help content');

    // Embedded help content with all 10 topics
    this.helpContent = {
      version: '1.0.1',
      lastUpdated: '2025-01-30',
      helpTopics: [
        {
          id: 'getting-started',
          title: '🏁 Getting Started',
          icon: '🏁',
          description: 'Installation, first run, and initial setup',
          content: `# 🏁 Getting Started

## Installation & First Run
1. **Launch Que-Music** - The application will open with a welcome screen
2. **Select Your Music Folder** - Click "Select Your Music Folder" to choose your main music directory
3. **Library Scanning** - The app will automatically scan and import your music files
4. **Start Playing** - Browse your library and double-click any track to start playing

## Initial Setup Tips
- Choose a folder that contains all your music for best results
- The initial scan may take a few minutes for large libraries
- Album artwork is automatically extracted from music files
- All metadata (artist, album, genre, etc.) is automatically detected

## Supported Audio Formats
- **MP3** - MPEG Audio Layer 3
- **FLAC** - Free Lossless Audio Codec
- **WAV** - Waveform Audio Format
- **M4A/AAC** - Advanced Audio Codec
- **OGG** - Ogg Vorbis
- **WMA** - Windows Media Audio`,
          order: 1,
        },
        {
          id: 'interface-guide',
          title: '🖥️ User Interface Guide',
          icon: '🖥️',
          description: 'Understanding the main layout and navigation',
          content: `# 🖥️ User Interface Guide

## Main Layout
The Que-Music interface consists of four main areas:

### 1. **Title Bar** (Top)
- **EGQ Logo**: top-left, replaced the old cosmetic minimize/maximize/close dots (Windows shows its own native title bar controls for those already)
- **App Logo**: Que-Music branding
- **Header Actions**: Search, theme toggle, help, and settings buttons

### 2. **Sidebar** (Left)
**Library Section:**
- **Music Library** - Browse your complete music collection
- **Favorites** - Quick access to your favorite tracks
- **Recently Played** - Your listening history

**Playlists Section:**
- **Playlists** - View all your custom playlists
- **Create Playlist** - Build new playlists

**Tools Section:**
- **Change Music Folder** - Switch to a different music directory
- **Database Manager** - Advanced library management tools

### 3. **Content Area** (Center/Right)
- **Dual-Pane Layout**: Folder browser (left) and track list (right)
- **Single-Pane Layout**: Full-width content for search results and settings
- **View Controls**: Toggle between grid and list views
- **Sort Options**: Sort tracks by title, artist, album, year, or duration

### 4. **Audio Player** (Bottom)
- **Now Playing Info**: Current track details with album artwork
- **Playback Controls**: Play/pause, previous, next, shuffle, repeat
- **Progress Bar**: Track position with time display
- **Volume Controls**: Volume slider and mute button
- **Visualizer Toggle**: Enable/disable audio visualization`,
          order: 2,
        },
        {
          id: 'music-management',
          title: '🎵 Music Library Management',
          icon: '🎵',
          description: 'Managing your music collection and folder scanning',
          content: `# 🎵 Music Library Management

## Folder Selection
- Click **"Change Music Folder"** in the Tools section
- Select any folder containing your music files
- The app supports nested folder structures
- Multiple folder formats are automatically recognized

## Library Scanning
The app automatically:
- Scans all subfolders recursively
- Extracts metadata from audio files
- Generates album artwork thumbnails
- Creates searchable database entries
- Updates the library when files change

## Metadata Handling
- **Automatic Extraction**: Title, artist, album, genre, year, track number
- **Album Artwork**: Embedded images or folder art (folder.jpg, cover.png, etc.)
- **Unicode Support**: Full support for international characters
- **Special Characters**: Handles spaces, apostrophes, and symbols correctly

## File Management
### Adding New Music
1. Copy music files to your music folder
2. The app will automatically detect new files
3. Metadata will be extracted automatically
4. New tracks appear in your library immediately

### Viewing Options
- **List View**: Detailed track information in rows
- **Grid View**: Album artwork-focused display
- **Sort Options**: Title, Artist, Album, Year, Duration`,
          order: 3,
        },
        {
          id: 'player-controls',
          title: '🎮 Audio Player Controls',
          icon: '🎮',
          description: 'Playback controls and audio visualization',
          content: `# 🎮 Audio Player Controls

## Playback Controls
### Main Controls
- **Play/Pause** ⏯️ - Start or pause current track
- **Previous** ⏮️ - Go to previous track
- **Next** ⏭️ - Skip to next track
- **Shuffle** 🔀 - Enable random track order
- **Repeat** 🔁 - Repeat current track or playlist

### Additional Controls
- **Volume Slider** 🔊 - Adjust playback volume (0-100%)
- **Mute Button** 🔇 - Quickly mute/unmute audio
- **Progress Bar** - Seek to any position in the current track
- **Time Display** - Current position and total duration

## Playing Music
### Starting Playback
- **Double-click** any track to play immediately
- **Right-click** track → "Play Now"
- **Right-click** track → "Add to Queue"

### Queue Management
- Tracks play in order from the selected folder or playlist
- Use shuffle to randomize playback order
- Repeat modes: Off, Repeat All, Repeat One

## Audio Visualization
- **Toggle Visualizer** - Click the visualizer button in bottom-right
- **Change Visualization** - Right-click visualizer button to cycle through types
- **Visualization Types**: Bars, circles, waveform, and more
- **Real-time Audio Analysis** - Responds to music frequency and amplitude`,
          order: 4,
        },
        {
          id: 'playlists',
          title: '📝 Playlist System',
          icon: '📝',
          description: 'Creating, managing, and exporting playlists',
          content: `# 📝 Playlist System

## Creating Playlists
### Method 1: From Sidebar
1. Click **"Create Playlist"** in the Playlists section
2. Enter playlist name and optional description
3. Click "Create Playlist"

### Method 2: From Selected Tracks
1. Select multiple tracks (Ctrl+click or Shift+click)
2. Right-click selection → "Add to Playlist" → "Create New Playlist"
3. Enter playlist details

## Managing Playlists
### Adding Tracks
- Drag and drop tracks onto playlist
- Right-click track → "Add to Playlist" → Select playlist
- Use multi-select to add multiple tracks at once

### Editing Playlists
- Right-click playlist → "Edit" to change name/description
- Right-click playlist → "Clear Tracks" to remove all songs
- Drag tracks within playlist to reorder

### Playlist Context Menu
- **Play** - Start playing the playlist
- **Shuffle & Play** - Play playlist in random order
- **Edit** - Modify playlist details
- **Duplicate** - Create a copy of the playlist
- **Save as Static Playlist** - Smart playlists only, snapshots the current matches into a regular playlist
- **Clear Tracks** - Remove all tracks (keeps playlist)
- **Delete Playlist** - Remove playlist completely

## M3U Export/Import
### Automatic Features
- Playlists are automatically saved as M3U files in your music folder — there's no separate manual "export" action, it just happens
- M3U files in your music folder are automatically detected and imported
- Changes sync between database and M3U files

### Manual Operations
- **Import**: Place M3U files in \`{Music Folder}/Playlists/\`
- **Compatibility**: Works with other music players that support M3U format`,
          order: 5,
        },
        {
          id: 'search-discovery',
          title: '🔍 Search & Discovery',
          icon: '🔍',
          description: 'Finding and discovering music in your library',
          content: `# 🔍 Search & Discovery

## Search Functionality
### Global Search
- Click the **Search button** 🔍 in the header
- Search across all metadata: title, artist, album, genre
- Results update in real-time as you type
- Case-insensitive search with partial matching

### Search Tips
- Search by artist: "Beatles"
- Search by album: "Abbey Road"
- Search by genre: "Rock"
- Combined search: "Beatles Help"
- Use quotes for exact phrases: "Yesterday"

### Advanced Search
- Multiple keywords are combined with AND logic
- Search results are ranked by relevance
- Special characters and Unicode are fully supported
- Search history is maintained during the session

## Discovery Features
### Recently Played
- Automatic tracking of your listening history
- Shows last played date and play count
- Quick access to recently enjoyed music
- Helps rediscover forgotten favorites

### Favorites System
- Click the ⭐ heart button on any track to favorite
- Access all favorites from the sidebar
- Favorites persist across app restarts
- Use favorites to build quick playlists

### Now Playing Queue
- View and modify the current playback queue
- See what's coming up next
- Reorder tracks in the queue
- Add tracks without interrupting current playback

## Music Exploration
### Browse by Category
- **Artists**: Browse your complete artist collection
- **Albums**: Visual album browsing with artwork
- **Genres**: Discover music by musical style
- **Years**: Explore music chronologically`,
          order: 6,
        },
        {
          id: 'cover-fetcher',
          title: '🖼️ Album Cover Fetcher',
          icon: '🖼️',
          description: 'Managing album artwork and fetching missing covers',
          content: `# 🖼️ Album Cover Fetcher

## Overview
The Album Cover Fetcher automatically scans your music library to find, validate, and download missing album artwork from online sources.

## Accessing the Cover Fetcher
**Method:** Tools Menu
- Click **Tools → Album Cover Fetcher** in the sidebar

## Features
### 🔍 Comprehensive Scanning
- Scans your entire music library
- Processes tracks efficiently in batches
- Real-time progress tracking

### 🎨 Multiple Cover Sources
1. **Embedded Art Extraction**
   - Extracts album art from MP3/FLAC metadata
   - No internet required

2. **Online Downloads**
   - Searches MusicBrainz database
   - Downloads from Cover Art Archive
   - Professional metadata matching

3. **Cover Validation**
   - Verifies existing covers
   - Checks JPEG and PNG formats
   - Removes corrupted files

### 📊 Progress Tracking
- Real-time progress bar
- Live statistics:
  - **Scanned**: Total tracks processed
  - **Embedded**: Covers extracted from files
  - **Downloaded**: Covers fetched online
  - **Validated**: Existing covers verified
  - **Cleaned**: Corrupted files removed
  - **Failed**: Tracks that couldn't be processed

## How to Use
1. Open **Tools → Album Cover Fetcher**
2. Configure options:
   - ✅ Download missing covers from online
   - ✅ Validate existing covers
3. Click **Start Scan**
4. Monitor progress and statistics
5. Review results when complete

## Understanding Results
- **Scanned**: Total tracks processed
- **Embedded**: Art extracted from files
- **Downloaded**: Covers fetched online
- **Validated**: Existing covers verified as valid
- **Cleaned**: Corrupted files removed
- **Failed**: Tracks that couldn't be processed

## Troubleshooting
### No Covers Downloaded
- Check internet connection
- Verify artist/album metadata exists
- Enable logging (Settings → Advanced → HIGH)
- Check albums are in MusicBrainz database

### High Failed Count
- Missing metadata (artist/album)
- Rare albums not in database
- Network connectivity issues

### Covers Not Appearing
- Restart the application
- Check covers directory: assets/covers/
- Verify file naming: artist-album.jpg

## Best Practices
✅ Ensure internet connection for downloads
✅ Enable logging for troubleshooting
✅ Let scan complete without interruption
✅ Run after adding new music
✅ Restart app to reload covers`,
          order: 7,
        },
        {
          id: 'settings-themes',
          title: '🎨 Settings & Themes',
          icon: '🎨',
          description: 'Customizing appearance and configuring settings',
          content: `# 🎨 Settings & Themes

## Theme Options
### Available Themes
- **Dark Theme** - Modern dark interface (default)
- **Light Theme** - Clean light interface
- **Auto (System)** - Matches your system theme

### Changing Themes
- Click the **Theme Toggle** button ☀️/🌙 in the header
- Or go to Settings → Appearance → Theme
- Theme changes apply immediately
- Theme preference is saved automatically

## Visual Customization
### View Modes
- **List View** - Compact track listing with details
- **Grid View** - Album-style grid layout
- Toggle between views using buttons in content header

### Sorting Options
- Sort by: Title, Artist, Album, Year, Duration
- Ascending or descending order
- Sorting preferences are saved per view
- Custom sort orders for different contexts

## Settings Categories
### Appearance Settings
- **Theme**: Dark, Light, or Auto (System)
- **Compact Mode**: Reduces interface spacing
- **Show Album Art**: Toggle artwork display
- **Show Notifications**: Playback change notifications

### Audio Settings
- **Default Volume**: Starting volume level (0-100%)
- **Crossfade Duration**: Smooth transitions between tracks (0-5 seconds)
- **Audio Buffer Size**: Adjust for performance (1024-8192 samples)

### Library Settings
- **Music Folder**: Current music directory location
- **Auto-scan**: Automatically detect new music files
- **Watch Folders**: Monitor folder changes in real-time

### Playback Settings
- **Resume Playback**: Continue from last position on startup
- **Remember Position**: Save track positions
- **Skip Short Tracks**: Automatically skip tracks shorter than specified duration

### Advanced Settings
- **Logging Level**: Control console and file logging verbosity
  - **NONE** - No logging (default for clean console)
  - **LOW** - Errors only
  - **MED** - Errors and warnings
  - **HIGH** - Errors, warnings, and info messages
  - **DEV** - Everything including debug messages
- **Debug Logging**: Enable detailed logging for troubleshooting
- **Buffer Size**: Audio processing buffer size

## Logging System
Que-Music includes an integrated logging system:
- **User-Configurable Levels**: Set logging verbosity in Settings → Advanced → Logging Level
- **Console Interception**: All console.log/error/warn calls automatically routed through logger
- **File Logging**: Daily log files created in \`logs/\` directory (main process only)
- **Default: NONE**: By default, logging is disabled for a clean console experience
- **Real-time Updates**: Changing the logging level updates both main and renderer processes immediately

## Version Information
- **Sidebar Display**: Version number shown at bottom of left sidebar
- **About Window**: Click the version number or use Help → About Que-Music menu
- **Build Information**: Shows Electron, Node.js, and Chromium versions
- **Copyright & License**: View licensing information`,
          order: 7,
        },
        {
          id: 'keyboard-shortcuts',
          title: '⌨️ Keyboard Shortcuts',
          icon: '⌨️',
          description: 'Complete list of keyboard shortcuts',
          content: `# ⌨️ Keyboard Shortcuts

This is the real, current list — only shortcuts actually wired up in the app. Most other actions (search, opening playlists, selecting tracks) are mouse/menu-driven for now: click, right-click for a context menu, or use the menu bar.

## Playback
- **Space** - Play/Pause
- **← →** - Seek backward/forward in the current track
- **Ctrl+←** - Previous track
- **Ctrl+→** - Next track
- **↑ ↓** - Volume up/down
- **Ctrl+S** - Toggle shuffle
- **Ctrl+R** - Toggle repeat mode

## Visualizer
- **V** - Toggle the visualizer on/off
- **Ctrl+V** - Restart the visualizer
- **Shift+V** - Cycle visualizer type (only while it's on)

## App
- **F1** - Open this Help window
- **Ctrl+T** - Toggle light/dark theme
- **Esc** - Close whatever modal is open
- **F11** - Toggle fullscreen
- **Ctrl+M** - Minimize window
- **Ctrl+W** / **Alt+F4** - Close the app
- **Ctrl+0 / Ctrl+= / Ctrl+-** - Reset/zoom in/zoom out page zoom
- **Ctrl+Shift+C** - Open Album Cover Fetcher (Tools menu)

Note: playback shortcuts (Space, arrows, etc.) are ignored while you're typing in a text field, so they won't fight with search or renaming.`,
          order: 8,
        },
        {
          id: 'database-management',
          title: '🗄️ Database Management',
          icon: '🗄️',
          description: 'Library maintenance and troubleshooting tools',
          content: `# 🗄️ Database Management

## Database Manager
Access via **Tools** → **Database Manager** to perform maintenance tasks:

### Library Statistics
- Total tracks, artists, albums
- Database file size and location
- Last scan date and duration
- Performance metrics and health status

### Maintenance Operations
- **Refresh Library** - Re-scan music folder for changes
- **Update Track Durations** - Recalculate missing duration information
- **Fix Missing Metadata** - Attempt to repair incomplete track information
- **Clean Database** - Remove orphaned entries and optimize performance
- **Export Database** - Backup your library database

### Troubleshooting Tools
- **Rebuild Database** - Complete database reconstruction
- **Reset Playlists** - Clear all playlist data
- **Clear Cache** - Remove temporary files and thumbnails
- **Verify Integrity** - Check database for corruption

## Data Storage
### Database Location
- **Windows**: \`%APPDATA%\\que-music\\music-library.db\`
- **macOS**: \`~/Library/Application Support/que-music/music-library.db\`
- **Linux**: \`~/.config/que-music/music-library.db\`

### Playlist Storage
- **Primary**: SQLite database (fast queries)
- **Backup**: M3U files in \`{Music Folder}/Playlists/\`
- **Sync**: Automatic synchronization between both

## Database Operations
### Regular Maintenance
- **Weekly**: Run "Clean Database" to optimize performance
- **Monthly**: Export database as backup
- **After major changes**: Run "Refresh Library"
- **When experiencing issues**: Try "Rebuild Database"

### Performance Optimization
- Database uses indexes on commonly queried columns
- Regular cleanup removes orphaned entries
- Album art cache has automatic size limits
- Query optimization for large libraries`,
          order: 9,
        },
        {
          id: 'troubleshooting',
          title: '🔧 Troubleshooting',
          icon: '🔧',
          description: 'Common issues and solutions',
          content: `# 🔧 Troubleshooting

## Common Issues
### App Won't Start
- Check that all dependencies are installed
- Run \`npm install\` in the app directory
- Try \`npm run rebuild\` to rebuild native modules

### Music Not Loading
- Verify the music folder path is correct
- Check file permissions on the music folder
- Ensure audio files are in supported formats
- Try refreshing the library from Database Manager

### Audio Not Playing
- Check system audio settings
- Verify audio files aren't corrupted
- Try different audio formats
- Restart the application

### Search Not Working
- Clear search cache in Database Manager
- Rebuild the database if needed
- Check that files have proper metadata

### Playlists Missing
- Check that playlist folder exists in music directory
- Re-import M3U files from Database Manager
- Verify playlist files aren't corrupted

## Performance Issues
### Slow Library Loading
- Enable database optimization in settings
- Consider smaller music folder structures
- Increase audio buffer size in advanced settings

### High Memory Usage
- Reduce album art cache size
- Disable visualizer if not needed
- Close unnecessary browser tabs (Electron-based)

## File Path Issues
### Special Characters in Filenames
- Que-Music supports Unicode characters
- Avoid extremely long file paths (>260 characters on Windows)
- Use standard characters when possible

### Audio Files Not Found
- Check file paths for special characters or Unicode
- Verify files haven't been moved or deleted
- Try refreshing the music library

## Getting Help
### Debug Information
1. Enable debug logging in settings
2. Check console output (Ctrl+Shift+I)
3. Include error messages when reporting issues

### Reporting Bugs
When reporting issues, include:
- Operating system and version
- Que-Music version
- Steps to reproduce the issue
- Any error messages
- Screenshots if applicable`,
          order: 10,
        },
      ],
    };

    this.buildSearchIndex();
    console.log(
      '📚 Help content loaded successfully with',
      this.helpContent.helpTopics.length,
      'topics'
    );
  }

  buildSearchIndex() {
    if (!this.helpContent?.helpTopics) return;

    this.helpContent.helpTopics.forEach((topic) => {
      const searchText = `${topic.title} ${topic.description}`.toLowerCase();
      this.searchIndex.set(topic.id, {
        title: topic.title,
        description: topic.description,
        searchText: searchText,
        topic: topic,
      });
    });
  }

  async showHelp(topicId = null) {
    console.log('📚 showHelp called with topicId:', topicId);
    console.log('📚 Current help content:', !!this.helpContent);

    if (!this.helpContent) {
      console.log('📚 No help content, loading now...');
      await this.loadHelpContent();
    }

    const modal = document.getElementById('helpModal');
    console.log('📚 Help modal found:', !!modal);
    if (!modal) {
      console.error('❌ Help modal not found in DOM');
      return;
    }

    this.isModalOpen = true;
    this.populateHelpModal(topicId);
    this.showModal(modal);
    console.log('📚 Help modal should now be visible');
  }

  populateHelpModal(initialTopicId = null) {
    const sidebar = document.getElementById('helpSidebar');
    const content = document.getElementById('helpContent');

    if (!sidebar || !content) {
      console.error('❌ Help modal elements not found');
      return;
    }

    this.renderHelpSidebar(sidebar);

    const topicToShow = initialTopicId || this.helpContent.helpTopics[0]?.id;
    if (topicToShow) {
      this.showHelpTopic(topicToShow);
    }
  }

  renderHelpSidebar(sidebar) {
    const topics = this.helpContent.helpTopics.sort((a, b) => a.order - b.order);

    sidebar.innerHTML = `
      <div class="help-search">
        <input 
          type="text" 
          id="helpSearchInput" 
          placeholder="Search help topics..." 
          class="form-input help-search-input"
        />
      </div>
      <div class="help-topics">
        ${topics
          .map(
            (topic) => `
          <div class="help-topic-item" data-topic="${topic.id}">
            <span class="help-topic-icon">${topic.icon}</span>
            <div class="help-topic-info">
              <div class="help-topic-title">${topic.title.replace(/^🎵|🖥️|🏁|🎮|📝|🔍|🎨|⌨️|🗄️|🔧/, '').trim()}</div>
              <div class="help-topic-desc">${topic.description}</div>
            </div>
          </div>
        `
          )
          .join('')}
      </div>
    `;

    this.setupHelpSidebarEvents(sidebar);
  }

  setupHelpSidebarEvents(sidebar) {
    const searchInput = sidebar.querySelector('#helpSearchInput');
    const topicItems = sidebar.querySelectorAll('.help-topic-item');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.handleHelpSearch(e.target.value);
      });

      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          searchInput.value = '';
          this.handleHelpSearch('');
        }
      });
    }

    topicItems.forEach((item) => {
      item.addEventListener('click', () => {
        const topicId = item.dataset.topic;
        this.showHelpTopic(topicId);
      });
    });
  }

  handleHelpSearch(query) {
    const topicItems = document.querySelectorAll('.help-topic-item');
    const lowerQuery = query.toLowerCase().trim();

    if (!lowerQuery) {
      topicItems.forEach((item) => {
        item.style.display = '';
      });
      return;
    }

    topicItems.forEach((item) => {
      const topicId = item.dataset.topic;
      const searchData = this.searchIndex.get(topicId);

      if (searchData && searchData.searchText.includes(lowerQuery)) {
        item.style.display = '';
      } else {
        item.style.display = 'none';
      }
    });
  }

  async showHelpTopic(topicId) {
    const topic = this.helpContent.helpTopics.find((t) => t.id === topicId);
    if (!topic) {
      console.error('❌ Help topic not found:', topicId);
      return;
    }

    this.currentTopic = topicId;
    this.updateActiveTopicInSidebar(topicId);

    const content = document.getElementById('helpContent');
    if (!content) return;

    content.innerHTML = '<div class="help-loading">Loading...</div>';

    try {
      if (!topic.content) {
        throw new Error('No content available for this topic');
      }

      const html = this.markdownToHtml(topic.content);

      content.innerHTML = `
        <div class="help-topic-content">
          ${html}
        </div>
      `;

      content.scrollTop = 0;
      console.log('📚 Topic content loaded:', topicId);
    } catch (error) {
      console.error('❌ Failed to load help topic:', error);
      content.innerHTML = `
        <div class="help-error">
          <h3>Unable to Load Help Topic</h3>
          <p>Sorry, we couldn't load the help content for "${topic.title}". Please try again later.</p>
        </div>
      `;
    }
  }

  updateActiveTopicInSidebar(topicId) {
    const topicItems = document.querySelectorAll('.help-topic-item');
    topicItems.forEach((item) => {
      item.classList.toggle('active', item.dataset.topic === topicId);
    });
  }

  markdownToHtml(markdown) {
    return markdown
      .replace(/^# (.*$)/gm, '<h1>$1</h1>')
      .replace(/^## (.*$)/gm, '<h2>$1</h2>')
      .replace(/^### (.*$)/gm, '<h3>$1</h3>')
      .replace(/^#### (.*$)/gm, '<h4>$1</h4>')
      .replace(/^\- (.*$)/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/^([^<])/gm, '<p>$1')
      .replace(/([^>])$/gm, '$1</p>')
      .replace(/<\/p><p><\/p><p>/g, '</p><p>')
      .replace(/<p><([hul])/g, '<$1')
      .replace(/<\/([hul][^>]*)><\/p>/g, '</$1>')
      .replace(/<p><li>/g, '<ul><li>')
      .replace(/<\/li><\/p>/g, '</li></ul>');
  }

  showModal(modal) {
    modal.style.display = 'flex';
    requestAnimationFrame(() => {
      modal.classList.add('show');
    });

    const modalContent = modal.querySelector('.modal-content');
    if (modalContent) {
      modalContent.focus();
    }
  }

  hideHelp() {
    const modal = document.getElementById('helpModal');
    if (modal && this.isModalOpen) {
      modal.classList.remove('show');
      setTimeout(() => {
        modal.style.display = 'none';
        this.isModalOpen = false;
      }, 300);
    }
  }

  getContextualHelp(currentView) {
    if (!this.helpContent?.contextualHelp) return null;

    const contextualTopics = this.helpContent.contextualHelp[currentView] || [];
    return contextualTopics
      .map((topicId) => this.helpContent.helpTopics.find((t) => t.id === topicId))
      .filter(Boolean);
  }

  setupGlobalKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'F1') {
        e.preventDefault();
        this.showHelp();
        return;
      }

      if (this.isModalOpen) {
        if (e.key === 'Escape') {
          e.preventDefault();
          this.hideHelp();
        }
      }
    });
  }

  setupModalEventListeners() {
    const modal = document.getElementById('helpModal');
    if (!modal) return;

    const closeBtn = modal.querySelector('.modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hideHelp());
    }

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.hideHelp();
      }
    });
  }

  init() {
    console.log('📚 HelpManager.init() called');
    this.setupGlobalKeyboardShortcuts();
    this.setupModalEventListeners();
    console.log('✅ HelpManager initialized successfully');
  }
}

console.log('📚 HelpManager class defined');
window.HelpManager = HelpManager;
console.log('📚 HelpManager added to window object');
