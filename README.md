# WurckxLord Website

Static website for the WurckxLord project.

Deployment target: GitHub Pages after GitHub CLI authentication.

## FLUX — line sequencer (`/flux/`)

An expressive, line-based MPE sequencer that runs in the browser (open `flux/index.html`).

- Notes are curves with draggable nodes: pitch glides, per-node **pressure** and **slide**, per-note **velocity** and **release velocity**.
- Tools: Draw (sketch lines freehand), Select (drag nodes / lines, Shift/Alt-click adds a node, double-tap deletes one), Pan.
- Built-in WebAudio synth, loop, grid, quantise, undo/redo, copy/paste, save/open JSON (autosaves locally).
- **Keys / Rec**: play from the computer keyboard (A–; row, Z/X octave) or a MIDI/MPE controller and record into the roll.
- **Export MIDI**: writes an MPE MIDI file (one note per channel, pitch bend + channel pressure + CC74) to drag into any DAW with an MPE synth.

A native **VST3 + standalone** version for Windows lives in [`plugin/`](plugin/README.md); GitHub Actions builds it on every push.
