# Que-Music Project Structure

**Last verified**: 2026-09-14 (full pass — every path below was checked against the actual filesystem, not carried over from an older version of this doc; added four `application/` docs that existed on disk but were missing from this map. Same day, added the new `docs/superpowers/` and `scripts/dev-verify/` folders created during the smart playlists feature.)

## Overview

This document outlines the folder structure and organization of the Que-Music application. See [architecture.md](./architecture.md) for how these pieces talk to each other, and [css-architecture.md](./css-architecture.md) for how the CSS bundle is built.

---

## Root Directory Structure

```
que-music/
├── .vscode/                    # VS Code workspace settings
├── assets/                     # Static assets (icons, images, covers)
├── BAT-Files/                  # Local utility batch files (gitignored — machine-specific)
├── client/                     # Frontend application code (renderer process)
├── docs/                       # Documentation, see below
├── scripts/
│   └── dev-verify/             # Standalone Node scripts verifying features with no test framework
├── server/                     # Backend services (main-process modules)
├── .gitignore
├── .prettierrc.js
├── build-css.js                # Bundles client/styles/*.css into bundled.css — run after any CSS edit
├── CLAUDE.md                   # Instructions for AI assistants working in this repo
├── main.js                     # Electron main process entry point + all IPC handlers
├── package.json
├── package-lock.json
├── simple-logger.js            # Universal logger (main + renderer)
├── start-electron.js           # Dev launch helper
└── README.md
```

`CLAUDE.md` and `README.md` are the only loose docs at repo root by convention (tooling looks for `CLAUDE.md` there, and `README.md` is the standard project entry point) — everything else lives under `docs/`.

---

## `/docs/` — Documentation

Two hand-maintained folders (`issues/`, `application/`), plus `superpowers/` — the fixed output location the Claude Code `superpowers` skill set writes design specs and implementation plans to (`brainstorming`/`writing-plans` skills). If something doesn't fit `issues/` or `application/`, it probably needs its own file inside one of them rather than a new top-level folder — `superpowers/` is the one deliberate exception, since its path is a skill convention, not a project choice.

```
docs/
├── issues/
│   ├── issues_track.md     # THE bug/feature tracker — chronological, newest first
│   └── CHANGELOG.md        # Release notes
├── application/
│   ├── architecture.md                     # App architecture & execution flow
│   ├── folder-structure.md                 # This file
│   ├── css-architecture.md                 # How the CSS bundle is built and ordered
│   ├── database-schema.sql                 # The real, current DB schema
│   ├── album-art.md                        # Album art resolution priority order
│   ├── visualizer.md                       # Visualizer keyboard shortcuts
│   ├── logger.md                           # Logging system usage
│   ├── packaging-guide.md                  # Electron Builder distribution guide
│   ├── electron-startup-troubleshooting.md # Common startup failure modes
│   ├── compared.md                         # Feature/polish comparison vs. Nagi (research only)
│   ├── roadmap.md                          # Where the app goes next, priority order
│   ├── layout-redesign.md                  # 4-column resizable layout spec (built 2026-09-13)
│   └── lyrics-feature.md                   # Plain-text lyrics design decision (built 2026-09-13)
└── superpowers/
    ├── specs/2026-09-14-smart-playlists-design.md   # Smart playlists design spec
    └── plans/2026-09-14-smart-playlists.md          # Smart playlists implementation plan
```

---

## `/assets/` — Static Resources

```
assets/
├── covers/
│   └── sample-cover.jpg        # Default album cover fallback
├── icons/
│   ├── icon.ico
│   ├── icon64.ico
│   └── music.ico
└── images/
    ├── QueMusic.png
    ├── QueMusicDark.png        # Dark-theme header logo
    └── QueMusicLight.png       # Light-theme header logo
```

---

## `/server/` — Backend Services (main process)

```
server/
├── database.js         # MusicDatabase class — all SQLite access (better-sqlite3)
├── music-scanner.js     # Library scan: metadata extraction, duration, filename parsing
├── path-manager.js      # Resolves asset/cover/settings paths for both dev and packaged builds
└── cover-fetcher.js      # Batch album-art fetcher (MusicBrainz / Cover Art Archive)
```

## `/client/` — Frontend Application (renderer process)

```
client/
├── help/
│   ├── topics/              # Markdown help topics, rendered in-app
│   ├── help-content.json    # Help topic registry
│   └── help.css
├── pages/
│   └── index.html           # The only HTML page — links exactly one stylesheet, bundled.css
├── scripts/
│   ├── main-preload.js      # contextBridge — the ONLY file with Node access in the renderer tier
│   ├── main-app.js          # App coordinator — creates the app on DOMContentLoaded, delegates to the modules below
│   ├── core-audio.js        # Playback engine, visualizer, Web Audio graph
│   ├── library-manager.js   # Library scan UI, folder tree, search/filter views
│   ├── playlist-renderer.js # Playlist CRUD, M3U export, drag-and-drop reorder
│   ├── ui-controller.js     # Theme, context menus, modals, view switching
│   ├── window-controls.js   # Minimize/maximize/close button wiring
│   ├── cover-fetcher-ui.js  # Cover Fetcher modal controller
│   └── help-manager.js      # In-app help viewer (the only HelpManager — no stub variant anymore)
└── styles/                  # See css-architecture.md for the full bundle order
```

---

## File Organization Principles

- **Docs**: two folders only (`issues/`, `application/`) — see above. No loose `.md`/`.txt` files anywhere in the repo outside those two folders and the root's `README.md`/`CLAUDE.md`.
- **Renderer never touches Node directly**: only `main-preload.js` uses `require()`/`process`/`Buffer` — confirmed via full-repo grep as of the 2026-09-11 cleanup, which is also why `nodeIntegration` was safe to turn off in `main.js`.
- **One CSS bundle**: `client/pages/index.html` loads only `bundled.css`; `build-css.js` is the only thing that assembles it. Never hand-edit `bundled.css`.
