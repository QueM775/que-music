<!-- @format -->

# Logger — `simple-logger.js`

Universal logger used by both the main process and the renderer. Zero dependencies (`fs`/`path` only), drop-in, dual output (console + daily file).

## Log levels

- **NONE** — shows nothing (production default)
- **LOW** — ERROR only
- **MED** — ERROR + WARN
- **HIGH** — ERROR + WARN + INFO + DEBUG
- **DEV** — everything, including a `console.log` replacement

Set via Settings → Advanced → Logging level in-app, or `logger.setLevel('DEV')` programmatically. Current level: `logger.getLevel()`.

## Usage in this project

```javascript
// Main process (main.js)
const logger = new SimpleLogger({ appName: 'QueMusicMain', level: 'NONE' });
logger.error('Database connection failed', { error: error.message });

// Renderer (any client script)
this.app.logger.info('Settings applied', settings);
this.app.logger.warn('Feature not available');

// Music scanner (receives the main-process logger instance)
this.logger.debug('Scan progress', { scanned: 100, total: 500 });
```

**Rule**: every module that logs uses the logger (`logger.info()` / `.warn()` / `.error()` / `.debug()` / `.dev()`), never raw `console.log()`. Console output is also intercepted and routed through the logger automatically, so nothing is lost even if something slips through.

## Where logs go

- **Console**: color-coded (Error=red, Warn=yellow, Info=cyan, Debug=green, Dev=magenta), human-readable timestamps.
- **File**: `logs/QueMusicMain-YYYY-MM-DD.log` (dev) / `%APPDATA%/que-music/logs/` (production) — same content, no color codes, one file per day, directory auto-created.

## Constructor options (only the ones this project touches)

```javascript
new SimpleLogger({
  appName: 'QueMusicMain', // shown in every log line
  level: 'NONE', // NONE | LOW | MED | HIGH | DEV
});
```

Full option set (compact mode, data format, color toggle, custom log directory, etc.) is available if a future need comes up — see the source file's constructor for the complete list; not worth documenting here since nothing in Que-Music currently overrides the defaults beyond `appName`/`level`.
