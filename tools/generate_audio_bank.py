#!/usr/bin/env python3
"""Generate the offline EA888 sampled sound bank used by the Android WebView game.

The sounds are original procedural recordings rendered to PCM WAV assets.  The
engine loops use a periodic four-cylinder firing model, exhaust resonances,
intake noise and turbo harmonics, then are loaded as samples at runtime.  No
third-party recording is bundled.
"""
from __future__ import annotations

import base64
import io
import json
import math
import wave
from pathlib import Path

import numpy as np
from scipy import signal

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "assets" / "audio"
BANK = ROOT / "src" / "assets" / "audio-bank.js"
SR = 32_000
RNG = np.random.default_rng(88810)


def periodic_colored_noise(n: int, slope: float = 0.0, seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    bins = n // 2 + 1
    phases = rng.uniform(0, 2 * np.pi, bins)
    freqs = np.linspace(0, SR / 2, bins)
    amp = np.ones_like(freqs)
    if slope:
        amp = 1.0 / np.maximum(1.0, freqs / 120.0) ** slope
    spectrum = amp * np.exp(1j * phases)
    spectrum[0] = 0
    if n % 2 == 0:
        spectrum[-1] = spectrum[-1].real
    x = np.fft.irfft(spectrum, n=n)
    x /= np.std(x) + 1e-12
    return x


def band(x: np.ndarray, low: float, high: float, order: int = 3) -> np.ndarray:
    nyq = SR / 2
    low = max(10.0, low)
    high = min(nyq * 0.97, high)
    sos = signal.butter(order, [low / nyq, high / nyq], btype="bandpass", output="sos")
    # The source is periodic. Tile then crop to avoid filter startup transients.
    tiled = np.tile(x, 3)
    y = signal.sosfilt(sos, tiled)
    n = len(x)
    return y[n:2*n]


def highpass(x: np.ndarray, cutoff: float = 28.0) -> np.ndarray:
    sos = signal.butter(2, cutoff / (SR / 2), btype="highpass", output="sos")
    tiled = np.tile(x, 3)
    y = signal.sosfilt(sos, tiled)
    n = len(x)
    return y[n:2*n]


def circular_convolve(x: np.ndarray, ir: np.ndarray) -> np.ndarray:
    n = len(x)
    padded = np.zeros(n)
    padded[: min(len(ir), n)] = ir[:n]
    return np.fft.irfft(np.fft.rfft(x) * np.fft.rfft(padded), n=n)


def exhaust_ir(rpm: float, n: int) -> np.ndarray:
    length = min(n, int(SR * 0.24))
    t = np.arange(length) / SR
    # Resonances chosen for a free-flowing 2.0 TSI / large downpipe character:
    # strong low body, hard midrange bark and controlled high-frequency rasp.
    modes = [
        (78, 0.56, 0.125),
        (118, 0.82, 0.105),
        (186, 0.50, 0.080),
        (312, 0.34, 0.060),
        (515, 0.27, 0.043),
        (840, 0.19, 0.031),
        (1320, 0.12, 0.022),
        (2150, 0.075, 0.014),
    ]
    ir = np.zeros_like(t)
    for freq, gain, tau in modes:
        # Mild rpm-dependent detuning prevents a sterile organ-pipe tone.
        detune = 1.0 + 0.008 * math.sin(rpm * 0.0017 + freq)
        ir += gain * np.exp(-t / tau) * np.sin(2 * np.pi * freq * detune * t)
    # Fast pressure impulse from the turbine/downpipe.
    ir += 1.2 * np.exp(-t / 0.010)
    ir[0] += 2.5
    ir /= np.sqrt(np.sum(ir * ir)) + 1e-12
    return ir


def engine_loop(rpm: int, seconds: float = 2.0) -> np.ndarray:
    n = int(SR * seconds)
    t = np.arange(n) / SR
    firing_hz = rpm / 30.0  # four-cylinder, four-stroke: two firing events/rev
    event_phase = (t * firing_hz) % 1.0
    event_idx = np.floor(t * firing_hz).astype(np.int64)
    order_pattern = np.array([1.00, 0.945, 1.055, 0.975])
    amp = order_pattern[event_idx % 4]

    # Asymmetric cylinder-pressure/exhaust pulse.
    attack = 1.0 - np.exp(-event_phase * 240.0)
    decay = np.exp(-event_phase * (21.0 + rpm / 2100.0))
    pulse = attack * decay * amp
    pulse -= np.mean(pulse)

    ir = exhaust_ir(rpm, n)
    body = circular_convolve(pulse, ir)
    body /= np.max(np.abs(body)) + 1e-12

    # Periodic broadband combustion/turbine texture, gated by each pulse.
    noise = periodic_colored_noise(n, slope=0.20, seed=8000 + rpm)
    bark = band(noise, 220 + rpm * 0.018, min(6500, 2800 + rpm * 0.46), order=3)
    pulse_gate = np.clip(pulse * 2.8 + 0.12, 0, 1)
    bark *= 0.20 + 0.80 * pulse_gate

    # Intake roar and higher-order cam/valvetrain texture.
    intake_noise = periodic_colored_noise(n, slope=0.45, seed=9000 + rpm)
    intake = band(intake_noise, 520 + rpm * 0.055, min(7200, 1800 + rpm * 0.58), order=2)
    intake *= 0.075 + 0.08 * (rpm / 8400)

    # Combustion orders. These are intentionally not pure dominant oscillators;
    # they reinforce the sampled pulse waveform instead of replacing it.
    crank = rpm / 60.0
    orders = (
        0.085 * np.sin(2 * np.pi * crank * t + 0.2)
        + 0.105 * np.sin(2 * np.pi * firing_hz * t - 0.5)
        + 0.035 * np.sin(2 * np.pi * firing_hz * 2.0 * t + 1.1)
    )

    # Turbo whistle becomes clear above mid rpm but remains below the exhaust.
    turbo_hz = 940 + rpm * 0.42
    fm = 1.0 + 0.011 * np.sin(2 * np.pi * 7.3 * t)
    turbo = 0.024 * (rpm / 8400) ** 1.45 * np.sin(2 * np.pi * turbo_hz * fm * t)
    turbo += 0.010 * (rpm / 8400) ** 1.8 * np.sin(2 * np.pi * turbo_hz * 1.98 * t + 0.6)

    # Slight four-event amplitude breathing gives the characteristic inline-four
    # texture heard through a free-flowing exhaust.
    cycle_mod = 1.0 + 0.045 * np.sin(2 * np.pi * firing_hz / 4.0 * t + 0.3)
    x = (0.78 * body + 0.22 * bark + intake + orders + turbo) * cycle_mod
    x = highpass(x, 30)

    # Soft clipping and broadband glue emulate microphone/exhaust saturation.
    x = np.tanh(x * (2.25 + 0.4 * rpm / 8400))
    x += 0.020 * band(periodic_colored_noise(n, 0.7, 10000 + rpm), 70, 9000, 2)
    x = highpass(x, 25)
    x /= np.max(np.abs(x)) + 1e-12
    return (x * 0.91).astype(np.float32)


def turbo_loop(seconds: float = 2.0) -> np.ndarray:
    n = int(SR * seconds)
    t = np.arange(n) / SR
    noise = periodic_colored_noise(n, 0.25, 44001)
    hiss = band(noise, 1300, 9500, 3)
    tone = np.sin(2*np.pi*2650*t + 0.35*np.sin(2*np.pi*5.7*t))
    tone += 0.38*np.sin(2*np.pi*5315*t + 0.6)
    x = 0.38*hiss + 0.62*tone
    x *= 0.83 + 0.17*np.sin(2*np.pi*3.2*t)
    x /= np.max(np.abs(x)) + 1e-12
    return (0.72*x).astype(np.float32)


def tyre_loop(seconds: float = 2.0) -> np.ndarray:
    n = int(SR * seconds)
    t = np.arange(n) / SR
    noise = periodic_colored_noise(n, 0.05, 55001)
    s1 = band(noise, 520, 1900, 3)
    s2 = band(np.roll(noise, 117), 1800, 4800, 2)
    mod = 0.60 + 0.24*np.sin(2*np.pi*12.7*t) + 0.16*np.sin(2*np.pi*23.4*t+0.7)
    x = (0.72*s1 + 0.28*s2) * mod
    x = np.tanh(1.6*x)
    x /= np.max(np.abs(x)) + 1e-12
    return (0.78*x).astype(np.float32)


def one_shot(kind: str) -> np.ndarray:
    duration = {
        "shift_manual": 0.34,
        "shift_dsg": 0.42,
        "limiter": 0.72,
        "blowoff": 0.52,
        "launch": 0.60,
    }[kind]
    n = int(SR * duration)
    t = np.arange(n) / SR
    noise = np.random.default_rng(hash(kind) & 0xFFFF).normal(0, 1, n)
    x = np.zeros(n)
    if kind == "shift_manual":
        env = np.exp(-t/0.075)
        thump = np.sin(2*np.pi*(88 - 30*t)*t)
        crack = band(noise, 180, 5200, 2)
        x = 0.72*thump*env + 0.46*crack*np.exp(-t/0.045)
    elif kind == "shift_dsg":
        env = np.exp(-t/0.13)
        # Two close pressure events create the characteristic DSG "braap".
        pulse1 = np.sin(2*np.pi*(110 - 52*t)*t) * env
        delayed = np.zeros_like(t)
        d = int(.062*SR)
        delayed[d:] = np.sin(2*np.pi*(96 - 35*t[:-d])*t[:-d]) * np.exp(-t[:-d]/.095)
        crack = band(noise, 120, 4400, 2) * np.exp(-t/.09)
        x = 0.58*pulse1 + 0.47*delayed + 0.39*crack
    elif kind == "limiter":
        gate = (signal.square(2*np.pi*13.5*t, duty=.43)+1)*.5
        pulse = np.sin(2*np.pi*245*t) + .38*np.sin(2*np.pi*490*t)
        x = gate*(0.60*pulse + 0.43*band(noise,300,6200,2))*np.exp(-t/.95)
    elif kind == "blowoff":
        env = np.exp(-t/.22)
        center = 5200*np.exp(-t*4.2)+950
        phase = 2*np.pi*np.cumsum(center)/SR
        hiss = band(noise,850,9000,2)
        x = (0.35*np.sin(phase)+0.85*hiss)*env
    elif kind == "launch":
        # Short anti-lag/launch-control crackle cluster.
        x = band(noise,100,6500,2)
        gates = np.zeros(n)
        for start,amp in [(0.02,1.0),(0.105,.82),(0.19,.9),(0.305,.7),(0.41,.55)]:
            idx=int(start*SR); length=min(n-idx,int(.07*SR))
            if length>0: gates[idx:idx+length] += amp*np.exp(-np.arange(length)/(SR*.022))
        low=np.sin(2*np.pi*92*t)*np.exp(-t/.28)
        x=0.67*x*gates+0.45*low
    x = highpass(x, 24)
    x = np.tanh(2.2*x)
    peak=np.max(np.abs(x))+1e-12
    return (x/peak*0.92).astype(np.float32)


def wav_bytes(x: np.ndarray) -> bytes:
    x = np.clip(x, -1, 1)
    pcm = (x * 32767).astype('<i2').tobytes()
    bio = io.BytesIO()
    with wave.open(bio, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes(pcm)
    return bio.getvalue()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    bank: dict[str, dict[str, object]] = {}
    anchors = [900, 2400, 4200, 6000, 7800, 8400]
    for rpm in anchors:
        name = f"engine_{rpm}"
        data = wav_bytes(engine_loop(rpm))
        (OUT / f"{name}.wav").write_bytes(data)
        bank[name] = {"rpm": rpm, "loop": True, "data": base64.b64encode(data).decode('ascii')}
        print(name, len(data))
    for name, array in {
        "turbo": turbo_loop(),
        "tyre": tyre_loop(),
        "shift_manual": one_shot("shift_manual"),
        "shift_dsg": one_shot("shift_dsg"),
        "limiter": one_shot("limiter"),
        "blowoff": one_shot("blowoff"),
        "launch": one_shot("launch"),
    }.items():
        data = wav_bytes(array)
        (OUT / f"{name}.wav").write_bytes(data)
        bank[name] = {"loop": name in {"turbo", "tyre"}, "data": base64.b64encode(data).decode('ascii')}
        print(name, len(data))

    payload = json.dumps(bank, separators=(',', ':'))
    BANK.write_text(
        "/* Original EA888 Lab sampled sound bank. Generated locally; no third-party recording included. */\n"
        f"window.EA888_AUDIO_BANK={payload};\n",
        encoding='utf-8'
    )
    print('wrote', BANK, BANK.stat().st_size)


if __name__ == '__main__':
    main()
