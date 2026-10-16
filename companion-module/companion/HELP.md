## Companion Village

[Companion Village](https://mko1989.github.io/companion-village/) is a Settlers-style village game for your show screen. Three rival tribes share the land: **🎥 Pixels** (video), **🔊 Noises** (sound) and **💡 Lampys** (lights). Each new year brings a tribe a new settler, and every few years an invention. They advance from medieval huts to a sci-fi future, trade, make alliances and go to war.

This module connects your Stream Deck to the game, in both directions:

- **Buttons → village:** add years, attack, make peace, send gifts and caravans, trigger events, control the camera, the time of day, pause…
- **Village → Companion:** live variables (population, year, era, resources, wars…) and feedbacks (at war, under attack, allies, events, night…).

### Setup

1. Add this connection and pick **which tribe this Companion plays as**. The default port is `17890`.
2. Open **`http://<this computer>:17890/`** in any browser, or add it as an **OBS browser source**:
   `http://localhost:17890/` on this machine, `http://192.168.1.20:17890/` (this machine's IP) from another one.
   The address is also in the variable `$(village:url)` and in the connection status.
3. That's it. The page is served by this module, links up by itself and plays as your tribe. The status turns green once it syncs.

**Count every button press:** create a Trigger with the event **On any button press** and the action
**Companion Village: Add years (and settlers) to a tribe**, with tribe set to *This Companion's tribe*.

**Several departments:** give every operator's Companion this module, each set to its own tribe. Open the village from one of them
and list the other modules' addresses (comma separated) under *Settings → Companion module*.

**Desk competitions:** sound and lighting desks can score too. A trigger watches your desk module's variables
(X32, WING, Yamaha RCP, MagicQ, or Generic OSC for grandMA3) and runs **Desk activity (fair count)**. A whole fader move
or key press counts as *one* action and every control counts on its own (three faders at once = 3), while a scene recall
counts once. The rules are in this connection's config: one gesture until the control is still for 800 ms, more than 8
controls changing within 300 ms is a scene recall, the same control scores at most every 2 s, and each desk scores at most
30 per minute. The project's `tools/desk-triggers.mjs` builds and installs these triggers, e.g.
`node tools/desk-triggers.mjs x32 --install --name FOH`.

**Firewall:** if another computer can't open the page, allow incoming connections on port 17890 on the Companion machine.

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
| Desk activity (fair count) | For desk triggers: watches the values (or the latest OSC path) a trigger passes and scores one year per operator action. |
| Desk activity: scoring on / off · reset | Pause desk scoring (soundcheck, programming) or zero the desk counters. |

### Variables

`$(village:my_year)`, `$(village:my_pop)`, `$(village:my_era_name)`, `$(village:my_status)` … for this Companion's tribe.
The same exist per tribe, e.g. `$(village:noises_pop)`, `$(village:lampys_wins)`. There are also relations such as
`$(village:stance_pixels_noises)`, the desk scores `$(village:desk_actions)`, `$(village:noises_desk_actions)`,
`$(village:desk_last)`, `$(village:desks)`, `$(village:desk_scoring)`, plus `$(village:url)`, `$(village:clock)`, `$(village:leader_name)`, `$(village:news)`, `$(village:events)` and more.

### Feedbacks

Village connected · Tribe at war · Tribe being raided · Army on the march · Allies · Relation between tribes · Event happening · Era reached · Tribe in the lead · Screen following tribe · Night · Paused · Desk scoring on.

### Presets

Ready-made buttons for years, live tribe status tiles, war & diplomacy, every event, screen control, time of day and info.
