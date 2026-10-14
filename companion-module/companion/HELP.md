## Companion Village

[Companion Village](https://mko1989.github.io/companion-village/) is a Settlers-style village game for your show screen. Three rival tribes share the land: **🎥 Pixels** (video), **🔊 Noises** (sound) and **💡 Lampys** (lights). Each new year brings a tribe a new settler, and every few years an invention. They advance from medieval huts to a sci-fi future, trade, make alliances and go to war.

This module connects your Stream Deck to the game, in both directions:

- **Buttons → village:** add years, attack, make peace, send gifts and caravans, trigger events, control the camera, the time of day, pause…
- **Village → Companion:** live variables (population, year, era, resources, wars…) and feedbacks (at war, under attack, allies, events, night…).

### Setup

1. Add this connection and pick **which tribe this Companion plays as**. The default port is `17890`.
2. Open the village page (the [web version](https://mko1989.github.io/companion-village/), or its **offline copy** from Settings → ⬇ Offline copy).
3. In the village, open **Settings → Companion module** and enter this computer's address and port, e.g. `localhost:17890`.
   For a Companion on another machine, use its IP, e.g. `192.168.1.20:17890`. Set your tribe's **Driven by** to *Companion module*.
4. The connection status turns green once the page syncs.

**Count every button press:** create a Trigger with the event **On any button press** and the action
**Companion Village: Add years (and settlers) to a tribe**, with tribe set to *This Companion's tribe*.

**Several departments:** give every operator's Companion this module, each set to its own tribe, and list all of them
(comma separated) in the village's *Companion module* field.

### Browser notes

The web version uses https, while this module uses plain http. Chrome and Edge show a one-time *"allow access to devices on your local network"* prompt; allow it. Safari and the OBS browser source block it. For those, use the **offline copy** of the village (a single HTML file), which always works.

### Actions

| Action | What it does |
|---|---|
| Add years (and settlers) | +N years for a tribe. Each year brings one settler. |
| War: attack another tribe | Declares war if needed and sends an army with siege engines. |
| Diplomacy: make peace / gift / caravan / friendship | Diplomacy between tribes. |
| Throw a festival | Everyone dances, then works faster. |
| Make something happen | Any of 30 events, from a festival or Battle of the Bands to a tornado, meteor or dragon. |
| Inspire: invent something right now | Instant invention. |
| Give resources | Wood, stone and food for a tribe. |
| Screen: camera / overlay / view as tribe | Follow, whole map, look at a tribe, zoom, hide the overlay. |
| Game speed / pause | Pause, resume, 1–8×. |
| Set the time of day | Dawn, noon, dusk, midnight. |
| Setting: war / events / AI pace / day length | Change the game rules live. |
| Screen: show a message banner | Put your own text on the screen (variables allowed). |

### Variables

`$(village:my_year)`, `$(village:my_pop)`, `$(village:my_era_name)`, `$(village:my_status)` … for this Companion's tribe.
The same exist per tribe, e.g. `$(village:noises_pop)`, `$(village:lampys_wins)`. There are also relations such as
`$(village:stance_pixels_noises)`, plus `$(village:clock)`, `$(village:leader_name)`, `$(village:news)`, `$(village:events)` and more.

### Feedbacks

Village connected · Tribe at war · Tribe being raided · Army on the march · Allies · Relation between tribes · Event happening · Era reached · Tribe in the lead · Screen following tribe · Night · Paused.

### Presets

Ready-made buttons for years, live tribe status tiles, war & diplomacy, every event, screen control, time of day and info.
