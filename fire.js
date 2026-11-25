/* =========================================================================
   EcoRescue Cambodia - fire.js
   =========================================================================

   Fire spread on the sub-grid, plus the flame / ember / smoke particles.

   HOW SPREAD WORKS
   ----------------
   Every sub-cell has a `heat` value from 0 to 1. A burning cell pushes heat
   into its neighbours each tick:

       heat += RATE * dryness * fuel(neighbour) * dt

   At heat >= 1 the cell ignites. Above SPARK_HEAT it shows warning sparks,
   which is the "cells about to ignite" cue. A burning cell burns for
   BURN_SECONDS and then becomes burnt ground.

   WHAT IS REAL AND WHAT IS A GAME CONSTANT - say this plainly to judges:
     * `dryness` is REAL. prepare_data.py computes it from NASA POWER rainfall,
       temperature and humidity at the ignition point. 3 mm of rain in the
       prior week really does give a much higher number than 29 mm.
     * `fuel` per land class is a DESIGN CHOICE, informed by the derived land
       classification (grass and forest edge carry fire faster than closed
       canopy).
     * RATE is a TUNED GAME CONSTANT. The mission lasts 90 seconds; a real
       fire would need hours to cover this ground. Time is compressed. This is
       not a physical rate of spread.
   ========================================================================= */

(function (global) {
  'use strict';

  /* ---------------- tunables, all in one place ---------------- */
  const CFG = {
    /* PROPAGATION INVARIANT - read before touching RATE or BURN_SECONDS.
       A burning cell only has BURN_SECONDS to push a neighbour from 0 heat to
       1. So the fire sustains itself only while

           RATE * dryness * fuel * BURN_SECONDS  >  1

       for the LOWEST fuel it has to cross. Break that and the fire quietly
       dies out one cell after ignition, which is a silent failure - the
       mission just becomes unloseable. reset() checks this and warns.

       With RATE 0.16, dryness 0.605 and the lowest fuel (0.82, closed forest):
       0.16 * 0.605 * 0.82 * 16 = 1.27, a comfortable margin.

       Timing is calibrated by MEASUREMENT, not arithmetic - the front moves
       faster than a single-cell chain because several burning cells heat the
       same neighbour at once. tests/selftest.html asserts the arrival time, so
       changing these without re-running the tests will be caught. */
    RATE: 0.16,
    BURN_SECONDS: 16,
    SPARK_HEAT: 0.45,
    TICK: 0.1,                 // fire sim step, seconds

    // Relative flammability per derived land class.
    FUEL: {
      F: 0.82,                 // closed forest, moister, slower
      f: 1.00,                 // forest with burn history
      E: 1.22,                 // forest edge - dry grass meets trees
      C: 1.15,                 // cleared land - grass, burns fast and light
      '.': 0.7
    },
    ROAD_FUEL_MUL: 0.25,       // the decorative road slows fire, never blocks it

    MAX_PARTICLES: 520,
    FLAME_PER_CELL: 0.5,       // flame spawns per burning cell per tick
    SMOKE_PER_CELL: 0.16,
    EMBER_CHANCE: 0.05
  };

  /* Cell states */
  const UNBURNT = 0, HEATING = 1, BURNING = 2, BURNT = 3;

  const F = {
    w: 0, h: 0,
    state: null,       // Uint8Array
    heat: null,        // Float32Array
    burnT: null,       // Float32Array - seconds remaining while BURNING
    burning: [],       // indices currently BURNING
    particles: [],
    dryness: 1,
    started: false,
    acc: 0,
    originIndex: -1,
    cellsBurnt: 0
  };

  function reset(world, dryness) {
    F.w = world.snx; F.h = world.sny;
    const n = F.w * F.h;
    F.state = new Uint8Array(n);
    F.heat = new Float32Array(n);
    F.burnT = new Float32Array(n);
    F.burning = [];
    F.particles = [];
    F.dryness = dryness;
    F.started = false;
    F.acc = 0;
    F.cellsBurnt = 0;
    F.world = world;

    /* Guard the propagation invariant documented on CFG. A fire that dies out
       one cell after ignition fails silently, so say so loudly instead. */
    let minFuel = Infinity;
    for (const k in CFG.FUEL) {
      if (CFG.FUEL[k] < minFuel) minFuel = CFG.FUEL[k];
    }
    F.sustainMargin = CFG.RATE * dryness * minFuel * CFG.BURN_SECONDS;
    if (F.sustainMargin <= 1) {
      console.warn('[fire.js] Fire will not sustain itself: RATE * dryness * minFuel * ' +
        'BURN_SECONDS = ' + F.sustainMargin.toFixed(2) + ' (needs > 1). ' +
        'The fire will die out one cell after ignition.');
    }
  }

  function ignite(index) {
    if (index < 0 || index >= F.state.length) return;
    if (F.state[index] === BURNING || F.state[index] === BURNT) return;
    F.state[index] = BURNING;
    F.heat[index] = 1;
    F.burnT[index] = CFG.BURN_SECONDS;
    F.burning.push(index);
    F.started = true;
  }

  function fuelAt(index) {
    const w = F.world;
    const ch = World.classChars[w.cls[index]];
    let f = CFG.FUEL[ch] !== undefined ? CFG.FUEL[ch] : 0.7;
    if (w.road[index]) f *= CFG.ROAD_FUEL_MUL;
    return f;
  }

  /* ----------------------------------------------------------------------
     Simulation
     ---------------------------------------------------------------------- */
  function update(dt, cam) {
    if (!F.started) { updateParticles(dt); return; }

    F.acc += dt;
    while (F.acc >= CFG.TICK) {
      F.acc -= CFG.TICK;
      step(CFG.TICK, cam);
    }
    updateParticles(dt);
  }

  function step(dt, cam) {
    const w = F.w, h = F.h;
    const newly = [];

    for (let k = 0; k < F.burning.length; k++) {
      const i = F.burning[k];
      const sx = i % w, sy = (i / w) | 0;

      // Push heat into the four orthogonal neighbours.
      for (let d = 0; d < 4; d++) {
        const nx = sx + (d === 0 ? 1 : d === 1 ? -1 : 0);
        const ny = sy + (d === 2 ? 1 : d === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (F.state[j] === BURNING || F.state[j] === BURNT) continue;

        F.heat[j] += CFG.RATE * F.dryness * fuelAt(j) * dt;
        if (F.heat[j] >= 1) {
          newly.push(j);
        } else if (F.state[j] === UNBURNT && F.heat[j] > CFG.SPARK_HEAT) {
          F.state[j] = HEATING;
        }
      }

      // Burn down.
      F.burnT[i] -= dt;
      if (F.burnT[i] <= 0) {
        F.state[i] = BURNT;
        F.cellsBurnt++;
      }

      // Flames and smoke, but only near the camera - no point simulating
      // particles the player cannot see.
      if (cam && inView(sx, sy, cam)) {
        spawnFlames(sx, sy);
      }
    }

    for (let k = 0; k < newly.length; k++) ignite(newly[k]);

    // Drop cells that have finished burning.
    F.burning = F.burning.filter(function (i) { return F.state[i] === BURNING; });
  }

  function inView(sx, sy, cam) {
    const S = World.cfg.SUB_PX;
    const x = sx * S, y = sy * S;
    return x > cam.x - 80 && x < cam.x + cam.w + 80 &&
           y > cam.y - 80 && y < cam.y + cam.h + 80;
  }

  /* ----------------------------------------------------------------------
     Particles
     ---------------------------------------------------------------------- */
  function spawnFlames(sx, sy) {
    const S = World.cfg.SUB_PX;
    const bx = sx * S, by = sy * S;

    if (F.particles.length < CFG.MAX_PARTICLES && Math.random() < CFG.FLAME_PER_CELL) {
      F.particles.push({
        kind: 'flame',
        x: bx + Math.random() * S,
        y: by + Math.random() * S,
        vx: (Math.random() - 0.5) * 10,
        vy: -26 - Math.random() * 30,
        r: 3 + Math.random() * 4,
        t: 0,
        life: 0.42 + Math.random() * 0.4
      });
    }
    if (F.particles.length < CFG.MAX_PARTICLES && Math.random() < CFG.SMOKE_PER_CELL) {
      F.particles.push({
        kind: 'smoke',
        x: bx + Math.random() * S,
        y: by + Math.random() * S,
        vx: 7 + Math.random() * 10,
        vy: -16 - Math.random() * 12,
        r: 5 + Math.random() * 7,
        t: 0,
        life: 1.7 + Math.random() * 1.4
      });
    }
    if (F.particles.length < CFG.MAX_PARTICLES && Math.random() < CFG.EMBER_CHANCE) {
      F.particles.push({
        kind: 'ember',
        x: bx + Math.random() * S,
        y: by + Math.random() * S,
        vx: 14 + Math.random() * 22,
        vy: -34 - Math.random() * 26,
        r: 1.2 + Math.random(),
        t: 0,
        life: 1.1 + Math.random() * 0.8
      });
    }
  }

  function updateParticles(dt) {
    for (let i = F.particles.length - 1; i >= 0; i--) {
      const p = F.particles[i];
      p.t += dt;
      if (p.t >= p.life) { F.particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'flame') {
        p.vy += 22 * dt;              // flames slow as they rise
        p.r *= (1 - 1.1 * dt);
      } else if (p.kind === 'smoke') {
        p.vy *= (1 - 0.35 * dt);
        p.r += 7 * dt;
      } else {
        p.vy += 26 * dt;              // embers arc and fall
      }
    }
  }

  /* ----------------------------------------------------------------------
     Drawing
     ---------------------------------------------------------------------- */

  /** Warning sparks on cells that are about to catch. */
  function drawSparks(ctx, cam, time) {
    const S = World.cfg.SUB_PX;
    const x0 = Math.max(0, Math.floor(cam.x / S));
    const y0 = Math.max(0, Math.floor(cam.y / S));
    const x1 = Math.min(F.w - 1, Math.ceil((cam.x + cam.w) / S));
    const y1 = Math.min(F.h - 1, Math.ceil((cam.y + cam.h) / S));

    for (let sy = y0; sy <= y1; sy++) {
      for (let sx = x0; sx <= x1; sx++) {
        const i = sy * F.w + sx;
        if (F.state[i] !== HEATING) continue;
        const heat = F.heat[i];
        const a = 0.25 + 0.55 * heat * (0.6 + 0.4 * Math.sin(time * 11 + i));
        ctx.fillStyle = 'rgba(255,170,60,' + a.toFixed(3) + ')';
        const n = 2;
        for (let k = 0; k < n; k++) {
          const px = sx * S + ((i * 7 + k * 13) % S);
          const py = sy * S + ((i * 11 + k * 5) % S);
          ctx.fillRect(px - cam.x, py - cam.y, 2, 2);
        }
      }
    }
  }

  /** The warm glow cast by the fire. Drawn with 'lighter' so overlapping
   *  cells build up brightness the way real firelight does. */
  function drawGlow(ctx, cam) {
    if (!F.burning.length) return;
    const S = World.cfg.SUB_PX;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // Sample rather than draw every cell - a big front would otherwise mean
    // hundreds of expensive radial gradients per frame.
    const stride = Math.max(1, Math.floor(F.burning.length / 60));
    for (let k = 0; k < F.burning.length; k += stride) {
      const i = F.burning[k];
      const sx = (i % F.w) * S + S / 2 - cam.x;
      const sy = ((i / F.w) | 0) * S + S / 2 - cam.y;
      if (sx < -140 || sy < -140 || sx > cam.w + 140 || sy > cam.h + 140) continue;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 96);
      g.addColorStop(0, 'rgba(255,140,40,0.30)');
      g.addColorStop(0.5, 'rgba(255,90,20,0.11)');
      g.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(sx - 96, sy - 96, 192, 192);
    }
    ctx.restore();
  }

  function drawParticles(ctx, cam) {
    ctx.save();
    for (let i = 0; i < F.particles.length; i++) {
      const p = F.particles[i];
      const x = p.x - cam.x, y = p.y - cam.y;
      if (x < -40 || y < -40 || x > cam.w + 40 || y > cam.h + 40) continue;
      const k = p.t / p.life;

      if (p.kind === 'smoke') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(78,72,66,' + (0.34 * (1 - k)).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(x, y, p.r, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'ember') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,' + (150 - 90 * k | 0) + ',60,' + (1 - k).toFixed(3) + ')';
        ctx.fillRect(x, y, p.r + 1, p.r + 1);
      } else {
        // Flame: yellow core fading through orange to red.
        ctx.globalCompositeOperation = 'lighter';
        const r = Math.max(0.5, p.r);
        const g2 = ctx.createRadialGradient(x, y, 0, x, y, r * 2.1);
        g2.addColorStop(0, 'rgba(255,245,170,' + (0.85 * (1 - k)).toFixed(3) + ')');
        g2.addColorStop(0.45, 'rgba(255,150,40,' + (0.6 * (1 - k)).toFixed(3) + ')');
        g2.addColorStop(1, 'rgba(200,40,10,0)');
        ctx.fillStyle = g2;
        ctx.beginPath();
        ctx.arc(x, y, r * 2.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /* ----------------------------------------------------------------------
     Queries used by the rest of the game
     ---------------------------------------------------------------------- */
  function stateAt(i) { return F.state ? F.state[i] : 0; }
  function heatAt(i) { return F.heat ? F.heat[i] : 0; }

  /** Has fire reached within `radius` of a world point? */
  function reached(wx, wy, radius) {
    const S = World.cfg.SUB_PX;
    const r2 = radius * radius;
    for (let k = 0; k < F.burning.length; k++) {
      const i = F.burning[k];
      const x = (i % F.w) * S + S / 2;
      const y = ((i / F.w) | 0) * S + S / 2;
      const dx = x - wx, dy = y - wy;
      if (dx * dx + dy * dy <= r2) return true;
    }
    return false;
  }

  /** Distance in world px from a point to the nearest burning cell. */
  function distanceToFire(wx, wy) {
    const S = World.cfg.SUB_PX;
    let best = Infinity;
    for (let k = 0; k < F.burning.length; k++) {
      const i = F.burning[k];
      const x = (i % F.w) * S + S / 2;
      const y = ((i / F.w) | 0) * S + S / 2;
      const d = Math.hypot(x - wx, y - wy);
      if (d < best) best = d;
    }
    return best;
  }

  global.Fire = {
    cfg: CFG,
    data: F,
    reset: reset,
    ignite: ignite,
    update: update,
    drawSparks: drawSparks,
    drawGlow: drawGlow,
    drawParticles: drawParticles,
    stateAt: stateAt,
    heatAt: heatAt,
    reached: reached,
    distanceToFire: distanceToFire,
    UNBURNT: UNBURNT, HEATING: HEATING, BURNING: BURNING, BURNT: BURNT
  };
})(window);
