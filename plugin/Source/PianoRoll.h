#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include <map>
#include <set>
#include "PluginProcessor.h"

class PianoRoll : public juce::Component
{
public:
    enum class Tool { Draw, Select, Pan };
    enum class Lane { Pitch, Pressure, Slide, Velocity, ReleaseVel };

    explicit PianoRoll (FluxProcessor&);

    Tool tool = Tool::Select;
    Lane lane = Lane::Pitch;
    int gridIdx = 2;
    bool snap = true, follow = true;
    bool showVel = true, showRvel = true, showPr = true, showSl = true;
    double sx = 0.0, top = 80.0, ppb = 44.0, pps = 16.0;

    std::function<void()> onStateChange;    // undo availability, selection, tool…
    std::function<void()> onTogglePlay;

    double grid() const;
    juce::String gridName() const;
    void copy();
    void paste();
    void deleteSelection();
    void quantise();
    void selectAll();
    void clearSelection();
    void setVZoom (double v);
    void tick();
    bool hasSelection() const { return ! sel.empty(); }

    void paint (juce::Graphics&) override;
    void mouseDown (const juce::MouseEvent&) override;
    void mouseDrag (const juce::MouseEvent&) override;
    void mouseUp (const juce::MouseEvent&) override;
    void mouseDoubleClick (const juce::MouseEvent&) override;
    void mouseMove (const juce::MouseEvent&) override;
    void mouseWheelMove (const juce::MouseEvent&, const juce::MouseWheelDetails&) override;
    bool keyPressed (const juce::KeyPress&) override;

private:
    FluxProcessor& proc;
    flux::Pattern& M() { return proc.model; }

    float bx (double b) const { return kKW + (float) ((b - sx) * ppb); }
    float py (double p) const { return kRH + (float) ((top - p) * pps); }
    double xb (float x) const { return (x - kKW) / ppb + sx; }
    double yp (float y) const { return top - (y - kRH) / pps; }
    double snapT (double b) const;
    double snapP (double p) const { return snap ? std::round (p) : p; }

    struct NodeHit { int id = -1, i = -1; };
    NodeHit hitNode (juce::Point<float>) const;
    int hitLine (juce::Point<float>) const;
    void edited();   // publish + repaint
    void finishDraw();
    void seek (float x);
    void auditionOn (double p);
    void auditionMove (double p);
    void auditionOff();
    void sendGui (juce::MidiMessage);

    static constexpr float kKW = 46.0f, kRH = 24.0f;
    static constexpr int kMinP = 21, kMaxP = 108;

    std::set<int> sel;
    NodeHit selNode;
    std::vector<flux::Note> clip;

    enum class Drag { None, Seek, Audition, Pan, Draw, Node, Move, Marquee };
    Drag drag = Drag::None;
    juce::Point<float> d0, d1;
    double dSx = 0, dTop = 0, dAnchor = 0, drawT = 0, drawP = 0;
    flux::Node dOrigNode;
    float dVel = 0, dRvel = 0;
    std::map<int, flux::Note> dOrig;
    std::vector<juce::Point<float>> drawPts;
    bool marqueeAdd = false;
    int audNote = -1;
    double lastPos = -1.0;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (PianoRoll)
};
