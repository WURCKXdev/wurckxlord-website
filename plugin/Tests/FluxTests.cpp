// Headless checks for FLUX: pattern JSON, MPE MIDI file export, audio + MIDI output,
// plugin state round-trip and (optionally) an editor screenshot.
#include "../Source/PluginProcessor.h"
#include "../Source/PluginEditor.h"
#include <iostream>

static int failures = 0;
static void check (bool ok, const juce::String& what)
{
    std::cout << (ok ? "PASS  " : "FAIL  ") << what << std::endl;
    if (! ok) ++failures;
}

int main (int argc, char** argv)
{
    juce::ScopedJuceInitialiser_GUI init;

    // 1. JSON round trip
    flux::Pattern demo;
    demo.makeDemo();
    flux::Pattern back;
    check (back.fromJSON (demo.toJSON()) && back.notes.size() == demo.notes.size(), "pattern JSON round trip (" + juce::String ((int) demo.notes.size()) + " notes)");
    check (! back.fromJSON ("{\"hello\":1}"), "rejects non-pattern JSON");

    // 2. MPE MIDI file export
    juce::MemoryOutputStream mos;
    check (flux::writeMidiFile (demo, mos), "MIDI file written");
    juce::MemoryInputStream mis (mos.getData(), mos.getDataSize(), false);
    juce::MidiFile mf;
    check (mf.readFrom (mis), "MIDI file parses");
    int ons = 0, bends = 0, press = 0, badCh = 0;
    if (mf.getNumTracks() > 0)
        for (const auto* e : *mf.getTrack (0))
        {
            const auto& m = e->message;
            if (m.isNoteOn()) { ++ons; if (m.getChannel() < 2) ++badCh; }
            if (m.isPitchWheel()) ++bends;
            if (m.isChannelPressure()) ++press;
        }
    check (ons == (int) demo.notes.size(), "one note-on per note (" + juce::String (ons) + ")");
    check (badCh == 0, "notes on MPE member channels 2-16");
    check (bends > 100 && press > 100, "pitch bend (" + juce::String (bends) + ") and pressure (" + juce::String (press) + ") curves exported");

    // 3. processor renders audio and MPE MIDI with the internal transport
    FluxProcessor proc;
    proc.prepareToPlay (48000.0, 512);
    proc.internalPlaying = true;
    juce::AudioBuffer<float> buf (2, 512);
    double sumSq = 0;
    long samples = 0;
    int outOns = 0, outOffs = 0, outBends = 0, outMemberOns = 0;
    for (int b = 0; b < 48000 * 10 / 512; ++b)
    {
        juce::MidiBuffer midi;
        proc.processBlock (buf, midi);
        for (int i = 0; i < 512; ++i) { sumSq += buf.getSample (0, i) * buf.getSample (0, i); ++samples; }
        for (const auto meta : midi)
        {
            const auto m = meta.getMessage();
            if (m.isNoteOn()) { ++outOns; if (m.getChannel() >= 2) ++outMemberOns; }
            if (m.isNoteOff()) ++outOffs;
            if (m.isPitchWheel()) ++outBends;
        }
    }
    const double rms = std::sqrt (sumSq / (double) samples);
    check (rms > 0.005 && rms < 0.9, "synth output level OK (rms " + juce::String (rms, 4) + ")");
    check (outOns > 0 && outOns == outMemberOns, "MPE note-ons sent live (" + juce::String (outOns) + ")");
    check (outOffs >= outOns - 6, "note-offs follow (" + juce::String (outOffs) + ")");
    check (outBends > 50, "live pitch-bend glides sent (" + juce::String (outBends) + ")");
    check (proc.displayPos.load() > 0.0, "playhead advances (" + juce::String (proc.displayPos.load(), 2) + " beats)");

    // stop releases everything
    proc.internalPlaying = false;
    {
        juce::MidiBuffer midi;
        proc.processBlock (buf, midi);
        int offs = 0;
        for (const auto meta : midi) if (meta.getMessage().isNoteOff()) ++offs;
        int sounding = 0;
        for (int i = 0; i < 8; ++i) { juce::MidiBuffer m2; proc.processBlock (buf, m2); }
        check (proc.sounding[0].load() == 0 && proc.sounding[1].load() == 0 && sounding == 0, "stop releases all voices (" + juce::String (offs) + " note-offs)");
    }

    // 4. live MIDI input plays the synth
    {
        juce::MidiBuffer midi;
        midi.addEvent (juce::MidiMessage::noteOn (1, 64, (juce::uint8) 100), 0);
        double e = 0;
        for (int b = 0; b < 20; ++b)
        {
            proc.processBlock (buf, midi);
            midi.clear();
            e += buf.getMagnitude (0, 0, 512);
        }
        check (e > 0.1, "live MIDI note produces sound");
    }

    // 5. state round trip
    proc.model.notes.resize (3);
    proc.model.bpm = 133;
    proc.publish();
    juce::MemoryBlock state;
    proc.getStateInformation (state);
    FluxProcessor proc2;
    proc2.setStateInformation (state.getData(), (int) state.getSize());
    check (proc2.model.notes.size() == 3 && std::abs (proc2.model.bpm - 133.0) < 1e-9, "plugin state restores pattern");

    // 6. editor screenshot
    if (argc > 1)
    {
        FluxProcessor p3;
        p3.prepareToPlay (48000.0, 512);
        std::unique_ptr<juce::AudioProcessorEditor> ed (p3.createEditor());
        p3.seekRequest = 6.5; p3.displayPos = 6.5;
        auto img = ed->createComponentSnapshot (ed->getLocalBounds(), true, 1.0f);
        const juce::File f { juce::String (argv[1]) };
        f.deleteFile();
        juce::FileOutputStream os (f);
        juce::PNGImageFormat().writeImageToStream (img, os);
        check (img.getWidth() > 0, "editor renders (" + juce::String (img.getWidth()) + "x" + juce::String (img.getHeight()) + ")");

        // small laptop / VM screen: toolbars must wrap and stay inside the window
        ed->setSize (900, 600);
        auto small = ed->createComponentSnapshot (ed->getLocalBounds(), true, 1.0f);
        bool inside = true;
        for (auto* c : ed->getChildren())
            if (c->isVisible() && ! ed->getLocalBounds().contains (c->getBounds())) inside = false;
        check (inside, "all controls fit in a 900x600 window");
        const juce::File f2 = f.getSiblingFile (f.getFileNameWithoutExtension() + "-small.png");
        f2.deleteFile();
        juce::FileOutputStream os2 (f2);
        juce::PNGImageFormat().writeImageToStream (small, os2);
    }

    std::cout << (failures == 0 ? "ALL TESTS PASSED" : "TESTS FAILED") << std::endl;
    return failures == 0 ? 0 : 1;
}
