import { mtof } from "./music";

export type LayerId = "piano" | "pad" | "strings";
export type LevelId = LayerId | "master";

export type Levels = Record<LevelId, number>;

export const DEFAULT_LEVELS: Levels = {
  master: 0.8,
  piano: 0.85,
  pad: 0.5,
  strings: 0.4,
};

/** How much of each layer is fed into the shared reverb. */
const REVERB_SEND: Record<LayerId, number> = {
  piano: 0.18,
  pad: 0.42,
  strings: 0.34,
};

interface Voice {
  /** Fades the voice out starting at `when` and frees its nodes. */
  release: (when: number) => void;
}

const SILENT = 0.0001;

/** Volume faders feel linear to the ear when the value is curved. */
const taper = (value: number) => value * value;

/**
 * A small three-layer synth: a struck piano, a slow evolving pad and a
 * sustained string section, all sharing one reverb.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private layers: Partial<Record<LayerId, GainNode>> = {};
  private levels: Levels = { ...DEFAULT_LEVELS };
  private pianoVoices: Voice[] = [];
  private sustainVoices: Voice[] = [];

  /** Must be called from a user gesture so the browser unlocks audio. */
  async init() {
    if (this.ctx) {
      await this.ctx.resume();
      return;
    }

    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) throw new Error("Web Audio is not supported in this browser.");

    const ctx = new Ctor();
    await ctx.resume();

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 22;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.25;
    compressor.connect(ctx.destination);

    const master = ctx.createGain();
    master.gain.value = taper(this.levels.master);
    master.connect(compressor);

    const reverb = ctx.createConvolver();
    reverb.buffer = createImpulseResponse(ctx, 2.8, 2.4);
    const wet = ctx.createGain();
    wet.gain.value = 0.9;
    reverb.connect(wet);
    wet.connect(master);

    (Object.keys(REVERB_SEND) as LayerId[]).forEach((id) => {
      const gain = ctx.createGain();
      gain.gain.value = taper(this.levels[id]);
      gain.connect(master);

      const send = ctx.createGain();
      send.gain.value = REVERB_SEND[id];
      gain.connect(send);
      send.connect(reverb);

      this.layers[id] = gain;
    });

    this.ctx = ctx;
    this.master = master;
  }

  get ready() {
    return this.ctx !== null;
  }

  setLevel(id: LevelId, value: number) {
    this.levels[id] = value;
    const target = id === "master" ? this.master : this.layers[id];
    if (!this.ctx || !target) return;
    target.gain.setTargetAtTime(taper(value), this.ctx.currentTime, 0.02);
  }

  setLevels(levels: Levels) {
    (Object.keys(levels) as LevelId[]).forEach((id) =>
      this.setLevel(id, levels[id]),
    );
  }

  /** Strikes a new chord: the piano re-attacks, pad and strings crossfade. */
  playChord(notes: number[]) {
    const ctx = this.ctx;
    if (!ctx || notes.length === 0) return;

    const now = ctx.currentTime + 0.015;
    this.pianoVoices.forEach((voice) => voice.release(now));
    this.pianoVoices = [];
    this.releaseSustained(now);

    const root = notes[0];

    // A touch of roll across the notes, the way a hand hits the keys.
    [root - 12, ...notes, root + 12].forEach((midi, i) => {
      this.pianoVoices.push(
        this.pianoNote(midi, now + i * 0.014, 1 - i * 0.07),
      );
    });

    [root - 12, ...notes].forEach((midi) => {
      this.sustainVoices.push(this.padNote(midi, now));
    });

    [...notes, root + 12].forEach((midi) => {
      this.sustainVoices.push(this.stringNote(midi, now));
    });
  }

  /** Lets go of everything, as if lifting both hands off the keys. */
  releaseAll() {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    this.pianoVoices.forEach((voice) => voice.release(now));
    this.pianoVoices = [];
    this.releaseSustained(now);
  }

  async dispose() {
    const ctx = this.ctx;
    if (!ctx) return;
    this.releaseAll();
    this.ctx = null;
    this.master = null;
    this.layers = {};
    window.setTimeout(() => void ctx.close(), 2500);
  }

  private releaseSustained(when: number) {
    this.sustainVoices.forEach((voice) => voice.release(when));
    this.sustainVoices = [];
  }

  private pianoNote(midi: number, when: number, velocity: number): Voice {
    const ctx = this.ctx!;
    const freq = mtof(midi);
    const level = Math.max(0.25, velocity) * 0.13;

    const out = ctx.createGain();
    out.gain.value = 1;

    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = Math.min(13000, freq * 9 + 900);
    tone.Q.value = 0.4;
    tone.connect(out);
    out.connect(this.layers.piano!);

    // Longer strings ring on; the top of the keyboard dies away quickly.
    const decay = Math.max(0.9, 4.4 - (midi - 36) * 0.05);

    // [harmonic, amplitude, decay scale, detune in cents]
    const partials: [number, number, number, number][] = [
      [1, 1, 1, 0],
      [1, 0.5, 0.95, 5],
      [2, 0.42, 0.7, -3],
      [3, 0.2, 0.55, 4],
      [4, 0.11, 0.42, 0],
      [5, 0.06, 0.32, -5],
      [7, 0.028, 0.24, 6],
    ];

    let last = when;
    partials.forEach(([harmonic, amp, decayScale, detune]) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      // Real strings are slightly inharmonic, which is what makes them sing.
      osc.frequency.value = freq * harmonic * (1 + 0.0004 * harmonic * harmonic);
      osc.detune.value = detune;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(SILENT, when);
      gain.gain.exponentialRampToValueAtTime(amp * level, when + 0.006);
      const end = when + decay * decayScale;
      gain.gain.exponentialRampToValueAtTime(SILENT, end);

      osc.connect(gain);
      gain.connect(tone);
      osc.start(when);
      osc.stop(end + 0.05);
      last = Math.max(last, end + 0.05);
    });

    return {
      release: (time) => {
        const at = Math.max(time, when);
        if (at >= last) return;
        out.gain.cancelScheduledValues(at);
        out.gain.setValueAtTime(out.gain.value, at);
        out.gain.linearRampToValueAtTime(0, at + 0.3);
      },
    };
  }

  private padNote(midi: number, when: number): Voice {
    const ctx = this.ctx!;
    const freq = mtof(midi);
    const attack = 1.1;
    const release = 1.6;

    const out = ctx.createGain();
    out.gain.setValueAtTime(SILENT, when);
    out.gain.linearRampToValueAtTime(0.075, when + attack);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 4;
    filter.frequency.setValueAtTime(Math.min(600, freq * 2), when);
    filter.frequency.linearRampToValueAtTime(
      Math.min(2400, freq * 6 + 500),
      when + attack * 1.6,
    );
    filter.connect(out);
    out.connect(this.layers.pad!);

    const oscillators: OscillatorNode[] = [];

    ([
      ["sawtooth", 0, -9, 0.5],
      ["sawtooth", 0, 9, 0.5],
      ["triangle", -12, 0, 0.45],
    ] as [OscillatorType, number, number, number][]).forEach(
      ([type, octave, detune, amp]) => {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = freq * Math.pow(2, octave / 12);
        osc.detune.value = detune;
        const gain = ctx.createGain();
        gain.gain.value = amp;
        osc.connect(gain);
        gain.connect(filter);
        osc.start(when);
        oscillators.push(osc);
      },
    );

    // Slow filter drift keeps the pad from sounding static.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.11 + Math.random() * 0.12;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 220;
    lfo.connect(lfoDepth);
    lfoDepth.connect(filter.frequency);
    lfo.start(when);
    oscillators.push(lfo);

    return {
      release: (time) => releaseVoice(out, oscillators, time, release),
    };
  }

  private stringNote(midi: number, when: number): Voice {
    const ctx = this.ctx!;
    const freq = mtof(midi);
    const attack = 0.32;
    const release = 0.55;

    const out = ctx.createGain();
    out.gain.setValueAtTime(SILENT, when);
    out.gain.linearRampToValueAtTime(0.055, when + attack);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 1;
    filter.frequency.value = Math.min(3200, freq * 7 + 700);
    filter.connect(out);
    out.connect(this.layers.strings!);

    const oscillators: OscillatorNode[] = [];

    // A section is many players slightly out of tune with each other.
    const vibrato = ctx.createOscillator();
    vibrato.frequency.value = 5.1 + Math.random() * 0.5;
    const vibratoDepth = ctx.createGain();
    vibratoDepth.gain.setValueAtTime(0, when);
    vibratoDepth.gain.linearRampToValueAtTime(6, when + attack + 0.4);
    vibrato.connect(vibratoDepth);
    vibrato.start(when);
    oscillators.push(vibrato);

    [-7, 7].forEach((detune) => {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      osc.detune.value = detune;
      vibratoDepth.connect(osc.detune);
      const gain = ctx.createGain();
      gain.gain.value = 0.5;
      osc.connect(gain);
      gain.connect(filter);
      osc.start(when);
      oscillators.push(osc);
    });

    return {
      release: (time) => releaseVoice(out, oscillators, time, release),
    };
  }
}

function releaseVoice(
  out: GainNode,
  oscillators: OscillatorNode[],
  time: number,
  release: number,
) {
  out.gain.cancelScheduledValues(time);
  out.gain.setValueAtTime(Math.max(out.gain.value, SILENT), time);
  out.gain.linearRampToValueAtTime(0, time + release);
  oscillators.forEach((osc) => {
    try {
      osc.stop(time + release + 0.05);
    } catch {
      // Already stopped.
    }
  });
}

/** Noise burst with an exponential tail, which is enough for a room sound. */
function createImpulseResponse(ctx: AudioContext, seconds: number, decay: number) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return buffer;
}
