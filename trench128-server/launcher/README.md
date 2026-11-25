# Trench 128 launcher (Windows)

The program players download from your website. It shows patch notes and a server browser, remembers their callsign,
and opens the game on the server they pick. It updates itself.

**How it fits together.** The game itself is not inside the launcher. Every Trench 128 server already serves the game
page, so Play opens that page in a game window (fullscreen, mouse capture, no browser bars). The game is therefore
always the version the server runs: you update a server and every player gets the new game on their next join. The
launcher only has to update itself, and only when you change the launcher.

## What's in here

| File | What it does |
|---|---|
| `main.js` | The app: launcher window, game window, server list and pings, self-update |
| `preload-launcher.js`, `preload-game.js` | The only bridge between the pages and the app (a few named calls) |
| `lib/servers.js`, `lib/settings.js` | Server addresses, server list, settings file: checked and unit-tested |
| `ui/` | The launcher page (`news.json` = the patch notes shown when no news URL is set) |
| `defaults.json` | Built-in settings: your server list address, always-listed servers, news URL, website / Discord links |
| `build/icon.ico`, `build/icon.png` | App and installer icon |
| `test/` | `npm test` (logic) and `node test/ui.browser.js` (the page in a real browser) |
| `../.github/workflows/launcher.yml` | Builds the installer on GitHub and publishes the release that updates come from |

## One-time setup

1. **Point it at your servers.** Edit `defaults.json`:
   - `masterUrl`: a server started with `--registry` (its `/servers` list fills the browser), e.g. `https://play.example.com`
   - `servers`: addresses always listed, e.g. `["https://play.example.com"]`
   - `site`, `discord`: optional https links shown in Settings
2. **Choose where updates live** (`build.publish` in `package.json`):
   - **GitHub Releases (set up already):** replace `YOUR_GITHUB_USER` and the repository name. Players' launchers
     download releases without logging in, so that repository must be **public**. Your code can stay private: make a
     small public repository just for releases, add a personal access token (scope `repo`) as the secret
     `GH_RELEASE_TOKEN` in the private one, and point `publish` at the public one.
   - **Your own web server instead:** use
     `"publish": [{ "provider": "generic", "url": "https://play.example.com/launcher/" }]`
     and after each build upload `dist/latest.yml`, `dist/Trench128-Setup-<version>.exe` and its `.blockmap` to that
     folder. (The game server serves everything in `public/`, so `public/launcher/` on your server works.)

## Build the installer

Needs Node 20+ on Windows.

```
cd launcher
npm install
npm test
npm run dist        → dist\Trench128-Setup-1.0.0.exe
```

`npm start` runs it from source (updates are off when not installed).

## Release an update

1. Raise `"version"` in `launcher/package.json` (e.g. `1.0.1`) and add a note to `ui/news.json`.
2. Commit, then tag and push: `git tag launcher-v1.0.1 && git push --tags`.
3. GitHub Actions builds the installer and publishes the release. Running launchers find it within four hours (or at
   their next start), download it in the background and install it when the player closes the launcher. "Restart &
   update" installs it straight away.

Without GitHub Actions: `set GH_TOKEN=<token>` then `npm run release`.

Game updates need none of this: update the server (`npm start` as before) and players get the new game when they join.

## Notes

- **Windows SmartScreen.** An unsigned installer shows "Windows protected your PC" (More info → Run anyway). A code
  signing certificate removes it; add it under `build.win` (`signtoolOptions` / Azure Trusted Signing) when you have one.
- **Installs per user** in `%LOCALAPPDATA%\Programs\Trench 128`: no admin prompt, so updates install silently.
- **Player data** (settings, game logins) is kept in `%APPDATA%\Trench 128` and survives updates and uninstalls.
- **Safety.** The game window only loads the chosen server's own pages; other links open in the player's browser.
  Pages have no Node access; the game may lock the mouse and go fullscreen, nothing else (no camera, microphone…).
  Electron fuses switch off run-as-Node and inspector flags and check the app archive's integrity.
- **Keys in game:** F11 fullscreen; "Back to launcher" on the server's connect screen; closing the game window returns
  to the launcher.
- **Roblox** would be a separate port (Luau); nothing here carries over except the design.
