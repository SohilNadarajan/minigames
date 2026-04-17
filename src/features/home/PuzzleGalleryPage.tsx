import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getPuzzleDataset, type Difficulty, type PuzzleDefinition } from "../../gameEngine";
import { renderPuzzle } from "../../game/rendering/puzzleRenderer";

type PuzzleCardData = {
  puzzle: PuzzleDefinition;
  blockCount: number;
  label: string;
};

function countBlocks(grid: number[][]): number {
  let n = 0;
  for (const row of grid) for (const cell of row) n += Math.max(0, Math.floor(cell));
  return n;
}

function labelForDifficulty(difficulty: Difficulty): string {
  if (difficulty === "medium") return "med";
  return difficulty;
}

function buildGalleryCards(puzzles: PuzzleDefinition[]): PuzzleCardData[] {
  const counters: Record<Difficulty, number> = {
    easy: 0,
    medium: 0,
    hard: 0,
  };

  return puzzles.map((p) => {
    counters[p.difficulty] += 1;
    const idx = counters[p.difficulty];
    return {
      puzzle: p,
      blockCount: countBlocks(p.grid),
      label: `${labelForDifficulty(p.difficulty)}-${idx}`,
    };
  });
}

const TRANSLATE_SIM_MS = 3600;
const ROTATE_SIM_MS = 2400;

function MiniPuzzleCanvas({
  puzzle,
  translateRunKey,
  rotateRunKey,
}: {
  puzzle: PuzzleDefinition;
  translateRunKey: number;
  rotateRunKey: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const resetTimerRef = useRef<number | null>(null);

  const paintAt = (offsetX = 0, offsetY = 0, rotationRad = 0) => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

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

    renderPuzzle(ctx, wPx, hPx, puzzle, {
      phase: "playing",
      revealFilledCount: 0,
      offsetX,
      offsetY,
      rotationRad,
      devicePixelRatio: dpr,
    });
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    paintAt(0, 0, 0);
    const ro = new ResizeObserver(() => paintAt(0, 0, 0));
    ro.observe(container);
    return () => {
      ro.disconnect();
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
      if (resetTimerRef.current != null) window.clearTimeout(resetTimerRef.current);
    };
  }, [puzzle]);

  useEffect(() => {
    if (translateRunKey === 0) return;
    const container = containerRef.current;
    if (!container) return;
    if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    if (resetTimerRef.current != null) window.clearTimeout(resetTimerRef.current);

    const rect = container.getBoundingClientRect();
    const travel = Math.max(rect.width, rect.height) * 1.7;
    const axis =
      Math.random() < 0.5
        ? { x: 0.8944, y: 0.4472 } // +col axis in isometric plane
        : { x: -0.8944, y: 0.4472 }; // +row axis in isometric plane
    const sign = Math.random() < 0.5 ? -1 : 1;
    const vec = { x: axis.x * sign, y: axis.y * sign };

    let startTs = 0;
    const step = (ts: number) => {
      if (!startTs) startTs = ts;
      const elapsed = ts - startTs;
      const t = Math.min(1, elapsed / TRANSLATE_SIM_MS);
      const dist = -travel + travel * 2 * t;
      paintAt(vec.x * dist, vec.y * dist);
      if (t < 1) {
        frameRef.current = requestAnimationFrame(step);
      } else {
        // Snap back shortly after the pass so the card remains inspectable.
        resetTimerRef.current = window.setTimeout(() => paintAt(0, 0, 0), 350);
      }
    };

    frameRef.current = requestAnimationFrame(step);
  }, [translateRunKey, puzzle]);

  useEffect(() => {
    if (rotateRunKey === 0) return;
    if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    if (resetTimerRef.current != null) window.clearTimeout(resetTimerRef.current);

    let startTs = 0;
    const step = (ts: number) => {
      if (!startTs) startTs = ts;
      const elapsed = ts - startTs;
      const t = Math.min(1, elapsed / ROTATE_SIM_MS);
      paintAt(0, 0, Math.PI * 2 * t);
      if (t < 1) {
        frameRef.current = requestAnimationFrame(step);
      } else {
        resetTimerRef.current = window.setTimeout(() => paintAt(0, 0, 0), 250);
      }
    };

    frameRef.current = requestAnimationFrame(step);
  }, [rotateRunKey, puzzle]);

  return (
    <div ref={containerRef} className="h-36 w-full">
      <canvas
        ref={canvasRef}
        className="block h-full w-full rounded-xl border border-slate-200 bg-zinc-100"
      />
    </div>
  );
}

export function PuzzleGalleryPage() {
  const dataset = getPuzzleDataset();
  const cards = useMemo(() => buildGalleryCards(dataset.puzzles), [dataset.puzzles]);
  const [translateRuns, setTranslateRuns] = useState<Record<string, number>>({});
  const [rotateRuns, setRotateRuns] = useState<Record<string, number>>({});

  const triggerTranslateRun = (id: string) => {
    setTranslateRuns((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
  };
  const triggerRotateRun = (id: string) => {
    setRotateRuns((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
  };

  return (
    <div className="mx-auto min-h-full w-full max-w-7xl px-4 py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Temporary Tool</p>
          <h1 className="text-3xl font-black text-slate-900">Puzzle Gallery</h1>
          <p className="mt-1 text-sm text-slate-600">
            Inspect all puzzles quickly before editing the dataset.
          </p>
        </div>
        <Link
          to="/"
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm"
        >
          Back Home
        </Link>
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        Total puzzles: <span className="font-bold">{cards.length}</span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {cards.map(({ puzzle, blockCount, label }) => (
          <article
            key={puzzle.id}
            className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-black uppercase tracking-wide text-slate-800">{label}</p>
              <p className="text-xs font-semibold text-slate-500">id: {puzzle.id}</p>
            </div>

            <MiniPuzzleCanvas
              puzzle={puzzle}
              translateRunKey={translateRuns[puzzle.id] ?? 0}
              rotateRunKey={rotateRuns[puzzle.id] ?? 0}
            />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => triggerTranslateRun(puzzle.id)}
                className="rounded-xl border border-blue-200 bg-blue-50 px-2 py-2 text-xs font-bold uppercase tracking-wide text-blue-800 hover:bg-blue-100"
              >
                Translate
              </button>
              <button
                type="button"
                onClick={() => triggerRotateRun(puzzle.id)}
                className="rounded-xl border border-violet-200 bg-violet-50 px-2 py-2 text-xs font-bold uppercase tracking-wide text-violet-800 hover:bg-violet-100"
              >
                Rotate 360
              </button>
            </div>

            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="font-semibold text-slate-600">Blocks</span>
              <span className="text-lg font-black tabular-nums text-slate-900">{blockCount}</span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
