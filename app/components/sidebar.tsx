"use client";

import type { LevelId, Levels } from "@/app/lib/audio-engine";
import { KEY_LABELS, type Chord, type Mode } from "@/app/lib/music";
import type { StageStatus } from "./camera-stage";

interface SidebarProps {
  status: StageStatus;
  levels: Levels;
  tonic: number;
  mode: Mode;
  octave: number;
  chords: Chord[];
  activeDegree: number | null;
  onToggle: () => void;
  onLevelChange: (id: LevelId, value: number) => void;
  onTonicChange: (tonic: number) => void;
  onModeChange: (mode: Mode) => void;
  onOctaveChange: (octave: number) => void;
}

const LAYER_LABELS: { id: LevelId; label: string; accent: string }[] = [
  { id: "piano", label: "Piano", accent: "accent-amber-400" },
  { id: "pad", label: "Pad", accent: "accent-violet-400" },
  { id: "strings", label: "Strings", accent: "accent-emerald-400" },
];

export default function Sidebar({
  status,
  levels,
  tonic,
  mode,
  octave,
  chords,
  activeDegree,
  onToggle,
  onLevelChange,
  onTonicChange,
  onModeChange,
  onOctaveChange,
}: SidebarProps) {
  const running = status === "running" || status === "loading";

  return (
    <aside className="flex w-80 shrink-0 flex-col gap-6 overflow-y-auto border-r border-white/10 bg-neutral-900 p-6">
      <header>
        <h1 className="text-lg font-semibold text-white">Hand Chords</h1>
        <p className="mt-1 text-sm text-white/50">
          Hold up fingers to play chords from the key.
        </p>
      </header>

      <button
        type="button"
        onClick={onToggle}
        disabled={status === "loading"}
        className={`rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-60 ${
          running
            ? "bg-white/10 text-white hover:bg-white/15"
            : "bg-amber-400 text-neutral-950 hover:bg-amber-300"
        }`}
      >
        {status === "loading"
          ? "Starting…"
          : running
            ? "Stop camera"
            : "Start camera"}
      </button>

      <Section title="Key">
        <div className="flex gap-2">
          <select
            value={tonic}
            onChange={(event) => onTonicChange(Number(event.target.value))}
            className="flex-1 rounded-md border border-white/10 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
          >
            {KEY_LABELS.map((label, index) => (
              <option key={label} value={index}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={mode}
            onChange={(event) => onModeChange(event.target.value as Mode)}
            className="flex-1 rounded-md border border-white/10 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
          >
            <option value="major">Major</option>
            <option value="minor">Minor</option>
          </select>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm text-white/60">Octave</span>
          <div className="flex items-center gap-2">
            <StepButton
              label="−"
              onClick={() => onOctaveChange(octave - 1)}
              disabled={octave <= 2}
            />
            <span className="w-6 text-center text-sm tabular-nums text-white">
              {octave}
            </span>
            <StepButton
              label="+"
              onClick={() => onOctaveChange(octave + 1)}
              disabled={octave >= 5}
            />
          </div>
        </div>
      </Section>

      <Section title="Mix">
        <Slider
          label="Master"
          value={levels.master}
          accent="accent-white"
          onChange={(value) => onLevelChange("master", value)}
        />
        <div className="my-3 h-px bg-white/10" />
        {LAYER_LABELS.map(({ id, label, accent }) => (
          <Slider
            key={id}
            label={label}
            value={levels[id]}
            accent={accent}
            onChange={(value) => onLevelChange(id, value)}
          />
        ))}
      </Section>

      <Section title="Chord map">
        <ul className="flex flex-col gap-1">
          {chords.map((chord) => (
            <li
              key={chord.degree}
              className={`flex items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors ${
                activeDegree === chord.degree
                  ? "bg-amber-400 text-neutral-950"
                  : "text-white/70"
              }`}
            >
              <span className="tabular-nums">
                {chord.degree} {chord.degree === 1 ? "finger" : "fingers"}
              </span>
              <span className="font-medium">
                {chord.name}
                <span
                  className={
                    activeDegree === chord.degree
                      ? "ml-2 text-neutral-950/60"
                      : "ml-2 text-white/40"
                  }
                >
                  {chord.roman}
                </span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-white/40">
          Use both hands for six and seven. A closed fist stops the sound.
        </p>
      </Section>
    </aside>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 text-xs font-medium uppercase tracking-[0.16em] text-white/40">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Slider({
  label,
  value,
  accent,
  onChange,
}: {
  label: string;
  value: number;
  accent: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="mb-3 block last:mb-0">
      <span className="mb-1.5 flex items-center justify-between text-sm text-white/70">
        {label}
        <span className="tabular-nums text-white/40">
          {Math.round(value * 100)}
        </span>
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className={`h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/15 ${accent}`}
      />
    </label>
  );
}

function StepButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-7 w-7 rounded-md border border-white/10 bg-neutral-800 text-sm text-white transition-colors hover:bg-neutral-700 disabled:opacity-30"
    >
      {label}
    </button>
  );
}
