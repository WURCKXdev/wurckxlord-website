# FLUX plugin (VST3 + Standalone)

C++/JUCE version of the FLUX line sequencer in `../flux/`. Same pattern format (JSON), same editing model,
plus DAW transport sync, a built-in synth, live MPE MIDI output, MIDI/MPE recording and drag-to-DAW MIDI export.

## Download (Windows)

**[FLUX-Windows-x64.zip](https://github.com/WURCKXdev/wurckxlord-website/releases/latest/download/FLUX-Windows-x64.zip)** — always the newest build. Unzip and read `INSTALL.txt`.

## Getting the Windows build

Every push that touches `plugin/` runs **Actions → "Build FLUX plugin (Windows)"** on GitHub.
Open the latest run and download the **FLUX-Windows-x64** artifact (zip with `FLUX.vst3`, `FLUX.exe`, `INSTALL.txt`).

## Building it yourself (Windows)

Requires Visual Studio 2022 (Desktop development with C++) and CMake 3.22+.

```
cmake -S plugin -B build -A x64
cmake --build build --config Release
```

Output: `build/FLUX_artefacts/Release/VST3/FLUX.vst3` and `.../Standalone/FLUX.exe`.
JUCE 8.0.9 is downloaded automatically (or pass `-DFLUX_JUCE_DIR=path/to/JUCE`).
Add `-DFLUX_BUILD_TESTS=ON` to build `FluxTests`, a headless test runner.

## Code map

- `Source/Pattern.h` — notes/nodes model, curve evaluation, JSON, MPE MIDI file writer
- `Source/Synth.h` — synth voice (saw/square/sub → resonant low-pass) and ping-pong echo
- `Source/PluginProcessor.*` — host/internal transport, sequencing, live MPE out, live input, recording
- `Source/PianoRoll.*` — the line editor
- `Source/PluginEditor.*` — window, toolbars, file open/save/export, drag MIDI

JUCE is licensed under AGPLv3 (or a commercial JUCE licence). Personal use is fine; if you ever
distribute or sell FLUX, check the JUCE licence terms first.
