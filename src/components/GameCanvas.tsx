import { useEffect, useRef } from "react";
import type { PuzzleDefinition } from "../gameEngine/types";
import { renderPuzzle, type PuzzleRenderPhase } from "../game/rendering/puzzleRenderer";

export type GameCanvasProps = {
  puzzle: PuzzleDefinition;
  phase: PuzzleRenderPhase;
  revealFilledCount: number;
  /** Shown as HTML overlay during reveal (large tally). */
  displayTally: number;
  /** Optional scene offset in CSS pixels (after fit); use for motion later. */
  offsetX?: number;
  offsetY?: number;
  rotationRad?: number;
  className?: string;
};

export function GameCanvas({
  puzzle,
  phase,
  revealFilledCount,
  displayTally,
  offsetX = 0,
  offsetY = 0,
  rotationRad = 0,
  className = "",
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const paint = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = container.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      const wPx = Math.floor(w * dpr);
      const hPx = Math.floor(h * dpr);
      canvas.width = wPx;
      canvas.height = hPx;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      renderPuzzle(ctx, wPx, hPx, puzzle, {
        phase,
        revealFilledCount,
        offsetX,
        offsetY,
        rotationRad,
        devicePixelRatio: dpr,
      });
    };

    paint();
    const ro = new ResizeObserver(() => paint());
    ro.observe(container);
    return () => ro.disconnect();
  }, [puzzle, phase, revealFilledCount, offsetX, offsetY, rotationRad]);

  return (
    <div ref={containerRef} className={`relative h-full w-full min-h-[280px] ${className}`}>
      <canvas ref={canvasRef} className="block h-full w-full touch-none rounded-2xl border border-slate-200" />
      {phase === "round_reveal" ? (
        <div className="pointer-events-none absolute right-4 top-3 text-5xl font-black tabular-nums text-slate-900 drop-shadow-sm">
          {displayTally}
        </div>
      ) : null}
    </div>
  );
}
