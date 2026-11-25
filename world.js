/* =========================================================================
   EcoRescue Cambodia - world.js
   =========================================================================

   Turns the real 1 km data grid from scenario.json into a walkable world.

   TWO GRIDS, AND WHY
   ------------------
   1. The DATA grid, straight from prepare_data.py: 24 x 26 cells of 1 km,
      each classified F / f / E / C from 25 years of burn recurrence. This is
      the real thing and we never alter it.
   2. The SUB grid, each data cell split SUBDIV x SUBDIV. Fire spreads on this
      finer grid so the flame front moves smoothly instead of jumping a whole
      kilometre at a time. Every sub-cell inherits its parent's land class.

   COORDINATES
   -----------
   World pixels run x = east, y = south (screen down), so latitude is flipped:
      worldX = (lon - lon_min) / deg * CELL_PX
      worldY = (lat_max - lat) / deg * CELL_PX
   Data row gy = 0 is the SOUTHERNMOST band, which is the BOTTOM of the screen.
   ========================================================================= */

(function (global) {
  'use strict';

  /* ---------------- tunables ---------------- */
  const CFG = {
    SUBDIV: 4,          // sub-cells per data cell per axis
    SUB_PX: 40,         // pixels per sub-cell  -> 1 km data cell = 160 px
    TREE_CHANCE: {      // chance a sub-cell holds a tree, by land class
      F: 0.80, f: 0.62, E: 0.30, C: 0.07, '.': 0.2
    },
    ROAD_WIDTH_SUB: 1   // the decorative road, in sub-cells
  };

  const W = {
    cfg: CFG,
    scenario: null,
    nx: 0, ny: 0,          // data grid
    snx: 0, sny: 0,        // sub grid
    cellPx: 0,             // pixels per data cell
    widthPx: 0, heightPx: 0,
    cls: null,             // Uint8Array over sub grid: land class index
    trees: null,           // array of arrays, indexed [sy*snx+sx]
    road: null,            // Uint8Array over sub grid: 1 = road
    houses: [],
    villagers: [],
    village: null,
    points: [],
    latMax: 0, lonMin: 0, deg: 0
  };

  /* Land classes as small ints, for a compact typed array. */
  const CLASS_CHARS = ['F', 'f', 'E', 'C', '.'];
  const C_IDX = { F: 0, f: 1, E: 2, C: 3, '.': 4 };

  /* Ground colours per class.
     The FIRST entry of each row is the exact land-class token from style.css,
     the one checked with the data-viz palette validator: against this canvas
     surface the three land kinds give worst CVD dE 9.1 (target 8) and worst
     normal-vision dE 20.6 (floor 15), and F/f clear the ordinal check at
     delta L 0.078. The other two entries are the same colour at 93% and 87%
     brightness - texture only, chosen small enough that the class is still
     identified by its hue. Keep these in step with style.css. */
  const GROUND = {
    F: ['#0b764d', '#0a6d47', '#096642'],   // intact forest
    f: ['#228f61', '#1f845a', '#1d7c54'],   // forest, some burn history
    E: ['#b18e15', '#a48413', '#997b12'],   // forest edge / dry grass
    C: ['#b93004', '#ac2c03', '#a02903'],   // cleared, repeatedly burned
    '.': ['#3a4038', '#363c34', '#3e443c']
  };

  /* ----------------------------------------------------------------------
     Build
     ---------------------------------------------------------------------- */
  function build(scenario) {
    W.scenario = scenario;
    const g = scenario.grid;

    W.nx = g.nx; W.ny = g.ny;
    W.deg = g.deg;
    W.lonMin = g.lon_min;
    W.latMax = g.lat_min + g.ny * g.deg;

    W.cellPx = CFG.SUBDIV * CFG.SUB_PX;
    W.snx = g.nx * CFG.SUBDIV;
    W.sny = g.ny * CFG.SUBDIV;
    W.widthPx = W.snx * CFG.SUB_PX;
    W.heightPx = W.sny * CFG.SUB_PX;

    Sprites.setSeed(20251231);   // deterministic world every run

    /* --- land class per sub-cell, inherited from the real data cell --- */
    W.cls = new Uint8Array(W.snx * W.sny);
    for (let sy = 0; sy < W.sny; sy++) {
      // screen row sy -> data row gy (flip, because gy 0 is the south edge)
      const gy = W.ny - 1 - Math.floor(sy / CFG.SUBDIV);
      const rowStr = g.rows[gy];
      for (let sx = 0; sx < W.snx; sx++) {
        const gx = Math.floor(sx / CFG.SUBDIV);
        const ch = rowStr[gx] || '.';
        W.cls[sy * W.snx + sx] = C_IDX[ch] !== undefined ? C_IDX[ch] : 4;
      }
    }

    /* --- per-cell ground shade ---
       A hash like (sx*7 + sy*13) % 3 looks random but is not: stepping one
       cell in x or y both add 1 mod 3, which draws hard diagonal stripes
       across the whole map. Draw the shade once from the seeded RNG instead,
       so the texture is irregular but still identical on every run. */
    W.shade = new Uint8Array(W.snx * W.sny);
    for (let i = 0; i < W.shade.length; i++) {
      W.shade[i] = (Sprites.rnd() * 3) | 0;
    }

    /* --- decorative road (NOT from data; labelled as such in the UI) --- */
    W.road = new Uint8Array(W.snx * W.sny);
    buildRoad();

    /* --- trees --- */
    buildTrees();

    /* --- village: houses around the sample village point --- */
    W.village = scenario.village;
    buildVillage();

    /* --- heat points --- */
    W.points = scenario.points.map(function (p) {
      return {
        id: p.id,
        data: p,
        x: lonToX(p.lon),
        y: latToY(p.lat),
        inspected: false
      };
    });

    return W;
  }

  /** A simple winding road across the map. Purely decorative: it slows fire
   *  slightly but does not block it, and the About panel says it is not data. */
  function buildRoad() {
    const midY = Math.floor(W.sny * 0.30);
    for (let sx = 0; sx < W.snx; sx++) {
      const wobble = Math.round(Math.sin(sx * 0.11) * 5 + Math.sin(sx * 0.037) * 8);
      for (let d = 0; d < CFG.ROAD_WIDTH_SUB; d++) {
        const sy = midY + wobble + d;
        if (sy >= 0 && sy < W.sny) W.road[sy * W.snx + sx] = 1;
      }
    }
  }

  function buildTrees() {
    W.trees = new Array(W.snx * W.sny);
    for (let sy = 0; sy < W.sny; sy++) {
      for (let sx = 0; sx < W.snx; sx++) {
        const i = sy * W.snx + sx;
        if (W.road[i]) { W.trees[i] = null; continue; }
        const ch = CLASS_CHARS[W.cls[i]];
        const chance = CFG.TREE_CHANCE[ch] !== undefined ? CFG.TREE_CHANCE[ch] : 0.2;
        if (Sprites.rnd() < chance) {
          W.trees[i] = {
            // jitter inside the sub-cell so the forest does not look gridded
            ox: 6 + Sprites.rnd() * (CFG.SUB_PX - 12),
            oy: 8 + Sprites.rnd() * (CFG.SUB_PX - 10),
            variant: (Sprites.rnd() * 3) | 0,
            phase: Sprites.rnd() * Math.PI * 2,
            scale: 0.85 + Sprites.rnd() * 0.4
          };
        } else {
          W.trees[i] = null;
        }
      }
    }
  }

  function buildVillage() {
    const vx = lonToX(W.village.lon);
    const vy = latToY(W.village.lat);
    W.villageX = vx;
    W.villageY = vy;
    W.villageRadius = 110;      // interaction + "fire has arrived" radius

    W.houses = [];
    const n = 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.4;
      const r = 48 + (i % 2) * 26;
      W.houses.push({
        x: vx + Math.cos(a) * r,
        y: vy + Math.sin(a) * r * 0.65,
        flip: Sprites.rnd() < 0.5
      });
    }
    // Clear trees out of the village so houses are not buried in forest.
    forEachSubInRadius(vx, vy, W.villageRadius + 30, function (i) {
      W.trees[i] = null;
    });

    // Villagers idle near their houses; they run to the gathering spot when
    // the village is prepared.
    W.gatherX = vx;
    W.gatherY = vy + 10;
    W.villagers = [];
    for (let i = 0; i < 7; i++) {
      const h = W.houses[i % W.houses.length];
      W.villagers.push({
        homeX: h.x + (Sprites.rnd() - 0.5) * 26,
        homeY: h.y + 10 + (Sprites.rnd() - 0.5) * 14,
        x: h.x + (Sprites.rnd() - 0.5) * 26,
        y: h.y + 10 + (Sprites.rnd() - 0.5) * 14,
        phase: Sprites.rnd() * Math.PI * 2,
        running: false
      });
    }
  }

  function forEachSubInRadius(wx, wy, r, fn) {
    const x0 = Math.max(0, Math.floor((wx - r) / CFG.SUB_PX));
    const x1 = Math.min(W.snx - 1, Math.floor((wx + r) / CFG.SUB_PX));
    const y0 = Math.max(0, Math.floor((wy - r) / CFG.SUB_PX));
    const y1 = Math.min(W.sny - 1, Math.floor((wy + r) / CFG.SUB_PX));
    for (let sy = y0; sy <= y1; sy++) {
      for (let sx = x0; sx <= x1; sx++) {
        const cx = sx * CFG.SUB_PX + CFG.SUB_PX / 2;
        const cy = sy * CFG.SUB_PX + CFG.SUB_PX / 2;
        if ((cx - wx) * (cx - wx) + (cy - wy) * (cy - wy) <= r * r) {
          fn(sy * W.snx + sx, sx, sy);
        }
      }
    }
  }

  /* ----------------------------------------------------------------------
     Coordinate helpers
     ---------------------------------------------------------------------- */
  function lonToX(lon) { return (lon - W.lonMin) / W.deg * W.cellPx; }
  function latToY(lat) { return (W.latMax - lat) / W.deg * W.cellPx; }
  function xToLon(x) { return W.lonMin + (x / W.cellPx) * W.deg; }
  function yToLat(y) { return W.latMax - (y / W.cellPx) * W.deg; }

  /** Metres per world pixel - used to show honest distances in the UI. */
  function pxToKm(px) { return (px / W.cellPx) * (W.deg * 111.0); }

  function subIndexAt(wx, wy) {
    const sx = Math.floor(wx / CFG.SUB_PX);
    const sy = Math.floor(wy / CFG.SUB_PX);
    if (sx < 0 || sy < 0 || sx >= W.snx || sy >= W.sny) return -1;
    return sy * W.snx + sx;
  }
  function classAt(wx, wy) {
    const i = subIndexAt(wx, wy);
    return i < 0 ? '.' : CLASS_CHARS[W.cls[i]];
  }

  /* ----------------------------------------------------------------------
     Rendering
     ----------------------------------------------------------------------
     Only the sub-cells inside the camera are touched, so world size does not
     affect frame cost. Ground first, then (in main.js) depth-sorted sprites.
     ---------------------------------------------------------------------- */
  function drawGround(ctx, cam, fire) {
    const S = CFG.SUB_PX;
    const x0 = Math.max(0, Math.floor(cam.x / S));
    const y0 = Math.max(0, Math.floor(cam.y / S));
    const x1 = Math.min(W.snx - 1, Math.ceil((cam.x + cam.w) / S));
    const y1 = Math.min(W.sny - 1, Math.ceil((cam.y + cam.h) / S));

    for (let sy = y0; sy <= y1; sy++) {
      for (let sx = x0; sx <= x1; sx++) {
        const i = sy * W.snx + sx;
        const ch = CLASS_CHARS[W.cls[i]];
        let col;
        const st = fire ? fire.stateAt(i) : 0;
        if (st === 3) {
          col = '#241f1b';                       // burnt out
        } else if (st === 2) {
          col = '#5a2a12';                       // actively burning ground
        } else {
          const pal = GROUND[ch] || GROUND['.'];
          col = pal[W.shade[i] % pal.length];
        }
        ctx.fillStyle = col;
        ctx.fillRect(sx * S - cam.x, sy * S - cam.y, S + 1, S + 1);

        if (W.road[i] && st < 2) {
          ctx.fillStyle = '#8b7f6b';
          ctx.fillRect(sx * S - cam.x, sy * S - cam.y + S * 0.25, S + 1, S * 0.5);
          continue;
        }

        /* Terrain speckle. A large flat fill of a data colour reads as a
           choropleth, not ground, so each cell gets a few deterministic
           tufts or flecks. This only changes texture - the land class is
           still carried by the validated hue underneath. */
        if (st < 2) {
          const px = sx * S - cam.x, py = sy * S - cam.y;
          const h = W.shade[i];
          const n = ch === 'C' ? 3 : ch === 'E' ? 4 : 3;
          ctx.fillStyle = (ch === 'C')
            ? 'rgba(60,24,10,.30)'            // scorched dirt flecks
            : (ch === 'E')
              ? 'rgba(130,104,16,.40)'        // dry grass tufts
              : 'rgba(5,52,34,.42)';          // undergrowth
          for (let k = 0; k < n; k++) {
            const a = ((i * 17 + k * 101 + h * 7) % 31) / 31;
            const b = ((i * 29 + k * 53 + h * 13) % 29) / 29;
            const tw = (ch === 'E') ? 2 : 3;
            ctx.fillRect(px + a * (S - 4) + 2, py + b * (S - 4) + 2, tw, (ch === 'E') ? 4 : 2);
          }
        }
      }
    }
  }

  /** Collect visible trees as draw-items for the depth-sorted pass. */
  function collectTrees(out, cam, fire) {
    const S = CFG.SUB_PX;
    const x0 = Math.max(0, Math.floor(cam.x / S) - 1);
    const y0 = Math.max(0, Math.floor(cam.y / S) - 1);
    const x1 = Math.min(W.snx - 1, Math.ceil((cam.x + cam.w) / S) + 1);
    const y1 = Math.min(W.sny - 1, Math.ceil((cam.y + cam.h) / S) + 1);

    for (let sy = y0; sy <= y1; sy++) {
      for (let sx = x0; sx <= x1; sx++) {
        const i = sy * W.snx + sx;
        const t = W.trees[i];
        if (!t) continue;
        let state = 'healthy';
        if (fire) {
          const st = fire.stateAt(i);
          if (st === 3) state = 'burnt';
          else if (st === 2) state = 'ember';
          else if (fire.heatAt(i) > 0.25) state = 'scorched';
        }
        out.push({
          kind: 'tree',
          x: sx * S + t.ox,
          y: sy * S + t.oy,
          t: t,
          state: state
        });
      }
    }
  }

  global.World = {
    cfg: CFG,
    data: W,
    build: build,
    lonToX: lonToX, latToY: latToY, xToLon: xToLon, yToLat: yToLat,
    pxToKm: pxToKm,
    subIndexAt: subIndexAt,
    classAt: classAt,
    classChars: CLASS_CHARS,
    drawGround: drawGround,
    collectTrees: collectTrees,
    forEachSubInRadius: forEachSubInRadius
  };
})(window);
