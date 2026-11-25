/* =========================================================================
   EcoRescue Cambodia - main.js
   =========================================================================

   The game loop and the rules. Everything else is a module:
     risk.js    the risk estimate
     sprites.js procedural art
     world.js   terrain built from the real data grid
     fire.js    fire spread + particles
     player.js  movement and the walk cycle
     ui.js      all text, HUD, panels, sound

   ONE STATE OBJECT (`state`) holds everything mutable. update(dt) changes it,
   render() only reads it. Keeping those apart is what makes the thing
   debuggable at 2am during a hackathon.

   THE RULE THAT MATTERS: the player acts FIRST. We compute the risk estimate
   at load time because we need to know which point is the priority, but it is
   never shown until the result screen, behind the "Why?" button.
   ========================================================================= */

(function () {
  'use strict';

  /* =======================================================================
     Tunables
     ======================================================================= */
  const RULES = {
    PHASES: 3,
    PHASE_SECONDS: 30,          // 90 seconds total
    INSPECT_SECONDS: 3.5,
    PREPARE_SECONDS: 6.0,
    INTERACT_RADIUS: 58,        // world px: how close to press E
    BASE_REVEAL: 300,           // how far a heat point becomes visible
    FIRE_START_DELAY: 5.0,      // seconds before the hotspot ignites
    VILLAGE_LOSS_RADIUS: 95     // fire within this of the village = too late
  };

  /* =======================================================================
     STATE
     ======================================================================= */
  const state = {
    scenario: null,
    screen: 'boot',             // boot | title | select | game | result
    character: null,

    running: false,
    time: 0,                    // seconds since the mission started
    phase: 1,
    phaseElapsed: 0,
    phaseLength: RULES.PHASE_SECONDS,
    timeRemaining: RULES.PHASES * RULES.PHASE_SECONDS,

    player: null,
    cam: { x: 0, y: 0, w: 0, h: 0 },

    inspected: {},
    priorityId: null,
    priorityInspected: false,
    villagePrepared: false,
    villageLost: false,
    timeUp: false,
    won: false,
    ended: false,
    whyShown: false,

    action: null,               // { kind:'inspect'|'prepare', target, elapsed, needed }
    nearTarget: null,
    risks: {},

    villagersAlerted: false,
    muted: false
  };

  let canvas, ctx, dpr = 1;
  let lastT = 0;
  const input = { x: 0, y: 0, interact: false, interactEdge: false };
  const keys = {};

  /* =======================================================================
     BOOT
     ======================================================================= */
  function boot() {
    canvas = document.getElementById('game-canvas');
    ctx = canvas.getContext('2d');

    fetch('data/scenario.json', { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status + ' fetching data/scenario.json');
        return r.json();
      })
      .then(function (data) {
        state.scenario = data;
        return Sprites.init();
      })
      .then(function () {
        World.build(state.scenario);

        // Risk is computed ONCE, up front - needed to know the priority point,
        // but never shown until the result screen.
        const ctx2 = { today: state.scenario.meta.game_today, village: state.scenario.village };
        const ranked = EcoRisk.rankByRisk(state.scenario.points, ctx2);
        ranked.forEach(function (r) { state.risks[r.point.id] = r.risk; });
        state.priorityId = ranked[0].point.id;

        state.scenario.points.forEach(function (p) { state.inspected[p.id] = false; });

        bindEvents();
        UI.applyStaticLang();
        UI.renderTitle(state.scenario);
        UI.renderMinimapLegend();
        setDisclaimers();

        document.getElementById('boot').hidden = true;
        show('title');
        requestAnimationFrame(frame);
      })
      .catch(function (err) {
        const b = document.getElementById('boot');
        b.innerHTML =
          '<div class="boot-inner boot-error">' +
          '<h2>Could not start</h2>' +
          '<p>' + UI.esc(err.message) + '</p>' +
          '<ol>' +
          '<li>Run <code>python prepare_data.py</code> to generate <code>data/scenario.json</code>.</li>' +
          '<li>Serve the folder: <code>python -m http.server</code>, then open ' +
          '<code>http://localhost:8000</code>. Opening index.html straight off disk will not ' +
          'work, because browsers block local file reads.</li>' +
          '</ol></div>';
      });
  }

  function setDisclaimers() {
    const d = state.scenario.meta.disclaimer;
    ['#disclaimer-game', '#disclaimer-result'].forEach(function (s) {
      const n = document.querySelector(s);
      if (n) n.textContent = d;
    });
  }

  /* =======================================================================
     SCREENS
     ======================================================================= */
  function show(name) {
    state.screen = name;
    ['title', 'select', 'game', 'result'].forEach(function (s) {
      const n = document.getElementById('screen-' + s);
      if (n) n.classList.toggle('is-active', s === name);
    });
    if (name === 'game') {
      resize();
      UI.Audio.resume();
    }
  }

  /* =======================================================================
     START / RESET A MISSION
     ======================================================================= */
  function startMission() {
    const w = World.data;

    state.running = true;
    state.time = 0;
    state.phase = 1;
    state.phaseElapsed = 0;
    state.timeRemaining = RULES.PHASES * RULES.PHASE_SECONDS;
    state.villagePrepared = false;
    state.villageLost = false;
    state.timeUp = false;
    state.won = false;
    state.ended = false;
    state.whyShown = false;
    state.action = null;
    state.nearTarget = null;
    state.villagersAlerted = false;
    state.priorityInspected = false;

    Object.keys(state.inspected).forEach(function (k) { state.inspected[k] = false; });
    w.points.forEach(function (p) { p.inspected = false; });
    w.villagers.forEach(function (v) {
      v.x = v.homeX; v.y = v.homeY; v.running = false;
    });

    // The player starts at the village - that is their base.
    state.player = PlayerMod.create(state.character, w.villageX, w.villageY + 70);

    Fire.reset(w, state.scenario.fire.dryness.score);
    UI.Audio.stopFire();

    UI.hideInfo();
    UI.hideDoing();
    UI.hidePrompt();
    UI.renderObjectives(state);
    UI.renderPhase(state);
    show('game');
  }

  /* =======================================================================
     INPUT
     ======================================================================= */
  function bindEvents() {
    document.getElementById('btn-to-select').addEventListener('click', function () {
      UI.Audio.resume();
      UI.renderCharacterSelect(pickCharacter, state.character && state.character.id);
      show('select');
    });

    document.getElementById('btn-begin').addEventListener('click', function () {
      if (!state.character) return;
      startMission();
    });

    document.getElementById('btn-replay').addEventListener('click', startMission);
    document.getElementById('btn-change-char').addEventListener('click', function () {
      UI.renderCharacterSelect(pickCharacter, state.character && state.character.id);
      show('select');
    });

    document.getElementById('btn-why').addEventListener('click', function () {
      state.whyShown = true;
      UI.renderResult(state, state.scenario);
    });

    document.getElementById('btn-about').addEventListener('click', function () {
      UI.openModal('about', state.scenario);
    });
    document.getElementById('btn-roadmap').addEventListener('click', function () {
      UI.openModal('roadmap', state.scenario);
    });
    document.getElementById('modal-close').addEventListener('click', UI.closeModal);
    document.getElementById('modal').addEventListener('click', function (e) {
      if (e.target.dataset.close) UI.closeModal();
    });
    document.getElementById('info-close').addEventListener('click', UI.hideInfo);

    document.getElementById('lang-en').addEventListener('click', function () { setLang('en'); });
    document.getElementById('lang-km').addEventListener('click', function () { setLang('km'); });

    document.getElementById('btn-mute').addEventListener('click', toggleMute);

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', resize);
    window.addEventListener('blur', function () {
      // Dropping keys on blur stops the player sliding away while tabbed out.
      for (const k in keys) keys[k] = false;
      input.x = input.y = 0;
    });

    setupTouch();
  }

  function setLang(l) {
    UI.setLang(l);
    UI.applyStaticLang();
    UI.renderTitle(state.scenario);
    UI.renderMinimapLegend();
    if (state.screen === 'select') {
      UI.renderCharacterSelect(pickCharacter, state.character && state.character.id);
    }
    if (state.screen === 'result') UI.renderResult(state, state.scenario);
    UI.renderObjectives(state);
  }

  function toggleMute() {
    state.muted = !state.muted;
    UI.Audio.setMuted(state.muted);
    document.getElementById('mute-icon').textContent = state.muted ? '🔇' : '🔊';
    document.getElementById('btn-mute').setAttribute('aria-pressed', state.muted ? 'true' : 'false');
  }

  function pickCharacter(ch) {
    state.character = ch;
    UI.renderCharacterSelect(pickCharacter, ch.id);
    document.getElementById('btn-begin').disabled = false;
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') { UI.closeModal(); UI.hideInfo(); return; }
    keys[e.key.toLowerCase()] = true;
    if (e.key.toLowerCase() === 'e' && !input.interact) input.interactEdge = true;
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].indexOf(e.key.toLowerCase()) >= 0) {
      if (state.screen === 'game') e.preventDefault();
    }
    readKeys();
  }
  function onKeyUp(e) {
    keys[e.key.toLowerCase()] = false;
    readKeys();
  }
  function readKeys() {
    let x = 0, y = 0;
    if (keys.a || keys.arrowleft) x -= 1;
    if (keys.d || keys.arrowright) x += 1;
    if (keys.w || keys.arrowup) y -= 1;
    if (keys.s || keys.arrowdown) y += 1;
    if (!touchActive) { input.x = x; input.y = y; }
    input.interact = !!keys.e;
  }

  /* ---------- touch: on-screen stick + action button ---------- */
  let touchActive = false;
  function setupTouch() {
    const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    if (!isTouch) return;
    const stick = document.getElementById('stick');
    const knob = document.getElementById('stick-knob');
    const act = document.getElementById('touch-action');
    stick.hidden = false;
    act.hidden = false;
    document.getElementById('controls-hint').hidden = true;

    let id = null, cx = 0, cy = 0;
    const R = 46;

    function start(e) {
      const t = e.changedTouches[0];
      id = t.identifier;
      const r = stick.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      touchActive = true;
      move(e);
    }
    function move(e) {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier !== id) continue;
        let dx = t.clientX - cx, dy = t.clientY - cy;
        const len = Math.hypot(dx, dy) || 1;
        const clamped = Math.min(len, R);
        knob.style.transform = 'translate(' + (dx / len * clamped) + 'px,' +
          (dy / len * clamped) + 'px)';
        input.x = dx / len * (clamped / R);
        input.y = dy / len * (clamped / R);
      }
      e.preventDefault();
    }
    function end() {
      id = null; touchActive = false;
      input.x = input.y = 0;
      knob.style.transform = 'translate(0,0)';
    }
    stick.addEventListener('touchstart', start, { passive: false });
    stick.addEventListener('touchmove', move, { passive: false });
    stick.addEventListener('touchend', end);
    stick.addEventListener('touchcancel', end);

    act.addEventListener('touchstart', function (e) {
      input.interact = true; input.interactEdge = true;
      e.preventDefault();
    }, { passive: false });
    act.addEventListener('touchend', function () { input.interact = false; });
  }

  /* =======================================================================
     CANVAS SIZE
     ======================================================================= */
  function resize() {
    const stage = document.getElementById('stage');
    if (!stage) return;
    const r = stage.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(320, Math.floor(r.width * dpr));
    canvas.height = Math.max(240, Math.floor(r.height * dpr));
    canvas.style.width = r.width + 'px';
    canvas.style.height = r.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    state.cam.w = r.width;
    state.cam.h = r.height;
  }

  /* =======================================================================
     THE LOOP
     ======================================================================= */
  function frame(ts) {
    const now = ts / 1000;
    let dt = lastT ? now - lastT : 0;
    lastT = now;
    // Clamp dt so a background tab or a long GC pause cannot teleport the
    // player across the map or skip the fire forward.
    if (dt > 0.05) dt = 0.05;

    if (state.screen === 'game' && state.running) {
      update(dt);
      render();
    }
    requestAnimationFrame(frame);
  }

  /* =======================================================================
     UPDATE
     ======================================================================= */
  function update(dt) {
    const w = World.data;
    state.time += dt;
    state.timeRemaining = Math.max(0, RULES.PHASES * RULES.PHASE_SECONDS - state.time);

    /* ---- phases ---- */
    state.phaseElapsed += dt;
    if (state.phaseElapsed >= state.phaseLength && state.phase < RULES.PHASES) {
      state.phaseElapsed -= state.phaseLength;
      state.phase++;
      UI.Audio.blip(330, 0.3, 'sine', 0.08);
    }

    /* ---- the fire ignites at the real hotspot ---- */
    if (!Fire.data.started && state.time >= RULES.FIRE_START_DELAY) {
      const f = state.scenario.fire;
      const fx = World.lonToX(f.origin_lon);
      const fy = World.latToY(f.origin_lat);
      const i = World.subIndexAt(fx, fy);
      Fire.ignite(i);
      UI.Audio.startFire();
    }

    /* ---- player ---- */
    PlayerMod.update(state.player, dt, input, w);
    if (state.player.moving && !state.player.busy) {
      stepSoundTimer -= dt;
      if (stepSoundTimer <= 0) {
        UI.Audio.step();
        stepSoundTimer = 0.30;
      }
    }

    /* ---- camera follows, clamped to the world ---- */
    const cam = state.cam;
    cam.x = clamp(state.player.x - cam.w / 2, 0, Math.max(0, w.widthPx - cam.w));
    cam.y = clamp(state.player.y - cam.h / 2, 0, Math.max(0, w.heightPx - cam.h));

    /* ---- fire sim ---- */
    Fire.update(dt, cam);

    /* ---- fire audio level by proximity ---- */
    if (Fire.data.started) {
      const d = Fire.distanceToFire(state.player.x, state.player.y);
      UI.Audio.setFireLevel(d < 900 ? 0.22 * (1 - d / 900) : 0);
    }

    /* ---- villagers ---- */
    updateVillagers(dt, w);

    /* ---- interactions ---- */
    updateInteraction(dt, w);

    /* ---- loss conditions ---- */
    if (!state.villageLost &&
        Fire.reached(w.villageX, w.villageY, RULES.VILLAGE_LOSS_RADIUS)) {
      state.villageLost = true;
      UI.renderObjectives(state);
    }

    if (state.time >= RULES.PHASES * RULES.PHASE_SECONDS) {
      state.timeUp = true;
    }

    checkEnd();

    /* ---- HUD ---- */
    UI.renderPhase(state);
  }

  let stepSoundTimer = 0;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function updateVillagers(dt, w) {
    const gatherNow = state.villagePrepared;
    if (gatherNow && !state.villagersAlerted) state.villagersAlerted = true;

    w.villagers.forEach(function (v, i) {
      if (gatherNow) {
        const tx = w.gatherX + Math.cos(i * 1.7) * 22;
        const ty = w.gatherY + Math.sin(i * 1.7) * 13;
        const dx = tx - v.x, dy = ty - v.y;
        const d = Math.hypot(dx, dy);
        if (d > 2) {
          const sp = 52;
          v.x += (dx / d) * sp * dt;
          v.y += (dy / d) * sp * dt;
          v.running = true;
        } else {
          v.running = false;
        }
      } else {
        // Idle shuffle around home.
        v.phase += dt * 0.7;
        v.x = v.homeX + Math.sin(v.phase) * 4;
        v.y = v.homeY + Math.cos(v.phase * 0.7) * 2;
        v.running = false;
      }
    });
  }

  /* -----------------------------------------------------------------------
     What is the player standing next to, and what happens when they press E
     ----------------------------------------------------------------------- */
  function updateInteraction(dt, w) {
    const p = state.player;

    // An action in progress continues until done or interrupted by moving.
    if (state.action) {
      const a = state.action;
      a.elapsed += dt;
      UI.showDoing(a.label, Math.min(1, a.elapsed / a.needed));
      if (a.elapsed >= a.needed) {
        finishAction(a);
      }
      return;
    }

    // Find the nearest interactable within reach.
    let best = null, bestD = Infinity;
    w.points.forEach(function (pt) {
      const d = Math.hypot(p.x - pt.x, p.y - pt.y);
      if (d < bestD) { bestD = d; best = { kind: 'point', ref: pt, d: d }; }
    });
    const vd = Math.hypot(p.x - w.villageX, p.y - w.villageY);
    if (vd < bestD) { bestD = vd; best = { kind: 'village', d: vd }; }

    state.nearTarget = (best && bestD <= RULES.INTERACT_RADIUS) ? best : null;

    if (!state.nearTarget) {
      UI.hidePrompt();
      UI.hideDoing();
      input.interactEdge = false;
      return;
    }

    UI.hideDoing();
    const nt = state.nearTarget;
    if (nt.kind === 'point') {
      if (nt.ref.inspected) UI.showPrompt(UI.t('promptInspected'), 'E');
      else UI.showPrompt(UI.t('promptInspect', { id: nt.ref.id }), 'E');
    } else {
      if (state.villagePrepared) UI.showPrompt(UI.t('promptPrepared'), 'E');
      else UI.showPrompt(UI.t('promptPrepare'), 'E');
    }

    if (input.interactEdge) {
      input.interactEdge = false;
      beginAction(nt);
    }
  }

  function beginAction(nt) {
    const perk = state.character.perk;
    if (nt.kind === 'point') {
      if (nt.ref.inspected) {
        // Already done - just reopen the panel, free of charge.
        UI.showHeatPointInfo(nt.ref, state.scenario, state.character, state.player);
        return;
      }
      state.action = {
        kind: 'inspect',
        ref: nt.ref,
        elapsed: 0,
        needed: RULES.INSPECT_SECONDS * (perk.inspectMul || 1),
        label: UI.t('doingInspect', { id: nt.ref.id })
      };
    } else {
      if (state.villagePrepared) return;
      state.action = {
        kind: 'prepare',
        elapsed: 0,
        needed: RULES.PREPARE_SECONDS * (perk.prepareMul || 1),
        label: UI.t('doingPrepare')
      };
    }
    state.player.busy = true;
    state.player.busyT = 0;
    UI.hidePrompt();
    UI.Audio.blip(520, 0.12, 'square', 0.05);
  }

  function finishAction(a) {
    state.player.busy = false;
    state.action = null;
    UI.hideDoing();

    if (a.kind === 'inspect') {
      a.ref.inspected = true;
      state.inspected[a.ref.id] = true;
      if (a.ref.id === state.priorityId) state.priorityInspected = true;
      UI.showHeatPointInfo(a.ref, state.scenario, state.character, state.player);
      UI.Audio.blip(700, 0.22, 'triangle', 0.09);
    } else {
      state.villagePrepared = true;
      UI.Audio.blip(440, 0.3, 'triangle', 0.1);
    }
    UI.renderObjectives(state);
    checkEnd();
  }

  /* =======================================================================
     WIN / LOSE
     -----------------------------------------------------------------------
     Win  = priority point inspected AND village prepared, both BEFORE the
            fire reaches the village and before time runs out.
     Lose = time ran out, or the fire got there first, with work outstanding.
     ======================================================================= */
  function checkEnd() {
    if (state.ended) return;

    const objectivesDone = state.priorityInspected && state.villagePrepared;

    if (objectivesDone && !state.villageLost) {
      endMission(true);
      return;
    }
    if (state.villageLost || state.timeUp) {
      endMission(false);
    }
  }

  function endMission(won) {
    state.ended = true;
    state.won = won;
    state.running = false;
    state.action = null;
    if (state.player) state.player.busy = false;

    UI.hidePrompt();
    UI.hideDoing();
    UI.hideInfo();
    UI.Audio.setFireLevel(0);
    UI.Audio.stopFire();
    if (won) UI.Audio.success(); else UI.Audio.failure();

    // Small delay so the last frame of action is visible before the screen
    // swaps - it reads much better on a recording.
    setTimeout(function () {
      UI.renderResult(state, state.scenario);
      show('result');
    }, 900);
  }

  /* =======================================================================
     RENDER
     ======================================================================= */
  function render() {
    const w = World.data;
    const cam = state.cam;

    ctx.clearRect(0, 0, cam.w, cam.h);

    /* ---- ground ---- */
    World.drawGround(ctx, cam, Fire);

    /* ---- sparks on cells about to ignite ---- */
    Fire.drawSparks(ctx, cam, state.time);

    /* ---- footstep dust sits under everything else ---- */
    PlayerMod.drawDust(ctx, state.player, cam);

    /* ---- depth-sorted sprite pass -------------------------------------
       Everything with a footprint goes into one list sorted by world Y, so
       the player walks behind things that are further down the screen.    */
    const items = [];
    World.collectTrees(items, cam, Fire);

    w.houses.forEach(function (h) {
      items.push({ kind: 'house', x: h.x, y: h.y });
    });
    w.villagers.forEach(function (v) {
      items.push({ kind: 'villager', x: v.x, y: v.y, running: v.running });
    });
    w.points.forEach(function (pt) {
      items.push({ kind: 'heat', x: pt.x, y: pt.y, ref: pt });
    });
    items.push({ kind: 'player', x: state.player.x, y: state.player.y });

    items.sort(function (a, b) { return a.y - b.y; });

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.x < cam.x - 80 || it.x > cam.x + cam.w + 80 ||
          it.y < cam.y - 120 || it.y > cam.y + cam.h + 120) continue;

      if (it.kind === 'tree') {
        const img = Sprites.tree(it.state, it.t.variant);
        const sway = Math.sin(state.time * 1.5 + it.t.phase) * 1.6;
        const sw = img.width * it.t.scale, sh = img.height * it.t.scale;
        ctx.drawImage(img, Math.round(it.x - cam.x - sw / 2 + sway),
          Math.round(it.y - cam.y - sh), sw, sh);

      } else if (it.kind === 'house') {
        const img = Sprites.house(state.villagePrepared);
        ctx.drawImage(img, Math.round(it.x - cam.x - img.width / 2),
          Math.round(it.y - cam.y - img.height));

      } else if (it.kind === 'villager') {
        const img = Sprites.villager(it.running);
        ctx.drawImage(img, Math.round(it.x - cam.x - img.width / 2),
          Math.round(it.y - cam.y - img.height));

      } else if (it.kind === 'heat') {
        drawHeatMarker(it.ref, cam);

      } else {
        PlayerMod.draw(ctx, state.player, cam);
      }
    }

    /* ---- fire on top of the world ---- */
    Fire.drawGlow(ctx, cam);
    Fire.drawParticles(ctx, cam);

    /* ---- phase sky tint: the light shifts as the day wears on ---- */
    drawPhaseTint(cam);

    /* ---- interaction ring under the player's current target ---- */
    if (state.nearTarget) drawTargetRing(cam);

    /* ---- HUD bits that live on the canvas ---- */
    UI.renderMinimap(state, w, state.player);
  }

  /** Heat points pulse, and are revealed within the character's sight range.
   *  The Data Scout sees them from twice as far. */
  function drawHeatMarker(pt, cam) {
    const p = state.player;
    const reveal = RULES.BASE_REVEAL * (state.character.perk.revealMul || 1);
    const d = Math.hypot(p.x - pt.x, p.y - pt.y);
    if (d > reveal) return;

    // Fade in over the last 60px of the reveal range.
    const alpha = Math.min(1, (reveal - d) / 60);
    const x = pt.x - cam.x, y = pt.y - cam.y;
    const pulse = 0.6 + 0.4 * Math.sin(state.time * 3.4);

    ctx.save();
    ctx.globalAlpha = alpha;

    // glow
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 0, x, y, 34 + pulse * 10);
    const col = pt.inspected ? '150,170,158' : '255,90,60';
    g.addColorStop(0, 'rgba(' + col + ',0.55)');
    g.addColorStop(1, 'rgba(' + col + ',0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, 34 + pulse * 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalCompositeOperation = 'source-over';
    // ring
    ctx.strokeStyle = pt.inspected ? 'rgba(200,214,205,.85)' : 'rgba(255,255,255,.92)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, Math.PI * 2);
    ctx.stroke();
    // body
    ctx.fillStyle = pt.inspected ? '#4a5750' : '#d02b31';
    ctx.beginPath();
    ctx.arc(x, y, 11, 0, Math.PI * 2);
    ctx.fill();
    // letter
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pt.id, x, y + 0.5);
    ctx.restore();
  }

  function drawTargetRing(cam) {
    const nt = state.nearTarget;
    const w = World.data;
    const x = (nt.kind === 'point' ? nt.ref.x : w.villageX) - cam.x;
    const y = (nt.kind === 'point' ? nt.ref.y : w.villageY) - cam.y;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.setLineDash([5, 5]);
    ctx.lineDashOffset = -state.time * 22;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y + 6, RULES.INTERACT_RADIUS * 0.8, RULES.INTERACT_RADIUS * 0.45,
      0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /** Phase 1 bright, phase 2 warmer, phase 3 dusk. Plus a dry haze over the
   *  cleared/edge land so the dry area reads as dry. */
  function drawPhaseTint(cam) {
    const tints = [
      'rgba(255,240,190,0.00)',
      'rgba(255,170,90,0.10)',
      'rgba(90,70,130,0.20)'
    ];
    const t = tints[Math.min(2, state.phase - 1)];
    if (t === tints[0]) return;
    ctx.save();
    ctx.fillStyle = t;
    ctx.fillRect(0, 0, cam.w, cam.h);
    ctx.restore();
  }

  /* Expose for debugging and for the automated tests. */
  window.EcoGame = {
    state: state,
    RULES: RULES,
    start: startMission,
    show: show,
    pickCharacter: pickCharacter,
    input: input,
    update: update,
    endMission: endMission,
    checkEnd: checkEnd
  };

  boot();
})();
