import type { PuzzleDefinition } from "../../gameEngine/types";
import {
  DEFAULT_CUBE_COLORS,
  REVEAL_DIM_COLORS,
  REVEAL_HIGHLIGHT_COLORS,
  cubeTopCenterFromFoot,
  drawCube,
  drawIsoFloorGrid,
  isoCellCenter,
} from "./isometric";

export type PuzzleRenderPhase = "playing" | "round_reveal";

export type PuzzleRenderOptions = {
  phase: PuzzleRenderPhase;
  /** How many filled cubes (in row-major order of 1-cells) are highlighted during reveal. */
  revealFilledCount: number;
  /** Optional whole-scene offset (e.g. floating); pixels added after centering. */
  offsetX?: number;
  offsetY?: number;
  /** Optional whole-scene rotation in radians around content center. */
  rotationRad?: number;
  /** Canvas backing-store ratio; keeps strokes visible on retina after fixing bitmap size. */
  devicePixelRatio?: number;
};

type CubeCell = { r: number; c: number; z: number };

function cellHeightAt(puzzle: PuzzleDefinition, r: number, c: number): number {
  const raw = puzzle.grid[r]?.[c] ?? 0;
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.floor(raw));
}

export function cellsInOrder(puzzle: PuzzleDefinition): CubeCell[] {
  const out: CubeCell[] = [];
  const { rows, cols } = puzzle.gridSize;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const h = cellHeightAt(puzzle, r, c);
      for (let z = 0; z < h; z++) out.push({ r, c, z });
    }
  }
  return out;
}

/** Back-to-front: smaller (r+c) drawn first (underneath). */
export function sortedCubeCells(puzzle: PuzzleDefinition): CubeCell[] {
  const cells = cellsInOrder(puzzle);
  cells.sort((a, b) => {
    const sa = a.r + a.c;
    const sb = b.r + b.c;
    if (sa !== sb) return sa - sb;
    if (a.r !== b.r) return a.r - b.r;
    if (a.c !== b.c) return a.c - b.c;
    return a.z - b.z;
  });
  return cells;
}

type BBox = { minX: number; maxX: number; minY: number; maxY: number };

function cubeFootprintBBox(
  puzzle: PuzzleDefinition,
  tileW: number,
  tileH: number,
  cubeSize: number,
  depth: number
): BBox {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const qh = cubeSize * 0.25;
  const hw = cubeSize * 0.5;
  const stackLift = depth;

  for (const { r, c, z } of sortedCubeCells(puzzle)) {
    const foot = isoCellCenter(c, r, tileW, tileH);
    const top = cubeTopCenterFromFoot(foot.x, foot.y, tileW, tileH, cubeSize);
    const cx = top.x;
    const cy = top.y - z * stackLift;
    minX = Math.min(minX, cx - hw);
    maxX = Math.max(maxX, cx + hw);
    minY = Math.min(minY, cy - qh);
    maxY = Math.max(maxY, cy + qh + depth);
  }

  if (!Number.isFinite(minX)) {
    return { minX: -50, maxX: 50, minY: -50, maxY: 50 };
  }
  return { minX, maxX, minY, maxY };
}

function floorGridBBox(
  rows: number,
  cols: number,
  tileW: number,
  tileH: number
): BBox {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const { x, y } = isoCellCenter(c, r, tileW, tileH);
      const hw = tileW * 0.5;
      const qh = tileH * 0.5;
      minX = Math.min(minX, x - hw);
      maxX = Math.max(maxX, x + hw);
      minY = Math.min(minY, y - qh);
      maxY = Math.max(maxY, y + qh);
    }
  }
  return { minX, maxX, minY, maxY };
}

/**
 * Renders the puzzle: floor grid + cubes (isometric). Stateless: only reads puzzle + options.
 */
export function renderPuzzle(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  puzzle: PuzzleDefinition,
  options: PuzzleRenderOptions
): void {
  const { rows, cols } = puzzle.gridSize;
  const tileW = 64;
  const tileH = 32;
  const cubeSize = 56;
  const depth = cubeSize * 0.52;

  const order = cellsInOrder(puzzle);
  const highlight = new Set<string>();
  for (let i = 0; i < Math.min(options.revealFilledCount, order.length); i++) {
    const { r, c, z } = order[i]!;
    highlight.add(`${r},${c},${z}`);
  }

  const cubeBox = cubeFootprintBBox(puzzle, tileW, tileH, cubeSize, depth);
  const gridBox = floorGridBBox(rows, cols, tileW, tileH);
  const pad = 10;
  const minX = Math.min(cubeBox.minX, gridBox.minX) - pad;
  const maxX = Math.max(cubeBox.maxX, gridBox.maxX) + pad;
  const minY = Math.min(cubeBox.minY, gridBox.minY) - pad;
  const maxY = Math.max(cubeBox.maxY, gridBox.maxY) + pad;

  const contentW = maxX - minX;
  const contentH = maxY - minY;
  const rotation = options.rotationRad ?? 0;
  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);
  const rotatedW = Math.abs(contentW * cosR) + Math.abs(contentH * sinR);
  const rotatedH = Math.abs(contentW * sinR) + Math.abs(contentH * cosR);
  const dpr = Math.max(1, options.devicePixelRatio ?? 1);
  const strokeW = Math.max(1, dpr);
  /** Fits scene in view; ~70% of prior fill so the board doesn’t dominate the host screen. */
  const scale = Math.min(width / rotatedW, height / rotatedH) * 0.98 * 0.7;
  const tx = width / 2 + (options.offsetX ?? 0) * dpr;
  const ty = height / 2 + (options.offsetY ?? 0) * dpr;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const a = scale * cosR;
  const b = scale * sinR;
  const c = -scale * sinR;
  const d = scale * cosR;
  const e = tx - a * centerX - c * centerY;
  const f = ty - b * centerX - d * centerY;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#f4f4f5";
  ctx.fillRect(0, 0, width, height);

  ctx.setTransform(a, b, c, d, e, f);

  drawIsoFloorGrid(ctx, rows, cols, tileW, tileH, 0, 0, undefined, strokeW);

  const cells = sortedCubeCells(puzzle);
  const stackLift = depth;
  for (const { r, c, z } of cells) {
    const foot = isoCellCenter(c, r, tileW, tileH);
    const top = cubeTopCenterFromFoot(foot.x, foot.y, tileW, tileH, cubeSize);
    const cx = top.x;
    const cy = top.y - z * stackLift;

    let colors = DEFAULT_CUBE_COLORS;
    if (options.phase === "round_reveal") {
      colors = highlight.has(`${r},${c},${z}`) ? REVEAL_HIGHLIGHT_COLORS : REVEAL_DIM_COLORS;
    }

    drawCube(ctx, cx, cy, cubeSize, depth, colors, strokeW);
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
