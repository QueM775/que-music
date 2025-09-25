# 🎵 Music Library Management

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
- Updates the library when files change (if folder watching is enabled)

## Supported Folder Structures

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

### Updating Metadata

- Changes to file tags are detected automatically
- Use **Refresh Library** from Database Manager for manual updates
- **Update Track Durations** recalculates missing duration information

### Removing Music

- Deleted files are automatically removed from the library
- Use **Clean Database** to remove orphaned entries
- Playlists are updated to remove missing tracks

## Library Organization

### Viewing Options

- **List View**: Detailed track information in rows
- **Grid View**: Album artwork-focused display
- **Sort Options**: Title, Artist, Album, Year, Duration

### Filtering and Browsing

- Browse by folder structure in the left pane
- Use the search function for quick filtering
- View by Artists, Albums, or individual tracks
- Access Recently Played and Favorites for quick navigation
