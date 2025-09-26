/**
 * Simple Universal Logger
 * Drop this file into any JavaScript project for 5-level logging
 *
 * Usage:
 *   const logger = new SimpleLogger();
 *   logger.setLevel('HIGH');
 *   logger.error('Something went wrong', { error: 'details' });
 *   logger.info('User logged in', { userId: 123 });
 *
 * Levels: NONE, LOW, MED, HIGH, DEV
 */

class SimpleLogger {
    /**
     * Constructs a new SimpleLogger instance with comprehensive configuration options
     * Initializes logging levels, formatting preferences, and output destinations
     *
     * @param {Object} options - Configuration object for customizing logger behavior
     * @param {string} options.level - Logging level filter ('NONE', 'LOW', 'MED', 'HIGH', 'DEV')
     * @param {string} options.appName - Application name displayed in log entries
     * @param {boolean} options.enableConsole - Whether to output logs to console (default: true)
     * @param {boolean} options.enableFileLogging - Whether to write logs to files (default: true)
     * @param {string} options.logDirectory - Directory path for log files (default: 'logs')
     * @param {boolean} options.humanReadableTime - Use readable timestamps vs ISO format (default: true)
     * @param {boolean} options.showProcessId - Include process ID in log entries (default: true)
     * @param {boolean} options.compactMode - Use shorter log format for development (default: false)
     * @param {boolean} options.enableColors - Apply ANSI color codes to console output (default: true)
     * @param {string} options.dataFormat - Format for structured data: 'json', 'keyvalue', 'inline' (default: 'json')
     */
    constructor(options = {}) {
        /**
         * Internal numeric levels for filtering log messages
         * Each level corresponds to a specific type of log entry
         * Higher numbers indicate more verbose logging
         */
        this.levels = {
            NONE: 0,   // No logging - all messages filtered out
            ERROR: 1,  // Critical errors that may cause application failure
            WARN: 2,   // Warning messages about potential issues
            INFO: 3,   // Informational messages about application flow
            DEBUG: 3,  // Debug information (same priority as INFO)
            DEV: 4     // Development-only messages, most verbose
        };

        /**
         * User-friendly level names mapping to internal numeric values
         * Determines which message types are displayed based on current setting
         */
        this.levelNames = {
            NONE: 0,  // Shows nothing - all logging disabled
            LOW: 1,   // Shows ERROR messages only - critical issues
            MED: 2,   // Shows ERROR + WARN messages - important notifications
            HIGH: 3,  // Shows ERROR + WARN + INFO + DEBUG - comprehensive logging
            DEV: 4    // Shows everything including DEV messages - full verbosity
        };

        // Core configuration - determines which messages pass through the filter
        this.currentLevel = this.levelNames[options.level || 'NONE'];

        // Application identifier - appears in every log entry for multi-app environments
        this.appName = options.appName || 'App';

        // Output destination controls - determines where log messages are sent
        this.enableConsole = options.enableConsole !== false;      // Console output (terminal/browser)
        this.enableFileLogging = options.enableFileLogging !== false; // File system logging
        this.logDirectory = options.logDirectory || 'logs';         // Target directory for log files

        // Formatting configuration - controls how log messages are structured and displayed
        this.humanReadableTime = options.humanReadableTime !== false; // '2025-09-24 10:30:45.123' vs ISO format
        this.showProcessId = options.showProcessId !== false;         // Include process ID in log entries
        this.compactMode = options.compactMode === true;              // Shorter format: '10:30:45 ERROR App Message'
        this.enableColors = options.enableColors !== false;          // ANSI color codes for console output
        this.dataFormat = options.dataFormat || 'json';              // How structured data is serialized

        /**
         * Preserve original console methods for restoration
         * Allows console replacement feature to be safely reversed
         * Stores references before any potential method interception
         */
        this.originalConsole = {
            log: console.log,     // Standard logging output
            info: console.info,   // Informational messages
            warn: console.warn,   // Warning messages
            error: console.error, // Error messages
            debug: console.debug  // Debug messages
        };

        // State tracking for console replacement feature
        this.consoleReplaced = false; // Whether console methods have been intercepted
        this.logFilePath = null;      // Current log file path (set during initialization)

        /**
         * ANSI color codes for terminal/console output formatting
         * Each code represents a specific color or formatting directive
         * These are stripped from file output to maintain clean text logs
         */
        this.colors = {
            reset: '\x1b[0m',    // Clear all formatting - return to default
            bright: '\x1b[1m',   // Bold text weight
            dim: '\x1b[2m',      // Dimmed/faded text appearance
            red: '\x1b[31m',     // Red foreground color
            green: '\x1b[32m',   // Green foreground color
            yellow: '\x1b[33m',  // Yellow foreground color
            blue: '\x1b[34m',    // Blue foreground color
            magenta: '\x1b[35m', // Magenta foreground color
            cyan: '\x1b[36m',    // Cyan foreground color
            white: '\x1b[37m',   // White foreground color
            gray: '\x1b[90m'     // Gray foreground color
        };

        /**
         * Color mapping for each log level - provides visual hierarchy
         * Associates each message type with appropriate color for quick recognition
         * Passed to formatMessage() for console output styling
         */
        this.levelColors = {
            ERROR: this.colors.red,     // Red - critical issues, immediate attention
            WARN: this.colors.yellow,   // Yellow - caution, potential problems
            INFO: this.colors.cyan,     // Cyan - neutral information, standard flow
            DEBUG: this.colors.green,   // Green - debugging info, positive context
            DEV: this.colors.magenta    // Magenta - development-only, special case
        };

        /**
         * Initialize file logging system if running in Node.js/Electron environment
         * Browser environments skip this step as file system access is restricted
         *
         * Triggers creation of log directory and sets up daily log file rotation
         * Passes control to initializeFileLogging() for setup process
         */
        if (typeof process !== 'undefined' && this.enableFileLogging) {
            this.initializeFileLogging();
        }
    }

    /**
     * Updates the current logging level filter
     * Controls which types of messages are processed and displayed
     *
     * @param {string} level - New logging level ('NONE', 'LOW', 'MED', 'HIGH', 'DEV')
     * @returns {boolean} True if level was valid and set, false if invalid level provided
     *
     * Passes the new level setting to internal filtering mechanism
     */
    setLevel(level) {
        if (this.levelNames.hasOwnProperty(level)) {
            this.currentLevel = this.levelNames[level];
            return true;
        }
        return false;
    }

    /**
     * Retrieves the current logging level setting
     * Returns the human-readable level name currently in use
     *
     * @returns {string} Current level name ('NONE', 'LOW', 'MED', 'HIGH', 'DEV')
     *
     * Passes back the current filter setting for external inspection
     */
    getLevel() {
        return Object.keys(this.levelNames)[this.currentLevel] || 'NONE';
    }

    /**
     * Determines whether a message should be processed based on current level filter
     * Compares message importance against configured logging threshold
     *
     * @param {string} level - Message level to check ('ERROR', 'WARN', 'INFO', 'DEBUG', 'DEV')
     * @returns {boolean} True if message should be logged, false if filtered out
     *
     * Passes filtering decision to core logging pipeline - acts as gatekeeper
     */
    shouldLog(level) {
        if (this.currentLevel === this.levelNames.NONE) return false;
        return this.levels[level] <= this.currentLevel;
    }

    /**
     * Converts Date object into formatted timestamp string for log entries
     * Supports both human-readable and ISO formats with compact mode option
     *
     * @param {Date} date - JavaScript Date object to format
     * @returns {string} Formatted timestamp string
     *
     * Output formats:
     * - Human readable full: '2025-09-24 10:30:45.123'
     * - Human readable compact: '10:30:45.123'
     * - ISO format: '2025-09-24T10:30:45.123Z'
     *
     * Passes formatted timestamp string to message formatting pipeline
     */
    formatTimestamp(date) {
        if (this.humanReadableTime) {
            // Extract date/time components with zero-padding for consistent formatting
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');   // Month is 0-indexed
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const seconds = String(date.getSeconds()).padStart(2, '0');
            const ms = String(date.getMilliseconds()).padStart(3, '0');   // Milliseconds for precision

            if (this.compactMode) {
                // Compact format for development - time only, saves horizontal space
                return `${hours}:${minutes}:${seconds}.${ms}`;
            } else {
                // Full format for production - complete date and time
                return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}`;
            }
        } else {
            // ISO format for standardized parsing by external tools
            return date.toISOString();
        }
    }

    /**
     * Transforms structured data objects into formatted strings for log output
     * Supports multiple serialization formats based on configuration and use case
     *
     * @param {any} data - Data to format (object, primitive, or null)
     * @returns {string} Formatted data string ready for log entry
     *
     * Supported formats:
     * - JSON: '{"key":"value","num":123}' - Standard structured format
     * - Key-Value: 'key=value num=123' - Shell-friendly parsing
     * - Inline: 'key: value, num: 123' - Human-readable format
     *
     * Passes formatted data string back to message assembly process
     */
    formatData(data) {
        // Handle null, undefined, or non-object data
        if (!data || typeof data !== 'object') {
            return data ? String(data) : ''; // Convert primitives to string or empty
        }

        // Transform object based on configured data format preference
        switch (this.dataFormat) {
            case 'keyvalue':
                // Shell/config file friendly: key=value format, space-separated
                return Object.entries(data)
                    .map(([key, value]) => `${key}=${typeof value === 'object' ? JSON.stringify(value) : value}`)
                    .join(' ');

            case 'inline':
                // Human-readable format: key: value pairs, comma-separated
                return Object.entries(data)
                    .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
                    .join(', ');

            case 'json':
            default:
                // Standard JSON format - most compact and parseable by external tools
                return JSON.stringify(data);
        }
    }

    /**
     * Assembles complete log message by combining timestamp, level, app info, and data
     * Creates two distinct formats: colored console version and plain text file version
     *
     * @param {string} level - Log level ('ERROR', 'WARN', etc.)
     * @param {string} message - Primary message text
     * @param {Object|null} data - Optional structured data
     * @param {boolean} forConsole - Whether to apply colors and console formatting
     * @returns {string} Complete formatted log message
     *
     * Message structure:
     * - Standard: '[2025-09-24 10:30:45.123] [ERROR] [App:1234] Message | {data}'
     * - Compact: '10:30:45.123 ERROR App:1234 Message → data'
     * - Console: Colored version with ANSI codes
     * - File: Plain text version without colors
     *
     * Passes assembled message back to core logging pipeline for output routing
     */
    formatMessage(level, message, data = null, forConsole = false) {
        const now = new Date();
        const timestamp = this.formatTimestamp(now); // Get formatted timestamp string

        // Determine process identifier - 'browser' if no Node.js process available
        const pid = typeof process !== 'undefined' ? process.pid : 'browser';

        // Build message components based on compact mode setting
        const timeComponent = this.compactMode ? timestamp : `[${timestamp}]`;
        const levelComponent = this.compactMode ? level.padEnd(5) : `[${level}]`; // Pad for alignment
        const appComponent = this.showProcessId ?
            (this.compactMode ? `${this.appName}:${pid}` : `[${this.appName}:${pid}]`) :
            (this.compactMode ? this.appName : `[${this.appName}]`);

        // Apply ANSI color codes for console output (terminals/IDEs)
        if (forConsole && this.enableColors && typeof process !== 'undefined') {
            const levelColor = this.levelColors[level] || this.colors.white; // Color for message level
            const timeColor = this.colors.gray;  // Subtle timestamp color
            const appColor = this.colors.dim;    // Dimmed app identifier
            const reset = this.colors.reset;     // Reset formatting

            if (this.compactMode) {
                // Compact colored format: '10:30:45.123 ERROR App Message → data'
                let logEntry = `${timeColor}${timeComponent}${reset} ${levelColor}${levelComponent}${reset} ${appColor}${appComponent}${reset} ${message}`;
                if (data) {
                    const formattedData = this.formatData(data);
                    logEntry += ` ${this.colors.dim}→${reset} ${formattedData}`; // Arrow separator
                }
                return logEntry;
            } else {
                // Standard colored format: '[timestamp] [LEVEL] [App] Message | data'
                let logEntry = `${timeColor}${timeComponent}${reset} ${levelColor}${levelComponent}${reset} ${appColor}${appComponent}${reset} ${message}`;
                if (data) {
                    const formattedData = this.formatData(data);
                    logEntry += ` ${this.colors.dim}|${reset} ${formattedData}`; // Pipe separator
                }
                return logEntry;
            }
        } else {
            // Plain text format for file output or color-disabled environments
            if (this.compactMode) {
                // Compact plain format - space-efficient for development logs
                let logEntry = `${timeComponent} ${levelComponent} ${appComponent} ${message}`;
                if (data) {
                    const formattedData = this.formatData(data);
                    logEntry += ` → ${formattedData}`; // Arrow separator (no color)
                }
                return logEntry;
            } else {
                // Standard plain format - comprehensive for production logs
                let logEntry = `${timeComponent} ${levelComponent} ${appComponent} ${message}`;
                if (data) {
                    const formattedData = this.formatData(data);
                    logEntry += ` | ${formattedData}`; // Pipe separator (no color)
                }
                return logEntry;
            }
        }
    }

    /**
     * Sets up file logging system including directory creation and log file path generation
     * Creates directory structure and establishes daily log file naming convention
     *
     * File naming pattern: '{appName}-{YYYY-MM-DD}.log'
     * Example: 'MyApp-2025-09-24.log'
     *
     * Directory structure created:
     * project/
     * ├── logs/
     * │   ├── MyApp-2025-09-24.log
     * │   └── MyApp-2025-09-25.log
     * └── simple-logger.js
     *
     * Passes log file path to writeToFile() method for actual message writing
     * Disables file logging on error to prevent application crashes
     */
    initializeFileLogging() {
        // Skip file logging setup in browser environments (no file system access)
        if (typeof process === 'undefined') return;

        try {
            const fs = require('fs');   // Node.js file system module
            const path = require('path'); // Node.js path manipulation module

            // Create logs directory if it doesn't exist (recursive creates parent dirs)
            if (!fs.existsSync(this.logDirectory)) {
                fs.mkdirSync(this.logDirectory, { recursive: true });
            }

            // Generate daily log file name using current date
            const date = new Date().toISOString().split('T')[0]; // Extract YYYY-MM-DD portion
            this.logFilePath = path.join(this.logDirectory, `${this.appName}-${date}.log`);

        } catch (error) {
            // Graceful degradation - log error and disable file logging
            this.originalConsole.warn('Failed to initialize file logging:', error.message);
            this.enableFileLogging = false; // Prevents writeToFile() from being called
        }
    }

    /**
     * Appends formatted log message to the current daily log file
     * Handles file writing with error recovery and encoding specification
     *
     * @param {string} formattedMessage - Pre-formatted plain text log message (no ANSI codes)
     *
     * File operations:
     * - Uses appendFileSync for immediate disk write (ensures log persistence)
     * - Adds newline character for proper line separation
     * - UTF-8 encoding for proper character support
     * - Fails silently to prevent application crashes
     *
     * Receives plain text messages from core log() method
     * Passes completed log entries to file system for persistent storage
     */
    writeToFile(formattedMessage) {
        // Skip file writing if disabled, no file path set, or browser environment
        if (!this.enableFileLogging || !this.logFilePath || typeof process === 'undefined') {
            return;
        }

        try {
            const fs = require('fs');
            // Synchronous append ensures message is written before method returns
            // Adds newline for proper log file formatting
            fs.appendFileSync(this.logFilePath, formattedMessage + '\n', 'utf8');
        } catch (error) {
            // Non-fatal error handling - continues console logging even if file write fails
            // Common causes: permissions, disk full, file locked by other process
            this.originalConsole.warn('Failed to write to log file:', error.message);
        }
    }

    /**
     * Core logging method that processes and routes messages to appropriate outputs
     * Handles message formatting, console output, and file writing in a unified pipeline
     *
     * @param {string} level - Log level ('ERROR', 'WARN', 'INFO', 'DEBUG', 'DEV')
     * @param {string} message - Primary log message text
     * @param {Object|null} data - Optional structured data to include with message
     * @returns {string|undefined} Formatted console message if processed, undefined if filtered
     *
     * Processing flow:
     * 1. Checks shouldLog() filter - exits early if message should be suppressed
     * 2. Formats message twice: colored version for console, plain version for files
     * 3. Routes console message to appropriate console method (error, warn, info, debug)
     * 4. Passes plain text version to file writing system
     * 5. Returns formatted console message for potential external use
     */
    log(level, message, data = null) {
        if (!this.shouldLog(level)) return;

        // Generate two versions: rich console display and clean file storage
        const consoleMessage = this.formatMessage(level, message, data, true);  // With colors/formatting
        const fileMessage = this.formatMessage(level, message, data, false);    // Plain text for parsing

        if (this.enableConsole) {
            // Route to appropriate console method for proper browser/terminal handling
            switch (level) {
                case 'ERROR':
                    this.originalConsole.error(consoleMessage); // Red in most terminals
                    break;
                case 'WARN':
                    this.originalConsole.warn(consoleMessage);  // Yellow in most terminals
                    break;
                case 'INFO':
                    this.originalConsole.info(consoleMessage);  // Standard styling
                    break;
                case 'DEBUG':
                case 'DEV':
                    this.originalConsole.debug(consoleMessage); // Often filtered by default
                    break;
                default:
                    this.originalConsole.log(consoleMessage);   // Fallback for unknown levels
            }
        }

        // Pass plain text version to file writing system (no ANSI codes)
        this.writeToFile(fileMessage);

        // Return formatted message for chaining or external processing
        return consoleMessage;
    }

    /**
     * Convenience methods for each logging level
     * Each method passes its specific level type to the core log() method
     * Provides clean, semantic API for different message types
     */

    /**
     * Logs error messages - highest priority, always shown except at NONE level
     * Passes ERROR level and message data to core logging pipeline
     *
     * @param {string} message - Error description
     * @param {Object|null} data - Error context (error codes, stack traces, etc.)
     * @returns {string|undefined} Formatted message if logged
     */
    error(message, data = null) {
        return this.log('ERROR', message, data);
    }

    /**
     * Logs warning messages - shown at MED level and above
     * Passes WARN level and message data to core logging pipeline
     *
     * @param {string} message - Warning description
     * @param {Object|null} data - Warning context (thresholds, limits, etc.)
     * @returns {string|undefined} Formatted message if logged
     */
    warn(message, data = null) {
        return this.log('WARN', message, data);
    }

    /**
     * Logs informational messages - shown at HIGH level and above
     * Passes INFO level and message data to core logging pipeline
     *
     * @param {string} message - Information description
     * @param {Object|null} data - Contextual information (user IDs, states, etc.)
     * @returns {string|undefined} Formatted message if logged
     */
    info(message, data = null) {
        return this.log('INFO', message, data);
    }

    /**
     * Logs debug messages - shown at HIGH level and above (same as INFO)
     * Passes DEBUG level and message data to core logging pipeline
     *
     * @param {string} message - Debug information
     * @param {Object|null} data - Debug context (variables, states, timing)
     * @returns {string|undefined} Formatted message if logged
     */
    debug(message, data = null) {
        return this.log('DEBUG', message, data);
    }

    /**
     * Logs development messages - only shown at DEV level (most verbose)
     * Passes DEV level and message data to core logging pipeline
     *
     * @param {string} message - Development-specific information
     * @param {Object|null} data - Development context (performance, internal states)
     * @returns {string|undefined} Formatted message if logged
     */
    dev(message, data = null) {
        return this.log('DEV', message, data);
    }

    /**
     * Console method interception and replacement functionality
     * Captures all console.* calls and routes them through the logger system
     * Allows centralized control over all application output
     */

    /**
     * Replaces native console methods with logger-wrapped versions
     * Intercepts console.log, info, warn, error, debug calls throughout the application
     *
     * Method mapping:
     * - console.log() → logger.dev() (development level)
     * - console.info() → logger.info() (info level)
     * - console.warn() → logger.warn() (warning level)
     * - console.error() → logger.error() (error level)
     * - console.debug() → logger.debug() (debug level)
     *
     * Benefits:
     * - Unified formatting for all output (existing code doesn't need changes)
     * - File logging for console.* calls (persistent logs)
     * - Level filtering applied to console calls
     * - Structured data capture from unstructured console calls
     *
     * Passes intercepted console arguments to appropriate logger methods
     * Original methods stored in originalConsole for restoration
     */
    enableConsoleReplacement() {
        // Prevent double-replacement to avoid infinite recursion
        if (this.consoleReplaced) return;

        const self = this; // Capture logger instance for closure access

        // Replace console.log with development-level logger call
        console.log = function(...args) {
            self.dev('Console.log captured', { args: args });
        };

        // Replace console.info with info-level logger call
        console.info = function(...args) {
            self.info('Console.info captured', { args: args });
        };

        // Replace console.warn with warning-level logger call
        console.warn = function(...args) {
            self.warn('Console.warn captured', { args: args });
        };

        // Replace console.error with error-level logger call
        console.error = function(...args) {
            self.error('Console.error captured', { args: args });
        };

        // Replace console.debug with debug-level logger call
        console.debug = function(...args) {
            self.debug('Console.debug captured', { args: args });
        };

        this.consoleReplaced = true; // Mark as replaced to prevent re-replacement
    }

    /**
     * Restores original console methods to their native implementations
     * Removes logger interception and returns console to default behavior
     *
     * Use cases:
     * - Debugging the logger itself (prevents recursive logging)
     * - Third-party code that expects native console behavior
     * - Performance-critical sections (bypasses logger overhead)
     * - Testing scenarios requiring direct console access
     *
     * Passes control back to browser/Node.js native console implementations
     * Uses originalConsole references stored during constructor initialization
     */
    disableConsoleReplacement() {
        // Only restore if replacement is currently active
        if (!this.consoleReplaced) return;

        // Restore each console method to its original implementation
        console.log = this.originalConsole.log;     // Restore native console.log
        console.info = this.originalConsole.info;   // Restore native console.info
        console.warn = this.originalConsole.warn;   // Restore native console.warn
        console.error = this.originalConsole.error; // Restore native console.error
        console.debug = this.originalConsole.debug; // Restore native console.debug

        this.consoleReplaced = false; // Mark as restored
    }

    /**
     * Checks whether console method interception is currently active
     *
     * @returns {boolean} True if console methods are intercepted, false if using native methods
     *
     * Status indicators:
     * - true: All console.* calls are routed through logger system
     * - false: Console methods use native browser/Node.js implementations
     *
     * Passes current interception state to external code for conditional logic
     */
    isConsoleReplacementEnabled() {
        return this.consoleReplaced;
    }

    /**
     * Retrieves the current log file path being used for file output
     *
     * @returns {string|null} Absolute path to current log file, or null if not initialized
     *
     * Example return value: '/path/to/project/logs/MyApp-2025-09-24.log'
     * Passes file path information to external code for log file management
     */
    getLogFilePath() {
        return this.logFilePath;
    }

    /**
     * Checks whether file logging is currently active and functional
     *
     * @returns {boolean} True if messages are being written to files, false otherwise
     *
     * Returns false if:
     * - File logging was disabled in constructor options
     * - File system initialization failed
     * - Running in browser environment
     *
     * Passes logging status to external code for conditional behavior
     */
    isFileLoggingEnabled() {
        return this.enableFileLogging;
    }
}

/**
 * Universal module export for different JavaScript environments
 * Detects environment and exports logger class using appropriate method
 *
 * Environment detection:
 * - Node.js/Electron: Uses CommonJS module.exports
 * - Browser: Attaches to window global object
 * - ES6 modules: Can be imported using 'import' statement
 *
 * Passes SimpleLogger class to consuming code through environment-appropriate mechanism
 */
if (typeof module !== 'undefined' && module.exports) {
    // Node.js/Electron environment - CommonJS module system
    // Usage: const SimpleLogger = require('./simple-logger.js');
    module.exports = SimpleLogger;
} else if (typeof window !== 'undefined') {
    // Browser environment - global window object
    // Usage: const logger = new window.SimpleLogger(options);
    window.SimpleLogger = SimpleLogger;
}
// ES6 environments automatically export through 'export default SimpleLogger;' if needed