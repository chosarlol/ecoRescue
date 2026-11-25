/* =========================================================================
   EcoRescue Cambodia - player.js
   =========================================================================
   Movement, the 4-direction walk cycle, footstep dust, and the short
   "inspecting" pose. The player holds no game rules: what an interaction
   DOES lives in main.js, so this file stays about motion and drawing.
   ========================================================================= */

(function (global) {
  'use strict';

  const BASE_SPEED = 132;      // world px per second, before the character perk
  const FRAME_TIME = 0.14;     // seconds per walk frame

  function create(character, x, y) {
    return {
      character: character,
      x: x, y: y,
      vx: 0, vy: 0,
      dir: 0,                  // 0 down, 1 left, 2 right, 3 up
      frame: 0,
      frameT: 0,
      moving: false,
      busy: false,             // true while inspecting / preparing
      busyT: 0,
      bobT: 0,
      dust: []                 // footstep puffs
    };
  }

  /** Axis-aligned input vector in -1..1, from keys or the on-screen stick. */
  function update(p, dt, input, world) {
    let dx = 0, dy = 0;
    if (!p.busy) {
      dx = input.x;
      dy = input.y;
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }      // no diagonal speed bonus
    }

    const speed = BASE_SPEED * (p.character.perk.speed || 1);
    p.vx = dx * speed;
    p.vy = dy * speed;
    p.moving = (dx !== 0 || dy !== 0);

    // Face the dominant axis.
    if (p.moving) {
      if (Math.abs(dx) > Math.abs(dy)) p.dir = dx < 0 ? 1 : 2;
      else p.dir = dy < 0 ? 3 : 0;
    }

    // Move, then clamp to the world. There are no solid obstacles in Mission 1
    // (the forest is walkable), only the world edges.
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const m = 12;
    p.x = Math.max(m, Math.min(world.widthPx - m, p.x));
    p.y = Math.max(m, Math.min(world.heightPx - m, p.y));

    // Walk animation.
    if (p.moving) {
      p.frameT += dt;
      if (p.frameT >= FRAME_TIME) {
        p.frameT -= FRAME_TIME;
        p.frame = (p.frame + 1) % 4;
        // A puff of dust on the two "footfall" frames.
        if (p.frame === 1 || p.frame === 3) spawnDust(p);
      }
    } else {
      p.frame = 0;
      p.frameT = 0;
    }

    if (p.busy) p.busyT += dt;
    p.bobT += dt;

    // Age the dust puffs.
    for (let i = p.dust.length - 1; i >= 0; i--) {
      const d = p.dust[i];
      d.t += dt;
      d.y -= 6 * dt;
      d.r += 9 * dt;
      if (d.t >= d.life) p.dust.splice(i, 1);
    }
  }

  function spawnDust(p) {
    if (p.dust.length > 14) return;
    p.dust.push({
      x: p.x + (Math.random() - 0.5) * 6,
      y: p.y - 1,
      r: 2 + Math.random() * 1.5,
      t: 0,
      life: 0.38 + Math.random() * 0.2
    });
  }

  function drawDust(ctx, p, cam) {
    for (let i = 0; i < p.dust.length; i++) {
      const d = p.dust[i];
      const a = (1 - d.t / d.life) * 0.33;
      ctx.fillStyle = 'rgba(210,198,170,' + a.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(d.x - cam.x, d.y - cam.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Drawn in the depth-sorted pass, so the player can walk behind trees. */
  function draw(ctx, p, cam) {
    const img = Sprites.player(p.character.id, p.dir, p.moving ? p.frame : 0);
    const w = img.width, h = img.height;
    // Origin is the feet: bottom-centre.
    let drawY = p.y - h;

    if (p.busy) {
      // Small crouch + a rocking motion while working.
      const rock = Math.sin(p.busyT * 9) * 1.5;
      ctx.save();
      ctx.translate(Math.round(p.x - cam.x), Math.round(drawY - cam.y + 2));
      ctx.rotate(rock * 0.012);
      ctx.drawImage(img, -w / 2, 0);
      ctx.restore();
    } else {
      ctx.drawImage(img, Math.round(p.x - cam.x - w / 2), Math.round(drawY - cam.y));
    }
  }

  global.PlayerMod = {
    create: create,
    update: update,
    draw: draw,
    drawDust: drawDust,
    BASE_SPEED: BASE_SPEED
  };
})(window);
