#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_audio_devices/juce_audio_devices.h>
#include <array>
#include <atomic>
#include <map>
#include <memory>
#include "Pattern.h"
#include "Synth.h"

struct RecEvent
{
    int type = 0; // 0 = note on, 1 = expression change, 2 = note off
    int key = 0;
    double pos = 0.0;
    float p = 60.0f, pr = 0.6f, sl = 0.3f, vel = 0.8f;
};

class FluxProcessor : public juce::AudioProcessor, private juce::Timer
{
public:
    FluxProcessor();
    ~FluxProcessor() override;

    void prepareToPlay (double sampleRate, int samplesPerBlock) override;
    void releaseResources() override {}
    bool isBusesLayoutSupported (const BusesLayout&) const override;
    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;
    using AudioProcessor::processBlock;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }

    const juce::String getName() const override { return "FLUX"; }
    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return true; }
    bool isMidiEffect() const override { return false; }
    double getTailLengthSeconds() const override { return 2.0; }

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram (int) override {}
    const juce::String getProgramName (int) override { return "Default"; }
    void changeProgramName (int, const juce::String&) override {}

    void getStateInformation (juce::MemoryBlock&) override;
    void setStateInformation (const void*, int) override;

    juce::AudioProcessorValueTreeState apvts;

    // ----- editing model (message thread only) -----
    flux::Pattern model;
    void publish();                 // hand the current model to the audio thread
    void beginEdit();
    void commitEdit();
    bool undo();
    bool redo();
    bool canUndo() const { return ! undoStack.empty(); }
    bool canRedo() const { return ! redoStack.empty(); }
    void replaceModel (const flux::Pattern& p, bool undoable);
    std::atomic<int> modelVersion { 0 }; // bumps when the whole model is replaced

    // ----- transport & display (shared with the editor) -----
    std::atomic<bool> internalPlaying { false }, recArmed { false };
    std::atomic<double> seekRequest { -1.0 };
    std::atomic<double> displayPos { 0.0 };
    std::atomic<bool> displayPlaying { false }, hostDriven { false }, prepared { false };
    std::atomic<juce::uint64> sounding[2];
    juce::MidiMessageCollector guiMidi; // audition notes from the editor

private:
    void timerCallback() override;
    void consumeRecording();
    void purgeGraveyard();

    void handleLive (const juce::MidiMessage&, juce::MidiBuffer& out, int pos, bool recording, double songPos);
    void startPatternVoice (int noteIdx, juce::MidiBuffer& out, int pos, bool loop, double len);
    void releasePatternVoices (juce::MidiBuffer& out, int pos);
    void noteOffOut (flux::Voice& v, juce::MidiBuffer& out, int pos);
    void sendMpeUpdate (flux::Voice& v, juce::MidiBuffer& out, int pos);
    int findVoice (juce::MidiBuffer& out, int pos);
    int allocChannel (int voiceIdx);
    void remapVoices (juce::MidiBuffer& out);
    void pushRec (const RecEvent&);

    // pattern handed to the audio thread
    std::shared_ptr<const flux::Pattern> live, audioPat;
    juce::SpinLock liveLock;
    std::vector<std::shared_ptr<const flux::Pattern>> graveyard;
    juce::CriticalSection graveyardLock;

    // undo (JSON snapshots)
    std::vector<juce::String> undoStack, redoStack;
    juce::String editBase;
    bool editOpen = false;

    // audio-thread state
    std::array<flux::Voice, 32> voices;
    juce::uint64 voiceCounter = 0;
    int chOwner[17];
    int rrChannel = 2;
    struct InChannel { double bend = 0.0; float pr = 0.6f, sl = 0.3f; };
    InChannel inCh[17];
    double sampleRate = 44100.0, internalPos = 0.0, expectedPpq = 0.0;
    bool wasPlaying = false, wasHost = false, midiOutOn = true;
    int subBlockCounter = 0;
    juce::MidiBuffer inMidi, guiBuf;
    flux::Echo echo;
    juce::SmoothedValue<float> outGain;
    std::atomic<float>* gainParam = nullptr;
    std::atomic<float>* echoParam = nullptr;
    std::atomic<float>* synthParam = nullptr;
    std::atomic<float>* midiOutParam = nullptr;
    std::atomic<float>* loopParam = nullptr;

    // recording FIFO (audio -> message thread)
    juce::AbstractFifo recFifo { 4096 };
    std::array<RecEvent, 4096> recBuf;
    std::map<int, int> recActive; // input key -> note id
    bool recEditOpen = false;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (FluxProcessor)
};
