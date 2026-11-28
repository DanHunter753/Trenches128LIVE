# Trench 128 · WW1 trench warfare, 128 v 128 (v0.29)

A browser FPS in a retro 2D-sprite, "Daggerfall in 1998" look: two armies of up to 128 soldiers each (bots fill empty slots), squad play, ranks, an RTS-style officer, and Battlefield 1-style Operations over a battered 320 m trench map. Zero-dependency Node server + one-page browser client.

## Quick start
```
node server.js                  # http://localhost:8080
node server.js --fill 128       # AI tops each side up to 128 soldiers (humans replace bots)
node server.js --port 9000 --slots 128
```
Open the page in a browser, enter a callsign, connect, pick a loadout, deploy. (On first start the server downloads three.js into `public/vendor`; until then, or if that fails, browsers load it from the CDN.)
For LAN play give friends `http://<your-ip>:8080`. For the internet put it behind a reverse proxy with TLS (the client switches to `wss://` automatically on https pages). Easiest hosting: `HOST-GUIDE.md` (double-click `start.bat` / `start.command`). Static page on GitHub Pages + server elsewhere: `DEPLOY.md`.

## Early testers: hosting in one step
- **Your PC:** double-click `start.bat` (Windows) / `start.command` (Mac) or run `./start.sh` / `node host.js`. It starts the server and a public tunnel and prints the link to send. Install `cloudflared` for the most reliable tunnel; without it, `ssh` to localhost.run is used.
- **A real server (VPS):** `cp .env.example .env`, set `DOMAIN`, then `docker compose up -d --build` (automatic HTTPS). Details in `DEPLOY.md`.
- **Accounts:** optional by default (guests can still play). Players' XP is kept in `xp.json` / `accounts.json` in the game folder (or `T128_DATA`); back those two files up.
- **Checking a build:** `npm test` runs every server and network test (about 9 minutes); `npm run test:all` adds the real-browser tests (needs Playwright + Chrome; developers only).

## How to play
- **Operations:** one side attacks, the other defends; sides swap each round. Attackers take the defenders' three lines one sector at a time. Each attacker respawn costs a ticket; when a battalion runs dry it regroups and a fresh one arrives with a barrage. Take all three sectors to win; lose three battalions and the defence holds.
- **Side objectives:** four supply depots on the flanks pay command points to the officer of the side holding them. Bots raid them too.
- **Armour and guns:** each side has two field guns behind its reserve line and two trench mortars behind its support line, worked by bot crews until you take over with F. The attackers get a tank (blue: Mark IV, green: A7V) about 20 s into each round and with every fresh battalion. Get in with F: the driver steers and fires the main gun, the second seat works the hull machine gun.
- **Elite kits:** crates at your staging area (attackers: Flamethrower and Sentry; defenders: Tank Hunter and Sentry). F at a crate makes you that elite until you die.
- **Weather:** every round is overcast, foggy, rainy or at night. Fog and darkness shorten how far everyone sees; flares light up the field.
- **Gas and smoke:** gas clouds (shells or grenades) hurt anyone without a mask. M puts the mask on (1.5 s, no aiming down sights while it's on). Any class can pick smoke grenades (Corporal) or gas grenades (Sergeant) as its utility and throw them with H.
- **Squads and ranks:** join a squad; its leader (highest XP) gets the officer's orders, the minimap and map-wide spotted enemies. XP unlocks classes and weapons.

| Class | HP | Weapons | Unlocks | Role |
|---|---|---|---|---|
| Rifleman | 100 | bolt rifle (bayonet), carbine | Private | all-rounder |
| Assault | 125 | trench shotgun (bayonet), SMG | Private | close quarters |
| Gunner | 100 | Lewis LMG | Corporal | suppression |
| Medic | 100 | carbine, SMG | Corporal | revives, bandages |
| Recon | 90 | sniper rifle (6x), marksman rifle (3.5x), carbine | Corporal | sniping, spotting (T), scoped headshots kill |
| Sapper | 100 | trench shotgun, bolt rifle | Sergeant | sandbags, wire, cover, redoubts / blockhouses / pillboxes, respawn points |
| Officer | 100 | carbine | Lieutenant | RTS commander: orders, queues, 11 call-ins, fog of war |

**Controls** (all rebindable in Esc → Settings; TAB shows them in game): WASD move · Shift sprint · C crouch · Space jump / climb · LMB fire · RMB aim · R reload · G grenade · H bandage · X dig · F machine gun · B build menu · E use / revive / build · P post respawn · Q / Z lean · V bayonet / melee (sprint + hold V: bayonet charge) · T spot enemies (tap; up to five at a time, marks a target for the officer when nobody is in view) · Enter chat to everyone · U chat to your side · hold Y quick-chat wheel (flick the mouse, let go) · M gas mask · F man a machine gun / tank / field gun / mortar or take an elite kit (C in a tank: outside view) · TAB (hold) scoreboard + controls. Scoped: hold Shift to hold your breath.
**Officer:** WASD pan, RMB drag rotate, wheel zoom, click cards / drag a box to select squads, R / F / G attack / defend / move (Shift+click queues), C cancel, 1–9 · 0 · − call-ins, F1–F4 groups (Shift saves), Space jumps to the last alert, click the minimap to look.

## Files
| Path | Role |
|---|---|
| `shared.js` | Loaded by server **and** browser: map generator and layout constants, `dig()`, movement `step()`, weapons / classes / ranks, loadout validation, fortifications |
| `server.js` | HTTP + hand-written WebSocket (RFC 6455), 20 Hz authoritative simulation, bots, Operations, officer layer, elite kits, weather, delta snapshots, lag compensation |
| `vehicles.js` | Tanks, field guns, trench mortars and their shells: seats, AI crews, armour, damage (server only) |
| `accounts.js` | Player accounts: scrypt passwords, sessions, XP per account (server only) |
| `Dockerfile`, `docker-compose.yml`, `deploy/` | Running it for real: Docker + Caddy (automatic HTTPS), systemd unit, nginx config. See DEPLOY.md |
| `scripts/fetch-three.js` | Downloads three.js into `public/vendor` (`npm run vendor`; the server also tries at start-up) |
| `botai.js` | Bot navigation: 1 m grid over the map, Dijkstra distance fields, climbing, cover |
| `public/index.html` | Client: menus, prediction + reconciliation, interpolation, three.js renderer with pixel / dither post pass, HUD, officer RTS view |
| `public/assets/` | Generated sprites, gun sheets, textures, sounds (see `CREDITS.md`) |
| `build/` | Python asset pipeline (gun viewmodels `vm.py` / `vmguns.py`, soldier atlas `soldiers3.py`, props, textures) |
| `tools/runtests.js` | `npm test` / `npm run test:all`: runs everything, seeds the ranks browser tests need, restores your data files |
| `tools/loadtest.js` | Simulated players for load testing: `node tools/loadtest.js [players] [seconds] [ws-url]` |
| `test/` | In-process server tests (`trench climb dugouts tanktrench v29 revive limits officer posts round forts ai ops gunplay command rts recon net comms vehicles destruct bots27 live`), network tests (`bots.js`, `mg.js`), fuzzing (`fuzz.js`), real-browser tests `browser*.js` (Playwright + Chrome, three.js stubbed; run against `T128_TEST=1 node server.js`; officer / recon ones need a pre-seeded `xp.json`, e.g. `{"cmdbrowser":800,"reconbrowser":150,"rtsbrowser":800,"camtester":800,"officerbrowser":800,"leaderbrowser":150,"settester":900,"offtester":800}`) |
| `scripts/build-site.js` | Builds the static `docs/` site for GitHub Pages |
| `launcher/` | The Windows launcher players download: server browser, patch notes, self-updating installer (see `launcher/README.md`) |
| `.github/workflows/launcher.yml` | Builds the launcher installer on GitHub and publishes the release launchers update from |

## Protocol (current)
Client → server JSON: `hello`, `join`, `in {c:[[seq, dtMs, f, s, bits, yaw, pitch]…], rt}` (bits 1 sprint, 2 crouch, 4 jump, 8 fire, 16 climb, 32 aim, 64 bayonet charge; `rt` = server tick on screen, for lag compensation), `act {a}`, officer `cmd`, `ping`.
Server → client binary: **type 3 delta snapshot** every tick (36-byte own-state header, then per changed entity `u16 id, u8 mask` + full or small move / yaw / flags / look, then a removal list) and **type 4 tracers** (18 bytes per shot). JSON events for everything else (vehicles `vh` at 10 Hz when they change, shells `shl` / `shx`, seat `veh` / `vst` / `vhit`, elite crates `ek` / `elite`, fires `fi`, flares `flr`, weather `wx`, objectives at 2 Hz, kill feed `kf`, scoreboard `sb` on request `sbq`, pings `png`, mask `mask`, after-action report inside `end`, XP, orders, officer roster, alerts, effects). Details: v0.23 below and the project's netcode notes.

## Known limits
- Accounts exist (v0.27), but guests can still play with any free callsign in `optional` mode; run `--accounts required` for a public server. No password reset or email yet.
- Interest management sends enemies within 100 m even behind walls, so a modified client could wallhack; server-side visibility culling would fix it.
- Leaning is camera-only (hit boxes don't lean). Smoke blocks bots and spotting, not bullets. Tanks stop bullets but don't block line of sight for bots and spotting. Field-gun shields don't stop bullets.
- One process simulates everything (measured fine to 256 simulated players); beyond that, shard or move bots to a worker thread.
- The 3D view (including tanks, guns and weather) has only been checked with three.js stubbed: per-frame JavaScript cost is measured (≈3.5 ms average in a 2-minute night battle), real-GPU frame rate is not. The in-game FPS readout (Settings) shows frame time, worst frame, draw calls, soldiers and scenery drawn — early testers, please report it. three.js is loaded from `public/vendor` once fetched (`npm run vendor`), from the CDN otherwise.
- Some art packs came without licence files (see `CREDITS.md`): confirm their terms before a public launch.
- At the full 128 v 128 (`--fill 128`, 270 soldiers) the server averages 13–14 ms a tick but its worst ticks reach 50–58 ms (one 20 Hz tick is 50 ms): a rare small hitch. At the default fill of 40 with 64 players: 5 ms average, 35 ms worst.

# Changelog

## v0.53 — Spawn on your squad leader, night tracers, rifle smoke

- **Spawn on your squad leader:** he shows on the respawn map as a triangle. You can deploy on him once every 3 minutes, as long as he's alive, on foot, not manning a gun, and has no enemy within 15 m. The cooldown shows on the map; if he can't take you, you deploy at base. He's told when you land on him.
- **Night tracers:** at night every round shows a bright orange streak, 14 m long (was a faint 4 m line), so firefights read in the dark.
- **Rifle smoke:** bolt rifles, carbines, marksman and sniper rifles leave a light grey smoke trail along the round's path that fades in about 1.5 s. A perk or attachment can remove it later.

## v0.52 — Magazines, and supply is for building

- **Magazines:** you carry 4 spare magazines (6 with the **Deep Pockets** perk, which used to save supply on reloads). Each reload uses one, shown as magazine icons above the ammo counter; with none left you can't reload. Refill them all at a gunner's ammo box, or slowly in your base (one every 6 s, with a small chime). Bots keep endless clips.
- **Supply is your own, and only for building:** fortifications, field posts, respawn points, ammo boxes and digging. Everyone starts with 50 (sappers 250) and gains 2 a second standing within 25 m of an objective, up to a class cap: rifleman 100, assault 50, gunner 75, medic 150, sapper 250, recon 50.
- **Free now:** grenades, rifle grenades, bandages, revives, MG belts, and field-gun and mortar shells.

## v0.51 — Mortar warning, slower planes, the vote click fixed, Attrition at 15 min

- **Mortars:** bombs fly a steeper, slower arc (about 8 s at full range, was 5 s), and a long falling whistle plays about 3 s before one lands within 70 m of you.
- **Planes** fly much slower (top speed 34 m/s, was 52), so bombs and guns are easier to put on target.
- **Map vote:** a vote now registers the moment you press. The vote screen redraws every half second for its timer, and a click that spanned a redraw was lost. Your count goes up at once, with a tick.
- **Attrition** ends at 15 minutes: the side holding more lines wins, and if they're even the round is a draw.
- **Automatic weapons bloom more:** the first shots stay tight, and the cone opens about twice as fast while you hold the trigger (SMG, LMG, carbine, MG 08/15).

## v0.50 — Long shots register, spread ring, out-of-range notice, respawn on Deploy, fewer bot grenades

- **Rifle hits register.** A player's round is now checked against where targets were *on his screen when he fired*: his lag plus the round's flight time. A long shot at a running man used to arrive after he'd moved half a metre or more and miss. Now it lands where the crosshair was, with no leading needed. In a test against a man running sideways at 6 m/s, every shot hit: bolt at 150 m, marksman at 200 m, sniper at 250 and 350 m. Bots' rounds are unchanged.
- **Shots go where the sights are.** The recoil kick used to lift your aim *before* the firing input reached the server, so the round left along the kicked line: about 6 cm per metre high with the sniper, or roughly a metre at 20 m. That's why you had to aim at a man's feet to hit his chest. The server now gets the aim from the moment you pulled the trigger, and the kick applies from the next shot on.
- **Spread ring:** a circle round the crosshair shows how far your shots can scatter right now. It uses the same sums as the server (hip or aimed, suppression, bloom from firing, a braced gunner, perks), and your round lands inside it. Aimed rifles have no scatter, so there's no ring and the round goes to the dot.
- **Out of range:** if your round runs out of reach with an enemy further down the line, a notice at the top says so (e.g. "OUT OF RANGE · target about 140 m · Submachine Gun reaches 60 m").
- **Hit markers** stay up a little longer, and every hit now plays a sharper tick.
- **Respawn when you're ready.** After you die, the respawn map waits for you: pick a spot, change class if you like (**Change class**), then press **DEPLOY** (or Space). The respawn wait still applies; pressing Deploy early queues you for the moment it ends. Older cached pages still respawn on the timer.
- **More time to vote:** the map vote stays open for the whole post-round (30 s, was 18 s), and the map changes 3 s after it closes.
- **Bots throw far fewer grenades:**
  - They pass up most chances (85%).
  - They wait 45–75 s between throws (was 18–30 s).
  - A fresh bot waits 15–35 s before its first.
  - Each side throws at most 3 every 10 s.
  - Rifle grenades come every 75–120 s (was 40–70 s).

## v0.49 — Map vote, Attrition mode, rifles reach across the map

- **Map vote between rounds.** When a round ends, a vote screen shows three cards: **The Trenches · Operation**, **The Trenches · Attrition** and **Wake Atoll · Domination**. Each card shows the time of day and weather that round will have, plus live vote counts, under an 18-second countdown ring. Click a card to vote; you can change it until the timer runs out. The most votes wins (ties at random). If nobody votes, the map is picked at random between the trenches and Wake (then the mode). Esc shows the after-action report behind the vote. This is the new default (`T128_MAPS=vote`).
- **Attrition**, a new trench mode: like Operation, but there is no attacker and defender. At the start each side holds only its home line; the four lines between are neutral. Either side can take the line next to its front, and an enemy line goes neutral before it changes hands, so lines can be lost and retaken. The side that takes the other's home line wins. After 40 minutes, the side holding more lines wins. A line strip at the top shows all six lines from your home to theirs, and bots push the next line past their front.
- **Rifles reach across the map (800 m).** Past their effective range the damage falls off to a floor instead of the bullet vanishing: bolt 50 → 20, carbine 34 → 15, marksman 80 → 35, sniper → 50 at 800 m. Sweet spots are unchanged.
- **Snipers kill with one body shot out to 260 m** (100 damage; it was 90, which left targets standing on 10 HP and looked like no damage at all). Rifle rounds fly faster (bolt 700 m/s, carbine 620, marksman 780, sniper 850; they were 420–620), so there is less drop and less lead at long range.

## v0.48 — Rejoin after a drop, /stuck, password recovery, 4× lighter art

- **Rejoining after lag-out works.** A dropped player's old connection can look open to the server for minutes, so joining again said "That account is already playing" until the next match. Now the same account takes over its old place at once (same side and squad); the old window, if it is still open somewhere, shows "Playing elsewhere" and stops. Guests get the same, matched by name and browser (another browser still can't take a name in use).
- **Stuck?** Type `/stuck` (or `/respawn`, `/kill`) in chat, or press **Stuck? Respawn now** on the in-game class page. It ends this life with no killer credited and the normal respawn wait. Not within 10 s of being hit (so it can't rob an enemy of a kill), and once a minute. `/help` lists chat commands; commands are never shown to other players.
- **Password recovery without e-mail.** New accounts get a recovery code at registration (shown once: write it down). On the first screen, **Forgot password?** takes your name, the code and a new password: it logs out every other session and gives you a fresh code. Logged in, you can **change password** or make a **new recovery code** (existing accounts should do this once). For a player who lost both, the server owner runs `docker compose exec game node tools/resetcode.js NAME` on the server and hands over the code it prints (it only answers the server's own machine).
- **Art is 4× smaller:** all pictures 7.9 MB → 1.9 MB (soldiers 2.3 MB → 0.7 MB, the gun sheets 3.3 MB → 0.7 MB), by storing them with 256-colour palettes where the difference is invisible (`tools/shrink_assets.py`). Faster first load on phones and slow connections.

## v0.47 — Perk tree

- **Perks for registered players.** Every account level gives one perk point (level 1 = 1 point, level 100 = 100). Spend points on the Customize tab under **PERKS** to unlock perks for good (1–3 points each, 58 for all 28). Your first starter perk (Quick Hands, Field Dressing or Light Pack) is free.
- **Three slots per class**, opening at levels 2, 8 and 20. Equip any unlocked general perk or one of the class's own (◆); changes take effect on your next spawn. Guests can browse the list but need an account to unlock.
- **Refund:** all points back for 500 XP, as long as you keep your level.
- **Small edges, mostly with a cost:** about 10% on one thing, or one extra item.
  - General: Quick Hands (reload 8% faster), Field Dressing (+10 HP per bandage), Light Pack (+4% speed, one grenade fewer), Deep Pockets (every third reload free of supply, 3% slower), Steady Hands (10% tighter aimed spread, slower to aim in), Gas Drill (mask on in 0.9 s), Last Words (last stand: +2 revolver rounds, +15 health, bleeds out sooner), Thick Skin (8% less blast damage, 3% slower), Scrounger (a fallen soldier refills your magazine, once per body), Flare Hand (+1 flare, 25% longer).
  - Rifleman: Marksman's Breath, Bayonet Drill, Rifle Grenadier.
  - Assault: Bomber, Trench Raider, Second Wind.
  - Gunner: Belt Feeder, Cool Barrel, Dug In.
  - Medic: Triage, Field Kit, Stretcher Bearer.
  - Sapper: Quick Spade, Wire Cutter, Forward Post.
  - Recon: Spotter, Still Hunter, Range Card.
- The server applies every effect. Speed, bayonet charge, wire and rifle-grenade perks are also applied in your own movement prediction, so they don't rubber-band.
- Level-up messages say when a new perk slot opens.

## v0.46 — Server performance: half the tick time under load

Measured with 64 simulated players plus bots (266 soldiers) on a trench map, the server and the load generator each on its own CPU core:

| | before | after |
|---|---|---|
| average tick | 26–34 ms | 15–16 ms |
| ticks over 40 ms (per 15 s) | 17–67 | 0–2 |
| server CPU busy (70 s run) | 53.5 s | 35.2 s |

- **Snapshots** (what each player is sent 20 times a second) were a quarter of every tick. Each tick now builds one flat table of every soldier, and each player's snapshot reads from it instead of visiting ~270 soldier objects again; bytes are written directly and each snapshot is sent as one ready frame.
- **Line-of-sight checks** (bots looking for targets): sandbag lookups use a small 2D grid instead of a whole map column, and walls and structures are tested in 5 m pieces instead of every metre. Results are identical (checked on 60,000 random sight lines on three maps).
- **Wake Atoll at full size** (128 v 128 bots, plus 64 players): 7–11 ms average, worst 25 ms, about 5 KB/s per player. It's lighter than the trench maps because the soldiers are spread over five flags, so it's safe to turn on `T128_MAPS=rotate`.

## v0.45 — Wake Atoll stage 3: the island rebuilt in WW1 style, new bolt-rifle aim view

- **Fighting trenches at every flag.** Three short plank-revetted trenches with duckboards ring each flag inside the capture circle, about 1.2 m deep with a spoil bank thrown up behind. Climb out over the side or walk out of the sloped ends; the map's own trench pieces near Wilkes Landing are dug too.
- **Buildings and works from the original map, all solid** (they stop men, bullets and sight; bots path round them): 20 plank huts with tin roofs, doors and windows (a third of them shelled to ruins), 4 concrete pillboxes with a front firing slit and a back door, 4 timber watch towers, a dock store, a wireless mast where the radar stood, concrete rings round the 5 coastal guns, 11 sandbag rings and 32 sandbag walls, and wrecked tanks, lorries and biplanes.
- **Bridges:** the two wooden bridges are shelled: pilings and broken deck at the banks. The fords beside them are still how you cross.
- **Beach obstacles are barbed-wire belts** (posts and coils) that slow you down like the wire on the trench maps.
- **The airstrip and sand roads** are laid on the ground, and the scrub inland is patchy now.
- **AA guns:** the garrison's five flak stands are working AA guns.
- **Night:** lanterns at hut doors, pillbox doors, every flag, and lamps on the watch towers.
- **Map rotation:** `--maps rotate` (or `T128_MAPS=rotate`) plays two random trench maps, then Wake Atoll, and round again; pages follow the server onto each map by themselves. The default is still random trench maps. (Switching fixed: a server that started on Wake had no supply depots for the trench maps, and leaving Wake crashed on the missing depots.)
- **Bolt-action aim view** redrawn from the supplied art: gloved hands, bolt handle on the right, a fresh smoke puff after the shot. The other bolt frames are unchanged.

## v0.44 — Wake Atoll stage 2: Domination HUD, flag respawns, smarter bots

- **Domination HUD.** At the top of the screen: a race bar (your points grow from the left, the enemy's from the right; first to the middle at 100 wins) and five flag badges A–E in the holder's colour, with a ring showing how far each flag has been pushed and a pulse while it is changing hands. Standing in a flag shows what is happening there: CAPTURING C 29%, NEUTRALISING, LOSING, CONTESTED or HOLDING, and how many of each side are inside it.
- **Flag letters over the world** with the distance, and letters on the minimap (white = neutral). A banner shows each flag taken or lost.
- **Respawn at a held flag.** The respawn map on the island shows your start zone and every flag your side fully holds (greyed while enemies are within 25 m); you land somewhere dry inside the flag's circle. The landing force has no airfield yet, so it isn't offered.
- **Rallies hit harder.** A short barrage walks onto the flag first, then the paratroopers jump; for a minute every bot on the trailing side goes for that flag. The banner now reads RALLY! (it said "undefined" before).
- **Bots spread out and defend.** The two assault squads go for two different flags at the front (nearest to what the side already holds), the garrison squad holds the front flag, and when a flag of ours is attacked the garrison and a third of the bots nearby go back to defend it. Each bot picks its own spot inside the flag circle instead of a line across it.
- **After-action report for Domination:** final score, flags taken by each side, rallies, and how long each side held each flag. The end screen says who holds the atoll.
- **Blood on the lens** at low health is now a few soft stains round the edge of the view, not big red square blocks across it.

## v0.43 — Wake Atoll and Domination (stage 1)

- **New map: Wake Atoll** (`--maps wake`, or `T128_MAPS=wake`). An 800 m world imported from the owner's Wake Island map: the three islets with the lagoon between them, fords where the original had its bridges, 5 flags (Airfield, South Battery, North Camp, Wilkes Landing, Peale Point), palms, scrub and grass from the supplied art. The sea is wadeable to chest depth; deeper water is a wall for men and bots.
- **Domination.** Any flag can be taken by either side: outnumber the enemy inside 14 m for about 20 s and it goes neutral, then yours. Every 8 s a side scores a point per flag held; first to 100 wins. When the leader passes 25, 50, 75 and 90 the trailing side gets a rally: morale, an instant respawn wave, +30 supply and a paratroop drop at its nearest enemy flag. The garrison starts at the Airfield, the landing force at Wilkes Landing (the fleet comes later).
- Under the hood: the world size is per map (the client gets the island's heightmap with the page), positions travel at a 2 cm quantum on the big map, bots pick flags instead of trench lines, and the trench-only pieces (lines, dugouts, nests, phones, tunnels, structures, lamps) are simply absent on the island.
- Still to come: the Domination HUD and after-action report, the restyle (huts, sandbags, towers, coastal guns, bridges, airstrip, flag trenches), carriers and landing craft, and map rotation.

## v0.42 — Rifles reach further

- Rifle bullets no longer vanish at 110–130 m. Reach is now: bolt rifle 240 m, carbine 190 m, marksman rifle 300 m, sniper rifle 360 m, light machine gun 150 m, machine-gun nests 200 m, anti-tank rifle 340 m, MG 08/15 260 m. Shotgun and submachine gun are unchanged.
- Longer one-shot sweet spots: bolt 40–120 m (was 40–80), marksman 70–180 m (was 70–130), sniper 90–260 m (was 90–200).
- Sights are zeroed at 100 m (scoped rifles at 150 m): a bullet rises a few centimetres through the line of sight and is back on it at that range, instead of falling below the crosshair from the muzzle on. Beyond that you still hold a little high (about 0.6 m at 200 m with the bolt).

## v0.41 — Revolver and climbing-hands art, hit boxes, parachutes

- **Revolver art.** The last-stand revolver now uses the supplied pictures: the side view at the hip and the rear view when you hold aim while down. It kicks with a muzzle flash when it fires and dips and turns during the slow reload. Aiming while down is real: it cuts the revolver's spread to 40%.
- **Climbing hands.** The climb animation uses the supplied picture of two hands on a ledge, moved hand over hand and then pushed down as you haul yourself over. The old thin-arm frames are gone.
- **Parachutes only for paratroopers.** Soldiers climbing out of a trench no longer grow a parachute; the canopy shows only for men dropped by the paratroopers call-in.
- **Hit boxes.** A kneeling soldier's box now matches the drawn figure (1.42 m tall, head from 1.08 m), so the top of a kneeling head can be hit and the chest is no longer counted as the head. Standing and machine-gun-nest boxes were measured against the art and were already correct.

## v0.40 — Last stand, mouse binds, version check

- **Last stand.** When you are knocked down you draw a revolver: 6 rounds, about one shot a second, and a slow 4 s reload ([R]). The move keys crawl at roughly 0.6 m/s.
- **Finishing off.** Downed soldiers can now be hit by enemy bullets, bayonets and blasts. They have 60 health while down (a rifle needs two hits); the finisher gets +3 XP. Teammates cannot hurt them.
- **Mouse buttons can be bound.** Any action in Settings can take a mouse button (left, middle, right, Mouse 4, Mouse 5), and Fire and Aim are now rebindable too.
- **Version on the first screen.** The login page shows the page version and checks it against the server, with a warning if the two differ (old page cached, or server not yet updated).
## v0.39.1 - rifle animation, and a readout that says where lag comes from
- **Rifle in the hands** (also the carbine and anti-tank rifle, which share its art):
  - The hip view is 1.3x larger and set lower, so the forearm leaves the screen at the bottom like the trench gun's instead of
    a small rifle on the end of a long thin sleeve.
  - Firing from the hip recoils straight back. The old upward jump dragged extra sleeve into view for two frames, which
    looked like the arm stretching and snapping back.
  - Reloading: the hand that feeds the clip ended in a straight vertical cut in mid-air (the reference picture stops there).
    It now continues as a wrist and sleeve off the right of the screen.
  - `build/fpv_guns.py` holds the changes; the three sheets were rebuilt with it.
- **The corner readout now reads `PING 52 ms · SERVER 9 ms · 144 FPS`.** SERVER is the server's slowest tick in the last two
  seconds (over 50 ms it is marked busy); a frame slower than 50 ms on your own PC is shown too; and when nothing arrives
  for 1.5 s it says `NO DATA FROM SERVER 3.2 s`. PING also rises when the PC is too busy to read the reply, so the three
  numbers together say whether a hitch is the server, the connection or the PC.
- The server log now records a stall (`[stall] 900 ms between ticks ...`) and a player whose connection is not keeping up
  (`[net] Name: 120 KB waiting to be sent, last input 3100 ms ago ...`).
- Lighter HUD: the gun picture is on its own layer (moving it for the sprint bob and recoil no longer repaints it), and the
  hit-direction overlay is only redrawn when it has something to show.

## v0.39 - customize your soldier
- The **Customize** tab (before you deploy, and from Pause > Change loadout) is now a page per class:
  - **Slots** down the left: primary weapon, gadget, grenades, melee, class ability, and specializations (locked until the
    perk tree; it shows the perk points you have banked).
  - **Choices** for the open slot beside them; locked ones show the rank that unlocks them.
  - **Your soldier** in the middle, in your side's uniform for that class, turned with the arrows or a click. This is where
    appearance options will go.
  - **Stats** on the right for whatever you point at: damage, accuracy, hip fire and control bars; rate of fire, magazine,
    reload, range, scope, bayonet; and a damage-by-range graph showing the one-shot sweet spot. They are worked out from
    the real weapon numbers, including class bonuses (the rifleman's faster bolt, the assault's faster reload).
- ◂ ▸ step through the classes. **Each class remembers its own weapon and gadget**; a class you have not unlocked can be
  looked at but not taken. The Deploy button says which class you will deploy as.
- New test `browser_customize`.

## v0.38 - playtest fixes: rubber-banding, phones, medics
**Lag when moving and shooting (found and fixed)**
- *Moving.* The server lets each player move only as much time as has passed (the "movement bank", v0.32.1), but it refilled
  that allowance by a nominal 50 ms a tick while its timer really fires every 51-54 ms, and a 60 Hz client rounds each
  16.7 ms frame up to 17. After about 20 s of play every player's allowance was empty and stayed empty: the server then
  dropped 2-4% of his movement and pulled him back, a third of all snapshots, for the rest of the session (1-13 cm on a good
  connection, more with jitter). The allowance now refills with the time that really passed (plus 3%), holds 1 s instead of
  0.6, and the client carries its rounding remainder so the time it sends adds up exactly. Measured with simulated latency
  (25-40 s of sprinting): 0 pull-backs, was 60-75 per 10 s.
- *Shooting.* Your own shot (kick, sound, tracer) was only shown when the server's answer came back, a full ping later. It is
  now shown the instant you fire, following the same rules the server applies (rate of fire, sprint-to-fire delay,
  semi-automatic trigger); the server still decides what is hit. Each confirmed shot is matched to a shown one.
- **Ping** is always on screen (bottom left; green / amber / red, "unsteady" when snapshots arrive in bursts, "NO SIGNAL"
  when they stop) and every player's ping is a column on the TAB scoreboard.
- `T128_TEST=1 T128_LAG="90,70"` makes the server delay every message (base, jitter in ms each way) for testing.

**Phones**
- **Officer view works with touch.** Drag to move the map, pinch to zoom, twist two fingers to turn, two fingers up/down to
  tilt; a tap still gives the order. The command panel covered the whole screen on a phone: it is now a strip along the
  bottom whose rows scroll sideways, with a Hide button, and it is no longer redrawn under your finger (taps were lost).
- **Invisible soldiers / missing gun on slow connections.** The soldier art is one 2.3 MB picture (each gun is 0.3-0.5 MB).
  Until it had arrived nobody was drawn, only the markers over their heads; if the download failed, for the whole session.
  Soldiers are now drawn as plain uniformed figures until the art arrives, every picture retries when its download fails,
  and the soldier and gun art is fetched first.
- **Gun missing after spawning.** An item animation could leave the gun hidden for good; the gun picture is also redrawn
  every 2 s and its layer is woken after a spawn, a rotation or going full screen (which is what bandaging used to do by
  accident).

**Medics**
- A health bar hangs over every hurt teammate within 45 m, seen through cover.
- [H] bandages the hurt teammate in front of you (within 2.8 m, worst hurt first; 70 HP, +8 XP) before yourself.
- The medic who revives a man earns 4 XP for each kill that man makes until he dies (this was already in; now tested and
  it stops if the medic leaves).

**Also**
- **Assault morphine** plays the syringe hands (the owner's art in `fpv_items.png`).
- **Building respawn points** are a small field telephone in a back corner instead of the big sandbag ring and tent that
  filled the room, and blockhouse and pillbox doorways are 1.9 / 1.8 m wide (were 1.4 / 1.3: easy to get stuck in).
- Rifleman bots only fire rifle grenades when their side has 30+ supply (they were spending it all).
- **Launcher download link.** `releases/latest/download/Trench128-Setup.exe` answered 404 because the release build had
  created two releases under the tag v1.0.0. The workflow now builds first and uploads all three files to one release,
  refuses to run while duplicates exist, and checks that the link answers.
- Tests: `v38`, `browser_v38`, `browser_netfeel` (runs with simulated latency), `movebank` extended.

## v0.37 - the rifleman: rifle grenades, and the bolt rifle is his alone
- **Only riflemen carry the bolt-action rifle.** Sappers now choose a shotgun or a carbine (a saved sapper loadout with the
  bolt rifle switches to the shotgun).
- **Rifle grenades ([N]).** Fit a grenade to the rifle's muzzle (1 s, uses one of your grenades and the usual grenade supply).
  A dotted arc and a ring show where it will land, and the hint gives the range: 30–110 m depending on how high you raise the
  muzzle. Fire to launch it; [N] or [R] takes it off again. Its burst is a little smaller than a hand grenade's but it wrecks
  a machine-gun nest it lands in. Every machine shares the flight path, so the arc you see is the one the server flies.
  Rifleman bots lob them (with a lob's scatter, at most one per target every 15 s across the side) onto manned enemy guns
  and knots of three or more men 35–110 m away.
- **Quicker hands.** Riflemen work the bolt 20% faster and come up to the sights faster.
- **Steady nerves.** Incoming fire suppresses a rifleman half as much (less spread and screen shake).
- **Longer bayonet charge.** 4.5 s of charge stamina instead of 3, refilling half again as fast.
- Tests: `classes` covers all of it (aim solution, reach, fitting, unloading, launch, a bot hitting a manned gun 70 m off);
  `browser_classes` fits and launches one through the real client.

## v0.36 - class abilities: ammo boxes and morphine
- **Class ability key: [N]** (rebindable; a KIT button on phones, shown for the classes that have one).
- **Machine gunner: ammo boxes.** [N] puts a box down at your feet (3 supply, every 35 s, two of yours at a time; a box lasts
  2½ minutes or 10 restocks). Anyone on your side who walks over it gets a full magazine, their grenades and their utility
  (bandages, smoke, gas or flares) back, once every 25 s. The gunner earns 4 XP each time a teammate restocks. Gunner bots put
  boxes down where three or more friends are gathered.
- **Machine gunner: bracing.** Crouch and the light machine gun fires with about half the spread and less climb.
- **Assault: faster and quicker hands.** Speed 1.06 → 1.10, and reloads take 30% less time.
- **Assault: slide.** Crouch while sprinting forward and you drop into a slide: a fast burst (12 m/s, falling to a crouch over
  0.9 s) under fire and into cover, low and hard to hit. Cancel it any time by standing up (let go of crouch, or tap it again
  with toggle-crouch), jumping (a hop out of it) or pulling back; a wall stops it too. 1.2 s before the next one. It runs in
  the shared movement code, so your own screen predicts it exactly; a little dust, a scrape and a camera tilt go with it.
- **Assault: morphine.** [N] injects a syrette: for 10 s you move 20% faster and take 40% less damage (gas excepted), and get
  15 HP back. Two per life, and an ammo box gives you one back. The screen warms at the edges while it lasts, and the HUD
  counts it down. Assault bots use it when hurt in a fight.
- New tests `classes` (server rules and the slide's start, burst, cancels and cooldown) and `browser_classes` (box drawn with its
  hint, morphine HUD and speed, a slide with the real keys and standing up to cancel it).

## v0.35 - lamps and fires at night
- **Night maps are lit by the war itself**, so flares are no longer the only light. Each lamp or fire sits where it would really be:
  - shaded lamps *inside* the front-line dugouts (nothing burns in the open on the front line);
  - storm lanterns at the doors of the support and reserve dugouts, at the HQ shelters, supply dumps, field-gun pits and hangars;
  - coke braziers in the reserve and support trenches;
  - paraffin flare pots along both airstrips, so pilots can find them;
  - burning tank and plane wrecks, a few ruined farms and barns still on fire, candles in the chapel ruins, and the patches
    of burning ground in no-man's land.
- Each one throws a flickering pool of warm light on the ground, a halo you can see from far off, and lights up the walls
  and soldiers near it; everything else stays dark.
- **It matters for play.** The server and clients build the same list of lights. At night a man standing in the light is seen
  and engaged as if it were day; one in the dark still only at night range. Crossing past a burning wreck or a brazier gives
  you away, so plan the route through the dark (or put up a flare to light the rest).
- Cheap to draw: the flames and halos are two GPU point batches animated in the shader, and the light pools are one mesh.
- New test `lights` (placement rules, same on every machine, lit vs. dark sight at night).

## v0.34.2 - an immersion pass on the ruins and wrecks
- **Ruins you can actually see.** Under real WebGL the farmhouses, chapels and barns rendered nearly black (dim lighting on
  very dark textures). They are now drawn unlit like the rest of the world with the light baked into each face, on new
  weathered brick, pale limestone and charred-plank textures; wall bases are dirtier than the tops.
- **Barns look bombed.** The roof has come down: a fallen ridge beam, rafters leaning on the posts, a slab of boards and spilled
  hay (scenery only, no new collision).
- **Smouldering wrecks.** Burnt-out tanks, lorries and planes trail a slow smoke column you can spot across the map, and the
  tanks and planes still have a low fire flickering in the hull. Only wrecks within 170 m are animated.
- **Airfield strip** is now one sheet laid over the ground, toned close to the grass, instead of green slabs that poked out
  of hillsides.

## v0.34.1 - respawn picks and phantom markers
- **Fix: the respawn pick was ignored.** You pick on the death map while dead, and the server dropped every action from a
  dead player before reaching the pick, so everyone came back at the default spawn. The pick is now taken while dead.
  New end-to-end test `browser_respawn` (die, pick a flag, check where you come back; then the airfield).
- **Fix: "invisible" teammates.** The blue teammate markers were drawn through walls and out to 150 m, but bodies are only
  drawn out to the fog distance (about 100 m in fog or rain) and are hidden by trench walls, so markers floated over men
  you couldn't see. Blue markers now hide behind cover like the man under them and only show where his body is drawn.
  Green (your squad) and red (spotted enemies) still show through cover on purpose. Checked with real WebGL rendering:
  soldiers draw normally on desktop and on an emulated phone.

## v0.34 - service record, bots on the wire, demo polish
- **Service record on the start screen:** account level 1-100 from total XP (level n needs 100(n-1) + 20(n-1)(n-2) XP:
  level 10 at 2,340, 50 at 51,940, 100 at 203,940), an XP bar to the next level, and the rank ladder from Private to
  General: six new ranks past Major (Lt. Colonel 5,000 XP up to General 200,000), each shown with its level. Perk points
  (one a level) are counted for the coming perk tree. Accounts read it from `/api/me`, guest callsigns from the new
  `/api/record`; the last one seen in a game is cached. In game: a "LEVEL UP (+1 perk point)" message, the level in the
  loadout header, and a career line (rank, XP earned this round, level bar) on the after-action report. The six old ranks
  still gate the same unlocks. Test: `browser_record`.
- **Bots use the wire and the mines:** a bot within 60 m of a cut wire of his side splices it; bots near the listening
  post over an enemy gallery that has been heard countermine it; sapper bots near one of their shafts dig the mine (two
  at most per shaft). A job is dropped when an enemy shows up, it's done, or it runs too long. So these happen in
  bot-heavy games too. Test: `botjobs`.
- **Polish:** "How to play" covers the respawn map, order beacons and markers, biplanes, telephone lines, mines, repairs,
  phone controls and the career; the pilot HUD moves under the minimap on phones (clear of the stick) with touch wording.

## v0.33.3 - bots spread out, friend markers, order beacons
- **Bots keep their distance.** Nothing used to keep bots apart: they stood inside each other, and squads walked one path
  to nearly one spot. Now each bot steps away from teammates closer than his spacing: about 2.6 m when holding a line or
  advancing (so a line covers its front), 1.5 m while his squad gathers for a push or follows an officer's order, and
  0.75 m in a dugout shelter. Men walking together veer apart into a loose line instead of a file. Steps are only taken
  on level going, so the push slides men along a trench, never up its wall. Move orders spread a squad wider too.
  Measured over a full 128 v 128 battle, bots standing within 0.8 m of a teammate (same level, outside shelters) went
  from 30-69% to 3-15%. Test: `spacing`.
- **Friend markers:** a blue marker over teammates (within 150 m) and a green one over the players in your own squad, like
  the red one over spotted enemies. Test: `browser_marks`.
- **Order beacons for soldiers:** when the officer gives your squad an order, its beacon (a column of light in the
  squad's colour, not hidden by fog, with a ring on the ground) stands at the spot, and an on-screen marker shows the
  order and the distance, pinned to the screen edge with an arrow when it's off to the side or behind you. The beacon
  pulses gently and fades as you get close; the marker goes once you're there or the order is done. Officers' beacons
  use the same look. Test: `browser_orders`.

## v0.33.2 - knocked down on a phone
- Phones had no way to shout for a medic or give up while knocked down (the touch buttons hide when you're down). Two
  big buttons now appear: CALL MEDIC (the Y shout) and HOLD TO RESPAWN (the held E, with the same 1.2 s bar), and the
  downed screen says to use them. Test: `browser_touchdown`.

## v0.33.1 - your own button layout on phones
- The pencil button (top right, phones only) turns on layout editing: the buttons wiggle, drag any of them wherever you
  like, then Done. The layout is saved on the phone with the other settings (as fractions of the screen, so it still
  fits after a rotation or on another screen size). Reset puts the default layout back. While editing, buttons don't
  fire their actions and the tutorial card steps aside. Test: `browser_tclayout`.

## v0.33 - fly the biplanes; phones in landscape
- **Flyable biplanes:** each side has one parked at a new airfield behind its home camp (a mown strip with a hangar and a
  windsock; also a choice on the spawn map). [F] climbs in. W/S throttle, the mouse steers (the plane turns and climbs
  toward where you look, banking into turns), A/D rudder; roll down the strip and pull up past about 83 km/h to take off.
  Built like the tanks: boxes and cylinders with small canvas textures (khaki dope and roundels for blue, lozenge
  camouflage and crosses for green); the AI bomber, recon and fighter runs use the same model now.
  - **Views:** cockpit (default), outside chase view ([C]), and the bombsight: hold RMB (AIM on phones) to look
    straight down, with a cross on where a bomb would land; click drops one (4 bombs).
  - **Pilot HUD:** speed and altitude, compass, throttle, airframe, bombs, gun heat, the gun cross against the aim
    circle, and warnings (stall, pull up, leaving the battlefield, take-off help).
  - **Combat:** twin machine guns along the nose; bullets from the ground hit planes, enemy AA guns fire flak at them,
    a plane shot down or flown into the ground kills its pilot and leaves a wreck; a new plane is on the strip 60 s
    later. Standing still on its own strip it rearms (a bomb every 4 s) and patches up. You can't get out in the air.
  - **Netcode:** the flight model is shared (`T.flyStep`), stepped per input on the server like a soldier's movement
    and predicted on the pilot's screen, which is corrected from the server's state 20 times a second.
  - Tests: `flying`, `browser_plane`.
- **Phones:** the game plays in landscape. Deploying goes full screen and locks the screen sideways where the browser
  allows (Android); otherwise (iPhone) a "turn your phone sideways" card covers the game while it's upright. PCs are
  unchanged.
- **Phone HUD tidied:** smaller kill feed (4 lines), status line, minimap and corner buttons (moved off the settings
  gear); ammo and supplies in a compact block at the bottom centre; hints and messages up top, clear of the buttons;
  the touch buttons are more see-through and shrink to fit short screens; the rifle is pulled left from behind the
  FIRE button (in portrait it was drawn off the side of the screen).

## v0.32.1 - lag spikes
- **Bot pathfinding no longer stalls the server.** A map-wide walking field (about 160k cells on the 400 m map) took
  about 50 ms to compute, a whole tick, and the fields expire every 8 s, so ticks ran late on a steady beat. Fields are
  now solved a slice at a time (4 ms a tick, one job at a time) while bots keep using the previous one. Results are
  identical. Load test with 64 players and 205 bots: worst tick 27-46 ms (was 80-90 ms).
- **No more snap-back when sprinting.** The server applied at most 0.12 s of a player's movement per tick and threw the
  rest away, so bunched-up inputs (network jitter, or after a slow tick) left the server behind the player's own
  screen, and he was pulled back; the faster he moved, the further. Movement now draws on a time bank (real time,
  banked up to 0.6 s), so bursts are applied in full but nobody can move faster than the clock. Test: `movebank`.
- **Tick profiler:** the log line every 15 s now shows slow ticks and the longest gap between ticks, and a slow tick
  (over 40 ms) logs which parts took the time, at most every 5 s, e.g.
  `[slow tick 1473] 41.0 ms: bot 17.4, send 17.0, human 2.5, vehicles 1.8`. On the server:
  `docker compose logs --tail 300 | grep -E "slow|tick "`.

## v0.32 - a bigger, ruined battlefield
- **Map 400 x 400 m** (was 320 x 320; about 1.6x the area). The front is 25% wider: wire gaps, communication trenches,
  dugouts, nests, HQs, guns, mines and the flank depots (now at x ±170-180) spread out to match. The six lines keep
  their depths (z ±30 / ±64 / ±100, homes at ±140), so Operations, spawns and weapon ranges play the same; the extra
  depth behind each home camp holds ruined villages. Terrain is 800 x 800 cells (still 0.5 m).
- **Structures (about 35 a map, from the map seed):** shelled-out farmhouses (brick), chapels with a broken tower
  (stone), burnt barns (charred timber), walled yards and broken wall stubs; wrecked tanks, lorries, a downed biplane,
  a field gun and wagons. Ruins sit at the flank depots (the farms, chapels and works they are named after), behind the
  reserve lines and around the home camps; tank hulks, the plane wreck and wall stubs give cover in no-man's land.
  Every piece is solid: it stops walking, bullets and sight on the server and client alike, bots route around it,
  tanks can't drive through the taller pieces, and anyone spawning on one is moved clear. They show on the minimap
  and the spawn map, and the client merges them into one mesh per material. Test: `structs`.
- Fix: on the spawn map, the first flag could look picked before you chose anything.

## v0.31 - gameplay round 1
- **Wrecked guns and repairs:** an enemy grenade in a trench MG nest or a shell beside it knocks the gun out (the gunner
  is thrown off, +30 XP, kill feed). Anti-tank rifle rounds now damage field guns and mortars too. Any wreck of your
  own side is repaired by holding E beside it: a sapper takes about 8 s, anyone else about 20 s (+15 XP). An
  unrepaired MG nest comes back on its own after 90 s. Test: `wrecks`.
- **Mud and flooding:** in rain, trench floors flood (wading, about 22% slower), shell holes fill with water (about
  28% slower) and no-man's-land turns to mud (about 12% slower); dugouts stay dry. The rule lives in the shared
  movement code, so prediction stays exact; the ground looks dark and wet where it applies. Test: `mud`.
- **Field telephone lines:** three wires on poles run from each side's HQ dugouts to its front trench (on every map).
  Artillery (barrage, smoke, gas, creeping, heavy) needs at least one working line, and every cut line makes those
  cooldowns about 35% longer. Shells cut wire; an enemy holding E at the wire cuts it (sapper 1.5 s, others 3 s,
  +15 XP); holding E at a break of your own splices it (sapper 2.5 s, others 5 s, +10 XP). Breaks mend themselves
  after 120 s. Cuts show red on the minimap; the officer panel shows "telephone x/3". Test: `phones`.
- **Beginner tutorial:** on a first deploy a coach card walks through moving, sprinting, firing, reloading, going over
  the top, objectives and teamwork, each step ticked off by doing it (touch players get touch wording). It can be
  skipped, and Settings > Controls brings it back. Officers never see it. Test: `browser_tutorial`.
- **Tunnel mines:** two mine shafts (timber frames) per side in the front trench. Holding E at one digs a gallery under
  the enemy front trench opposite (sapper about 75 s of work, others 3x slower, diggers add up). Half-way the enemy
  hears it: holding E at the listening post (sign post) above the charge countermines it (sapper 5 s, others 10 s),
  collapsing the gallery. A finished gallery blows three big craters under their trench (+50 XP to the diggers). A
  shaft needs 60 s before it can be dug again. Test: `tunnels`.
- **Aircraft and AA guns:** the officer's bomber run and recon flight are now flown by biplanes that cross from your
  own side (the bomber drops 8 bombs along its path; the recon plane circles the target for 25 s), plus a new
  strafing run (tier 2, hotkey J: a fighter rakes a 60 m line). Rifles and MGs can shoot planes down (+40 XP);
  each side has two AA guns between its HQ dugouts that fire flak at enemy planes within 110 m. A plane shot down
  stops its job and crashes. AA guns are wrecked by enemy shells and repaired by holding E, like MG nests; knocking
  out their AA first makes air support safer. Test: `planes`.
- **Spawn map:** when you die, a map of the battlefield replaces the text list. Click your base, a field post, rally
  point or building respawn point, or any flag your side fully holds (you respawn in that trench). A flag that is
  being taken or has an enemy within 25 m is greyed out; if it falls before you respawn you go elsewhere and are
  told. Number keys still work. The pause menu no longer pops over the map when you die. Test: `spawnmap`.
- Fix: wrecked MG nests now reset at the start of every round even when the map doesn't change.

## v0.30.1 - phones, the rifle, the minimap, the launcher goes live
- **Touch controls** (Settings > Controls; on by default on touch-only devices): a floating stick on the left half (push
  to the edge to sprint), drag on the right half to look, and buttons for fire, aim, jump, crouch, reload, grenade, heal,
  use (F), E, spot, melee and gas mask, plus fullscreen, scoreboard and menu. Buttons send the same key presses as the
  keyboard. On phones the minimap moves to the top left. Officers still need a mouse.
- **Minimap for every soldier** (was squad leaders and officers only).
- **Rifle first-person arms:** pouches covered with sleeve cloth and one clean cut under the forearm (bolt rifle,
  carbine, anti-tank rifle); the shotgun and bandage poses are unchanged.
- **Launcher points at the live server** (`https://trenches128.duckdns.org`) and publishes to this repository's
  releases. `/download` on the server sends players to the newest installer (`T128_LAUNCHER_URL`), and the web
  connect screen links to it.
- **Tests:** `browser_touch` (a phone: stick walks, drag turns, buttons fire/aim/crouch/reload); `launcherfiles`
  covers the `/download` fallback.

## v0.30 - a new map every round
- **Procedural maps:** each round is played on a new layout, rolled from a seed (`T.setMap(seed)` in `shared.js`; seed 0
  is the classic map). The six trench lines stay at their depths, so Operations, spawns and ranges are unchanged. What varies:
  the bends of the lines and the lie of the ground; the shell-hole pattern and the two mine craters; wire gaps,
  communication trenches and dugouts; the six line objectives; MG nests, HQ shelters, field guns and mortar pits; the flank
  depots and their names. Placement follows spacing rules (no dugout on a communication trench, no mortar in an HQ,
  objectives zig-zag…); a layout that fails the sanity check is re-rolled.
- **No pause at the round change:** the next map's terrain (about a second of work) is built in a worker thread
  (`mapworker.js`) during the 15 s end screen; the swap at the reset takes about 30 ms.
- **Players:** the page is built for one map, so at the round change it saves the player's seat, reloads onto the new
  map (a second or two, everything cached) and rejoins by itself: same name, side and squad (a single-use rejoin ticket
  from the server), same loadout, deployed again. A page never reloads in a loop (at most 4 map reloads a minute).
- **Settings:** `--maps vote` (default: players vote between rounds), `--maps random` (a new trench map every round), `--maps classic`, `--maps wake` (Wake Atoll only), `--maps rotate` (two trench maps, then Wake Atoll), or `--maps <number>` for one fixed map. `--mode ops|attrition|mix` sets the trench-map mode when there is no vote (env `T128_MAPS`, `T128_MODE`). `/health` shows the
  current map number. Tests run on the classic map.
- **Fairness check:** `node tools/mapcheck.js 60` builds 60 maps and walks the bots' pathfinding from both home lines to
  every objective, depot, nest and gun, and compares the two sides' attack distances: 60 of 60 passed, sides within 5%.
- **Fixes found on the way:** the bots' route cache is cleared when the map changes; `host.js` (the one-click start)
  also defaults to random maps.
- **Tests:** `maps` (17 checks: the worker's map is identical, everything is relocated, tickets are single-use, bots fight
  on the new map) and `browser_maps` (a real page joins, reloads onto the map, and after a round comes back on the same
  side and squad, deployed).
- If you host the browser client on GitHub Pages, rebuild it (`npm run site`): an old copy would draw the wrong map.

## v0.29.1 - gunner's sights, filled-in arms, the launcher
- **Field gun (howitzer):** field glasses on the fall of shot (an oblique view from above the landing point, two-lens
  vignette with a mil scale); hold RMB for the gun's own telescope for direct fire, with the gun model hidden. Both look
  at the landing point; the HUD shows range, elevation and flight time.
- **Mounted machine guns** show the Lewis gun's aiming picture and firing frames; the nest's gun block is hidden.
- **First-person arms:** where the chest was cut out (rifle, carbine, anti-tank rifle, trench gun, bandaging), the hole
  is filled with sleeve cloth copied from the arm (`build/fpv_fill.py`).
- **Bots:** sheltering bots line up on the dugout door instead of catching on the jamb; bots sheltering, raiding a
  depot or charging are not pulled away to man an empty MG, and sappers and medics are picked last for MG duty.
- **Security (audit):** the connect screen escaped neither the saved callsign nor a `?server=` link value; a crafted link
  could have run script on a server's page and read saved logins. Both are escaped now.
- **Windows launcher** (`launcher/`): server browser (your list server, favourites, recent, direct connect, ping),
  patch notes, callsign, settings; Play opens the server's own game page in a fullscreen game window, so the game is
  always the server's version. Updates itself from GitHub Releases (or your own server). The game server can host the
  installer and updates: files in `public/launcher/` are served at `/launcher/…`, and `/download` sends the newest installer.
- **Tests:** fuzz now covers chat; new `launcherfiles`; the browser test covers the MG sights and both howitzer views;
  five flaky tests fixed at the cause (see above) or made to wait properly. Launcher: `cd launcher && npm test`.

## v0.29 - early-tester fixes (round 2)
- **Aiming down sights:** each weapon's aiming frames are lowered so the tip of the front sight sits just below the screen centre (trench gun 24 px, AT rifle 16, Lewis 8, rifles 5); a faint dot stays at the aim point with iron sights.
- **No more shooting through walls:** bullets were tested every 0.5 m and sight lines every 1 m, so 0.22-0.45 m timber walls could be skipped (about 1 bullet in 10 went through a blockhouse wall; bots also "saw" through walls and fired). Walls are now clipped exactly against the whole bullet / sight segment; the firing slits still work.
- **HQ shelters are solid:** their four posts block walking, their roof stops bullets and sight (and you can still walk in under its edge); tanks can't drive into them.
- **Trench floors and fire steps** can be dented by at most 12 cm; walls and open ground still crater. **Terrain everywhere** is capped at 1.2 m below and 0.45 m above the original map, so stacked shells no longer dig pits that trap men and tanks.
- **Tanks** rest on the highest ground under each track, so they bridge trenches and climb out of them (they used to crawl to a stop), drive over dugout roofs, and are blocked by HQ shelters.
- **Props stay on the ground:** signs, grass, barrels, trees are re-seated when a crater or a blown-in bay changes the ground under them (and when you join a match in progress). MG nests and gun / mortar pits stand on protected ground.
- **Trench mortar sight:** manning a mortar switches to an overhead view centred on where the bomb lands, with the blast ring (mouse up / down: range, left / right: bearing).
- **HUD:** kill feed moved to the top left; minimap size slider (Settings → HUD, 1-3x, default 1.5x).
- **Text chat:** Enter to everyone, U to your side (rebindable); plain text only, 120 characters, rate limited; lines also appear in the server window.
- **Spotting:** tap T every 0.4 s (was 8 s) to spot up to five enemies near your crosshair; markers are half the size and float just above helmets; the big X is now only for ground targets (the officer still gets a mark every 8 s). Bots go for spotted enemies first when they can see them, and engage them a little further out.
- **New soldiers** from the owner's reference art: olive uniforms with webbing and packs, blue helmet band / collar tabs / chevrons for blue, green for green; front, back, side and aiming views, idle with a walking bob; medics wear a red-cross patch, recon field glasses, officers collar pips. The rifle is part of the body art now (the separate weapon layer is off). Bodies that come to rest lie in one of three fallen poses from the same art.
- **First-person polish (tester feedback):** every weapon and item is smaller (about half the screen height at the hip, a modest aiming view) and stands on the bottom edge of the screen; the backdrop is removed by flood fill from the picture edges, so dark gun metal no longer shows see-through holes; full colour (no speckled sleeves); the player's own chest, webbing and pouches are masked out (first person never looks down at the body). New MP18 SMG from the owner's art; carbine, anti-tank rifle and heavy MG are made from the rifle and Lewis art at different sizes; the flamethrower keeps its old art at the new size.
- **TAB screen:** scoreboard at the top, the help panel underneath, kill feed and chat hidden while it is open (they overlapped).
- **MG nests:** no gunner spawns at the trench nests any more; the nearest free bot walks over to man an empty nest (also when its gunner dies, or a player leaves it).
- **Second art pack:** soldiers now run (two running strides, used back to back when sprinting) and kneel when crouching (5 poses); gunners carry the Lewis gun, recon the scoped rifle, assault troops the trench gun, medics run with their bag, officers aim a pistol (views without art fall back to the rifleman). First-person Lewis gun (hip, firing, looking down the barrel over the drum) and scoped rifle; hands-and-item animations for bandaging (H), the syringe while reviving (E) and the grenade throw (G). The first-person view now always spans the full screen width, so arms and stocks run off the screen edges.
- **New first-person rifle and trench gun** from the owner's art: hip and aiming views, the rifle's muzzle flash, smoke and five-step stripper-clip reload; the trench gun borrows the flash and smoke and dips to reload. Other weapons are unchanged for now.
- **Gas mask view** (after the Battlefield 1 reference): two big round lenses with soft dark edges, the nose bridge and the filter rim, a cool drained picture and breath fogging the glass in time with the breathing (was a pair of small slits).
- **Idle bots no longer spin on the spot:** a guard whose own spot lay just outside his trench band stepped out and was led back in, every tick (20 half-turns a second). He now holds still; idle men also turn at a human pace, and fighting men keep facing their target while they move.
- **Round reset** no longer regenerates the map (0.75 s server freeze each round, now 4 ms).
- **Tests:** `test/v29.js` (21 checks), `test/tanktrench.js`, `test/browser_v29.js`; the old build fails the tank and wall checks.

## v0.28.1 - soldiers stuck in dugouts
- **Dugouts are shell-proof:** craters, crater rims and blown-in bays no longer change the ground under a dugout roof or in its doorway. Before, a shell nearby could raise the floor or leave a hollow under the roof edge, and anyone standing there was pinned between ground and roof (head in the beams).
- **Map fixes:** the earth heap behind each trench (parados) no longer reaches into dugout floors and doors (27 of 31 dugouts had raised patches under the roof); the two hillside dugouts at x −138 had a 1.5 m ledge at the door, and their floors now sit level with the trench.
- **Safety net:** where ground is ever too close to a roof, the roof no longer pushes a soldier down, so nobody can be pinned.
- **Tank AI crash:** a tank with a target more than 70 m away and nowhere to drive crashed the server tick every tick, freezing the game. Fixed, and each part of the tick (bots, players, vehicles, bullets, objectives…) is now isolated: an error is logged and the game keeps running.
- **Tests:** the officer test no longer breaks when AI artillery kills the squad leader mid-check (leadership correctly passes on, but the check was looking for the old leader); the network tests got their own port (they could connect to the fuzz test's server while it was shutting down); `bots.js` now fails if its clients drop.
- New `test/dugouts.js` (1,240 shells on the dugouts, then a soldier walks out of each one; the old code fails it). A 150 s battle with dugouts shelled every 2 s: no pinned or stuck bots, no tick errors.

## v0.28 - audit and launch polish (early testers)
- **Security:** a crafted `join` (e.g. class `constructor`) or a `null` message could crash the server: every lookup keyed by client text now goes through `own()`, non-object messages are dropped, every handler is wrapped, fragment counts are capped, test hooks need finite numbers. New `test/fuzz.js` throws malformed and hostile messages at a live server.
- **Hosting:** behind the `host.js` tunnel or Caddy / nginx every player arrived from one address, so the 8-connections-per-address cap and the login rate limit would have locked out the 9th tester. `host.js` and Docker now read the real address from the proxy's headers (only when the connection comes from this machine or a private network; rightmost `X-Forwarded-For` entry or `CF-Connecting-IP`). The server list blocks private addresses, caps listings per address and no longer shows hosts' IPs; HTML escaping now also covers quotes in attributes, and server-list numbers are forced to numbers.
- **Smoother client:** trees, grass and props are drawn from a few static batches instead of thousands of sprites (far fewer draw calls); smoke, fire, explosion rubble and smoke-screen sprites are pooled and capped (no garbage-collection churn, no runaway particle lists in heavy shelling); terrain edits upload only the changed rows; the HUD only touches the page when its text changes; the FPS readout shows the worst frame, draw calls, soldiers and props.
- **Fixes:** stalled-vehicle check ignored manned guns; humans going down now reach the kill feed first; alarms cleared between rounds; bayonet-charging bots stab what they charged.
- **Testing:** `npm test` (all server + network tests, keeps your `xp.json` / `accounts.json` safe), `npm run test:all` (adds 21 real-browser tests incl. a 90 s night-battle soak). Full regression: 24 server/network + 21 browser tests pass (two flaky checks in the revive test made deterministic); 5-minute 270-soldier server soak: heap flat at 10 MB, no errors.

## v0.27 - destruction, smarter bots, a faster client, running it for real
- **Trench bays cave in.** An artillery shell, bomb or field-gun shell that bursts in a trench can blow its 9 m bay in (once per bay per round). Spoil half fills it, its revetments, duckboards and sandbags vanish, and the men in it are buried (35 damage, pushed up onto the spoil). Dugouts, wire gaps, MG nests and objective bays never collapse. Server and clients replay the same ordered crater log, so the terrain stays identical. That fixed an old mismatch too: the server now digs with the same rounded numbers it sends.
- **Smarter bots:**
  - **Grenades into trenches:** a bot lobs a grenade into a trench or crater where enemies shelter, at a knot of three or more, or at an enemy it just lost sight of behind cover. Never near its own men, 18–30 s apart.
  - **Bayonet charges:** a bot with a bayonet rushes an enemy 4–15 m away with a roar you can hear. This is more likely when his squad is pushing, the enemy is hurt or he's an attacker. Charging men take less damage and don't fire.
  - **Dugouts under shellfire:** call-ins (barrage, bombers, heavy guns; a creeping barrage only for the enemy), the comeback barrage and shells bursting close send bots into the nearest dugout (six to a dugout) until it's over. They come out to stand to the parapet as soon as the enemy is within 30–40 m. Path-finding now only enters dugouts through their doors (it used to drop bots through the roof).
  - **Reviving:** bots now go down instead of dying when a medic is within reach. Medic bots run in under fire (others only when it's quiet), crouch to work, revive players first, and tell you who is coming. When you're down, press **Y** to shout for a medic. Players can revive downed bots too (+15 XP). About half of all downed men get back up in bot matches.
  - **Also:** bots bandage themselves in quiet moments, a squad going over the top throws smoke ahead of itself, and bots throw grenades at tanks within 15 m.
  - Fixed: `enemiesNear()` returned everyone in the neighbouring 32 m grid cells, not within the radius. Field posts, building checks and kit bots all used it.
- **Operations:** after a sector falls, the next line is locked for 40 s so the defenders can man it. Lines used to fall within half a minute of each other. Tickets are now 1.8 per player, because revives make each ticket go further.
- **Faster client:**
  - Every soldier body is one quad in a single batched mesh (one draw call for up to 700), and every carried gun one quad in another. Before, there were two sprites per soldier, each with its own texture.
  - Soldiers beyond what the fog lets you see aren't drawn; beyond 120 m they lose their gun layer.
  - Grass (70 m) and props (90–170 m) hide by distance.
  - The FPS display (Settings) now shows the worst frame time, draw calls and soldiers drawn.
  - **three.js ships with the game:** the page loads `vendor/three.min.js` first and only falls back to the CDN. `npm run vendor` (or the Docker build, or the server at start-up) downloads it once.
- **Running it for real** (see DEPLOY.md):
  - **Accounts:** name + password, scrypt-hashed. 30-day sessions, rate-limited logins, protected names, rank kept per account. Modes: off, optional or required.
  - **Server browser:** game servers announce themselves to a registry server, which checks each one before listing it. The connect screen lists servers with players, AI, operation state, weather and ping.
  - **Settings:** every setting is a flag or an environment variable.
  - **Hardening:** a page-origin allow-list, a per-address connection cap, atomic saves, and SIGTERM saves everything.
  - **Deployment kit:** a Dockerfile with health check, docker-compose with Caddy for automatic HTTPS, a systemd unit and an nginx config.
- Tests: `test/destruct.js` (11), `test/bots27.js` (20), `test/live.js` (21), `test/browser_v27.js` (9).

## v0.26 - armour, crewed guns, elite kits, weather and night
- **Tanks.** Blue fields a Mark IV (rhomboid hull, tracks all round, guns in side sponsons that cover the flanks), green an A7V (an armoured box on a tractor, bow gun covering the front). Two seats: the driver steers with WASD, lays the main gun with the mouse and fires shells; the second seat works the hull machine gun (it overheats). Empty seats are worked by an AI crew that drives to the objective under attack, swings the hull to bring its gun to bear, shells infantry and enemy tanks and fires bursts at men within 55 m. A tank crosses trenches, flattens wire and sandbags, runs down enemies in its path and rolls over enemy gun pits. Bullets bounce off with a dull ping; anti-tank rifles, bundle charges, shells and artillery do the damage (hand grenades barely dent it). Below 30% it burns and slows; knocked out, its crew bail out hurt and the wreck burns for a while. The attackers get one about 20 s into every round and one with every fresh battalion; an officer can call one in (tier 2, 50 CP) and it drives to the point he picked. One tank per side at a time. Inside you look through the vision slit or the sponson port; C switches to an outside view.
- **Field guns and trench mortars.** Two 77 mm field guns sit in levelled pits behind each reserve line, two trench mortars in dug pits behind each support line, each with a bot crewman. F takes over: the field gun traverses about ±35° and elevates, RMB looks through its sight, a ring on the ground marks where the shell will land; the mortar sets its range (25–170 m) with the mouse and marks the impact the same way. A shell costs 1 supply. Bot crews shell groups of three or more spotted enemies (never near their own men; the attacking side's guns fire more often), and field guns take on tanks they can see. A knocked-out gun is back in action 90 s later; guns on ground the defenders lose are spiked.
- **Shells are projectiles** (twice real gravity, so a 170 m mortar shot takes about 5 s): they fly with a smoke trail, burst where they land or on whatever they hit, and mortar bombs whistle on the way down when they fall near you.
- **Elite kits** (from the reference video's elite classes). Crates wait at each side's staging area: the attackers get a Flamethrower and a Sentry, the defenders a Tank Hunter and a Sentry. F at a crate makes you that elite until you die; the whole map is told, and a badge floats over elites. **Flamethrower**: 220 HP, a Kleif-style lance with a 14 m jet, burns men (8 hp/s for 3 s) and sets the ground alight, R swaps fuel (3 supply), its tank goes up when he dies. **Tank Hunter**: 200 HP, Mauser 13 mm anti-tank rifle (150 damage to armour a hit, kills a man outright), three bundle charges. **Sentry**: 300 HP, MG 08/15 with 100-round belts, cannot sprint. A new crate arrives a minute after a kit is lost; bots fetch kits nobody claims for 25 s. New first-person models (flamethrower lance, T-Gewehr, MG 08/15) and third-person weapon sprites.
- **Weather and night.** Each round rolls overcast (34%), fog (24%), rain (24%) or night (18%). Fog: thick, drifting banks; bots and spotting see 55% as far. Rain: streaks and hiss, mud slows sprinting to 86% and walking to 93%, fires burn out sooner. Night: dark, sprites and soldiers dim, sight drops to 45% except under flares. Flares (a new flare-pistol utility, three per life; the officer's **star shells**; sentries at night) light 55 m for 25 s, show everyone under them to the side that fired them and brighten the scene near you.
- Officer call-ins: **Tank** (=) and **Star shells** (T). Bots now throw grenades at tanks within 15 m.
- **Balance** (fast-forward 64 v 64 bot matches): with guns, tanks, elites and weather the first try gave attackers 0.6 sectors a round; after giving the attacking side's guns more fire and 2.6 tickets per player, three rounds went 2, 1 and 2 sectors (rounds 22–32 min). Tanks typically last 1–4 minutes. 256 bots: about 7–10 ms a tick at the start of a round (v0.25: about 7 ms), most of it bot path-finding.
- Tests: `test/vehicles.js` (38 checks), `test/browser_v26.js` (19 checks, run with `T128_WX=night`).

## v0.25 - kill feed, scoreboard, ping wheel, gas masks
- **Kill feed** (top right): killer, weapon, headshot mark, victim, in team colours; your own kills and deaths are highlighted. Bots now have names (French *Sdt.* and German *Gefr.* surnames). Kills involving a human go to everyone; bot-on-bot kills only to players within 160 m, so a 256-player server doesn't flood the feed.
- **Assists:** anyone who damaged the victim in the last 10 s (other than the killer) gets an assist and +3 XP.
- **Scoreboard:** hold TAB. Both teams with rank, squad, kills, deaths, assists and score (humans plus the top bots, 24 rows a side), team kill totals, dead players dimmed. The client asks once a second while TAB is held; the server rate-limits to one answer a second.
- **After-action report** on the end screen: MVP, Most kills, Sharpshooter (headshots), Lifesaver (revives), Eyes (spots), Objective (captures), best squad, each officer's call-ins / kills by support / orders completed, team kills, and your own line (kills, deaths, assists, score, revives, captures, spots, orders).
- **Quick-chat ping wheel:** hold Y, flick the mouse toward one of eight calls, let go: *Need a medic, Need ammo, Enemy there, Attack there, Thanks, Defend there, Request artillery, Request smoke*. Location calls use the point you're looking at (up to 120 m). Teammates get an icon in the world and on the minimap for 8 s, a chat line and a tone. *Enemy there* also spots the nearest enemy near that point; artillery / smoke requests reach your officer as an alert; *Need a medic* gets a nearby medic bot to patch you up. One ping a second.
- **Gas masks:** M puts it on or takes it off. Putting it on takes 1.5 s (no firing meanwhile). With it on, gas does a tenth of the damage, you can't aim down sights, your view narrows behind the eyepieces and you hear your breathing. Bots mask up when they walk into gas.
- **Smoke and gas grenades:** two new utility unlocks (*Smoke Grenades* at Corporal, *Gas Grenades* at Sergeant), two per life, thrown with H. Smoke: 5 m screen for 20 s. Gas: 5.5 m cloud for 12 s.
- New key binds `ping` (Y) and `mask` (M), rebindable; the TAB help lists them.
- Tests: `test/comms.js` (17 checks), `test/browser_comms.js` (12 checks, kill feed / scoreboard / wheel / mask / AAR in the real client).

## v0.24 - review and polish
- **Operations balance** (tuned with fast-forward bot matches, `T128_FAST=1`): on the 320 m map attackers used to respawn 110 m from their target and almost never took a sector. Now both sides stage close to the fight: attackers from a **jump-off trench** 14 m behind their own front line (then a forward HQ behind each captured trench), defenders from a **reserve position** 25 m behind the next line they still hold; at round start about half the defending bots already man the line under attack. Tickets 2.4 per player (min 80). Six simulated 64 v 64 bot rounds: attackers took 3, 1, 2, 0, 1 and 1 sectors (one full win), rounds 10-25 min.
- **Respawn picker** names the staging point (Jump-off trench / Forward HQ / Reserve position / Last-ditch position), rally points with their seconds left, and the nearest line for every post.
- **TAB panel**: controls are built from your actual key binds (lean, bayonet, mark / spot, hold breath for scoped rifles), a side-objectives line shows who holds each depot, officers see command points and tier; officers get their own command cheat sheet.
- **Connect screen**: a short "How to play" panel and the version number.
- README restructured: overview, quick start, how to play (classes table, controls), files, current protocol, known limits, then the changelog newest first.
- Soak test: 48 simulated players + 214 bots for 5.5 min: no errors, heap flat at ~8 MB, 4-9 ms average tick.
- Tools: `tools/opsim.js` (fast-forward Operations simulation), `test/browser_polish.js`.

## v0.23 - netcode for 128 v 128
Measured with `tools/loadtest.js` (simulated players that run, aim and fire like real clients, on the same 2-core box as the server):

| 256 simulated players, all moving and firing | before | after |
|---|---|---|
| server tick, average | 17-20 ms | 11-14 ms |
| server tick, worst | ~70 ms | ~31 ms |
| download per player | 27 KB/s | 12.5 KB/s |
| server upload total | 6.9 MB/s | 3.1 MB/s |

A realistic mix (64 humans + bots filling 128 per side) runs at 5-10 ms average. The tick budget is 50 ms.
- **Lag compensation.** The server keeps 1 s of every soldier's positions. Each input batch carries the server tick the client is drawing (`rt`, 100 ms behind the newest snapshot); a human's bullets are tested against targets where that player saw them (up to 400 ms back). Bots and explosions are not rewound. Respawns start a fresh history, so there are no "ghost" hits where someone used to be.
- **Delta snapshots** (frame type 3). Each player is sent only what changed since the last snapshot it got: a 3-byte header per entity, then a full or small (±1.27 m) move, yaw, flags and look only when they changed. Entities standing still cost nothing; entities leaving view are listed for removal. A client whose socket backs up gets a resync instead of a growing queue.
- **Binary tracers** (frame type 4): 18 bytes per shot instead of ~75 bytes of JSON, built once per tick for every 40 m patch of the map and shared by all players standing there.
- **Fewer writes.** Every socket is corked for the whole tick, so each player gets one network write per tick instead of one per message.
- **Less CPU.** Entities are encoded once per tick (not once per viewer); soldiers no longer re-check line of sight to enemies who are already spotted.
- Tests: `npm run test:net` (12 checks: client copy matches the server, removals, idle cost, rewind from the render tick, cap, compensated hit / miss, no ghosts). `test/snapdec.js` is a shared snapshot decoder for the Node tests. Load test: `node tools/loadtest.js [players] [seconds] [ws-url]`.

## v0.22 - Recon (sniper / spotter) class
- **New class: Recon** (unlocks at Corporal, 90 HP). Loadout: **Sniper Rifle** (new: 6x scope, 90 damage, one-shot body kills at 90-200 m, 620 m/s), Marksman Rifle (3.5x, moved here from the Rifleman) or Carbine. Soft cap and field glasses on the chest in the soldier sprites (both teams).
- **Scoped headshots kill outright** for the Recon (sniper or marksman rifle). A scoped Recon is also sent enemies out to 240 m (170 m unscoped, others 100 m) and the scope cuts through the haze, so long shots are actually visible. Other classes' headshots are unchanged. Bot snipers get the same: roughly one in seven of their hits is a killing headshot, out to 130 m.
- **Spotting [T]:** every enemy in your sights is spotted for the whole team for 12 s (a wide cone from the hip, a tight one out to 240 m through the scope) and a mark goes to the officer (strikes there are 30% cheaper). 3 s cooldown, +2 XP per enemy spotted, +5 XP **spot assist** when a teammate kills someone you spotted. While scoped, the Recon also spots whatever stays under his crosshair. (Every soldier still spots enemies within 80 m in plain sight, and T still marks a spot on the ground for the other classes.)
- **Spotted enemies** now carry a red marker over their heads for the whole team, visible through cover (they were only on the minimap before).
- **Scopes sway.** Scoped rifles drift in a slow figure-of-eight: crouching steadies them, moving or being suppressed makes it worse. **Hold Shift (sprint key) to hold your breath:** the sway nearly stops for up to 5 s; run out and it gets worse until you've recovered. A breath bar sits under the scope. Your shots go exactly where the swaying crosshair is.
- Bots: 6% of bots are Recon snipers (replacing the marksman riflemen); their scope glints when they aim at you.
- Protocol: class index 6 = recon, weapon index 6 = sniper (look byte); soldier atlas is now 14 rows (`team*7+class`); new event `spt` (spot confirmation).
- Tests: `npm run test:recon` (11 checks), `test/browser_recon.js` (11; needs xp.json with `reconbrowser: 150`).

## v0.21 - a bigger, battered battlefield
- **Map 320 x 320 m** (was 240 x 240; 1.8x the area). Lines at z ±30 (front), ±64 (support), ±100 (reserve); home bases at ±140; no-man's land is 60 m deep.
- **Lines bend.** Every line follows its own long curves (up to ~8 m either way) on top of the zig-zag bays, so no two lines run parallel. Communication trenches, sandbags, wire belts, MG nests, HQ dugouts, revetments and duckboards all follow the bends.
- **Objectives are staggered** along their lines (x = -52, 34, -18 / 22, -44, 58) instead of sitting in one column down the middle. Capture zones follow the bent line (68 m wide, 12 m either side of the trench).
- **Battered ground.** Craters everywhere (denser in no-man's land), some big ones, a second layer of small shell holes around the front, two large **mine craters** in no-man's land, and about 1 in 9 trench bays **blown in** (half filled with spoil, no revetment, no sandbags: shallower cover, an easier way in and out). The wire-gap lanes are kept clear so the ramps still work.
- Flank depots moved out to x ±140 between the front and support lines; more trees, stumps, rubble, wire and fires across the bigger field.
- Bots: nav grid now covers the whole map (320 x 320 at 1 m); line goals follow the bends. 262 bots ≈ 1-5 ms average tick (max ~39 ms).
- Map constants live in `shared.js` (`FL`, `OBX`/`OBJ`, `CT`, `GAPS`, `MINES`, `HOME_Z`, `NML`, `trenchC`, `trenchSlope`, `collapsed`). Tests updated to find intact stretches of line instead of fixed coordinates.

## v0.20 - the officer plays like an RTS
- **Fog of war.** The officer only sees enemies within 42 m of one of his own soldiers, spotted ones, and anything under a recon flight. The rest of the map sits under a dark sheet (and on the minimap) with holes where your men can see.
- **Squad cards and morale.** Each squad has a card: men alive, health bar, morale bar, ⚔ when under fire, current order and queued orders. Morale drops with suppression (blasts now suppress too) and 8 per casualty, recovers when the fire stops; Over the top +30, rally point +20 nearby, depot captures +15. An AI squad under 25 morale **breaks**: it falls back behind its own front line and shoots worse until it rallies at 55.
- **Selecting squads.** Click a card (Shift adds), drag a box on the battlefield, double-click a card to look at the squad. Shift+F1–F4 saves a control group, F1–F4 recalls it (twice quickly to jump the camera). Squad name banners float over each squad in the officer view.
- **Order queues.** Shift+click queues up to 4 orders per squad (move → defend → attack…). AI squads finish an order when their centre reaches it; human squads 3 s after their leader does; then the next one starts. Queued paths show on the minimap.
- **Creeping barrage** (30 CP, tier 2): a 30 m wide wall of shells walks 30 m toward the enemy over 20 s; the selected squads get an attack order to follow 6 s behind it.
- **Alerts.** Squad under heavy fire, squad breaking / rallying, depot or line under attack, depot lost / captured, enemy artillery or gas falling near your men, spotter marks, orders reached. Feed at the top left; click one or press Space to jump the camera there. Click the minimap to look anywhere.
- **Strike warnings for soldiers.** Your own team sees incoming friendly barrages, bombers, gas, heavy shells and creeping barrages as pulsing red rings on the ground and minimap, and a "FRIENDLY BARRAGE IN 3s - CLEAR THE AREA" countdown when standing in one. The enemy gets no warning.
- **Spotters [T].** Any soldier can mark what he's looking at (an enemy is also spotted for 10 s) for 30 s. Strikes on a fresh mark cost 30% less, land on the mark with half the spread, and pay the spotter 10 XP. Marks show as yellow X's in the world and on maps.
- **Requisition tiers.** Tier 1: barrage, supply drop, smoke, recon, rally point, paradrop. Tier 2 (hold 2 depots or take an enemy line): bombers, gas, creeping barrage, over the top. Tier 3 (hold all 4 depots or take two enemy lines): **heavy bombardment** (45 CP, 14 heavy shells over 50 m). Losing ground drops the tier again. Call-in hotkeys are now 1–9, 0 and -.
- Protocol: `sqs.l` rows gain `[morale, broken, health%, alive, total, x, z, underFire]`, plus `tr` tiers, `tier`, `mk` marks; `ords` rows gain the queue; `cmd order` takes `q:1`; `cmd sup` takes `sqs` (creeping barrage); new events `al` (alert), `sw` (strike warning), `mk` (mark); act `mark`.
- Tests: `npm run test:rts` (24 checks), `test/browser_rts.js` (15; needs xp.json with `rtsbrowser: 800`).

## v0.19 - side objectives and the RTS officer
**Flank depots (side objectives).** Four supply depots sit out on the flanks, away from the trench lines: Mill Farm (-94, 34), Chalk Quarry (-94, -34), Chapel Ruins (94, 34), Brickworks (94, -34). All start neutral.
- Stand inside (9 m) to capture: about 8 s alone, faster with up to 3 more soldiers than the enemy, frozen while contested. Leaving it alone slowly restores the owner. Pulling it past neutral takes it off the owner first.
- Holding them pays **command points (CP)** to your officer: +1 per 4 s base, +3 per 4 s per depot (so 15/min with none, 195/min with all four), +10 on capture, up to 250. Capturing soldiers get 30 XP, the officer 10.
- Bots go for them: from each team's garrison squad, up to 3 bots head for every depot the team doesn't hold and 1 stays on each one it does (8 per team at most). Officers can order squads to a depot: orders snap to its name.
- Shown as a flag with stores and a name board in the world, diamonds on the minimap, and a SIDE OBJECTIVE capture bar when you stand in one.

**Officer as an RTS commander.** Call-ins now cost command points (not the team's ammo supply) and the panel is a command bar: CP meter with income, depot status, squads, orders and 9 call-ins with cooldown sweeps.
- Hotkeys: 1-9 pick a call-in, Shift+1-9 pick a squad (Shift+1 = all), R / F / G attack / defend / move, C cancel the order, X cancel targeting. A ground ring follows the mouse with the call-in's radius; a call-in fires once, then the cursor returns to orders.
- Call-ins (CP / cooldown): Bomber run 30 / 60 s · Barrage 15 / 30 s · Supply drop 10 / 20 s · Paradrop 25 / 75 s · **Smoke screen** 8 / 25 s (three clouds across your view, block bot sight and spotting for 35 s) · **Gas shells** 25 / 70 s (11 m cloud for 25 s, 6 hp/s to everyone inside, friend or foe; bots flee it; yellow haze and coughing on screen) · **Recon flight** 10 / 40 s (every enemy within 50 m shows on your team's maps for 25 s) · **Rally point** 20 / 90 s (temporary respawn post for 90 s) · **Over the top!** 15 / 120 s (all AI squads attack the point, your wave goes now, whistles and banner).
- Protocol: `o.dp` = depot [owner, progress]; `sqs` adds `cp`, `cpMax`, `inc`, `k` (call-in keys), `r` (radii); new events `smk`, `gas`, `rc`, `wh`; `cmd sup` takes `yaw` (smoke line orientation).
- Tests: `npm run test:command` (21 checks), `test/browser_command.js` (needs xp.json with `cmdbrowser: 800`). `test/revive.js` no longer flakes (bot medics kept away).

## v0.18.1 - reference-video pass
Tuned against the uploaded gameplay video (Passchendaele trenches):
- **Sprint pose** now matches it: rifle carried diagonally at port arms, muzzle up and to the left, swinging and rocking with each stride; stronger horizon roll while running.
- **Colour grade** is cold, drained and contrasty (bright overcast sky over near-black mud and timber) instead of sepia; grain toned down. Film grit default 50%.
- **Field of view** default 85° (the reference plays wide).
- **Burning ground**: 14 patches of fire in no-man's land, a third of them sending up tall black smoke columns.
- **Hurt and death**: blood on the lens from heavy hits, a pulsing red edge below 35% health, the screen goes red when you die.
- **Kill notice**: "ELIMINATED NAME +10 XP" under the crosshair, tagged HEADSHOT or BAYONET.

## v0.18 - gunplay pack
- **Bullets travel and drop.** Player and MG rounds are projectiles: muzzle velocity per weapon (SMG 300 m/s, carbine 380, LMG 400, bolt 420, MG 420, marksman 520), 9.8 m/s² gravity, stepped every 0.5 m. Lead moving targets and hold over at range. Tracers fly at the same speed and drop, and kick up dirt where they land.
- **Sweet spots.** The bolt rifle kills with one body shot at 40–80 m, the marksman rifle at 70–130 m.
- **Recoil.** Each shot kicks the muzzle up (and a little sideways); about 60% settles back by itself, so automatics climb unless you pull down. Camera punch and a visible gun kick at the hip and in the sights. Automatic fire also blooms the spread.
- **Suppression.** A bullet passing within 2.6 m suppresses you (more from MGs, LMGs and rifles): supersonic crack and whizz from the shooter's side, the screen drains, blurs and darkens at the edges, your gun shakes and your spread opens. Close explosions suppress too. Suppressed bots shoot worse and stay down behind cover.
- **Hit markers and damage direction.** White X on a hit, bigger on a headshot, red on a kill, with a tick sound. A red arc around the crosshair points at whoever hit you (or the explosion).
- **Bayonets and melee [V].** Bolt rifle, carbine and trench gun carry a bayonet: a stab kills outright. Other weapons club for 60. Bots stab or club at close quarters.
- **Bayonet charge.** Sprint forward and hold V: 8.6 m/s for up to 3 s (refills in ~7 s), 40% less damage taken, a red tunnel vignette and wider view, and an automatic stab on contact. No firing while charging.
- **Sprint feel.** The gun swings down across the chest (new sprint frame, with a dip on the way in and out), stronger head bob with roll, wider sway, faster boots-in-mud footsteps, a little FOV push. No firing while sprinting, plus a short sprint-to-fire delay.
- **Scope glint.** An enemy marksman aiming his scope roughly at you flashes a glint you can see through the fog.
- **Grit.** The pixel-mode shader adds film grain, a muddy sepia grade and a vignette (Settings → Video → Film grit), and close blasts splatter mud on the lens.
- **Viewmodel frames.** Each gun sheet is now 32 frames: + sprint (26) and melee 27–31 (bayonet thrust for rifles and trench gun, gun-bash for the rest); bayonet meshes on the bolt rifle, carbine and trench gun.
- **Keys.** Melee/charge is V; the post-respawn toggle moved to P (saved settings are migrated).
- Protocol: `sh` entries gain `[9]` muzzle velocity; `hm` now carries `h` (head), `k` (kill), `m` (melee); new events `dd` (damage source x/z) and `sup` (suppression level + shooter x/z); input bit 64 = charge; act `melee`.
- Tests: `npm run test:gunplay` (22 checks), `test/browser_gunplay.js`.

## v0.17 - Operations (Battlefield 1 style)
Every round is now an Operation. One team attacks, the other defends, and the sides swap each round (blue attacks first).
- **Sectors**: the attackers take the defender's three lines one at a time, front line first. Only the current target line can be captured; the others are locked.
- **Tickets**: each battalion has `max(80, 2.2 × players)` tickets. Each attacker respawn after a death costs one; the first spawn is free. A captured sector refills the tickets.
- **Battalions**: at 0 tickets the attack stalls. Once every attacker is dead, or 30 s pass, that battalion is lost. After 15 s of regrouping a fresh battalion arrives with full tickets, +150 supply, free respawns and a 14-shell barrage on the target line. Losing 3 battalions means the defenders win; taking all 3 sectors means the attackers win.
- **Falling back**: when a sector falls, defender field posts and buildings in front of the next line are removed. Defenders left there get a 10 s "Fall back" warning, then die. The attackers' home base moves up behind the captured line.
- **Bots**: defenders guard the live lines; all three attacker squads gather and push the current target, regrouping when below 35% strength.
- **HUD**: role, sector, tickets and battalion in the status box, a ticket bar, and big announcer banners (sector captured/lost, attack stalled, fresh battalion, operation won/lost). The TAB panel shows the operation state.
- Protocol: `o` objective messages carry `op: [att, sector, nsec, tk, tkMax, bat, nbat, regroup, stall, targetLine]`; new events `opn` (announcements) and `oob` (fall-back countdown).
- Tests: `npm run test:ops` (18 checks), `test/browser_ops.js`; `test/round.js` rewritten for sectors.

## v0.16 - big first-person guns, armed soldiers, blast bodies, smarter bots
- **First-person guns** are rebuilt as real low-poly meshes (`build/vm.py` depth-buffered renderer, `build/vmguns.py` models): pack rifle for bolt/carbine/marksman, modelled MP18-style SMG, Winchester 1897-style trench gun and Lewis-style LMG, mitt hands with fingers and wool sleeves. Frames are 360x240 (Daggerfall-like resolution) in a 6-column atlas (32 per gun since v0.18) and the client stretches them over the full screen height, centred, so the hip gun is large (muzzle low and right of the crosshair, stock off the bottom-right) and the aimed frames already put the sights on the crosshair. 48-colour palette, grain and a dark outline per gun.
- **Aiming down sights** zooms slightly (rifles 1.45x, carbine 1.4x, SMG 1.3x, LMG 1.35x, shotgun 1.15x, scope 3.5x).
- **Soldiers carry their real weapon**: the body atlas has hold and aim arm poses (16 columns = pose x view), and a weapon layer (`soldier_guns.png`, 6 weapons x hold/aim x 4 views, rendered from the same gun models) is drawn over each soldier. The snapshot look byte carries the weapon in bits 3-5 and entity flag 128 means "aiming" (human ADS or firing, bot with a target in sight), so you can see when a soldier has his rifle on you. Bots now have classes and weapons (riflemen, SMG/shotgun assault, LMG gunners, medics with carbines, sappers, a few marksmen) with per-weapon fire rate, damage and range.
- **Bodies**: every death sends a `bd` event; explosion kills are thrown away from the blast with spin, shot soldiers topple where they stood; corpses stay 25 s. Explosions add a light flash, flying dirt, rising smoke and screen shake.
- **Bot AI** (`botai.js`): 1 m navigation grid with shared Dijkstra distance fields (one per trench line's capture zone, or per 6 m goal cell; at most one solve per tick, fields reused up to 8 s after the ground changes). Bots climb trench walls (short pause), go round buildings and wire, run from grenades, take cover when engaged (spot hidden when crouched, ideally visible when standing), duck and pop up to fire, kneel in the open when there is no cover. Attacking squads gather on their own line when their wave starts, then push together with two fire teams alternating every 5 s (one advances, one covers). Average tick with 262 bots about 2 ms.
- **Bots and buildings**: a free bot crews each unmanned building MG (a player can take it over); bot sappers lay out a redoubt or blockhouse 12-26 m behind their line when the team has 45+ supply (max 3 buildings), work it up, and usually add a respawn point.
- **Build preview**: choosing a structure shows a ghost outline in front of you, green when it can be built, red when not; left click places, right click or B cancels.
- **Respawn picker**: when you die, a panel lists home base and every friendly field post / building respawn point; click or press its number. The server honours the choice while it still stands (`act spawnAt`).
- `test/mg.js` fixed (teleports next to the nest; needs `T128_TEST=1`). New tests: `test/ai.js` (12 checks), `test/browser_v16.js`.

## v0.15 - officer camera, order rewards, softer dither
- **Officer camera**: hold right mouse and drag sideways to rotate, up/down to tilt (straight down to about 30 degrees); Q/E also rotate; WASD pans relative to the view; wheel zooms. The camera orbits the point it looks at, and clicks are ray-cast onto the terrain so orders and support land under the cursor at any angle. The minimap shows the focus circle with a facing tick. Test: `test/browser_officer_cam.js`.
- **Order rewards**: when a squad leader reaches an order point, the leader gets +20, every squad member within 25 m +10, and the officer +15 plus 2 per soldier present. While a defend order is held, everyone within 25 m earns +5 (leader +8) every 30 s.
- **Retro colour pass softened**: 20 levels per channel instead of 12, dither strength 0.5 instead of 0.9.

## v0.14 - pack-based rifles and grenades
- **Rifles from the LP Weapons Pack**: the bolt rifle, carbine (shorter) and marksman rifle (plus the existing scope) now use the pack's wooden US rifle mesh instead of block shapes. `build/fbx.py` reads binary FBX; `g3d.MeshSolid` draws each triangle in its texture colour with 3-band flat shading, no per-face outline, and near-clips the stock where it runs past the camera. Wood is warmed toward the reddish walnut of the reference shots. Bolt, clip, magazine and hand parts keep their existing animations, and `build/crunch_guns.py` gives the 1998 pixel finish (half resolution, 40 colours, ink silhouette).
- SMG, shotgun and LMG stay procedural: the pack only has modern versions (Uzi/UMP, tactical shotgun, belt-fed MG).
- **Grenades**: thrown grenades are spinning pixel sprites rendered from the pack - Mills bombs for blue, stick grenades for green (`gr` event now carries `tm`).
- Rebuild: unzip `LP_WeaponsPack_UNITY.zip`, set `LP_PACK` to its folder, run `python3 build/guns.py` then `python3 build/crunch_guns.py bolt carbine mark`.
- `Guns.rar` / `Desktop.rar` (first-person arm animations) are RAR5 with compressed entries, which this build environment cannot unpack; `build/rarls.py` lists them and `build/rarstored.py` extracts the few stored files.

## v0.13 - fortifications, home-base spawning, paratroopers
- **Build menu [B]** (number keys pick). Every class: sandbag pile (2 supply, waist high, jumpable), barbed wire (2, slows to 30%), makeshift cover (1, chest high). Max 8 small pieces per player (oldest replaced), 150 per team. Placed in front of you, facing where you look.
- **Sapper buildings**: sandbag redoubt (14 supply, 10 s of work, open top), timber blockhouse (22, 16 s, roofed), concrete pillbox (32, 24 s, thick roof). Lay one out, then hold [E] beside it to build it up (sappers full speed, teammates half). Each has loopholes in a 1.30-1.75 m band (crouch = fully hidden, standing shows only your head), a back door, and its own MG nest that faces the building's way. Rules: flat undug ground, 12 m between buildings, no enemies within 25 m, 6 per team, 2 per sapper. Collision only once finished.
- **Respawn point inside a building** ([B] then [8], 5 supply): the team can spawn there; it is lost when the building falls.
- **Damage**: only enemy explosions (grenades, barrage, bombers) and enemies holding [E] next to a structure (sappers tear down faster). Bullets stop at walls. +40 XP for destroying an enemy building.
- **Spawning**: everyone spawns at their **home base** (tents and flag behind the HQs, z = +-106) or at a field post / building respawn point. No more spawning on squadmates or at the front line. Bots use posts half the time.
- **Flag guards**: only 2 bots per owned line (the 3 nearest the front, max 6) start on and walk back to guard a flag; they ignore orders. Everyone else pushes up from home.
- **Officer reinforcements** (25 supply, 75 s cooldown): 10 bots parachute onto the clicked point and hold it for 90 s. Parachutes are drawn for any soldier more than 2.5 m above the ground.
- Shared code: `T.FORT`, `fortParts`, `fortWorld`, `addFort/delFort/clearForts`, `fortHit(x,y,z,r,body)` used by `step()`, `los()`, server `trace()` and bot movement. Events: `fo` full list, `fa` add/update `[id,k,team,x,z,yaw,y,done,hp,spawn]`, `fx` remove, `wk` work progress. Tests: `test/forts.js` (26 checks), `test/browser_forts.js`.

## v0.12 - polish pass
- **Guns** finished like the other sprites (`build/crunch_guns.py`): half resolution, wood-grain and steel speckle, one 40-colour palette per gun, dark ink outline, x2 nearest upscale. Darker wool sleeves; SMG and LMG stocks shortened like the rifles.
- **Retro colour pass** (on by default in pixel mode, Settings > Video > "Retro dithered colour palette"): the scene renders to a low-res target, then a fullscreen shader snaps colours to 12 levels per channel with a 4x4 ordered dither. If the shader fails it switches itself off and renders normally. Both shaders were compiled in real Chrome WebGL here.
- **Map detail**: ladders against the rear trench walls, ammo boxes and sand piles on trench floors, flat puddle decals (Jestan water, graded grey) beside the duckboards and in flat hollows of no-man's land.

## v0.11 - asset pass (textures, sounds, models, battlefield look)
- **Sounds** (Snake's Authentic Gun Sounds): per-weapon shots (7.62x54R for rifles/MGs, 7.62x39 carbine, 5.56 SMG, pitched-down shotgun), bolt and pump cycling after each shot, per-weapon reloads time-stretched to the reload length (shotgun loads shell by shell). Remote shots are quieter, low-passed, delayed by the speed of sound and panned by bearing. The server adds a weapon key as the 9th field of each `sh` shot and serves `.mp3` from `/assets`. Falls back to the old noise burst if a clip is missing. Test: `test/browser_audio.js` (real Chrome decodes all 12 clips).
- **Textures** (Jestan Pixel Texture Pack + Aquilarius Retro Textures, graded to a grey-brown palette by `build/textures.py`): pixel mud ground, horizontal-board revetments with posts and mud splash, slatted duckboards, timber, burlap sandbags.
- **Models** (PSX Tools, Ammo pack): GLB files rendered to pixel sprites by `build/glbsprite.py` + `build/models.py`: ammo boxes at HQs and behind MG nests, shovel and pickaxe by HQs.
- **Battlefield look from the reference video** (`build/battlefield.py`): overcast banded sky dome, grey fog, shell-splintered trunks and stumps, knife-rest wire in no-man's land, churned ground past the map edge with dead trunks, smoke columns and ruined brick walls on the horizon (outside the +-118 m play area, no collision needed).
- See `CREDITS.md` for licences.

## v0.10 - retro pixel pass (Daggerfall-style look)
- **Pixel render mode**: the 3D scene renders to a low-res target (`S.pix` lines, default 360, slider in Settings, 0 = off) and is upscaled with `image-rendering: pixelated`. All textures use NearestFilter (`artMat`, `pxTex`).
- **Ground**: procedural pixel mud texture with a `uv` attribute on the terrain mesh.
- **Sprites**: soldier atlas regenerated (half-res NEAREST crunch, shared 48-colour palette per team, inked edges, medic cross painted after the crunch); trees/grass/crate pixelated.
- **New props** (`build/props2.py`, sizes in `assets/props.json`): cross, rifle_helmet, barrel, sandpile, signpost, wirecoil, rubble, shrub, ladder. Placed client-side with deterministic `T.hash` scatter on undisturbed ground (`openG`); graves and helmets behind each line, barrels/sandpiles near the lines, wire and rubble in no-man's land, barrels and signs beside each HQ.
- Sandbags are drawn as instanced meshes straight from `T.SB`, so the visuals match the collision boxes.
- **Guns**: palette retuned from user reference shots (reddish wood, blued steel, bare hands, grey wool sleeves); rifle handguard lengthened, stocks shortened so the butt no longer fills the screen.

## Teams, limbs, ADS, sandbags, item limits (v0.9)
- **Teams** are now saturated **blue** and **green** (soldier sprites are recoloured by `build/soldiers2.py`; UI, flags and minimap follow; trench lines are "Green Front" etc.). Soldiers now have **arms, legs and boots** drawn in the same outlined style, and **walk-stride frames** (atlas columns = pose*4+view, 150 px tall frames).
- **Aim down sights**: hold **RMB** (or toggle in Settings). Per-gun zoom, centred sight picture (`gun_*.png` frames 21-25), marksman rifle gets a scope overlay. ADS spread is `spr*0.35`; hip fire is `spr + hip` (`hip` per gun in `WPN`). ADS slows movement, disables sprint, and cancels on reload/climb/MG. Command bit 32 = ADS.
- **Sandbags** (`T.SB`, ~60 walls on the enemy-side parapet of every line): block walking (jump to vault), bullets and line of sight. **Line of sight** is now sampled every metre instead of 10 samples, so terrain really blocks bot fire. Bots: hit chance cut to about half, ×0.55 vs crouched targets, aim lower at crouchers.
- **Item limits**: grenades 2 per life (assault 4, sapper 3) with 1 s between throws; bandages 3 per life (medic 5) with 6 s between; MG mount/dismount 1.5 s cooldown; counts shown on the HUD (snapshot header `reserved` = grenades | bandages<<8). Minimap moved to the top right.
- Gun art re-rendered at 264x224 with more detailed models (receiver, handguard, sights, magazines, scope). Tests: `test/limits.js` (18), `test/browser_ads.js`.

## Knockdowns and revives (v0.8)
- A lethal hit that is **not a headshot** (head = top ~0.4 m of the body) knocks a human player **down** instead of killing them (explosions and 60+ points of overkill still kill). Downed players bleed out in **30 s**, can't act, and are shown to teammates with a red cross.
- **Hold [E]** (rebindable "Use") for 1.2 s while down to respawn immediately. Lean-right moved to **Z** to free E.
- **Medics** hold [E] within 2.7 m of a downed teammate for 3 s (costs 2 supply) to revive them at 40% HP. Medic gets **+30 XP**, and **+4 XP for every kill** the revived soldier scores for the rest of that life.
- **Med-kit bots**: ~25% of friendly bots carry one. If a human teammate within 45 m is down and no enemy is within 32 m (and none targeted), they run over and patch them up in 4 s; they abort the moment it's unsafe. Bots themselves just die (no knockdown). Bots land headshots 10% of the time.
- Protocol: own-state flag 128 = down, entity flag 64 = down, events `down`, `rvp` (revive progress), `sp` with `rv:1`; client acts `revive` (repeated while held) and `giveup`. Tests: `test/revive.js` (26), `test/browser_revive.js` (needs `T128_TEST=1` for the `dmg` hook).

## Pixel guns, HUD and climbing (v0.7)
- **First-person guns** are pixel art rendered by `build/guns.py` (software renderer in `build/g3d.py`, palette matched to the pistol reference). Each gun has an atlas `public/assets/gun_<name>.png`: idle, 4 fire frames (recoil, muzzle flash, smoke, bolt/pump/charge cycle) and a 16-frame reload unique to the weapon: bolt/marksman = clip loaded through the open bolt, carbine/SMG = drop mag, fresh mag, charging handle, shotgun = shells pushed in one at a time then pump, LMG = lift cover, swap pan, close, charge. Reload plays over `WPN[w].rl` seconds.
- **HUD** follows the trench-shooter layout: bottom-left white weapon silhouette, big ammo count and health underline; top-left "Hold TAB for controls"; top-centre push timer/order. Hold **TAB** for the full panel (rank, XP, objectives, controls).
- **Climbing**: hold forward + jump at a wall 0.6-3.2 m high with a ledge to stand on ("Hold [Space] to climb"). Shared deterministic code (`climbTarget`, `climbAt`, `step`), request = command bit 16, server flags own-state bit 64 while climbing and ignores fire during it. The hands overlay is the keyed/pixelated climb-hands gif (`assets/climb_hands.png`, built by `build/hands.py`).
- Tests: `test/climb.js`, `test/browser_climb.js` (needs `T128_TEST=1` for the `tp` teleport message).

## Walled trenches and dugouts (v0.6)
- **Trench profile** (`shared.js`: `TP`, `CP`): steep revetted walls, a floor 1.9 m wide, and a **fire step** on the enemy side. Standing on the step puts your eyes just above the parapet; crouching drops you behind it. Terrain resolution is now 0.5 m so these shapes are real geometry.
- **Walls block you**: movement is refused when the ground half a metre ahead is more than 0.62 m above your feet. You can drop into a trench anywhere, but climbing out needs a way up: the **scaling ramps** at the three wire gaps (both sides of every line), the ends of the communication trenches, or a jump from the fire step over the parapet.
- **Dugouts**: 24 roofed rooms cut into the rear wall of the lines, with a timber door, bunks, a table and a lantern. The roof is walkable (you can stand on it), blocks bullets and line of sight, and limits headroom. Blasts from outside do 30% damage to anyone inside, so dugouts shelter you from barrages, but a shell landing on the roof does full damage. Sappers can build field posts inside them.
- Bots ignore wall blocking (they walk straight across) so waves are unaffected.
- Tests: `node test/trench.js` (16 in-process physics checks).

## Settings (v0.5)
Press **Esc** in game for the pause menu (officers too: Esc toggles it), or click the ⚙ button at any time. Settings are saved in the browser (`localStorage`).
- **Audio:** master volume, effects volume.
- **Controls:** mouse sensitivity, invert Y, raw mouse input, crouch/sprint hold-or-toggle, and rebindable keys for movement, sprint, crouch, jump, lean, reload, grenade, bandage, dig, machine gun, field post and post respawn (fire is left mouse).
- **Video:** field of view, resolution scale, fog density, FPS counter.
- **HUD:** crosshair style/size/colour, weapon sway, damage vignette.
Tests: `test/browser_settings.js` (23 checks) and `test/browser_officer_esc.js`.

## Field posts (v0.4)
A Sapper presses **B** to build a field post: 10 supply, 20 s personal cooldown, max 3 per team (a 4th replaces the oldest), at least 25 m from another friendly post and no enemies within 20 m. Posts have 300 HP. Humans respawn at a random friendly post when one exists (squad-mate spawns still take priority; **V** toggles it), and 35% of bot respawns use one too.
Enemy bullets do 60% damage to a post and explosions up to 250 (grenades, barrages, bomber runs); friendly fire is ignored. Destroying one gives +25 XP, the builder gets +15 for building and +2 per respawn there.
Posts ride on the 2 Hz objective message as `fp: [[id, team, x, z, hp]]`. Your own posts are always sent; enemy posts only when one of your living soldiers is within 110 m. Test: `node test/posts.js`.

## Art (v0.3)
`public/assets/` holds sprites generated from the *Trenchbound – 2D WWI Assets* pack. Blue = French horizon-blue with Adrian helmet, red = German feldgrau with Stahlhelm.
Soldiers are composited per team and class in 4 views (front, right, back, left; the client picks the view from the camera angle). Weapon views, dead trees, grass clumps and the supply crate come from the same pack.
Served from a flat `/assets/<name>.png|json` whitelist.

**Credits:** see `CREDITS.md` (Pas7 Studio, Jestan, Aquilarius, Snake's gun sounds, PSX Tools, Ammo pack).
**License warning:** the pack's own manifest says some included assets have unverified redistribution rights. Review the pack's terms before publishing or shipping this game publicly.

## Officer layer (v0.2)
* **Officer class**: unlocks at Lieutenant (700 XP), max 2 per team (`--officers N`). Officers are invisible to soldiers, cannot be hit, don't count for captures, and don't take an AI slot. They receive every friendly unit plus every *spotted* enemy.
* **Squad leader**: the highest-XP member (Corporal+) of each squad, ties to whoever joined first. Only leaders (and officers) get the minimap, and the server only sends map-wide spotted enemies to them.
* **Spotting**: anything a friendly soldier sees within 80 m (or a bot is shooting at) stays marked for the team for 6 s.
* **Orders**: officers order any human squad or the three AI squads (Assault 1/2, Garrison) to attack, defend or move; orders can be cancelled. AI squads follow them; human squads get the order on HUD, minimap and as a beam. A human squad completes an order when its leader gets within 15 m (+20 XP leader, +15 XP officer). With no officer on a team, AI squads revert to the wave logic.
* **Support** (spends the shared team supply, with team-wide cooldowns): bomber run 30 / 60 s (8 craters in a line after 4 s), barrage 15 / 30 s (7 shells over ~4 s), supply drop 10 / 20 s (crate heals and refills everyone within 10 m once a friendly touches it). Friendly fire applies; squad leaders get a warning with the grid.
* Officers earn XP for kills made by their support and 40 XP per captured line.

