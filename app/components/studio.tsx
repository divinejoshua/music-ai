"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AudioEngine,
  DEFAULT_LEVELS,
  type LevelId,
  type Levels,
} from "@/app/lib/audio-engine";
import { DEGREE_COUNT, chordForDegree, chordsForKey, type Mode } from "@/app/lib/music";
import CameraStage, { type StageStatus } from "./camera-stage";
import Sidebar from "./sidebar";

export default function Studio() {
  const engineRef = useRef<AudioEngine | null>(null);

  const [active, setActive] = useState(false);
  const [status, setStatus] = useState<StageStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fingers, setFingers] = useState(0);

  const [levels, setLevels] = useState<Levels>(DEFAULT_LEVELS);
  const [tonic, setTonic] = useState(0); // C
  const [mode, setMode] = useState<Mode>("major");
  const [octave, setOctave] = useState(3);

  const chords = useMemo(
    () => chordsForKey(tonic, mode, octave),
    [tonic, mode, octave],
  );

  // More than seven fingers still lands on the last chord of the scale.
  const activeDegree = fingers > 0 ? Math.min(fingers, DEGREE_COUNT) : null;

  const toggle = useCallback(async () => {
    if (active) {
      engineRef.current?.releaseAll();
      setActive(false);
      setStatus("idle");
      return;
    }

    setError(null);
    try {
      const engine = engineRef.current ?? new AudioEngine();
      engineRef.current = engine;
      // Unlocking audio has to happen inside the click handler.
      await engine.init();
      engine.setLevels(levels);
      setActive(true);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Could not start audio.");
    }
  }, [active, levels]);

  const handleStatus = useCallback((next: StageStatus, message?: string) => {
    setStatus(next);
    if (next === "error") {
      setError(message ?? "Something went wrong.");
      setActive(false);
    }
  }, []);

  const handleLevelChange = useCallback((id: LevelId, value: number) => {
    setLevels((current) => ({ ...current, [id]: value }));
    engineRef.current?.setLevel(id, value);
  }, []);

  // Every change of chord (or of key) re-voices the three layers.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine?.ready) return;

    if (activeDegree === null) {
      engine.releaseAll();
      return;
    }

    engine.playChord(chordForDegree(tonic, mode, activeDegree, octave).notes);
  }, [activeDegree, tonic, mode, octave]);

  useEffect(() => {
    return () => {
      void engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  return (
    <div className="flex h-dvh w-full bg-neutral-950 text-white">
      <Sidebar
        status={status}
        levels={levels}
        tonic={tonic}
        mode={mode}
        octave={octave}
        chords={chords}
        activeDegree={activeDegree}
        onToggle={() => void toggle()}
        onLevelChange={handleLevelChange}
        onTonicChange={setTonic}
        onModeChange={setMode}
        onOctaveChange={setOctave}
      />
      <CameraStage
        active={active}
        fingers={fingers}
        chord={activeDegree === null ? null : chords[activeDegree - 1]}
        status={status}
        error={error}
        onFingers={setFingers}
        onStatus={handleStatus}
      />
    </div>
  );
}
