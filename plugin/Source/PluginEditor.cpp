#include "PluginEditor.h"

namespace
{
const juce::Colour kPanel (0xff12121f), kPanel2 (0xff191a2b), kLine (0xff2a2b42), kText (0xffe9eaf5),
    kMuted (0xff8f91ad), kAccent (0xff36e0b4), kAccentInk (0xff04221a), kRec (0xffff4d6d), kButton (0xff22233a);
}

// ---------------------------------------------------------------- look and feel
FluxLookAndFeel::FluxLookAndFeel()
{
    setColour (juce::ResizableWindow::backgroundColourId, juce::Colour (0xff0b0b14));
    setColour (juce::TextButton::buttonColourId, kButton);
    setColour (juce::TextButton::buttonOnColourId, kAccent);
    setColour (juce::TextButton::textColourOffId, kText);
    setColour (juce::TextButton::textColourOnId, kAccentInk);
    setColour (juce::Label::textColourId, kMuted);
    setColour (juce::Slider::textBoxTextColourId, kText);
    setColour (juce::Slider::textBoxBackgroundColourId, juce::Colour (0xff0d0e19));
    setColour (juce::Slider::textBoxOutlineColourId, kLine);
    setColour (juce::Slider::trackColourId, kAccent);
    setColour (juce::Slider::backgroundColourId, kLine);
    setColour (juce::Slider::thumbColourId, kText);
    setColour (juce::ComboBox::backgroundColourId, juce::Colour (0xff0d0e19));
    setColour (juce::ComboBox::outlineColourId, kLine);
    setColour (juce::ComboBox::textColourId, kText);
    setColour (juce::ComboBox::arrowColourId, kMuted);
    setColour (juce::PopupMenu::backgroundColourId, kPanel2);
    setColour (juce::PopupMenu::textColourId, kText);
    setColour (juce::PopupMenu::highlightedBackgroundColourId, kAccent);
    setColour (juce::PopupMenu::highlightedTextColourId, kAccentInk);
    setColour (juce::ToggleButton::textColourId, kMuted);
    setColour (juce::ToggleButton::tickColourId, kAccent);
    setColour (juce::ToggleButton::tickDisabledColourId, kMuted);
}

void FluxLookAndFeel::drawButtonBackground (juce::Graphics& g, juce::Button& b, const juce::Colour& base, bool over, bool down)
{
    auto r = b.getLocalBounds().toFloat().reduced (0.5f);
    auto c = base;
    if (! b.isEnabled()) c = c.withMultipliedAlpha (0.4f);
    else if (down) c = c.brighter (0.15f);
    else if (over) c = c.brighter (0.08f);
    g.setColour (c);
    g.fillRoundedRectangle (r, 6.0f);
    g.setColour (b.getToggleState() ? c : juce::Colour (0xff33354f));
    g.drawRoundedRectangle (r, 6.0f, 1.0f);
}

// ---------------------------------------------------------------- drag MIDI button
void DragMidiButton::paint (juce::Graphics& g)
{
    auto r = getLocalBounds().toFloat().reduced (0.5f);
    g.setColour (dragging ? kAccent.withAlpha (0.25f) : kButton);
    g.fillRoundedRectangle (r, 6.0f);
    g.setColour (kAccent);
    g.drawRoundedRectangle (r, 6.0f, 1.0f);
    g.setFont (juce::FontOptions (13.0f, juce::Font::bold));
    g.drawText (juce::String::fromUTF8 ("\xe2\x87\xa2 Drag MIDI"), getLocalBounds(), juce::Justification::centred);
}

void DragMidiButton::mouseDrag (const juce::MouseEvent& e)
{
    if (dragging || e.getDistanceFromDragStart() < 4 || ! makeFile) return;
    dragging = true;
    repaint();
    const auto f = makeFile();
    if (f.existsAsFile())
        juce::DragAndDropContainer::performExternalDragDropOfFiles ({ f.getFullPathName() }, false, this,
                                                                    [this] { dragging = false; repaint(); });
}

// ---------------------------------------------------------------- editor
FluxEditor::FluxEditor (FluxProcessor& p) : AudioProcessorEditor (&p), proc (p), roll (p)
{
    setLookAndFeel (&lnf);

    for (auto* b : { &drawB, &selectB, &panB, &copyB, &pasteB, &deleteB, &undoB, &redoB, &openB, &saveB, &exportB, &newB,
                     &loopB, &gridB, &quantB, &snapB, &playB, &stopB, &recB, &synthB, &midiOutB })
    {
        addAndMakeVisible (*b);
        b->setWantsKeyboardFocus (false);
    }
    addAndMakeVisible (roll);
    addAndMakeVisible (dragB);
    recB.setColour (juce::TextButton::buttonOnColourId, kRec);
    recB.setColour (juce::TextButton::textColourOnId, juce::Colours::white);
    exportB.setColour (juce::TextButton::textColourOffId, kAccent);
    for (auto* b : { &loopB, &synthB, &midiOutB }) b->setClickingTogglesState (true);

    drawB.onClick   = [this] { roll.tool = PianoRoll::Tool::Draw; refresh(); };
    selectB.onClick = [this] { roll.tool = PianoRoll::Tool::Select; refresh(); };
    panB.onClick    = [this] { roll.tool = PianoRoll::Tool::Pan; refresh(); };
    copyB.onClick   = [this] { roll.copy(); };
    pasteB.onClick  = [this] { roll.paste(); };
    deleteB.onClick = [this] { roll.deleteSelection(); };
    undoB.onClick   = [this] { proc.undo(); roll.clearSelection(); refresh(); };
    redoB.onClick   = [this] { proc.redo(); roll.clearSelection(); refresh(); };
    openB.onClick   = [this] { openPattern(); };
    saveB.onClick   = [this] { savePattern(); };
    exportB.onClick = [this] { exportMidi(); };
    newB.onClick    = [this]
    {
        flux::Pattern empty = proc.model;
        empty.notes.clear();
        proc.replaceModel (empty, true);
        roll.clearSelection();
        refresh();
    };
    gridB.onClick  = [this] { roll.gridIdx = (roll.gridIdx + 1) % 5; roll.repaint(); refresh(); };
    quantB.onClick = [this] { roll.quantise(); };
    snapB.onClick  = [this] { roll.snap = ! roll.snap; refresh(); };
    playB.onClick  = [this] { togglePlay(); };
    stopB.onClick  = [this] { proc.internalPlaying = false; proc.seekRequest = 0.0; proc.displayPos = 0.0; refresh(); };
    recB.onClick   = [this] { proc.recArmed = ! proc.recArmed.load(); refresh(); };
    loopB.onClick  = [this] { roll.repaint(); };

    loopA    = std::make_unique<juce::AudioProcessorValueTreeState::ButtonAttachment> (proc.apvts, "loop", loopB);
    synthA   = std::make_unique<juce::AudioProcessorValueTreeState::ButtonAttachment> (proc.apvts, "synth", synthB);
    midiOutA = std::make_unique<juce::AudioProcessorValueTreeState::ButtonAttachment> (proc.apvts, "midiout", midiOutB);

    dragB.makeFile = [this] { return writeTempMidi(); };

    auto setupField = [this] (Field& f, const juce::String& name, bool numeric, double lo, double hi, double step)
    {
        f.label.setText (name, juce::dontSendNotification);
        f.label.setFont (juce::FontOptions (11.0f, juce::Font::bold));
        f.label.setJustificationType (juce::Justification::bottomLeft);
        addAndMakeVisible (f.label);
        if (numeric)
        {
            f.slider.setSliderStyle (juce::Slider::IncDecButtons);
            f.slider.setTextBoxStyle (juce::Slider::TextBoxLeft, false, 44, 24);
            f.slider.setIncDecButtonsMode (juce::Slider::incDecButtonsDraggable_Vertical);
        }
        else
        {
            f.slider.setSliderStyle (juce::Slider::LinearHorizontal);
            f.slider.setTextBoxStyle (juce::Slider::NoTextBox, false, 0, 0);
        }
        f.slider.setRange (lo, hi, step);
        f.slider.setWantsKeyboardFocus (false);
        addAndMakeVisible (f.slider);
    };
    setupField (bpmF, "BPM (standalone)", true, 30, 300, 1);
    setupField (barsF, "Bars", true, 1, 128, 1);
    setupField (transF, "Transpose", true, -24, 24, 1);
    setupField (bendF, "Bend range", true, 1, 96, 1);
    setupField (gainF, "Output", false, -36, 6, 0.1);
    setupField (echoF, "Echo", false, 0, 1, 0.01);
    setupField (vzoomF, "V zoom", false, 8, 40, 0.1);
    setupField (hzoomF, "H zoom", false, 10, 220, 0.1);
    gainA = std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment> (proc.apvts, "gain", gainF.slider);
    echoA = std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment> (proc.apvts, "echo", echoF.slider);
    vzoomF.slider.setValue (roll.pps, juce::dontSendNotification);
    hzoomF.slider.setValue (roll.ppb, juce::dontSendNotification);
    vzoomF.slider.onValueChange = [this] { roll.setVZoom (vzoomF.slider.getValue()); };
    hzoomF.slider.onValueChange = [this] { roll.ppb = hzoomF.slider.getValue(); roll.repaint(); };

    auto bindPattern = [this] (Field& f, std::function<void (flux::Pattern&, int)> set)
    {
        f.slider.onValueChange = [this, &f, set]
        {
            proc.beginEdit();
            set (proc.model, (int) f.slider.getValue());
            proc.commitEdit();
            roll.repaint();
            refresh();
        };
    };
    bindPattern (bpmF,   [] (flux::Pattern& m, int v) { m.bpm = v; });
    bindPattern (barsF,  [] (flux::Pattern& m, int v) { m.bars = v; });
    bindPattern (transF, [] (flux::Pattern& m, int v) { m.transpose = v; });
    bindPattern (bendF,  [] (flux::Pattern& m, int v) { m.bend = v; });

    laneLabel.setText ("Edit", juce::dontSendNotification);
    laneLabel.setFont (juce::FontOptions (11.0f, juce::Font::bold));
    laneLabel.setJustificationType (juce::Justification::bottomLeft);
    addAndMakeVisible (laneLabel);
    laneBox.addItemList ({ "Pitch / time", "Pressure", "Slide", "Velocity", "Release vel" }, 1);
    laneBox.setSelectedId (1, juce::dontSendNotification);
    laneBox.onChange = [this] { roll.lane = (PianoRoll::Lane) (laneBox.getSelectedId() - 1); refresh(); };
    laneBox.setWantsKeyboardFocus (false);
    addAndMakeVisible (laneBox);

    auto setupShow = [this] (juce::ToggleButton& b, juce::Colour c, bool& flag)
    {
        b.setToggleState (true, juce::dontSendNotification);
        b.setColour (juce::ToggleButton::tickColourId, c);
        b.setWantsKeyboardFocus (false);
        b.onClick = [this, &b, &flag] { flag = b.getToggleState(); roll.repaint(); };
        legend.addAndMakeVisible (b);
    };
    addAndMakeVisible (legend);
    setupShow (showVel, juce::Colour (0xfff0b54a), roll.showVel);
    setupShow (showRvel, juce::Colour (0xffb48cff), roll.showRvel);
    setupShow (showPr, juce::Colour (0xff3d8bff), roll.showPr);
    setupShow (showSl, juce::Colour (0xff9aa3b5), roll.showSl);

    hint.setFont (juce::FontOptions (12.0f));
    addAndMakeVisible (hint);

    roll.onStateChange = [this] { refresh(); };
    roll.onTogglePlay = [this] { togglePlay(); };

    syncFields();
    refresh();
    setResizable (true, true);
    // Fit the screen: laptops at 1366x768 (or smaller) must see the whole window.
    int w = 1260, h = 780;
    if (const auto* display = juce::Desktop::getInstance().getDisplays().getPrimaryDisplay())
    {
        w = juce::jmin (w, display->userArea.getWidth() - 24);
        h = juce::jmin (h, display->userArea.getHeight() - 64);
    }
    setResizeLimits (720, 440, 3200, 2000);
    setSize (juce::jmax (720, w), juce::jmax (440, h));
    startTimerHz (30);
}

FluxEditor::~FluxEditor()
{
    stopTimer();
    setLookAndFeel (nullptr);
}

void FluxEditor::togglePlay()
{
    if (proc.hostDriven.load()) return; // the DAW owns the transport
    proc.internalPlaying = ! proc.internalPlaying.load();
    refresh();
}

void FluxEditor::syncFields()
{
    bpmF.slider.setValue (proc.model.bpm, juce::dontSendNotification);
    barsF.slider.setValue (proc.model.bars, juce::dontSendNotification);
    transF.slider.setValue (proc.model.transpose, juce::dontSendNotification);
    bendF.slider.setValue (proc.model.bend, juce::dontSendNotification);
    seenModelVersion = proc.modelVersion.load();
}

void FluxEditor::refresh()
{
    drawB.setToggleState (roll.tool == PianoRoll::Tool::Draw, juce::dontSendNotification);
    selectB.setToggleState (roll.tool == PianoRoll::Tool::Select, juce::dontSendNotification);
    panB.setToggleState (roll.tool == PianoRoll::Tool::Pan, juce::dontSendNotification);
    snapB.setToggleState (roll.snap, juce::dontSendNotification);
    gridB.setButtonText ("Grid " + roll.gridName());
    undoB.setEnabled (proc.canUndo());
    redoB.setEnabled (proc.canRedo());
    const bool host = proc.hostDriven.load();
    const bool playing = proc.displayPlaying.load();
    playB.setButtonText (playing && ! host ? "Pause" : "Play");
    playB.setToggleState (playing, juce::dontSendNotification);
    playB.setEnabled (! host);
    stopB.setEnabled (! host);
    recB.setToggleState (proc.recArmed.load(), juce::dontSendNotification);

    juce::String h;
    if (proc.recArmed.load())
        h = "REC armed - press Play (or play your DAW) and play a MIDI/MPE controller; bends, pressure and slide become nodes.";
    else if (roll.tool == PianoRoll::Tool::Draw)
        h = "DRAW - press and drag to sketch a line; moving up/down while dragging makes glides.";
    else if (roll.tool == PianoRoll::Tool::Pan)
        h = "PAN - drag to scroll. Wheel scrolls, Shift+wheel scrolls time, Ctrl+wheel zooms. Right-drag pans in any tool.";
    else
        h = "SELECT - drag nodes to bend pitch/time | drag a line to move it | Shift/Alt+click a line adds a node | double-click a node deletes it | drag empty space to box-select | 'Edit' switches dragging to pressure/slide/velocity.";
    if (host) h = "Following DAW transport.  " + h;
    hint.setText (h, juce::dontSendNotification);
}

void FluxEditor::timerCallback()
{
    if (proc.modelVersion.load() != seenModelVersion)
    {
        syncFields();
        roll.repaint();
    }
    roll.tick();
    static int counter = 0;
    if (++counter % 6 == 0) refresh();
}

juce::File FluxEditor::writeTempMidi()
{
    auto f = juce::File::getSpecialLocation (juce::File::tempDirectory).getChildFile ("FLUX Pattern.mid");
    f.deleteFile();
    juce::FileOutputStream out (f);
    if (! out.openedOk() || ! flux::writeMidiFile (proc.model, out)) return {};
    out.flush();
    return f;
}

void FluxEditor::exportMidi()
{
    chooser = std::make_unique<juce::FileChooser> ("Export MPE MIDI",
                                                   juce::File::getSpecialLocation (juce::File::userDocumentsDirectory).getChildFile ("FLUX Pattern.mid"),
                                                   "*.mid");
    chooser->launchAsync (juce::FileBrowserComponent::saveMode | juce::FileBrowserComponent::canSelectFiles
                              | juce::FileBrowserComponent::warnAboutOverwriting,
                          [this] (const juce::FileChooser& fc)
                          {
                              auto f = fc.getResult();
                              if (f == juce::File()) return;
                              f = f.withFileExtension ("mid");
                              f.deleteFile();
                              juce::FileOutputStream out (f);
                              if (out.openedOk()) flux::writeMidiFile (proc.model, out);
                          });
}

void FluxEditor::savePattern()
{
    chooser = std::make_unique<juce::FileChooser> ("Save FLUX pattern",
                                                   juce::File::getSpecialLocation (juce::File::userDocumentsDirectory).getChildFile ("FLUX Pattern.json"),
                                                   "*.json");
    chooser->launchAsync (juce::FileBrowserComponent::saveMode | juce::FileBrowserComponent::canSelectFiles
                              | juce::FileBrowserComponent::warnAboutOverwriting,
                          [this] (const juce::FileChooser& fc)
                          {
                              auto f = fc.getResult();
                              if (f == juce::File()) return;
                              f.withFileExtension ("json").replaceWithText (proc.model.toJSON());
                          });
}

void FluxEditor::openPattern()
{
    chooser = std::make_unique<juce::FileChooser> ("Open FLUX pattern",
                                                   juce::File::getSpecialLocation (juce::File::userDocumentsDirectory), "*.json");
    chooser->launchAsync (juce::FileBrowserComponent::openMode | juce::FileBrowserComponent::canSelectFiles,
                          [this] (const juce::FileChooser& fc)
                          {
                              const auto f = fc.getResult();
                              if (! f.existsAsFile()) return;
                              flux::Pattern p;
                              if (p.fromJSON (f.loadFileAsString()))
                              {
                                  proc.replaceModel (p, true);
                                  roll.clearSelection();
                                  syncFields();
                                  refresh();
                              }
                              else
                                  juce::AlertWindow::showMessageBoxAsync (juce::MessageBoxIconType::WarningIcon, "FLUX",
                                                                          "That file is not a FLUX pattern.");
                          });
}

void FluxEditor::paint (juce::Graphics& g)
{
    g.fillAll (juce::Colour (0xff0b0b14));
    g.setColour (kPanel);
    g.fillRect (0, 0, getWidth(), bar1H);
    g.setColour (kPanel2);
    g.fillRect (0, bar1H, getWidth(), bar2H);
    g.setColour (kPanel);
    g.fillRect (0, getHeight() - 24, getWidth(), 24);
    g.setColour (kLine);
    g.drawHorizontalLine (bar1H, 0, (float) getWidth());
    g.drawHorizontalLine (bar1H + bar2H, 0, (float) getWidth());
    g.setColour (kText);
    g.setFont (juce::FontOptions (19.0f, juce::Font::bold));
    g.drawText ("F L U X", 14, 6, 100, 22, juce::Justification::centredLeft);
    g.setColour (kMuted);
    g.setFont (juce::FontOptions (9.0f, juce::Font::bold));
    g.drawText ("LINE SEQUENCER", 14, 27, 100, 12, juce::Justification::centredLeft);
}

void FluxEditor::resized()
{
    // Flow layout: controls wrap onto extra lines when the window is narrow.
    struct Cell { int w; std::function<void (int, int)> put; int gapAfter; };
    const int right = getWidth() - 8;

    auto flow = [right] (std::vector<Cell>& cells, int x0, int y0, int lineH, int firstLineX)
    {
        int x = firstLineX, y = y0;
        for (auto& c : cells)
        {
            if (x + c.w > right && x > x0) { x = x0; y += lineH; }
            c.put (x, y);
            x += c.w + c.gapAfter;
        }
        return y + lineH;
    };

    // bar 1: tools and commands (30 px buttons)
    std::vector<Cell> row1;
    auto btn = [&] (juce::Component& comp, int w, int gapAfter = 4)
    { row1.push_back ({ w, [&comp, w] (int x, int y) { comp.setBounds (x, y, w, 30); }, gapAfter }); };
    btn (drawB, 50); btn (selectB, 56); btn (panB, 44, 12);
    btn (copyB, 50); btn (pasteB, 52); btn (deleteB, 56, 12);
    btn (undoB, 50); btn (redoB, 50, 12);
    btn (openB, 50); btn (saveB, 48); btn (exportB, 90); btn (dragB, 96); btn (newB, 44, 12);
    btn (loopB, 48); btn (gridB, 78); btn (quantB, 70); btn (snapB, 80);
    bar1H = flow (row1, 12, 8, 36, 112) + 2;

    // bar 2: transport, settings (label above a 28 px control)
    std::vector<Cell> row2;
    auto tbtn = [&] (juce::Component& comp, int w, int gapAfter = 4)
    { row2.push_back ({ w, [&comp, w] (int x, int y) { comp.setBounds (x, y + 18, w, 28); }, gapAfter }); };
    auto field = [&] (Field& f, int w)
    {
        row2.push_back ({ w, [&f, w] (int x, int y)
                          {
                              f.label.setBounds (x, y, w + 20, 16);
                              f.slider.setBounds (x, y + 18, w, 28);
                          }, 12 });
    };
    tbtn (playB, 60); tbtn (stopB, 52); tbtn (recB, 48, 16);
    field (bpmF, 96); field (barsF, 88); field (transF, 88); field (bendF, 88);
    row2.push_back ({ 120, [this] (int x, int y)
                      {
                          laneLabel.setBounds (x, y, 100, 16);
                          laneBox.setBounds (x, y + 18, 120, 28);
                      }, 12 });
    tbtn (synthB, 58); tbtn (midiOutB, 74, 12);
    field (gainF, 90); field (echoF, 70); field (vzoomF, 70); field (hzoomF, 70);
    const int bar2End = flow (row2, 12, bar1H + 4, 52, 12);
    bar2H = bar2End - bar1H + 2;
    const int rollTop = bar1H + bar2H + 1;

    legend.setBounds (getWidth() - 140, rollTop + 30, 128, 90);
    showVel.setBounds (6, 4, 118, 20);
    showRvel.setBounds (6, 24, 118, 20);
    showPr.setBounds (6, 44, 118, 20);
    showSl.setBounds (6, 64, 118, 20);

    roll.setBounds (0, rollTop, getWidth(), getHeight() - rollTop - 24);
    legend.toFront (false);
    hint.setBounds (8, getHeight() - 24, getWidth() - 16, 24);
}
