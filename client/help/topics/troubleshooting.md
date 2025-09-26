# 🔧 Troubleshooting

## Common Issues

### App Won't Start

- Check that all dependencies are installed
- Run `npm install` in the app directory
- Try `npm run rebuild` to rebuild native modules

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

## Database Issues

### Database Corruption

1. Open Database Manager from Tools menu
2. Try "Clean Database" first
3. If that fails, use "Rebuild Database"
4. As last resort, delete the database file and rescan

### Missing Metadata

1. Open Database Manager
2. Click "Fix Missing Metadata"
3. If still missing, check file tags with another program
4. Re-import files with proper metadata

## Network and Permissions

### Permission Denied Errors

- Run application as administrator (Windows)
- Check folder permissions for music directory
- Ensure antivirus isn't blocking file access

### Files on Network Drives

- Ensure network connection is stable
- Use mapped drives rather than UNC paths
- Consider copying files to local drive for better performance

## Getting Help

### Debug Information

The integrated logging system provides comprehensive debugging capabilities:

1. **Set Logging Level**: Go to Settings → Advanced → Logging Level → Development
2. **View Console Output**: Press Ctrl+Shift+I (or Cmd+Option+I on Mac) to open DevTools
3. **Check Log Files**: Look in the `logs/` directory for detailed file logs
4. **Structured Data**: All logs include contextual information and error details

**Useful Log Information**:
- **Database operations**: Connection status, query performance, errors
- **File loading**: Path resolution, permission issues, format problems
- **Audio playback**: Source loading, codec issues, playback state changes
- **Settings changes**: Configuration updates, validation errors
- **Memory usage**: Performance monitoring and cleanup activities

**Log File Locations**:
- Main process: `logs/QueMusicMain-YYYY-MM-DD.log`
- Daily rotation with automatic cleanup
- Plain text format for easy analysis

### Reporting Bugs

When reporting issues, include:

- Operating system and version
- Que-Music version
- Steps to reproduce the issue
- Any error messages
- Screenshots if applicable

### Community Support

- Check existing issues on GitHub
- Search documentation for similar problems
- Provide detailed information when asking for help
