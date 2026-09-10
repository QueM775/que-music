# 🎨 Settings & Themes

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

- **Logging Level**: Choose logging verbosity level (see detailed explanation below)
- **Debug Logging (deprecated)**: Legacy logging toggle - use Logging Level instead
- **Buffer Size**: Audio processing buffer size
- **Performance Mode**: Optimize for speed vs features

### Logging System

The integrated logging system provides detailed application insights with 5 configurable levels:

#### Logging Levels Explained

**NONE** (Default - Clean Console)
- **Console**: No output (clean development console)
- **Log File**: No logging to file
- **Use Case**: Normal usage, production mode
- **Best For**: Users who don't need debugging information

**LOW** (Errors Only)
- **Console**: Critical errors only (❌ red)
- **Log File**: Error messages with stack traces
- **Use Case**: Minimal logging for troubleshooting crashes
- **Best For**: Identifying application-breaking issues
- **Example Messages**:
  - Database connection failures
  - File system errors
  - Audio playback crashes

**MED** (Errors + Warnings)
- **Console**: Errors (❌ red) + Warnings (⚠️ yellow)
- **Log File**: Errors and warnings with context
- **Use Case**: Standard troubleshooting
- **Best For**: Investigating unexpected behavior
- **Example Messages**:
  - Missing metadata in files
  - Invalid cover art
  - API request failures
  - Deprecated feature usage

**HIGH** (Info + Debug - Recommended for Troubleshooting)
- **Console**: Errors, warnings, info (ℹ️ blue), debug (🔍 gray)
- **Log File**: Comprehensive logging with structured data
- **Use Case**: Detailed troubleshooting and feature investigation
- **Best For**: Understanding application flow and debugging issues
- **Example Messages**:
  - Music library scan progress
  - Playlist creation/modification
  - Cover fetcher operations
  - Database queries and results
  - Settings changes

**DEV** (Everything - Maximum Verbosity)
- **Console**: All messages including development debug output
- **Log File**: Every operation logged with full context
- **Use Case**: Development and deep debugging
- **Best For**: Developers and advanced troubleshooting
- **Example Messages**:
  - Function entry/exit points
  - Variable state changes
  - Event listener registrations
  - Memory cleanup operations
  - Performance measurements

#### Logging Features

**Dual Output:**
- **Console**: Colored, real-time output with timestamps
- **File**: Clean text format for analysis and sharing

**File Management:**
- **Location**: `logs/` directory in application folder
- **Naming**: `QueMusicMain-YYYY-MM-DD.log` (main process)
- **Rotation**: New file created daily automatically
- **Format**: Plain text with timestamps and structured JSON data

**Structured Data:**
- Complex objects formatted as JSON for readability
- Error messages include full stack traces
- Contextual information (file paths, counts, states)
- Easy to search and filter

**Real-time Updates:**
- Logging level changes apply immediately
- No restart required
- Affects both console and file output instantly

#### When to Use Each Level

| Situation | Recommended Level |
|-----------|------------------|
| Normal daily use | **NONE** |
| App crashes or errors | **LOW** |
| Features not working | **MED** |
| Cover Fetcher troubleshooting | **HIGH** |
| Library scan investigation | **HIGH** |
| Performance issues | **HIGH** |
| Development work | **DEV** |
| Bug reports to developer | **HIGH** or **DEV** |

#### Accessing Log Files

1. **Set Logging Level**: Settings → Advanced → Logging Level → HIGH
2. **Reproduce Issue**: Perform the action that needs logging
3. **Find Log File**:
   - Windows: `C:\Users\[YourName]\AppData\Roaming\que-music\logs\`
   - macOS: `~/Library/Application Support/que-music/logs/`
   - Linux: `~/.config/que-music/logs/`
4. **Open File**: Use any text editor to view `QueMusicMain-YYYY-MM-DD.log`

#### Logging Best Practices

✅ **Use NONE for daily use** - Keeps console clean and improves performance
✅ **Switch to HIGH when troubleshooting** - Provides detailed information without overwhelming output
✅ **Use DEV only when needed** - Very verbose, can slow down application slightly
✅ **Share log files when reporting bugs** - Helps developers diagnose issues quickly
✅ **Check logs after crashes** - Error messages often explain what went wrong

## Settings Management

### Import/Export Settings

- Export settings for backup or sharing
- Import settings from previous installations
- Reset to default settings when needed
- Settings are automatically saved

### Profile Management

- Multiple configuration profiles
- Quick switching between setups
- Profile-specific music folders
- Backup and restore functionality

## Accessibility Options

### Display Options

- Font size adjustment
- High contrast mode support
- Keyboard navigation optimization
- Screen reader compatibility

### Audio Accessibility

- Visual audio level indicators
- Keyboard-only playback control
- Customizable keyboard shortcuts
- Audio feedback options
