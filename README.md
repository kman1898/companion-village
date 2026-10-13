# Companion Village

A Settlers-style village that grows while you run a show with [Bitfocus Companion](https://bitfocus.io/companion).

**▶ Live: https://mko1989.github.io/companion-village/**

Every button press on your Stream Deck (or any Companion surface) does two things:
- A new settler arrives. Settlers become builders, woodcutters, stonemasons or farmers.
- A year passes. **Every 10 years the villagers invent something random** (wheelbarrow, iron tools, masonry, paved roads, astronomy…).
  Inventions unlock new buildings and make the village work better.

Villagers chop trees, quarry stone, farm wheat and build houses, farms, granaries, bakeries, a market, a tavern, windmills,
a chapel, a library, a clock tower, watchtowers, fountains and finally a castle keep.

Now and then **something happens**:

| Disasters | Good times |
|---|---|
| ⛈️ Thunderstorm (lightning can set buildings on fire) | 🎉 Village festival (everyone dances, then works faster) |
| 🌪️ Tornado (wrecks buildings, throws villagers around) | 🌾 Bountiful harvest |
| ☄️ Meteor strike (leaves a crater) | 🐴 Travelling merchant |
| ☠️ Plague · 🌋 Earthquake · 🔥 Fire · 🦗 Locusts | |

Some inventions protect against disasters: Lightning Rods, Storm Cellars, Herbal Medicine, Astronomy and the Bucket Brigade.
Destroyed and burned buildings are rebuilt by the builders. The dead get a graveyard.
In Settings, random events can be set to **On** (disasters can destroy and kill), **Gentle** (damage only) or **Off**.

## 1. Set up Companion (once)

Companion needs a trigger that counts button presses into the custom variable `$(custom:village_presses)`.

**Quick:** run the installer against your Companion (needs Node.js 22+):

```
node tools/install-trigger.mjs                  # localhost:8888
node tools/install-trigger.mjs 192.168.1.20:8000
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

## 2. Open the village

Open the live page, press **S** (Settings) and enter your Companion address, e.g. `192.168.1.20:8000`.

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
| 0 or *Follow now* | Back to auto-follow. This also happens on its own after 60 s without input. |
| H | Hide the overlay (clean view for OBS) |
| S | Settings |
| I | Inventions & chronicle |
| Space | Add a year and a settler by hand |
| F | Fullscreen |
| P | Performance overlay |

Hover a villager or building to see who or what it is.

URL options: `?host=192.168.1.20:8000`, `?var=my_counter`, `?hud=0`, `?speed=2`, `?events=gentle`, `?quality=low`,
`?demo=10` (no Companion: start with 10 settlers, add more over time, nothing is saved).

## Notes

- The village is saved in the browser (localStorage), separately for each address it's opened from. Presses made while
  the page was closed are caught up when it reopens.
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
  game/      world generation, simulation, villagers, buildings, events, years & inventions, save/load
  render/    canvas renderer, sprite caches, terrain, building art, particles
  view/      camera & input (pan/zoom/follow, hover)
  ui/        HUD, settings, notifications
  net/       Companion HTTP API polling
tools/       Companion trigger installer + import file
```

Pushing to `main` deploys to GitHub Pages via `.github/workflows/pages.yml`.

`legacy/village-v1.html` is the original single-file version.
