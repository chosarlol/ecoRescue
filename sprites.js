/* =========================================================================
   EcoRescue Cambodia - sprites.js
   =========================================================================

   Every sprite in this game is DRAWN AT RUNTIME onto small offscreen canvases,
   so the game needs no image files at all. Each sprite is rendered once at
   boot and then blitted with drawImage(), which is far faster than re-running
   path operations every frame.

   DROPPING IN REAL PIXEL ART LATER
   --------------------------------
   Put sheets in assets/ and fill in the SHEETS manifest below. At boot we try
   to load each one; anything that loads replaces the procedural version, and
   anything missing or broken silently keeps the drawn fallback. So the game
   always runs, with or without art.

   Coordinates: every sprite is drawn with its ORIGIN AT THE BOTTOM CENTRE
   (the character's feet, the base of a tree trunk), because that is what you
   want for depth-sorting in a top-down view.
   ========================================================================= */

(function (global) {
  'use strict';

  /* -----------------------------------------------------------------------
     Sprite-sheet manifest. Empty `src` = use the procedural drawing.
     Fill `src` in to override with real art.
     ----------------------------------------------------------------------- */
  const SHEETS = {
    player_ranger:   { src: '', frameW: 24, frameH: 32, rows: 4, cols: 4 },
    player_scout:    { src: '', frameW: 24, frameH: 32, rows: 4, cols: 4 },
    player_liaison:  { src: '', frameW: 24, frameH: 32, rows: 4, cols: 4 },
    tree:            { src: '', frameW: 32, frameH: 40, rows: 1, cols: 3 },
    house:           { src: '', frameW: 40, frameH: 36, rows: 1, cols: 2 },
    villager:        { src: '', frameW: 16, frameH: 22, rows: 1, cols: 2 }
  };

  /* Character definitions. `perk` is applied in player.js / main.js. */
  const CHARACTERS = [
    {
      id: 'ranger',
      nameKey: 'charRanger',
      descKey: 'charRangerDesc',
      skin: '#c98d5a', shirt: '#2f7d4f', trouser: '#2b3a2f', hat: '#1f5c3a',
      perk: { speed: 1.28, revealMul: 1.0, inspectMul: 1.0, prepareMul: 1.0 }
    },
    {
      id: 'scout',
      nameKey: 'charScout',
      descKey: 'charScoutDesc',
      skin: '#8d5a3c', shirt: '#2d6ea8', trouser: '#24323f', hat: '#1b4e78',
      perk: { speed: 1.0, revealMul: 2.0, inspectMul: 1.0, prepareMul: 1.0, extraDetail: true }
    },
    {
      id: 'liaison',
      nameKey: 'charLiaison',
      descKey: 'charLiaisonDesc',
      skin: '#a8703f', shirt: '#b3542f', trouser: '#3a2b24', hat: '#8c3f22',
      perk: { speed: 1.0, revealMul: 1.0, inspectMul: 1.0, prepareMul: 0.45 }
    }
  ];

  const store = {};        // name -> canvas or array of canvases
  let loadedSheets = {};   // name -> HTMLImageElement, when real art is present

  /* -----------------------------------------------------------------------
     Canvas helpers
     ----------------------------------------------------------------------- */
  function make(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    return { c: c, x: x };
  }

  /** Fill one "pixel" - the whole look is built from these blocks. */
  function px(x, cx, cy, w, h, color) {
    x.fillStyle = color;
    x.fillRect(cx, cy, w, h);
  }

  /** Deterministic pseudo-random, so the world looks the same every run. */
  let seed = 1337;
  function rnd() {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  }
  function setSeed(s) { seed = s >>> 0; }

  /* -----------------------------------------------------------------------
     PLAYER - 4 directions x 4 walk frames
     Row order: 0 down, 1 left, 2 right, 3 up
     ----------------------------------------------------------------------- */
  function drawPlayerFrame(x, ch, dir, frame) {
    const W = 24, H = 32;
    // Walk cycle: legs swing on frames 1 and 3, body bobs 1px.
    const swing = (frame === 1) ? 1 : (frame === 3) ? -1 : 0;
    const bob = (frame % 2 === 1) ? 1 : 0;
    const topY = 4 + bob;

    // shadow
    x.fillStyle = 'rgba(0,0,0,.28)';
    x.beginPath();
    x.ellipse(W / 2, H - 2, 7, 3, 0, 0, Math.PI * 2);
    x.fill();

    // legs
    px(x, 8, 22 + bob, 3, 8 + swing, ch.trouser);
    px(x, 13, 22 + bob, 3, 8 - swing, ch.trouser);
    // boots
    px(x, 8, 29 + bob + swing, 3, 2, '#1a1410');
    px(x, 13, 29 + bob - swing, 3, 2, '#1a1410');

    // torso
    px(x, 7, 13 + bob, 10, 10, ch.shirt);
    // a lighter vest stripe so the character reads at small size
    px(x, 10, 13 + bob, 4, 10, 'rgba(255,255,255,.14)');

    // arms - swing opposite to legs
    if (dir === 1) {        // facing left
      px(x, 5, 14 + bob - swing, 3, 7, ch.shirt);
    } else if (dir === 2) { // facing right
      px(x, 16, 14 + bob - swing, 3, 7, ch.shirt);
    } else {
      px(x, 4, 14 + bob - swing, 3, 7, ch.shirt);
      px(x, 17, 14 + bob + swing, 3, 7, ch.shirt);
    }

    // head
    px(x, 8, topY + 1, 8, 8, ch.skin);
    // hat / cap
    px(x, 7, topY, 10, 3, ch.hat);
    px(x, 6, topY + 2, 12, 1, ch.hat);

    // face, only when not facing away
    if (dir !== 3) {
      if (dir === 1) {
        px(x, 9, topY + 4, 2, 2, '#241a12');
      } else if (dir === 2) {
        px(x, 13, topY + 4, 2, 2, '#241a12');
      } else {
        px(x, 9, topY + 4, 2, 2, '#241a12');
        px(x, 13, topY + 4, 2, 2, '#241a12');
      }
    }
  }

  function buildPlayer(ch) {
    const W = 24, H = 32;
    const frames = [];
    for (let dir = 0; dir < 4; dir++) {
      const row = [];
      for (let f = 0; f < 4; f++) {
        const g = make(W, H);
        drawPlayerFrame(g.x, ch, dir, f);
        row.push(g.c);
      }
      frames.push(row);
    }
    return frames;
  }

  /* -----------------------------------------------------------------------
     TREES - 3 variants x 4 states (healthy, scorched, burning-tint, burnt)
     ----------------------------------------------------------------------- */
  const TREE_STATES = ['healthy', 'scorched', 'ember', 'burnt'];

  function treePalette(state) {
    switch (state) {
      case 'scorched': return { canopy: ['#7a7a2e', '#6d6a26'], trunk: '#4a3524' };
      case 'ember':    return { canopy: ['#8a4a1c', '#7a3c16'], trunk: '#3a2416' };
      case 'burnt':    return { canopy: ['#3a342c', '#332e28'], trunk: '#241d18' };
      default:         return { canopy: ['#1f7a4d', '#176b43'], trunk: '#4a3524' };
    }
  }

  function buildTree(variant, state) {
    const W = 32, H = 40;
    const g = make(W, H);
    const x = g.x;
    const pal = treePalette(state);
    const cx = W / 2;

    // ground shadow
    x.fillStyle = 'rgba(0,0,0,.25)';
    x.beginPath();
    x.ellipse(cx, H - 3, 8, 3.2, 0, 0, Math.PI * 2);
    x.fill();

    // trunk
    px(x, cx - 2, H - 14, 4, 12, pal.trunk);
    px(x, cx - 2, H - 14, 1, 12, 'rgba(255,255,255,.08)');

    // canopy - three stacked blobs, size varies by variant
    const sizes = variant === 0 ? [11, 8.5, 6]
      : variant === 1 ? [9.5, 7.5, 5]
        : [12, 9, 6.5];
    const ys = [H - 18, H - 25, H - 31];
    for (let i = 0; i < 3; i++) {
      x.fillStyle = pal.canopy[i % 2];
      x.beginPath();
      x.arc(cx, ys[i], sizes[i], 0, Math.PI * 2);
      x.fill();
    }
    // highlight on the sunlit side
    if (state !== 'burnt') {
      x.fillStyle = 'rgba(255,255,255,.10)';
      x.beginPath();
      x.arc(cx - 3, ys[1] - 2, sizes[1] * 0.55, 0, Math.PI * 2);
      x.fill();
    }
    return g.c;
  }

  /* -----------------------------------------------------------------------
     HOUSE - normal and prepared (lit, with a banner)
     ----------------------------------------------------------------------- */
  function buildHouse(prepared) {
    const W = 40, H = 38;
    const g = make(W, H);
    const x = g.x;

    x.fillStyle = 'rgba(0,0,0,.3)';
    x.beginPath();
    x.ellipse(W / 2, H - 3, 15, 4, 0, 0, Math.PI * 2);
    x.fill();

    // stilts - Cambodian rural houses are commonly raised
    px(x, 8, H - 12, 3, 9, '#3f2d1f');
    px(x, 29, H - 12, 3, 9, '#3f2d1f');

    // body
    px(x, 6, H - 22, 28, 12, '#8a6440');
    px(x, 6, H - 22, 28, 2, 'rgba(255,255,255,.10)');
    // planks
    for (let i = 0; i < 4; i++) px(x, 8 + i * 7, H - 21, 1, 10, 'rgba(0,0,0,.18)');

    // roof
    x.fillStyle = prepared ? '#9a5a33' : '#6f4228';
    x.beginPath();
    x.moveTo(2, H - 21);
    x.lineTo(W / 2, H - 33);
    x.lineTo(38, H - 21);
    x.closePath();
    x.fill();
    x.fillStyle = 'rgba(255,255,255,.10)';
    x.beginPath();
    x.moveTo(2, H - 21);
    x.lineTo(W / 2, H - 33);
    x.lineTo(W / 2, H - 21);
    x.closePath();
    x.fill();

    // door
    px(x, 18, H - 18, 5, 8, '#3f2d1f');

    if (prepared) {
      // warm window light + a green readiness banner
      px(x, 10, H - 19, 5, 4, '#ffd98a');
      px(x, 26, H - 19, 5, 4, '#ffd98a');
      px(x, 6, H - 25, 28, 3, '#42a878');
      px(x, 6, H - 25, 28, 1, 'rgba(255,255,255,.35)');
    } else {
      px(x, 10, H - 19, 5, 4, '#2b2117');
      px(x, 26, H - 19, 5, 4, '#2b2117');
    }
    return g.c;
  }

  /* -----------------------------------------------------------------------
     VILLAGER - idle and running
     ----------------------------------------------------------------------- */
  function buildVillager(running) {
    const W = 16, H = 22;
    const g = make(W, H);
    const x = g.x;
    x.fillStyle = 'rgba(0,0,0,.25)';
    x.beginPath();
    x.ellipse(W / 2, H - 2, 5, 2, 0, 0, Math.PI * 2);
    x.fill();

    const lean = running ? 1 : 0;
    px(x, 5 + lean, 14, 2, 6, '#2f3a2c');          // legs
    px(x, 9 + lean, 14, 2, running ? 4 : 6, '#2f3a2c');
    px(x, 4 + lean, 8, 8, 7, '#c2552f');           // torso
    px(x, 5 + lean, 2, 6, 6, '#b2793f');           // head
    px(x, 4 + lean, 1, 8, 2, '#6b4426');           // hair
    if (running) px(x, 12, 8, 3, 2, '#c2552f');    // outstretched arm
    return g.c;
  }

  /* -----------------------------------------------------------------------
     Optional real-art loading
     ----------------------------------------------------------------------- */
  function tryLoadSheets() {
    const names = Object.keys(SHEETS).filter(function (n) { return SHEETS[n].src; });
    if (!names.length) return Promise.resolve();
    return Promise.all(names.map(function (n) {
      return new Promise(function (resolve) {
        const img = new Image();
        img.onload = function () { loadedSheets[n] = img; resolve(); };
        img.onerror = function () { resolve(); };   // keep the drawn fallback
        img.src = 'assets/' + SHEETS[n].src;
      });
    }));
  }

  /** Slice a loaded sheet into a 2D array of canvases, matching the
   *  procedural layout so the rest of the game cannot tell the difference. */
  function sliceSheet(name) {
    const img = loadedSheets[name];
    const m = SHEETS[name];
    const out = [];
    for (let r = 0; r < m.rows; r++) {
      const row = [];
      for (let c = 0; c < m.cols; c++) {
        const g = make(m.frameW, m.frameH);
        g.x.drawImage(img, c * m.frameW, r * m.frameH, m.frameW, m.frameH,
          0, 0, m.frameW, m.frameH);
        row.push(g.c);
      }
      out.push(row);
    }
    return out;
  }

  /* -----------------------------------------------------------------------
     Build everything
     ----------------------------------------------------------------------- */
  function init() {
    return tryLoadSheets().then(function () {
      CHARACTERS.forEach(function (ch) {
        const key = 'player_' + ch.id;
        store[key] = loadedSheets[key] ? sliceSheet(key) : buildPlayer(ch);
      });

      store.tree = {};
      TREE_STATES.forEach(function (st) {
        store.tree[st] = [0, 1, 2].map(function (v) { return buildTree(v, st); });
      });

      store.house = loadedSheets.house
        ? sliceSheet('house')[0]
        : [buildHouse(false), buildHouse(true)];

      store.villager = loadedSheets.villager
        ? sliceSheet('villager')[0]
        : [buildVillager(false), buildVillager(true)];

      return true;
    });
  }

  function player(charId, dir, frame) {
    const set = store['player_' + charId] || store.player_ranger;
    return set[dir % 4][frame % 4];
  }
  function tree(state, variant) {
    const set = store.tree[state] || store.tree.healthy;
    return set[variant % set.length];
  }
  function house(prepared) { return store.house[prepared ? 1 : 0]; }
  function villager(running) { return store.villager[running ? 1 : 0]; }

  global.Sprites = {
    init: init,
    CHARACTERS: CHARACTERS,
    TREE_STATES: TREE_STATES,
    player: player,
    tree: tree,
    house: house,
    villager: villager,
    rnd: rnd,
    setSeed: setSeed,
    make: make
  };
})(window);
