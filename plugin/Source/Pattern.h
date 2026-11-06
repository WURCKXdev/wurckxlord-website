#pragma once
// FLUX pattern model: notes are curves of nodes with pitch glides and per-node expression.
// The JSON format is shared with the browser version (flux/index.html).

#include <juce_core/juce_core.h>
#include <juce_audio_basics/juce_audio_basics.h>
#include <algorithm>
#include <cmath>
#include <vector>

namespace flux
{
struct Node
{
    double t = 0.0;   // position in beats
    double p = 60.0;  // MIDI pitch (fractional = bent)
    float pr = 0.55f; // pressure 0..1
    float sl = 0.25f; // slide (CC74) 0..1
};

struct Note
{
    int id = 0;
    float vel = 0.8f, rvel = 0.5f;
    std::vector<Node> nodes;
    bool recording = false; // still being recorded; not played back yet

    double start() const { return nodes.front().t; }
    double end() const   { return nodes.back().t; }

    Node eval (double t) const
    {
        if (t <= nodes.front().t) return nodes.front();
        if (t >= nodes.back().t)  return nodes.back();
        size_t i = 0;
        while (i + 2 < nodes.size() && nodes[i + 1].t < t) ++i;
        const auto& a = nodes[i];
        const auto& b = nodes[i + 1];
        const double d = b.t - a.t;
        const double u = d > 0.0 ? (t - a.t) / d : 1.0;
        const double s = u * u * (3.0 - 2.0 * u);
        Node r;
        r.t  = t;
        r.p  = a.p + (b.p - a.p) * s;
        r.pr = (float) (a.pr + (b.pr - a.pr) * s);
        r.sl = (float) (a.sl + (b.sl - a.sl) * s);
        return r;
    }

    void normalize (double minLen = 0.25)
    {
        std::stable_sort (nodes.begin(), nodes.end(), [] (const Node& a, const Node& b) { return a.t < b.t; });
        std::vector<Node> out;
        for (const auto& q : nodes)
        {
            if (! out.empty() && q.t - out.back().t < 1e-3) out.back() = q;
            else out.push_back (q);
        }
        if (out.size() == 1)
        {
            auto q = out.front();
            q.t += minLen;
            out.push_back (q);
        }
        nodes = std::move (out);
    }
};

struct Pattern
{
    double bpm = 110.0;
    int bars = 8, transpose = 0, bend = 48;
    std::vector<Note> notes;
    int nextId = 1;

    double length() const { return bars * 4.0; }

    Note& add (std::vector<Node> nodes, float vel = 0.8f, float rvel = 0.5f)
    {
        Note n;
        n.id = nextId++;
        n.vel = vel;
        n.rvel = rvel;
        n.nodes = std::move (nodes);
        notes.push_back (std::move (n));
        return notes.back();
    }

    int indexOf (int id) const
    {
        for (size_t i = 0; i < notes.size(); ++i)
            if (notes[i].id == id) return (int) i;
        return -1;
    }

    Note* find (int id)
    {
        const int i = indexOf (id);
        return i >= 0 ? &notes[(size_t) i] : nullptr;
    }

    juce::String toJSON() const
    {
        auto* root = new juce::DynamicObject();
        juce::var rootVar (root);
        root->setProperty ("app", "flux");
        root->setProperty ("v", 1);
        root->setProperty ("bpm", bpm);
        root->setProperty ("bars", bars);
        root->setProperty ("transpose", transpose);
        root->setProperty ("bend", bend);
        juce::Array<juce::var> arr;
        for (const auto& n : notes)
        {
            if (n.recording || n.nodes.size() < 2) continue;
            auto* o = new juce::DynamicObject();
            o->setProperty ("id", n.id);
            o->setProperty ("vel", n.vel);
            o->setProperty ("rvel", n.rvel);
            juce::Array<juce::var> ns;
            for (const auto& q : n.nodes)
            {
                auto* k = new juce::DynamicObject();
                k->setProperty ("t", q.t);
                k->setProperty ("p", q.p);
                k->setProperty ("pr", q.pr);
                k->setProperty ("sl", q.sl);
                ns.add (juce::var (k));
            }
            o->setProperty ("nodes", ns);
            arr.add (juce::var (o));
        }
        root->setProperty ("notes", arr);
        return juce::JSON::toString (rootVar, true);
    }

    bool fromJSON (const juce::String& text)
    {
        const auto v = juce::JSON::parse (text);
        if (! v.isObject()) return false;
        const auto* ns = v["notes"].getArray();
        if (ns == nullptr) return false;

        auto num = [] (const juce::var& o, const char* key, double def)
        {
            const auto x = o.getProperty (key, def);
            return (x.isDouble() || x.isInt() || x.isInt64()) ? (double) x : def;
        };

        Pattern p;
        p.bpm       = juce::jlimit (30.0, 300.0, num (v, "bpm", 110.0));
        p.bars      = juce::jlimit (1, 128, (int) num (v, "bars", 8.0));
        p.transpose = juce::jlimit (-24, 24, (int) num (v, "transpose", 0.0));
        p.bend      = juce::jlimit (1, 96, (int) num (v, "bend", 48.0));
        for (const auto& nv : *ns)
        {
            const auto* nodes = nv["nodes"].getArray();
            if (nodes == nullptr || nodes->isEmpty()) continue;
            std::vector<Node> qs;
            for (const auto& q : *nodes)
            {
                Node k;
                k.t  = std::max (0.0, num (q, "t", 0.0));
                k.p  = juce::jlimit (0.0, 127.0, num (q, "p", 60.0));
                k.pr = (float) juce::jlimit (0.0, 1.0, num (q, "pr", 0.55));
                k.sl = (float) juce::jlimit (0.0, 1.0, num (q, "sl", 0.25));
                qs.push_back (k);
            }
            auto& n = p.add (std::move (qs),
                             (float) juce::jlimit (0.0, 1.0, num (nv, "vel", 0.8)),
                             (float) juce::jlimit (0.0, 1.0, num (nv, "rvel", 0.5)));
            n.normalize();
        }
        *this = std::move (p);
        return true;
    }

    void makeDemo()
    {
        *this = Pattern();
        const int chords[4][4] = { { 48, 60, 63, 67 }, { 44, 56, 63, 68 }, { 51, 58, 63, 70 }, { 46, 58, 62, 65 } };
        for (int i = 0; i < 4; ++i)
        {
            const double s = i * 8.0;
            for (int j = 0; j < 4; ++j)
            {
                const double p = chords[i][j];
                const double q = i == 3 ? p : chords[(i + 1) % 4][j];
                add ({ { s, p, 0.25f, 0.15f }, { s + 2.5, p, 0.85f, 0.35f },
                       { s + 5.5, p, 0.5f, 0.6f }, { s + 7.75, q, 0.2f, 0.25f } },
                     0.55f + (float) j * 0.08f, 0.4f);
            }
        }
        const int mel[] = { 75, 77, 74, 79, 75, 77, 72, 74, 75, 77, 74, 79, 80, 79, 77, 75 };
        std::vector<Node> lead;
        for (int k = 0; k < 16; ++k)
            lead.push_back ({ 16.0 + k * 0.5, (double) mel[k],
                              (float) (0.4 + 0.5 * std::abs (std::sin ((double) k))),
                              (float) (0.5 + 0.4 * std::sin (k / 2.0)) });
        lead.push_back ({ 24.0, 75.0, 0.2f, 0.3f });
        add (std::move (lead), 0.9f, 0.7f);
    }
};

// ---------- MPE helpers shared by the live MIDI output and the file export ----------
inline int pitchBendValue (double pitch, int baseNote, int bendRange)
{
    return juce::jlimit (0, 16383, (int) std::lround (8192.0 + (pitch - baseNote) / bendRange * 8192.0));
}

inline void addMpeConfiguration (juce::MidiBuffer& out, int samplePos, int bendRange)
{
    auto rpn = [&] (int ch, int lsb, int value)
    {
        out.addEvent (juce::MidiMessage::controllerEvent (ch, 101, 0), samplePos);
        out.addEvent (juce::MidiMessage::controllerEvent (ch, 100, lsb), samplePos);
        out.addEvent (juce::MidiMessage::controllerEvent (ch, 6, value), samplePos);
        out.addEvent (juce::MidiMessage::controllerEvent (ch, 38, 0), samplePos);
        out.addEvent (juce::MidiMessage::controllerEvent (ch, 101, 127), samplePos);
        out.addEvent (juce::MidiMessage::controllerEvent (ch, 100, 127), samplePos);
    };
    rpn (1, 6, 15); // MPE lower zone with 15 member channels
    for (int ch = 2; ch <= 16; ++ch)
        rpn (ch, 0, juce::jlimit (1, 96, bendRange));
}

// Writes the pattern as a standard MPE MIDI file (type 0, 480 PPQ).
inline bool writeMidiFile (const Pattern& pat, juce::OutputStream& stream)
{
    constexpr int TPQ = 480, STEP = 15;
    struct Ev { int tick, ord; juce::MidiMessage m; };
    std::vector<Ev> ev;
    auto add = [&] (int tick, int ord, juce::MidiMessage m) { ev.push_back ({ tick, ord, std::move (m) }); };

    add (0, -5, juce::MidiMessage::tempoMetaEvent ((int) std::lround (60000000.0 / pat.bpm)));
    add (0, -5, juce::MidiMessage::timeSignatureMetaEvent (4, 4));
    {
        juce::MidiBuffer cfg;
        addMpeConfiguration (cfg, 0, pat.bend);
        for (const auto meta : cfg) add (0, -3, meta.getMessage());
    }

    std::vector<const Note*> notes;
    for (const auto& n : pat.notes)
        if (! n.recording && n.nodes.size() >= 2) notes.push_back (&n);
    std::sort (notes.begin(), notes.end(), [] (const Note* a, const Note* b) { return a->start() < b->start(); });

    int busy[17], used[17];
    std::fill (std::begin (busy), std::end (busy), -1);
    std::fill (std::begin (used), std::end (used), -1);

    for (size_t idx = 0; idx < notes.size(); ++idx)
    {
        const auto& n = *notes[idx];
        const int s = (int) std::lround (n.start() * TPQ);
        const int e = std::max (s + 1, (int) std::lround (n.end() * TPQ));
        int ch = -1;
        for (int c = 2; c <= 16; ++c)
            if (busy[c] <= s && (ch < 0 || used[c] < used[ch])) ch = c;
        if (ch < 0)
        {
            ch = 2;
            for (int c = 3; c <= 16; ++c)
                if (busy[c] < busy[ch]) ch = c;
        }
        busy[ch] = e;
        used[ch] = (int) idx;

        const int base = juce::jlimit (0, 127, (int) std::lround (n.nodes.front().p + pat.transpose));
        struct Vals { int pb, pr, sl; };
        auto vals = [&] (int tick)
        {
            const auto q = n.eval ((double) tick / TPQ);
            return Vals { pitchBendValue (q.p + pat.transpose, base, pat.bend),
                          (int) std::lround (q.pr * 127.0f), (int) std::lround (q.sl * 127.0f) };
        };
        auto last = vals (s);
        add (s, 0, juce::MidiMessage::pitchWheel (ch, last.pb));
        add (s, 0, juce::MidiMessage::controllerEvent (ch, 74, last.sl));
        add (s, 0, juce::MidiMessage::channelPressureChange (ch, last.pr));
        add (s, 1, juce::MidiMessage::noteOn (ch, base, (juce::uint8) juce::jlimit (1, 127, (int) std::lround (n.vel * 127.0f))));
        for (int t = s + STEP; t < e; t += STEP)
        {
            const auto v = vals (t);
            if (v.pb != last.pb) add (t, 2, juce::MidiMessage::pitchWheel (ch, v.pb));
            if (v.pr != last.pr) add (t, 2, juce::MidiMessage::channelPressureChange (ch, v.pr));
            if (v.sl != last.sl) add (t, 2, juce::MidiMessage::controllerEvent (ch, 74, v.sl));
            last = v;
        }
        add (e, -1, juce::MidiMessage::noteOff (ch, base, (juce::uint8) juce::jlimit (0, 127, (int) std::lround (n.rvel * 127.0f))));
    }

    std::stable_sort (ev.begin(), ev.end(), [] (const Ev& a, const Ev& b) { return a.tick != b.tick ? a.tick < b.tick : a.ord < b.ord; });
    juce::MidiMessageSequence seq;
    for (auto& x : ev)
    {
        x.m.setTimeStamp (x.tick);
        seq.addEvent (x.m);
    }
    juce::MidiFile file;
    file.setTicksPerQuarterNote (TPQ);
    file.addTrack (seq);
    return file.writeTo (stream, 0);
}
} // namespace flux
