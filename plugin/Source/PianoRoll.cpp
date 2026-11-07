#include "PianoRoll.h"

namespace
{
const double kGrids[] = { 1.0, 0.5, 0.25, 0.125, 0.0 };
const char* kGridNames[] = { "1/4", "1/8", "1/16", "1/32", "Off" };
const bool kBlack[] = { false, true, false, true, false, false, true, false, true, false, true, false };

const juce::Colour cBg (0xff0d0d18), cBlackRow (0xff0a0a13), cRowLine (0xff171828), cCLine (0xff2a2b45),
    cBeat (0xff1f2036), cBar (0xff34365a), cSub (0xff141526), cRuler (0xff12121f), cMuted (0xff8f91ad),
    cLine (0xff36e0b4), cLineSel (0xff9dffe2), cNode (0xffd6f36a), cEnd (0xfff4f6ff),
    cVel (0xfff0b54a), cRvel (0xffb48cff), cPr (0xff3d8bff), cSl (0xff9aa3b5), cHot (0xffff4d6d);

std::vector<juce::Point<float>> rdp (const std::vector<juce::Point<float>>& pts, float eps)
{
    if (pts.size() < 3) return pts;
    const auto a = pts.front(), b = pts.back();
    size_t idx = 0;
    float md = 0.0f;
    const float dx = b.x - a.x, dy = b.y - a.y, len = std::max (1.0f, std::hypot (dx, dy));
    for (size_t i = 1; i + 1 < pts.size(); ++i)
    {
        const auto p = pts[i];
        const float d = std::abs (dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
        if (d > md) { md = d; idx = i; }
    }
    if (md <= eps) return { a, b };
    auto left = rdp ({ pts.begin(), pts.begin() + (long) idx + 1 }, eps);
    auto right = rdp ({ pts.begin() + (long) idx, pts.end() }, eps);
    left.pop_back();
    left.insert (left.end(), right.begin(), right.end());
    return left;
}
} // namespace

PianoRoll::PianoRoll (FluxProcessor& p) : proc (p)
{
    setWantsKeyboardFocus (true);
    setMouseCursor (juce::MouseCursor::NormalCursor);
}

double PianoRoll::grid() const { return kGrids[gridIdx]; }
juce::String PianoRoll::gridName() const { return kGridNames[gridIdx]; }
double PianoRoll::snapT (double b) const
{
    const double q = grid();
    return q > 0 ? std::round (b / q) * q : b;
}

void PianoRoll::edited()
{
    proc.publish();
    repaint();
    if (onStateChange) onStateChange();
}

void PianoRoll::setVZoom (double v)
{
    const double c = yp ((kRH + (float) getHeight()) * 0.5f);
    pps = v;
    top = c + (getHeight() - kRH) * 0.5 / pps;
    repaint();
}

void PianoRoll::clearSelection()
{
    sel.clear();
    selNode = {};
    repaint();
}

void PianoRoll::tick()
{
    const double pos = proc.displayPos.load();
    const bool playing = proc.displayPlaying.load();
    if (playing && follow && drag == Drag::None)
    {
        const float x = bx (pos);
        if (x > (float) getWidth() - 40.0f || x < kKW) sx = std::max (0.0, pos - 1.0);
    }
    if (playing || pos != lastPos || proc.recArmed.load()) repaint();
    lastPos = pos;
}

// ---------------------------------------------------------------- audition via the processor's GUI MIDI queue
void PianoRoll::sendGui (juce::MidiMessage m)
{
    if (! proc.prepared.load()) return;
    m.setTimeStamp (juce::Time::getMillisecondCounterHiRes() * 0.001);
    proc.guiMidi.addMessageToQueue (m);
}

void PianoRoll::auditionOn (double p)
{
    auditionOff();
    audNote = juce::jlimit (0, 127, (int) std::lround (p));
    sendGui (juce::MidiMessage::pitchWheel (16, flux::pitchBendValue (p, audNote, M().bend)));
    sendGui (juce::MidiMessage::noteOn (16, audNote, (juce::uint8) 100));
}

void PianoRoll::auditionMove (double p)
{
    if (audNote >= 0) sendGui (juce::MidiMessage::pitchWheel (16, flux::pitchBendValue (p, audNote, M().bend)));
}

void PianoRoll::auditionOff()
{
    if (audNote < 0) return;
    sendGui (juce::MidiMessage::noteOff (16, audNote, (juce::uint8) 64));
    sendGui (juce::MidiMessage::pitchWheel (16, 8192));
    audNote = -1;
}

// ---------------------------------------------------------------- hit tests
PianoRoll::NodeHit PianoRoll::hitNode (juce::Point<float> pt) const
{
    NodeHit best;
    float bd = 9.0f;
    for (const auto& n : proc.model.notes)
        for (size_t i = 0; i < n.nodes.size(); ++i)
        {
            const float d = pt.getDistanceFrom ({ bx (n.nodes[i].t), py (n.nodes[i].p) });
            if (d < bd) { bd = d; best = { n.id, (int) i }; }
        }
    return best;
}

int PianoRoll::hitLine (juce::Point<float> pt) const
{
    const double b = xb (pt.x);
    const auto& notes = proc.model.notes;
    for (int k = (int) notes.size() - 1; k >= 0; --k)
    {
        const auto& n = notes[(size_t) k];
        if (n.nodes.size() < 2 || b < n.start() - 0.05 || b > n.end() + 0.05) continue;
        if (std::abs (py (n.eval (b).p) - pt.y) < 7.0f) return n.id;
    }
    return -1;
}

// ---------------------------------------------------------------- mouse
void PianoRoll::mouseDown (const juce::MouseEvent& e)
{
    grabKeyboardFocus();
    const auto pt = e.position;
    d0 = d1 = pt;

    if (pt.y < kRH && pt.x > kKW) { drag = Drag::Seek; seek (pt.x); return; }
    if (pt.x < kKW) { drag = Drag::Audition; auditionOn (std::round (yp (pt.y))); return; }

    const auto t = (e.mods.isMiddleButtonDown() || e.mods.isPopupMenu()) ? Tool::Pan : tool;
    if (t == Tool::Pan)
    {
        drag = Drag::Pan; dSx = sx; dTop = top;
        setMouseCursor (juce::MouseCursor::DraggingHandCursor);
        return;
    }
    if (t == Tool::Draw)
    {
        proc.beginEdit();
        drawT = std::max (0.0, snapT (xb (pt.x)));
        drawP = juce::jlimit ((double) kMinP, (double) kMaxP, snapP (yp (pt.y)));
        drawPts = { { bx (drawT), py (drawP) } };
        drag = Drag::Draw;
        auditionOn (drawP);
        repaint();
        return;
    }

    // select tool
    const auto hn = hitNode (pt);
    if (hn.id >= 0)
    {
        auto* n = M().find (hn.id);
        if (! sel.count (hn.id) && ! e.mods.isShiftDown()) sel.clear();
        sel.insert (hn.id);
        selNode = hn;
        proc.beginEdit();
        dOrigNode = n->nodes[(size_t) hn.i];
        dVel = n->vel;
        dRvel = n->rvel;
        drag = Drag::Node;
        repaint();
        if (onStateChange) onStateChange();
        return;
    }

    const int hl = hitLine (pt);
    if (hl >= 0)
    {
        proc.beginEdit();
        auto* n = M().find (hl);
        if (e.mods.isShiftDown() || e.mods.isAltDown())
        {
            const auto q = n->eval (xb (pt.x));
            n->nodes.push_back (q);
            n->normalize();
            int idx = 0;
            for (size_t i = 0; i < n->nodes.size(); ++i)
                if (std::abs (n->nodes[i].t - q.t) < 1e-9) idx = (int) i;
            sel.clear();
            sel.insert (hl);
            selNode = { hl, idx };
            dOrigNode = q;
            dVel = n->vel;
            dRvel = n->rvel;
            drag = Drag::Node;
            edited();
            return;
        }
        if (e.mods.isCommandDown()) { if (sel.count (hl)) sel.erase (hl); else sel.insert (hl); }
        else if (! sel.count (hl)) { sel.clear(); sel.insert (hl); }
        selNode = {};
        dOrig.clear();
        for (int id : sel)
            if (auto* s = M().find (id)) dOrig[id] = *s;
        dAnchor = n->start();
        drag = Drag::Move;
        repaint();
        if (onStateChange) onStateChange();
        return;
    }

    drag = Drag::Marquee;
    marqueeAdd = e.mods.isShiftDown();
}

void PianoRoll::mouseDrag (const juce::MouseEvent& e)
{
    const auto pt = e.position;
    d1 = pt;
    switch (drag)
    {
        case Drag::Seek: seek (pt.x); break;
        case Drag::Audition:
        {
            const int p = (int) std::round (yp (pt.y));
            if (p != audNote) auditionOn (p);
            break;
        }
        case Drag::Pan:
            sx = std::max (0.0, dSx - (pt.x - d0.x) / ppb);
            top = juce::jlimit ((double) kMinP + 10.0, (double) kMaxP + 1.0, dTop + (pt.y - d0.y) / pps);
            break;
        case Drag::Draw:
            if (pt.x > drawPts.back().x + 1.0f)
            {
                drawPts.push_back ({ pt.x, py (snapP (yp (pt.y))) });
                auditionMove (yp (pt.y));
            }
            break;
        case Drag::Node:
        {
            auto* n = M().find (selNode.id);
            if (n == nullptr) break;
            auto& q = n->nodes[(size_t) selNode.i];
            const float dy = (d0.y - pt.y) / 100.0f;
            switch (lane)
            {
                case Lane::Pitch:
                {
                    const double lo = selNode.i > 0 ? n->nodes[(size_t) selNode.i - 1].t + 1e-3 : 0.0;
                    const double hi = selNode.i + 1 < (int) n->nodes.size() ? n->nodes[(size_t) selNode.i + 1].t - 1e-3 : 1e9;
                    q.t = juce::jlimit (std::max (0.0, lo), std::max (lo, hi), snapT (xb (pt.x)));
                    q.p = juce::jlimit ((double) kMinP, (double) kMaxP, snapP (yp (pt.y)));
                    break;
                }
                case Lane::Pressure: q.pr = juce::jlimit (0.0f, 1.0f, dOrigNode.pr + dy); break;
                case Lane::Slide:    q.sl = juce::jlimit (0.0f, 1.0f, dOrigNode.sl + dy); break;
                case Lane::Velocity: n->vel = juce::jlimit (0.0f, 1.0f, dVel + dy); break;
                case Lane::ReleaseVel: n->rvel = juce::jlimit (0.0f, 1.0f, dRvel + dy); break;
            }
            edited();
            break;
        }
        case Drag::Move:
        {
            const float dyPx = d0.y - pt.y;
            if (lane == Lane::Pitch)
            {
                double dt = xb (pt.x) - xb (d0.x);
                dt = snapT (dAnchor + dt) - dAnchor;
                double dp = (pt.y - d0.y) / -pps;
                if (snap) dp = std::round (dp);
                for (auto& [id, o] : dOrig)
                    if (auto* n = M().find (id))
                        for (size_t i = 0; i < n->nodes.size() && i < o.nodes.size(); ++i)
                        {
                            n->nodes[i].t = std::max (0.0, o.nodes[i].t + dt);
                            n->nodes[i].p = juce::jlimit ((double) kMinP, (double) kMaxP, o.nodes[i].p + dp);
                        }
            }
            else
            {
                const float d = dyPx / 100.0f;
                for (auto& [id, o] : dOrig)
                    if (auto* n = M().find (id))
                    {
                        if (lane == Lane::Velocity) n->vel = juce::jlimit (0.0f, 1.0f, o.vel + d);
                        else if (lane == Lane::ReleaseVel) n->rvel = juce::jlimit (0.0f, 1.0f, o.rvel + d);
                        else
                            for (size_t i = 0; i < n->nodes.size() && i < o.nodes.size(); ++i)
                            {
                                if (lane == Lane::Pressure) n->nodes[i].pr = juce::jlimit (0.0f, 1.0f, o.nodes[i].pr + d);
                                else n->nodes[i].sl = juce::jlimit (0.0f, 1.0f, o.nodes[i].sl + d);
                            }
                    }
            }
            edited();
            break;
        }
        case Drag::Marquee:
        case Drag::None: break;
    }
    repaint();
}

void PianoRoll::mouseUp (const juce::MouseEvent&)
{
    const auto d = drag;
    drag = Drag::None;
    setMouseCursor (tool == Tool::Pan ? juce::MouseCursor::DraggingHandCursor
                    : tool == Tool::Draw ? juce::MouseCursor::CrosshairCursor : juce::MouseCursor::NormalCursor);
    if (d == Drag::Audition) auditionOff();
    if (d == Drag::Draw) { auditionOff(); finishDraw(); proc.commitEdit(); }
    if (d == Drag::Node)
    {
        if (auto* n = M().find (selNode.id))
        {
            const auto q = n->nodes[(size_t) selNode.i];
            n->normalize();
            for (size_t i = 0; i < n->nodes.size(); ++i)
                if (std::abs (n->nodes[i].t - q.t) < 1e-9) selNode.i = (int) i;
        }
        proc.commitEdit();
    }
    if (d == Drag::Move) proc.commitEdit();
    if (d == Drag::Marquee)
    {
        const auto r = juce::Rectangle<float> (d0, d1);
        if (! marqueeAdd) sel.clear();
        selNode = {};
        if (r.getWidth() > 3 || r.getHeight() > 3)
            for (const auto& n : M().notes)
            {
                if (n.nodes.size() < 2) continue;
                const double step = std::max (1e-3, 6.0 / ppb);
                for (double t = n.start(); t <= n.end(); t += step)
                    if (r.contains (bx (t), py (n.eval (t).p))) { sel.insert (n.id); break; }
            }
    }
    repaint();
    if (onStateChange) onStateChange();
}

void PianoRoll::mouseDoubleClick (const juce::MouseEvent& e)
{
    if (tool != Tool::Select) return;
    const auto hn = hitNode (e.position);
    if (hn.id < 0) return;
    auto* n = M().find (hn.id);
    if (n == nullptr || n->nodes.size() <= 2) return;
    proc.beginEdit();
    n->nodes.erase (n->nodes.begin() + hn.i);
    selNode = {};
    proc.commitEdit();
    edited();
}

void PianoRoll::mouseMove (const juce::MouseEvent& e)
{
    if (tool != Tool::Select) return;
    const bool over = hitNode (e.position).id >= 0;
    setMouseCursor (over ? juce::MouseCursor::DraggingHandCursor : juce::MouseCursor::NormalCursor);
}

void PianoRoll::mouseWheelMove (const juce::MouseEvent& e, const juce::MouseWheelDetails& w)
{
    if (e.mods.isCommandDown())
    {
        const double b = xb (e.position.x);
        ppb = juce::jlimit (10.0, 220.0, ppb * std::exp (w.deltaY * 1.5));
        sx = std::max (0.0, b - (e.position.x - kKW) / ppb);
        if (onStateChange) onStateChange();
    }
    else if (e.mods.isShiftDown())
        sx = std::max (0.0, sx - (w.deltaY + w.deltaX) * 200.0 / ppb);
    else
    {
        sx = std::max (0.0, sx - w.deltaX * 200.0 / ppb);
        top = juce::jlimit ((double) kMinP + 10.0, (double) kMaxP + 1.0, top + w.deltaY * 12.0);
    }
    repaint();
}

void PianoRoll::seek (float x)
{
    const double b = juce::jlimit (0.0, M().length(), snapT (xb (x)));
    proc.seekRequest = b;
    proc.displayPos = b;
    repaint();
}

void PianoRoll::finishDraw()
{
    auto pts = drawPts;
    const double minLen = grid() > 0 ? grid() : 0.25;
    if (pts.size() < 2 || xb (pts.back().x) - drawT < minLen * 0.5)
        pts = { pts.front(), { bx (drawT + minLen), pts.front().y } };
    const auto simple = rdp (pts, 5.0f);
    std::vector<flux::Node> nodes;
    for (const auto& q : simple)
        nodes.push_back ({ xb (q.x), juce::jlimit ((double) kMinP, (double) kMaxP, snapP (yp (q.y))), 0.6f, 0.3f });
    nodes.front().t = drawT;
    nodes.front().p = drawP;
    if (nodes.size() >= 2)
    {
        const double st = snapT (nodes.back().t);
        if (st > nodes[nodes.size() - 2].t + 1e-3) nodes.back().t = st;
    }
    std::vector<flux::Node> out;
    for (size_t i = 0; i < nodes.size(); ++i)
    {
        const bool mid = i > 0 && i + 1 < nodes.size();
        if (mid && nodes[i - 1].p == nodes[i].p && nodes[i + 1].p == nodes[i].p) continue;
        out.push_back (nodes[i]);
    }
    auto& n = M().add (std::move (out), 0.8f, 0.5f);
    n.normalize (minLen);
    sel.clear();
    sel.insert (n.id);
    selNode = {};
    edited();
}

// ---------------------------------------------------------------- commands
void PianoRoll::copy()
{
    clip.clear();
    double t0 = 1e18;
    for (const auto& n : M().notes)
        if (sel.count (n.id)) { clip.push_back (n); t0 = std::min (t0, n.start()); }
    for (auto& n : clip)
        for (auto& q : n.nodes) q.t -= t0;
}

void PianoRoll::paste()
{
    if (clip.empty()) return;
    proc.beginEdit();
    sel.clear();
    const double at = snapT (proc.displayPos.load());
    for (const auto& c : clip)
    {
        auto nodes = c.nodes;
        for (auto& q : nodes) q.t += at;
        sel.insert (M().add (std::move (nodes), c.vel, c.rvel).id);
    }
    proc.commitEdit();
    edited();
}

void PianoRoll::deleteSelection()
{
    if (sel.empty()) return;
    proc.beginEdit();
    auto& ns = M().notes;
    ns.erase (std::remove_if (ns.begin(), ns.end(), [this] (const flux::Note& n) { return sel.count (n.id) > 0; }), ns.end());
    sel.clear();
    selNode = {};
    proc.commitEdit();
    edited();
}

void PianoRoll::quantise()
{
    const double q = grid() > 0 ? grid() : 0.25;
    proc.beginEdit();
    for (auto& n : M().notes)
    {
        if (! sel.empty() && ! sel.count (n.id)) continue;
        for (auto& k : n.nodes) { k.t = std::round (k.t / q) * q; k.p = std::round (k.p); }
        n.normalize (q);
    }
    selNode = {};
    proc.commitEdit();
    edited();
}

void PianoRoll::selectAll()
{
    for (const auto& n : M().notes) sel.insert (n.id);
    repaint();
    if (onStateChange) onStateChange();
}

bool PianoRoll::keyPressed (const juce::KeyPress& k)
{
    const auto cmd = k.getModifiers().isCommandDown();
    const auto c = juce::CharacterFunctions::toLowerCase (k.getTextCharacter());
    if (k == juce::KeyPress::spaceKey) { if (onTogglePlay) onTogglePlay(); return true; }
    if (k == juce::KeyPress::deleteKey || k == juce::KeyPress::backspaceKey) { deleteSelection(); return true; }
    if (k == juce::KeyPress::escapeKey) { clearSelection(); return true; }
    if (cmd)
    {
        const int code = juce::CharacterFunctions::toLowerCase ((juce::juce_wchar) k.getKeyCode());
        if (code == 'z') { if (k.getModifiers().isShiftDown()) proc.redo(); else proc.undo(); sel.clear(); edited(); return true; }
        if (code == 'y') { proc.redo(); sel.clear(); edited(); return true; }
        if (code == 'c') { copy(); return true; }
        if (code == 'v') { paste(); return true; }
        if (code == 'a') { selectAll(); return true; }
        return false;
    }
    if (c == 'd') { tool = Tool::Draw; if (onStateChange) onStateChange(); return true; }
    if (c == 's') { tool = Tool::Select; if (onStateChange) onStateChange(); return true; }
    if (c == 'h') { tool = Tool::Pan; if (onStateChange) onStateChange(); return true; }
    if (c == 'q') { quantise(); return true; }
    return false;
}

// ---------------------------------------------------------------- painting
void PianoRoll::paint (juce::Graphics& g)
{
    using namespace juce;
    const float W = (float) getWidth(), H = (float) getHeight();
    g.fillAll (cBg);
    const int pTop = (int) std::ceil (yp (kRH)), pBot = (int) std::floor (yp (H));
    const float rowH = (float) pps;

    for (int p = pBot - 1; p <= pTop + 1; ++p)
    {
        const float y = py (p) - rowH / 2;
        if (kBlack[((p % 12) + 12) % 12]) { g.setColour (cBlackRow); g.fillRect (kKW, y, W - kKW, rowH); }
        g.setColour (p % 12 == 0 ? cCLine : cRowLine);
        g.fillRect (kKW, y + rowH - 1, W - kKW, 1.0f);
    }

    const int b0 = (int) std::floor (sx), b1 = (int) std::ceil (xb (W));
    const double q = grid();
    if (q > 0 && q * ppb >= 6)
    {
        g.setColour (cSub);
        for (double t = std::ceil (sx / q) * q; t <= b1; t += q) g.fillRect (bx (t), kRH, 1.0f, H - kRH);
    }
    for (int b = b0; b <= b1; ++b)
    {
        g.setColour (b % 4 == 0 ? cBar : cBeat);
        g.fillRect (bx (b), kRH, 1.0f, H - kRH);
    }
    const float endX = bx (M().length());
    if (endX < W)
    {
        g.setColour (Colours::black.withAlpha (0.45f));
        g.fillRect (std::max (kKW, endX), kRH, W - std::max (kKW, endX), H - kRH);
    }

    // notes
    const float bandH = (float) std::min (46.0, pps * 2.4);
    for (const auto& n : M().notes)
    {
        if (n.nodes.empty()) continue;
        if (bx (n.end()) < kKW || bx (n.start()) > W) continue;
        const bool isSel = sel.count (n.id) > 0;

        std::vector<flux::Node> sm;
        const double step = std::max (1e-3, 3.0 / ppb);
        for (double t = n.start(); t < n.end(); t += step) sm.push_back (n.eval (t));
        sm.push_back (n.nodes.back());

        auto band = [&] (bool pressure, Colour col, float alpha)
        {
            Path fill, edge;
            fill.startNewSubPath (bx (sm.front().t), py (sm.front().p));
            for (size_t i = 0; i < sm.size(); ++i)
            {
                const float v = pressure ? sm[i].pr : sm[i].sl;
                const Point<float> pt (bx (sm[i].t), py (sm[i].p) - v * bandH);
                fill.lineTo (pt);
                if (i == 0) edge.startNewSubPath (pt); else edge.lineTo (pt);
            }
            for (size_t i = sm.size(); i-- > 0;) fill.lineTo (bx (sm[i].t), py (sm[i].p));
            fill.closeSubPath();
            g.setColour (col.withAlpha (alpha));
            g.fillPath (fill);
            g.setColour (col.withAlpha (std::min (1.0f, alpha + 0.35f)));
            g.strokePath (edge, PathStrokeType (1.0f));
        };
        if (sm.size() > 1)
        {
            if (showSl) band (false, cSl, isSel ? 0.22f : 0.14f);
            if (showPr) band (true, cPr, isSel ? 0.42f : 0.3f);
        }

        const float xs = bx (n.start()), xe = bx (n.end());
        const float wedge = std::min ((xe - xs) / 2, (float) ppb);
        if (showVel && wedge > 0)
        {
            const float p0 = py (n.nodes.front().p), x2 = xs + wedge, p2 = py (n.eval (xb (x2)).p);
            Path w;
            w.addTriangle (xs, p0, xs, p0 - n.vel * bandH, x2, p2);
            g.setColour (cVel.withAlpha (0.45f));
            g.fillPath (w);
        }
        if (showRvel && wedge > 0)
        {
            const float pe = py (n.nodes.back().p), x2 = xe - wedge, p2 = py (n.eval (xb (x2)).p);
            Path w;
            w.addTriangle (xe, pe, xe, pe - n.rvel * bandH, x2, p2);
            g.setColour (cRvel.withAlpha (0.4f));
            g.fillPath (w);
        }

        Path line;
        for (size_t i = 0; i < sm.size(); ++i)
        {
            const Point<float> pt (bx (sm[i].t), py (sm[i].p));
            if (i == 0) line.startNewSubPath (pt); else line.lineTo (pt);
        }
        if (isSel)
        {
            g.setColour (cLine.withAlpha (0.25f));
            g.strokePath (line, PathStrokeType (7.0f, PathStrokeType::curved, PathStrokeType::rounded));
        }
        g.setColour (isSel ? cLineSel : cLine);
        g.strokePath (line, PathStrokeType (isSel ? 3.0f : 2.0f, PathStrokeType::curved, PathStrokeType::rounded));

        for (size_t i = 0; i < n.nodes.size(); ++i)
        {
            const bool last = i + 1 == n.nodes.size() && ! n.recording;
            const bool on = selNode.id == n.id && selNode.i == (int) i;
            const float r = on ? 6.0f : 4.5f;
            const auto c = Rectangle<float> (r * 2, r * 2).withCentre ({ bx (n.nodes[i].t), py (n.nodes[i].p) });
            g.setColour (last ? cEnd : cNode);
            g.fillEllipse (c);
            g.setColour (on ? Colours::white : Colour (0xff11121f));
            g.drawEllipse (c, on ? 2.5f : 1.2f);
        }
    }

    if (drag == Drag::Draw && drawPts.size() > 1)
    {
        Path pth;
        pth.startNewSubPath (drawPts.front());
        for (size_t i = 1; i < drawPts.size(); ++i) pth.lineTo (drawPts[i]);
        Path dashed;
        const float dashes[] = { 5.0f, 4.0f };
        PathStrokeType (2.0f).createDashedStroke (dashed, pth, dashes, 2);
        g.setColour (cNode);
        g.fillPath (dashed);
    }
    if (drag == Drag::Marquee)
    {
        const auto r = Rectangle<float> (d0, d1);
        g.setColour (cLine.withAlpha (0.08f));
        g.fillRect (r);
        g.setColour (cLine.withAlpha (0.7f));
        g.drawRect (r, 1.0f);
    }

    // keyboard
    const juce::uint64 bits[2] = { proc.sounding[0].load(), proc.sounding[1].load() };
    g.setColour (Colour (0xff05050a));
    g.fillRect (0.0f, kRH, kKW, H - kRH);
    g.setFont (FontOptions (9.0f));
    for (int p = pBot - 1; p <= pTop + 1; ++p)
    {
        if (p < 0 || p > 127) continue;
        const float y = py (p) - rowH / 2;
        const bool blk = kBlack[p % 12];
        const bool hot = ((bits[p >> 6] >> (p & 63)) & 1) != 0 || p == audNote;
        g.setColour (hot ? cHot : blk ? Colour (0xff1a1b2a) : Colour (0xffe8e9f2));
        g.fillRect (0.0f, y + 0.5f, blk ? kKW * 0.62f : kKW - 1.0f, rowH - 1.0f);
        if (p % 12 == 0 && pps >= 10)
        {
            g.setColour (Colour (0xff444444));
            g.drawText ("C" + String (p / 12 - 1), Rectangle<float> (kKW - 22, y, 20, rowH), Justification::centredRight);
        }
    }

    // ruler
    g.setColour (cRuler);
    g.fillRect (0.0f, 0.0f, W, kRH);
    if (proc.apvts.getRawParameterValue ("loop")->load() > 0.5f)
    {
        const float x0 = std::max (kKW, bx (0)), x1 = std::min (W, endX);
        g.setColour (cLine.withAlpha (0.25f));
        if (x1 > x0) g.fillRect (x0, kRH - 5, x1 - x0, 5.0f);
    }
    g.setFont (FontOptions (10.0f));
    for (int b = b0; b <= b1; ++b)
    {
        const float x = bx (b);
        if (x < kKW) continue;
        g.setColour (cMuted);
        if (b % 4 == 0)
        {
            g.fillRect (x, 6.0f, 1.0f, kRH - 6);
            g.drawText (String (b / 4 + 1), Rectangle<float> (x + 3, 2, 40, 14), Justification::centredLeft);
        }
        else if (ppb > 18)
            g.fillRect (x, kRH - 6, 1.0f, 6.0f);
    }
    g.setColour (Colour (0xff05050a));
    g.fillRect (0.0f, 0.0f, kKW, kRH);

    // playhead
    const double pos = proc.displayPos.load();
    const float x = bx (pos);
    if (x >= kKW && x <= W)
    {
        const bool rec = proc.recArmed.load() && proc.displayPlaying.load();
        g.setColour (rec ? cHot : cVel);
        g.fillRect (x - 0.5f, kRH, 1.5f, H - kRH);
        Path tri;
        tri.addTriangle (x - 5, kRH - 9, x + 5, kRH - 9, x, kRH);
        g.fillPath (tri);
    }
}
