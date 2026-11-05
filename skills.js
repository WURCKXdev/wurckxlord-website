(function(){
  "use strict";

  var RULES = window.ARCH_RULES;
  var STORE_KEY = "wurckxlord-skill-builder-v1";

  // ---------- data ----------
  var classes = {};      // id -> class (with parsed skills)
  var classRace = {};    // class id -> race
  window.ARCH_RACES.forEach(function(race){
    race.classes.forEach(function(c){
      c.list = c.skills.map(function(t){
        return { id:t[0], name:t[1], type:t[2], max:t[3], req:t[4], step:t[5], pre:t[6] || {}, desc:t[7], scale:t[8] || {} };
      });
      c.byId = {};
      c.list.forEach(function(s){ c.byId[s.id] = s; });
      c.list.forEach(function(s){
        s.unlocks = c.list.filter(function(o){ return o.pre[s.id] != null; });
      });
      classes[c.id] = c;
      classRace[c.id] = race;
    });
  });

  // ---------- state ----------
  var state = { cls: window.ARCH_RACES[0].classes[0].id, level: RULES.maxLevel, builds: {} };
  var filter = "all";
  var openSkill = null;

  function cls(){ return classes[state.cls]; }
  function alloc(){ return state.builds[state.cls] || (state.builds[state.cls] = {}); }
  function lv(id){ return alloc()[id] || 0; }

  function totalPoints(){ return RULES.startingPoints + (state.level - 1) * RULES.pointsPerLevel; }
  function spent(){
    var a = alloc(), n = 0;
    for (var k in a) n += a[k];
    return n;
  }
  function reqFor(s, level){ return s.req + (level - 1) * s.step; }

  function missingPrereqs(s){
    var out = [];
    for (var id in s.pre){
      if (lv(id) < s.pre[id]) out.push({ skill: cls().byId[id], need: s.pre[id] });
    }
    return out;
  }

  // Why can't a point be added? Returns null if it can.
  function addBlock(s){
    var cur = lv(s.id);
    if (cur >= s.max) return "Maxed";
    var need = reqFor(s, cur + 1);
    if (state.level < need) return "Needs Lv " + need;
    var miss = missingPrereqs(s);
    if (miss.length) return "Needs " + miss.map(function(m){ return m.skill.name + " " + m.need; }).join(", ");
    if (spent() >= totalPoints()) return "No skill points left";
    return null;
  }

  function removeBlock(s){
    var cur = lv(s.id);
    if (cur <= 0) return "Nothing to remove";
    for (var i = 0; i < s.unlocks.length; i++){
      var d = s.unlocks[i];
      if (lv(d.id) > 0 && d.pre[s.id] > cur - 1) return d.name + " needs " + s.name + " " + d.pre[s.id];
    }
    return null;
  }

  function setLv(id, n){
    var a = alloc();
    if (n > 0) a[id] = n; else delete a[id];
  }

  // Drop anything the current level no longer allows (cascades through prereqs).
  function trim(){
    var changed = true, dropped = false;
    while (changed){
      changed = false;
      cls().list.forEach(function(s){
        var cur = lv(s.id);
        while (cur > 0 && reqFor(s, cur) > state.level){ cur--; changed = dropped = true; }
        if (cur > 0 && missingPrereqs(s).length){ cur = 0; changed = dropped = true; }
        setLv(s.id, cur);
      });
    }
    return dropped;
  }

  // ---------- persistence / sharing ----------
  function encode(){
    var c = cls();
    return c.id + "-" + state.level + "-" + c.list.map(function(s){ return lv(s.id).toString(36); }).join("");
  }
  function decode(str){
    var m = /^([a-z]+)-(\d{1,3})-([0-9a-z]*)$/.exec(str || "");
    if (!m || !classes[m[1]]) return false;
    var c = classes[m[1]];
    state.cls = c.id;
    state.level = clampLevel(+m[2]);
    var a = {};
    c.list.forEach(function(s, i){
      var n = parseInt(m[3].charAt(i) || "0", 36) || 0;
      if (n > 0) a[s.id] = Math.min(n, s.max);
    });
    state.builds[c.id] = a;
    trim();
    return true;
  }
  function save(){
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
    try { history.replaceState(null, "", "#" + encode()); } catch (e) {}
  }
  function load(){
    if (decode(decodeURIComponent(location.hash.slice(1)))) return;
    try {
      var saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (saved && classes[saved.cls]){
        state.cls = saved.cls;
        state.level = clampLevel(saved.level);
        state.builds = saved.builds || {};
        trim();
      }
    } catch (e) {}
  }

  function clampLevel(n){
    n = Math.round(+n || 1);
    return Math.max(1, Math.min(RULES.maxLevel, n));
  }

  // ---------- helpers ----------
  var $ = function(id){ return document.getElementById(id); };
  function esc(t){ return String(t).replace(/[&<>"]/g, function(c){ return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]; }); }
  function fmt(n){ return (Math.round(n * 10) / 10).toString(); }
  function initials(name){
    var w = name.split(/\s+/).filter(function(x){ return !/^(of|the)$/i.test(x); });
    return (w[0].charAt(0) + (w[1] ? w[1].charAt(0) : w[0].charAt(1))).toUpperCase();
  }
  function describe(s, level, highlightNext){
    return esc(s.desc).replace(/\{(\w+)\}/g, function(_, k){
      var sc = s.scale[k];
      if (!sc) return k;
      var L = Math.max(level, 1);
      var v = fmt(sc[0] + sc[1] * (L - 1));
      if (highlightNext) v = '<b class="sb-next">' + v + "</b>";
      return v;
    });
  }

  var toastTimer;
  function toast(msg){
    var t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ t.classList.remove("show"); }, 1800);
  }

  // ---------- rendering ----------
  function renderPicker(){
    var race = classRace[state.cls];
    $("raceChips").innerHTML = window.ARCH_RACES.map(function(r){
      return '<button type="button" role="tab" data-race="' + r.id + '" aria-selected="' + (r === race) + '">' + esc(r.name) + "</button>";
    }).join("");
    $("classChips").innerHTML = race.classes.map(function(c){
      var used = Object.keys(state.builds[c.id] || {}).length ? ' <i class="sb-has" title="Has a saved build"></i>' : "";
      return '<button type="button" role="tab" data-cls="' + c.id + '" aria-selected="' + (c.id === state.cls) + '">' +
        esc(c.name) + used + "<small>" + esc(c.role) + "</small></button>";
    }).join("");
    document.documentElement.style.setProperty("--cls", cls().color);
  }

  function renderStats(){
    var total = totalPoints(), used = spent(), left = total - used;
    $("lvlInput").value = state.level;
    $("lvlInput").max = RULES.maxLevel;
    $("spLeft").textContent = left;
    $("spTotal").textContent = " / " + total;
    $("spBar").style.width = Math.min(100, used / total * 100) + "%";
    $("lvlDown").disabled = state.level <= 1;
    $("lvlUp").disabled = state.level >= RULES.maxLevel;
    var c = cls();
    $("classLabel").innerHTML = "<b>" + esc(classRace[c.id].name) + " " + esc(c.name) + "</b> · Lv " + state.level + " · " + used + " SP used";
  }

  function skillRow(s){
    var cur = lv(s.id), add = addBlock(s), rem = removeBlock(s);
    var locked = cur === 0 && add && add !== "No skill points left";
    var meta;
    if (cur >= s.max) meta = "Maxed";
    else if (add && add !== "No skill points left") meta = '<span class="need">' + esc(add) + "</span>";
    else meta = "Next at Lv " + reqFor(s, cur + 1);
    var pips = "";
    for (var i = 1; i <= s.max; i++) pips += '<i class="' + (i <= cur ? "on" : "") + '"></i>';
    return '<article class="sb-skill' + (locked ? " locked" : "") + (cur ? " learned" : "") + (cur >= s.max ? " maxed" : "") + '" data-id="' + s.id + '">' +
      '<span class="sb-badge" data-type="' + s.type + '" aria-hidden="true">' + initials(s.name) + "</span>" +
      '<button type="button" class="sb-info" data-open="' + s.id + '" aria-label="' + esc(s.name) + ' details">' +
        "<h3>" + esc(s.name) + "</h3>" +
        '<span class="sb-meta">' + s.type.charAt(0).toUpperCase() + s.type.slice(1) + " · " + meta + "</span>" +
        '<span class="sb-pips">' + pips + "</span>" +
      "</button>" +
      '<div class="sb-ctrl">' +
        '<button type="button" data-dec="' + s.id + '" aria-label="Remove point from ' + esc(s.name) + '"' + (rem ? " disabled" : "") + ">&minus;</button>" +
        "<output>" + cur + "/" + s.max + "</output>" +
        '<button type="button" data-inc="' + s.id + '" aria-label="Add point to ' + esc(s.name) + '"' + (add ? " disabled" : "") + ">+</button>" +
      "</div></article>";
  }

  function renderList(){
    var list = cls().list.filter(function(s){
      if (filter === "all") return true;
      if (filter === "learned") return lv(s.id) > 0;
      return s.type === filter;
    });
    $("skillList").innerHTML = list.length ? list.map(skillRow).join("") :
      '<p class="sb-empty">' + (filter === "learned" ? "No points spent yet. Tap + on a skill to learn it." : "No skills of this type.") + "</p>";
  }

  function renderSheet(){
    if (!openSkill) return;
    var s = cls().byId[openSkill];
    var cur = lv(s.id), add = addBlock(s), rem = removeBlock(s);
    $("sheetBadge").textContent = initials(s.name);
    $("sheetBadge").setAttribute("data-type", s.type);
    $("sheetName").textContent = s.name;
    $("sheetType").textContent = s.type + " skill · max level " + s.max;

    var html = "";
    html += "<h4>" + (cur ? "CURRENT · LV " + cur : "LEVEL 1") + "</h4><p>" + describe(s, cur || 1) + "</p>";
    if (cur > 0 && cur < s.max) html += "<h4>NEXT · LV " + (cur + 1) + "</h4><p>" + describe(s, cur + 1, true) + "</p>";

    html += "<h4>REQUIREMENTS</h4><dl>";
    if (cur < s.max){
      var need = reqFor(s, cur + 1);
      html += "<dt>Character level for Lv " + (cur + 1) + '</dt><dd class="' + (state.level >= need ? "ok" : "bad") + '">' + need + "</dd>";
    }
    html += "<dt>Character level for max</dt><dd>" + reqFor(s, s.max) + "</dd>";
    for (var id in s.pre){
      var p = cls().byId[id];
      html += "<dt>" + esc(p.name) + '</dt><dd class="' + (lv(id) >= s.pre[id] ? "ok" : "bad") + '">Lv ' + s.pre[id] + "</dd>";
    }
    html += "<dt>Total SP to max</dt><dd>" + s.max + "</dd></dl>";

    if (s.unlocks.length){
      html += "<h4>UNLOCKS</h4><dl>" + s.unlocks.map(function(u){
        return "<dt>" + esc(u.name) + "</dt><dd>at Lv " + u.pre[s.id] + "</dd>";
      }).join("") + "</dl>";
    }
    if (add && cur < s.max) html += '<p class="bad" style="margin-top:12px">' + esc(add) + "</p>";
    $("sheetBody").innerHTML = html;

    $("sheetLevel").textContent = cur + " / " + s.max;
    $("sheetPlus").disabled = $("sheetMax").disabled = !!add;
    $("sheetMinus").disabled = $("sheetMin").disabled = !!rem;
  }

  function render(){
    renderPicker();
    renderStats();
    renderList();
    renderSheet();
  }

  function commit(){ save(); render(); }

  // ---------- actions ----------
  function inc(id, quiet){
    var s = cls().byId[id], why = addBlock(s);
    if (why){ if (!quiet) toast(why); return false; }
    setLv(id, lv(id) + 1);
    return true;
  }
  function dec(id, quiet){
    var s = cls().byId[id], why = removeBlock(s);
    if (why){ if (!quiet) toast(why); return false; }
    setLv(id, lv(id) - 1);
    return true;
  }

  function setLevel(n){
    var next = clampLevel(n);
    if (next === state.level) { renderStats(); return; }
    state.level = next;
    if (trim()) toast("Removed points the new level can't support");
    if (spent() > totalPoints()) toast("Over budget — remove " + (spent() - totalPoints()) + " SP");
    commit();
  }

  function openSheet(id){
    openSkill = id;
    $("sheet").hidden = false;
    $("sheetBackdrop").hidden = false;
    renderSheet();
    $("sheetClose").focus();
  }
  function closeSheet(){
    var id = openSkill;
    openSkill = null;
    $("sheet").hidden = true;
    $("sheetBackdrop").hidden = true;
    var btn = document.querySelector('[data-open="' + id + '"]');
    if (btn) btn.focus();
  }

  function share(){
    save();
    var url = location.href, c = cls();
    var title = "WurckxLord " + c.name + " build (Lv " + state.level + ")";
    if (navigator.share){
      navigator.share({ title: title, url: url }).catch(function(){});
    } else if (navigator.clipboard){
      navigator.clipboard.writeText(url).then(function(){ toast("Build link copied"); }, function(){ window.prompt("Copy build link:", url); });
    } else {
      window.prompt("Copy build link:", url);
    }
  }

  // ---------- events ----------
  $("raceChips").addEventListener("click", function(e){
    var b = e.target.closest("[data-race]");
    if (!b) return;
    var race = window.ARCH_RACES.filter(function(r){ return r.id === b.dataset.race; })[0];
    if (classRace[state.cls] === race) return;
    state.cls = race.classes[0].id;
    trim();
    commit();
  });
  $("classChips").addEventListener("click", function(e){
    var b = e.target.closest("[data-cls]");
    if (!b || b.dataset.cls === state.cls) return;
    state.cls = b.dataset.cls;
    trim();
    commit();
  });

  $("lvlDown").addEventListener("click", function(){ setLevel(state.level - 1); });
  $("lvlUp").addEventListener("click", function(){ setLevel(state.level + 1); });
  $("lvlInput").addEventListener("change", function(){ setLevel(this.value); });
  $("lvlInput").addEventListener("keydown", function(e){ if (e.key === "Enter") this.blur(); });

  $("filters").addEventListener("click", function(e){
    var b = e.target.closest("[data-f]");
    if (!b) return;
    filter = b.dataset.f;
    Array.prototype.forEach.call(this.children, function(x){ x.classList.toggle("on", x === b); });
    renderList();
  });

  $("skillList").addEventListener("click", function(e){
    var t = e.target.closest("[data-inc],[data-dec],[data-open]");
    if (!t) return;
    if (t.dataset.inc){ if (inc(t.dataset.inc)) commit(); }
    else if (t.dataset.dec){ if (dec(t.dataset.dec)) commit(); }
    else openSheet(t.dataset.open);
  });

  $("sheetPlus").addEventListener("click", function(){ if (inc(openSkill)) commit(); });
  $("sheetMinus").addEventListener("click", function(){ if (dec(openSkill)) commit(); });
  $("sheetMax").addEventListener("click", function(){
    var n = 0; while (inc(openSkill, true)) n++;
    if (n) commit(); else inc(openSkill);
  });
  $("sheetMin").addEventListener("click", function(){
    var n = 0; while (dec(openSkill, true)) n++;
    if (n) commit(); else dec(openSkill);
    if (n && lv(openSkill) > 0) toast(removeBlock(cls().byId[openSkill]));
  });
  $("sheetClose").addEventListener("click", closeSheet);
  $("sheetBackdrop").addEventListener("click", closeSheet);
  document.addEventListener("keydown", function(e){ if (e.key === "Escape" && openSkill) closeSheet(); });

  // swipe the sheet down to close
  (function(){
    var sheet = $("sheet"), y0 = null;
    sheet.addEventListener("touchstart", function(e){ y0 = sheet.scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
    sheet.addEventListener("touchmove", function(e){
      if (y0 == null) return;
      var dy = e.touches[0].clientY - y0;
      if (dy > 0) sheet.style.transform = "translateY(" + dy + "px)";
    }, { passive: true });
    sheet.addEventListener("touchend", function(e){
      if (y0 == null) return;
      var dy = e.changedTouches[0].clientY - y0;
      sheet.style.transform = "";
      y0 = null;
      if (dy > 90) closeSheet();
    });
  })();

  $("resetBtn").addEventListener("click", function(){
    if (!spent()) { toast("Nothing to reset"); return; }
    if (!window.confirm("Reset all " + cls().name + " skill points?")) return;
    state.builds[state.cls] = {};
    commit();
    toast("Build reset");
  });
  $("shareBtn").addEventListener("click", share);

  window.addEventListener("hashchange", function(){
    if (location.hash.slice(1) !== encode() && decode(decodeURIComponent(location.hash.slice(1)))) commit();
  });

  load();
  commit();
})();
