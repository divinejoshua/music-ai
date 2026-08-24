import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

/** MediaPipe hand landmark indices used by the finger counter. */
const WRIST = 0;
const THUMB_IP = 3;
const THUMB_TIP = 4;
const MIDDLE_MCP = 9;
const PINKY_MCP = 17;

// [tip, pip] for index, middle, ring and pinky.
const FINGER_JOINTS: [number, number][] = [
  [8, 6],
  [12, 10],
  [16, 14],
  [20, 18],
];

function distance(a: NormalizedLandmark, b: NormalizedLandmark) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Counts extended fingers on one hand.
 *
 * Everything is measured against the wrist and normalised by the size of the
 * palm, so the count survives a rotated hand and any distance from the camera.
 */
export function countExtendedFingers(landmarks: NormalizedLandmark[]): number {
  if (landmarks.length < 21) return 0;

  const wrist = landmarks[WRIST];
  const palm = distance(wrist, landmarks[MIDDLE_MCP]);
  if (palm === 0) return 0;

  let count = 0;

  // An extended finger puts its tip further from the wrist than its middle joint.
  for (const [tip, pip] of FINGER_JOINTS) {
    const reach =
      (distance(landmarks[tip], wrist) - distance(landmarks[pip], wrist)) / palm;
    if (reach > 0.12) count++;
  }

  // The thumb bends sideways, so it is measured across the palm instead: an open
  // thumb reaches past its own knuckle, a folded one curls back towards the palm.
  const acrossPalm =
    (distance(landmarks[THUMB_TIP], landmarks[PINKY_MCP]) -
      distance(landmarks[THUMB_IP], landmarks[PINKY_MCP])) /
    palm;
  // A thumb held straight but tight against the hand still counts.
  const thumbReach =
    (distance(landmarks[THUMB_TIP], wrist) - distance(landmarks[THUMB_IP], wrist)) /
    palm;
  if (acrossPalm > 0.02 || thumbReach > 0.22) count++;

  return count;
}

/** Total fingers across every detected hand. */
export function countFingers(hands: NormalizedLandmark[][]): number {
  return hands.reduce((total, hand) => total + countExtendedFingers(hand), 0);
}

/**
 * Smooths the raw per-frame count: a new value only wins once it has been
 * reported for a few frames in a row, which stops chords from flickering.
 */
export class FingerCountSmoother {
  private candidate = 0;
  private streak = 0;
  private stable = 0;

  constructor(private readonly framesRequired = 4) {}

  push(count: number): number {
    if (count === this.candidate) {
      this.streak++;
    } else {
      this.candidate = count;
      this.streak = 1;
    }

    if (this.streak >= this.framesRequired) this.stable = this.candidate;
    return this.stable;
  }

  reset() {
    this.candidate = 0;
    this.streak = 0;
    this.stable = 0;
  }
}

/** Draws the hand skeleton onto a canvas sized to the video frame. */
export function drawHands(
  ctx: CanvasRenderingContext2D,
  hands: NormalizedLandmark[][],
  connections: { start: number; end: number }[],
) {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);

  for (const hand of hands) {
    ctx.lineWidth = Math.max(2, width / 320);
    ctx.strokeStyle = "rgba(251, 191, 36, 0.85)";
    ctx.beginPath();
    for (const { start, end } of connections) {
      const from = hand[start];
      const to = hand[end];
      if (!from || !to) continue;
      ctx.moveTo(from.x * width, from.y * height);
      ctx.lineTo(to.x * width, to.y * height);
    }
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    const radius = Math.max(3, width / 220);
    for (const point of hand) {
      ctx.beginPath();
      ctx.arc(point.x * width, point.y * height, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
