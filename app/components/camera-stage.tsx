"use client";

import { useEffect, useRef } from "react";
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import {
  FingerCountSmoother,
  countFingers,
  drawHands,
} from "@/app/lib/hand-tracking";
import type { Chord } from "@/app/lib/music";

export type StageStatus = "idle" | "loading" | "running" | "error";

interface CameraStageProps {
  active: boolean;
  fingers: number;
  chord: Chord | null;
  status: StageStatus;
  error: string | null;
  onFingers: (count: number) => void;
  onStatus: (status: StageStatus, error?: string) => void;
}

const MODEL_PATH = "/models/hand_landmarker.task";
const WASM_PATH = "/mediapipe/wasm";

export default function CameraStage({
  active,
  fingers,
  chord,
  status,
  error,
  onFingers,
  onStatus,
}: CameraStageProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    let cancelled = false;
    let frame = 0;
    let stream: MediaStream | null = null;
    let landmarker: HandLandmarker | null = null;
    const smoother = new FingerCountSmoother();
    let connections: { start: number; end: number }[] = [];
    let lastFrameTime = -1;

    const start = async () => {
      try {
        onStatus("loading");

        const { FilesetResolver, HandLandmarker } = await import(
          "@mediapipe/tasks-vision"
        );
        connections = HandLandmarker.HAND_CONNECTIONS;

        const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
        const options = {
          baseOptions: { modelAssetPath: MODEL_PATH },
          runningMode: "VIDEO" as const,
          numHands: 2,
          minHandDetectionConfidence: 0.6,
          minTrackingConfidence: 0.6,
        };

        landmarker = await HandLandmarker.createFromOptions(fileset, {
          ...options,
          baseOptions: { ...options.baseOptions, delegate: "GPU" },
        }).catch(() => HandLandmarker.createFromOptions(fileset, options));

        if (cancelled) {
          landmarker.close();
          landmarker = null;
          return;
        }

        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: "user",
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        video.srcObject = stream;
        await video.play();
        if (cancelled) return;

        onStatus("running");
        frame = requestAnimationFrame(tick);
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof DOMException && err.name === "NotAllowedError"
            ? "Camera permission was denied. Allow access, then start again."
            : err instanceof Error
              ? err.message
              : "Could not start the camera.";
        onStatus("error", message);
      }
    };

    const tick = () => {
      frame = requestAnimationFrame(tick);

      if (!landmarker || video.readyState < 2) return;

      // The model only needs to see each frame once.
      if (video.currentTime === lastFrameTime) return;
      lastFrameTime = video.currentTime;

      if (canvas.width !== video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      const result = landmarker.detectForVideo(video, performance.now());
      const context = canvas.getContext("2d");
      if (context) {
        drawHands(context, result.landmarks, connections);
      }
      onFingers(smoother.push(countFingers(result.landmarks)));
    };

    void start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
      landmarker?.close();
      onFingers(0);
    };
  }, [active, onFingers, onStatus]);

  return (
    <section className="relative flex flex-1 items-center justify-center overflow-hidden bg-neutral-950 p-6">
      <div className="relative aspect-video w-full max-w-5xl overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl">
        <video
          ref={videoRef}
          playsInline
          muted
          className="h-full w-full -scale-x-100 object-cover"
        />
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100"
        />

        {status === "running" && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-6 pt-16 [text-shadow:0_1px_3px_rgb(0_0_0/0.8)]">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-white/50">
                Fingers
              </p>
              <p className="text-5xl font-semibold tabular-nums text-white">
                {fingers}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-[0.2em] text-white/50">
                {chord ? chord.roman : "Silent"}
              </p>
              <p className="text-5xl font-semibold text-amber-300">
                {chord ? chord.name : "—"}
              </p>
            </div>
          </div>
        )}

        {status !== "running" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="text-lg font-medium text-white/80">
              {status === "loading"
                ? "Starting camera…"
                : status === "error"
                  ? "Camera unavailable"
                  : "Camera is off"}
            </p>
            <p className="max-w-sm text-sm text-white/50">
              {status === "error"
                ? error
                : status === "loading"
                  ? "Loading the hand tracking model."
                  : "Press Start in the sidebar, then hold up fingers to play."}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
