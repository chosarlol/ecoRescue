# EcoRescue Cambodia

A top-down 2D game where you walk a real Cambodian forest, read open satellite
and weather data, and decide what to protect before a fire reaches a village.

Built for **OpenData X AI**, Environment & Natural Resources theme.

> **Educational game for scenario practice. Not an official warning system and not
> a substitute for expert fire response.**

---

## What it is

**Mission 1 — "Check the heat signals and prepare the village before time runs out."**

You pick a character, then walk a 3840 × 4160 px world built from a real 1 km
NASA FIRMS grid. Two satellite heat detections glow on the map. One is 25 days
old and 20 km away. One was picked up **yesterday**, on the forest edge, 1.85 km
from the village, after three weeks with almost no rain — and it is the one that
catches fire and starts creeping toward the houses.

You have three 30-second phases. Inspect a heat point, prepare the village, and
stay ahead of the fire. You decide first; the risk estimate is only revealed
afterwards, behind the "Why?" button.

Every number in the game comes from real records. Nothing is invented.

---

## Run it

No build step, no dependencies, no npm.

```bash
python prepare_data.py     # ~1 min: reads your raw files, writes data/scenario.json
python -m http.server
# open http://localhost:8000
```

Opening `index.html` straight off disk **will not work** — browsers block local
file reads, so `fetch('data/scenario.json')` fails. The game detects this and
shows you exactly what to do.

**Controls:** WASD or arrow keys to walk, **E** to interact. On a touch device an
on-screen stick and an Interact button appear automatically.

### Run the tests

```bash
python -m http.server
# open http://localhost:8000/tests/selftest.html
```

93 assertions drive the real game in an iframe: data integrity, the risk
estimate, the world build, every character perk, the full winning path, the full
losing path, fire-spread timing, replay, the Khmer toggle, and that there is no
horizontal scroll at phone width. It prints `PASS`/`FAIL` lines and a summary.

> The suite pumps `EcoGame.update(dt)` directly rather than waiting on wall
> clock time. Headless Chrome fast-forwards `setTimeout` under
> `--virtual-time-budget` but does **not** drive `requestAnimationFrame` at the
> same rate, so real-time waits are flaky. Pumping is deterministic.

---

## Project structure

```
index.html        Screens: title, character select, game, result
style.css         All styling. Design tokens at the top.
main.js           State object, game loop, rules, win/lose, input, camera
player.js         Movement, 4-direction walk cycle, footstep dust
world.js          Real data grid -> walkable world, terrain, village, trees
fire.js           Fire spread on the sub-grid + flame/ember/smoke particles
risk.js           The risk estimate. One config object, one function.
sprites.js        Procedural sprites + optional sprite-sheet loading
ui.js             EN/KM strings, HUD, panels, mini-map, WebAudio sound
prepare_data.py   Reads the raw data, writes data/scenario.json
assets/           Empty. Drop sprite sheets here to replace the drawn art.
data/
  fires_final.csv      YOUR raw NASA FIRMS archive (277 MB, never modified)
  POWER_*.csv          YOUR raw NASA POWER export (never modified)
  scenario.json        Generated. ~24 KB. The only data the browser loads.
tests/
  selftest.html        Browser test suite
```

`prepare_data.py` finds `fires_final.csv` at either the project root or in
`data/`, and **only ever reads it**.

> **Do not commit `fires_final.csv`.** It is 277 MB. Add it to `.gitignore` and
> share it separately; `prepare_data.py` plus `scenario.json` is all a teammate
> needs.

---

## The data

| Source | What it provides | Status |
|---|---|---|
| **NASA FIRMS** active fire detections (MODIS + VIIRS) | Detection time, position, FRP, brightness, confidence | Real |
| **NASA POWER** daily climate (MERRA-2) | Rainfall, air temperature, humidity, wind | Real |
| **Forest-edge indicator** | Which cells are forest, edge, or cleared | **Derived** here |
| **Village location** | Where the community is | **Sample data** |
| **The road on the map** | Visual landmark | **Decorative, not data** |

The UI labels all five. Amber is reserved exclusively for "Sample data", so that
badge never loses its meaning.

### What the fire archive contains

- **2,737,475 rows**, 2000-11-04 → 2025-12-31, Cambodia only (0 rows outside the
  national bounding box).
- VIIRS 2,094,359 + MODIS 643,116. **The jump at 2012–2013 is the VIIRS sensor
  coming online, not a real increase in fires** — say that out loud if anyone
  plots the full time series.
- `confidence` is mixed by design (MODIS numeric 0–100, VIIRS letter `n`/`h`).
  `confidence_rank` is the harmonised version, verified exactly: rank 3 = MODIS
  ≥80 or VIIRS `h`; rank 2 = MODIS 30–79 or VIIRS `n`. **Rank 1 does not exist**
  — low-confidence detections were already stripped from this archive.
- `grid_id` decodes as a **~1 km grid cell** (0.0092° lon / 0.0090° lat).
- `timestamp_utc` is UTC; the game shows local time (UTC+7).

### Filtering applied

Reported live in the About panel from the real counts. Across the whole file:
803 rows with blank `province`, 8 with `frp_mw = 0`, 3 saturated at 500 K.
**None of them fall inside the Kratie scenario box.**

### ⚠️ One thing to be careful about

`brightness_primary` is the **brightness temperature of the fire pixel in Kelvin**
(295–500 K). It is **not** air temperature. The risk estimate and the dryness
calculation use NASA POWER `T2M_MAX` for air temperature and keep brightness as a
separate fire-intensity signal. Do not substitute one for the other.

---

## How the scenario was chosen

Area: **Kratie forest block**, 11.98–12.24 N, 106.45–106.69 E (26.1 × 28.9 km) —
the densest December-2025 cluster in the archive, including a 395 MW detection on
2025-12-29. `prepare_data.py` prints its full reasoning on every run.

Both points are **real, unmodified rows**:

| | Point A | Point B |
|---|---|---|
| Detected | 2025-12-07 13:26 local | 2025-12-31 12:37 local |
| Age at game date | 25 days | **1 day** |
| Distance to village | 20.1 km | **1.85 km** |
| Land class | Intact forest | **Forest edge** |
| Rain, prior 7 days | 29.08 mm | **3.04 mm** |
| FRP | 2.56 MW | 4.40 MW |
| **Risk estimate** | **4 — Low** | **79 — High** |

The rainfall contrast is real, not staged: rainfall collapsed to near-zero from
5 December after a wet spell on 2–4 December.

### The two derived layers

**Forest-edge indicator.** No land-cover dataset was supplied, so this comes from
25 years of detection recurrence per 1 km cell:

- A cell that burned **many** times in 25 years is almost certainly farmed or
  cleared land — people burn it on purpose, nearly every year.
- A cell that burned **rarely** is more likely still-intact forest.
- A rarely-burned cell **touching** a repeatedly-burned one is a forest **edge**.

Thresholds are percentiles of recurrence (≤40th = forest, ≥80th = cleared), which
here works out to ≤31 and ≥78 detections. **This is not an official forest-cover
map**, and the game says so wherever it appears.

**Village location.** No settlements dataset, so the village sits at the
recurrence-weighted centre of the cleared-land cluster with the most
mission-window fire activity nearby — the settled area closest to the fires the
player must respond to. Still badged **Sample data**, because it is a proxy for
settled land, not a surveyed location.

---

## The risk estimate

In `risk.js`. A **transparent rule-based weighted sum** — the code and the UI both
state plainly that it is **not a trained AI model**. All tuning is in one object,
`RISK_WEIGHTS`:

| Rule | Max points | Scores 0 at | Scores full at |
|---|---|---|---|
| How recent the detection is | 25 | 21+ days | today |
| Distance to the village | 22 | 15+ km | 0 km |
| Rain in the prior 7 days | 20 | 25+ mm | 0 mm |
| Forest edge proximity | 15 | intact forest | on the edge |
| Daily max air temperature | 10 | ≤26 °C | ≥36 °C |
| Measured heat output (FRP) | 8 | ≤2 MW | ≥50 MW (log scale) |

Bands: **Low** ≤30, **Medium** ≤60, **High** >60.

Two decisions worth keeping:

- **Missing data is excluded, not treated as zero.** If a dataset is absent, that
  rule's weight leaves the denominator and the factor shows "no data", so a
  missing file can never masquerade as low risk.
- **Every factor carries its evidence** — the value and a sentence saying where it
  came from. That is what the "Why?" panel renders.

### Replacing it with a real model later

Keep the signature:

```js
estimateRisk(point, context) -> { score, band, bandKey, factors }
```

Swap the body for a model call; nothing else changes. If the model returns feature
attributions (SHAP values, say) in the same `factors` shape, the explanation UI
keeps working untouched.

**A model is genuinely trainable on this data** — 2.7 M detections over 25 years.
A reasonable first attempt: label each 1 km cell-week by whether a detection
followed in the next 7 days, then train on dry-spell length, rainfall totals,
temperature, burn-history recurrence and distance to cleared land. **Deliberately
not built here** — the transparent rules are the better teaching artifact.

---

## The fire model, and what is real in it

Fire spreads on a sub-grid 4× finer than the data grid. Each cell accumulates
heat from burning neighbours:

```
heat += RATE * dryness * fuel(cell) * dt      ignites at heat >= 1
```

| Part | Status |
|---|---|
| `dryness` = 0.605 | **Real.** Computed by `prepare_data.py` from NASA POWER rainfall (weight 0.60), max temperature (0.25) and humidity (0.15) at the ignition point. 3.04 mm in the prior week gives a sub-score of 0.878; 29 mm would give 0.00. |
| `fuel` per land class | **Design choice**, informed by the derived land classification. Edge and cleared grass carry fire faster than closed canopy. |
| `RATE` | **Tuned game constant.** |

**Time is compressed.** The mission runs 90 seconds; a real fire needs hours to
cover this ground. The *relative* effect of rainfall is real — the absolute speed
is not. The game says this in the About panel and in the "Why?" panel, and
`prepare_data.py` writes it into `scenario.json`. Do not let anyone read the
on-screen spread as a physical rate.

### ⚠️ The propagation invariant

A burning cell only has `BURN_SECONDS` to push a neighbour from 0 heat to 1, so
the fire sustains itself only while

```
RATE * dryness * fuel_min * BURN_SECONDS  >  1
```

Break it and the fire **dies out one cell after ignition** — a silent failure that
just makes the mission unloseable. This bit during development at `RATE 0.15`.
`Fire.reset()` now computes the margin and logs a console warning if it drops to
1 or below, and the test suite asserts it. Current margin: **1.27**.

---

## Characters

| Character | Perk | Implemented as |
|---|---|---|
| **Ranger** | Moves fastest | `speed × 1.28` |
| **Data Scout** | Spots heat points twice as far; info panels add a 14-day rainfall trend | `revealMul 2.0`, `extraDetail` |
| **Village Liaison** | Prepares the village in under half the time | `prepareMul 0.45` (6.0s → 2.7s) |

---

## Difficulty, measured

Tuned to "winnable but tense", and the test suite **asserts** the timing rather
than trusting it:

| Route | Time | Outcome |
|---|---|---|
| Village → B → inspect → village → prepare | ~14 s | **Win**, comfortable |
| Detour to distant Point A first | ~24 s each way | **Loss** — fire wins |
| Stand still | — | **Loss** at 44 s |

The fire reaches the village at **t = 44 s**, after phase 2 begins, so all three
phases actually occur and the fire — not the clock — is the real pressure.

---

## Accessibility notes

Map and risk colours were **computed, not eyeballed**, with OKLab/CVD checks
(Machado 2009 simulation, ΔE×100) against the game's own surfaces:

- **Land kinds** (forest / edge / cleared): worst CVD ΔE **9.1** (target 8),
  worst normal-vision ΔE **20.6** (floor 15).
- **Risk bands**: worst CVD ΔE **10.3**, normal ΔE **17.8**. Always shipped with
  their text label, never colour alone.
- The two forest greens are a **sequential pair**, not two categories, and clear
  the ordinal check instead (ΔL 0.078 ≥ 0.06).
- A search for a calmer, less saturated ground palette found **no triple that
  still passes** the separation gates, so the vivid land colours are kept and the
  flatness is broken with terrain texture instead of by desaturating.
- Heat markers never rely on hue: each carries a white ring and an A/B glyph.
  Marker red and the rust "cleared" tile are only ΔE 4.3 apart under protanopia.
- `prefers-reduced-motion` disables all animation.
- **Entrance animations animate transform only, never opacity.** An element whose
  visibility depends on an animation *finishing* can get stuck invisible if the
  animation is throttled — which is exactly what happened to the info panel
  (it computed `opacity: 0`). The test suite now asserts the panel is opaque.

---

## Swapping in another area or newer data

Everything is driven by `CONFIG` at the top of `prepare_data.py`:

```python
"area_name":    "Kratie forest block (eastern Cambodia)",
"lat_min": 11.98, "lat_max": 12.24,
"lon_min": 106.45, "lon_max": 106.69,
"window_start": "2025-12-01",
"window_end":   "2025-12-31",
```

Change those, re-run `python prepare_data.py`, reload. **No game code needs to
change** — the world, terrain, tile map, village, markers, distances and facts all
rebuild from the new `scenario.json`.

- **Newer fire data:** append rows to `fires_final.csv` and move the window forward.
- **A different weather point:** drop any NASA POWER daily CSV into `data/` with
  `power` in the filename. It is picked up automatically, `-999` fill values are
  stripped, and the "Sample data" badge on the weather disappears by itself. With
  no POWER file the game still runs and flags rainfall and temperature as sample
  data rather than pretending.
- **A real village layer:** replace `place_village()` with a lookup into your
  settlements file and set `"sample": False` on the village source.
- **Real pixel art:** drop sheets into `assets/` and fill in the `SHEETS` manifest
  at the top of `sprites.js`. Anything that loads replaces the drawn sprite;
  anything missing keeps the procedural fallback, so the game always runs.

---

## Known limitations

1. **The Khmer translation is a first draft and has not been reviewed by a Khmer
   speaker.** Please have one check it before any public demo. English is
   authoritative.
2. **The "Why?" panel is English-only.** Risk factor labels and evidence strings
   live in `risk.js` as plain sentences rather than i18n keys. Translating them
   means returning keys from `estimateRisk()` — a contained refactor, not done here.
3. **The village is sample data.** Distances are real measurements to a proxy
   location, not to a surveyed settlement.
4. **The forest-edge layer is inferred from burn history**, not observed land
   cover. Plausible and labelled, but not authoritative.
5. **Fire spread speed is compressed time**, not a physical rate (see above).
6. The game models **one area and one month**. A teaching scenario, not a
   monitoring tool.

---

## Planned next missions

- **Mission 2 — Community warning.** Route a warning to the right villages with a
  limited number of messages, and learn that a false alarm has a cost too.
- **Mission 3 — Resource allocation.** Split one team and one water truck across
  several simultaneous heat points over a week.

Both are described in the in-game Roadmap panel.
#   e c o R e s c u e  
 