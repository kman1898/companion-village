# Companion Village Launcher

A small desktop app, like Companion's own launcher, that serves the village on your network and opens it in your browser.
The village still runs in the browser. The launcher just hosts it and keeps it running in the tray / menu bar.

- **Launch Village**, **Clean output** (no overlay) and **Demo** buttons
- The village's address on every network interface, with **Copy** buttons
- **Interface** (all networks, this computer only, or one network) and **Port** (default `17880`)
- **Browser** to open the village in, **open on launch**, **start hidden** and **start at login**
- **URL options** added to every launch, e.g. `tribe=pixels&host=192.168.1.20:8000`
- Closing the window keeps the village running. Quit from the tray / menu bar or the **Quit** button.

The page is served over plain http, so it can reach Companion's HTTP API on the local network without the https
restrictions the GitHub Pages version runs into.

Villages are saved in the browser per address, so keep the port the same between shows. `localhost:17880` and
`192.168.x.x:17880` are separate villages.

## Install

Download the build for your computer from the [releases](../../releases):

| | |
|---|---|
| macOS | `companion-village-<version>-mac-universal.dmg` |
| Windows | `companion-village-<version>-win-setup.exe` (installer) or `-win-portable.exe` (no install) |
| Linux | `companion-village-<version>-linux-x86_64.AppImage` / `-arm64.AppImage` |

The builds are not signed with a paid developer certificate yet:
- **macOS:** the app is ad-hoc signed. The first time, right-click it → **Open**, or allow it under
  System Settings → Privacy & Security → **Open Anyway**.
- **Windows:** SmartScreen → **More info** → **Run anyway**.

## Development

```
npm install            # in the repo root and in launcher/
npm run dev            # in launcher/: builds the village, then starts the launcher
npm run dist:mac       # or dist:win / dist:linux: packages into launcher/release/
```

`npm run dev` copies the root `dist/index.html` into `app/village.html`. While developing, the launcher also falls back
to the repo's `dist/index.html`, so `npm run build` in the root and a reload picks up village changes.

```
src/main.ts       window, tray, settings and IPC
src/server.ts     the http server for the village page
src/settings.ts   settings file, network interfaces, addresses
src/browsers.ts   finding and opening installed browsers
src/login.ts      "start when I log in" on macOS, Windows and Linux
src/preload.ts    the window's bridge to the app (window.launcher)
ui/               the launcher window (plain HTML, CSS and JS)
build/            icon sources (SVG) and the 1024 px app icon; `npm run icons` re-renders them
assets/           window and tray icons
```

Pushing a tag like `launcher-v1.0.0` builds macOS, Windows and Linux in GitHub Actions
(`.github/workflows/launcher.yml`) and publishes them as a release.
