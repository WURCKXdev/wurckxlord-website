#pragma once
// Built-in FLUX synth voice: detuned saw + square + sub sine into a resonant low-pass.
// Pressure drives level and brightness, slide (CC74) opens the filter, velocity adds a transient.

#include <juce_core/juce_core.h>
#include <cmath>
#include <vector>
#include <algorithm>

namespace flux
{
inline float polyBlep (double t, double dt)
{
    if (t < dt)       { t /= dt;             return (float) (t + t - t * t - 1.0); }
    if (t > 1.0 - dt) { t = (t - 1.0) / dt;  return (float) (t * t + t + t + 1.0); }
    return 0.0f;
}

struct Voice
{
    // ownership / sequencing
    bool active = false, releasing = false, fromPattern = false;
    int noteId = -1, noteIdx = -1;
    int liveKey = -1, liveCh = 0, liveNote = 0;
    double beat = 0.0, endBeat = 0.0;
    juce::uint64 order = 0;
    // MPE output
    int mpeCh = 0, baseNote = 60, lastPb = -1, lastPr = -1, lastSl = -1;
    // expression
    float vel = 0.8f, rvel = 0.5f;
    float tgtPitch = 60.0f, tgtPr = 0.6f, tgtSl = 0.3f;
    float pitch = 60.0f, pr = 0.6f, sl = 0.3f;
    // dsp state
    double ph1 = 0, ph2 = 0, ph3 = 0, age = 0;
    float ic1 = 0, ic2 = 0, gain = 0, env = 1, relCoef = 1, attack = 0;

    void start (float p, float pressure, float slide, float velocity)
    {
        active = true; releasing = false;
        pitch = tgtPitch = p; pr = tgtPr = pressure; sl = tgtSl = slide;
        vel = velocity; age = 0; env = 1; attack = 0; gain = 0;
        ph1 = ph2 = ph3 = 0; ic1 = ic2 = 0;
        lastPb = lastPr = lastSl = -1; mpeCh = 0;
    }

    void release (double sr, float time = -1.0f)
    {
        if (releasing) return;
        releasing = true;
        const double rel = time > 0 ? time : 0.04 + (1.0 - rvel) * 0.45;
        relCoef = (float) std::exp (-1.0 / ((rel / 4.0) * sr));
    }

    static float amp (float pressure) { return 0.11f * (0.25f + 0.75f * pressure); }

    // Adds n (<= 64) samples to out.
    void render (float* out, int n, double sr)
    {
        if (! active) return;
        const float k = 1.0f - (float) std::pow (1.0 - (1.0 - std::exp (-1.0 / (0.004 * sr))), n);
        pitch += (tgtPitch - pitch) * k;
        pr    += (tgtPr - pr) * k;
        sl    += (tgtSl - sl) * k;

        const double freq = 440.0 * std::pow (2.0, (pitch - 69.0) / 12.0);
        const double dt  = std::min (0.45, freq / sr);
        const double dt1 = dt * 0.99654; // -6 cents
        const double dt2 = dt * 1.00405; // +7 cents
        const double dt3 = dt * 0.5;

        const float velBoost = vel * (float) std::exp (-age / 0.25);
        const double fc = std::min ({ 16000.0, 0.45 * sr, 160.0 * std::pow (2.0, sl * 5.5 + pr * 1.6 + velBoost * 0.6) });
        const float g  = (float) std::tan (juce::MathConstants<double>::pi * fc / sr);
        const float kq = 0.2f; // Q = 5
        const float a1 = 1.0f / (1.0f + g * (g + kq)), a2 = g * a1, a3 = g * a2;

        const float target = amp (pr) * (1.0f + vel * 1.3f * (float) std::exp (-age / 0.09));
        const float gStep = (target - gain) / (float) n;
        const float attackStep = (float) (1.0 / (0.004 * sr));

        for (int i = 0; i < n; ++i)
        {
            const float saw = (float) (2.0 * ph1 - 1.0) - polyBlep (ph1, dt1);
            float sq = ph2 < 0.5 ? 1.0f : -1.0f;
            sq += polyBlep (ph2, dt2) - polyBlep (std::fmod (ph2 + 0.5, 1.0), dt2);
            const float sub = (float) std::sin (juce::MathConstants<double>::twoPi * ph3);
            ph1 += dt1; if (ph1 >= 1.0) ph1 -= 1.0;
            ph2 += dt2; if (ph2 >= 1.0) ph2 -= 1.0;
            ph3 += dt3; if (ph3 >= 1.0) ph3 -= 1.0;

            const float x = 0.5f * saw + 0.22f * sq + 0.45f * sub;
            const float v3 = x - ic2;
            const float v1 = a1 * ic1 + a2 * v3;
            const float v2 = ic2 + a2 * ic1 + a3 * v3;
            ic1 = 2.0f * v1 - ic1;
            ic2 = 2.0f * v2 - ic2;

            gain += gStep;
            attack = std::min (1.0f, attack + attackStep);
            if (releasing) env *= relCoef;
            out[i] += v2 * gain * attack * env;
        }
        age += n / sr;
        if (releasing && env < 1.0e-4f) active = false;
    }
};

// Tempo-synced ping-pong echo with a darkened feedback path.
struct Echo
{
    std::vector<float> bl, br;
    int w = 0;
    float lpL = 0, lpR = 0;
    double sr = 44100.0;

    void prepare (double sampleRate)
    {
        sr = sampleRate;
        bl.assign ((size_t) (sampleRate * 2.5) + 1, 0.0f);
        br = bl;
        w = 0; lpL = lpR = 0;
    }

    void process (float* L, float* R, int n, double delaySec, float mix)
    {
        const int size = (int) bl.size();
        if (size < 2) return;
        const int d = juce::jlimit (1, size - 1, (int) (delaySec * sr));
        const float a = 1.0f - (float) std::exp (-juce::MathConstants<double>::twoPi * 2800.0 / sr);
        for (int i = 0; i < n; ++i)
        {
            const int r = (w - d + size) % size;
            lpL += a * (bl[(size_t) r] - lpL);
            lpR += a * (br[(size_t) r] - lpR);
            const float inL = L[i], inR = R != nullptr ? R[i] : L[i];
            bl[(size_t) w] = 0.5f * (inL + inR) + lpR * 0.32f;
            br[(size_t) w] = lpL * 0.32f;
            L[i] = inL + lpL * mix;
            if (R != nullptr) R[i] = inR + lpR * mix;
            if (++w >= size) w = 0;
        }
    }
};
} // namespace flux
