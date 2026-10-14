# Companion Village

Three rival tribes build their villages while you run a show with [Bitfocus Companion](https://bitfocus.io/companion).

**▶ Live: https://mko1989.github.io/companion-village/**

| Tribe | Department | Style |
|---|---|---|
| 🎥 **Pixels** | Video | Mosaic steles, camera obscuras, TV masts and giant LED walls. They fight with blinding glitches. |
| 🔊 **Noises** | Sound | War drums, gramophone towers and line arrays. They fight with sonic rings. |
| 💡 **Lampys** | Lights | Beacon fires, searchlights and moving-head trusses. They fight with light beams. |

Pick your tribe when you first open the page. Each tribe is driven by **its own Companion counter**: the same Companion with different
variables, or completely different Companion machines (say video, sound and lighting each have their own). A tribe that isn't
connected runs on **AI**, growing and inventing at its own random pace.

Every press for a tribe brings **one settler and one year**. Every ~10 years that tribe **invents something**. 57 shared inventions plus
5 signature inventions per tribe carry it from the Middle Ages through the Industrial, Modern and Space ages into a **sci-fi future**:
- brick townhouses, factories and steam trains
- cars on tarmac, skyscrapers and aeroplanes
- rockets, fusion reactors and robots
- hovercars, sky pods, force fields, androids and a colony starship

Old houses get renovated into the new style as each tribe advances.

### The world
- **A big, varied map:** forests, snowy tundra, desert with palms and cacti, swamps, mountain ranges with snowy peaks, lakes and rivers.
- **Highways** link the three villages, with bridges over the rivers.
- **Day and night:** at night windows, street lamps, car headlights and each tribe's light show glow. Most villagers go to sleep.

### War & diplomacy
- **Relations** between every pair of tribes drift with their personalities (hot-headed or peaceful, trader or self-reliant) and with
  AV-department incidents, e.g. *“Noises unplugged Lampys’ amp to charge a phone”*.
- **Trade caravans** travel the highways (ox carts, then trucks, then hover-freighters). There are also **gifts** and **alliances**,
  allies **share inventions**, and hostile tribes send **spies** to steal them.
- **War:** soldiers are mustered from a tribe's real villagers, so losses cost population.
  - Armies march along the highways with **siege engines** that match the era: catapult → cannon → tank → drone swarm → battle mech.
  - Watchtowers, keeps and barracks shoot back.
  - Pixels' holograms act as decoys, and force fields stop the attack completely.
  - Winners loot and wreck buildings. Peace treaties come with tribute.

### Random encounters
Weather and wonders hit the whole map; everything else hits one tribe. The camera swings over to the action.

| Weather & sky | Trouble | Good times |
|---|---|---|
| ⛈️ Storm · 🌨️ Blizzard · 🏜️ Sandstorm · 🌑 Eclipse · ☀️ Solar flare | 🌪️ Tornado · ☄️ Meteor · 🌋 Earthquake · 🔥 Fire · 🔥 Forest fire · 🌊 Flood | 🎉 Festival · 💒 Wedding (sometimes across tribes) · 👶 Baby boom |
| 🌌 Northern lights · 🌠 Comet · ✨ Meteor shower | ☠️ Plague · 🦗 Locusts · 🐺 Wolves · 🐉 Dragon · 🥷 Bandits · 🛸 UFO · 🔌 Blackout · 🤖 Robot rampage | 🌾 Harvest · 💰 Treasure · 🐴 Merchant · 🧳 Migrants · ⏱️ Time traveller · 🎸 **Battle of the Bands** |

## 1. Set up Companion (once)

Each Companion-driven tribe needs a counter variable that goes up with button presses.

**Quick:** run the installer against your Companion (needs Node.js 22+):

```
node tools/install-trigger.mjs                              # localhost:8888, counts every press into $(custom:village_presses)
node tools/install-trigger.mjs 192.168.1.20:8000 --cmd village_pixels_cmd   # also create a command variable
node tools/install-trigger.mjs localhost:8888 --var village_noises          # count into another variable
```

**Or import** `tools/village-trigger.companionconfig` in the Companion web UI → *Import / Export* → *Import*.

**Or create it by hand:**

1. **Settings → Protocols → HTTP**: make sure **HTTP API** is enabled (it is by default).
2. **Triggers → Add Trigger**, name it `Village: count button presses`.
3. **Events**: open **+ Add event** and choose **On any button press**.
4. **Actions**: add the internal action **Custom Variable: Set value**:
   - **Custom variable**: `village_presses`
   - **Create if not exists**: ✔
   - **Value**: switch the field to **expression** mode (the toggle next to the field) and enter
     ```
     isNumber($(this:current)) ? floor($(this:current)) + 1 : 1
     ```
     A plain `$(this:current) + 1` can glue text together instead of adding (`"0" + 1` → `"01"`), so use the line above.
5. Make sure the trigger is enabled. Press any button: under **Variables → Custom Variables**, `village_presses` should go up.

To count only some buttons, skip the trigger. Instead, add the same *Set value* action to the press actions of those buttons.

### Several tribes on Companion

- **One Companion per department:** install the trigger on each machine. In the village Settings → *Tribes & Companion*, set each tribe to
  *Companion* with that machine's address. All of them can use `village_presses`.
- **One Companion, several tribes:** the *any button press* trigger counts every button, so use button actions instead.
  On the video operator's buttons add *Custom Variable: Set value* `village_pixels` = `isNumber($(this:current)) ? floor($(this:current)) + 1 : 1`,
  on the sound operator's buttons `village_noises`, and so on.

### Commands from Stream Deck buttons

Give a tribe a **command variable** (Settings → Tribes, or `--cmd` in the installer). A button with the action
*Custom Variable: Set value* `village_pixels_cmd` = `attack:noises` makes the Pixels march on the Noises. The village runs the command and
clears the variable, so the same button works again.

| Command | Effect |
|---|---|
| `attack:<tribe>` | declare war and send an army |
| `peace:<tribe>` | make peace and improve relations |
| `gift:<tribe>` | send a gift |
| `trade:<tribe>` | send a trade caravan |
| `ally:<tribe>` | offer friendship |
| `festival` | throw a festival |

`<tribe>` is `pixels`, `noises` or `lampys` (or `video`, `sound`, `lights`).

## The Companion module (two-way control)

The plain variable setup above only counts presses. The **Companion Village module** turns Companion into a full remote control
for the game: buttons send orders, and the village sends live variables and feedbacks back to Companion.

**Install**

1. Download the module: **[companion-village-module.tgz](https://mko1989.github.io/companion-village/companion-village-module.tgz)**
   (or build it yourself: `cd companion-module && corepack yarn install && corepack yarn package`).
2. In Companion go to **Modules → Import module package** and pick the file. This needs Companion 4.2 or newer.
3. **Connections → Add connection → Companion Village**. Choose which tribe this Companion plays as. The listening port is `17890` by default.
4. In the village press **S** → *Companion module* and enter `localhost:17890` (or the Companion machine's IP, e.g. `192.168.1.20:17890`).
   Set your tribe's *Driven by* to **Companion module**.
5. To count every press, add a Trigger with the event **On any button press** and the action
   **Companion Village: Add years** → *This Companion's tribe*.

On the Companion computer you can do steps 2–5 in one go:

```
node tools/install-module.mjs --tribe pixels --trigger        # [host:port] [--port 17890] [--label village]
```

The page talks to the module, not the other way round (it POSTs its state every half second and picks up queued actions), so
the same browser rules apply as for Companion itself: Chrome and Edge need the local-network prompt allowed, and the offline copy always works.
For several departments, give each Companion the module with its own tribe and list all addresses, comma separated.

| | |
|---|---|
| **Actions** | add years · attack · make peace · send gift · send caravan · offer friendship · festival · make any of 30 events happen · instant invention · give resources · camera (follow / map / tribe / zoom) · show/hide overlay · view as tribe · pause / speed · time of day · war, events, AI pace and day length settings · on-screen message banner |
| **Feedbacks** | connected · at war · under attack · army on the march · allied · stance between two tribes · event happening · era reached · tribe in the lead · screen viewing tribe · night · paused · tribe colour |
| **Variables** | `my_*` for this Companion's tribe and `pixels_*` / `noises_*` / `lampys_*` for each tribe: year, pop, era, era_name, inventions, last/next invention, wood, stone, food, buildings, construction, wins, losses, prestige, status, event, raid. Plus `rel_a_b`, `stance_a_b`, `clock`, `phase`, `leader_name`, `news`, `events`, `paused`, `speed`, `camera`, `connected` |
| **Presets** | years, live tribe tiles, war & diplomacy against each rival, every event, screen control, time of day, info |

## 2. Open the village

Open the live page, pick your tribe, then press **S** (Settings) → *Tribes & Companion* to enter your Companion address, e.g. `192.168.1.20:8000`.

### Can a GitHub Pages site reach Companion on my network?

Usually yes, but it depends on the browser. The page is **https** and Companion's API is plain **http**, so browsers apply
their "secure page → local device" rules:

| Where Companion runs | Chrome / Edge | Firefox | Safari / OBS browser source |
|---|---|---|---|
| Same computer (`localhost:…`) | ✅ (may ask to allow local network access) | ✅ | ⚠️ usually blocked |
| Another machine (`192.168.x.x:…` or `name.local`) | ✅ after you allow the *"access devices on your local network"* prompt | ❌ blocked | ❌ blocked |

**Works everywhere:** Settings → **⬇ Offline copy** downloads the whole app as one HTML file. Open that file directly
in any browser, or use it in OBS as a *Browser Source → Local file*. The offline copy has no https restrictions,
works without internet, and is the best choice for a show machine.

## Controls

| Input | Action |
|---|---|
| Drag / arrow keys | Pan the view |
| Scroll / pinch / + − | Zoom |
| Double-click | Zoom in |
| M | Whole map |
| 1 / 2 / 3 | Jump to Pixels / Noises / Lampys |
| D | Diplomacy |
| 0 or *Follow now* | Back to auto-follow. This also happens on its own after 60 s without input. |
| H | Hide the overlay (clean view for OBS) |
| K | Pause / resume |
| S | Settings |
| I | Inventions & chronicle |
| Space | Add a year and a settler by hand |
| F | Fullscreen |
| P | Performance overlay |

Hover a villager or building to see who or what it is.

URL options: `?tribe=pixels|noises|lampys`, `?host=192.168.1.20:8000`, `?var=my_counter`, `?cmd=my_command_var`, `?module=localhost:17890`, `?hud=0`, `?speed=2`,
`?events=gentle`, `?quality=low`, `?day=off|short|normal|long`, `?war=on|feud|off`, `?ai=match|steady|fast|slow|frozen`, `?inventEvery=5`,
`?demo=10` (no Companion: every tribe starts with 10 settlers and runs on AI; nothing is saved).

## Notes

- The village is saved in the browser (localStorage), separately for each address it's opened from. Presses made while
  the page was closed are caught up when it reopens.
- Version 4 is a new world with three tribes, so villages saved by earlier versions start over.
- **AI pace “in step”** (the default) means AI tribes advance when a Companion-driven tribe gets presses, each at its own tempo. They don't run away while nobody is pressing.
- On first start the page records the current counter, so only new presses count. If Companion restarts and the counter
  starts again from 1, the page notices and keeps counting.
- Graphics quality **Auto** lowers the render resolution on slower GPUs (e.g. retina laptops with integrated graphics)
  to keep the animation at 60 fps.

## Development

```
npm install
npm run dev       # local dev server with hot reload
npm run build     # type-check and build dist/index.html (a single self-contained file)
```

The code is TypeScript with no runtime dependencies. Vite builds it into a single inlined HTML file.

```
src/
  core/      settings, random/noise, utilities
  data/      buildings, inventions, names
  game/      world generation (biomes, rivers, highways), tribes & AI pacing, villagers, buildings, events, eras & inventions,
             war, diplomacy & trade, day/night, traffic (cars, train, planes, rockets), save/load
  render/    canvas renderer, night lighting, sprite caches, terrain, building art (medieval → sci-fi), tribe landmarks, effects
  view/      camera & input (pan/zoom/follow, hover)
  ui/        HUD, settings, notifications
  net/       Companion HTTP API (per-tribe counters, command variables) and the Companion module sync
companion-module/  the Companion Village module (from bitfocus/companion-module-template-ts)
tools/       installers for the Companion trigger and the module, trigger import file
```

Pushing to `main` deploys to GitHub Pages via `.github/workflows/pages.yml`, which also builds the module package.

`legacy/village-v1.html` is the original single-file version.
