# Credits and third-party assets

| Used for | Source | Licence status |
|---|---|---|
| Soldier, tree, grass, crate art (pixelated) | Trenchbound – 2D WWI Assets, Pas7 Studio (https://pas7studio.itch.io/) | Pack manifest flags some files as unverified for redistribution – check before public release |
| Ground mud, revetment planks, timber, burlap, brick, puddles (`tx_mud`, `tx_timber`, `tx_burlap`, `tx_brick`, `tx_puddle`, graded/recoloured) | Pixel Texture Pack by **Jestan** (https://ko-fi.com/jestan, @jestanpixels) | Jestan's Public License (CC BY 4.0 adaptation, game use only, attribution required) – full text in `licenses/Jestan-PixelTexturePack-License.txt`. Modified: desaturated, darkened, tinted, tiled, mud splash added. |
| Revetment boards, duckboards, stone (`tx_revet_f`, `tx_revet_b`, `tx_duck`, `tx_stone`, graded) | Aquilarius Retro Textures | **No licence file in the pack** – confirm the terms with the author before release |
| Gun shots, bolt/pump cycling, reloads (`s_*.mp3`, trimmed, mono, some pitch-shifted) | Snake's Authentic Gun Sounds | **No licence file in the pack** – confirm the terms before release |
| Shovel, pickaxe sprites (rendered from 3D) | PSX Tools pack (GLTF/FBX) | **No licence file in the pack** – confirm before release |
| Ammo box sprites (rendered from 3D) | Ammo pack (`Ammo_glb.glb`) | **No licence file in the pack** – confirm before release |
| Bolt rifle, carbine, marksman rifle meshes (first person and the rifles carried by soldiers); grenade sprites (`nade`, `nade_mills`) | LP Weapons Pack (Unity) | **No licence file in the pack** - confirm before release. Only rendered sprites are shipped, not the FBX files. |
| SMG, shotgun, LMG models, first-person hands, soldier arm poses | Procedural (`build/guns.py`, `build/hands.py`), shapes guided by user-supplied reference images | Original |
| Graves, barrels, wire, splintered trunks, knife rests, smoke, sky, parachute, tents, flags | Procedural (`build/props2.py`, `build/battlefield.py`, client code) | Original |

The Elder Scrolls II: Daggerfall was used only as a visual style reference. None of its files are included.

- v0.26: the flamethrower lance, Mauser T-Gewehr and MG 08/15 first-person models (and their third-person sprites) are original models built in `build/vmguns.py`; the tanks, field guns, mortars, flames, flares, rain and fog are drawn procedurally in the client (boxes, extrusions and canvas textures). No new third-party assets.

- v0.27: no new art assets. three.js (MIT licence, https://threejs.org) is downloaded into `public/vendor` by `npm run vendor`; its licence travels with the file.

- v0.29: **soldier sprites and fallen-soldier poses** (`soldiers.png`, `soldiers_dead.png`) are cut out, scaled and pixel-crunched from reference sheets supplied by the project owner (`build/ref/`, generated with Google Gemini). Green-team aiming views are recoloured from the blue ones. Build: `python3 build/soldiers4.py`. The previous atlas generator is kept as `build/soldiers3.py`.
- v0.29: **first-person bolt rifle and trench gun** (`gun_bolt.png`, `gun_shotgun.png`) are built from the owner's reference art (`build/ref/fpv_*.jpg`: hip and aiming views, the rifle's fire and stripper-clip reload strips). Build: `python3 build/fpv_guns.py` (strip panels are registered onto the aiming picture by `build/fpv_reg.py`). The other weapons keep their v0.18 sheets.
- v0.29 (second pack, `build/ref2/`): running, kneeling and class poses (Lewis gunner, sniper, trench gun, medic with bag, officer with pistol) for the soldier atlas; first-person Lewis gun and scoped rifle; bandage, field kit, syringe and grenade hand animations (`fpv_items.png`). All supplied by the project owner.
- v0.29: first-person carbine, anti-tank rifle, SMG and heavy MG are generated from the owner's rifle and Lewis-gun art at different sizes (`build/fpv_guns.py`); the flamethrower keeps its v0.26 art, shrunk to the new view size.
