# Electron Startup Troubleshooting

Quick-reference for the "app won't start" failure class first hit and fixed 2025-10-05. Full root-cause writeup and the fix itself are in `docs/issues/CHANGELOG.md` under `[3.2.2] - 2025-10-05` — this doc is just the commands/checks, so they don't have to be re-derived from the fix narrative every time.

## Prevention already in place

`start-electron.js` (the wrapper `npm start`/`npm run dev` actually call — see `architecture.md`) strips `ELECTRON_RUN_AS_NODE` before spawning Electron, so the most common cause of this class of failure shouldn't recur. If it does anyway, or a new variant shows up, use the checks below.

## Common error patterns

| Error | Cause | Fix |
|---|---|---|
| `Cannot read properties of undefined (reading 'whenReady')` | `ELECTRON_RUN_AS_NODE=1` set — Electron running as plain Node | `unset ELECTRON_RUN_AS_NODE` or use the wrapper (already default) |
| `app.disableHardwareAcceleration() can only be called before app is ready` | Called inside `app.whenReady()` instead of before it | Must be called before `app.whenReady()` — already fixed in `main.js`, watch for regressions here |
| `Cannot find module 'better-sqlite3'` | Native module not rebuilt for this Electron version | `npx electron-rebuild -f -w better-sqlite3` |
| Electron reports a Node version instead of an Electron version | Running the Electron binary in Node mode | `./node_modules/electron/dist/electron.exe --version` should show the Electron version (currently 27.3.11), not a Node version |

## Diagnostic commands

```bash
# Check the env var that causes most of this
echo $ELECTRON_RUN_AS_NODE          # should be empty
env | grep -i electron

# Confirm Electron processes are actually running (not Node)
tasklist | findstr electron         # Windows
ps aux | grep electron              # Linux/Mac
# Expect 3-4 electron.exe processes: main, renderer, GPU helper

# Rebuild native modules after any dependency change
npx electron-rebuild -f -w better-sqlite3

# Kill stuck processes
taskkill //F //IM electron.exe      # Windows
pkill -9 electron                   # Linux/Mac
```

## Verbose logging for deeper debugging

Set the logger to `DEV` (Settings → Advanced → Logging level, or temporarily hardcode `level: 'DEV'` in `main.js`'s `SimpleLogger` instantiation — see `logger.md`). Logs land in `logs/QueMusicMain-YYYY-MM-DD.log` (dev) or `%APPDATA%/que-music/logs/` (production).

## If still stuck

1. `rm -rf node_modules && npm install` — clean reinstall
2. `npm run rebuild` — rebuild native modules
3. Confirm Node ≥16: `node --version`
4. Clear Electron cache: `rm -rf ~/AppData/Roaming/que-music/Cache`
