#pragma once

#include <juce_audio_utils/juce_audio_utils.h>
#include "PluginProcessor.h"
#include "PianoRoll.h"

class FluxLookAndFeel : public juce::LookAndFeel_V4
{
public:
    FluxLookAndFeel();
    void drawButtonBackground (juce::Graphics&, juce::Button&, const juce::Colour&, bool over, bool down) override;
};

// Drag this onto a DAW track to drop the pattern as an MPE MIDI clip.
class DragMidiButton : public juce::Component
{
public:
    std::function<juce::File()> makeFile;
    void paint (juce::Graphics&) override;
    void mouseDrag (const juce::MouseEvent&) override;
    void mouseUp (const juce::MouseEvent&) override { dragging = false; repaint(); }
private:
    bool dragging = false;
};

class FluxEditor : public juce::AudioProcessorEditor, private juce::Timer
{
public:
    explicit FluxEditor (FluxProcessor&);
    ~FluxEditor() override;

    void paint (juce::Graphics&) override;
    void resized() override;

private:
    void timerCallback() override;
    void refresh();
    void syncFields();
    void togglePlay();
    juce::File writeTempMidi();
    void exportMidi();
    void savePattern();
    void openPattern();

    FluxProcessor& proc;
    FluxLookAndFeel lnf;
    PianoRoll roll;

    juce::TextButton drawB { "Draw" }, selectB { "Select" }, panB { "Pan" },
        copyB { "Copy" }, pasteB { "Paste" }, deleteB { "Delete" }, undoB { "Undo" }, redoB { "Redo" },
        openB { "Open" }, saveB { "Save" }, exportB { "Export MIDI" }, newB { "New" },
        loopB { "Loop" }, gridB { "Grid 1/16" }, quantB { "Quantise" }, snapB { "Snap pitch" },
        playB { "Play" }, stopB { "Stop" }, recB { "Rec" }, synthB { "Synth" }, midiOutB { "MIDI out" };
    DragMidiButton dragB;

    struct Field
    {
        juce::Label label;
        juce::Slider slider;
    };
    Field bpmF, barsF, transF, bendF, gainF, echoF, vzoomF, hzoomF;
    juce::Label laneLabel;
    juce::ComboBox laneBox;
    juce::Label hint;
    juce::ToggleButton showVel { "Velocity" }, showRvel { "Release vel" }, showPr { "Pressure" }, showSl { "Slide" };

    std::unique_ptr<juce::AudioProcessorValueTreeState::ButtonAttachment> loopA, synthA, midiOutA;
    std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment> gainA, echoA;
    std::unique_ptr<juce::FileChooser> chooser;
    int seenModelVersion = -1;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (FluxEditor)
};
