#include "PluginProcessor.h"
#include "PluginEditor.h"

namespace
{
juce::AudioProcessorValueTreeState::ParameterLayout makeLayout()
{
    using namespace juce;
    AudioProcessorValueTreeState::ParameterLayout l;
    l.add (std::make_unique<AudioParameterFloat> (ParameterID { "gain", 1 }, "Output", NormalisableRange<float> (-36.0f, 6.0f, 0.1f), -3.0f,
                                                  AudioParameterFloatAttributes().withLabel ("dB")));
    l.add (std::make_unique<AudioParameterFloat> (ParameterID { "echo", 1 }, "Echo", NormalisableRange<float> (0.0f, 1.0f), 0.2f));
    l.add (std::make_unique<AudioParameterBool> (ParameterID { "synth", 1 }, "Synth", true));
    l.add (std::make_unique<AudioParameterBool> (ParameterID { "midiout", 1 }, "MPE MIDI out", true));
    l.add (std::make_unique<AudioParameterBool> (ParameterID { "loop", 1 }, "Loop", true));
    return l;
}
} // namespace

FluxProcessor::FluxProcessor()
    : AudioProcessor (BusesProperties().withOutput ("Output", juce::AudioChannelSet::stereo(), true)),
      apvts (*this, nullptr, "FLUX", makeLayout())
{
    gainParam    = apvts.getRawParameterValue ("gain");
    echoParam    = apvts.getRawParameterValue ("echo");
    synthParam   = apvts.getRawParameterValue ("synth");
    midiOutParam = apvts.getRawParameterValue ("midiout");
    loopParam    = apvts.getRawParameterValue ("loop");
    sounding[0] = 0;
    sounding[1] = 0;
    std::fill (std::begin (chOwner), std::end (chOwner), -1);

    model.makeDemo();
    publish();
    audioPat = live;
    startTimerHz (30);
}

FluxProcessor::~FluxProcessor() { stopTimer(); }

bool FluxProcessor::isBusesLayoutSupported (const BusesLayout& layouts) const
{
    const auto out = layouts.getMainOutputChannelSet();
    return out == juce::AudioChannelSet::mono() || out == juce::AudioChannelSet::stereo();
}

void FluxProcessor::prepareToPlay (double sr, int)
{
    sampleRate = sr;
    echo.prepare (sr);
    outGain.reset (sr, 0.05);
    outGain.setCurrentAndTargetValue (juce::Decibels::decibelsToGain (gainParam->load()));
    guiMidi.reset (sr);
    inMidi.ensureSize (8192);
    guiBuf.ensureSize (2048);
    for (auto& v : voices) v.active = false;
    std::fill (std::begin (chOwner), std::end (chOwner), -1);
    {
        const juce::SpinLock::ScopedLockType l (liveLock);
        audioPat = live;
    }
    prepared = true;
}

// ---------------------------------------------------------------- model / undo
void FluxProcessor::publish()
{
    flux::Pattern copy = model;
    copy.notes.erase (std::remove_if (copy.notes.begin(), copy.notes.end(),
                                      [] (const flux::Note& n) { return n.recording || n.nodes.size() < 2; }),
                      copy.notes.end());
    auto next = std::make_shared<const flux::Pattern> (std::move (copy));
    {
        const juce::SpinLock::ScopedLockType l (liveLock);
        live.swap (next);
    }
    if (next != nullptr)
    {
        const juce::ScopedLock g (graveyardLock);
        graveyard.push_back (std::move (next)); // freed later on the message thread, never on the audio thread
    }
}

void FluxProcessor::purgeGraveyard()
{
    const juce::ScopedLock g (graveyardLock);
    graveyard.erase (std::remove_if (graveyard.begin(), graveyard.end(),
                                     [] (const std::shared_ptr<const flux::Pattern>& p) { return p.use_count() == 1; }),
                     graveyard.end());
}

void FluxProcessor::beginEdit()
{
    if (editOpen) return;
    editBase = model.toJSON();
    editOpen = true;
}

void FluxProcessor::commitEdit()
{
    if (! editOpen) return;
    editOpen = false;
    if (model.toJSON() != editBase)
    {
        undoStack.push_back (editBase);
        if (undoStack.size() > 200) undoStack.erase (undoStack.begin());
        redoStack.clear();
    }
    publish();
}

bool FluxProcessor::undo()
{
    if (undoStack.empty()) return false;
    redoStack.push_back (model.toJSON());
    model.fromJSON (undoStack.back());
    undoStack.pop_back();
    publish();
    ++modelVersion;
    return true;
}

bool FluxProcessor::redo()
{
    if (redoStack.empty()) return false;
    undoStack.push_back (model.toJSON());
    model.fromJSON (redoStack.back());
    redoStack.pop_back();
    publish();
    ++modelVersion;
    return true;
}

void FluxProcessor::replaceModel (const flux::Pattern& p, bool undoable)
{
    if (undoable) { undoStack.push_back (model.toJSON()); redoStack.clear(); }
    model = p;
    publish();
    ++modelVersion;
}

// ---------------------------------------------------------------- state
void FluxProcessor::getStateInformation (juce::MemoryBlock& dest)
{
    std::shared_ptr<const flux::Pattern> snap;
    {
        const juce::SpinLock::ScopedLockType l (liveLock);
        snap = live;
    }
    auto state = apvts.copyState();
    state.setProperty ("pattern", snap != nullptr ? snap->toJSON() : juce::String(), nullptr);
    if (auto xml = state.createXml())
        copyXmlToBinary (*xml, dest);
}

void FluxProcessor::setStateInformation (const void* data, int size)
{
    auto xml = getXmlFromBinary (data, size);
    if (xml == nullptr) return;
    auto state = juce::ValueTree::fromXml (*xml);
    if (! state.isValid()) return;
    const auto json = state.getProperty ("pattern").toString();
    state.removeProperty ("pattern", nullptr);
    apvts.replaceState (state);
    flux::Pattern p;
    if (json.isNotEmpty() && p.fromJSON (json))
    {
        auto apply = [this, p]
        {
            model = p;
            undoStack.clear();
            redoStack.clear();
            publish();
            ++modelVersion;
        };
        if (juce::MessageManager::getInstance()->isThisTheMessageThread()) apply();
        else juce::MessageManager::callAsync (apply);
    }
}

juce::AudioProcessorEditor* FluxProcessor::createEditor() { return new FluxEditor (*this); }

// ---------------------------------------------------------------- recording (message thread)
void FluxProcessor::pushRec (const RecEvent& e)
{
    const auto scope = recFifo.write (1);
    if (scope.blockSize1 > 0) recBuf[(size_t) scope.startIndex1] = e;
    else if (scope.blockSize2 > 0) recBuf[(size_t) scope.startIndex2] = e;
}

void FluxProcessor::timerCallback()
{
    consumeRecording();
    purgeGraveyard();
}

void FluxProcessor::consumeRecording()
{
    bool changed = false;
    const double len = model.length();
    const bool loop = loopParam->load() > 0.5f;

    auto finish = [&] (flux::Note& n, double t, float rvel)
    {
        auto last = n.nodes.back();
        last.t = t;
        n.nodes.push_back (last);
        n.rvel = rvel;
        n.recording = false;
        n.normalize (0.125);
    };

    while (recFifo.getNumReady() > 0)
    {
        const auto scope = recFifo.read (1);
        const auto& e = recBuf[(size_t) (scope.blockSize1 > 0 ? scope.startIndex1 : scope.startIndex2)];
        if (e.type == 0)
        {
            if (! recEditOpen) { beginEdit(); recEditOpen = true; }
            auto& n = model.add ({ { e.pos, e.p, e.pr, e.sl } }, e.vel, 0.5f);
            n.recording = true;
            recActive[e.key] = n.id;
        }
        else if (auto it = recActive.find (e.key); it != recActive.end())
        {
            auto* n = model.find (it->second);
            if (n == nullptr) { recActive.erase (it); continue; }
            auto& N = n->nodes;
            if (e.type == 1)
            {
                if (e.pos < N.back().t) continue; // loop wrapped; finished on release
                flux::Node q { e.pos, e.p, e.pr, e.sl };
                if (N.size() == 1 || e.pos - N[N.size() - 2].t >= 1.0 / 32.0) N.push_back (q);
                else N.back() = q;
            }
            else
            {
                const double t = e.pos > N.back().t ? e.pos : (loop ? len : N.back().t + 0.25);
                N.back().p = e.p;
                finish (*n, t, e.vel);
                recActive.erase (it);
            }
        }
        changed = true;
    }

    if (! recActive.empty() && ! displayPlaying.load())
    {
        for (auto& [key, id] : recActive)
            if (auto* n = model.find (id))
                finish (*n, n->nodes.back().t + 0.125, 0.5f);
        recActive.clear();
        changed = true;
    }

    if (changed) publish();
    if (recActive.empty() && recEditOpen)
    {
        recEditOpen = false;
        commitEdit();
    }
}

// ---------------------------------------------------------------- audio helpers
int FluxProcessor::findVoice (juce::MidiBuffer& out, int pos)
{
    int best = -1;
    for (int i = 0; i < (int) voices.size(); ++i)
        if (! voices[(size_t) i].active) return i;
    for (int i = 0; i < (int) voices.size(); ++i)
        if (voices[(size_t) i].releasing && (best < 0 || voices[(size_t) i].order < voices[(size_t) best].order)) best = i;
    if (best < 0)
        for (int i = 0; i < (int) voices.size(); ++i)
            if (best < 0 || voices[(size_t) i].order < voices[(size_t) best].order) best = i;
    noteOffOut (voices[(size_t) best], out, pos);
    voices[(size_t) best].active = false;
    return best;
}

int FluxProcessor::allocChannel (int voiceIdx)
{
    for (int k = 0; k < 15; ++k)
    {
        const int ch = 2 + (rrChannel - 2 + k) % 15;
        if (chOwner[ch] < 0)
        {
            chOwner[ch] = voiceIdx;
            rrChannel = 2 + (ch - 2 + 1) % 15;
            return ch;
        }
    }
    const int ch = rrChannel; // all busy: steal
    if (chOwner[ch] >= 0) voices[(size_t) chOwner[ch]].mpeCh = 0;
    chOwner[ch] = voiceIdx;
    rrChannel = 2 + (ch - 2 + 1) % 15;
    return ch;
}

void FluxProcessor::noteOffOut (flux::Voice& v, juce::MidiBuffer& out, int pos)
{
    if (v.mpeCh <= 0) return;
    out.addEvent (juce::MidiMessage::noteOff (v.mpeCh, v.baseNote, (juce::uint8) juce::jlimit (0, 127, (int) (v.rvel * 127.0f))), pos);
    chOwner[v.mpeCh] = -1;
    v.mpeCh = 0;
}

void FluxProcessor::sendMpeUpdate (flux::Voice& v, juce::MidiBuffer& out, int pos)
{
    if (v.mpeCh <= 0) return;
    const int bendRange = audioPat->bend;
    const int pb = flux::pitchBendValue (v.tgtPitch, v.baseNote, bendRange);
    const int pr = (int) std::lround (v.tgtPr * 127.0f);
    const int sl = (int) std::lround (v.tgtSl * 127.0f);
    if (pb != v.lastPb) out.addEvent (juce::MidiMessage::pitchWheel (v.mpeCh, pb), pos);
    if (sl != v.lastSl) out.addEvent (juce::MidiMessage::controllerEvent (v.mpeCh, 74, sl), pos);
    if (pr != v.lastPr) out.addEvent (juce::MidiMessage::channelPressureChange (v.mpeCh, pr), pos);
    v.lastPb = pb; v.lastPr = pr; v.lastSl = sl;
}

void FluxProcessor::startPatternVoice (int idx, juce::MidiBuffer& out, int pos, bool loop, double len)
{
    const auto& pat = *audioPat;
    const auto& n = pat.notes[(size_t) idx];
    const int vi = findVoice (out, pos);
    auto& v = voices[(size_t) vi];
    const auto q = n.eval (n.start());
    v.rvel = n.rvel;
    v.start ((float) (q.p + pat.transpose), q.pr, q.sl, n.vel);
    v.fromPattern = true;
    v.noteId = n.id;
    v.noteIdx = idx;
    v.liveKey = -1;
    v.beat = n.start();
    v.endBeat = loop ? std::min (n.end(), len) : n.end();
    v.order = ++voiceCounter;
    if (midiOutOn)
    {
        v.mpeCh = allocChannel (vi);
        v.baseNote = juce::jlimit (0, 127, (int) std::lround (v.tgtPitch));
        sendMpeUpdate (v, out, pos);
        out.addEvent (juce::MidiMessage::noteOn (v.mpeCh, v.baseNote, (juce::uint8) juce::jlimit (1, 127, (int) std::lround (n.vel * 127.0f))), pos);
    }
}

void FluxProcessor::releasePatternVoices (juce::MidiBuffer& out, int pos)
{
    for (auto& v : voices)
        if (v.active && v.fromPattern && ! v.releasing)
        {
            v.release (sampleRate, 0.05f);
            noteOffOut (v, out, pos);
        }
}

void FluxProcessor::remapVoices (juce::MidiBuffer& out)
{
    const auto& pat = *audioPat;
    const bool loop = loopParam->load() > 0.5f;
    for (auto& v : voices)
    {
        if (! v.active || ! v.fromPattern || v.releasing) continue;
        v.noteIdx = pat.indexOf (v.noteId);
        if (v.noteIdx < 0)
        {
            v.release (sampleRate);
            noteOffOut (v, out, 0);
            continue;
        }
        const auto& n = pat.notes[(size_t) v.noteIdx];
        v.endBeat = loop ? std::min (n.end(), pat.length()) : n.end();
        v.vel = n.vel;
        v.rvel = n.rvel;
    }
}

void FluxProcessor::handleLive (const juce::MidiMessage& m, juce::MidiBuffer& out, int pos, bool recording, double songPos)
{
    if (midiOutOn) out.addEvent (m, pos); // pass controller data through to the next instrument
    const int ch = m.getChannel();
    if (ch < 1 || ch > 16) return;
    auto& c = inCh[ch];

    auto liveVoice = [&] (int key) -> flux::Voice*
    {
        for (auto& v : voices)
            if (v.active && ! v.fromPattern && ! v.releasing && v.liveKey == key) return &v;
        return nullptr;
    };
    auto recMod = [&] (flux::Voice& v)
    {
        if (recording) pushRec ({ 1, v.liveKey, songPos, v.tgtPitch, v.tgtPr, v.tgtSl, v.vel });
    };

    if (m.isNoteOn())
    {
        const int key = ch * 128 + m.getNoteNumber();
        if (auto* old = liveVoice (key)) old->release (sampleRate);
        const int vi = findVoice (out, pos);
        auto& v = voices[(size_t) vi];
        v.rvel = 0.5f;
        v.start ((float) (m.getNoteNumber() + c.bend), c.pr, c.sl, m.getFloatVelocity());
        v.fromPattern = false;
        v.liveKey = key;
        v.liveCh = ch;
        v.liveNote = m.getNoteNumber();
        v.order = ++voiceCounter;
        if (recording) pushRec ({ 0, key, songPos, v.tgtPitch, v.tgtPr, v.tgtSl, v.vel });
    }
    else if (m.isNoteOff())
    {
        const int key = ch * 128 + m.getNoteNumber();
        if (auto* v = liveVoice (key))
        {
            const float rv = m.getFloatVelocity();
            v->rvel = rv > 0.0f ? rv : 0.5f;
            v->release (sampleRate);
            if (recording) pushRec ({ 2, key, songPos, v->tgtPitch, v->tgtPr, v->tgtSl, v->rvel });
        }
    }
    else if (m.isPitchWheel())
    {
        // Channel 1 = normal keyboard (+-2 semitones); other channels = MPE member channels.
        const double range = ch == 1 ? 2.0 : (double) audioPat->bend;
        c.bend = (m.getPitchWheelValue() - 8192) / 8192.0 * range;
        for (auto& v : voices)
            if (v.active && ! v.fromPattern && ! v.releasing && v.liveCh == ch)
            {
                v.tgtPitch = (float) (v.liveNote + c.bend);
                recMod (v);
            }
    }
    else if (m.isChannelPressure())
    {
        c.pr = m.getChannelPressureValue() / 127.0f;
        for (auto& v : voices)
            if (v.active && ! v.fromPattern && ! v.releasing && v.liveCh == ch) { v.tgtPr = c.pr; recMod (v); }
    }
    else if (m.isAftertouch())
    {
        if (auto* v = liveVoice (ch * 128 + m.getNoteNumber())) { v->tgtPr = m.getAfterTouchValue() / 127.0f; recMod (*v); }
    }
    else if (m.isController() && m.getControllerNumber() == 74)
    {
        c.sl = m.getControllerValue() / 127.0f;
        for (auto& v : voices)
            if (v.active && ! v.fromPattern && ! v.releasing && v.liveCh == ch) { v.tgtSl = c.sl; recMod (v); }
    }
    else if (m.isAllNotesOff() || m.isAllSoundOff())
    {
        for (auto& v : voices)
            if (v.active && ! v.fromPattern && v.liveCh == ch) v.release (sampleRate, 0.05f);
    }
}

// ---------------------------------------------------------------- audio
void FluxProcessor::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi)
{
    juce::ScopedNoDenormals noDenormals;
    const int N = buffer.getNumSamples();
    buffer.clear();

    inMidi.clear();
    inMidi.addEvents (midi, 0, N, 0);
    guiBuf.clear();
    guiMidi.removeNextBlockOfMessages (guiBuf, N);
    inMidi.addEvents (guiBuf, 0, N, 0);
    midi.clear();

    midiOutOn = midiOutParam->load() > 0.5f;
    {
        const juce::SpinLock::ScopedTryLockType l (liveLock);
        if (l.isLocked() && audioPat != live)
        {
            audioPat = live;
            remapVoices (midi);
        }
    }
    const auto& pat = *audioPat;
    const bool loop = loopParam->load() > 0.5f;
    const double len = pat.length();

    // ---- transport: follow the DAW when it plays, otherwise the internal Play button
    bool hostPlaying = false;
    double hostPpq = 0.0, bpm = pat.bpm;
    if (auto* ph = getPlayHead())
        if (auto pos = ph->getPosition())
        {
            if (auto b = pos->getBpm()) bpm = *b;
            if (pos->getIsPlaying())
                if (auto q = pos->getPpqPosition()) { hostPlaying = true; hostPpq = *q; }
        }
    bpm = juce::jlimit (20.0, 999.0, bpm);

    const double seek = seekRequest.exchange (-1.0);
    if (seek >= 0.0) internalPos = seek;
    const bool playing = hostPlaying || internalPlaying.load();
    const double ppq0 = hostPlaying ? hostPpq : internalPos;
    const double bps = bpm / 60.0 / sampleRate;
    auto wrap = [&] (double b)
    {
        if (! loop) return b;
        const double r = std::fmod (b, len);
        return r < 0.0 ? r + len : r;
    };

    if (playing)
    {
        if (! wasPlaying && midiOutOn) flux::addMpeConfiguration (midi, 0, pat.bend);
        if (! wasPlaying || hostPlaying != wasHost || std::abs (ppq0 - expectedPpq) > 0.05)
            releasePatternVoices (midi, 0);
    }
    else if (wasPlaying)
        releasePatternVoices (midi, 0);
    wasPlaying = playing;
    wasHost = hostPlaying;

    const bool recording = recArmed.load() && playing;
    float* out = buffer.getWritePointer (0);
    auto it = inMidi.cbegin();

    for (int s = 0; s < N; s += 32)
    {
        const int n = std::min (32, N - s);
        const double b0 = ppq0 + s * bps, db = n * bps;

        for (; it != inMidi.cend() && (*it).samplePosition < s + n; ++it)
            handleLive ((*it).getMessage(), midi, std::max (s, (*it).samplePosition), recording, wrap (b0));

        if (playing)
        {
            auto trigger = [&] (double lo, double hi)
            {
                for (int i = 0; i < (int) pat.notes.size(); ++i)
                {
                    const double st = pat.notes[(size_t) i].start();
                    if (st >= lo && st < hi) startPatternVoice (i, midi, s, loop, len);
                }
            };
            if (loop)
            {
                const double p0 = wrap (b0), p1 = p0 + db;
                if (p1 <= len) trigger (p0, p1);
                else { trigger (p0, len); trigger (0.0, p1 - len); }
            }
            else if (b0 >= 0.0 && b0 < len)
                trigger (b0, b0 + db);
        }

        const bool sendUpdates = (subBlockCounter++ & 3) == 0;
        float tmp[32] = {};
        for (auto& v : voices)
        {
            if (! v.active) continue;
            if (v.fromPattern && ! v.releasing && v.noteIdx >= 0)
            {
                const auto q = pat.notes[(size_t) v.noteIdx].eval (v.beat);
                v.tgtPitch = (float) (q.p + pat.transpose);
                v.tgtPr = q.pr;
                v.tgtSl = q.sl;
                if (sendUpdates && midiOutOn) sendMpeUpdate (v, midi, s);
            }
            v.render (tmp, n, sampleRate);
            if (v.fromPattern && ! v.releasing)
            {
                v.beat += db;
                if (v.beat >= v.endBeat)
                {
                    v.release (sampleRate);
                    noteOffOut (v, midi, s + n - 1);
                }
            }
        }
        for (int i = 0; i < n; ++i) out[s + i] = tmp[i];
    }

    expectedPpq = ppq0 + N * bps;
    if (playing && ! hostPlaying)
    {
        internalPos = expectedPpq;
        if (! loop && internalPos >= len) { internalPlaying = false; internalPos = 0.0; }
    }

    // ---- output: synth on/off, echo, gain
    if (synthParam->load() < 0.5f) buffer.clear();
    float* R = buffer.getNumChannels() > 1 ? buffer.getWritePointer (1) : nullptr;
    if (R != nullptr) std::copy (out, out + N, R);
    echo.process (out, R, N, 60.0 / bpm * 0.75, echoParam->load());
    outGain.setTargetValue (juce::Decibels::decibelsToGain (gainParam->load(), -36.0f));
    for (int i = 0; i < N; ++i)
    {
        const float gn = outGain.getNextValue();
        out[i] *= gn;
        if (R != nullptr) R[i] *= gn;
    }

    // ---- info for the editor
    displayPlaying = playing;
    hostDriven = hostPlaying;
    displayPos = playing ? wrap (expectedPpq) : internalPos;
    juce::uint64 bits[2] = { 0, 0 };
    for (const auto& v : voices)
        if (v.active && ! v.releasing)
        {
            const int p = juce::jlimit (0, 127, (int) std::lround (v.pitch));
            bits[p >> 6] |= (juce::uint64) 1 << (p & 63);
        }
    sounding[0] = bits[0];
    sounding[1] = bits[1];
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new FluxProcessor(); }
