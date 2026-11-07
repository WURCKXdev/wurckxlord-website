/* FLUX — expressive line-based MPE sequencer.
 * Notes are curves made of nodes {t (beats), p (MIDI pitch, fractional), pr (pressure 0-1), sl (slide 0-1)}
 * plus per-note velocity / release velocity. Plays with a built-in WebAudio synth and
 * exports MPE MIDI (one note per channel, pitch bend + channel pressure + CC74). */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const cv = $('#roll'), g = cv.getContext('2d');
  const KW = 46, RH = 24, MINP = 21, MAXP = 108;
  const GRIDS = [[1, '1/4'], [0.5, '1/8'], [0.25, '1/16'], [0.125, '1/32'], [0, 'Off']];
  const LANES = {
    vel: { c: '#f0b54a', label: 'Velocity', on: true },
    rvel: { c: '#b48cff', label: 'Release vel', on: true },
    pr: { c: '#3d8bff', label: 'Pressure', on: true },
    sl: { c: '#9aa3b5', label: 'Slide', on: true },
  };
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const BLACK = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];

  // ---------- state ----------
  let nid = 1;
  const S = { bpm: 110, bars: 8, transpose: 0, bend: 48, notes: [] };
  const V = { sx: 0, top: 80, ppb: 44, pps: 16, tool: 'select', lane: 'pitch', gridIdx: 2, snap: true, loop: true, follow: true };
  let sel = new Set(), selNode = null, clip = [];
  let undoStack = [], redoStack = [], editBase = null;
  let drag = null, dirty = true, W = 0, H = 0, dpr = 1;
  const grid = () => GRIDS[V.gridIdx][0];

  // ---------- geometry ----------
  const bx = (b) => KW + (b - V.sx) * V.ppb;
  const py = (p) => RH + (V.top - p) * V.pps;
  const xb = (x) => (x - KW) / V.ppb + V.sx;
  const yp = (y) => V.top - (y - RH) / V.pps;
  const snapT = (b) => { const q = grid(); return q ? Math.round(b / q) * q : b; };
  const snapP = (p) => (V.snap ? Math.round(p) : p);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const songLen = () => S.bars * 4;
  const nStart = (n) => n.nodes[0].t;
  const nEnd = (n) => n.nodes[n.nodes.length - 1].t;
  const byId = (id) => S.notes.find((n) => n.id === id);

  function ev(n, t) {
    const N = n.nodes;
    if (t <= N[0].t) return N[0];
    const L = N[N.length - 1];
    if (t >= L.t) return L;
    let i = 0;
    while (i < N.length - 2 && N[i + 1].t < t) i++;
    const a = N[i], b = N[i + 1], d = b.t - a.t;
    const u = d > 0 ? (t - a.t) / d : 1, s = u * u * (3 - 2 * u);
    return { t, p: a.p + (b.p - a.p) * s, pr: a.pr + (b.pr - a.pr) * s, sl: a.sl + (b.sl - a.sl) * s };
  }
  function samples(n, pxStep) {
    const s = nStart(n), e = nEnd(n), step = Math.max(1e-3, pxStep / V.ppb);
    const out = [];
    for (let t = s; t < e; t += step) out.push(ev(n, t));
    out.push(n.nodes[n.nodes.length - 1]);
    return out;
  }
  function mkNote(nodes, vel = 0.8, rvel = 0.5) {
    return { id: nid++, vel, rvel, nodes: nodes.map((q) => ({ t: q.t, p: q.p, pr: q.pr ?? 0.55, sl: q.sl ?? 0.25 })) };
  }
  function normalize(n) {
    n.nodes.sort((a, b) => a.t - b.t);
    const out = [];
    for (const q of n.nodes) {
      if (out.length && q.t - out[out.length - 1].t < 1e-3) out[out.length - 1] = q; else out.push(q);
    }
    if (out.length < 2) out.push({ ...out[0], t: out[0].t + (grid() || 0.25) });
    n.nodes = out;
  }

  // ---------- undo / persistence ----------
  const snapshot = () => JSON.stringify(S);
  function beginEdit() { editBase = snapshot(); }
  function commitEdit() {
    if (editBase === null) return;
    const now = snapshot();
    if (now !== editBase) { undoStack.push(editBase); if (undoStack.length > 200) undoStack.shift(); redoStack = []; persist(); }
    editBase = null;
  }
  function load(json) {
    const o = typeof json === 'string' ? JSON.parse(json) : json;
    if (!o || !Array.isArray(o.notes)) throw new Error('Not a FLUX pattern');
    S.bpm = +o.bpm || 110; S.bars = +o.bars || 8; S.transpose = +o.transpose || 0; S.bend = +o.bend || 48;
    S.notes = o.notes.filter((n) => n && Array.isArray(n.nodes) && n.nodes.length).map((n) => {
      const m = mkNote(n.nodes.map((q) => ({ t: +q.t || 0, p: +q.p || 60, pr: clamp(+q.pr || 0, 0, 1), sl: clamp(+q.sl || 0, 0, 1) })), clamp(+n.vel || 0.8, 0, 1), clamp(n.rvel == null ? 0.5 : +n.rvel, 0, 1));
      normalize(m); return m;
    });
    sel.clear(); selNode = null; syncInputs(); dirty = true;
  }
  function restore(str) { load(str); persist(); }
  function undo() { if (!undoStack.length) return; redoStack.push(snapshot()); restore(undoStack.pop()); }
  function redo() { if (!redoStack.length) return; undoStack.push(snapshot()); restore(redoStack.pop()); }
  function persist() { try { localStorage.setItem('flux.pattern', snapshot()); } catch (e) { /* storage unavailable */ } }

  // ---------- demo pattern ----------
  function demo() {
    S.notes = [];
    const chords = [[48, 60, 63, 67], [44, 56, 63, 68], [51, 58, 63, 70], [46, 58, 62, 65]];
    chords.forEach((c, i) => {
      const s = i * 8, nx = chords[(i + 1) % 4];
      c.forEach((p, j) => {
        const q = i === 3 ? p : nx[j];
        S.notes.push(mkNote([
          { t: s, p, pr: 0.25, sl: 0.15 }, { t: s + 2.5, p, pr: 0.85, sl: 0.35 },
          { t: s + 5.5, p, pr: 0.5, sl: 0.6 }, { t: s + 7.75, p: q, pr: 0.2, sl: 0.25 },
        ], 0.55 + j * 0.08, 0.4));
      });
    });
    const lead = [];
    const mel = [75, 77, 74, 79, 75, 77, 72, 74, 75, 77, 74, 79, 80, 79, 77, 75];
    mel.forEach((p, k) => lead.push({ t: 16 + k * 0.5, p, pr: 0.4 + 0.5 * Math.abs(Math.sin(k)), sl: 0.5 + 0.4 * Math.sin(k / 2) }));
    lead.push({ t: 24, p: 75, pr: 0.2, sl: 0.3 });
    S.notes.push(mkNote(lead, 0.9, 0.7));
    S.bars = 8; S.bpm = 110;
  }

  // ---------- audio ----------
  let AC = null, master = null, echo = null;
  const voices = new Set();
  function audio() {
    if (!AC) {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      master = AC.createGain(); master.gain.value = 0.8;
      const comp = AC.createDynamicsCompressor();
      echo = AC.createDelay(2); echo.delayTime.value = (60 / S.bpm) * 0.75;
      const fb = AC.createGain(); fb.gain.value = 0.32;
      const tone = AC.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 2800;
      const wet = AC.createGain(); wet.gain.value = 0.2;
      master.connect(comp); master.connect(echo); echo.connect(tone); tone.connect(fb); fb.connect(echo);
      tone.connect(wet); wet.connect(comp); comp.connect(AC.destination);
    }
    if (AC.state === 'suspended') AC.resume();
    return AC;
  }
  const cents = (p) => (p + S.transpose - 69) * 100;
  const cutoff = (pr, sl, vel) => Math.min(16000, 160 * Math.pow(2, sl * 5.5 + pr * 1.6 + vel * 0.6));
  const amp = (pr) => 0.11 * (0.25 + 0.75 * pr);

  function Voice(when) {
    const c = AC;
    this.pitch = c.createConstantSource(); this.pitch.offset.value = 0;
    const o1 = c.createOscillator(), o2 = c.createOscillator(), o3 = c.createOscillator();
    o1.type = 'sawtooth'; o2.type = 'square'; o3.type = 'sine';
    o1.frequency.value = 440; o2.frequency.value = 440; o3.frequency.value = 220;
    o1.detune.value = -6; o2.detune.value = 7;
    const g1 = c.createGain(), g2 = c.createGain(), g3 = c.createGain();
    g1.gain.value = 0.5; g2.gain.value = 0.22; g3.gain.value = 0.45;
    this.filt = c.createBiquadFilter(); this.filt.type = 'lowpass'; this.filt.Q.value = 5;
    this.vca = c.createGain(); this.vca.gain.value = 0;
    for (const o of [o1, o2, o3]) this.pitch.connect(o.detune);
    o1.connect(g1); o2.connect(g2); o3.connect(g3);
    g1.connect(this.filt); g2.connect(this.filt); g3.connect(this.filt);
    this.filt.connect(this.vca); this.vca.connect(master);
    this.srcs = [this.pitch, o1, o2, o3];
    for (const s of this.srcs) s.start(when);
    voices.add(this);
    o1.onended = () => { voices.delete(this); try { this.vca.disconnect(); } catch (e) { /* already gone */ } };
  }
  Voice.prototype.stop = function (when) { for (const s of this.srcs) { try { s.stop(when); } catch (e) { /* already stopped */ } } };
  Voice.prototype.kill = function () {
    const t = AC.currentTime;
    this.vca.gain.cancelScheduledValues(t); this.vca.gain.setTargetAtTime(0, t, 0.01); this.stop(t + 0.08);
  };

  function playNote(n, t0, spb, cutBeat) {
    const s = nStart(n), e = Math.min(nEnd(n), cutBeat);
    if (e <= s) return;
    const v = new Voice(t0);
    const dur = (e - s) * spb, steps = Math.max(2, Math.ceil(dur / 0.012));
    const P = v.pitch.offset, F = v.filt.frequency, G = v.vca.gain;
    for (let k = 0; k <= steps; k++) {
      const tt = s + (k / steps) * (e - s), q = ev(n, tt), at = t0 + (tt - s) * spb, el = at - t0;
      const gv = amp(q.pr) * (1 + n.vel * 1.3 * Math.exp(-el / 0.09));
      const fv = cutoff(q.pr, q.sl, n.vel * Math.exp(-el / 0.25));
      if (k === 0) { P.setValueAtTime(cents(q.p), at); F.setValueAtTime(fv, at); G.setValueAtTime(0, at); G.linearRampToValueAtTime(gv, at + 0.004); }
      else { P.linearRampToValueAtTime(cents(q.p), at); F.linearRampToValueAtTime(fv, at); if (el > 0.004) G.linearRampToValueAtTime(gv, at); }
    }
    const tEnd = t0 + dur, rel = 0.04 + (1 - n.rvel) * 0.45;
    G.setTargetAtTime(0, tEnd, rel / 4);
    v.stop(tEnd + rel + 0.1);
  }

  // live voices (keys, MIDI, audition while drawing)
  function liveOn(p, vel, pr = 0.6, sl = 0.3) {
    audio();
    const t = AC.currentTime, v = new Voice(t);
    v.pitch.offset.setValueAtTime(cents(p), t);
    v.filt.frequency.setValueAtTime(cutoff(pr, sl, vel), t);
    v.vca.gain.setValueAtTime(0, t); v.vca.gain.linearRampToValueAtTime(amp(pr) * (1 + vel), t + 0.005);
    v.vca.gain.setTargetAtTime(amp(pr), t + 0.01, 0.08);
    return v;
  }
  function liveSet(v, q) {
    const t = AC.currentTime;
    if (q.p != null) v.pitch.offset.setTargetAtTime(cents(q.p), t, 0.008);
    if (q.pr != null) v.vca.gain.setTargetAtTime(amp(q.pr), t, 0.02);
    if (q.pr != null || q.sl != null) v.filt.frequency.setTargetAtTime(cutoff(q.pr ?? 0.6, q.sl ?? 0.3, 0), t, 0.02);
  }
  function liveOff(v, rvel = 0.5) {
    const t = AC.currentTime, rel = 0.04 + (1 - rvel) * 0.45;
    v.vca.gain.cancelScheduledValues(t); v.vca.gain.setTargetAtTime(0, t, rel / 4); v.stop(t + rel + 0.1);
  }

  // ---------- transport ----------
  const T = { playing: false, pos: 0, A0: 0, T0: 0, until: 0, timer: null };
  const spb = () => 60 / S.bpm;
  function absNow() { return T.A0 + Math.max(0, AC.currentTime - T.T0) / spb(); }
  function songPos() {
    if (!T.playing) return T.pos;
    const a = absNow();
    return V.loop ? a % songLen() : a;
  }
  function play(from) {
    audio();
    T.playing = true; T.A0 = from ?? T.pos; T.T0 = AC.currentTime + 0.06; T.until = T.A0;
    if (echo) echo.delayTime.setValueAtTime(spb() * 0.75, AC.currentTime);
    if (rec.armed) beginEdit();
    tick(); T.timer = setInterval(tick, 25);
    ui();
  }
  function halt(resetPos) {
    if (T.playing) T.pos = songPos();
    if (resetPos) T.pos = 0;
    T.playing = false; clearInterval(T.timer);
    for (const v of [...voices]) if (!v.live) v.kill();
    finishRecording(); commitEdit();
    ui(); dirty = true;
  }
  function tick() {
    const L = V.loop ? songLen() : Infinity, A1 = T.until, A2 = absNow() + 0.15 / spb(), sp = spb();
    if (!V.loop && absNow() > songLen() + 0.25) { halt(true); return; }
    if (A2 <= A1) return;
    if (V.loop) {
      for (let k = Math.floor(A1 / L); k <= Math.floor((A2 - 1e-9) / L); k++) {
        const lo = Math.max(A1, k * L) - k * L, hi = Math.min(A2, (k + 1) * L) - k * L;
        for (const n of S.notes) { const s = nStart(n); if (s >= lo && s < hi && !n.rec) playNote(n, T.T0 + (k * L + s - T.A0) * sp, sp, L); }
      }
    } else {
      for (const n of S.notes) { const s = nStart(n); if (s >= A1 && s < A2 && !n.rec) playNote(n, T.T0 + (s - T.A0) * sp, sp, Infinity); }
    }
    T.until = A2;
  }
  function restartIfPlaying() { if (T.playing) { const p = songPos(); halt(false); T.pos = p; play(p); } }

  // ---------- recording & live input ----------
  const rec = { armed: false, active: new Map() };
  const held = new Map(); // source key -> {v, p, pr, sl, rv}
  function noteOn(src, p, vel) {
    if (held.has(src)) noteOff(src, 0.5);
    const h = { v: liveOn(p, vel), p, base: p, pr: 0.6, sl: 0.3 };
    h.v.live = true; held.set(src, h); dirty = true;
    if (rec.armed && T.playing) {
      const t = songPos(), n = mkNote([{ t, p, pr: 0.6, sl: 0.3 }], vel, 0.5);
      n.nodes.push({ ...n.nodes[0], t: t + 1e-3 }); n.rec = true;
      S.notes.push(n); rec.active.set(src, n);
    }
  }
  function noteMod(src, q) {
    const h = held.get(src); if (!h) return;
    Object.assign(h, q); liveSet(h.v, { p: h.p, pr: h.pr, sl: h.sl });
    const n = rec.active.get(src);
    if (n && T.playing) {
      const t = songPos(), N = n.nodes, last = N[N.length - 1];
      if (t < last.t) return; // loop wrapped, finalised on release
      const node = { t, p: h.p, pr: h.pr, sl: h.sl };
      if (t - N[N.length - 2].t >= 1 / 32 || N.length === 2) N.push(node); else Object.assign(last, node);
      dirty = true;
    }
  }
  function noteOff(src, rvel) {
    const h = held.get(src); if (!h) return;
    liveOff(h.v, rvel); held.delete(src); dirty = true;
    const n = rec.active.get(src);
    if (n) {
      const t = songPos(), last = n.nodes[n.nodes.length - 1];
      n.nodes.push({ t: t > last.t ? t : (V.loop ? songLen() : last.t + 0.25), p: h.p, pr: h.pr, sl: h.sl });
      n.rvel = rvel; finalizeRec(n); rec.active.delete(src);
    }
  }
  function finalizeRec(n) {
    delete n.rec;
    n.nodes = n.nodes.filter((q, i, a) => i === 0 || i === a.length - 1 || q.t - a[i - 1].t > 1e-3);
    normalize(n);
  }
  function finishRecording() {
    for (const [src, n] of rec.active) {
      const h = held.get(src), last = n.nodes[n.nodes.length - 1];
      n.nodes.push({ ...last, t: Math.max(T.pos, last.t + 0.125) }); finalizeRec(n);
    }
    rec.active.clear();
  }

  const KEYMAP = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ';': 16 };
  let keysOn = false, octave = 60, midiReady = false;
  const mpe = {}; // channel -> {src, bend, pr, sl}
  function initMidi() {
    if (midiReady || !navigator.requestMIDIAccess) return;
    midiReady = true;
    navigator.requestMIDIAccess().then((acc) => {
      const bind = () => acc.inputs.forEach((inp) => { inp.onmidimessage = onMidi; });
      bind(); acc.onstatechange = bind;
    }).catch(() => { midiReady = false; });
  }
  function onMidi(e) {
    const [st, d1, d2] = e.data, type = st & 0xf0, ch = st & 0x0f;
    const c = mpe[ch] || (mpe[ch] = { bend: 0, pr: 0.6, sl: 0.3, notes: new Set() });
    if (type === 0x90 && d2 > 0) { const src = 'm' + ch + ':' + d1; c.notes.add(d1); noteOn(src, d1 + c.bend, d2 / 127); }
    else if (type === 0x80 || (type === 0x90 && d2 === 0)) { c.notes.delete(d1); noteOff('m' + ch + ':' + d1, (d2 || 64) / 127); }
    else if (type === 0xe0) { c.bend = (((d2 << 7) | d1) - 8192) / 8192 * S.bend; for (const k of c.notes) noteMod('m' + ch + ':' + k, { p: k + c.bend }); }
    else if (type === 0xd0) { c.pr = d1 / 127; for (const k of c.notes) noteMod('m' + ch + ':' + k, { pr: c.pr }); }
    else if (type === 0xa0) { noteMod('m' + ch + ':' + d1, { pr: d2 / 127 }); }
    else if (type === 0xb0 && d1 === 74) { c.sl = d2 / 127; for (const k of c.notes) noteMod('m' + ch + ':' + k, { sl: c.sl }); }
  }

  // ---------- MPE MIDI export ----------
  function exportMidi() {
    const TPQ = 480, STEP = 15, E = [];
    const push = (tick, ord, bytes) => E.push({ tick, ord, bytes });
    const ccs = (ch, list) => list.forEach(([c, v]) => push(0, -3, [0xb0 | ch, c, v]));
    const us = Math.round(60000000 / S.bpm);
    push(0, -5, [0xff, 0x51, 0x03, (us >> 16) & 255, (us >> 8) & 255, us & 255]);
    push(0, -5, [0xff, 0x58, 0x04, 4, 2, 24, 8]);
    ccs(0, [[101, 0], [100, 6], [6, 15], [101, 127], [100, 127]]); // MPE zone: 15 member channels
    for (let ch = 1; ch <= 15; ch++) ccs(ch, [[101, 0], [100, 0], [6, clamp(S.bend, 1, 96)], [38, 0], [101, 127], [100, 127]]);
    const busy = new Array(16).fill(-1), used = new Array(16).fill(-1);
    const notes = [...S.notes].sort((a, b) => nStart(a) - nStart(b));
    notes.forEach((n, idx) => {
      const s = Math.round(nStart(n) * TPQ), e = Math.max(s + 1, Math.round(nEnd(n) * TPQ));
      let ch = -1;
      for (let c = 1; c <= 15; c++) if (busy[c] <= s && (ch < 0 || used[c] < used[ch])) ch = c;
      if (ch < 0) { ch = 1; for (let c = 2; c <= 15; c++) if (busy[c] < busy[ch]) ch = c; }
      busy[ch] = e; used[ch] = idx;
      const base = clamp(Math.round(n.nodes[0].p + S.transpose), 0, 127);
      const vals = (tick) => {
        const q = ev(n, tick / TPQ);
        const pb = clamp(Math.round(8192 + ((q.p + S.transpose - base) / S.bend) * 8192), 0, 16383);
        return { pb, pr: Math.round(q.pr * 127), sl: Math.round(q.sl * 127) };
      };
      let last = vals(s);
      push(s, 0, [0xe0 | ch, last.pb & 127, last.pb >> 7]);
      push(s, 0, [0xb0 | ch, 74, last.sl]);
      push(s, 0, [0xd0 | ch, last.pr]);
      push(s, 1, [0x90 | ch, base, clamp(Math.round(n.vel * 127), 1, 127)]);
      for (let t = s + STEP; t < e; t += STEP) {
        const v = vals(t);
        if (v.pb !== last.pb) push(t, 2, [0xe0 | ch, v.pb & 127, v.pb >> 7]);
        if (v.pr !== last.pr) push(t, 2, [0xd0 | ch, v.pr]);
        if (v.sl !== last.sl) push(t, 2, [0xb0 | ch, 74, v.sl]);
        last = v;
      }
      push(e, -1, [0x80 | ch, base, Math.round(n.rvel * 127)]);
    });
    E.sort((a, b) => a.tick - b.tick || a.ord - b.ord);
    const trk = [];
    const vlq = (n) => { const b = [n & 127]; while ((n >>= 7)) b.unshift((n & 127) | 128); return b; };
    let prev = 0;
    for (const x of E) { trk.push(...vlq(x.tick - prev), ...x.bytes); prev = x.tick; }
    trk.push(0, 0xff, 0x2f, 0);
    const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
    const bytes = new Uint8Array([0x4d, 0x54, 0x68, 0x64, ...u32(6), 0, 0, 0, 1, TPQ >> 8, TPQ & 255,
      0x4d, 0x54, 0x72, 0x6b, ...u32(trk.length), ...trk]);
    download(new Blob([bytes], { type: 'audio/midi' }), 'flux-pattern.mid');
  }
  function download(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  window.FLUX = { exportMidi, state: S, load, snapshot }; // handy for debugging / tests

  // ---------- hit testing ----------
  const touchR = () => (matchMedia('(pointer:coarse)').matches ? 16 : 9);
  function hitNode(x, y) {
    let best = null, bd = touchR();
    for (const n of S.notes) n.nodes.forEach((q, i) => {
      const d = Math.hypot(bx(q.t) - x, py(q.p) - y);
      if (d < bd) { bd = d; best = { n, i }; }
    });
    return best;
  }
  function hitLine(x, y) {
    const b = xb(x), r = touchR() * 0.8;
    for (let k = S.notes.length - 1; k >= 0; k--) {
      const n = S.notes[k];
      if (b < nStart(n) - 0.05 || b > nEnd(n) + 0.05) continue;
      if (Math.abs(py(ev(n, b).p) - y) < r) return n;
    }
    return null;
  }

  // ---------- pointer interaction ----------
  let lastTap = { t: 0, key: '' };
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId);
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    audio();
    if (y < RH && x > KW) { drag = { kind: 'seek' }; seek(x); return; }
    if (x < KW) { const p = Math.round(yp(y)); drag = { kind: 'audition', v: liveOn(p, 0.8), p }; drag.v.live = true; return; }
    const tool = e.button === 1 || e.button === 2 ? 'pan' : V.tool;
    if (tool === 'pan') { drag = { kind: 'pan', x, y, sx: V.sx, top: V.top }; return; }
    if (tool === 'draw') {
      beginEdit();
      const t = snapT(xb(x)), p = snapP(yp(y));
      drag = { kind: 'draw', pts: [{ x: bx(t), y: py(p), rawY: y }], t, p, v: liveOn(p, 0.8) };
      drag.v.live = true; dirty = true; return;
    }
    // select tool
    const hn = hitNode(x, y), now = performance.now();
    if (hn) {
      const key = hn.n.id + ':' + hn.i;
      if (now - lastTap.t < 350 && lastTap.key === key && hn.n.nodes.length > 2) {
        beginEdit(); hn.n.nodes.splice(hn.i, 1); selNode = null; commitEdit(); lastTap = { t: 0, key: '' }; dirty = true; return;
      }
      lastTap = { t: now, key };
      if (!sel.has(hn.n.id) && !e.shiftKey) sel.clear();
      sel.add(hn.n.id); selNode = { id: hn.n.id, i: hn.i };
      beginEdit();
      const q = hn.n.nodes[hn.i];
      drag = { kind: 'node', n: hn.n, i: hn.i, x, y, orig: { ...q }, vel: hn.n.vel, rvel: hn.n.rvel };
      dirty = true; return;
    }
    const hl = hitLine(x, y);
    if (hl) {
      beginEdit();
      if (e.shiftKey || e.altKey) { // add node on the line
        const t = xb(x), q = ev(hl, t), node = { t, p: q.p, pr: q.pr, sl: q.sl };
        hl.nodes.push(node); hl.nodes.sort((a, b) => a.t - b.t);
        const i = hl.nodes.indexOf(node);
        sel.clear(); sel.add(hl.id); selNode = { id: hl.id, i };
        drag = { kind: 'node', n: hl, i, x, y, orig: { ...node }, vel: hl.vel, rvel: hl.rvel };
      } else {
        if (e.ctrlKey || e.metaKey) { sel.has(hl.id) ? sel.delete(hl.id) : sel.add(hl.id); }
        else if (!sel.has(hl.id)) { sel.clear(); sel.add(hl.id); }
        selNode = null;
        const orig = new Map();
        for (const id of sel) { const n = byId(id); if (n) orig.set(id, { nodes: n.nodes.map((q) => ({ ...q })), vel: n.vel, rvel: n.rvel }); }
        drag = { kind: 'move', x, y, orig, anchor: nStart(hl) };
      }
      dirty = true; return;
    }
    drag = { kind: 'marquee', x0: x, y0: y, x1: x, y1: y, add: e.shiftKey };
  });

  cv.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    dirty = true;
    switch (drag.kind) {
      case 'seek': seek(x); break;
      case 'audition': { const p = Math.round(yp(y)); if (p !== drag.p) { drag.p = p; liveSet(drag.v, { p }); } break; }
      case 'pan': V.sx = Math.max(0, drag.sx - (x - drag.x) / V.ppb); V.top = clamp(drag.top + (y - drag.y) / V.pps, MINP + 10, MAXP + 1); break;
      case 'draw': {
        const pts = drag.pts, l = pts[pts.length - 1];
        if (x > l.x + 1) { pts.push({ x, y: py(snapP(yp(y))), rawY: y }); liveSet(drag.v, { p: yp(y) }); }
        break;
      }
      case 'node': {
        const n = drag.n, q = n.nodes[drag.i], dy = (drag.y - y) / 100;
        if (V.lane === 'pitch') {
          const lo = drag.i > 0 ? n.nodes[drag.i - 1].t + 1e-3 : -Infinity;
          const hi = drag.i < n.nodes.length - 1 ? n.nodes[drag.i + 1].t - 1e-3 : Infinity;
          q.t = clamp(snapT(xb(x)), Math.max(0, lo), hi);
          q.p = clamp(snapP(yp(y)), MINP, MAXP);
        } else if (V.lane === 'pr' || V.lane === 'sl') q[V.lane] = clamp(drag.orig[V.lane] + dy, 0, 1);
        else n[V.lane] = clamp(drag[V.lane] + dy, 0, 1);
        break;
      }
      case 'move': {
        const dyPx = drag.y - y;
        if (V.lane === 'pitch') {
          let dt = xb(x) - xb(drag.x); dt = snapT(drag.anchor + dt) - drag.anchor;
          let dp = (y - drag.y) / -V.pps; if (V.snap) dp = Math.round(dp);
          for (const [id, o] of drag.orig) { const n = byId(id); if (!n) continue;
            n.nodes.forEach((q, i) => { q.t = Math.max(0, o.nodes[i].t + dt); q.p = clamp(o.nodes[i].p + dp, MINP, MAXP); }); }
        } else {
          for (const [id, o] of drag.orig) { const n = byId(id); if (!n) continue;
            if (V.lane === 'vel' || V.lane === 'rvel') n[V.lane] = clamp(o[V.lane] + dyPx / 100, 0, 1);
            else n.nodes.forEach((q, i) => { q[V.lane] = clamp(o.nodes[i][V.lane] + dyPx / 100, 0, 1); }); }
        }
        break;
      }
      case 'marquee': drag.x1 = x; drag.y1 = y; break;
    }
  });

  const endPointer = () => {
    if (!drag) return;
    const d = drag; drag = null; dirty = true;
    if (d.kind === 'audition') liveOff(d.v);
    if (d.kind === 'draw') { liveOff(d.v); finishDraw(d); commitEdit(); }
    if (d.kind === 'node' || d.kind === 'move') { if (d.n) normalizeKeepSel(d.n); commitEdit(); }
    if (d.kind === 'marquee') {
      const x0 = Math.min(d.x0, d.x1), x1 = Math.max(d.x0, d.x1), y0 = Math.min(d.y0, d.y1), y1 = Math.max(d.y0, d.y1);
      if (!d.add) sel.clear();
      selNode = null;
      if (x1 - x0 > 3 || y1 - y0 > 3) {
        for (const n of S.notes) if (samples(n, 6).some((q) => { const X = bx(q.t), Y = py(q.p); return X >= x0 && X <= x1 && Y >= y0 && Y <= y1; })) sel.add(n.id);
      }
    }
    ui();
  };
  cv.addEventListener('pointerup', endPointer);
  cv.addEventListener('pointercancel', endPointer);

  function normalizeKeepSel(n) {
    const q = selNode && selNode.id === n.id ? n.nodes[selNode.i] : null;
    normalize(n);
    if (q) selNode.i = Math.max(0, n.nodes.indexOf(q));
  }

  // Ramer–Douglas–Peucker simplification of the freehand stroke
  function rdp(pts, eps) {
    if (pts.length < 3) return pts;
    const a = pts[0], b = pts[pts.length - 1];
    let idx = 0, md = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i], dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
      const d = Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
      if (d > md) { md = d; idx = i; }
    }
    if (md <= eps) return [a, b];
    return rdp(pts.slice(0, idx + 1), eps).slice(0, -1).concat(rdp(pts.slice(idx), eps));
  }
  function finishDraw(d) {
    let pts = d.pts;
    const minLen = grid() || 0.25;
    if (pts.length < 2 || xb(pts[pts.length - 1].x) - d.t < minLen * 0.5) {
      pts = [pts[0], { x: bx(d.t + minLen), y: pts[0].y }];
    }
    const simple = rdp(pts.map((q) => ({ x: q.x, y: q.y })), 5);
    const nodes = simple.map((q) => ({ t: xb(q.x), p: clamp(snapP(yp(q.y)), MINP, MAXP), pr: 0.6, sl: 0.3 }));
    nodes[0].t = d.t; nodes[0].p = d.p;
    const last = nodes[nodes.length - 1];
    const st = snapT(last.t); if (st > nodes[nodes.length - 2].t + 1e-3) last.t = st;
    // drop collinear same-pitch middle nodes
    const out = nodes.filter((q, i, a) => i === 0 || i === a.length - 1 || !(a[i - 1].p === q.p && a[i + 1].p === q.p));
    const n = mkNote(out, 0.8, 0.5); normalize(n);
    S.notes.push(n); sel.clear(); sel.add(n.id); selNode = null;
  }
  function seek(x) {
    const b = clamp(snapT(xb(x)), 0, songLen());
    if (T.playing) { halt(false); T.pos = b; play(b); } else T.pos = b;
    dirty = true;
  }

  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left;
    if (e.ctrlKey || e.metaKey) {
      const b = xb(x); V.ppb = clamp(V.ppb * Math.exp(-e.deltaY * 0.002), 10, 220); V.sx = Math.max(0, b - (x - KW) / V.ppb);
      $('#hzoom').value = V.ppb;
    } else if (e.shiftKey) V.sx = Math.max(0, V.sx + e.deltaY / V.ppb);
    else { V.sx = Math.max(0, V.sx + e.deltaX / V.ppb); V.top = clamp(V.top + e.deltaY / -V.pps / 2, MINP + 10, MAXP + 1); }
    dirty = true;
  }, { passive: false });

  // ---------- editing commands ----------
  function del() {
    if (!sel.size) return;
    beginEdit(); S.notes = S.notes.filter((n) => !sel.has(n.id)); sel.clear(); selNode = null; commitEdit(); dirty = true;
  }
  function copy() {
    const ns = S.notes.filter((n) => sel.has(n.id)); if (!ns.length) return;
    const t0 = Math.min(...ns.map(nStart));
    clip = ns.map((n) => ({ vel: n.vel, rvel: n.rvel, nodes: n.nodes.map((q) => ({ ...q, t: q.t - t0 })) }));
    hint('Copied ' + ns.length + ' note' + (ns.length > 1 ? 's' : '') + ' — Paste drops them at the playhead.');
  }
  function paste() {
    if (!clip.length) return;
    beginEdit(); sel.clear();
    const at = snapT(songPos());
    for (const c of clip) { const n = mkNote(c.nodes.map((q) => ({ ...q, t: q.t + at })), c.vel, c.rvel); S.notes.push(n); sel.add(n.id); }
    commitEdit(); dirty = true;
  }
  function quantise() {
    const q = grid() || 0.25, list = sel.size ? S.notes.filter((n) => sel.has(n.id)) : S.notes;
    beginEdit();
    for (const n of list) { n.nodes.forEach((k) => { k.t = Math.round(k.t / q) * q; k.p = Math.round(k.p); }); normalize(n); }
    commitEdit(); dirty = true;
  }

  // ---------- rendering ----------
  function resize() {
    const r = cv.parentElement.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1; W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); dirty = true;
  }
  new ResizeObserver(resize).observe($('#stage'));

  function alpha(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }

  function draw() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#0d0d18'; g.fillRect(0, 0, W, H);
    const pTop = Math.ceil(yp(RH)), pBot = Math.floor(yp(H));
    // rows
    for (let p = pBot - 1; p <= pTop + 1; p++) {
      const y = py(p) - V.pps / 2;
      if (BLACK[((p % 12) + 12) % 12]) { g.fillStyle = '#0a0a13'; g.fillRect(KW, y, W - KW, V.pps); }
      g.fillStyle = p % 12 === 0 ? '#2a2b45' : '#171828'; g.fillRect(KW, y + V.pps - 1, W - KW, 1);
    }
    // beats / bars / grid
    const b0 = Math.floor(V.sx), b1 = Math.ceil(xb(W)), q = grid();
    if (q && q * V.ppb >= 6) for (let t = Math.ceil(V.sx / q) * q; t <= b1; t += q) { g.fillStyle = '#141526'; g.fillRect(bx(t), RH, 1, H - RH); }
    for (let b = b0; b <= b1; b++) { g.fillStyle = b % 4 === 0 ? '#34365a' : '#1f2036'; g.fillRect(bx(b), RH, 1, H - RH); }
    const endX = bx(songLen());
    if (endX < W) { g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(Math.max(KW, endX), RH, W - endX, H - RH); }

    // notes
    const sounding = new Set();
    const pos = songPos();
    const bandH = Math.min(46, V.pps * 2.4);
    for (const n of S.notes) {
      if (bx(nEnd(n)) < KW || bx(nStart(n)) > W) continue;
      const isSel = sel.has(n.id), sm = samples(n, 3);
      if (T.playing && pos >= nStart(n) && pos < nEnd(n)) sounding.add(Math.round(ev(n, pos).p));
      const band = (key, col, a) => {
        g.beginPath(); g.moveTo(bx(sm[0].t), py(sm[0].p));
        for (const s of sm) g.lineTo(bx(s.t), py(s.p) - s[key] * bandH);
        for (let i = sm.length - 1; i >= 0; i--) g.lineTo(bx(sm[i].t), py(sm[i].p));
        g.closePath(); g.fillStyle = alpha(col, a); g.fill();
        g.beginPath(); sm.forEach((s, i) => (i ? g.lineTo : g.moveTo).call(g, bx(s.t), py(s.p) - s[key] * bandH));
        g.strokeStyle = alpha(col, Math.min(1, a + 0.35)); g.lineWidth = 1; g.stroke();
      };
      if (LANES.sl.on) band('sl', LANES.sl.c, isSel ? 0.22 : 0.14);
      if (LANES.pr.on) band('pr', LANES.pr.c, isSel ? 0.42 : 0.3);
      const xs = bx(nStart(n)), xe = bx(nEnd(n)), wedge = Math.min((xe - xs) / 2, V.ppb);
      if (LANES.vel.on) {
        const p0 = py(n.nodes[0].p), x2 = xs + wedge, p2 = py(ev(n, xb(x2)).p);
        g.beginPath(); g.moveTo(xs, p0); g.lineTo(xs, p0 - n.vel * bandH); g.lineTo(x2, p2); g.closePath();
        g.fillStyle = alpha(LANES.vel.c, 0.45); g.fill();
      }
      if (LANES.rvel.on) {
        const pe = py(n.nodes[n.nodes.length - 1].p), x2 = xe - wedge, p2 = py(ev(n, xb(x2)).p);
        g.beginPath(); g.moveTo(xe, pe); g.lineTo(xe, pe - n.rvel * bandH); g.lineTo(x2, p2); g.closePath();
        g.fillStyle = alpha(LANES.rvel.c, 0.4); g.fill();
      }
      g.beginPath(); sm.forEach((s, i) => (i ? g.lineTo : g.moveTo).call(g, bx(s.t), py(s.p)));
      g.lineWidth = isSel ? 3 : 2; g.strokeStyle = isSel ? '#9dffe2' : '#36e0b4';
      if (isSel) { g.shadowColor = '#36e0b4'; g.shadowBlur = 10; }
      g.stroke(); g.shadowBlur = 0;
      n.nodes.forEach((k, i) => {
        const X = bx(k.t), Y = py(k.p), last = i === n.nodes.length - 1, on = selNode && selNode.id === n.id && selNode.i === i;
        g.beginPath(); g.arc(X, Y, on ? 6 : 4.5, 0, Math.PI * 2);
        g.fillStyle = last ? '#f4f6ff' : '#d6f36a'; g.fill();
        g.lineWidth = on ? 2.5 : 1.2; g.strokeStyle = on ? '#ffffff' : '#11121f'; g.stroke();
      });
    }
    for (const h of held.values()) sounding.add(Math.round(h.p));

    // drawing preview
    if (drag && drag.kind === 'draw') {
      g.beginPath(); drag.pts.forEach((q, i) => (i ? g.lineTo : g.moveTo).call(g, q.x, q.y));
      g.strokeStyle = '#d6f36a'; g.lineWidth = 2; g.setLineDash([5, 4]); g.stroke(); g.setLineDash([]);
    }
    if (drag && drag.kind === 'marquee') {
      g.fillStyle = 'rgba(54,224,180,.08)'; g.strokeStyle = 'rgba(54,224,180,.7)'; g.lineWidth = 1;
      g.fillRect(drag.x0, drag.y0, drag.x1 - drag.x0, drag.y1 - drag.y0); g.strokeRect(drag.x0, drag.y0, drag.x1 - drag.x0, drag.y1 - drag.y0);
    }

    // keyboard
    g.fillStyle = '#05050a'; g.fillRect(0, RH, KW, H - RH);
    for (let p = pBot - 1; p <= pTop + 1; p++) {
      const y = py(p) - V.pps / 2, blk = BLACK[((p % 12) + 12) % 12];
      g.fillStyle = sounding.has(p) ? '#ff4d6d' : blk ? '#1a1b2a' : '#e8e9f2';
      g.fillRect(blk ? 0 : 0, y + 0.5, blk ? KW * 0.62 : KW - 1, V.pps - 1);
      if (p % 12 === 0 && V.pps >= 10) { g.fillStyle = '#444'; g.font = '9px system-ui'; g.fillText(NAMES[0] + (p / 12 - 1), KW - 20, y + V.pps / 2 + 3); }
    }

    // ruler
    g.fillStyle = '#12121f'; g.fillRect(0, 0, W, RH);
    if (V.loop) { g.fillStyle = 'rgba(54,224,180,.18)'; g.fillRect(Math.max(KW, bx(0)), RH - 5, Math.min(W, endX) - Math.max(KW, bx(0)), 5); }
    g.font = '10px system-ui'; g.fillStyle = '#8f91ad';
    for (let b = b0; b <= b1; b++) {
      const X = bx(b); if (X < KW) continue;
      if (b % 4 === 0) { g.fillRect(X, 6, 1, RH - 6); g.fillText(String(b / 4 + 1), X + 3, 14); }
      else if (V.ppb > 18) g.fillRect(X, RH - 6, 1, 6);
    }
    g.fillStyle = '#05050a'; g.fillRect(0, 0, KW, RH);
    g.fillStyle = '#8f91ad'; g.fillText('C' + (Math.round(octave / 12) - 1), 8, 15);

    // playhead
    const X = bx(pos);
    if (X >= KW && X <= W) {
      g.fillStyle = rec.armed && T.playing ? '#ff4d6d' : '#f0b54a';
      g.fillRect(X - 0.5, RH, 1.5, H - RH);
      g.beginPath(); g.moveTo(X - 5, RH - 9); g.lineTo(X + 5, RH - 9); g.lineTo(X, RH); g.fill();
    }
  }

  function frame() {
    if (T.playing && V.follow && !drag) {
      const X = bx(songPos());
      if (X > W - 40 || X < KW) { V.sx = Math.max(0, songPos() - 1); }
    }
    if (dirty || T.playing || held.size) { draw(); dirty = false; }
    requestAnimationFrame(frame);
  }

  // ---------- UI wiring ----------
  const HINTS = {
    draw: 'DRAW — press and drag to sketch a line; moving up/down while dragging makes glides. Snap pitch keeps nodes on semitones.',
    select: 'SELECT — drag nodes to bend pitch/time · drag a line to move it · Shift/Alt+click a line adds a node · double-tap a node deletes it · drag empty space to box-select · Edit menu switches dragging to pressure/slide/velocity.',
    pan: 'PAN — drag to scroll. Wheel scrolls, Shift+wheel scrolls time, Ctrl+wheel zooms. Right/middle-drag pans in any tool.',
  };
  function hint(msg) { $('#hint').textContent = msg; }
  function ui() {
    document.querySelectorAll('#tools button').forEach((b) => b.classList.toggle('on', b.dataset.tool === V.tool));
    $('#play').textContent = T.playing ? 'Pause' : 'Play';
    $('#play').classList.toggle('on', T.playing);
    $('#loop').classList.toggle('on', V.loop);
    $('#snap').classList.toggle('on', V.snap);
    $('#grid').textContent = 'Grid ' + GRIDS[V.gridIdx][1];
    $('#keys').classList.toggle('on', keysOn);
    $('#rec').classList.toggle('armed', rec.armed && !T.playing);
    $('#rec').classList.toggle('on', rec.armed && T.playing);
    $('#undo').disabled = !undoStack.length; $('#redo').disabled = !redoStack.length;
    hint(keysOn ? 'KEYS — play with A W S E D F T G Y H U J K O L P ; · Z/X shift octave · MIDI/MPE controllers work too. Arm Rec + Play to record.' : HINTS[V.tool]);
  }
  function syncInputs() { $('#bpm').value = S.bpm; $('#bars').value = S.bars; $('#transpose').value = S.transpose; $('#bend').value = S.bend; }
  function setTool(t) { V.tool = t; cv.style.cursor = t === 'pan' ? 'grab' : t === 'draw' ? 'crosshair' : 'default'; ui(); }

  document.querySelectorAll('#tools button').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
  $('#copy').onclick = copy; $('#paste').onclick = paste; $('#del').onclick = del;
  $('#undo').onclick = () => { undo(); ui(); }; $('#redo').onclick = () => { redo(); ui(); };
  $('#play').onclick = () => (T.playing ? halt(false) : play());
  $('#stop').onclick = () => halt(true);
  $('#rec').onclick = () => { rec.armed = !rec.armed; if (rec.armed) { initMidi(); if (!keysOn) { keysOn = true; } } ui(); };
  $('#keys').onclick = () => { keysOn = !keysOn; if (keysOn) { audio(); initMidi(); } ui(); };
  $('#loop').onclick = () => { V.loop = !V.loop; restartIfPlaying(); ui(); dirty = true; };
  $('#grid').onclick = () => { V.gridIdx = (V.gridIdx + 1) % GRIDS.length; ui(); dirty = true; };
  $('#snap').onclick = () => { V.snap = !V.snap; ui(); };
  $('#quant').onclick = quantise;
  $('#save').onclick = () => download(new Blob([JSON.stringify({ app: 'flux', v: 1, ...S }, null, 1)], { type: 'application/json' }), 'flux-pattern.json');
  $('#open').onclick = () => $('#file').click();
  $('#file').onchange = (e) => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then((txt) => { const before = snapshot(); try { load(txt); undoStack.push(before); persist(); } catch (err) { alert('Could not open file: ' + err.message); } ui(); });
    e.target.value = '';
  };
  $('#clear').onclick = () => { if (!S.notes.length || confirm('Clear all notes?')) { beginEdit(); S.notes = []; sel.clear(); commitEdit(); dirty = true; ui(); } };
  $('#midi').onclick = exportMidi;
  const num = (id, key, lo, hi, after) => $(id).addEventListener('change', (e) => {
    const v = clamp(Math.round(+e.target.value || S[key]), lo, hi); e.target.value = v;
    if (v !== S[key]) { beginEdit(); S[key] = v; commitEdit(); after && after(); dirty = true; ui(); }
  });
  num('#bpm', 'bpm', 30, 300, restartIfPlaying);
  num('#bars', 'bars', 1, 128);
  num('#transpose', 'transpose', -24, 24);
  num('#bend', 'bend', 1, 96);
  $('#lane').onchange = (e) => { V.lane = e.target.value; };
  $('#vzoom').oninput = (e) => { const c = yp((RH + H) / 2); V.pps = +e.target.value; V.top = c + (H - RH) / 2 / V.pps; dirty = true; };
  $('#hzoom').oninput = (e) => { V.ppb = +e.target.value; dirty = true; };

  const legend = $('#legend');
  for (const [k, l] of Object.entries(LANES)) {
    const lab = document.createElement('label');
    lab.innerHTML = `<input type="checkbox" checked><i style="background:${l.c}"></i>${l.label}`;
    lab.querySelector('input').onchange = (e) => { l.on = e.target.checked; dirty = true; };
    legend.appendChild(lab);
  }

  const isField = (e) => /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) && e.target.type !== 'range';
  window.addEventListener('keydown', (e) => {
    if (isField(e)) return;
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (k === ' ') { e.preventDefault(); T.playing ? halt(false) : play(); return; }
    if (mod) {
      if (k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); ui(); }
      else if (k === 'y') { e.preventDefault(); redo(); ui(); }
      else if (k === 'c') copy();
      else if (k === 'v') paste();
      else if (k === 'a') { e.preventDefault(); S.notes.forEach((n) => sel.add(n.id)); dirty = true; }
      return;
    }
    if (keysOn) {
      if (e.repeat) { if (k in KEYMAP) e.preventDefault(); return; }
      if (k in KEYMAP) { e.preventDefault(); noteOn('k' + k, octave + KEYMAP[k], 0.8); return; }
      if (k === 'z') { octave = Math.max(24, octave - 12); dirty = true; return; }
      if (k === 'x') { octave = Math.min(96, octave + 12); dirty = true; return; }
    }
    if (k === 'delete' || k === 'backspace') { e.preventDefault(); del(); }
    else if (k === 'escape') { sel.clear(); selNode = null; dirty = true; }
    else if (keysOn) return;
    else if (k === 'd') setTool('draw');
    else if (k === 's') setTool('select');
    else if (k === 'h') setTool('pan');
    else if (k === 'q') quantise();
    else if (k === 'l') $('#loop').click();
  });
  window.addEventListener('keyup', (e) => { const k = e.key.toLowerCase(); if (k in KEYMAP) noteOff('k' + k, 0.5); });
  window.addEventListener('blur', () => { for (const src of [...held.keys()]) noteOff(src, 0.5); });

  // ---------- boot ----------
  let saved = null;
  try { saved = localStorage.getItem('flux.pattern'); } catch (e) { /* storage unavailable */ }
  try { if (saved) load(saved); else demo(); } catch (e) { demo(); }
  if (!S.notes.length && !saved) demo();
  syncInputs(); setTool('select'); resize(); requestAnimationFrame(frame);
})();
