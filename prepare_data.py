#!/usr/bin/env python3
"""
EcoRescue Cambodia - data preparation
=====================================

Reads the RAW data files and writes a small, game-ready `data/scenario.json`.

Why this script exists
----------------------
A browser cannot open local CSV files directly, and `fires_final.csv` is 277 MB
(2.7 million rows) which no browser should ever load. So we do all the heavy
work here, once, offline, and export only the few kilobytes the game needs.

The original files are NEVER modified or copied. We only read them.

Inputs
------
1. fires_final.csv  (found at the project root OR in data/)
     Merged NASA FIRMS active-fire archive for Cambodia, MODIS + VIIRS,
     2000-11-04 -> 2025-12-31, 2,737,475 rows.
2. data/POWER_Point_Daily_*.csv
     NASA POWER daily weather (MERRA-2) for the scenario point.
     Optional: if it is missing, the script still runs and marks the
     weather block as "sample" so the game can show a "Sample data" badge.

Output
------
data/scenario.json

Run
---
    python prepare_data.py

Swapping in a different area or newer data: edit CONFIG below. Nothing else
in the project needs to change.
"""

import csv
import json
import math
import os
import sys
import datetime
import collections

# ---------------------------------------------------------------------------
# CONFIG - everything tunable lives here
# ---------------------------------------------------------------------------
CONFIG = {
    # The scenario area. Chosen because it is the densest December-2025 fire
    # cluster in the archive and contains a 395 MW detection on 2025-12-29.
    "area_name": "Kratie forest block (eastern Cambodia)",
    "area_short": "Kratie",
    "lat_min": 11.98,
    "lat_max": 12.24,
    "lon_min": 106.45,
    "lon_max": 106.69,

    # The mission window: which detections the player can see on the map.
    "window_start": "2025-12-01",
    "window_end": "2025-12-31",

    # "Today" in the game = the day after the last detection we show, so the
    # most recent heat point reads as "detected yesterday".
    # Set to None to auto-derive from the latest detection in the window.
    "game_today": None,

    # Map grid resolution in degrees (~1.1 km at this latitude).
    # The game renders this as a board-game tile map.
    "grid_deg": 0.01,

    # Forest-edge indicator thresholds, as PERCENTILES of all-time detection
    # recurrence per grid cell (25 years of history). See classify_grid().
    "pct_forest": 40,     # <= this percentile => intact / rarely burned forest
    "pct_cleared": 80,    # >= this percentile => repeatedly burned / cleared

    # Point selection rules (all distances in km).
    "B_max_dist_village": 10.0,   # Point B must be NEAR the village
    "A_min_dist_village": 14.0,   # Point A must be FAR from the village
    "rain_lookback_days": [7, 30],

    # How the "dryness" number that drives in-game fire spread is mixed from
    # the real weather. Weights sum to 1. See compute_dryness().
    "dryness_weights": {"rain": 0.60, "temp": 0.25, "humidity": 0.15},
    "dryness_rain_full_mm": 25.0,   # 25+ mm in 7 days => not dry at all
    "dryness_temp_lo_c": 26.0,      # at/below this => no contribution
    "dryness_temp_hi_c": 36.0,      # at/above this => full contribution
    "dryness_rh_lo_pct": 50.0,      # at/below this => full contribution
    "dryness_rh_hi_pct": 90.0,      # at/above this => no contribution

    # When placing the sample village, how close a mission-window detection has
    # to be to a cleared-land cluster for that cluster to count as "where the
    # action is". See place_village().
    "village_activity_radius_km": 8.0,

    # Data quality filters (see the audit in the README).
    "drop_zero_frp": True,
    "drop_saturated_brightness": True,    # brightness_primary >= 500 K
    "drop_empty_province": True,

    "out_path": os.path.join("data", "scenario.json"),
}

# Source labels shown in the game UI. Keep these honest.
SOURCES = {
    "firms": {
        "id": "firms",
        "name": "NASA FIRMS active fire detections (MODIS + VIIRS)",
        "detail": ("Merged Terra/Aqua MODIS and Suomi-NPP VIIRS thermal anomaly archive for "
                   "Cambodia, 2000-2025. Low-confidence detections were already removed from "
                   "this archive."),
        "file": "fires_final.csv",
        "sample": False,
    },
    "power": {
        "id": "power",
        "name": "NASA POWER daily climate (MERRA-2)",
        "detail": ("Daily corrected precipitation, 2 m air temperature, humidity and wind at the "
                   "scenario point."),
        "file": None,
        "sample": False,
    },
    "forest": {
        "id": "forest",
        "name": "Forest-edge indicator (derived in this project)",
        "detail": ("Derived from 25 years of detection recurrence per 1 km cell. Rarely-burned "
                   "cells read as intact forest; repeatedly-burned cells read as cleared or "
                   "farmed land; edge cells are rarely-burned cells touching repeatedly-burned "
                   "ones. This is NOT an official land-cover or forest-cover map."),
        "file": "fires_final.csv (aggregated)",
        "sample": False,
    },
    "village": {
        "id": "village",
        "name": "Village location",
        "detail": ("Sample placement. No settlement dataset was supplied, so the village is placed "
                   "at the centre of the most persistently burned area in the box, as a stand-in "
                   "for settled/farmed land. Swap in a real settlements layer to make this exact."),
        "file": None,
        "sample": True,
    },
}

DISCLAIMER = ("Educational game for scenario practice. Not an official warning system "
              "and not a substitute for expert fire response.")

EARTH_R_KM = 6371.0088


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------
def haversine_km(lat1, lon1, lat2, lon2):
    """Great-circle distance between two points, in kilometres."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_R_KM * math.asin(math.sqrt(a))


def percentile(sorted_vals, pct):
    """Nearest-rank percentile of an already-sorted list."""
    if not sorted_vals:
        return 0
    k = int(round((pct / 100.0) * (len(sorted_vals) - 1)))
    k = max(0, min(len(sorted_vals) - 1, k))
    return sorted_vals[k]


def doy_to_date(year, doy):
    """NASA POWER gives YEAR + day-of-year; convert to a date object."""
    return datetime.date(year, 1, 1) + datetime.timedelta(days=doy - 1)


def find_fires_csv():
    """fires_final.csv may sit at the project root or inside data/. Never copied."""
    for p in ("fires_final.csv", os.path.join("data", "fires_final.csv")):
        if os.path.exists(p):
            return p
    sys.exit("ERROR: fires_final.csv not found at the project root or in data/.")


def find_power_csv():
    """Any NASA POWER daily export in data/. Returns None if absent."""
    if not os.path.isdir("data"):
        return None
    for fn in sorted(os.listdir("data")):
        low = fn.lower()
        if low.endswith(".csv") and "power" in low:
            return os.path.join("data", fn)
    return None


def log(msg=""):
    print(msg, flush=True)


# ---------------------------------------------------------------------------
# STEP 1 - read the weather file
# ---------------------------------------------------------------------------
def load_weather(path):
    """
    Parse a NASA POWER 'Point Daily' CSV export.

    These files carry a '-BEGIN HEADER-' block of about 13 lines before the real
    column row, and use -999 for values that could not be computed. We strip both.

    Returns (daily_dict_by_isodate, meta_dict) or (None, None) if unavailable.
    """
    if not path or not os.path.exists(path):
        return None, None

    with open(path, newline="", encoding="utf-8", errors="replace") as f:
        lines = f.read().splitlines()

    # Find the real header row: the first line starting with "YEAR,"
    hdr_i = None
    for i, line in enumerate(lines):
        if line.startswith("YEAR,"):
            hdr_i = i
            break
    if hdr_i is None:
        log("WARNING: %s has no 'YEAR,...' column row - ignoring it." % path)
        return None, None

    # Pull location/elevation out of the preamble so the UI can cite the point.
    meta = {"file": os.path.basename(path), "lat": None, "lon": None, "elevation_m": None}
    for line in lines[:hdr_i]:
        s = line.strip()
        if s.startswith("Location:"):
            parts = s.replace("Location:", "").split()
            try:
                meta["lat"] = float(parts[parts.index("latitude") + 1])
                meta["lon"] = float(parts[parts.index("longitude") + 1])
            except (ValueError, IndexError):
                pass
        if "elevation" in s.lower() and "meters" in s.lower():
            for tok in s.replace("=", " ").split():
                try:
                    meta["elevation_m"] = float(tok)
                except ValueError:
                    continue

    reader = csv.DictReader(lines[hdr_i:])
    daily = {}
    n_missing = 0
    for row in reader:
        try:
            year = int(row["YEAR"])
            doy = int(row["DOY"])
        except (TypeError, ValueError, KeyError):
            continue
        iso = doy_to_date(year, doy).isoformat()
        rec = {"date": iso}
        for key, out in (("PRECTOTCORR", "rain_mm"), ("T2M", "temp_c"),
                         ("T2M_MAX", "temp_max_c"), ("RH2M", "humidity_pct"),
                         ("WS2M", "wind_ms")):
            raw = row.get(key)
            if raw is None or raw == "":
                continue
            try:
                v = float(raw)
            except ValueError:
                continue
            if v <= -998:          # POWER fill value
                n_missing += 1
                continue
            rec[out] = v
        daily[iso] = rec

    log("  weather file : %s" % os.path.basename(path))
    log("  weather rows : %d daily records, %s -> %s, %d fill values dropped"
        % (len(daily), min(daily) if daily else "-", max(daily) if daily else "-", n_missing))
    return daily, meta


def rain_totals(daily, upto_date, windows):
    """
    Sum rainfall over the N days up to and including `upto_date`.
    Returns {"7": {...}, "30": {...}} including how many days actually had data,
    so the game never silently presents a partial window as a full one.
    """
    out = {}
    if not daily:
        return out
    d0 = datetime.date.fromisoformat(upto_date)
    for w in windows:
        total, found = 0.0, 0
        for k in range(w):
            d = (d0 - datetime.timedelta(days=k)).isoformat()
            rec = daily.get(d)
            if rec and "rain_mm" in rec:
                total += rec["rain_mm"]
                found += 1
        out[str(w)] = {"mm": round(total, 2), "days_with_data": found, "days_requested": w}
    return out


# ---------------------------------------------------------------------------
# STEP 2 - single streaming pass over the 277 MB fire archive
# ---------------------------------------------------------------------------
def scan_fires(path, cfg):
    """
    ONE pass over fires_final.csv. We cannot hold 2.7M rows in memory as dicts,
    so we collect only two things:

      1. recurrence[(gy,gx)] - all-time detection count per map grid cell,
         across ALL 25 years. This is the forest-edge indicator.
      2. window[] - the individual detections inside the mission date window,
         which is a small list (about 120 rows).

    Also returns a quality report of what was filtered out.
    """
    lat_min, lat_max = cfg["lat_min"], cfg["lat_max"]
    lon_min, lon_max = cfg["lon_min"], cfg["lon_max"]
    g = cfg["grid_deg"]

    recurrence = collections.Counter()
    window = []
    q = collections.Counter()
    years_seen = set()

    with open(path, newline="", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        for row in reader:
            q["rows_read"] += 1

            # Cheap numeric gate first - most of the file is outside the box.
            try:
                la = float(row["latitude"])
                lo = float(row["longitude"])
            except (TypeError, ValueError):
                q["bad_coords"] += 1
                continue
            if not (lat_min <= la <= lat_max and lon_min <= lo <= lon_max):
                continue
            q["in_box"] += 1

            # --- data quality filters (documented in the README) ---
            if cfg["drop_empty_province"] and not (row.get("province") or "").strip():
                q["dropped_empty_province"] += 1
                continue
            try:
                frp = float(row["frp_mw"])
            except (TypeError, ValueError):
                q["dropped_bad_frp"] += 1
                continue
            if cfg["drop_zero_frp"] and frp == 0.0:
                q["dropped_zero_frp"] += 1
                continue
            try:
                bt = float(row["brightness_primary"])
            except (TypeError, ValueError):
                bt = None
            if cfg["drop_saturated_brightness"] and bt is not None and bt >= 500.0:
                q["dropped_saturated"] += 1
                continue

            q["kept"] += 1
            years_seen.add(row["date"][:4])

            # 1. recurrence over the full 25-year archive
            gy = int((la - lat_min) / g)
            gx = int((lo - lon_min) / g)
            recurrence[(gy, gx)] += 1

            # 2. detections inside the mission window
            if cfg["window_start"] <= row["date"] <= cfg["window_end"]:
                window.append({
                    "date": row["date"],
                    "ts_utc": row["timestamp_utc"],
                    "lat": la,
                    "lon": lo,
                    "grid_id": row["grid_id"],
                    "frp_mw": frp,
                    "brightness_k": bt,
                    "sensor": row["sensor"],
                    "satellite": row["satellite"],
                    "confidence": row["confidence"],
                    "confidence_rank": int(row["confidence_rank"]),
                    "province": row["province"],
                })

    return recurrence, window, q, sorted(years_seen)


# ---------------------------------------------------------------------------
# STEP 3 - turn recurrence into a forest / edge / cleared tile map
# ---------------------------------------------------------------------------
def classify_grid(recurrence, cfg):
    """
    Build the board-game tile map.

    The logic, stated plainly so it can be defended to a judge:
      - A 1 km cell that burned MANY times in 25 years is almost certainly
        farmed or cleared land (people burn it on purpose, nearly every year).
      - A cell that burned RARELY is more likely still-intact forest.
      - A rarely-burned cell that TOUCHES a repeatedly-burned cell is a forest
        EDGE: the frontier where clearing meets forest.

    Tile codes written into the JSON:
        'F' intact / rarely burned forest
        'f' moderately burned forest
        'E' forest edge (low recurrence, adjacent to cleared)
        'C' cleared / repeatedly burned land
        '.' no detections ever recorded in this cell
    """
    g = cfg["grid_deg"]
    ny = int(math.ceil((cfg["lat_max"] - cfg["lat_min"]) / g))
    nx = int(math.ceil((cfg["lon_max"] - cfg["lon_min"]) / g))

    counts = sorted(recurrence.values())
    t_forest = percentile(counts, cfg["pct_forest"])
    t_cleared = percentile(counts, cfg["pct_cleared"])

    # First pass: base class from the cell's own recurrence.
    base = {}
    for gy in range(ny):
        for gx in range(nx):
            c = recurrence.get((gy, gx), 0)
            if c == 0:
                base[(gy, gx)] = "."
            elif c >= t_cleared:
                base[(gy, gx)] = "C"
            elif c <= t_forest:
                base[(gy, gx)] = "F"
            else:
                base[(gy, gx)] = "f"

    # Second pass: promote forest cells that touch cleared land to EDGE.
    rows = []
    for gy in range(ny):
        line = []
        for gx in range(nx):
            cls = base[(gy, gx)]
            if cls in ("F", "f", "."):
                touches_cleared = False
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        if dy == 0 and dx == 0:
                            continue
                        if base.get((gy + dy, gx + dx)) == "C":
                            touches_cleared = True
                            break
                    if touches_cleared:
                        break
                if touches_cleared:
                    cls = "E"
            line.append(cls)
        rows.append("".join(line))

    stats = collections.Counter("".join(rows))
    grid = {
        "ny": ny,
        "nx": nx,
        "lat_min": cfg["lat_min"],
        "lon_min": cfg["lon_min"],
        "deg": g,
        "rows": rows,                 # rows[0] is the SOUTHERNMOST lat band
        # All-time detection count per cell, same indexing as `rows`. The game
        # shows this when a player clicks a tile, so the derived land class is
        # always backed by a number they can see.
        "counts": [[recurrence.get((gy, gx), 0) for gx in range(nx)] for gy in range(ny)],
        "thresholds": {
            "percentile_forest": cfg["pct_forest"],
            "count_forest_max": t_forest,
            "percentile_cleared": cfg["pct_cleared"],
            "count_cleared_min": t_cleared,
            "cells_with_history": len(recurrence),
        },
        "legend": {
            "F": "Intact forest (rarely burned in 25 years)",
            "f": "Forest, some burn history",
            "E": "Forest edge (rarely burned, next to cleared land)",
            "C": "Cleared / repeatedly burned land",
            ".": "No detections on record",
        },
        "class_counts": dict((k, stats.get(k, 0)) for k in "FfEC."),
    }
    return grid, base


def cell_of(lat, lon, grid):
    """Which tile does a lat/lon fall in?"""
    gy = int((lat - grid["lat_min"]) / grid["deg"])
    gx = int((lon - grid["lon_min"]) / grid["deg"])
    return gy, gx


def tile_at(grid, gy, gx):
    if 0 <= gy < grid["ny"] and 0 <= gx < grid["nx"]:
        return grid["rows"][gy][gx]
    return "."


def near_edge(grid, lat, lon, radius=1):
    """True if this point sits in, or next to, a forest-edge tile."""
    gy, gx = cell_of(lat, lon, grid)
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            if tile_at(grid, gy + dy, gx + dx) == "E":
                return True
    return False


# ---------------------------------------------------------------------------
# STEP 4 - place the sample village from the most persistently burned cluster
# ---------------------------------------------------------------------------
def place_village(recurrence, base, grid, cfg, window):
    """
    No settlement dataset was supplied, so the village is a proxy. Rather than
    dropping a pin at random, we derive it in two principled steps:

      1. Find every contiguous block of repeatedly-burned ('C') cells. Land
         that burns nearly every year for 25 years is farmed or cleared land,
         which is where people live and work.
      2. Of those blocks, pick the one with the MOST mission-window detections
         within `village_activity_radius_km`. That is the settled area closest
         to the fire activity the player is being asked to respond to - the
         community actually at stake in this mission.

    Step 2 matters: the single largest cleared block in this box sits in the
    north, 16 km from where December 2025 actually burned, which would have
    made the mission geography inert. Choosing by proximity to current activity
    is a scenario-design choice, and it is stated in the UI and the README.

    The result is still labelled "Sample data" in the game, because it is a
    proxy for settled land, not a surveyed settlement location.
    """
    c_cells = set(k for k, v in base.items() if v == "C")
    if not c_cells:
        return {
            "lat": round((cfg["lat_min"] + cfg["lat_max"]) / 2, 5),
            "lon": round((cfg["lon_min"] + cfg["lon_max"]) / 2, 5),
            "derivation": "Box centre (no repeatedly-burned cluster found).",
            "cluster_cells": 0,
            "cluster_detections": 0,
            "window_detections_nearby": 0,
        }

    # Flood-fill contiguous clusters of 'C' cells (8-connected).
    seen = set()
    clusters = []
    for start in c_cells:
        if start in seen:
            continue
        stack = [start]
        comp = []
        seen.add(start)
        while stack:
            cur = stack.pop()
            comp.append(cur)
            cy, cx = cur
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    nb = (cy + dy, cx + dx)
                    if nb in c_cells and nb not in seen:
                        seen.add(nb)
                        stack.append(nb)
        clusters.append(comp)

    g = grid["deg"]

    def centroid(comp):
        """Recurrence-weighted centre of a cluster of cells."""
        tot = sum(recurrence.get(c, 0) for c in comp)
        lat = sum((gy + 0.5) * g * recurrence.get((gy, gx), 0)
                  for gy, gx in comp) / tot + grid["lat_min"]
        lon = sum((gx + 0.5) * g * recurrence.get((gy, gx), 0)
                  for gy, gx in comp) / tot + grid["lon_min"]
        return lat, lon, tot

    # Score every cluster: how much of THIS mission's fire activity is near it?
    scored = []
    for comp in clusters:
        lat, lon, tot = centroid(comp)
        nearby = sum(1 for d in window
                     if haversine_km(d["lat"], d["lon"], lat, lon)
                     <= cfg["village_activity_radius_km"])
        scored.append((nearby, tot, len(comp), lat, lon))

    # Most mission-window activity nearby; tie-break on 25-year burn history.
    scored.sort(key=lambda s: (s[0], s[1]), reverse=True)
    nearby, tot, ncells, lat, lon = scored[0]

    return {
        "lat": round(lat, 5),
        "lon": round(lon, 5),
        "derivation": ("Recurrence-weighted centre of the repeatedly-burned 1 km cell cluster with "
                       "the most mission-window fire activity within %.0f km (%d cells, %d "
                       "detections 2000-2025, %d detections in the mission window nearby)."
                       % (cfg["village_activity_radius_km"], ncells, tot, nearby)),
        "cluster_cells": ncells,
        "cluster_detections": tot,
        "window_detections_nearby": nearby,
    }


# ---------------------------------------------------------------------------
# STEP 5 - choose Point A and Point B from REAL detections
# ---------------------------------------------------------------------------
def utc_to_local_str(ts_utc):
    """FIRMS timestamps are UTC; Cambodia is UTC+7. Show local time to players."""
    try:
        dt = datetime.datetime.strptime(ts_utc, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return ts_utc
    loc = dt + datetime.timedelta(hours=7)
    return loc.strftime("%Y-%m-%d %H:%M") + " (local, UTC+7)"


def choose_points(window, village, grid, daily, cfg):
    """
    Point B = the THREAT: most recently detected, near the village, on the
              forest edge, with little recent rain.
    Point A = the DECOY: detected earlier, far from the village, deep inside
              forest.

    Every candidate is a real row from fires_final.csv. We never move a point.
    The function returns the chosen rows plus the reasoning, so both the console
    output and the in-game About panel can show exactly how the pick was made.
    """
    # Annotate every windowed detection with the derived attributes.
    for d in window:
        d["dist_village_km"] = round(
            haversine_km(d["lat"], d["lon"], village["lat"], village["lon"]), 2)
        gy, gx = cell_of(d["lat"], d["lon"], grid)
        d["tile"] = tile_at(grid, gy, gx)
        d["on_forest_edge"] = near_edge(grid, d["lat"], d["lon"])
        d["rain"] = rain_totals(daily, d["date"], cfg["rain_lookback_days"])
        wx = (daily or {}).get(d["date"], {})
        d["temp_c"] = wx.get("temp_c")
        d["temp_max_c"] = wx.get("temp_max_c")
        d["humidity_pct"] = wx.get("humidity_pct")
        d["wind_ms"] = wx.get("wind_ms")

    latest_date = max(d["date"] for d in window)
    notes = []

    # ---- Point B: near the village, forest edge, as recent as possible ----
    b_pool = [d for d in window
              if d["dist_village_km"] <= cfg["B_max_dist_village"] and d["on_forest_edge"]]
    if b_pool:
        notes.append("Point B chosen from %d detections within %.0f km of the village AND on or "
                     "beside a forest-edge tile." % (len(b_pool), cfg["B_max_dist_village"]))
    else:
        b_pool = [d for d in window if d["dist_village_km"] <= cfg["B_max_dist_village"]]
        notes.append("RELAXED RULE: no near-village detection sat on a forest-edge tile, so Point B "
                     "was chosen from the %d detections within %.0f km of the village regardless of "
                     "tile class." % (len(b_pool), cfg["B_max_dist_village"]))
    if not b_pool:
        b_pool = sorted(window, key=lambda d: d["dist_village_km"])[:10]
        notes.append("RELAXED FURTHER: no detection met the distance limit; used the 10 closest.")

    # Most recent first; break ties on higher FRP, then on closeness.
    b_pool.sort(key=lambda d: (d["date"], d["frp_mw"], -d["dist_village_km"]), reverse=True)
    point_b = b_pool[0]

    # ---- Point A: far from the village, earlier, inside forest ----
    a_pool = [d for d in window
              if d["dist_village_km"] >= cfg["A_min_dist_village"]
              and d["date"] < point_b["date"]
              and d["tile"] in ("F", "f")]
    if a_pool:
        notes.append("Point A chosen from %d detections at least %.0f km from the village, earlier "
                     "than Point B, on a forest-interior tile."
                     % (len(a_pool), cfg["A_min_dist_village"]))
    else:
        a_pool = [d for d in window
                  if d["dist_village_km"] >= cfg["A_min_dist_village"]
                  and d["date"] < point_b["date"]]
        notes.append("RELAXED RULE: no far detection fell on a forest-interior tile, so Point A was "
                     "chosen from the %d earlier detections at least %.0f km away."
                     % (len(a_pool), cfg["A_min_dist_village"]))
    if not a_pool:
        a_pool = [d for d in window if d["date"] < point_b["date"]]
        a_pool.sort(key=lambda d: -d["dist_village_km"])
        a_pool = a_pool[:10]
        notes.append("RELAXED FURTHER: the distance limit could not be met; used the 10 farthest "
                     "earlier detections.")

    # Earliest first, then farthest - a clearly older, clearly distant signal.
    a_pool.sort(key=lambda d: (d["date"], -d["dist_village_km"]))
    point_a = a_pool[0]

    today = cfg["game_today"] or (datetime.date.fromisoformat(latest_date)
                                  + datetime.timedelta(days=1)).isoformat()

    def finish(d, pid, label):
        age = (datetime.date.fromisoformat(today)
               - datetime.date.fromisoformat(d["date"])).days
        out = dict(d)
        out["id"] = pid
        out["label"] = label
        out["days_since_detection"] = age
        out["local_time"] = utc_to_local_str(d["ts_utc"])
        out["source"] = "firms"
        return out

    return (finish(point_a, "A", "Heat point A"),
            finish(point_b, "B", "Heat point B"),
            today, notes, latest_date)


# ---------------------------------------------------------------------------
# STEP 6 - dryness, which drives how fast fire spreads in the game
# ---------------------------------------------------------------------------
def compute_dryness(point, cfg):
    """
    Turn the real weather at the ignition point into a single 0-1 "dryness"
    number that the game uses to scale fire spread.

    IMPORTANT HONESTY NOTE, repeated in the UI and the README:
    the RELATIVE effect here is data-driven - a week with 3 mm of rain really
    does produce a much higher number than a week with 29 mm. But the ABSOLUTE
    spread rate in the game is a tuned game constant, because the mission lasts
    90 seconds and a real fire takes hours to move this far. Time is compressed.
    This is not a physical rate of spread and must not be read as one.

    Three transparent sub-scores, each 0-1, combined by the configured weights:
      rain     - less rain in the last 7 days => drier
      temp     - hotter daily maximum => drier
      humidity - lower relative humidity => drier
    """
    w = cfg["dryness_weights"]
    parts = []

    rain7 = point["rain"]["7"]["mm"] if point.get("rain") and point["rain"].get("7") else None
    if rain7 is None:
        rain_s = 0.5
        parts.append(("rain", None, rain_s, "no rainfall record - neutral 0.5 used"))
    else:
        rain_s = 1.0 - min(rain7 / cfg["dryness_rain_full_mm"], 1.0)
        parts.append(("rain", rain7, rain_s,
                      "%.2f mm in the 7 days before detection (0 mm => 1.0, %.0f mm+ => 0.0)"
                      % (rain7, cfg["dryness_rain_full_mm"])))

    tmax = point.get("temp_max_c")
    if tmax is None:
        temp_s = 0.5
        parts.append(("temp", None, temp_s, "no temperature record - neutral 0.5 used"))
    else:
        temp_s = (tmax - cfg["dryness_temp_lo_c"]) / (cfg["dryness_temp_hi_c"] - cfg["dryness_temp_lo_c"])
        temp_s = max(0.0, min(1.0, temp_s))
        parts.append(("temp", tmax, temp_s,
                      "%.1f C daily maximum (%.0f C => 0.0, %.0f C+ => 1.0)"
                      % (tmax, cfg["dryness_temp_lo_c"], cfg["dryness_temp_hi_c"])))

    rh = point.get("humidity_pct")
    if rh is None:
        hum_s = 0.5
        parts.append(("humidity", None, hum_s, "no humidity record - neutral 0.5 used"))
    else:
        hum_s = 1.0 - (rh - cfg["dryness_rh_lo_pct"]) / (cfg["dryness_rh_hi_pct"] - cfg["dryness_rh_lo_pct"])
        hum_s = max(0.0, min(1.0, hum_s))
        parts.append(("humidity", rh, hum_s,
                      "%.0f%% relative humidity (%.0f%% => 1.0, %.0f%%+ => 0.0)"
                      % (rh, cfg["dryness_rh_lo_pct"], cfg["dryness_rh_hi_pct"])))

    score = sum(w[name] * s for name, _v, s, _d in parts)
    return {
        "score": round(score, 4),
        "weights": w,
        "factors": [
            {"key": name, "value": val, "sub_score": round(s, 4), "detail": det}
            for name, val, s, det in parts
        ],
        "note": ("Relative dryness is computed from real NASA POWER weather. The absolute "
                 "spread rate in the game is a tuned constant - the mission runs for 90 "
                 "seconds while a real fire would take hours to cover this ground. Time is "
                 "compressed; this is not a physical rate of spread."),
    }


# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------
def main():
    log("=" * 72)
    log("EcoRescue Cambodia - preparing data")
    log("=" * 72)

    fires_path = find_fires_csv()
    power_path = find_power_csv()
    log("Fire archive : %s (%.1f MB)" % (fires_path, os.path.getsize(fires_path) / 1e6))
    log("Weather file : %s" % (power_path or "NOT FOUND - weather will be flagged as Sample data"))
    log()

    # --- weather ---
    log("[1/5] Reading weather ...")
    daily, wmeta = load_weather(power_path)
    if daily:
        SOURCES["power"]["file"] = wmeta["file"]
        SOURCES["power"]["sample"] = False
    else:
        SOURCES["power"]["sample"] = True
        SOURCES["power"]["detail"] += (" NO POWER FILE FOUND - rainfall and temperature are "
                                       "Sample data.")
    log()

    # --- fires ---
    log("[2/5] Streaming the fire archive (one pass, this takes a minute) ...")
    recurrence, window, q, years = scan_fires(fires_path, CONFIG)
    log("  rows read               : %d" % q["rows_read"])
    log("  inside scenario box     : %d" % q["in_box"])
    log("  kept after filters      : %d  (years %s-%s)"
        % (q["kept"], years[0] if years else "-", years[-1] if years else "-"))
    log("  dropped, empty province : %d" % q["dropped_empty_province"])
    log("  dropped, FRP == 0       : %d" % q["dropped_zero_frp"])
    log("  dropped, saturated 500K : %d" % q["dropped_saturated"])
    log("  1 km cells with history : %d" % len(recurrence))
    log("  detections in window    : %d  (%s .. %s)"
        % (len(window), CONFIG["window_start"], CONFIG["window_end"]))
    if not window:
        sys.exit("ERROR: no detections in the mission window. Widen the window in CONFIG.")
    log()

    # --- tile map ---
    log("[3/5] Building the forest / edge / cleared tile map ...")
    grid, base = classify_grid(recurrence, CONFIG)
    log("  grid: %d x %d cells of %.3f deg (about %.1f km)"
        % (grid["ny"], grid["nx"], grid["deg"], grid["deg"] * 111))
    log("  recurrence thresholds: forest <= %d detections, cleared >= %d detections (25 years)"
        % (grid["thresholds"]["count_forest_max"], grid["thresholds"]["count_cleared_min"]))
    log("  tile counts: %s" % grid["class_counts"])
    log()

    # --- village ---
    log("[4/5] Placing the sample village ...")
    village = place_village(recurrence, base, grid, CONFIG, window)
    village["name"] = "Sample village"
    village["sample"] = True
    village["source"] = "village"
    log("  village at %.5f, %.5f" % (village["lat"], village["lon"]))
    log("  %s" % village["derivation"])
    log()

    # --- points ---
    log("[5/5] Selecting heat points A and B from real detections ...")
    point_a, point_b, today, notes, latest = choose_points(window, village, grid, daily, CONFIG)
    for n in notes:
        log("  - " + n)
    log("  game 'today' = %s (latest detection %s, plus one day)" % (today, latest))
    log()
    for p in (point_a, point_b):
        log("  POINT %s  (%s)" % (p["id"], p["label"]))
        log("     detected     : %s   [raw %s UTC]" % (p["local_time"], p["ts_utc"]))
        log("     age          : %d day(s) before game today" % p["days_since_detection"])
        log("     coords       : %.5f, %.5f   province %s" % (p["lat"], p["lon"], p["province"]))
        log("     dist village : %.2f km" % p["dist_village_km"])
        log("     tile         : '%s'   on/next to forest edge: %s" % (p["tile"], p["on_forest_edge"]))
        log("     FRP          : %.2f MW   brightness %.1f K" % (p["frp_mw"], p["brightness_k"] or 0))
        log("     sensor       : %s/%s   confidence %s (rank %d)"
            % (p["sensor"], p["satellite"], p["confidence"], p["confidence_rank"]))
        if p["rain"]:
            log("     rain 7d      : %.2f mm    rain 30d: %.2f mm"
                % (p["rain"]["7"]["mm"], p["rain"]["30"]["mm"]))
        if p["temp_c"] is not None:
            log("     air temp     : %.1f C (max %.1f C), humidity %.0f%%, wind %.2f m/s"
                % (p["temp_c"], p["temp_max_c"] or 0, p["humidity_pct"] or 0, p["wind_ms"] or 0))
        log()

    dry = compute_dryness(point_b, CONFIG)
    log("  FIRE dryness at the ignition point (Point %s): %.3f" % (point_b["id"], dry["score"]))
    for f in dry["factors"]:
        log("     %-9s sub-score %.3f   %s" % (f["key"], f["sub_score"], f["detail"]))
    log()

    # --- all windowed detections, trimmed, for map texture ---
    context = [{"lat": round(d["lat"], 4), "lon": round(d["lon"], 4), "date": d["date"],
                "frp_mw": round(d["frp_mw"], 2), "sensor": d["sensor"]}
               for d in window]

    # --- weather series for the explanation panel chart ---
    wseries = []
    if daily:
        for d in sorted(daily):
            r = daily[d]
            wseries.append({"date": d,
                            "rain_mm": r.get("rain_mm"),
                            "temp_c": r.get("temp_c"),
                            "temp_max_c": r.get("temp_max_c"),
                            "humidity_pct": r.get("humidity_pct"),
                            "wind_ms": r.get("wind_ms")})

    scenario = {
        "meta": {
            "title": "Mission 1 - Check the heat signals and prepare the village",
            "generated_utc": datetime.datetime.now(datetime.timezone.utc)
                                     .strftime("%Y-%m-%d %H:%M:%S UTC"),
            "game_today": today,
            "area": {
                "name": CONFIG["area_name"],
                "short": CONFIG["area_short"],
                "lat_min": CONFIG["lat_min"], "lat_max": CONFIG["lat_max"],
                "lon_min": CONFIG["lon_min"], "lon_max": CONFIG["lon_max"],
                "width_km": round(haversine_km(CONFIG["lat_min"], CONFIG["lon_min"],
                                               CONFIG["lat_min"], CONFIG["lon_max"]), 1),
                "height_km": round(haversine_km(CONFIG["lat_min"], CONFIG["lon_min"],
                                                CONFIG["lat_max"], CONFIG["lon_min"]), 1),
            },
            "window": {"start": CONFIG["window_start"], "end": CONFIG["window_end"],
                       "latest_detection": latest},
            "archive_years": [years[0], years[-1]] if years else None,
            "quality": dict(q),
            "selection_notes": notes,
            "disclaimer": DISCLAIMER,
        },
        "sources": list(SOURCES.values()),
        "village": village,
        "grid": grid,
        "points": [point_a, point_b],
        # The fire in the game starts at the higher-risk detection (Point B) and
        # spreads at a rate scaled by the real weather there.
        "fire": {
            "origin_point_id": point_b["id"],
            "origin_lat": point_b["lat"],
            "origin_lon": point_b["lon"],
            "dryness": compute_dryness(point_b, CONFIG),
        },
        "context_detections": context,
        "weather": {
            "source": "power",
            "sample": SOURCES["power"]["sample"],
            "point": wmeta,
            "daily": wseries,
        },
    }

    os.makedirs("data", exist_ok=True)
    with open(CONFIG["out_path"], "w", encoding="utf-8") as f:
        json.dump(scenario, f, ensure_ascii=False, separators=(",", ":"))

    log("=" * 72)
    log("Wrote %s (%.1f KB)" % (CONFIG["out_path"], os.path.getsize(CONFIG["out_path"]) / 1024))
    log("Original data files were not modified.")
    log("=" * 72)


if __name__ == "__main__":
    main()
