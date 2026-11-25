# Running Trench 128 for real

Three ways to run a server, from quickest to most permanent:

| | What | Good for |
|---|---|---|
| **A** | `node host.js` on your PC (prints a tunnel link) | an evening with friends (see HOST-GUIDE.md) |
| **B** | **VPS + domain + Docker** (this page) | a public, always-on server with accounts and a server list |
| **C** | VPS without Docker (systemd + nginx) | same as B if you prefer plain Node |

## B. VPS + domain + Docker (recommended)

You need a small Linux VPS (2 vCPU / 2 GB is plenty for 128 v 128 with bots), a domain name, and Docker.

1. **DNS:** make an `A` record for your domain (say `game.example.com`) that points at the VPS's IP address.
2. **Get the code** onto the server (git clone or upload this folder), then:
   ```sh
   cp .env.example .env      # set DOMAIN, the server name, accounts mode, region...
   docker compose up -d --build
   ```
3. Open `https://game.example.com`. Caddy fetches and renews the HTTPS certificate by itself; WebSockets go through it.

That's it. Useful commands:

- `docker compose logs -f game` shows the log, including a tick-time line every 15 s.
- `docker compose pull && docker compose up -d --build` updates after you change the code.
- **Backups:** accounts and XP live in the `trench-data` volume (`accounts.json`, `xp.json`). Back them up with `docker run --rm -v trench128_trench-data:/d -v $PWD:/b alpine tar czf /b/trench-data.tgz -C /d .`
- Stop with `docker compose down`. SIGTERM saves accounts and XP first.
- Firewall: open 80 and 443 only. The game port stays inside Docker.

## C. Without Docker

1. Install Node.js 18 or newer. Put this folder in `/opt/trench128`, then run `npm run vendor` once. It downloads three.js into `public/vendor`, so players no longer depend on a CDN.
2. Copy `deploy/trench128.service` to `/etc/systemd/system/` and edit it (paths, name, public URL). Create the user and data folder:
   ```sh
   sudo useradd -r trench
   sudo mkdir -p /var/lib/trench128
   sudo chown trench /var/lib/trench128
   sudo systemctl enable --now trench128
   ```
3. Put nginx in front for HTTPS: `deploy/nginx.conf` plus `certbot --nginx -d game.example.com`.

## Settings

Every setting can be given as a flag or as an environment variable.

| Flag | Environment variable | Default | What it does |
|---|---|---|---|
| `--port` | `PORT` | 8080 | HTTP / WebSocket port |
| `--fill` | `T128_FILL` | 40 | AI soldiers per team (topped up to this number with humans) |
| `--slots` | `T128_SLOTS` | 128 | human slots per team |
| `--name` | `T128_NAME` | Trench 128 | name shown in the server list |
| `--public` | `T128_PUBLIC` | — | this server's public address (`https://game.example.com`), used by the server list |
| `--accounts` | `T128_ACCOUNTS` | optional | `off`: callsigns only. `optional`: guests play with callsigns, account names are protected. `required`: an account is needed to play |
| `--registry` | `T128_REGISTRY=1` | off | this server also keeps a **server list** (`/servers`) that other servers announce to |
| `--master` | `T128_MASTER` | — | announce this server to that server list every 30 s (needs `--public`) |
| `--region` | `T128_REGION` | — | short label in the server list (EU, US-E…) |
| `--maps` | `T128_MAPS` | random | `random`: a new map every round · `classic`: the original map · a number: always that map (e.g. `--maps 4242`) |
| `--origins` | `T128_ORIGINS` | any | comma-separated page origins allowed to connect. For example, add `https://you.github.io` if you serve the page from GitHub Pages |
| `--per-ip` | `T128_PER_IP` | 8 | simultaneous connections per address |
| `--trust-proxy` | `T128_TRUST_PROXY=1` | off (on in `host.js` and Docker) | behind a tunnel / Caddy / nginx: take the player's address from `CF-Connecting-IP` or the last `X-Forwarded-For` entry (only for connections from this machine or a private network) |
| `--list-private` | | off | let LAN / localhost servers into this server's list (LAN parties) |
| `--data` | `T128_DATA` | the server folder | where `accounts.json` and `xp.json` are kept |
| `--no-fetch` | | | don't try to download three.js at start-up |

## Accounts

- Players can create an account on the connect screen: a name (3–16 characters) and a password (8 or more). Their rank follows the account.
- Passwords are hashed with scrypt; nothing reversible is stored.
- Sessions last 30 days.
- Logins are rate-limited per address (8 a minute) and per name.
- In `optional` mode, a name that belongs to an account can't be used without logging in. A guest's callsign XP moves to the account when they register that name.
- To ban someone, stop the server and set `"banned": true` on their entry in `accounts.json`, then restart.

## Server list

- One server (or several) runs with `--registry`. Every other server starts with `--master https://that-server --public https://itself`. Each one announces itself every 30 s.
- Before listing a server, the registry checks its `/health`. A server that goes silent drops off after 90 s.
- The connect screen shows the list from the server address the player typed, or from `?master=https://list.example.com`. It shows players, AI, the operation's state, weather and ping. Click **Join** to connect.

## Playing from github.io (page on GitHub Pages, server elsewhere)

GitHub Pages only hosts static files, so it can serve the **game page** but not the **game server**.

1. Run `npm run vendor` (so three.js is included), then `npm run site`. This rebuilds `docs/` (index.html, shared.js, assets, vendor).
2. In the repo, go to Settings → Pages and deploy from branch `main`, folder `/docs`.
3. Players open `https://<user>.github.io/<repo>/?server=game.example.com`. The server needs HTTPS (`wss://`). Add the github.io origin to `T128_ORIGINS` if you restrict origins.

## Windows launcher (what players download)
See `launcher/README.md`. In short: set your server addresses in `launcher/defaults.json`, set where updates are
published in `launcher/package.json`, then either push a `launcher-vX.Y.Z` tag (GitHub Actions builds and publishes) or
run `npm run dist` on a Windows PC. To host downloads on your own game server, copy `latest.yml`, the Setup `.exe` and
its `.blockmap` from `launcher/dist/` into `public/launcher/`: they are served at `/launcher/…`, and
`https://your-server/download` always sends the newest installer (link your website's Download button there).

## Gotchas
- Browsers only allow `wss://` from an `https://` page, so a plain `http://` server only works for players who open it directly over http.
- Art licence: see README / CREDITS.md. Some packs came without licence files, so check them before running a public server.
