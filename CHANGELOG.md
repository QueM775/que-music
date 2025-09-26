# Changelog

All notable changes to Que-Music will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.1.0] - 2025-09-26

### Added

- **Integrated Logging System**: Complete logging solution with 5 configurable levels
  - **Logging Levels**: NONE, LOW (errors), MED (errors + warnings), HIGH (info + debug), DEV (everything)
  - **File Logging**: Automatic daily log files in `logs/` directory with clean text output
  - **Console Logging**: Colored console output with timestamps and structured data
  - **User Control**: Logger level configurable via Settings → Advanced → Logging level
  - **Dual Output**: Simultaneous console and file logging with different formatting
  - **Process Identification**: Separate loggers for main process and renderer with clear identification
  - **Structured Data**: JSON formatting for complex objects and error details
  - **Daily Rotation**: Automatic log file rotation with date-based naming

### Enhanced

- **Settings Modal**: Added new logging level dropdown in Advanced settings section
- **Error Handling**: Improved error reporting with structured logging throughout the application
- **Debug Capabilities**: Enhanced debugging with persistent log files and detailed console output
- **Documentation**: Updated help files and CLAUDE.md with logging system information

### Technical

- **Main Process**: Integrated `simple-logger.js` with structured data logging
- **Renderer Process**: Browser-compatible logger instance with settings integration
- **UI Integration**: Logger level setting persisted and applied in real-time
- **File Management**: Automatic creation of logs directory and daily file management

### Files Modified

- `main.js` - Main process logger integration and console.log replacement
- `client/pages/index.html` - Added logger script and settings UI components
- `client/scripts/main-app.js` - Renderer logger integration
- `client/scripts/ui-controller.js` - Settings management and logger level control
- `simple-logger.js` - Universal logger (pre-existing, now integrated)
- Documentation files updated with logging information

## [3.0.5] - Previous Release

### Features
- Music library management
- Playlist system with M3U export
- Audio visualization
- Theme support (Dark, Light, Auto)
- Database management tools
- Advanced search capabilities
- Favorites and recently played tracking