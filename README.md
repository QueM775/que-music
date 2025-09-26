# 🎵 Que-Music

**A Modern Desktop Music Player & Library Manager**
**Version**: 3.1.0
**Author**: Erich Quade
**License**: MIT
**Last Updated**: September 2025

Que-Music is an Electron-based desktop application that provides advanced music library management, intelligent search capabilities, playlist functionality, and a beautiful audio visualization experience.

---

## 📋 Table of Contents

1. [Features Overview](#-features-overview)
2. [Getting Started](#-getting-started)
3. [User Interface Guide](#-user-interface-guide)
4. [Music Library Management](#-music-library-management)
5. [Audio Player Controls](#-audio-player-controls)
6. [Playlist System](#-playlist-system)
7. [Search & Discovery](#-search--discovery)
8. [Themes & Customization](#-themes--customization)
9. [Help System](#-help-system)
10. [Database Management](#-database-management)
11. [Keyboard Shortcuts](#-keyboard-shortcuts)
12. [Settings](#-settings)
13. [Supported Audio Formats](#-supported-audio-formats)
14. [Troubleshooting](#-troubleshooting)
15. [Technical Information](#-technical-information)

---

## 🚀 Features Overview

### Core Features

- **Smart Music Library**: Automatic metadata extraction and organization
- **Advanced Search**: Intelligent search across all music metadata
- **Dual-Pane Interface**: Browse folders/playlists on the left, view tracks on the right
- **Playlist Management**: Create, edit, and manage playlists with M3U export
- **Audio Visualization**: Real-time audio visualization with multiple display modes
- **Theme Support**: Light, Dark, and Auto (system) themes
- **Favorites System**: Mark and organize your favorite tracks
- **Recently Played**: Automatic tracking of your listening history
- **Database Manager**: Built-in tools for library maintenance and optimization

### Advanced Features

- **Built-in Help System**: Comprehensive in-app documentation with F1 access
- **Integrated Logging System**: 5-level logging with file output and user-configurable verbosity
- **Unicode Support**: Full support for international characters in filenames
- **Context Menus**: Right-click functionality throughout the interface
- **Crossfade**: Smooth transitions between tracks
- **Auto-scan**: Automatic detection of new music files
- **Folder Watching**: Real-time updates when files change
- **Export/Import**: M3U playlist compatibility

### New in Version 3.1.0

- **Advanced Logging**: Integrated logger with 5 configurable levels (NONE, LOW, MED, HIGH, DEV)
- **File Logging**: Automatic daily log files in `logs/` directory with structured data
- **Debug Tools**: Enhanced troubleshooting with colored console output and persistent logs
- **Settings Integration**: Logger level configurable via Settings → Advanced → Logging level

---

## 🏁 Getting Started

### Installation & First Run

1. **Launch Que-Music** - The application will open with a welcome screen
2. **Select Your Music Folder** - Click "Select Your Music Folder" to choose your main music directory
3. **Library Scanning** - The app will automatically scan and import your music files
4. **Start Playing** - Browse your library and double-click any track to start playing

### Initial Setup Tips

- Choose a folder that contains all your music for best results
- The initial scan may take a few minutes for large libraries
- Album artwork is automatically extracted from music files
- All metadata (artist, album, genre, etc.) is automatically detected

---

## 🖥️ User Interface Guide

### Main Layout

The Que-Music interface consists of four main areas:

#### 1. **Title Bar** (Top)

- **Window Controls**: Minimize, maximize, close buttons
- **App Logo**: Que-Music branding
- **Header Actions**: Search, theme toggle, and settings buttons

#### 2. **Sidebar** (Left)

Navigation organized into sections:

**Library Section:**

- **Music Library** - Browse your complete music collection
- **Favorites** - Quick access to your favorite tracks
- **Recently Played** - Your listening history
- **Discover** - Explore your music collection
- **Now Playing** - Current playback queue

**Playlists Section:**

- **Playlists** - View all your custom playlists
- **Create Playlist** - Build new playlists

**Tools Section:**

- **Change Music Folder** - Switch to a different music directory
- **Database Manager** - Advanced library management tools

#### 3. **Content Area** (Center/Right)

- **Dual-Pane Layout**: Folder browser (left) and track list (right)
- **Single-Pane Layout**: Full-width content for search results and settings
- **View Controls**: Toggle between grid and list views
- **Sort Options**: Sort tracks by title, artist, album, year, or duration

#### 4. **Audio Player** (Bottom)

- **Now Playing Info**: Current track details with album artwork
- **Playback Controls**: Play/pause, previous, next, shuffle, repeat
- **Progress Bar**: Track position with time display
- **Volume Controls**: Volume slider and mute button
- **Visualizer Toggle**: Enable/disable audio visualization

---

## 🎵 Music Library Management

### Folder Selection

- Click **"Change Music Folder"** in the Tools section
- Select any folder containing your music files
- The app supports nested folder structures
- Multiple folder formats are automatically recognized

### Library Scanning

The app automatically:

- Scans all subfolders recursively
- Extracts metadata from audio files
- Generates album artwork thumbnails
- Creates searchable database entries
- Updates the library when files change (if folder watching is enabled)

### Supported Folder Structures

Que-Music works with any folder organization:

```
Music/
├── Artist Name/
│   ├── Album Name/
│   │   ├── 01 - Track Name.mp3
│   │   └── 02 - Another Track.flac
├── Various Artists/
├── Soundtracks/
└── Singles/
```

### Metadata Handling

- **Automatic Extraction**: Title, artist, album, genre, year, track number
- **Album Artwork**: Embedded images or folder art (folder.jpg, cover.png, etc.)
- **Unicode Support**: Full support for international characters
- **Special Characters**: Handles spaces, apostrophes, and symbols correctly

---

## 🎮 Audio Player Controls

### Playback Controls

**Main Controls:**

- **Play/Pause** ⏯️ - Start or pause current track
- **Previous** ⏮️ - Go to previous track
- **Next** ⏭️ - Skip to next track
- **Shuffle** 🔀 - Enable random track order
- **Repeat** 🔁 - Repeat current track or playlist

**Additional Controls:**

- **Volume Slider** 🔊 - Adjust playback volume (0-100%)
- **Mute Button** 🔇 - Quickly mute/unmute audio
- **Progress Bar** - Seek to any position in the current track
- **Time Display** - Current position and total duration

### Playing Music

**Starting Playback:**

- **Double-click** any track to play immediately
- **Right-click** track → "Play Now"
- **Right-click** track → "Add to Queue"

**Queue Management:**

- Tracks play in order from the selected folder or playlist
- Use shuffle to randomize playback order
- Repeat modes: Off, Repeat All, Repeat One

### Audio Visualization

- **Toggle Visualizer** - Click the visualizer button in bottom-right
- **Change Visualization** - Right-click visualizer button to cycle through types
- **Visualization Types**: Bars, circles, waveform, and more
- **Real-time Audio Analysis** - Responds to music frequency and amplitude

---

## 📝 Playlist System

### Creating Playlists

**Method 1: From Sidebar**

1. Click **"Create Playlist"** in the Playlists section
2. Enter playlist name and optional description
3. Click "Create Playlist"

**Method 2: From Selected Tracks**

1. Select multiple tracks (Ctrl+click or Shift+click)
2. Right-click selection → "Add to Playlist" → "Create New Playlist"
3. Enter playlist details

### Managing Playlists

**Adding Tracks:**

- Drag and drop tracks onto playlist
- Right-click track → "Add to Playlist" → Select playlist
- Use multi-select to add multiple tracks at once

**Editing Playlists:**

- Right-click playlist → "Edit" to change name/description
- Right-click playlist → "Clear Tracks" to remove all songs
- Drag tracks within playlist to reorder

**Playlist Context Menu:**

- **Play** - Start playing the playlist
- **Shuffle & Play** - Play playlist in random order
- **Edit** - Modify playlist details
- **Duplicate** - Create a copy of the playlist
- **Export to M3U** - Save as M3U file for other players
- **Clear Tracks** - Remove all tracks (keeps playlist)
- **Delete Playlist** - Remove playlist completely

### M3U Export/Import

- **Automatic Export**: Playlists are automatically saved as M3U files in your music folder
- **Manual Export**: Right-click playlist → "Export to M3U"
- **Import**: M3U files in your music folder are automatically detected and imported
- **Compatibility**: Works with other music players that support M3U format

---

## 🔍 Search & Discovery

### Search Functionality

**Global Search:**

- Click the **Search button** 🔍 in the header
- Search across all metadata: title, artist, album, genre
- Results update in real-time as you type
- Case-insensitive search with partial matching

**Search Tips:**

- Search by artist: "Beatles"
- Search by album: "Abbey Road"
- Search by genre: "Rock"
- Combined search: "Beatles Help"
- Use quotes for exact phrases: "Yesterday"

### Discovery Features

**Recently Played:**

- Automatic tracking of your listening history
- Shows last played date and play count
- Quick access to recently enjoyed music

**Favorites:**

- Click the ⭐ heart button on any track to favorite
- Access all favorites from the sidebar
- Favorites persist across app restarts

**Now Playing Queue:**

- View and modify the current playback queue
- See what's coming up next
- Reorder tracks in the queue

---

## 🎨 Themes & Customization

### Theme Options

**Available Themes:**

- **Dark Theme** - Modern dark interface (default)
- **Light Theme** - Clean light interface
- **Auto (System)** - Matches your system theme

**Changing Themes:**

- Click the **Theme Toggle** button ☀️/🌙 in the header
- Or go to Settings → Appearance → Theme
- Theme changes apply immediately

### Visual Customization

**View Modes:**

- **List View** - Compact track listing with details
- **Grid View** - Album-style grid layout
- Toggle between views using buttons in content header

**Sorting Options:**

- Sort by: Title, Artist, Album, Year, Duration
- Ascending or descending order
- Sorting preferences are saved

---

## 📚 Help System

### Accessing Help

**Quick Access:**

- **F1 Key** - Press F1 anywhere in the app to open help instantly
- **Help Button** - Click the ❓ help button in the header
- **Context-Sensitive** - Help content adapts to your current view

### Help Features

**Comprehensive Documentation:**

- **10 Help Topics** covering all aspects of Que-Music
- **Search Functionality** - Find specific help topics quickly
- **Interactive Content** - Click topics to view detailed information
- **Real-time Search** - Results update as you type

### Available Help Topics

1. **🏁 Getting Started** - Installation, setup, and first steps
2. **🖥️ User Interface Guide** - Understanding the layout and navigation
3. **🎵 Music Library Management** - Organizing and managing your music
4. **🎮 Audio Player Controls** - Playback features and audio visualization
5. **📝 Playlist System** - Creating and managing playlists with M3U support
6. **🔍 Search & Discovery** - Finding and exploring your music collection
7. **🎨 Settings & Themes** - Customizing appearance and preferences
8. **⌨️ Keyboard Shortcuts** - Complete list of keyboard shortcuts
9. **🗄️ Database Management** - Library maintenance and optimization
10. **🔧 Troubleshooting** - Common issues and solutions

### Help System Features

**User-Friendly Design:**

- **Modal Layout** - Help opens in a dedicated, easy-to-read modal
- **Sidebar Navigation** - Browse topics using the organized sidebar
- **Theme Integration** - Help system matches your selected theme (dark/light)
- **Responsive Design** - Works perfectly on different screen sizes

**Advanced Functionality:**

- **Built-in Search** - Search across all help content
- **Topic Filtering** - Find relevant topics based on keywords
- **Contextual Help** - Get help relevant to your current activity
- **Keyboard Navigation** - Navigate help using keyboard shortcuts

---

## 🗄️ Database Management

### Database Manager

Access via **Tools** → **Database Manager** to perform maintenance tasks:

**Library Statistics:**

- Total tracks, artists, albums
- Database file size and location
- Last scan date and duration

**Maintenance Operations:**

- **Refresh Library** - Re-scan music folder for changes
- **Update Track Durations** - Recalculate missing duration information
- **Fix Missing Metadata** - Attempt to repair incomplete track information
- **Clean Database** - Remove orphaned entries and optimize performance
- **Export Database** - Backup your library database

**Troubleshooting Tools:**

- **Rebuild Database** - Complete database reconstruction
- **Reset Playlists** - Clear all playlist data
- **Clear Cache** - Remove temporary files and thumbnails

### Data Storage

**Database Location:**

- Windows: `%APPDATA%\que-music\music-library.db`
- macOS: `~/Library/Application Support/que-music/music-library.db`
- Linux: `~/.config/que-music/music-library.db`

**Playlist Storage:**

- SQLite database (primary storage)
- M3U files in `{Music Folder}/Playlists/` (backup/export)

---

## ⌨️ Keyboard Shortcuts

### Global Shortcuts

- **Space** - Play/Pause
- **F1** - Open help system
- **Ctrl+F** - Open search
- **Ctrl+T** - Toggle theme
- **Ctrl+,** - Open settings
- **Ctrl+Shift+D** - Open database manager

### Playback Shortcuts

- **← →** - Seek backward/forward in track
- **↑ ↓** - Volume up/down
- **Ctrl+←** - Previous track
- **Ctrl+→** - Next track
- **Ctrl+R** - Toggle repeat mode
- **Ctrl+S** - Toggle shuffle mode

### Navigation Shortcuts

- **Ctrl+1-9** - Switch between sidebar sections
- **Enter** - Play selected track
- **Delete** - Remove from playlist (when in playlist view)

---

## ⚙️ Settings

Access settings via the **Settings button** ⚙️ in the header.

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

- **Debug Logging**: Enable detailed logging for troubleshooting
- **Buffer Size**: Audio processing buffer size

---

## 🎧 Supported Audio Formats

### Fully Supported Formats

- **MP3** - MPEG Audio Layer 3
- **FLAC** - Free Lossless Audio Codec
- **WAV** - Waveform Audio Format
- **M4A/AAC** - Advanced Audio Codec
- **OGG** - Ogg Vorbis
- **WMA** - Windows Media Audio

### Metadata Support

- **ID3v1/v2** tags (MP3)
- **Vorbis Comments** (FLAC, OGG)
- **MP4 tags** (M4A, AAC)
- **Embedded Album Art**
- **Unicode metadata**

### Quality Support

- **Bit rates**: 32 kbps to 320+ kbps
- **Sample rates**: 8 kHz to 192 kHz
- **Bit depths**: 8-bit to 24-bit
- **Channels**: Mono, Stereo, Multi-channel

---

## 🔧 Troubleshooting

### Common Issues

**App Won't Start:**

- Check that all dependencies are installed
- Run `npm install` in the app directory
- Try `npm run rebuild` to rebuild native modules

**Music Not Loading:**

- Verify the music folder path is correct
- Check file permissions on the music folder
- Ensure audio files are in supported formats
- Try refreshing the library from Database Manager

**Audio Not Playing:**

- Check system audio settings
- Verify audio files aren't corrupted
- Try different audio formats
- Restart the application

**Search Not Working:**

- Clear search cache in Database Manager
- Rebuild the database if needed
- Check that files have proper metadata

**Playlists Missing:**

- Check that playlist folder exists in music directory
- Re-import M3U files from Database Manager
- Verify playlist files aren't corrupted

### Performance Issues

**Slow Library Loading:**

- Enable database optimization in settings
- Consider smaller music folder structures
- Increase audio buffer size in advanced settings

**High Memory Usage:**

- Reduce album art cache size
- Disable visualizer if not needed
- Close unnecessary browser tabs (Electron-based)

### File Path Issues

**Special Characters in Filenames:**

- Que-Music supports Unicode characters
- Avoid extremely long file paths (>260 characters on Windows)
- Use standard characters when possible

---

## 💻 Technical Information

### System Requirements

**Minimum:**

- **OS**: Windows 10, macOS 10.12, Ubuntu 16.04 or equivalent
- **RAM**: 4 GB
- **Storage**: 100 MB for app + space for music library database
- **Audio**: Standard audio output device

**Recommended:**

- **OS**: Latest versions of Windows, macOS, or Linux
- **RAM**: 8 GB or more
- **Storage**: SSD for better performance
- **Audio**: High-quality audio interface for best sound

### Architecture

**Technology Stack:**

- **Electron** v28.0.0 - Cross-platform desktop app framework
- **Node.js** v16+ - Backend runtime environment
- **SQLite** - Local database with better-sqlite3 v12.2.0
- **Web Audio API** - Audio processing and real-time visualization
- **HTML5/CSS3/JavaScript** - Modern responsive user interface
- **Sharp** v0.32.6 - High-performance image processing
- **music-metadata** v7.14.0 - Audio metadata extraction

**Key Components:**

- **Main Process** - Electron main process, database operations
- **Renderer Process** - User interface and audio playback
- **Music Scanner** - Metadata extraction and file processing
- **Database Layer** - SQLite with optimized queries
- **Audio Engine** - Web Audio API with visualization

### File Structure

```
que-music/
├── main.js                 # Electron main process
├── client/                 # Renderer process files
│   ├── pages/             # HTML pages
│   ├── scripts/           # JavaScript modules
│   └── styles/            # CSS stylesheets
├── server/                # Backend services
│   ├── database.js        # Database operations
│   └── music-scanner.js   # File scanning
└── assets/                # Images and icons
```

### Privacy & Data

**Local Storage Only:**

- All data stored locally on your device
- No data transmitted to external servers
- No telemetry or usage tracking
- Complete privacy and control

**Data Files:**

- Music library database (SQLite)
- User preferences and settings
- Album artwork thumbnails
- Playlist files (M3U format)

---

## 📄 License & Credits

### Que-Music

- **Version**: 3.0.1
- **License**: MIT License
- **Developer**: Erich Quade
- **GitHub**: [ErichQuade/que-music](https://github.com/ErichQuade/que-music)

### Third-Party Libraries

- **Electron** - MIT License
- **better-sqlite3** - Apache 2.0 License
- **sharp** - Apache 2.0 License (image processing)
- **music-metadata** - MIT License (metadata extraction)

### Acknowledgments

- Icon design and UI inspiration
- Community feedback and testing
- Open-source audio processing libraries

---

## 📧 Support & Feedback

### Getting Help

1. **Check this README** - Most questions are answered here
2. **Database Manager** - Use built-in troubleshooting tools
3. **GitHub Issues** - Report bugs or request features
4. **Community Forums** - Connect with other users

### Reporting Issues

When reporting bugs, please include:

- Operating system and version
- Que-Music version
- Steps to reproduce the issue
- Any error messages
- Screenshots if applicable

### Feature Requests

We welcome suggestions for new features! Please check existing requests before submitting new ones.

---

**🎵 Enjoy your music with Que-Music! 🎵**

_Last Updated: January 2025_  
_Documentation Version: 3.0.1_
