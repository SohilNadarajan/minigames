import type { GameDifficulty } from "../gameEngine/types";

export type ColorGridConfig = {
  rows: number;
  cols: number;
  colorCount: number;
};

export type ColorGridBoard = {
  config: ColorGridConfig;
  palette: string[];
  cells: number[][];
};

export function flattenCells(cells: number[][]): number[] {
  return cells.flatMap((row) => row.map((v) => Math.max(0, Math.floor(v))));
}

export function inflateCells(flat: number[], rows: number, cols: number): number[][] {
  const out: number[][] = [];
  const safe = flat.map((v) => Math.max(0, Math.floor(v)));
  for (let r = 0; r < rows; r++) {
    const row: number[] = [];
    for (let c = 0; c < cols; c++) {
      row.push(safe[r * cols + c] ?? 0);
    }
    out.push(row);
  }
  return out;
}

const BASE_PALETTE = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#84cc16",
  "#14b8a6",
];

export function colorGridConfigForDifficulty(d: GameDifficulty): ColorGridConfig {
  if (d === "easy") return { rows: 5, cols: 9, colorCount: 6 };
  if (d === "medium") return { rows: 6, cols: 11, colorCount: 7 };
  return { rows: 7, cols: 13, colorCount: 8 };
}

export function generateColorGridBoard(config: ColorGridConfig): ColorGridBoard {
  const palette = BASE_PALETTE.slice(0, config.colorCount);
  const cells: number[][] = [];
  for (let r = 0; r < config.rows; r++) {
    const row: number[] = [];
    for (let c = 0; c < config.cols; c++) {
      row.push(Math.floor(Math.random() * config.colorCount));
    }
    cells.push(row);
  }
  return { config, palette, cells };
}

export function intersectionCount(board: ColorGridBoard): number {
  return (board.config.rows - 1) * (board.config.cols - 1);
}

export function randomIntersectionIndex(board: ColorGridBoard): number {
  return Math.floor(Math.random() * intersectionCount(board)) + 1;
}

export function intersectionToRowCol(board: ColorGridBoard, idx1: number): { row: number; col: number } {
  const max = intersectionCount(board);
  const n = Math.max(1, Math.min(max, Math.floor(idx1)));
  const i0 = n - 1;
  const row = Math.floor(i0 / (board.config.cols - 1));
  const col = i0 % (board.config.cols - 1);
  return { row, col };
}

export function getGoalTile(board: ColorGridBoard, idx1: number): number[][] {
  const { row, col } = intersectionToRowCol(board, idx1);
  return [
    [board.cells[row]![col]!, board.cells[row]![col + 1]!],
    [board.cells[row + 1]![col]!, board.cells[row + 1]![col + 1]!],
  ];
}
