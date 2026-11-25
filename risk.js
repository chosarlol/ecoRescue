/* =========================================================================
   EcoRescue Cambodia - risk.js
   =========================================================================

   A TRANSPARENT, RULE-BASED RISK ESTIMATE.

   This is NOT a trained AI model and must never be described as one. It is a
   weighted sum of five human-readable rules plus one intensity rule, and every
   number it produces can be traced back to a specific value in the data.

   The whole point, for teaching: a student can read this file and understand
   exactly why a heat point scored 79 instead of 4. That is the opposite of a
   black box, and it is a better starting point for a conversation about open
   data than an opaque model would be.

   HOW TO REPLACE THIS WITH A REAL ML MODEL LATER
   ----------------------------------------------
   Keep the signature. `estimateRisk(point, context)` takes one heat point plus
   scenario context and returns:

       { score: 0..100, band: "Low"|"Medium"|"High", bandKey, factors: [...] }

   Swap the body for a model call (or a fetch to a scoring endpoint) and the
   rest of the game keeps working untouched. The `factors` array is what the
   "Why?" panel renders, so a real model should return feature attributions
   (e.g. SHAP values) in the same shape to preserve the explanation UI.
   ========================================================================= */

(function (global) {
  'use strict';

  /* -----------------------------------------------------------------------
     ALL TUNING LIVES IN THIS ONE OBJECT.
     `weight` is the maximum points each rule can add to the 0-100 score.
     The weights sum to 100.
     `lo`/`hi` define a linear ramp: a value at `lo` scores 0, a value at `hi`
     scores 1, and anything in between is interpolated.
     ----------------------------------------------------------------------- */
  const RISK_WEIGHTS = {
    // How recently was the heat detected? Fresh signals matter most.
    recency: {
      weight: 25,
      lo: 21,   // 21+ days old  -> contributes nothing
      hi: 0,    // detected today -> contributes everything
      unit: 'days'
    },
    // How close is it to where people live?
    distanceToVillage: {
      weight: 22,
      lo: 15,   // 15+ km away -> nothing
      hi: 0,    // on top of the village -> everything
      unit: 'km'
    },
    // How dry has it been? Rain in the last 7 days suppresses fire spread.
    rain7d: {
      weight: 20,
      lo: 25,   // 25+ mm in the last week -> nothing
      hi: 0,    // bone dry -> everything
      unit: 'mm'
    },
    // Is it on the forest edge, where fire reaches people and valuable forest?
    // This rule is categorical rather than a ramp. See TILE_RISK below.
    forestEdge: {
      weight: 15
    },
    // Hot air dries fuel out. Cambodia's dry-season highs run ~27-38 C.
    tempMax: {
      weight: 10,
      lo: 26,   // 26 C or cooler -> nothing
      hi: 36,   // 36 C or hotter -> everything
      unit: 'C'
    },
    // Fire Radiative Power: how much energy the satellite actually measured.
    // Ramped on a log scale because FRP spans 0.1 to 3000+ MW.
    frp: {
      weight: 8,
      lo: 2,    // 2 MW or less -> nothing
      hi: 50,   // 50 MW or more -> everything
      log: true,
      unit: 'MW'
    }
  };

  /* Categorical risk for the derived land-cover tile the point sits on.
     Codes come from prepare_data.py -> classify_grid(). */
  const TILE_RISK = {
    E: 1.00,   // forest edge: clearing meets forest, and people are close
    C: 0.60,   // cleared / repeatedly burned land: burns readily, often on purpose
    f: 0.30,   // forest with some burn history
    F: 0.15,   // intact forest, rarely burned
    '.': 0.20  // no detection history on record
  };

  /* Score thresholds for the three bands. */
  const BANDS = [
    { key: 'low', label: 'Low', max: 30 },
    { key: 'medium', label: 'Medium', max: 60 },
    { key: 'high', label: 'High', max: Infinity }
  ];

  /* A factor is counted as "raising" the score if its normalised sub-score is
     above this, and "lowering" it if below. 0.5 = the neutral midpoint. */
  const NEUTRAL = 0.5;

  /* -----------------------------------------------------------------------
     Helpers
     ----------------------------------------------------------------------- */

  /** Linear ramp from `lo` (scores 0) to `hi` (scores 1). `hi` may be below
   *  `lo`, which is how "fewer days = more risk" is expressed. */
  function ramp(value, lo, hi) {
    if (value === null || value === undefined || isNaN(value)) return null;
    if (lo === hi) return 0;
    const t = (value - lo) / (hi - lo);
    return Math.max(0, Math.min(1, t));
  }

  /** Same, on a log scale, for quantities spanning orders of magnitude. */
  function rampLog(value, lo, hi) {
    if (value === null || value === undefined || isNaN(value)) return null;
    const v = Math.max(value, 1e-6);
    return ramp(Math.log(v), Math.log(Math.max(lo, 1e-6)), Math.log(Math.max(hi, 1e-6)));
  }

  function bandFor(score) {
    for (const b of BANDS) {
      if (score <= b.max) return b;
    }
    return BANDS[BANDS.length - 1];
  }

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  /* -----------------------------------------------------------------------
     THE MAIN ENTRY POINT
     -----------------------------------------------------------------------
     @param {Object} point   one heat point from scenario.json "points"
     @param {Object} context { today: "YYYY-MM-DD", village: {...} }  (optional;
                             point already carries precomputed fields)
     @returns {Object} { score, band, bandKey, factors, weights, method }
     ----------------------------------------------------------------------- */
  function estimateRisk(point, context) {
    context = context || {};
    const W = RISK_WEIGHTS;
    const factors = [];
    let total = 0;
    let weightUsed = 0;

    /* -- helper that records one factor and accumulates its contribution -- */
    function addFactor(cfg, opts) {
      // opts: { key, label, value, display, sub, evidence, source }
      const sub = opts.sub;
      if (sub === null) {
        // No data for this factor: record it as unknown and exclude its weight
        // from the total, so a missing dataset cannot silently look like zero
        // risk.
        factors.push({
          key: opts.key,
          label: opts.label,
          value: opts.value,
          display: opts.display,
          direction: 'unknown',
          points: 0,
          maxPoints: cfg.weight,
          evidence: opts.evidence,
          source: opts.source,
          unknown: true
        });
        return;
      }
      const points = sub * cfg.weight;
      total += points;
      weightUsed += cfg.weight;
      factors.push({
        key: opts.key,
        label: opts.label,
        value: opts.value,
        display: opts.display,
        // "raises" / "lowers" is what the Why? panel shows the player.
        direction: sub > NEUTRAL ? 'raises' : (sub < NEUTRAL ? 'lowers' : 'neutral'),
        points: round1(points),
        maxPoints: cfg.weight,
        sub: Math.round(sub * 100) / 100,
        evidence: opts.evidence,
        source: opts.source
      });
    }

    /* ---- 1. Recency of detection ---------------------------------------- */
    const days = point.days_since_detection;
    addFactor(W.recency, {
      key: 'recency',
      label: 'How recent the detection is',
      value: days,
      display: days === 0 ? 'detected today'
        : days === 1 ? 'detected yesterday'
          : days + ' days ago',
      sub: ramp(days, W.recency.lo, W.recency.hi),
      evidence: 'Satellite pass ' + (point.local_time || point.ts_utc) +
        ', sensor ' + point.sensor + '/' + point.satellite + '.',
      source: 'firms'
    });

    /* ---- 2. Distance to the village ------------------------------------- */
    const dist = point.dist_village_km;
    addFactor(W.distanceToVillage, {
      key: 'distanceToVillage',
      label: 'Distance to the village',
      value: dist,
      display: dist + ' km',
      sub: ramp(dist, W.distanceToVillage.lo, W.distanceToVillage.hi),
      evidence: 'Great-circle distance from the detection coordinates to the village marker.',
      source: 'village'
    });

    /* ---- 3. Recent rainfall --------------------------------------------- */
    const rain7 = point.rain && point.rain['7'] ? point.rain['7'].mm : null;
    const rain30 = point.rain && point.rain['30'] ? point.rain['30'].mm : null;
    addFactor(W.rain7d, {
      key: 'rain7d',
      label: 'Rain in the 7 days before detection',
      value: rain7,
      display: rain7 === null ? 'no data' : rain7 + ' mm',
      sub: ramp(rain7, W.rain7d.lo, W.rain7d.hi),
      evidence: rain7 === null
        ? 'No weather record for this date.'
        : 'Daily corrected precipitation summed over 7 days' +
          (rain30 !== null ? '; 30-day total ' + rain30 + ' mm.' : '.'),
      source: 'power'
    });

    /* ---- 4. Forest edge proximity --------------------------------------- */
    const tile = point.tile || '.';
    // Being ON an edge tile, or directly beside one, both count as edge.
    const edgeSub = point.on_forest_edge ? TILE_RISK.E : (TILE_RISK[tile] !== undefined ? TILE_RISK[tile] : 0.2);
    const TILE_NAMES = {
      E: 'forest edge',
      C: 'cleared / repeatedly burned land',
      f: 'forest with some burn history',
      F: 'intact forest',
      '.': 'no detection history'
    };
    addFactor(W.forestEdge, {
      key: 'forestEdge',
      label: 'Forest edge proximity',
      value: tile,
      display: point.on_forest_edge
        ? 'on or beside the forest edge'
        : (TILE_NAMES[tile] || 'unknown'),
      sub: edgeSub,
      evidence: 'Derived from 25 years of detection recurrence per 1 km cell. ' +
        'Not an official forest-cover map.',
      source: 'forest'
    });

    /* ---- 5. Air temperature --------------------------------------------- */
    const tmax = point.temp_max_c !== undefined && point.temp_max_c !== null
      ? point.temp_max_c : null;
    addFactor(W.tempMax, {
      key: 'tempMax',
      label: 'Daily maximum air temperature',
      value: tmax,
      display: tmax === null ? 'no data' : round1(tmax) + ' °C',
      sub: ramp(tmax, W.tempMax.lo, W.tempMax.hi),
      evidence: tmax === null
        ? 'No weather record for this date.'
        : '2 m air temperature maximum on the detection date' +
          (point.humidity_pct != null
            ? ', relative humidity ' + Math.round(point.humidity_pct) + '%.'
            : '.'),
      source: 'power'
    });

    /* ---- 6. Measured fire intensity ------------------------------------- */
    const frp = point.frp_mw;
    addFactor(W.frp, {
      key: 'frp',
      label: 'Measured heat output (FRP)',
      value: frp,
      display: frp === null || frp === undefined ? 'no data' : frp + ' MW',
      sub: W.frp.log ? rampLog(frp, W.frp.lo, W.frp.hi) : ramp(frp, W.frp.lo, W.frp.hi),
      evidence: 'Fire Radiative Power reported with the detection' +
        (point.brightness_k ? ', brightness temperature ' + round1(point.brightness_k) + ' K.' : '.'),
      source: 'firms'
    });

    /* ---- Normalise ------------------------------------------------------
       If a dataset was missing we excluded its weight, so we rescale by the
       weight actually used. That keeps the 0-100 range meaningful instead of
       quietly depressing every score.                                      */
    const score = weightUsed > 0 ? Math.round((total / weightUsed) * 100) : 0;
    const band = bandFor(score);

    // Biggest contributors first - that is the order the Why? panel reads best.
    factors.sort(function (a, b) { return b.points - a.points; });

    return {
      score: score,
      band: band.label,
      bandKey: band.key,
      factors: factors,
      weights: RISK_WEIGHTS,
      weightUsed: weightUsed,
      // Carried into the UI so the label is always honest.
      method: 'Rule-based risk estimate (weighted sum of 6 transparent rules). ' +
        'Not a trained AI model.'
    };
  }

  /** Rank heat points by estimated risk. Used to decide the priority point. */
  function rankByRisk(points, context) {
    return points
      .map(function (p) { return { point: p, risk: estimateRisk(p, context) }; })
      .sort(function (a, b) { return b.risk.score - a.risk.score; });
  }

  /* Export for plain <script> use - no build step, no modules. */
  global.EcoRisk = {
    estimateRisk: estimateRisk,
    rankByRisk: rankByRisk,
    RISK_WEIGHTS: RISK_WEIGHTS,
    TILE_RISK: TILE_RISK,
    BANDS: BANDS
  };
})(window);
