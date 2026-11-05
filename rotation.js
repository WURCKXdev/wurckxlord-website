(function(){
  "use strict";

  var SB = window.SB, CFG = window.ARCH_DAMAGE, COMBAT = window.ARCH_COMBAT;
  var STORE_KEY = "wurckxlord-rotation-v1";
  var MAX_STEPS = 24, OPTIMIZE_LIMIT = 8;

  var $ = function(id){ return document.getElementById(id); };
  var esc = SB.esc, fmt = SB.fmt;

  // ---------- state ----------
  var data = { stats: Object.assign({}, CFG.baseStats), rotations: {} };
  try {
    var saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (saved){
      if (saved.stats) Object.keys(data.stats).forEach(function(k){ if (isFinite(saved.stats[k])) data.stats[k] = +saved.stats[k]; });
      if (saved.rotations) data.rotations = saved.rotations;
    }
  } catch (e) {}

  function persist(){ try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (e) {} }
  function combat(){ return COMBAT[SB.cls().id] || {}; }
  function rotation(){ var id = SB.cls().id; return data.rotations[id] || (data.rotations[id] = []); }

  // Pick up a rotation from a shared link (#class-lvl-levels~rotation)
  var pending = SB.takePendingRotation();
  if (pending){
    var list = window.SB.cls().list;
    data.rotations[pending.cls] = pending.code.split("").map(function(ch){
      var s = list[parseInt(ch, 36)]; return s ? s.id : null;
    }).filter(Boolean);
  }
  SB.extraHash = function(){
    var list = SB.cls().list, idx = {};
    list.forEach(function(s, i){ idx[s.id] = i.toString(36); });
    return rotation().map(function(id){ return idx[id]; }).join("");
  };

  // ---------- engine ----------
  function value(s, key, level){
    var sc = s.scale[key];
    return sc ? sc[0] + sc[1] * (Math.max(level, 1) - 1) : 0;
  }

  function passives(){
    var c = SB.cls(), cb = combat(), out = { atk:0, md:0, dmg:0, crit:0, cd:0, taken:0, def:0 }, used = [];
    c.list.forEach(function(s){
      var e = cb[s.id], l = SB.lv(s.id);
      if (!e || e[0] !== "passive" || l < 1) return;
      var v = value(s, e[3].key, l);
      out[e[3].stat] += v;
      used.push({ name: s.name, stat: e[3].stat, v: v });
    });
    return { bonus: out, list: used };
  }

  var STAT_LABEL = { atk: "physical dmg", md: "magic dmg", dmg: "all dmg", crit: "crit chance", cd: "crit dmg", taken: "dmg taken", def: "armor shred" };

  // Runs the rotation in order on one target and returns a per-step breakdown.
  function simulate(order){
    var c = SB.cls(), cb = combat(), st = data.stats, pas = passives().bonus;
    var clock = 0, ready = {}, effects = [], steps = [], total = 0;

    order.forEach(function(id){
      var s = c.byId[id], e = cb[id], l = SB.lv(id);
      var row = { id: id, skill: s, level: l, dmg: 0, wait: 0, start: 0, end: 0, active: [], note: "" };
      if (!s || !e || e[0] === "passive"){ row.note = "Not usable"; steps.push(row); return; }
      if (l < 1){ row.note = "Not learned"; steps.push(row); return; }

      var start = Math.max(clock, ready[id] || 0);
      row.wait = start - clock;
      var cast = Math.max(e[2], CFG.minStepSec);
      row.start = start;
      row.end = start + cast;
      ready[id] = start + e[1];
      var opt = e[3] || {};

      // effects active when this cast lands
      var bonus = { atk: pas.atk, md: pas.md, dmg: pas.dmg, crit: pas.crit, cd: pas.cd, taken: pas.taken, def: pas.def };
      effects.forEach(function(fx){
        if (fx.from <= row.end && fx.until >= row.end){
          bonus[fx.stat] += fx.v;
          row.active.push(fx.name);
        }
      });

      if (e[0] === "hit" || e[0] === "spell"){
        var phys = e[0] === "hit";
        var base = phys ? st.weapon * value(s, "dmg", l) / 100
                        : value(s, "dmg", l) + st.magic * CFG.spellCoef;
        base *= (opt.hits || 1) * (opt.ticks || 1);
        var pct = bonus.dmg + (phys ? bonus.atk : bonus.md);
        var critChance = Math.min(100, st.crit + bonus.crit) / 100;
        var critMult = (st.critDmg + bonus.cd) / 100;
        var expectedCrit = 1 + critChance * Math.max(0, critMult - 1);
        var reduction = Math.max(0, st.reduction - bonus.def) / 100;
        row.dmg = base * (1 + pct / 100) * expectedCrit * (1 - reduction) * (1 + bonus.taken / 100);
        row.parts = { base: base, pct: pct, crit: critChance * 100, critMult: critMult, reduction: reduction * 100, taken: bonus.taken };
        total += row.dmg;
      } else if (e[0] === "buff" || e[0] === "debuff"){
        var v = value(s, opt.key, l);
        effects.push({ name: s.name, stat: opt.stat, v: v, from: row.end, until: row.end + opt.dur });
        row.note = (opt.stat === "def" ? "-" : "+") + fmt(v) + "% " + STAT_LABEL[opt.stat] + " for " + opt.dur + "s";
      } else {
        row.note = "No damage";
      }
      clock = row.end;
      steps.push(row);
    });
    return { steps: steps, total: total, time: clock, dps: clock > 0 ? total / clock : 0 };
  }

  // Try every ordering (small rotations only) and keep the highest damage, then the shortest time.
  function optimize(order){
    var best = null, bestOrder = order.slice(), arr = order.slice();
    function consider(){
      var r = simulate(arr);
      if (!best || r.total > best.total + 1e-6 || (Math.abs(r.total - best.total) < 1e-6 && r.time < best.time)){ best = r; bestOrder = arr.slice(); }
    }
    // Heap's algorithm, skipping duplicate permutations by key
    var seen = {};
    function permute(k){
      if (k === 1){ var key = arr.join(","); if (!seen[key]){ seen[key] = 1; consider(); } return; }
      permute(k - 1);
      for (var i = 0; i < k - 1; i++){
        var j = k % 2 ? 0 : i, t = arr[j]; arr[j] = arr[k - 1]; arr[k - 1] = t;
        permute(k - 1);
      }
    }
    permute(arr.length);
    return bestOrder;
  }

  // ---------- rendering ----------
  function big(n){
    n = Math.round(n);
    if (n >= 1e6) return fmt(n / 1e6) + "M";
    if (n >= 1e4) return fmt(n / 1e3) + "k";
    return n.toLocaleString("en-US");
  }

  function usable(){
    var cb = combat();
    return SB.cls().list.filter(function(s){ var e = cb[s.id]; return e && e[0] !== "passive"; });
  }

  function render(){
    if (!$("dmgView")) return;
    var st = data.stats;
    ["weapon", "magic", "crit", "critDmg", "reduction"].forEach(function(k){
      var el = $("st-" + k);
      if (document.activeElement !== el) el.value = st[k];
    });

    // skill palette
    var list = usable();
    $("dmgPalette").innerHTML = list.length ? list.map(function(s){
      var e = combat()[s.id], l = SB.lv(s.id);
      return '<button type="button" class="sb-pal' + (l ? "" : " off") + '" data-add="' + s.id + '"' + (l ? "" : " disabled") + ">" +
        '<span class="sb-badge sm" data-type="' + s.type + '">' + SB.initials(s.name) + "</span>" +
        "<span><b>" + esc(s.name) + "</b><small>" + (l ? "Lv " + l + " · " : "Not learned · ") + e[1] + "s cd</small></span></button>";
    }).join("") : '<p class="sb-empty">This class has no skills to cast.</p>';

    // passives
    var pas = passives().list;
    $("dmgPassives").innerHTML = pas.length ? "Always on: " + pas.map(function(p){
      return esc(p.name) + " +" + fmt(p.v) + "% " + STAT_LABEL[p.stat];
    }).join(" · ") : "";

    var rot = rotation(), sim = simulate(rot), maxDmg = 0;
    sim.steps.forEach(function(r){ if (r.dmg > maxDmg) maxDmg = r.dmg; });

    $("dmgTotal").textContent = big(sim.total);
    $("dmgTime").textContent = fmt(sim.time) + "s";
    $("dmgDps").textContent = big(sim.dps);
    $("dmgOptimize").disabled = rot.length < 2;
    $("dmgClear").disabled = !rot.length;

    $("dmgSteps").innerHTML = rot.length ? sim.steps.map(function(r, i){
      var s = r.skill, share = maxDmg ? r.dmg / maxDmg * 100 : 0;
      var e = combat()[r.id] || [];
      var label = { buff: "Buff", debuff: "Debuff", util: "Utility" }[e[0]] || "";
      var info = r.dmg ? '<b class="sb-dmg">' + big(r.dmg) + "</b>" : '<span class="sb-muted">' + (label || esc(r.note)) + "</span>";
      var effect = !r.dmg && label && r.note ? '<span class="sb-effect">' + esc(r.note) + "</span>" : "";
      var tags = r.active.length ? '<span class="sb-tags">Boosted by ' + r.active.map(esc).join(", ") + "</span>" : "";
      var wait = r.wait > 0.05 ? '<span class="sb-wait">waits ' + fmt(r.wait) + "s cooldown</span>" : "";
      return '<li class="sb-step" data-i="' + i + '">' +
        '<span class="sb-num">' + (i + 1) + "</span>" +
        '<span class="sb-badge sm" data-type="' + s.type + '">' + SB.initials(s.name) + "</span>" +
        '<div class="sb-step-main"><div class="sb-step-top"><span class="sb-step-name">' + esc(s.name) + "</span>" + info + "</div>" +
          '<div class="sb-step-sub">at ' + fmt(r.start) + "s " + wait + effect + tags + "</div>" +
          '<div class="sb-meter"><i style="width:' + share + '%"></i></div>' +
        "</div>" +
        '<div class="sb-step-ctrl">' +
          '<button type="button" data-up="' + i + '" aria-label="Move up"' + (i ? "" : " disabled") + ">&#9650;</button>" +
          '<button type="button" data-down="' + i + '" aria-label="Move down"' + (i < rot.length - 1 ? "" : " disabled") + ">&#9660;</button>" +
          '<button type="button" data-del="' + i + '" aria-label="Remove">&times;</button>' +
        "</div></li>";
    }).join("") : '<li class="sb-empty">Tap skills above in the order you cast them.</li>';

    // per-skill totals
    var per = {};
    sim.steps.forEach(function(r){ if (r.dmg) per[r.id] = (per[r.id] || 0) + r.dmg; });
    var ids = Object.keys(per).sort(function(a, b){ return per[b] - per[a]; });
    $("dmgPerSkill").innerHTML = ids.length ? "<h4>DAMAGE BY SKILL</h4><dl>" + ids.map(function(id){
      return "<dt>" + esc(SB.cls().byId[id].name) + "</dt><dd>" + big(per[id]) + ' <small>' + Math.round(per[id] / sim.total * 100) + "%</small></dd>";
    }).join("") + "</dl>" : "";
  }

  function changed(){ persist(); SB.save(); render(); }

  // ---------- events ----------
  ["weapon", "magic", "crit", "critDmg", "reduction"].forEach(function(k){
    $("st-" + k).addEventListener("input", function(){
      var v = parseFloat(this.value);
      if (!isFinite(v) || v < 0) return;
      data.stats[k] = v;
      persist();
      render();
    });
  });
  $("dmgReset").addEventListener("click", function(){
    data.stats = Object.assign({}, CFG.baseStats);
    persist(); render();
  });

  $("dmgPalette").addEventListener("click", function(e){
    var b = e.target.closest("[data-add]");
    if (!b) return;
    var rot = rotation();
    if (rot.length >= MAX_STEPS){ SB.toast("Rotation is full (" + MAX_STEPS + " casts)"); return; }
    rot.push(b.dataset.add);
    changed();
  });

  $("dmgSteps").addEventListener("click", function(e){
    var b = e.target.closest("[data-up],[data-down],[data-del]");
    if (!b) return;
    var rot = rotation(), t;
    if (b.dataset.up){ var i = +b.dataset.up; t = rot[i - 1]; rot[i - 1] = rot[i]; rot[i] = t; }
    else if (b.dataset.down){ var j = +b.dataset.down; t = rot[j + 1]; rot[j + 1] = rot[j]; rot[j] = t; }
    else rot.splice(+b.dataset.del, 1);
    changed();
  });

  $("dmgClear").addEventListener("click", function(){
    data.rotations[SB.cls().id] = [];
    changed();
  });

  $("dmgOptimize").addEventListener("click", function(){
    var rot = rotation();
    if (rot.length > OPTIMIZE_LIMIT){ SB.toast("Best order works on up to " + OPTIMIZE_LIMIT + " casts"); return; }
    var before = simulate(rot).total;
    var best = optimize(rot);
    data.rotations[SB.cls().id] = best;
    var after = simulate(best).total;
    changed();
    SB.toast(after > before + 0.5 ? "Reordered: +" + big(after - before) + " damage" : "Already the best order");
  });

  // view switching
  var tabs = $("viewTabs");
  function setView(v){
    document.body.setAttribute("data-view", v);
    Array.prototype.forEach.call(tabs.children, function(b){ b.setAttribute("aria-selected", String(b.dataset.view === v)); });
    try { localStorage.setItem("wurckxlord-view", v); } catch (e) {}
    if (v === "damage") render();
  }
  tabs.addEventListener("click", function(e){
    var b = e.target.closest("[data-view]");
    if (b) setView(b.dataset.view);
  });

  SB.onRender = render;
  var startView = "build";
  try { startView = localStorage.getItem("wurckxlord-view") || "build"; } catch (e) {}
  if (pending && pending.code) startView = "damage";
  setView(startView);
  SB.save();
  render();

  window.ROTATION = { simulate: simulate, optimize: optimize };
})();
