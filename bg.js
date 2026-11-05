/*
 * Animated class backdrop: an original, procedurally drawn silhouette for the
 * selected class (body type per race, weapon per class) with a class-coloured
 * aura and particles. Drawn on a fixed canvas behind the page.
 */
(function(){
  "use strict";

  // body: race build; weapon: what the figure holds; fx: particle style
  var LOOK = {
    knight:       { body: "human", weapon: "swordShield", fx: "embers" },
    archer:       { body: "human", weapon: "bow",         fx: "wind" },
    mage:         { body: "human", weapon: "staff",       fx: "runes" },
    berserker:    { body: "orc",   weapon: "axe",         fx: "embers" },
    hunter:       { body: "orc",   weapon: "bow",         fx: "wind" },
    sorcerer:     { body: "orc",   weapon: "totem",       fx: "runes" },
    swashbuckler: { body: "elf",   weapon: "twinBlades",  fx: "wind" },
    ranger:       { body: "elf",   weapon: "bow",         fx: "wind" },
    elementalist: { body: "elf",   weapon: "orb",         fx: "runes" },
    slayer:       { body: "scion", weapon: "claws",       fx: "embers" },
    obiterator:   { body: "scion", weapon: "orb",         fx: "runes" },
    summoner:     { body: "scion", weapon: "staff",       fx: "wisps" }
  };

  var canvas = document.createElement("canvas");
  canvas.className = "sb-bg";
  canvas.setAttribute("aria-hidden", "true");
  document.body.insertBefore(canvas, document.body.firstChild);
  var ctx = canvas.getContext("2d");

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var W = 0, H = 0, dpr = 1, cls = "knight", color = "#c9a45c", particles = [], last = 0, running = true;

  function resize(){
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  function rgba(hex, a){
    var n = parseInt(hex.slice(1), 16);
    return "rgba(" + (n >> 16 & 255) + "," + (n >> 8 & 255) + "," + (n & 255) + "," + a + ")";
  }

  // ---------- particles ----------
  function spawn(fx){
    var p = { x: Math.random() * W, y: H + 10, vx: 0, vy: 0, life: 0, max: 4 + Math.random() * 4, size: 1 + Math.random() * 2.5, rot: Math.random() * 6.28 };
    if (fx === "embers"){ p.vx = (Math.random() - .5) * 14; p.vy = -(18 + Math.random() * 30); }
    else if (fx === "wind"){ p.x = -40; p.y = H * (.25 + Math.random() * .6); p.vx = 90 + Math.random() * 120; p.vy = (Math.random() - .5) * 10; p.len = 20 + Math.random() * 50; p.max = 3; }
    else if (fx === "runes"){ p.y = H * (.3 + Math.random() * .7); p.vy = -(6 + Math.random() * 10); p.size = 5 + Math.random() * 7; p.spin = (Math.random() - .5) * 1.2; }
    else { p.cx = W * .62; p.cy = H * .5; p.r = 40 + Math.random() * 120; p.a = Math.random() * 6.28; p.sp = (.3 + Math.random() * .6) * (Math.random() < .5 ? -1 : 1); }
    return p;
  }

  function drawParticle(p, fx){
    var t = p.life / p.max, a = Math.sin(Math.PI * Math.min(1, t)) * .7;
    ctx.save();
    if (fx === "embers"){
      ctx.fillStyle = rgba(color, a);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.28); ctx.fill();
    } else if (fx === "wind"){
      ctx.strokeStyle = rgba(color, a * .6); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo(p.x - p.len / 2, p.y - 4, p.x - p.len, p.y); ctx.stroke();
    } else if (fx === "runes"){
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.strokeStyle = rgba(color, a * .8); ctx.lineWidth = 1.2;
      var s = p.size;
      ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * .8, s * .6); ctx.lineTo(-s * .8, s * .6); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -s * .3); ctx.lineTo(0, s * .3); ctx.stroke();
    } else {
      ctx.fillStyle = rgba(color, a);
      ctx.shadowColor = color; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size + 1.5, 0, 6.28); ctx.fill();
    }
    ctx.restore();
  }

  function stepParticles(dt, fx){
    var want = fx === "wind" ? 14 : fx === "wisps" ? 22 : 34;
    while (particles.length < want && Math.random() < .5) particles.push(spawn(fx));
    particles = particles.filter(function(p){
      p.life += dt;
      if (fx === "wisps"){ p.a += p.sp * dt; p.x = p.cx + Math.cos(p.a) * p.r; p.y = p.cy + Math.sin(p.a) * p.r * .55 - p.life * 4; }
      else { p.x += p.vx * dt; p.y += p.vy * dt; if (p.spin) p.rot += p.spin * dt; }
      return p.life < p.max;
    });
    particles.forEach(function(p){ drawParticle(p, fx); });
  }

  // ---------- figure ----------
  function figure(t, look){
    var size = Math.min(H * .6, W * 1.05, 520);
    var cx = W * .68, base = H * .97;
    var s = size / 400;                         // figure drawn in a 400-unit tall space
    var breathe = Math.sin(t * 1.6) * 2.5;
    var sway = Math.sin(t * .9) * .04;
    var b = look.body;
    var bulk = b === "orc" ? 1.25 : b === "elf" ? .88 : b === "scion" ? 1.05 : 1;

    ctx.save();
    ctx.translate(cx, base);
    ctx.scale(s, s);

    // aura
    var g = ctx.createRadialGradient(0, -200, 20, 0, -200, 230);
    g.addColorStop(0, rgba(color, .28 + Math.sin(t * 2) * .05));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, -200, 230, 0, 6.28); ctx.fill();

    // ground glow
    ctx.fillStyle = rgba(color, .18);
    ctx.beginPath(); ctx.ellipse(0, 0, 120 * bulk, 14, 0, 0, 6.28); ctx.fill();

    ctx.rotate(sway);
    var fill = "#0b0b0e", rim = rgba(color, .55);
    ctx.fillStyle = fill; ctx.strokeStyle = rim; ctx.lineWidth = 2.2; ctx.lineJoin = "round";

    // wings (dragon scion)
    if (b === "scion"){
      var flap = Math.sin(t * 1.4) * 10;
      [-1, 1].forEach(function(d){
        ctx.beginPath();
        ctx.moveTo(d * 24, -250);
        ctx.quadraticCurveTo(d * 150, -330 - flap, d * 190, -240 - flap);
        ctx.lineTo(d * 150, -225 - flap * .6);
        ctx.lineTo(d * 165, -185 - flap * .4);
        ctx.lineTo(d * 115, -190);
        ctx.lineTo(d * 120, -150);
        ctx.quadraticCurveTo(d * 70, -190, d * 26, -205);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      });
    }

    // cape
    var wave = Math.sin(t * 1.8) * 8;
    ctx.beginPath();
    ctx.moveTo(-34 * bulk, -255);
    ctx.quadraticCurveTo(-70 * bulk - wave, -120, -60 * bulk - wave * 1.5, -12);
    ctx.lineTo(60 * bulk - wave * 1.2, -12);
    ctx.quadraticCurveTo(70 * bulk - wave * .6, -120, 34 * bulk, -255);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    // legs
    ctx.beginPath();
    ctx.moveTo(-26 * bulk, -150); ctx.lineTo(-38 * bulk, -4); ctx.lineTo(-14 * bulk, -4); ctx.lineTo(-4, -140);
    ctx.lineTo(4, -140); ctx.lineTo(14 * bulk, -4); ctx.lineTo(38 * bulk, -4); ctx.lineTo(26 * bulk, -150);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    // torso
    ctx.save(); ctx.translate(0, breathe * .4);
    ctx.beginPath();
    ctx.moveTo(-48 * bulk, -262); ctx.lineTo(48 * bulk, -262);
    ctx.lineTo(30 * bulk, -150); ctx.lineTo(-30 * bulk, -150);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // shoulder plates
    ctx.beginPath(); ctx.ellipse(-50 * bulk, -258, 20 * bulk, 13, -.3, 0, 6.28); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(50 * bulk, -258, 20 * bulk, 13, .3, 0, 6.28); ctx.fill(); ctx.stroke();

    // head
    ctx.beginPath(); ctx.arc(0, -292, 24 * (b === "orc" ? 1.12 : 1), 0, 6.28); ctx.fill(); ctx.stroke();
    if (b === "elf"){
      ctx.beginPath(); ctx.moveTo(-20, -298); ctx.lineTo(-44, -318); ctx.lineTo(-22, -288); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(20, -298); ctx.lineTo(44, -318); ctx.lineTo(22, -288); ctx.fill(); ctx.stroke();
    } else if (b === "orc"){
      ctx.strokeStyle = rgba(color, .8);
      ctx.beginPath(); ctx.moveTo(-10, -280); ctx.lineTo(-14, -294); ctx.moveTo(10, -280); ctx.lineTo(14, -294); ctx.stroke();
      ctx.strokeStyle = rim;
    } else if (b === "scion"){
      ctx.beginPath(); ctx.moveTo(-14, -310); ctx.quadraticCurveTo(-30, -340, -18, -352); ctx.quadraticCurveTo(-20, -330, -6, -314); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(14, -310); ctx.quadraticCurveTo(30, -340, 18, -352); ctx.quadraticCurveTo(20, -330, 6, -314); ctx.fill(); ctx.stroke();
    }
    // eyes
    ctx.fillStyle = rgba(color, .75 + Math.sin(t * 3) * .2);
    ctx.fillRect(-11, -296, 7, 3); ctx.fillRect(4, -296, 7, 3);
    ctx.fillStyle = fill;
    ctx.restore();

    // arms + weapon
    var swing = Math.sin(t * 1.2) * .12;
    arm(-1, -56 * bulk, -250 + breathe * .4, swing, look.weapon, t, bulk);
    arm(1, 56 * bulk, -250 + breathe * .4, -swing, look.weapon, t, bulk);

    ctx.restore();
  }

  function arm(side, x, y, rot, weapon, t, bulk){
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot + side * .18);
    ctx.fillStyle = "#0b0b0e"; ctx.strokeStyle = rgba(color, .55); ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-10 * bulk, 0); ctx.lineTo(10 * bulk, 0); ctx.lineTo(8 * bulk, 96); ctx.lineTo(-8 * bulk, 96);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.translate(0, 100);
    weaponPart(side, weapon, t);
    ctx.restore();
  }

  function glowLine(fn, w){
    ctx.save();
    ctx.strokeStyle = rgba(color, .85); ctx.lineWidth = w || 3;
    ctx.shadowColor = color; ctx.shadowBlur = 12;
    fn(); ctx.stroke();
    ctx.restore();
  }

  function weaponPart(side, weapon, t){
    var pulse = .6 + Math.sin(t * 2.4) * .25;
    ctx.fillStyle = "#0b0b0e"; ctx.strokeStyle = rgba(color, .6); ctx.lineWidth = 2.2;
    if (weapon === "swordShield"){
      if (side > 0){ glowLine(function(){ ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -170); }, 5); ctx.beginPath(); ctx.moveTo(-18, -4); ctx.lineTo(18, -4); ctx.stroke(); }
      else { ctx.beginPath(); ctx.moveTo(-40, -50); ctx.lineTo(40, -50); ctx.lineTo(34, 30); ctx.lineTo(0, 64); ctx.lineTo(-34, 30); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    } else if (weapon === "bow"){
      if (side < 0){
        var pull = Math.sin(t * 1.5) * 6;
        glowLine(function(){ ctx.beginPath(); ctx.moveTo(-10, -110); ctx.quadraticCurveTo(-70, 0, -10, 110); }, 3);
        ctx.strokeStyle = rgba(color, .5); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-10, -110); ctx.lineTo(18 + pull, 0); ctx.lineTo(-10, 110); ctx.stroke();
      }
    } else if (weapon === "staff" || weapon === "totem"){
      if (side > 0){
        ctx.beginPath(); ctx.moveTo(0, 110); ctx.lineTo(0, -190); ctx.stroke();
        ctx.save(); ctx.fillStyle = rgba(color, pulse); ctx.shadowColor = color; ctx.shadowBlur = 24;
        if (weapon === "totem"){ ctx.fillRect(-16, -232, 32, 40); }
        else { ctx.beginPath(); ctx.arc(0, -204, 14, 0, 6.28); ctx.fill(); }
        ctx.restore();
      }
    } else if (weapon === "axe"){
      if (side > 0){
        ctx.beginPath(); ctx.moveTo(0, 40); ctx.lineTo(0, -150); ctx.stroke();
        glowLine(function(){ ctx.beginPath(); ctx.moveTo(0, -150); ctx.quadraticCurveTo(70, -140, 60, -80); ctx.quadraticCurveTo(30, -100, 0, -96); });
      }
    } else if (weapon === "twinBlades"){
      glowLine(function(){ ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(side * 30, -70, side * 12, -130); }, 4);
    } else if (weapon === "orb"){
      if (side > 0){
        var bob = Math.sin(t * 2) * 8;
        ctx.save(); ctx.fillStyle = rgba(color, pulse); ctx.shadowColor = color; ctx.shadowBlur = 30;
        ctx.beginPath(); ctx.arc(20, -40 + bob, 22, 0, 6.28); ctx.fill(); ctx.restore();
      }
    } else if (weapon === "claws"){
      for (var i = -1; i <= 1; i++){
        (function(i){ glowLine(function(){ ctx.beginPath(); ctx.moveTo(i * 6, 0); ctx.quadraticCurveTo(i * 10 + side * 14, 26, i * 8 + side * 4, 46); }, 2.5); })(i);
      }
    }
  }

  // ---------- loop ----------
  function frame(ts){
    if (!running) return;
    var t = ts / 1000, dt = Math.min(.05, last ? t - last : 0);
    last = t;
    var look = LOOK[cls] || LOOK.knight;
    ctx.clearRect(0, 0, W, H);
    stepParticles(dt, look.fx);
    figure(t, look);
    if (!reduce) requestAnimationFrame(frame);
  }

  function setClass(id, c){
    if (id === cls && c === color) return;
    if (LOOK[id] && id !== cls) particles = [];
    cls = id; color = c || color;
    if (reduce){ last = 0; frame(2000); }
  }

  document.addEventListener("visibilitychange", function(){
    running = !document.hidden;
    if (running && !reduce){ last = 0; requestAnimationFrame(frame); }
  });

  window.SB_BG = { setClass: setClass };
  if (window.SB){ var c = window.SB.cls(); setClass(c.id, c.color); }
  requestAnimationFrame(frame);
})();
