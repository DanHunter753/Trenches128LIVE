# Host a game for your friends (5 minutes)

**You need:** Node.js (https://nodejs.org, the LTS version). Nothing else to install.

1. Unzip this folder.
2. Start it:
   - **Windows:** double-click `start.bat`
   - **Mac:** double-click `start.command` (first time: right-click → Open) — or run `./start.sh`
   - **Linux/any:** `node host.js`
3. After a few seconds the window prints a box with a link like `https://something.trycloudflare.com`. **Send that link to your friends.** They open it in Chrome, type a callsign, click Connect, pick a class and Deploy.
4. Keep the window open while you play. Close it to stop the game. It shows how many players are online.

The link is the game itself (page and server in one), so there is nothing for your friends to install or configure.

## Good to know
- **The link changes** every time you restart. Send the new one.
- **Tunnel:** it uses `cloudflared` if you have it (best: `winget install Cloudflare.cloudflared` on Windows, `brew install cloudflared` on Mac). If not, it falls back to localhost.run through `ssh`, which comes with Windows 10+, Mac and Linux. If the first tunnel is flaky, try the other one.
- **Bots:** empty slots fill with AI up to 40 per team by default. For the full 128 v 128: `node host.js --fill 128` (on Windows: `start.bat --fill 128`).
- **Your connection:** your PC does the simulating (light: a few ms per tick); your upload speed matters more. 10–20 friends is comfortable on a normal home connection.
- **Ranks/XP** are saved per callsign in `xp.json` next to the server. Friends can also create an account on the connect screen (name + password), and then nobody else can use their name.
- **A permanent public server** (your own domain, HTTPS, server list): see DEPLOY.md.
- **Always-on server instead:** `DEPLOY.md` covers VPS/Fly/Railway and the optional github.io page.
- **Art licence:** see README before sharing publicly.
