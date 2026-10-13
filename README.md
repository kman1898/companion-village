# Companion Village

A Settlers-style village that grows while you run a show with [Bitfocus Companion](https://bitfocus.io/companion).

**▶ Live: https://mko1989.github.io/companion-village/**

Every button press on your Stream Deck (or any Companion surface) does two things:
- A new settler arrives. Settlers become builders, woodcutters, stonemasons or farmers.
- A year passes. **Every 10 years the villagers invent something.** 57 inventions carry the village through five eras:

| Era | Examples | What changes |
|---|---|---|
| Medieval | Wheelbarrow, Masonry, Bell Casting, Astronomy | Timber and stone houses, mills, chapel, castle keep |
| Industrial Age | Brickworks, Steam Engine, Gas Lighting, Railway | Brick townhouses, factories, gas street lamps, a steam train between the villages |
| Modern Age | Electricity, Automobile, Asphalt, Skyscrapers, Aviation | Modern homes, cars on tarmac roads, glass towers, wind farms, aeroplanes |
| Space Age | Rocketry, Satellites, Robotics, Fusion Power | Habitat domes, rocket launches, fusion reactor |
| Sci-Fi Future | Hovercars, Antigravity, Force Fields, Teleporters, Androids | Sky pods, glowing light-lanes, arcologies, android villagers, and finally a colony starship launch |

When a new style of home is invented, builders gradually **renovate old houses** into the new style.

**Day and night:** the sun rises and sets (a 4-minute day by default). At night windows, street lamps, cars and
rival light shows glow in the dark. Most villagers go home to sleep, while night owls and androids keep working or
head to the tavern.

**Rival villages:** two rival crews live at the edges of the map. **🔊 Soundhaven** has a PA tower and drums its
way to line arrays. **💡 Lumenfort** has beacon fires that turn into searchlights and moving-head trusses, with
beams sweeping the sky at night. Every now and then they raid each other: sonic rings against light beams.
Sometimes they raid **you**, and your militia answers by throwing glowing buttons. Watchtowers, the castle keep
and the Telegraph help in defence; a Force Field makes raiders bounce right off. Once in a while the two crews
put on a joint **Festival of Sound & Light** on your town square.

**Random encounters:**

| Disasters & trouble | Good times & wonders |
|---|---|
| ⛈️ Thunderstorm · 🌪️ Tornado · ☄️ Meteor · 🌋 Earthquake · 🔥 Fire | 🎉 Festival · 💒 Wedding (+2 settlers) · 🌾 Bountiful harvest |
| ☠️ Plague · 🦗 Locusts · 🌨️ Blizzard · 🌑 Eclipse | 🐴 Travelling merchant · 💰 Buried treasure |
| 🐺 Wolf pack · 🐉 Dragon (medieval) · 🥷 Bandits | 🌠 Great comet (brings an invention) · 🌌 Northern lights |
| 🔌 Blackout · ☀️ Solar flare · 🤖 Robot rampage | 🛸 UFO sighting · ⏱️ Time traveller (brings an invention) |

Many inventions protect against disasters, e.g. Lightning Rods, Storm Cellars, Vaccination, Satellites, Force Fields
and Weather Control. Destroyed buildings are rebuilt by the builders, and the dead get a graveyard. In Settings you can
set random events to **On**, **Gentle** (damage only) or **Off**, set the rivals to **peaceful**, and change the day
length and the invention pace.

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
| M | Whole map (see the rival villages) |
| 0 or *Follow now* | Back to auto-follow. This also happens on its own after 60 s without input. |
| H | Hide the overlay (clean view for OBS) |
| S | Settings |
| I | Inventions & chronicle |
| Space | Add a year and a settler by hand |
| F | Fullscreen |
| P | Performance overlay |

Hover a villager or building to see who or what it is.

URL options: `?host=192.168.1.20:8000`, `?var=my_counter`, `?hud=0`, `?speed=2`, `?events=gentle`, `?quality=low`,
`?day=off|short|normal|long`, `?rivals=on|feud|off`, `?inventEvery=5`,
`?demo=10` (no Companion: start with 10 settlers, add more over time, nothing is saved).

## Notes

- The village is saved in the browser (localStorage), separately for each address it's opened from. Presses made while
  the page was closed are caught up when it reopens.
- Version 3 uses a bigger map, so villages saved by version 2 start over.
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
  game/      world generation, simulation, villagers, buildings, events, eras & inventions, day/night,
             rival villages & raids, traffic (cars, train, planes, rockets), save/load
  render/    canvas renderer, night lighting, sprite caches, terrain, building art (medieval → sci-fi), rival art, effects
  view/      camera & input (pan/zoom/follow, hover)
  ui/        HUD, settings, notifications
  net/       Companion HTTP API polling
tools/       Companion trigger installer + import file
```

Pushing to `main` deploys to GitHub Pages via `.github/workflows/pages.yml`.

`legacy/village-v1.html` is the original single-file version.
